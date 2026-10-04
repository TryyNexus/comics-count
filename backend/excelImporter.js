const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { db } = require('./db');

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

function findOneDriveExcelPath() {
  const userProfile = process.env.USERPROFILE || 'C:\\Users\\damia';
  // Check common OneDrive folder names
  const candidates = [
    path.join(userProfile, 'OneDrive - Università di Napoli Federico II', 'Fumetti.xlsx'),
    path.join(userProfile, 'OneDrive', 'Fumetti.xlsx'),
    path.join(userProfile, 'OneDrive - Personal', 'Fumetti.xlsx'),
    path.join('C:\\Users\\damia\\OneDrive - Università di Napoli Federico II\\Fumetti.xlsx')
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }

  // Scan directory for Fumetti.xlsx
  try {
    const files = fs.readdirSync(userProfile);
    for (const f of files) {
      if (f.toLowerCase().startsWith('onedrive')) {
        const full = path.join(userProfile, f, 'Fumetti.xlsx');
        if (fs.existsSync(full)) return full;
      }
    }
  } catch (e) {}

  return null;
}

function excelDateToString(val) {
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    // Excel date serial
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date.toISOString().split('T')[0];
  }
  if (typeof val === 'string') {
    return val.trim();
  }
  return null;
}

function normalizeStatus(val, defaultStatus = 'Acquistato') {
  if (!val) return defaultStatus;
  const str = String(val).trim().toLowerCase();
  if (str.includes('da leggere')) return 'Da leggere';
  if (str === 'letto' || str.includes('letto')) return 'Letto';
  if (str.includes('in lettura')) return 'In lettura';
  if (str.includes('vendut')) return 'Venduto';
  if (str.includes('in uscita')) return 'In uscita';
  if (str.includes('preordinat')) return 'Preordinato';
  return defaultStatus;
}

function extractVariantAndIssue(title) {
  let cleanTitle = title.trim();
  let variant = '';
  let issue = '';

  // Extract variant hints
  const varMatch = cleanTitle.match(/(cvr\s+[a-z0-9]+|variant\b.*|var\b.*|blank.*|blind bag.*|foil.*|firmato.*|firmacopie.*|discovery\b.*)/i);
  if (varMatch) {
    variant = varMatch[0].trim();
    cleanTitle = cleanTitle.replace(varMatch[0], '').trim();
  }

  // Extract issue number at end or before variant
  const numMatch = cleanTitle.match(/(?:#|vol\.?\s*|volume\s*|n\.?\s*)?(\d+(?:[-+]\d+)*)\s*$/i);
  if (numMatch) {
    issue = numMatch[1];
  }

  return { cleanTitle: cleanTitle.replace(/[#,-]+$/, '').trim(), issue, variant };
}

function importExcel(filePath) {
  const targetPath = filePath || findOneDriveExcelPath();
  if (!targetPath || !fs.existsSync(targetPath)) {
    throw new Error(`File Excel non trovato al percorso: ${targetPath}`);
  }

  const wb = XLSX.readFile(targetPath, { cellFormula: true, cellNF: true });
  const pubMap = {};
  const pubs = db.prepare('SELECT id, name FROM publishers').all();
  pubs.forEach(p => { pubMap[p.name.toLowerCase()] = p.id; });

  const getPublisherId = (name) => {
    const key = name.toLowerCase();
    if (pubMap[key]) return pubMap[key];
    // Check partial
    for (const [pName, id] of Object.entries(pubMap)) {
      if (key.includes(pName) || pName.includes(key)) return id;
    }
    // Create new publisher
    const res = db.prepare('INSERT INTO publishers (name, color) VALUES (?, ?)').run(name, '#6366f1');
    pubMap[key] = res.lastInsertRowid;
    return res.lastInsertRowid;
  };

  const insertComic = db.prepare(`
    INSERT INTO comics (
      title, series, issue_number, variant_info, publisher_id, year, month,
      release_date, purchase_date, cover_price, purchase_price, status, channel, notes
    ) VALUES (
      @title, @series, @issue_number, @variant_info, @publisher_id, @year, @month,
      @release_date, @purchase_date, @cover_price, @purchase_price, @status, @channel, @notes
    )
  `);

  const insertSale = db.prepare(`
    INSERT INTO sales_refunds (year, month, title, price, channel, notes)
    VALUES (@year, @month, @title, @price, @channel, @notes)
  `);

  const insertOrder = db.prepare(`
    INSERT INTO orders (store_name, title, items_count, total_price, year, month, status, notes)
    VALUES (@store_name, @title, @items_count, @total_price, @year, @month, @status, @notes)
  `);

  const insertReading = db.prepare(`
    INSERT INTO readings (title, year, month, category, notes)
    VALUES (@title, @year, @month, @category, @notes)
  `);

  const results = {
    comicsImported: 0,
    salesImported: 0,
    ordersImported: 0,
    readingsImported: 0,
    hvcImported: 0,
    sheetsProcessed: []
  };

  const importTx = db.transaction(() => {
    // Clear previous records for clean idempotent sync
    db.exec('DELETE FROM comics; DELETE FROM sales_refunds; DELETE FROM orders; DELETE FROM readings;');

    // Dynamic scan for any HVC sheets by year: HVC2026, HVC2027, HVC2028, etc.
    const hvcItemsByYearAndMonth = {};
    const hvcSheetRegex = /^HVC\s*(\d{4})$/i;

    for (const sheetName of wb.SheetNames) {
      const match = sheetName.trim().match(hvcSheetRegex);
      if (match) {
        const hvcYear = match[1];
        if (!hvcItemsByYearAndMonth[hvcYear]) hvcItemsByYearAndMonth[hvcYear] = {};

        const wsHVC = wb.Sheets[sheetName];
        if (!wsHVC || !wsHVC['!ref']) continue;
        const rangeHVC = XLSX.utils.decode_range(wsHVC['!ref']);
        let hvcMonth = null;

        for (let R = 1; R <= rangeHVC.e.r; ++R) {
          const valA = wsHVC[XLSX.utils.encode_cell({r: R, c: 0})] ? wsHVC[XLSX.utils.encode_cell({r: R, c: 0})].v : null;
          if (valA && typeof valA === 'string') {
            const lower = valA.trim().toLowerCase();
            const found = MONTH_NAMES.find(m => lower.startsWith(m.toLowerCase()));
            if (found) hvcMonth = found;
          }

          if (!hvcMonth) continue;
          if (!hvcItemsByYearAndMonth[hvcYear][hvcMonth]) hvcItemsByYearAndMonth[hvcYear][hvcMonth] = [];

          const hvcCols = [
            { pub: 'DC', c: 1 },
            { pub: 'Marvel', c: 2 },
            { pub: 'Altro', c: 3 }
          ];

          for (const col of hvcCols) {
            const cell = wsHVC[XLSX.utils.encode_cell({r: R, c: col.c})];
            if (cell && typeof cell.v === 'string' && cell.v.trim().length > 2) {
              hvcItemsByYearAndMonth[hvcYear][hvcMonth].push({
                title: cell.v.trim(),
                publisher: col.pub
              });
            }
          }
        }
      }
    }

    const hvcMonthsExpanded = new Set();

    // 1. Process all detected yearly sheets (e.g. 2023, 2024, 2025, 2026, 2027, 2028...)
    const detectedYearSheets = wb.SheetNames
      .filter(name => /^\d{4}$/.test(name.trim()))
      .sort();

    detectedYearSheets.forEach(year => {
      const ws = wb.Sheets[year];
      if (!ws) return;
      results.sheetsProcessed.push(year);

      const range = XLSX.utils.decode_range(ws['!ref']);

      // Setup column coordinates per year format
      let colDC = { title: 1, statusOrDate: 2, price: 3 };
      let colMarvel = { title: 4, statusOrDate: 5, price: 6 };
      let colOrdini = { title: 7, statusOrDate: 8, price: 9 };
      let colManga = { title: 10, statusOrDate: 11, price: 12 };
      let colEventi = { name: 13, item: 15, price: 17 };

      if (year === '2024' || year === '2025') {
        colDC = { title: 1, statusOrDate: 2, price: 3 };
        colMarvel = { title: 4, statusOrDate: 5, price: 6 };
        colOrdini = { title: 7, statusOrDate: null, price: 8 };
        colManga = { title: 9, statusOrDate: 10, price: 11 };
        colEventi = { name: 12, item: 14, price: 16 };
      } else if (year === '2023') {
        colDC = { title: 1, statusOrDate: 3, price: 4 };
        colMarvel = { title: 5, statusOrDate: 6, price: 7 };
        colOrdini = { title: 8, statusOrDate: null, price: 9 };
        colManga = { title: 10, statusOrDate: 11, price: 12 };
        colEventi = { name: 14, item: 15, price: 17 };
      }

      let currentMonth = null;

      for (let R = 1; R <= range.e.r; ++R) {
        const getVal = (C) => {
          if (C === null || C === undefined) return null;
          const cell = ws[XLSX.utils.encode_cell({r: R, c: C})];
          return cell ? cell.v : null;
        };

        const valA = getVal(0);
        if (valA && typeof valA === 'string') {
          const lower = valA.trim().toLowerCase();
          const foundMonth = MONTH_NAMES.find(m => lower.startsWith(m.toLowerCase()));
          if (foundMonth) {
            currentMonth = foundMonth;
          }
        }

        // Sales / Refunds section check at bottom (rows 65+)
        if (R >= 65) {
          const titleCol = getVal(7) || getVal(8);
          const priceCol = getVal(8) || getVal(9) || getVal(10);
          if (titleCol && typeof titleCol === 'string' && typeof priceCol === 'number') {
            const lowerTitle = titleCol.trim().toLowerCase();
            if (!lowerTitle.includes('spesa annua') && !lowerTitle.includes('refound') && !lowerTitle.includes('ordine mirage')) {
              insertSale.run({
                year,
                month: currentMonth || 'Annuale',
                title: titleCol.trim(),
                price: priceCol,
                channel: 'Vinted / Usato',
                notes: 'Importato da sezione Vendite/Rimborsi'
              });
              results.salesImported++;
              continue;
            }
          }
        }

        if (!currentMonth) continue;

        // Process Category / Publisher Columns
        const categories = [
          { pub: 'DC', cols: colDC, chan: 'Fumetteria' },
          { pub: 'Marvel', cols: colMarvel, chan: 'Fumetteria' },
          { pub: 'Manga', cols: colManga, chan: 'Fumetteria' },
          { pub: 'Ordini / Usato', cols: colOrdini, chan: 'Vinted / Usato' }
        ];

        for (const cat of categories) {
          const rawTitle = getVal(cat.cols.title);
          if (rawTitle && typeof rawTitle === 'string' && rawTitle.trim().length > 1) {
            const rawStatusOrDate = cat.cols.statusOrDate !== null ? getVal(cat.cols.statusOrDate) : null;
            const rawPrice = getVal(cat.cols.price);

            const numPrice = typeof rawPrice === 'number' ? rawPrice : 0;
            let status = 'Acquistato';
            let releaseDate = null;

            if (typeof rawStatusOrDate === 'number' && rawStatusOrDate > 30000) {
              releaseDate = excelDateToString(rawStatusOrDate);
            } else if (rawStatusOrDate) {
              status = normalizeStatus(rawStatusOrDate);
            }

            const { cleanTitle, issue, variant } = extractVariantAndIssue(rawTitle);
            const lowerRaw = rawTitle.toLowerCase().trim();

            // REQUIREMENT: Transform monthly HVC into individual comics from corresponding HVC<YYYY> sheet
            const isHvcEntry = lowerRaw.startsWith('hvc') || lowerRaw.includes('hovistocose');
            if (isHvcEntry) {
              // 1. Record the order total for accounting
              insertComic.run({
                title: `HVC Ordine Totale (${currentMonth})`,
                series: 'HVC Totale Ordine',
                issue_number: null,
                variant_info: null,
                publisher_id: getPublisherId('Ordini / Usato'),
                year,
                month: currentMonth,
                release_date: null,
                purchase_date: null,
                cover_price: numPrice,
                purchase_price: numPrice,
                status: 'Preordinato',
                channel: 'HVC / Preordine',
                notes: `Contabilizzazione ordine HVC ${currentMonth} ${year}`
              });
              results.comicsImported++;

              // 2. Expand all individual comics for this year and month from the corresponding HVC sheet
              const monthKey = `${year}_${currentMonth}`;
              if (!hvcMonthsExpanded.has(monthKey) && hvcItemsByYearAndMonth[year] && hvcItemsByYearAndMonth[year][currentMonth]) {
                hvcMonthsExpanded.add(monthKey);
                for (const hItem of hvcItemsByYearAndMonth[year][currentMonth]) {
                  const hExt = extractVariantAndIssue(hItem.title);
                  const hPubId = getPublisherId(hItem.publisher);
                  insertComic.run({
                    title: hItem.title,
                    series: hExt.cleanTitle,
                    issue_number: hExt.issue || null,
                    variant_info: hExt.variant || null,
                    publisher_id: hPubId,
                    year,
                    month: currentMonth,
                    release_date: null,
                    purchase_date: null,
                    cover_price: 0,
                    purchase_price: 0,
                    status: 'Preordinato',
                    channel: 'HVC / Preordine',
                    notes: `Singolo preordine da HoVistoCose ${currentMonth} ${year}`
                  });
                  results.hvcImported++;
                  results.comicsImported++;
                }
              }
              continue;
            }

            const pubId = getPublisherId(cat.pub);

            insertComic.run({
              title: cleanTitle || rawTitle.trim(),
              series: cleanTitle,
              issue_number: issue || null,
              variant_info: variant || null,
              publisher_id: pubId,
              year,
              month: currentMonth,
              release_date: releaseDate,
              purchase_date: null,
              cover_price: numPrice,
              purchase_price: numPrice,
              status,
              channel: cat.chan,
              notes: rawTitle !== cleanTitle ? `Titolo originale: ${rawTitle}` : null
            });
            results.comicsImported++;
          }
        }

        // Process Eventi / Fiere items
        const rawEventItem = getVal(colEventi.item);
        if (rawEventItem && typeof rawEventItem === 'string' && rawEventItem.trim().length > 1) {
          const eventName = getVal(colEventi.name) || 'Comicon / Fiera';
          const eventPrice = getVal(colEventi.price);
          const numPrice = typeof eventPrice === 'number' ? eventPrice : 0;

          const pubId = getPublisherId('Eventi / Fiere');
          const { cleanTitle, issue, variant } = extractVariantAndIssue(rawEventItem);

          insertComic.run({
            title: cleanTitle || rawEventItem.trim(),
            series: cleanTitle,
            issue_number: issue || null,
            variant_info: variant || null,
            publisher_id: pubId,
            year,
            month: currentMonth,
            release_date: null,
            purchase_date: null,
            cover_price: numPrice,
            purchase_price: numPrice,
            status: 'Acquistato',
            channel: 'Fiera / Evento',
            notes: `Evento: ${eventName}`
          });
          results.comicsImported++;
        }
      }
    });

    // 2. Process all detected HVC sheets (Pre-orders from HoVistoCose by year)
    for (const sheetName of wb.SheetNames) {
      const match = sheetName.trim().match(hvcSheetRegex);
      if (match) {
        const hvcYear = match[1];
        results.sheetsProcessed.push(sheetName);
        const ws = wb.Sheets[sheetName];
        if (!ws || !ws['!ref']) continue;
        const range = XLSX.utils.decode_range(ws['!ref']);
        let currentMonth = null;

        for (let R = 1; R <= range.e.r; ++R) {
          const getVal = (C) => {
            const cell = ws[XLSX.utils.encode_cell({r: R, c: C})];
            return cell ? cell.v : null;
          };

          const valA = getVal(0);
          if (valA && typeof valA === 'string') {
            const lower = valA.trim().toLowerCase();
            const foundMonth = MONTH_NAMES.find(m => lower.startsWith(m.toLowerCase()));
            if (foundMonth) currentMonth = foundMonth;
          }

          if (!currentMonth) continue;
          if (hvcMonthsExpanded.has(`${hvcYear}_${currentMonth}`)) continue;

          const hvcCols = [
            { pub: 'DC', c: 1 },
            { pub: 'Marvel', c: 2 },
            { pub: 'Altro', c: 3 }
          ];

          for (const col of hvcCols) {
            const title = getVal(col.c);
            if (title && typeof title === 'string' && title.trim().length > 2) {
              const { cleanTitle, issue, variant } = extractVariantAndIssue(title);
              const pubId = getPublisherId(col.pub);

              insertComic.run({
                title: cleanTitle || title.trim(),
                series: cleanTitle,
                issue_number: issue || null,
                variant_info: variant || null,
                publisher_id: pubId,
                year: hvcYear,
                month: currentMonth,
                release_date: null,
                purchase_date: null,
                cover_price: 0,
                purchase_price: 0,
                status: 'Preordinato',
                channel: 'HVC / Preordine',
                notes: `HVC Preordine originale ${hvcYear}: ${title.trim()}`
              });
              results.hvcImported++;
              results.comicsImported++;
            }
          }
        }
      }
    }

    // 3. Process Letture sheets (Letture 2026, Letture 2027)
    ['Letture 2026', 'Letture 2027'].forEach(sheetName => {
      if (!wb.Sheets[sheetName]) return;
      results.sheetsProcessed.push(sheetName);
      const ws = wb.Sheets[sheetName];
      const range = XLSX.utils.decode_range(ws['!ref']);
      const year = sheetName.replace('Letture', '').trim();
      let currentMonth = null;

      for (let R = 1; R <= range.e.r; ++R) {
        const getVal = (C) => {
          const cell = ws[XLSX.utils.encode_cell({r: R, c: C})];
          return cell ? cell.v : null;
        };

        const valA = getVal(0);
        if (valA && typeof valA === 'string') {
          const lower = valA.trim().toLowerCase();
          const foundMonth = MONTH_NAMES.find(m => lower.startsWith(m.toLowerCase()));
          if (foundMonth) currentMonth = foundMonth;
        }

        if (!currentMonth) continue;

        // Categories: DC (1), Marvel (2), Altro (3), Manga (4)
        const cats = [
          { name: 'DC', c: 1 },
          { name: 'Marvel', c: 2 },
          { name: 'Altro', c: 3 },
          { name: 'Manga', c: 4 }
        ];

        for (const cat of cats) {
          const readTitle = getVal(cat.c);
          if (readTitle && typeof readTitle === 'string' && readTitle.trim().length > 1) {
            insertReading.run({
              title: readTitle.trim(),
              year,
              month: currentMonth,
              category: cat.name,
              notes: null
            });
            results.readingsImported++;
          }
        }
      }
    });

    // 4. Process Ordini sheet
    if (wb.Sheets['Ordini']) {
      results.sheetsProcessed.push('Ordini');
      const ws = wb.Sheets['Ordini'];
      const range = XLSX.utils.decode_range(ws['!ref']);

      // Walk through sections in Ordini
      for (let R = 0; R <= range.e.r; ++R) {
        for (let C = 0; C <= range.e.c; ++C) {
          const cell = ws[XLSX.utils.encode_cell({r: R, c: C})];
          if (cell && typeof cell.v === 'string' && (cell.v.includes('Libraccio') || cell.v.includes('My Comics') || cell.v.includes('MangaYo') || cell.v.includes('Amazon') || cell.v.includes('Feltrinelli'))) {
            const storeName = cell.v.trim();
            // Look for sub-items in rows below until next empty or store header
            for (let subR = R + 1; subR < R + 8 && subR <= range.e.r; ++subR) {
              const itemCell = ws[XLSX.utils.encode_cell({r: subR, c: C})];
              const priceCell = ws[XLSX.utils.encode_cell({r: subR, c: C + 1})];
              if (itemCell && typeof itemCell.v === 'string' && itemCell.v.trim().length > 1) {
                const price = typeof (priceCell ? priceCell.v : null) === 'number' ? priceCell.v : 0;
                insertOrder.run({
                  store_name: storeName,
                  title: itemCell.v.trim(),
                  items_count: 1,
                  total_price: price,
                  year: '2024',
                  month: 'Ordini',
                  status: 'Completato',
                  notes: `Sezione ${storeName}`
                });
                results.ordersImported++;
              }
            }
          }
        }
      }
    }
  });

  importTx();
  return results;
}

module.exports = { importExcel, findOneDriveExcelPath };
