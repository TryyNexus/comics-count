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
  return defaultStatus;
}

function importExcel(customPath = null, userId = 1) {
  const filePath = customPath || findOneDriveExcelPath();
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`File Excel non trovato: ${filePath || 'nessun percorso disponibile'}`);
  }

  const wb = XLSX.readFile(filePath, { cellDates: false });
  const publishers = db.prepare('SELECT id, name FROM publishers').all();
  const pubMap = new Map();
  publishers.forEach(p => {
    pubMap.set(p.name.toLowerCase(), p.id);
  });

  const getPublisherId = (name) => {
    if (!name) return null;
    const clean = String(name).trim();
    if (!clean) return null;
    const key = clean.toLowerCase();

    if (pubMap.has(key)) return pubMap.get(key);
    for (const [k, id] of pubMap.entries()) {
      if (key.includes(k) || k.includes(key)) return id;
    }

    try {
      const res = db.prepare('INSERT INTO publishers (name, color) VALUES (?, ?)').run(clean, '#6366f1');
      pubMap.set(key, res.lastInsertRowid);
      return res.lastInsertRowid;
    } catch {
      const existing = db.prepare('SELECT id FROM publishers WHERE name = ?').get(clean);
      if (existing) {
        pubMap.set(key, existing.id);
        return existing.id;
      }
    }
    return null;
  };

  const insertComic = db.prepare(`
    INSERT INTO comics (
      user_id, title, series, issue_number, variant_info, publisher_id, year, month,
      release_date, purchase_date, cover_price, purchase_price, status, channel, notes
    ) VALUES (
      @user_id, @title, @series, @issue_number, @variant_info, @publisher_id, @year, @month,
      @release_date, @purchase_date, @cover_price, @purchase_price, @status, @channel, @notes
    )
  `);

  const insertSale = db.prepare(`
    INSERT INTO sales_refunds (user_id, year, month, title, price, channel, notes)
    VALUES (@user_id, @year, @month, @title, @price, @channel, @notes)
  `);

  const insertOrder = db.prepare(`
    INSERT INTO orders (user_id, store_name, title, items_count, total_price, year, month, status, notes)
    VALUES (@user_id, @store_name, @title, @items_count, @total_price, @year, @month, @status, @notes)
  `);

  const insertReading = db.prepare(`
    INSERT INTO readings (user_id, title, year, month, category, notes)
    VALUES (@user_id, @title, @year, @month, @category, @notes)
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
    // Clear user's previous records for clean idempotent sync
    db.prepare('DELETE FROM comics WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM sales_refunds WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM orders WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM readings WHERE user_id = ?').run(userId);

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

        for (let R = 1; R <= rangeHVC.e.r; ++R) {
          const getVal = (col) => {
            const cell = wsHVC[XLSX.utils.encode_cell({ r: R, c: col })];
            return cell ? (cell.w ? cell.w.trim() : (cell.v !== undefined ? String(cell.v).trim() : '')) : '';
          };

          const rawData = getVal(0);
          const rawMese = getVal(1);
          const rawAnno = getVal(2) || hvcYear;
          const rawEditore = getVal(3);
          const rawTitolo = getVal(4);
          const rawSpesa = getVal(5);
          const rawStato = getVal(6);
          const rawNote = getVal(7);

          if (!rawTitolo && !rawEditore && !rawSpesa) continue;

          let targetM = rawMese;
          if (!targetM) {
            for (const m of MONTH_NAMES) {
              if (rawData.toLowerCase().includes(m.toLowerCase()) || rawNote.toLowerCase().includes(m.toLowerCase())) {
                targetM = m;
                break;
              }
            }
          }
          if (!targetM) targetM = 'Gennaio';

          const mNorm = MONTH_NAMES.find(m => m.toLowerCase() === targetM.toLowerCase()) || targetM;
          if (!hvcItemsByYearAndMonth[hvcYear][mNorm]) {
            hvcItemsByYearAndMonth[hvcYear][mNorm] = [];
          }

          let priceNum = 0;
          if (rawSpesa) {
            const cleanPrice = String(rawSpesa).replace('€', '').replace(',', '.').trim();
            priceNum = parseFloat(cleanPrice) || 0;
          }

          hvcItemsByYearAndMonth[hvcYear][mNorm].push({
            date: rawData,
            year: rawAnno,
            month: mNorm,
            publisher: rawEditore || 'Altro',
            title: rawTitolo || 'Fumetto HVC',
            price: priceNum,
            status: rawStato || 'Ordinato',
            notes: rawNote ? `HVC Preordine: ${rawNote}` : 'HVC Preordine'
          });
        }
      }
    }

    const yearRegex = /^(20\d{2})$/;

    for (const sheetName of wb.SheetNames) {
      const trimmedSheet = sheetName.trim();
      const match = trimmedSheet.match(yearRegex);
      if (!match) continue;

      const year = match[1];
      const ws = wb.Sheets[sheetName];
      if (!ws || !ws['!ref']) continue;

      results.sheetsProcessed.push(trimmedSheet);
      const range = XLSX.utils.decode_range(ws['!ref']);

      let currentMonth = null;
      let inVendite = false;
      let inOrdini = false;
      let inLetture = false;

      for (let R = 0; R <= range.e.r; ++R) {
        const getCell = (colIdx) => {
          const addr = XLSX.utils.encode_cell({ r: R, c: colIdx });
          return ws[addr];
        };

        const getVal = (colIdx) => {
          const cell = getCell(colIdx);
          if (!cell) return null;
          if (cell.w !== undefined) return cell.w.trim();
          if (cell.v !== undefined) return String(cell.v).trim();
          return null;
        };

        const colA = getVal(0);
        const colB = getVal(1);
        const colC = getVal(2);
        const colD = getVal(3);
        const colE = getVal(4);
        const colF = getVal(5);

        if (colA) {
          const normA = colA.toLowerCase();
          const foundMonth = MONTH_NAMES.find(m => normA.includes(m.toLowerCase()));
          if (foundMonth && (normA.length < 25 || normA.includes('acquisti') || normA.includes('mensile'))) {
            currentMonth = foundMonth;
            inVendite = false;
            inOrdini = false;
            inLetture = false;
            continue;
          }

          if (normA.includes('vendit') || normA.includes('rimbors') || normA.includes('entrate')) {
            inVendite = true;
            inOrdini = false;
            inLetture = false;
            continue;
          }
          if (normA.includes('ordin') && !normA.includes('fumett')) {
            inOrdini = true;
            inVendite = false;
            inLetture = false;
            continue;
          }
          if (normA.includes('lettur') || normA.includes('letti nel')) {
            inLetture = true;
            inVendite = false;
            inOrdini = false;
            continue;
          }
        }

        if (inVendite) {
          if (colA && (colA.toLowerCase().includes('titolo') || colA.toLowerCase().includes('data'))) continue;
          if (colB || colA) {
            const title = colB || colA;
            const priceVal = colC || colD || colE;
            let priceNum = 0;
            if (priceVal) {
              const clean = String(priceVal).replace('€', '').replace(',', '.').trim();
              priceNum = parseFloat(clean) || 0;
            }
            if (title && priceNum > 0 && !title.toLowerCase().includes('totale')) {
              insertSale.run({
                user_id: userId,
                year,
                month: currentMonth || 'Gennaio',
                title,
                price: priceNum,
                channel: 'Vinted',
                notes: 'Importato da Excel'
              });
              results.salesImported++;
            }
          }
          continue;
        }

        if (inOrdini) {
          if (colA && colA.toLowerCase().includes('negozio')) continue;
          if (colA || colB) {
            const store = colA || 'Negozio Online';
            const title = colB || store;
            const priceVal = colD || colC || colE;
            let priceNum = 0;
            if (priceVal) {
              const clean = String(priceVal).replace('€', '').replace(',', '.').trim();
              priceNum = parseFloat(clean) || 0;
            }
            if (title && priceNum > 0 && !title.toLowerCase().includes('totale')) {
              insertOrder.run({
                user_id: userId,
                store_name: store,
                title,
                items_count: 1,
                total_price: priceNum,
                year,
                month: currentMonth || 'Gennaio',
                status: 'Completato',
                notes: 'Importato da Excel'
              });
              results.ordersImported++;
            }
          }
          continue;
        }

        if (inLetture) {
          if (colA && colA.toLowerCase().includes('titolo')) continue;
          if (colA || colB) {
            const title = colA || colB;
            if (title && !title.toLowerCase().includes('totale')) {
              insertReading.run({
                user_id: userId,
                title,
                year,
                month: currentMonth || 'Gennaio',
                category: colB || 'Manga',
                notes: colC || null
              });
              results.readingsImported++;
            }
          }
          continue;
        }

        const parseColumnBlock = (titleVal, priceVal, defaultPubName, channel = 'Fumetteria') => {
          if (!titleVal) return null;
          const cleanTitle = String(titleVal).trim();
          if (!cleanTitle || cleanTitle.toLowerCase().startsWith('totale') || cleanTitle.toLowerCase() === '€' || cleanTitle.toLowerCase() === 'titolo') {
            return null;
          }

          let priceNum = 0;
          if (priceVal !== null && priceVal !== undefined) {
            const cleanP = String(priceVal).replace('€', '').replace(',', '.').trim();
            priceNum = parseFloat(cleanP) || 0;
          }

          let pubName = defaultPubName;
          let pureTitle = cleanTitle;

          const dcMatch = cleanTitle.match(/^(?:DC\s*[-:]?\s*|BATMAN\s*[-:]?\s*|SUPERMAN\s*[-:]?\s*)(.*)/i);
          if (dcMatch && defaultPubName === 'Panini Comics') {
            pubName = 'DC';
          }

          const marvelMatch = cleanTitle.match(/^(?:MARVEL\s*[-:]?\s*|SPIDER-MAN\s*[-:]?\s*|AVENGERS\s*[-:]?\s*|X-MEN\s*[-:]?\s*)(.*)/i);
          if (marvelMatch && defaultPubName === 'Panini Comics') {
            pubName = 'Marvel';
          }

          let issueNum = null;
          const issueMatch = pureTitle.match(/(?:#|n\.?|vol\.?)\s*(\d+(?:[.,]\d+)?)/i);
          if (issueMatch) {
            issueNum = issueMatch[1];
          }

          let variantInfo = null;
          if (/variant|cover\s+[a-z]|foil|white|exclusive/i.test(pureTitle)) {
            const vMatch = pureTitle.match(/(variant(?:\s+[a-z0-9]+)?|cover\s+[a-z]|foil|white)/i);
            if (vMatch) variantInfo = vMatch[1];
          }

          const pubId = getPublisherId(pubName);

          insertComic.run({
            user_id: userId,
            title: pureTitle,
            series: pureTitle.replace(/(?:#|n\.?|vol\.?)\s*(\d+)/i, '').trim(),
            issue_number: issueNum,
            variant_info: variantInfo,
            publisher_id: pubId,
            year,
            month: currentMonth || 'Gennaio',
            release_date: null,
            purchase_date: null,
            cover_price: priceNum,
            purchase_price: priceNum,
            status: 'Acquistato',
            channel,
            notes: null
          });

          results.comicsImported++;
        };

        if (colA && colA.toLowerCase().includes('dc')) continue;
        if (colB && colB.toLowerCase().includes('spesa')) continue;

        if (colA && colB && currentMonth) {
          parseColumnBlock(colA, colB, 'DC', 'Fumetteria');
        }
        if (colC && colD && currentMonth) {
          parseColumnBlock(colC, colD, 'Marvel', 'Fumetteria');
        }
        if (colE && colF && currentMonth) {
          parseColumnBlock(colE, colF, 'Manga', 'Fumetteria');
        }
        const colG = getVal(6);
        const colH = getVal(7);
        if (colG && colH && currentMonth) {
          parseColumnBlock(colG, colH, 'Altro', 'Fumetteria');
        }
      }

      if (hvcItemsByYearAndMonth[year]) {
        for (const [mName, items] of Object.entries(hvcItemsByYearAndMonth[year])) {
          for (const item of items) {
            const pubId = getPublisherId(item.publisher);
            insertComic.run({
              user_id: userId,
              title: item.title,
              series: item.title,
              issue_number: null,
              variant_info: null,
              publisher_id: pubId,
              year,
              month: mName,
              release_date: null,
              purchase_date: item.date ? excelDateToString(item.date) : null,
              cover_price: item.price,
              purchase_price: item.price,
              status: normalizeStatus(item.status, 'Acquistato'),
              channel: 'HoVistoCose',
              notes: item.notes
            });
            results.comicsImported++;
            results.hvcImported++;
          }
        }
      }
    }
  });

  importTx();
  return results;
}

module.exports = {
  importExcel,
  findOneDriveExcelPath
};
