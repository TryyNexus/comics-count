const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { db } = require('./db');
const { importExcel, findOneDriveExcelPath } = require('./excelImporter');
const { exportToExcel, exportToJson } = require('./excelExporter');
const { searchMetadata, downloadAndCacheCover, COVERS_DIR } = require('./metadataService');
const { startTunnel, getTunnelUrl, getTunnelStatus } = require('./tunnelService');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve uploaded covers statically
app.use('/uploads/covers', express.static(COVERS_DIR));

// Configure multer for file uploads
const uploadDir = path.join(__dirname, 'uploads', 'temp');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

// -------------------------------------------------------------
// COMICS ROUTES
// -------------------------------------------------------------

app.get('/api/comics', (req, res) => {
  try {
    const { year, month, publisherId, status, channel, search } = req.query;
    let query = `
      SELECT 
        c.*, 
        p.name AS publisher_name, 
        p.color AS publisher_color
      FROM comics c
      LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (year && year !== 'all') {
      query += ` AND c.year = ?`;
      params.push(year);
    }
    if (month && month !== 'all') {
      query += ` AND c.month = ?`;
      params.push(month);
    }
    if (publisherId && publisherId !== 'all') {
      query += ` AND c.publisher_id = ?`;
      params.push(publisherId);
    }
    if (status && status !== 'all') {
      query += ` AND c.status = ?`;
      params.push(status);
    }
    if (channel && channel !== 'all') {
      query += ` AND c.channel = ?`;
      params.push(channel);
    }
    if (search) {
      query += ` AND (c.title LIKE ? OR c.series LIKE ? OR c.notes LIKE ? OR c.isbn LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ` ORDER BY c.year DESC, c.id DESC`;
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/comics', async (req, res) => {
  try {
    const {
      title, series, issue_number, variant_info, publisher_id,
      year, month, release_date, purchase_date, cover_price,
      purchase_price, isbn, ean, upc, cover_url, status, channel, notes
    } = req.body;

    if (!title || !year || !month) {
      return res.status(400).json({ error: 'Titolo, Anno e Mese sono obbligatori' });
    }

    let localCoverPath = null;
    if (cover_url && cover_url.startsWith('http')) {
      localCoverPath = await downloadAndCacheCover(cover_url, 'new');
    }

    const stmt = db.prepare(`
      INSERT INTO comics (
        title, series, issue_number, variant_info, publisher_id,
        year, month, release_date, purchase_date, cover_price,
        purchase_price, isbn, ean, upc, cover_url, local_cover_path,
        status, channel, notes
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    const result = stmt.run(
      title, series || null, issue_number || null, variant_info || null, publisher_id || null,
      year, month, release_date || null, purchase_date || null, Number(cover_price) || 0,
      Number(purchase_price) || 0, isbn || null, ean || null, upc || null,
      cover_url || null, localCoverPath, status || 'Acquistato', channel || 'Fumetteria', notes || null
    );

    const created = db.prepare(`
      SELECT c.*, p.name AS publisher_name, p.color AS publisher_color
      FROM comics c LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE c.id = ?
    `).get(result.lastInsertRowid);

    res.json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/comics/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const {
      title, series, issue_number, variant_info, publisher_id,
      year, month, release_date, purchase_date, cover_price,
      purchase_price, isbn, ean, upc, cover_url, status, channel, notes
    } = req.body;

    let localCoverPath = req.body.local_cover_path;
    if (cover_url && cover_url.startsWith('http') && (!localCoverPath || !localCoverPath.includes('cover_'))) {
      const cached = await downloadAndCacheCover(cover_url, id);
      if (cached) localCoverPath = cached;
    }

    const stmt = db.prepare(`
      UPDATE comics SET
        title = ?, series = ?, issue_number = ?, variant_info = ?, publisher_id = ?,
        year = ?, month = ?, release_date = ?, purchase_date = ?, cover_price = ?,
        purchase_price = ?, isbn = ?, ean = ?, upc = ?, cover_url = ?,
        local_cover_path = COALESCE(?, local_cover_path), status = ?, channel = ?,
        notes = ?, updated_at = datetime('now')
      WHERE id = ?
    `);

    stmt.run(
      title, series, issue_number, variant_info, publisher_id,
      year, month, release_date, purchase_date, Number(cover_price) || 0,
      Number(purchase_price) || 0, isbn, ean, upc, cover_url,
      localCoverPath, status, channel, notes, id
    );

    const updated = db.prepare(`
      SELECT c.*, p.name AS publisher_name, p.color AS publisher_color
      FROM comics c LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE c.id = ?
    `).get(id);

    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/comics/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    db.prepare("UPDATE comics SET status = ?, updated_at = datetime('now') WHERE id = ?").run(status, req.params.id);
    res.json({ success: true, id: req.params.id, status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/comics/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM comics WHERE id = ?').run(req.params.id);
    res.json({ success: true, id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// All purchased comics across years for readings search
app.get('/api/comics/purchased', (req, res) => {
  try {
    const { category, search } = req.query;
    let query = `
      SELECT 
        c.id, 
        c.title, 
        c.series, 
        c.issue_number, 
        c.variant_info, 
        c.publisher_id, 
        p.name AS publisher_name, 
        p.color AS publisher_color,
        c.year, 
        c.month, 
        c.cover_url, 
        c.local_cover_path, 
        c.status,
        c.channel,
        c.purchase_price
      FROM comics c
      LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE c.title NOT LIKE 'HVC Ordine Totale%'
        AND c.title NOT LIKE 'Totale Ordine%'
    `;
    const params = [];

    if (search) {
      query += ` AND (c.title LIKE ? OR c.series LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term);
    }

    query += ` ORDER BY c.year DESC, c.month DESC, c.title ASC`;
    const rows = db.prepare(query).all(...params);

    const enriched = rows.map(r => {
      const p = (r.publisher_name || '').toLowerCase();
      let cat = 'Altro';
      if (p.includes('dc')) cat = 'DC';
      else if (p.includes('marvel')) cat = 'Marvel';
      else if (p.includes('manga') || p.includes('star') || p.includes('j-pop') || /jujutsu|chainsaw|berserk|one piece|gachiakuta|shangri|inazuma|dragon ball|naruto|bleach|seiya|wistoria/i.test(r.title)) cat = 'Manga';

      return {
        ...r,
        category: cat
      };
    });

    if (category && category !== 'Tutti' && category !== 'all') {
      return res.json(enriched.filter(item => item.category.toLowerCase() === category.toLowerCase()));
    }

    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// PUBLISHERS ROUTES
// -------------------------------------------------------------

app.get('/api/publishers', (req, res) => {
  try {
    const pubs = db.prepare(`
      SELECT p.*, COUNT(c.id) as comics_count
      FROM publishers p
      LEFT JOIN comics c ON p.id = c.publisher_id
      GROUP BY p.id
      ORDER BY comics_count DESC, p.name ASC
    `).all();
    res.json(pubs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/publishers', (req, res) => {
  try {
    const { name, color, description } = req.body;
    const stmt = db.prepare('INSERT INTO publishers (name, color, description) VALUES (?, ?, ?)');
    const result = stmt.run(name, color || '#6366f1', description || null);
    res.json({ id: result.lastInsertRowid, name, color, description });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// SALES / REFUNDS (VENDITE & RIMBORSI)
// -------------------------------------------------------------

app.get('/api/sales', (req, res) => {
  try {
    const { year, month } = req.query;
    let query = 'SELECT * FROM sales_refunds WHERE 1=1';
    const params = [];
    if (year && year !== 'all') {
      query += ' AND year = ?';
      params.push(year);
    }
    if (month && month !== 'all') {
      query += ' AND month = ?';
      params.push(month);
    }
    query += ' ORDER BY year DESC, id DESC';
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/sales', (req, res) => {
  try {
    const { year, month, title, price, channel, notes } = req.body;
    const stmt = db.prepare('INSERT INTO sales_refunds (year, month, title, price, channel, notes) VALUES (?, ?, ?, ?, ?, ?)');
    const result = stmt.run(year, month || null, title, Number(price) || 0, channel || 'Vinted', notes || null);
    res.json({ id: result.lastInsertRowid, year, month, title, price, channel, notes });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/sales/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM sales_refunds WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// ORDERS & READINGS
// -------------------------------------------------------------

app.get('/api/orders', (req, res) => {
  try {
    const { year } = req.query;
    let query = 'SELECT * FROM orders WHERE 1=1';
    const params = [];
    if (year && year !== 'all') {
      query += ' AND year = ?';
      params.push(year);
    }
    query += ' ORDER BY id DESC';
    const orders = db.prepare(query).all(...params);
    res.json(orders);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const { store_name, title, items_count, total_price, year, month, status, notes } = req.body;
    const stmt = db.prepare('INSERT INTO orders (store_name, title, items_count, total_price, year, month, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(store_name, title, items_count || 1, Number(total_price) || 0, year || '2026', month || null, status || 'Completato', notes || null);
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/orders/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/readings', (req, res) => {
  try {
    const { year, month } = req.query;
    let query = `
      SELECT 
        r.*,
        c.cover_url,
        c.local_cover_path,
        c.issue_number,
        c.variant_info,
        c.year AS purchase_year,
        c.month AS purchase_month,
        p.name AS publisher_name,
        p.color AS publisher_color
      FROM readings r
      LEFT JOIN comics c ON r.comic_id = c.id
      LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (year && year !== 'all') { query += ' AND r.year = ?'; params.push(year); }
    if (month && month !== 'all') { query += ' AND r.month = ?'; params.push(month); }
    query += ' ORDER BY r.id DESC';
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/readings', (req, res) => {
  try {
    const { comic_id, title, year, month, category, rating, notes, read_date } = req.body;
    const stmt = db.prepare('INSERT INTO readings (comic_id, title, year, month, category, rating, notes, read_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(comic_id || null, title, year, month, category || 'Altro', rating || null, notes || null, read_date || null);

    if (comic_id) {
      db.prepare("UPDATE comics SET status = 'Letto', updated_at = datetime('now') WHERE id = ?").run(comic_id);
    }

    const created = db.prepare(`
      SELECT 
        r.*,
        c.cover_url,
        c.local_cover_path,
        c.issue_number,
        c.variant_info,
        c.year AS purchase_year,
        c.month AS purchase_month,
        p.name AS publisher_name,
        p.color AS publisher_color
      FROM readings r
      LEFT JOIN comics c ON r.comic_id = c.id
      LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE r.id = ?
    `).get(result.lastInsertRowid);

    res.json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/readings/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM readings WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// BUDGETS & SETTINGS
// -------------------------------------------------------------

app.get('/api/budgets', (req, res) => {
  try {
    const budgets = db.prepare('SELECT * FROM monthly_budgets').all();
    res.json(budgets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/budgets', (req, res) => {
  try {
    const { year, month, budget_amount } = req.body;
    db.prepare(`
      INSERT INTO monthly_budgets (year, month, budget_amount)
      VALUES (?, ?, ?)
      ON CONFLICT(year, month) DO UPDATE SET budget_amount = excluded.budget_amount
    `).run(year, month, Number(budget_amount) || 0);
    res.json({ success: true, year, month, budget_amount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// ACCOUNTING & STATISTICS
// -------------------------------------------------------------

app.get('/api/stats/summary', (req, res) => {
  try {
    const { year, month } = req.query;
    const currentYear = year || '2026';
    const currentMonth = month || 'Ottobre';

    // Monthly spent
    const monthlySpentRow = db.prepare(`
      SELECT 
        ROUND(SUM(purchase_price), 2) AS spent,
        COUNT(id) AS count,
        SUM(CASE WHEN status = 'Letto' THEN 1 ELSE 0 END) AS read_count
      FROM comics
      WHERE year = ? AND month = ?
    `).get(currentYear, currentMonth) || {};

    // Annual spent
    const annualSpentRow = db.prepare(`
      SELECT 
        ROUND(SUM(purchase_price), 2) AS spent,
        COUNT(id) AS count
      FROM comics
      WHERE year = ?
    `).get(currentYear) || {};

    // Annual sales / refunds
    const annualSalesRow = db.prepare(`
      SELECT ROUND(SUM(price), 2) AS sales
      FROM sales_refunds
      WHERE year = ?
    `).get(currentYear) || {};

    // Monthly sales / refunds
    const monthlySalesRow = db.prepare(`
      SELECT ROUND(SUM(price), 2) AS sales
      FROM sales_refunds
      WHERE year = ? AND month = ?
    `).get(currentYear, currentMonth) || {};

    // Monthly budget
    const budgetRow = db.prepare(`
      SELECT budget_amount FROM monthly_budgets
      WHERE year = ? AND month = ?
    `).get(currentYear, currentMonth) || {};

    const monthlySpent = monthlySpentRow.spent || 0;
    const monthlySales = monthlySalesRow.sales || 0;
    const annualSpent = annualSpentRow.spent || 0;
    const annualSales = annualSalesRow.sales || 0;
    const budget = budgetRow.budget_amount || 0;

    res.json({
      year: currentYear,
      month: currentMonth,
      monthlySpent,
      monthlySales,
      monthlyNet: Number((monthlySpent - monthlySales).toFixed(2)),
      monthlyCount: monthlySpentRow.count || 0,
      monthlyReadCount: monthlySpentRow.read_count || 0,
      annualSpent,
      annualSales,
      annualNet: Number((annualSpent - annualSales).toFixed(2)),
      annualCount: annualSpentRow.count || 0,
      budget,
      budgetRemaining: budget > 0 ? Number((budget - monthlySpent).toFixed(2)) : null
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats/publishers', (req, res) => {
  try {
    const { year, month } = req.query;
    let query = `
      SELECT 
        COALESCE(p.name, 'Altro') AS name,
        COALESCE(p.color, '#6366f1') AS color,
        ROUND(SUM(c.purchase_price), 2) AS total,
        COUNT(c.id) AS count
      FROM comics c
      LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (year && year !== 'all') { query += ' AND c.year = ?'; params.push(year); }
    if (month && month !== 'all') { query += ' AND c.month = ?'; params.push(month); }
    query += ' GROUP BY p.name ORDER BY total DESC';

    const rows = db.prepare(query).all(...params);
    const grandTotal = rows.reduce((sum, r) => sum + (r.total || 0), 0);

    const withPercentages = rows.map(r => ({
      ...r,
      percentage: grandTotal > 0 ? Number(((r.total / grandTotal) * 100).toFixed(1)) : 0
    }));

    res.json({ rows: withPercentages, grandTotal: Number(grandTotal.toFixed(2)) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats/monthly-trends', (req, res) => {
  try {
    const { year } = req.query;
    const targetYear = year || '2026';

    const months = [
      'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];

    const comicRows = db.prepare(`
      SELECT month, ROUND(SUM(purchase_price), 2) as spent, COUNT(id) as count
      FROM comics
      WHERE year = ?
      GROUP BY month
    `).all(targetYear);

    const budgetRows = db.prepare(`
      SELECT month, budget_amount FROM monthly_budgets WHERE year = ?
    `).all(targetYear);

    const salesRows = db.prepare(`
      SELECT month, ROUND(SUM(price), 2) as sales
      FROM sales_refunds
      WHERE year = ?
      GROUP BY month
    `).all(targetYear);

    const data = months.map(m => {
      const c = comicRows.find(r => r.month.toLowerCase() === m.toLowerCase()) || {};
      const b = budgetRows.find(r => r.month.toLowerCase() === m.toLowerCase()) || {};
      const s = salesRows.find(r => r.month && r.month.toLowerCase() === m.toLowerCase()) || {};

      const spent = c.spent || 0;
      const sales = s.sales || 0;
      return {
        month: m,
        spent,
        sales,
        net: Number((spent - sales).toFixed(2)),
        budget: b.budget_amount || 0,
        count: c.count || 0
      };
    });

    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/stats/yearly-comparison', (req, res) => {
  try {
    const years = ['2023', '2024', '2025', '2026', '2027'];
    const rows = years.map(y => {
      const c = db.prepare('SELECT ROUND(SUM(purchase_price), 2) as spent, COUNT(id) as count FROM comics WHERE year = ?').get(y) || {};
      const s = db.prepare('SELECT ROUND(SUM(price), 2) as sales FROM sales_refunds WHERE year = ?').get(y) || {};
      const spent = c.spent || 0;
      const sales = s.sales || 0;
      return {
        year: y,
        spent,
        sales,
        net: Number((spent - sales).toFixed(2)),
        count: c.count || 0
      };
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// METADATA & COVER SEARCH
// -------------------------------------------------------------

app.get('/api/metadata/search', async (req, res) => {
  try {
    const { title, issue, publisher } = req.query;
    if (!title) return res.status(400).json({ error: 'Titolo mancante' });

    const results = await searchMetadata(title, issue || '', publisher || '');
    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/metadata/save-cover', async (req, res) => {
  try {
    const { imageUrl, comicId } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'URL immagine mancante' });

    const localPath = await downloadAndCacheCover(imageUrl, comicId || 'manual');
    if (!localPath) return res.status(500).json({ error: 'Impossibile scaricare immagine' });

    if (comicId) {
      db.prepare("UPDATE comics SET cover_url = ?, local_cover_path = ?, updated_at = datetime('now') WHERE id = ?")
        .run(imageUrl, localPath, comicId);
    }

    res.json({ localPath, coverUrl: imageUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload/cover', upload.single('cover'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
    const ext = path.extname(req.file.originalname) || '.jpg';
    const finalName = `upload_${Date.now()}${ext}`;
    const target = path.join(COVERS_DIR, finalName);
    fs.renameSync(req.file.path, target);

    const publicUrl = `/uploads/covers/${finalName}`;
    res.json({ localPath: publicUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy image requests to bypass external anti-hotlinking / referer restrictions (e.g. HoVistoCose)
app.get('/api/proxy/image', (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const urlObj = new URL(imageUrl);
    const client = urlObj.protocol === 'https:' ? require('https') : require('http');

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    if (imageUrl.includes('hovistocose.it')) {
      headers['Referer'] = 'https://www.hovistocose.it/';
    }

    client.get(imageUrl, { headers, timeout: 10000 }, (remoteRes) => {
      if (remoteRes.statusCode !== 200) {
        return res.status(remoteRes.statusCode).end();
      }
      res.setHeader('Content-Type', remoteRes.headers['content-type'] || 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      remoteRes.pipe(res);
    }).on('error', () => {
      res.status(502).end();
    });
  } catch (e) {
    res.status(400).send('Invalid URL');
  }
});

// Auto-enrich comic metadata from HoVistoCose
app.post('/api/comics/:id/enrich-hvc', async (req, res) => {
  try {
    const comic = db.prepare('SELECT * FROM comics WHERE id = ?').get(req.params.id);
    if (!comic) return res.status(404).json({ error: 'Fumetto non trovato' });

    const results = await searchMetadata(comic.title, comic.issue_number || '', '');
    if (results && results.length > 0) {
      const best = results[0];
      let localCover = null;
      if (best.coverUrl) {
        localCover = await downloadAndCacheCover(best.coverUrl, comic.id);
      }
      db.prepare(`
        UPDATE comics SET
          isbn = COALESCE(?, isbn),
          ean = COALESCE(?, ean),
          cover_url = COALESCE(?, cover_url),
          local_cover_path = COALESCE(?, local_cover_path),
          updated_at = datetime('now')
        WHERE id = ?
      `).run(best.isbn || best.ean, best.ean || best.isbn, best.coverUrl, localCover, comic.id);

      const updated = db.prepare(`
        SELECT c.*, p.name AS publisher_name, p.color AS publisher_color
        FROM comics c LEFT JOIN publishers p ON c.publisher_id = p.id
        WHERE c.id = ?
      `).get(comic.id);

      return res.json({ success: true, comic: updated });
    }
    res.json({ success: false, message: 'Nessun metadato trovato su HoVistoCose' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Batch enrich HVC comics from HoVistoCose
app.post('/api/comics/enrich-hvc-batch', async (req, res) => {
  try {
    const { year, month, limit = 50 } = req.body || {};
    let query = `
      SELECT * FROM comics 
      WHERE channel = 'HVC / Preordine' 
        AND purchase_price = 0 
        AND (isbn IS NULL OR cover_url IS NULL)
    `;
    const params = [];
    if (year && year !== 'all') {
      query += ' AND year = ?';
      params.push(year);
    }
    if (month && month !== 'all') {
      query += ' AND month = ?';
      params.push(month);
    }
    query += ' LIMIT ?';
    params.push(Number(limit) || 50);

    const comics = db.prepare(query).all(...params);
    let enriched = 0;

    for (const c of comics) {
      try {
        const results = await searchMetadata(c.title, c.issue_number || '', '');
        if (results && results.length > 0) {
          const best = results[0];
          let localCover = null;
          if (best.coverUrl) {
            localCover = await downloadAndCacheCover(best.coverUrl, c.id);
          }
          db.prepare(`
            UPDATE comics SET
              isbn = COALESCE(?, isbn),
              ean = COALESCE(?, ean),
              cover_url = COALESCE(?, cover_url),
              local_cover_path = COALESCE(?, local_cover_path),
              updated_at = datetime('now')
            WHERE id = ?
          `).run(best.isbn || best.ean, best.ean || best.isbn, best.coverUrl, localCover, c.id);
          enriched++;
        }
        await new Promise(r => setTimeout(r, 400));
      } catch (err) {
        console.error(`Error enriching ${c.title}:`, err.message);
      }
    }

    res.json({ success: true, processed: comics.length, enriched });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// IMPORT & EXPORT
// -------------------------------------------------------------

app.get('/api/import/onedrive-status', (req, res) => {
  try {
    const filePath = findOneDriveExcelPath();
    if (filePath && fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      res.json({
        found: true,
        path: filePath,
        size: stats.size,
        lastModified: stats.mtime
      });
    } else {
      res.json({ found: false, path: null });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/import/onedrive', (req, res) => {
  try {
    const stats = importExcel();
    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/import/upload', upload.single('excelFile'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
    const stats = importExcel(req.file.path);
    // Remove temp file
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/export/excel', (req, res) => {
  try {
    const buffer = exportToExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Fumetti_Export.xlsx"');
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/export/json', (req, res) => {
  try {
    const data = exportToJson();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="Fumetti_Backup.json"');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Network information for mobile access (Local Wi-Fi + Global Remote Tunnel)
app.get('/api/network-info', (req, res) => {
  try {
    const interfaces = os.networkInterfaces();
    let localIp = '127.0.0.1';
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIp = iface.address;
          break;
        }
      }
      if (localIp !== '127.0.0.1') break;
    }

    const publicUrl = getTunnelUrl();
    const tunnelStatus = getTunnelStatus();

    res.json({
      localIp,
      port: PORT,
      localUrl: `http://${localIp}:${PORT}`,
      publicUrl,
      tunnelStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger tunnel start manually if needed
app.post('/api/tunnel/start', async (req, res) => {
  try {
    const url = await startTunnel(PORT);
    res.json({ success: true, url, status: getTunnelStatus() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve built frontend assets if present
const frontendDist = path.join(__dirname, '..', 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, {
    setHeaders: (res, filePath) => {
      // index.html and service worker should never be cached permanently
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(path.sep + 'assets' + path.sep)) {
        // Hashed JS/CSS assets can be safely cached long-term
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }
  }));

  app.use((req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Start Server on 0.0.0.0 for LAN/mobile access
const server = app.listen(PORT, '0.0.0.0', () => {
  let localIp = '127.0.0.1';
  try {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIp = iface.address;
          break;
        }
      }
      if (localIp !== '127.0.0.1') break;
    }
  } catch (e) {}

  console.log(`Comics Count API server running on:`);
  console.log(`- Locale (PC): http://localhost:${PORT}`);
  console.log(`- Rete Locale (Wi-Fi): http://${localIp}:${PORT}`);

  // Automatically initialize secure remote tunnel
  startTunnel(PORT).then(url => {
    if (url) {
      console.log(`- Accesso Remoto Globale (4G/5G/Fuori casa): ${url}`);
    }
  }).catch(e => console.error('[Tunnel] Errore:', e.message));
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Porta ${PORT} già occupata. Comics Count è già attivo.`);
  } else {
    console.error('Errore avvio server:', err.message);
  }
});
