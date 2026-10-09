const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { db, DATA_DIR, reopenDb, dbPath } = require('./db');
const { authMiddleware, generateToken } = require('./auth');
const { importExcel, findOneDriveExcelPath } = require('./excelImporter');
const { exportToExcel, exportToJson } = require('./excelExporter');
const { searchMetadata, downloadAndCacheCover, COVERS_DIR } = require('./metadataService');
const { startTunnel, getTunnelUrl, getTunnelStatus } = require('./tunnelService');
const {
  initCloudSync,
  scheduleSync,
  syncDatabaseNow,
  uploadCover,
  downloadCoverIfMissing,
  getSyncStatus
} = require('./cloudSync');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Recupero on-demand delle copertine da Cloud Storage se mancanti dal disco locale
app.get('/uploads/covers/:filename', async (req, res, next) => {
  const { filename } = req.params;
  const localFile = path.join(COVERS_DIR, filename);
  if (!fs.existsSync(localFile)) {
    try {
      const downloaded = await downloadCoverIfMissing(filename);
      if (downloaded && fs.existsSync(localFile)) {
        return res.sendFile(localFile);
      }
    } catch (e) {}
  }
  next();
});

// Serve uploaded covers statically
app.use('/uploads/covers', express.static(COVERS_DIR));

// Configure multer for file uploads
const uploadDir = path.join(DATA_DIR || __dirname, 'uploads', 'temp');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({ dest: uploadDir });

// -------------------------------------------------------------
// REAL-TIME SYNC (SSE - SERVER SENT EVENTS)
// -------------------------------------------------------------
// Map of userId -> Set of express res streams
const sseClients = new Map();

function broadcastSyncEvent(userId, eventType, data = {}) {
  // Salva automaticamente le modifiche nel Cloud (debounced a 3s)
  scheduleSync();

  const userSet = sseClients.get(Number(userId));
  if (!userSet || userSet.size === 0) return;

  const payload = JSON.stringify({ type: eventType, data, timestamp: Date.now() });
  const message = `event: sync\ndata: ${payload}\n\n`;

  for (const clientRes of userSet) {
    try {
      clientRes.write(message);
    } catch (err) {
      console.warn('Failed writing to SSE client:', err.message);
    }
  }
}

// -------------------------------------------------------------
// CLOUD SYNC & BACKUP STATUS ROUTES
// -------------------------------------------------------------
app.get('/api/cloud-sync/status', (req, res) => {
  res.json(getSyncStatus());
});

app.post('/api/cloud-sync/sync-now', async (req, res) => {
  try {
    await syncDatabaseNow();
    res.json(getSyncStatus());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// AUTHENTICATION ROUTES (LOGIN, REGISTER, ME)
// -------------------------------------------------------------

app.post('/api/auth/register', (req, res) => {
  try {
    const { username, email, password, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username e Password sono obbligatori' });
    }

    if (username.trim().length < 3) {
      return res.status(400).json({ error: 'Lo username deve avere almeno 3 caratteri' });
    }

    if (password.length < 4) {
      return res.status(400).json({ error: 'La password deve avere almeno 4 caratteri' });
    }

    const cleanUsername = username.trim();
    const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(cleanUsername);
    if (existing) {
      return res.status(409).json({ error: 'Questo Username è già registrato' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);

    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, display_name)
      VALUES (?, ?, ?, ?)
    `).run(cleanUsername, email ? email.trim() : null, hash, displayName || cleanUsername);

    const newUser = {
      id: result.lastInsertRowid,
      username: cleanUsername,
      display_name: displayName || cleanUsername
    };

    const token = generateToken(newUser);
    scheduleSync(1000);
    res.json({
      user: newUser,
      token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Inserisci username e password' });
    }

    const cleanUsername = username.trim();
    const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE OR email = ? COLLATE NOCASE')
      .get(cleanUsername, cleanUsername);

    if (!user) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }

    const safeUser = {
      id: user.id,
      username: user.username,
      display_name: user.display_name || user.username
    };

    const token = generateToken(safeUser);
    res.json({
      user: safeUser,
      token
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/reset-password', (req, res) => {
  try {
    const { username, email, newPassword } = req.body;
    if (!username || !email || !newPassword) {
      return res.status(400).json({ error: 'Inserisci Username, Email associata e Nuova Password' });
    }

    if (newPassword.length < 4) {
      return res.status(400).json({ error: 'La nuova password deve avere almeno 4 caratteri' });
    }

    const cleanUsername = username.trim();
    const cleanEmail = email.trim();

    const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE AND email = ? COLLATE NOCASE')
      .get(cleanUsername, cleanEmail);

    if (!user) {
      return res.status(404).json({ error: 'Nessun account trovato corrispondente a questo Username ed Email' });
    }

    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);

    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    scheduleSync(1000);

    res.json({ success: true, message: 'Password aggiornata con successo! Ora puoi effettuare l\'accesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// -------------------------------------------------------------
// COMICS ROUTES (MULTI-USER)
// -------------------------------------------------------------

app.get('/api/comics', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month, publisherId, status, channel, search } = req.query;
    let query = `
      SELECT 
        c.*, 
        p.name AS publisher_name, 
        p.color AS publisher_color
      FROM comics c
      LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE c.user_id = ?
    `;
    const params = [userId];

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

app.post('/api/comics', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      title, series, issue_number, variant_info, publisher_id,
      year, month, release_date, purchase_date, cover_price,
      purchase_price, isbn, ean, upc, cover_url, status, channel, notes
    } = req.body;

    if (!title || !year || !month) {
      return res.status(400).json({ error: 'Titolo, Anno e Mese sono obbligatori' });
    }

    let localCoverPath = null;
    if (cover_url && String(cover_url).startsWith('http')) {
      try {
        localCoverPath = await downloadAndCacheCover(cover_url, 'new');
      } catch (err) {
        console.warn('Cover download skipped:', err.message);
      }
    }

    const cleanCoverPrice = Number(String(cover_price ?? 0).replace(',', '.')) || 0;
    const cleanPurchasePrice = Number(String(purchase_price ?? 0).replace(',', '.')) || 0;

    const stmt = db.prepare(`
      INSERT INTO comics (
        user_id, title, series, issue_number, variant_info, publisher_id,
        year, month, release_date, purchase_date, cover_price,
        purchase_price, isbn, ean, upc, cover_url, local_cover_path,
        status, channel, notes
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    const result = stmt.run(
      userId, 
      title ? String(title).trim() : null, 
      series ? String(series).trim() : null, 
      issue_number ? String(issue_number).trim() : null, 
      variant_info ? String(variant_info).trim() : null, 
      publisher_id ? Number(publisher_id) : null,
      String(year), 
      String(month), 
      release_date || null, 
      purchase_date || null, 
      cleanCoverPrice,
      cleanPurchasePrice, 
      isbn ? String(isbn).trim() : null, 
      ean ? String(ean).trim() : null, 
      upc ? String(upc).trim() : null,
      cover_url || null, 
      localCoverPath, 
      status || 'Acquistato', 
      channel || 'Fumetteria', 
      notes || null
    );

    const created = db.prepare(`
      SELECT c.*, p.name AS publisher_name, p.color AS publisher_color
      FROM comics c LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE c.id = ? AND c.user_id = ?
    `).get(result.lastInsertRowid, userId);

    broadcastSyncEvent(userId, 'comic_created', { comic: created });
    res.json(created);
  } catch (e) {
    console.error('Error creating comic:', e);
    res.status(500).json({ error: e.message || 'Errore nella creazione del fumetto' });
  }
});

app.put('/api/comics/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const rawId = req.params.id;
    const id = Number(rawId);

    if (!id || isNaN(id)) {
      return res.status(400).json({ error: 'ID fumetto non valido' });
    }

    const {
      title, series, issue_number, variant_info, publisher_id,
      year, month, release_date, purchase_date, cover_price,
      purchase_price, isbn, ean, upc, cover_url, status, channel, notes
    } = req.body;

    // Verify ownership
    const existing = db.prepare('SELECT id, cover_url, local_cover_path FROM comics WHERE id = ? AND user_id = ?').get(id, userId);
    if (!existing) {
      return res.status(404).json({ error: 'Fumetto non trovato o non accessibile' });
    }

    const coverUrlChanged = (cover_url || null) !== (existing.cover_url || null);
    let localCoverPath = req.body.local_cover_path !== undefined ? req.body.local_cover_path : existing.local_cover_path;

    // If cover_url changed and is a valid external URL, or localCoverPath was cleared
    if (cover_url && String(cover_url).startsWith('http') && (coverUrlChanged || !localCoverPath || !localCoverPath.includes('cover_'))) {
      try {
        const cached = await downloadAndCacheCover(cover_url, id);
        if (cached) localCoverPath = cached;
      } catch (err) {
        console.warn('Cover download skipped:', err.message);
      }
    } else if (!cover_url && !req.body.local_cover_path) {
      // If user deliberately removed the cover
      localCoverPath = null;
    }

    const cleanCoverPrice = Number(String(cover_price ?? 0).replace(',', '.')) || 0;
    const cleanPurchasePrice = Number(String(purchase_price ?? 0).replace(',', '.')) || 0;

    const stmt = db.prepare(`
      UPDATE comics SET
        title = ?, series = ?, issue_number = ?, variant_info = ?, publisher_id = ?,
        year = ?, month = ?, release_date = ?, purchase_date = ?, cover_price = ?,
        purchase_price = ?, isbn = ?, ean = ?, upc = ?, cover_url = ?,
        local_cover_path = ?, status = ?, channel = ?,
        notes = ?, updated_at = datetime('now')
      WHERE id = ? AND user_id = ?
    `);

    stmt.run(
      title ? String(title).trim() : null,
      series ? String(series).trim() : null,
      issue_number ? String(issue_number).trim() : null,
      variant_info ? String(variant_info).trim() : null,
      publisher_id ? Number(publisher_id) : null,
      year ? String(year) : '2026',
      month ? String(month) : 'Gennaio',
      release_date || null,
      purchase_date || null,
      cleanCoverPrice,
      cleanPurchasePrice,
      isbn ? String(isbn).trim() : null,
      ean ? String(ean).trim() : null,
      upc ? String(upc).trim() : null,
      cover_url || null,
      localCoverPath,
      status || 'Acquistato',
      channel || 'Fumetteria',
      notes || null,
      id,
      userId
    );

    const updated = db.prepare(`
      SELECT c.*, p.name AS publisher_name, p.color AS publisher_color
      FROM comics c LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE c.id = ? AND c.user_id = ?
    `).get(id, userId);

    broadcastSyncEvent(userId, 'comic_updated', { comic: updated });
    res.json(updated);
  } catch (e) {
    console.error('Error updating comic:', e);
    res.status(500).json({ error: e.message || 'Errore durante l\'aggiornamento del fumetto' });
  }
});

app.patch('/api/comics/:id/status', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.body;
    db.prepare("UPDATE comics SET status = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
      .run(status, req.params.id, userId);
    
    broadcastSyncEvent(userId, 'comic_status_changed', { id: Number(req.params.id), status });
    res.json({ success: true, id: req.params.id, status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/comics/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    db.prepare('DELETE FROM comics WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    broadcastSyncEvent(userId, 'comic_deleted', { id: Number(req.params.id) });
    res.json({ success: true, id: req.params.id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// All purchased comics across years for readings search
app.get('/api/comics/purchased', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
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
      WHERE c.user_id = ?
        AND c.title NOT LIKE 'HVC Ordine Totale%'
        AND c.title NOT LIKE 'Totale Ordine%'
    `;
    const params = [userId];

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
    scheduleSync();
    res.json({ id: result.lastInsertRowid, name, color, description });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// SALES / REFUNDS (MULTI-USER)
// -------------------------------------------------------------

app.get('/api/sales', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.query;
    let query = 'SELECT * FROM sales_refunds WHERE user_id = ?';
    const params = [userId];
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

app.post('/api/sales', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month, title, price, channel, notes } = req.body;
    const stmt = db.prepare('INSERT INTO sales_refunds (user_id, year, month, title, price, channel, notes) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(userId, year, month || null, title, Number(price) || 0, channel || 'Vinted', notes || null);
    const item = { id: result.lastInsertRowid, year, month, title, price, channel, notes };
    broadcastSyncEvent(userId, 'sales_updated', { item });
    res.json(item);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/sales/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    db.prepare('DELETE FROM sales_refunds WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    broadcastSyncEvent(userId, 'sales_updated', { id: Number(req.params.id) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// ORDERS & READINGS (MULTI-USER)
// -------------------------------------------------------------

app.get('/api/orders', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { year } = req.query;
    let query = 'SELECT * FROM orders WHERE user_id = ?';
    const params = [userId];
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

app.post('/api/orders', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { store_name, title, items_count, total_price, year, month, status, notes } = req.body;
    const stmt = db.prepare('INSERT INTO orders (user_id, store_name, title, items_count, total_price, year, month, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(userId, store_name, title, items_count || 1, Number(total_price) || 0, year || '2026', month || null, status || 'Completato', notes || null);
    const order = { id: result.lastInsertRowid, ...req.body };
    broadcastSyncEvent(userId, 'orders_updated', { order });
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/orders/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    db.prepare('DELETE FROM orders WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    broadcastSyncEvent(userId, 'orders_updated', { id: Number(req.params.id) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/readings', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
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
      WHERE r.user_id = ?
    `;
    const params = [userId];
    if (year && year !== 'all') { query += ' AND r.year = ?'; params.push(year); }
    if (month && month !== 'all') { query += ' AND r.month = ?'; params.push(month); }
    query += ' ORDER BY r.id DESC';
    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/readings', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { comic_id, title, year, month, category, rating, notes, read_date } = req.body;
    const stmt = db.prepare('INSERT INTO readings (user_id, comic_id, title, year, month, category, rating, notes, read_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const result = stmt.run(userId, comic_id || null, title, year, month, category || 'Altro', rating || null, notes || null, read_date || null);

    if (comic_id) {
      db.prepare("UPDATE comics SET status = 'Letto', updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(comic_id, userId);
      broadcastSyncEvent(userId, 'comic_status_changed', { id: Number(comic_id), status: 'Letto' });
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
      WHERE r.id = ? AND r.user_id = ?
    `).get(result.lastInsertRowid, userId);

    broadcastSyncEvent(userId, 'readings_updated', { reading: created });
    res.json(created);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/readings/:id', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    db.prepare('DELETE FROM readings WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    broadcastSyncEvent(userId, 'readings_updated', { id: Number(req.params.id) });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// BUDGETS (MULTI-USER)
// -------------------------------------------------------------

app.get('/api/budgets', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const budgets = db.prepare('SELECT * FROM monthly_budgets WHERE user_id = ?').all(userId);
    res.json(budgets);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/budgets', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month, budget_amount } = req.body;
    db.prepare(`
      INSERT INTO monthly_budgets (user_id, year, month, budget_amount)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id, year, month) DO UPDATE SET budget_amount = excluded.budget_amount
    `).run(userId, year, month, Number(budget_amount) || 0);
    broadcastSyncEvent(userId, 'budget_updated', { year, month, budget_amount });
    res.json({ success: true, year, month, budget_amount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// ACCOUNTING & STATISTICS (MULTI-USER)
// -------------------------------------------------------------

app.get('/api/stats/summary', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.query;
    const currentYear = year || '2026';
    const currentMonth = month || 'Gennaio';

    // Monthly spent
    const monthlySpentRow = db.prepare(`
      SELECT 
        ROUND(SUM(purchase_price), 2) AS spent,
        COUNT(id) AS count,
        SUM(CASE WHEN status = 'Letto' THEN 1 ELSE 0 END) AS read_count
      FROM comics
      WHERE user_id = ? AND year = ? AND month = ?
    `).get(userId, currentYear, currentMonth) || {};

    // Annual spent
    const annualSpentRow = db.prepare(`
      SELECT 
        ROUND(SUM(purchase_price), 2) AS spent,
        COUNT(id) AS count
      FROM comics
      WHERE user_id = ? AND year = ?
    `).get(userId, currentYear) || {};

    // Annual sales / refunds
    const annualSalesRow = db.prepare(`
      SELECT ROUND(SUM(price), 2) AS sales
      FROM sales_refunds
      WHERE user_id = ? AND year = ?
    `).get(userId, currentYear) || {};

    // Monthly sales / refunds
    const monthlySalesRow = db.prepare(`
      SELECT ROUND(SUM(price), 2) AS sales
      FROM sales_refunds
      WHERE user_id = ? AND year = ? AND month = ?
    `).get(userId, currentYear, currentMonth) || {};

    // Monthly budget
    const budgetRow = db.prepare(`
      SELECT budget_amount FROM monthly_budgets
      WHERE user_id = ? AND year = ? AND month = ?
    `).get(userId, currentYear, currentMonth) || {};

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

app.get('/api/stats/publishers', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.query;
    let query = `
      SELECT 
        COALESCE(p.name, 'Altro') AS name,
        COALESCE(p.color, '#6366f1') AS color,
        ROUND(SUM(c.purchase_price), 2) AS total,
        COUNT(c.id) AS count
      FROM comics c
      LEFT JOIN publishers p ON c.publisher_id = p.id
      WHERE c.user_id = ?
    `;
    const params = [userId];
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

app.get('/api/stats/monthly-trends', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const { year } = req.query;
    const targetYear = year || '2026';

    const months = [
      'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
      'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];

    const comicRows = db.prepare(`
      SELECT month, ROUND(SUM(purchase_price), 2) as spent, COUNT(id) as count
      FROM comics
      WHERE user_id = ? AND year = ?
      GROUP BY month
    `).all(userId, targetYear);

    const budgetRows = db.prepare(`
      SELECT month, budget_amount FROM monthly_budgets WHERE user_id = ? AND year = ?
    `).all(userId, targetYear);

    const salesRows = db.prepare(`
      SELECT month, ROUND(SUM(price), 2) as sales
      FROM sales_refunds
      WHERE user_id = ? AND year = ?
      GROUP BY month
    `).all(userId, targetYear);

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

app.get('/api/stats/yearly-comparison', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const years = ['2023', '2024', '2025', '2026', '2027'];
    const rows = years.map(y => {
      const c = db.prepare('SELECT ROUND(SUM(purchase_price), 2) as spent, COUNT(id) as count FROM comics WHERE user_id = ? AND year = ?').get(userId, y) || {};
      const s = db.prepare('SELECT ROUND(SUM(price), 2) as sales FROM sales_refunds WHERE user_id = ? AND year = ?').get(userId, y) || {};
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

app.post('/api/metadata/save-cover', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { imageUrl, comicId } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'URL immagine mancante' });

    const localPath = await downloadAndCacheCover(imageUrl, comicId || 'manual');
    if (!localPath) return res.status(500).json({ error: 'Impossibile scaricare immagine' });

    if (comicId) {
      db.prepare("UPDATE comics SET cover_url = ?, local_cover_path = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
        .run(imageUrl, localPath, comicId, userId);
      broadcastSyncEvent(userId, 'comic_updated', { id: Number(comicId), cover_url: imageUrl, local_cover_path: localPath });
    } else {
      scheduleSync();
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

    // Carica copertina nel Cloud Storage se attivo
    uploadCover(finalName, target).catch(() => {});

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
app.post('/api/comics/:id/enrich-hvc', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const comic = db.prepare('SELECT * FROM comics WHERE id = ? AND user_id = ?').get(req.params.id, userId);
    if (!comic) return res.status(404).json({ error: 'Fumetto non trovato' });

    const results = await searchMetadata(comic.title, comic.issue_number || '', '');
    if (results && results.length > 0) {
      const best = results[0];
      let localCover = null;
      if (best.coverUrl) {
        localCover = await downloadAndCacheCover(best.coverUrl, comic.id);
      }

      const foundPrice = best.price || best.coverPrice || null;
      const foundCoverPrice = best.coverPrice || best.price || null;

      db.prepare(`
        UPDATE comics SET
          isbn = COALESCE(?, isbn),
          ean = COALESCE(?, ean),
          cover_url = COALESCE(?, cover_url),
          local_cover_path = COALESCE(?, local_cover_path),
          cover_price = CASE WHEN (cover_price = 0 OR cover_price IS NULL) AND ? IS NOT NULL THEN ? ELSE cover_price END,
          purchase_price = CASE WHEN (purchase_price = 0 OR purchase_price IS NULL) AND ? IS NOT NULL THEN ? ELSE purchase_price END,
          notes = CASE 
            WHEN ? IS NOT NULL AND (notes IS NULL OR notes NOT LIKE '%Prezzo di listino:%')
            THEN COALESCE(notes || ' | ', '') || 'Prezzo di listino: €' || ?
            ELSE notes 
          END,
          updated_at = datetime('now')
        WHERE id = ? AND user_id = ?
      `).run(
        best.isbn || best.ean,
        best.ean || best.isbn,
        best.coverUrl,
        localCover,
        foundCoverPrice,
        foundCoverPrice,
        foundPrice,
        foundPrice,
        foundPrice,
        foundPrice,
        comic.id,
        userId
      );

      const updated = db.prepare('SELECT * FROM comics WHERE id = ? AND user_id = ?').get(comic.id, userId);
      return res.json({ success: true, enriched: true, comic: updated });
    }
    res.json({ success: true, enriched: false, message: 'Nessun metadato trovato' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/comics/batch-enrich-hvc', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { year, month } = req.body;
    let query = 'SELECT * FROM comics WHERE user_id = ? AND (cover_url IS NULL OR local_cover_path IS NULL OR isbn IS NULL OR purchase_price = 0 OR purchase_price IS NULL)';
    const params = [userId];
    if (year) { query += ' AND year = ?'; params.push(year); }
    if (month) { query += ' AND month = ?'; params.push(month); }

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
          const foundPrice = best.price || best.coverPrice || null;
          const foundCoverPrice = best.coverPrice || best.price || null;

          db.prepare(`
            UPDATE comics SET
              isbn = COALESCE(?, isbn),
              ean = COALESCE(?, ean),
              cover_url = COALESCE(?, cover_url),
              local_cover_path = COALESCE(?, local_cover_path),
              cover_price = CASE WHEN (cover_price = 0 OR cover_price IS NULL) AND ? IS NOT NULL THEN ? ELSE cover_price END,
              purchase_price = CASE WHEN (purchase_price = 0 OR purchase_price IS NULL) AND ? IS NOT NULL THEN ? ELSE purchase_price END,
              updated_at = datetime('now')
            WHERE id = ? AND user_id = ?
          `).run(
            best.isbn || best.ean,
            best.ean || best.isbn,
            best.coverUrl,
            localCover,
            foundCoverPrice,
            foundCoverPrice,
            foundPrice,
            foundPrice,
            c.id,
            userId
          );
          enriched++;
        }
        await new Promise(r => setTimeout(r, 400));
      } catch (err) {
        console.error(`Error enriching ${c.title}:`, err.message);
      }
    }

    res.json({ success: true, processed: comics.length, enriched });
    if (enriched > 0) {
      broadcastSyncEvent(userId, 'batch_enriched', { count: enriched, year, month });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// -------------------------------------------------------------
// IMPORT & EXPORT (MULTI-USER)
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

app.post('/api/import/onedrive', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const stats = importExcel(null, userId);
    broadcastSyncEvent(userId, 'data_imported', { stats });
    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/import/upload', authMiddleware, upload.single('excelFile'), (req, res) => {
  try {
    const userId = req.user.id;
    if (!req.file) return res.status(400).json({ error: 'Nessun file caricato' });
    const stats = importExcel(req.file.path, userId);
    try { fs.unlinkSync(req.file.path); } catch (e) {}
    broadcastSyncEvent(userId, 'data_imported', { stats });
    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/export/excel', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const buffer = exportToExcel(userId);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Fumetti_Export.xlsx"');
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/export/json', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const data = exportToJson(userId);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename="Fumetti_Backup.json"');
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// SSE Real-time events stream
app.get('/api/sync/events', authMiddleware, (req, res) => {
  const userId = Number(req.user.id);

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no' // Prevent Nginx/Render buffering
  });

  // Add client to user's subscriber set
  if (!sseClients.has(userId)) {
    sseClients.set(userId, new Set());
  }
  const userSet = sseClients.get(userId);
  userSet.add(res);

  // Send initial ping to confirm connection
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, connectedAt: Date.now() })}\n\n`);

  // Keep-alive heartbeat every 25 seconds
  const heartbeat = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 25000);

  // Clean up when client disconnects
  req.on('close', () => {
    clearInterval(heartbeat);
    if (userSet) {
      userSet.delete(res);
      if (userSet.size === 0) {
        sseClients.delete(userId);
      }
    }
  });
});

// Network information for mobile access
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
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(path.sep + 'assets' + path.sep)) {
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

// Start Server
const server = app.listen(PORT, '0.0.0.0', async () => {
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

  // Inizializza Cloud Sync all'avvio (scarica il database aggiornato dal Cloud)
  try {
    await initCloudSync({
      db,
      dbPath,
      reopenDb,
      coversDir: COVERS_DIR
    });
  } catch (e) {
    console.warn('[CloudSync] Errore inizializzazione:', e.message);
  }

  startTunnel(PORT).then(url => {
    if (url) {
      console.log(`- Accesso Remoto Globale (4G/5G/Fuori casa): ${url}`);
    }
  }).catch(e => console.error('[Tunnel] Errore:', e.message));
});

// Chiusura pulita: esegue il salvataggio finale sul Cloud e il checkpoint del WAL
async function shutdown() {
  console.log('[Server] Ricevuto segnale di arresto, salvataggio finale nel cloud...');
  try {
    await syncDatabaseNow();
  } catch (e) {
    console.warn('[CloudSync] Errore salvataggio finale:', e.message);
  }
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    console.log('[DB] Database salvato e chiuso correttamente.');
  } catch (e) {
    console.warn('[DB] Errore chiusura database:', e.message);
  }
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`Porta ${PORT} già occupata. Comics Count è già attivo.`);
  } else {
    console.error('Errore avvio server:', err.message);
  }
});
