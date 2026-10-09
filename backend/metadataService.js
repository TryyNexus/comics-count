const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { db, DATA_DIR } = require('./db');

const COVERS_DIR = path.join(DATA_DIR || __dirname, 'uploads', 'covers');
if (!fs.existsSync(COVERS_DIR)) {
  fs.mkdirSync(COVERS_DIR, { recursive: true });
}

function fetchHtml(url, options = {}) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      const req = client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          ...(options.headers || {})
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', () => resolve(''));
      req.on('timeout', () => { req.destroy(); resolve(''); });
    } catch (e) {
      resolve('');
    }
  });
}

function fetchJson(url, options = {}) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      const req = client.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ComicsManager/1.0',
          ...(options.headers || {})
        },
        timeout: 10000
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve({ error: 'JSON parse error', raw: data.slice(0, 300) });
          }
        });
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ error: 'Timeout' }); });
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

// -------------------------------------------------------------
// 1. HOVISTOCOSE SEARCH (PRIMARY PROVIDER)
// -------------------------------------------------------------

// Helper to clean and extract core title + issue number
function extractCoreQuery(title) {
  let clean = title.replace(/\(MR\)/gi, '')
                   .replace(/\(OF\s+\d+\)/gi, '')
                   .replace(/#/g, ' ')
                   .replace(/,/g, ' ')
                   .replace(/:/g, ' ')
                   .trim();

  // Try to find series and issue number e.g. "ABSOLUTE SUPERMAN 15"
  const match = clean.match(/^([A-Za-z0-9\s'.-]+?)\s+(\d+)\b/);
  if (match) {
    return `${match[1].trim()} ${match[2]}`.replace(/\s+/g, ' ');
  }

  // TP / Vol check: e.g. "ULTIMATE SPIDER-MAN BY HICKMAN TP VOL 03"
  const tpMatch = clean.match(/^([A-Za-z0-9\s'.-]+?)\s+(?:TP|HC|VOL|VOLUME)\s+(\d+|[0-9]+)/i);
  if (tpMatch) {
    return clean.split(/\s+VOL\b/i)[0].trim();
  }

  return clean.replace(/\s+/g, ' ').trim();
}

function scoreHvcMatch(resultTitle, originalTitle) {
  const rWords = resultTitle.toUpperCase().split(/[^A-Z0-9]+/);
  const oWords = originalTitle.toUpperCase().split(/[^A-Z0-9]+/);
  
  let score = 0;
  for (const w of oWords) {
    if (w.length >= 2 && rWords.includes(w)) {
      score += 2;
      // Extra weight for variant indicators or artist names
      if (['CVR', 'VAR', 'VARIANT', 'FOIL', 'BLANK', 'CARD', 'STOCK', 'PRINTING', 'FACSIMILE', 'EDITION'].includes(w)) {
        score += 4;
      }
    }
  }
  return score;
}

async function executeHvcQuery(cleanQ) {
  try {
    const url = `https://www.hovistocose.it/search/?q=${encodeURIComponent(cleanQ)}`;
    const html = await fetchHtml(url, {
      headers: {
        'Referer': 'https://www.hovistocose.it/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    if (!html || html.length < 500) return [];

    // Map image scripts: $('#imgModal-X').attr('src', 'URL')
    const imgMap = {};
    const scriptImgMatches = [...html.matchAll(/\$\('#imgModal-(\d+)'\)\.attr\('src',\s*'([^']+)'\)/gi)];
    scriptImgMatches.forEach(m => {
      const idx = m[1];
      let imgUrl = m[2];
      if (!imgUrl.includes('loading.gif') && !imgUrl.includes('nocover')) {
        imgUrl = imgUrl.split('#')[0];
        if (imgUrl.startsWith('//')) imgUrl = 'https:' + imgUrl;
        imgMap[idx] = imgUrl;
      }
    });

    const results = [];
    const modalBlocks = [...html.matchAll(/<div id="myModal-(\d+)"[\s\S]*?<h3 id="myModalLabel">([\s\S]*?)<\/h3>[\s\S]*?<div class="modal-body">([\s\S]*?)<\/div>/gi)];

    for (const m of modalBlocks) {
      const idx = m[1];
      const rawTitle = m[2].replace(/<[^>]+>/g, '').trim();
      const body = m[3];

      // Extract EAN / Barcode (supports 13, 17, or 10 digits)
      const eanMatch = body.match(/(?:EAN|ISBN|UPC|codice)\s*([0-9A-Za-z]+)/i);
      const ean = eanMatch ? eanMatch[1].trim() : null;

      // Extract publisher
      const pubMatch = body.match(/<a href="\/publisher\/[^"]*"[^>]*>([\s\S]*?)<\/a>/i);
      const publisher = pubMatch ? pubMatch[1].replace(/<[^>]+>/g, '').trim() : null;

      // Extract price from HVC
      let hvcPrice = null;
      let coverPriceVal = null;
      const hvcPriceMatch = body.match(/Prezzo\s+HoVistoCose:\s*(?:EUR|€)?\s*([0-9]+[.,][0-9]{2})/i);
      if (hvcPriceMatch) {
        hvcPrice = parseFloat(hvcPriceMatch[1].replace(',', '.'));
      }
      const covPriceMatch = body.match(/Prezzo\s+di\s+copertina:\s*(?:EUR|€|USD|\$)?\s*([0-9]+[.,][0-9]{2})/i);
      if (covPriceMatch) {
        coverPriceVal = parseFloat(covPriceMatch[1].replace(',', '.'));
      }

      const coverUrl = imgMap[idx] || null;

      results.push({
        source: 'HoVistoCose',
        title: rawTitle,
        publisher: publisher || 'Panini / DC / Marvel',
        ean: ean,
        isbn: ean,
        price: hvcPrice || coverPriceVal || null,
        coverPrice: coverPriceVal || hvcPrice || null,
        coverUrl,
        thumbnailUrl: coverUrl
      });
    }

    return results;
  } catch (e) {
    return [];
  }
}

async function searchHoVistoCose(query) {
  try {
    if (!query || typeof query !== 'string') return [];
    
    // 1. Initial attempt: clean query
    const cleanQ = query.replace(/[#,-]+/g, ' ').replace(/\s+/g, ' ').trim();
    let results = await executeHvcQuery(cleanQ);

    // 2. If no results or very few, try simplified core query
    if (results.length === 0) {
      const core = extractCoreQuery(query);
      if (core && core.toLowerCase() !== cleanQ.toLowerCase()) {
        results = await executeHvcQuery(core);
      }
    }

    // 3. If still no results, try just the first 3-4 words (series title)
    if (results.length === 0) {
      const words = cleanQ.split(' ');
      if (words.length > 3) {
        const shortQ = words.slice(0, 3).join(' ');
        results = await executeHvcQuery(shortQ);
      }
    }

    // Sort results by relevance score relative to original query
    if (results.length > 0) {
      results.sort((a, b) => {
        const scoreA = scoreHvcMatch(a.title, query);
        const scoreB = scoreHvcMatch(b.title, query);
        return scoreB - scoreA;
      });
    }

    return results;
  } catch (e) {
    console.error('HoVistoCose search error:', e.message);
    return [];
  }
}

// -------------------------------------------------------------
// 2. OPEN LIBRARY & MANGADEX & GOOGLE BOOKS (FALLBACKS)
// -------------------------------------------------------------

async function searchOpenLibrary(query) {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=4`;
    const data = await fetchJson(url);
    if (!data.docs || !Array.isArray(data.docs)) return [];

    return data.docs
      .filter(doc => doc.title)
      .slice(0, 3)
      .map(doc => {
        const isbns = doc.isbn || [];
        const isbn13 = isbns.find(code => code.length === 13) || isbns[0] || null;
        const isbn10 = isbns.find(code => code.length === 10) || null;
        const coverUrl = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : null;

        return {
          source: 'Open Library',
          title: doc.title,
          publisher: (doc.publisher || [])[0] || 'Sconosciuto',
          author: (doc.author_name || [])[0] || null,
          year: doc.first_publish_year ? String(doc.first_publish_year) : null,
          isbn: isbn13 || isbn10,
          ean: isbn13,
          coverUrl,
          thumbnailUrl: doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg` : null
        };
      });
  } catch (e) {
    return [];
  }
}

async function searchMangaDex(query) {
  try {
    const searchUrl = `https://api.mangadex.org/manga?title=${encodeURIComponent(query)}&limit=2`;
    const res = await fetchJson(searchUrl);
    if (!res.data || res.data.length === 0) return [];

    const results = [];
    for (const manga of res.data.slice(0, 2)) {
      const mangaId = manga.id;
      const titleObj = manga.attributes.title || {};
      const title = titleObj.en || titleObj['ja-ro'] || Object.values(titleObj)[0] || query;

      const coverRes = await fetchJson(`https://api.mangadex.org/cover?manga[]=${mangaId}&limit=3`);
      if (coverRes.data && coverRes.data.length > 0) {
        for (const c of coverRes.data.slice(0, 2)) {
          const fileName = c.attributes.fileName;
          const vol = c.attributes.volume ? `Vol. ${c.attributes.volume}` : '';
          results.push({
            source: 'MangaDex',
            title: `${title} ${vol}`.trim(),
            publisher: 'Manga',
            author: null,
            year: null,
            isbn: null,
            ean: null,
            coverUrl: `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.512.jpg`,
            thumbnailUrl: `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg`
          });
        }
      }
    }
    return results;
  } catch (e) {
    return [];
  }
}

async function searchGoogleBooks(query, apiKey = null) {
  try {
    let url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`;
    if (apiKey) url += `&key=${apiKey}`;

    const data = await fetchJson(url);
    if (!data.items || !Array.isArray(data.items)) return [];

    return data.items.map(item => {
      const info = item.volumeInfo || {};
      const ids = info.industryIdentifiers || [];
      const isbn13 = ids.find(id => id.type === 'ISBN_13');
      const isbn10 = ids.find(id => id.type === 'ISBN_10');
      const thumbs = info.imageLinks || {};
      let img = thumbs.thumbnail || thumbs.smallThumbnail || null;
      if (img && img.startsWith('http:')) img = img.replace('http:', 'https:');

      const saleInfo = item.saleInfo || {};
      const retailPrice = saleInfo.retailPrice || saleInfo.listPrice || null;
      const gbPrice = retailPrice && retailPrice.amount ? Number(retailPrice.amount) : null;

      return {
        source: 'Google Books',
        title: info.title,
        publisher: info.publisher || 'Panini / Altro',
        author: (info.authors || [])[0] || null,
        year: info.publishedDate ? info.publishedDate.slice(0, 4) : null,
        isbn: isbn13 ? isbn13.identifier : (isbn10 ? isbn10.identifier : null),
        ean: isbn13 ? isbn13.identifier : null,
        price: gbPrice,
        coverPrice: gbPrice,
        coverUrl: img,
        thumbnailUrl: img
      };
    });
  } catch (e) {
    return [];
  }
}

// -------------------------------------------------------------
// MASTER SEARCH: HOVISTOCOSE FIRST!
// -------------------------------------------------------------

async function searchMetadata(title, issue = '', publisher = '') {
  const cleanQ = `${title} ${issue}`.trim();
  const results = [];

  // 1. FIRST: Query HoVistoCose with the exact comic title
  try {
    const hvcResults = await searchHoVistoCose(cleanQ);
    if (hvcResults && hvcResults.length > 0) {
      results.push(...hvcResults);
    }
    // Also try title without issue if no results
    if (results.length === 0 && issue) {
      const hvcTitleOnly = await searchHoVistoCose(title);
      results.push(...hvcTitleOnly);
    }
  } catch (e) {
    console.error('HVC search error:', e);
  }

  // 2. If it's a Manga or HVC had few results, search MangaDex
  const isManga = (publisher && publisher.toLowerCase().includes('manga')) ||
                  /jujutsu|chainsaw|berserk|one piece|gachiakuta|shangri|inazuma|dragon ball|naruto|bleach|seiya|wistoria/i.test(title);

  if (isManga) {
    const mangaResults = await searchMangaDex(title);
    results.push(...mangaResults);
  }

  // 3. Fallback: Search Open Library if needed
  if (results.length < 3) {
    const olResults = await searchOpenLibrary(cleanQ);
    results.push(...olResults);
  }

  // 4. Fallback: Search Google Books if needed
  if (results.length < 2) {
    const gbKey = db.prepare("SELECT value FROM settings WHERE key = 'google_books_key'").get();
    const gbResults = await searchGoogleBooks(cleanQ, gbKey ? gbKey.value : null);
    results.push(...gbResults);
  }

  // Deduplicate results
  const unique = [];
  const seenTitles = new Set();
  const seenUrls = new Set();

  for (const r of results) {
    const titleKey = (r.title || '').toLowerCase().trim();
    const urlKey = r.coverUrl || '';
    if (!seenTitles.has(titleKey) && (!urlKey || !seenUrls.has(urlKey))) {
      seenTitles.add(titleKey);
      if (urlKey) seenUrls.add(urlKey);
      unique.push(r);
    }
  }

  return unique.slice(0, 5);
}

// -------------------------------------------------------------
// DOWNLOAD & CACHE COVER (WITH HOVISTOCOSE REFERER SUPPORT)
// -------------------------------------------------------------

async function downloadAndCacheCover(imageUrl, comicId = 'temp') {
  if (!imageUrl) return null;

  return new Promise((resolve) => {
    try {
      const urlObj = new URL(imageUrl);
      const client = urlObj.protocol === 'https:' ? https : http;

      const ext = path.extname(urlObj.pathname).split('?')[0] || '.jpg';
      const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext.toLowerCase()) ? ext.toLowerCase() : '.jpg';
      const fileName = `cover_${comicId}_${Date.now()}${safeExt}`;
      const targetPath = path.join(COVERS_DIR, fileName);

      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };

      // Critical: HoVistoCose requires their referer
      if (imageUrl.includes('hovistocose.it')) {
        headers['Referer'] = 'https://www.hovistocose.it/';
      }

      const req = client.get(imageUrl, { headers, timeout: 12000 }, (res) => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        const fileStream = fs.createWriteStream(targetPath);
        res.pipe(fileStream);
        fileStream.on('finish', () => {
          fileStream.close();
          const publicUrl = `/uploads/covers/${fileName}`;
          resolve(publicUrl);
        });
      });

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    } catch (e) {
      resolve(null);
    }
  });
}

module.exports = {
  searchMetadata,
  searchHoVistoCose,
  downloadAndCacheCover,
  COVERS_DIR
};
