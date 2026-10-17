const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');
const bcrypt = require('bcryptjs');

// Cartella dei dati persistenti.
// In locale resta la cartella del progetto; su Render va impostata la variabile
// d'ambiente DATA_DIR sul percorso del Persistent Disk (es. /var/data),
// altrimenti il database viene azzerato a ogni riavvio/deploy.
let DATA_DIR = process.env.DATA_DIR || __dirname;
try {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.accessSync(DATA_DIR, fs.constants.W_OK);
} catch (err) {
  console.warn(`[DB] Cartella ${DATA_DIR} non utilizzabile (${err.message}). Uso la cartella del progetto.`);
  DATA_DIR = __dirname;
}

const dbPath = process.env.DB_PATH || path.join(DATA_DIR, 'comics_count.db');

function isValidSqliteFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    const stat = fs.statSync(filePath);
    if (stat.size < 100) return false;
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    return buf.toString('utf8') === 'SQLite format 3\0';
  } catch (e) {
    return false;
  }
}

/**
 * Ispettore sicuro su file temporaneo di un Buffer SQLite:
 * verifica PRAGMA integrity_check e restituisce il conteggio dei fumetti e i timestamp più recenti.
 */
function inspectSqliteBuffer(buf) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 100) {
    return { valid: false, error: 'Buffer vuoto o troppo piccolo' };
  }
  if (buf.subarray(0, 16).toString('utf8') !== 'SQLite format 3\0') {
    return { valid: false, error: 'Header SQLite non valido' };
  }

  const tmpFile = path.join(os.tmpdir(), `cc_inspect_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
  let tmpDb = null;
  try {
    fs.writeFileSync(tmpFile, buf);
    tmpDb = new Database(tmpFile, { readonly: true });
    const ic = tmpDb.pragma('integrity_check');
    const isOk = Array.isArray(ic) && ic.length === 1 && ic[0].integrity_check === 'ok';
    if (!isOk) {
      return { valid: false, error: `Integrity check fallito: ${JSON.stringify(ic)}` };
    }

    const cRow = tmpDb.prepare('SELECT COUNT(*) as c, COALESCE(MAX(id), 0) as maxId, MAX(created_at) as maxCreated, MAX(updated_at) as maxUpdated FROM comics').get();
    let salesCount = 0;
    let readingsCount = 0;
    let usersCount = 0;
    try {
      const sRow = tmpDb.prepare('SELECT COUNT(*) as c FROM sales_refunds').get();
      salesCount = sRow ? sRow.c : 0;
    } catch (e) {}
    try {
      const rRow = tmpDb.prepare('SELECT COUNT(*) as c FROM readings').get();
      readingsCount = rRow ? rRow.c : 0;
    } catch (e) {}
    try {
      const uRow = tmpDb.prepare('SELECT COUNT(*) as c FROM users').get();
      usersCount = uRow ? uRow.c : 0;
    } catch (e) {}

    return {
      valid: true,
      sizeBytes: buf.length,
      comicsCount: cRow ? cRow.c : 0,
      maxComicId: cRow ? cRow.maxId : 0,
      maxCreatedAt: cRow ? cRow.maxCreated : null,
      maxUpdatedAt: cRow ? cRow.maxUpdated : null,
      salesCount,
      readingsCount,
      usersCount
    };
  } catch (err) {
    return { valid: false, error: err.message };
  } finally {
    try { if (tmpDb) tmpDb.close(); } catch (e) {}
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) {}
    try { if (fs.existsSync(tmpFile + '-wal')) fs.unlinkSync(tmpFile + '-wal'); } catch (e) {}
    try { if (fs.existsSync(tmpFile + '-shm')) fs.unlinkSync(tmpFile + '-shm'); } catch (e) {}
  }
}

function removeWalFiles(targetDbPath) {
  try {
    if (fs.existsSync(targetDbPath + '-wal')) fs.unlinkSync(targetDbPath + '-wal');
  } catch (e) {
    console.warn(`[DB] Impossibile rimuovere ${targetDbPath}-wal:`, e.message);
  }
  try {
    if (fs.existsSync(targetDbPath + '-shm')) fs.unlinkSync(targetDbPath + '-shm');
  } catch (e) {
    console.warn(`[DB] Impossibile rimuovere ${targetDbPath}-shm:`, e.message);
  }
}

// Primo avvio o ripristino se corrotto: parte da una copia del database incluso nel repository
const seedPath = path.join(__dirname, 'comics_count.db');
if (fs.existsSync(seedPath)) {
  if (!fs.existsSync(dbPath) || !isValidSqliteFile(dbPath)) {
    if (path.resolve(seedPath) !== path.resolve(dbPath)) {
      removeWalFiles(dbPath);
      fs.copyFileSync(seedPath, dbPath);
      console.log(`[DB] Database valido ripristinato da seed in ${dbPath}`);
    }
  }
}
console.log(`[DB] Uso database: ${dbPath}`);

let currentDb;
try {
  currentDb = new Database(dbPath);
  const ic = currentDb.pragma('integrity_check');
  const isOk = Array.isArray(ic) && ic.length === 1 && ic[0].integrity_check === 'ok';
  if (!isOk) {
    throw new Error('Integrity check fallito all\'avvio');
  }
} catch (dbErr) {
  console.warn(`[DB] Errore apertura ${dbPath} (${dbErr.message}). Pulizia WAL e nuovo tentativo...`);
  try { if (currentDb) currentDb.close(); } catch (e) {}
  removeWalFiles(dbPath);
  if (fs.existsSync(seedPath) && path.resolve(seedPath) !== path.resolve(dbPath)) {
    fs.copyFileSync(seedPath, dbPath);
  }
  currentDb = new Database(dbPath);
}
currentDb.pragma('journal_mode = WAL');
currentDb.pragma('foreign_keys = ON');

function checkDatabaseHealth() {
  try {
    if (!currentDb) return { healthy: false, error: 'Database non aperto' };
    const ic = currentDb.pragma('integrity_check');
    const isOk = Array.isArray(ic) && ic.length === 1 && ic[0].integrity_check === 'ok';
    if (!isOk) {
      return { healthy: false, error: `Integrity check: ${JSON.stringify(ic)}` };
    }
    const cRow = currentDb.prepare('SELECT COUNT(*) as c, COALESCE(MAX(id), 0) as maxId, MAX(created_at) as maxCreated, MAX(updated_at) as maxUpdated FROM comics').get();
    let usersSummary = [];
    try {
      usersSummary = currentDb.prepare(`
        SELECT u.id, u.username, u.email, u.display_name, u.created_at,
          (SELECT COUNT(*) FROM comics c WHERE c.user_id = u.id) as comicsCount,
          (SELECT COUNT(*) FROM sales_refunds s WHERE s.user_id = u.id) as salesCount,
          (SELECT COUNT(*) FROM readings r WHERE r.user_id = u.id) as readingsCount
        FROM users u
      `).all();
    } catch (e) {}
    return {
      healthy: true,
      comicsCount: cRow ? cRow.c : 0,
      maxComicId: cRow ? cRow.maxId : 0,
      maxCreatedAt: cRow ? cRow.maxCreated : null,
      maxUpdatedAt: cRow ? cRow.maxUpdated : null,
      usersSummary
    };
  } catch (err) {
    return { healthy: false, error: err.message };
  }
}

function readVarint(buf, offset) {
  let val = 0;
  for (let i = 0; i < 8; i++) {
    const b = buf[offset + i];
    val = (val * 128) + (b & 0x7f);
    if ((b & 0x80) === 0) return { val, len: i + 1 };
  }
  const b = buf[offset + 8];
  val = (val * 256) + b;
  return { val, len: 9 };
}

function decodeSerialValue(buf, offset, st) {
  if (st === 0) return { val: null, len: 0 };
  if (st === 1) return { val: buf.readInt8(offset), len: 1 };
  if (st === 2) return { val: buf.readInt16BE(offset), len: 2 };
  if (st === 3) {
    let v = (buf[offset] << 16) | (buf[offset + 1] << 8) | buf[offset + 2];
    if (v & 0x800000) v |= 0xff000000;
    return { val: v, len: 3 };
  }
  if (st === 4) return { val: buf.readInt32BE(offset), len: 4 };
  if (st === 5) return { val: Number(buf.readBigInt64BE(offset - 2) & 0xffffffffffffn), len: 6 };
  if (st === 6) return { val: Number(buf.readBigInt64BE(offset)), len: 8 };
  if (st === 7) return { val: buf.readDoubleBE(offset), len: 8 };
  if (st === 8) return { val: 0, len: 0 };
  if (st === 9) return { val: 1, len: 0 };
  if (st >= 12 && st % 2 === 0) {
    const len = (st - 12) / 2;
    return { val: buf.subarray(offset, offset + len), len };
  }
  if (st >= 13 && st % 2 === 1) {
    const len = (st - 13) / 2;
    return { val: buf.subarray(offset, offset + len).toString('utf8'), len };
  }
  return { val: null, len: 0 };
}

/**
 * Estrae tutti i record leggibili anche da un buffer SQLite parzialmente corrotto,
 * combinando scansioni per indice primario (ASC/DESC/point lookup) e carving diretto delle pagine foglia B-Tree (0x0d).
 */
function salvageFromBuffer(buf) {
  const tables = {
    users: new Map(),
    publishers: new Map(),
    comics: new Map(),
    sales_refunds: new Map(),
    readings: new Map(),
    orders: new Map()
  };

  if (!buf || !Buffer.isBuffer(buf) || buf.length < 100) {
    return { users: [], publishers: [], comics: [], sales_refunds: [], readings: [], orders: [] };
  }

  const tmpFile = path.join(os.tmpdir(), `cc_salvage_${Date.now()}_${Math.random().toString(36).slice(2)}.db`);
  let tmpDb = null;
  try {
    fs.writeFileSync(tmpFile, buf);
    tmpDb = new Database(tmpFile, { readonly: true });

    const tableMaxIds = {
      users: 100,
      publishers: 100,
      comics: 3000,
      sales_refunds: 500,
      readings: 500,
      orders: 500
    };

    for (const [tName, maxId] of Object.entries(tableMaxIds)) {
      const map = tables[tName];
      // 1. Scansione inversa (parte dalle righe più recenti alla fine del B-Tree)
      try {
        const stmt = tmpDb.prepare(`SELECT * FROM ${tName} ORDER BY id DESC`);
        for (const row of stmt.iterate()) {
          if (row && row.id != null) map.set(row.id, row);
        }
      } catch (e) {}

      // 2. Scansione diretta (parte dalle prime righe all'inizio del B-Tree)
      try {
        const stmt = tmpDb.prepare(`SELECT * FROM ${tName} ORDER BY id ASC`);
        for (const row of stmt.iterate()) {
          if (row && row.id != null) map.set(row.id, row);
        }
      } catch (e) {}

      // 3. Point lookup per singolo ID
      let getByIdStmt = null;
      try {
        getByIdStmt = tmpDb.prepare(`SELECT * FROM ${tName} WHERE id = ?`);
      } catch (e) {}

      if (getByIdStmt) {
        for (let id = 1; id <= maxId; id++) {
          if (map.has(id)) continue;
          try {
            const row = getByIdStmt.get(id);
            if (row && row.id != null) map.set(row.id, row);
          } catch (e) {}
        }
      }
    }
  } catch (e) {
    // Continua con il carving diretto delle pagine
  } finally {
    try { if (tmpDb) tmpDb.close(); } catch (e) {}
    try { if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile); } catch (e) {}
    try { if (fs.existsSync(tmpFile + '-wal')) fs.unlinkSync(tmpFile + '-wal'); } catch (e) {}
    try { if (fs.existsSync(tmpFile + '-shm')) fs.unlinkSync(tmpFile + '-shm'); } catch (e) {}
  }

  // 4. Carving diretto a basso livello dalle pagine foglia B-Tree (0x0d)
  try {
    let pageSize = buf.readUInt16BE(16);
    if (pageSize === 1) pageSize = 65536;
    const usableSize = pageSize - buf.readUInt8(20);
    const maxLocal = usableSize - 35;
    const numPages = Math.floor(buf.length / pageSize);

    const legacyComicCols = [
      'id', 'title', 'series', 'issue_number', 'variant_info', 'publisher_id',
      'year', 'month', 'release_date', 'purchase_date', 'cover_price', 'purchase_price',
      'isbn', 'ean', 'upc', 'cover_url', 'local_cover_path', 'status',
      'channel', 'notes', 'created_at', 'updated_at', 'user_id'
    ];
    const freshComicCols = [
      'id', 'user_id', 'title', 'series', 'issue_number', 'variant_info', 'publisher_id',
      'year', 'month', 'release_date', 'purchase_date', 'cover_price', 'purchase_price',
      'isbn', 'ean', 'upc', 'cover_url', 'local_cover_path', 'status',
      'channel', 'notes', 'created_at', 'updated_at'
    ];

    for (let p = 0; p < numPages; p++) {
      const pageOff = p * pageSize;
      const hdrOff = p === 0 ? 100 : 0;
      if (buf[pageOff + hdrOff] !== 0x0d) continue;
      const cellCount = buf.readUInt16BE(pageOff + hdrOff + 3);

      for (let c = 0; c < cellCount; c++) {
        try {
          const cellPtr = buf.readUInt16BE(pageOff + hdrOff + 8 + c * 2);
          if (cellPtr === 0 || pageOff + cellPtr >= buf.length) continue;
          let pos = pageOff + cellPtr;
          const pSize = readVarint(buf, pos); pos += pSize.len;
          if (pSize.val > maxLocal) continue; // Salta record con overflow multi-pagina già letti via SQL
          const rowId = readVarint(buf, pos); pos += rowId.len;
          const hdrStart = pos;
          const hdrSize = readVarint(buf, pos); pos += hdrSize.len;
          if (hdrSize.val <= 0 || hdrSize.val > 500) continue;

          const serialTypes = [];
          while (pos < hdrStart + hdrSize.val && pos < buf.length) {
            const st = readVarint(buf, pos);
            serialTypes.push(st.val);
            pos += st.len;
          }

          const vals = [];
          for (const st of serialTypes) {
            const dec = decodeSerialValue(buf, pos, st);
            vals.push(dec.val);
            pos += dec.len;
          }

          // Caso comics (23 colonne)
          if (serialTypes.length === 23 && !tables.comics.has(rowId.val)) {
            const cols = typeof vals[1] === 'string' ? legacyComicCols : freshComicCols;
            const obj = {};
            for (let k = 0; k < 23; k++) {
              obj[cols[k]] = k === 0 ? rowId.val : vals[k];
            }
            if (obj.title && typeof obj.title === 'string') {
              tables.comics.set(rowId.val, obj);
            }
          }
          // Caso users (6 colonne con hash bcrypt)
          else if (serialTypes.length === 6 && !tables.users.has(rowId.val)) {
            if (typeof vals[1] === 'string' && typeof vals[3] === 'string' && vals[3].startsWith('$2')) {
              tables.users.set(rowId.val, {
                id: rowId.val,
                username: vals[1],
                email: vals[2],
                password_hash: vals[3],
                display_name: vals[4],
                created_at: vals[5]
              });
            }
          }
        } catch (cellErr) {}
      }
    }
  } catch (carveErr) {}

  return {
    users: Array.from(tables.users.values()),
    publishers: Array.from(tables.publishers.values()),
    comics: Array.from(tables.comics.values()),
    sales_refunds: Array.from(tables.sales_refunds.values()),
    readings: Array.from(tables.readings.values()),
    orders: Array.from(tables.orders.values())
  };
}

/**
 * Unisce nel database corrente eventuali righe recuperate da revisioni successive (anche se parzialmente corrotte).
 */
function mergeSalvagedIntoDb(salvaged) {
  if (!currentDb || !salvaged) return { addedComics: 0, updatedComics: 0, addedUsers: 0, addedSales: 0, addedReadings: 0 };

  let addedComics = 0;
  let updatedComics = 0;
  let addedUsers = 0;
  let addedSales = 0;
  let addedReadings = 0;

  try {
    currentDb.pragma('foreign_keys = OFF');
    const tx = currentDb.transaction(() => {
      // 1. Users
      if (Array.isArray(salvaged.users)) {
        for (const u of salvaged.users) {
          if (!u || !u.id || !u.username || !u.password_hash) continue;
          const ex = currentDb.prepare('SELECT id FROM users WHERE id = ? OR username = ? COLLATE NOCASE').get(u.id, u.username);
          if (!ex) {
            currentDb.prepare('INSERT INTO users (id, username, email, password_hash, display_name, created_at) VALUES (?, ?, ?, ?, ?, ?)')
              .run(u.id, u.username, u.email || null, u.password_hash, u.display_name || u.username, u.created_at || new Date().toISOString());
            addedUsers++;
          }
        }
      }

      // 2. Publishers
      if (Array.isArray(salvaged.publishers)) {
        for (const p of salvaged.publishers) {
          if (!p || !p.id || !p.name) continue;
          currentDb.prepare('INSERT OR IGNORE INTO publishers (id, name, color, description) VALUES (?, ?, ?, ?)')
            .run(p.id, p.name, p.color || '#6366f1', p.description || null);
        }
      }

      // 3. Comics
      if (Array.isArray(salvaged.comics)) {
        const comicCols = currentDb.prepare('PRAGMA table_info(comics)').all().map(c => c.name);
        for (const c of salvaged.comics) {
          if (!c || !c.id || !c.title) continue;
          const ex = currentDb.prepare('SELECT id, updated_at FROM comics WHERE id = ?').get(c.id);
          if (!ex) {
            const validKeys = comicCols.filter(k => c[k] !== undefined);
            const placeholders = validKeys.map(() => '?').join(', ');
            currentDb.prepare(`INSERT INTO comics (${validKeys.join(', ')}) VALUES (${placeholders})`)
              .run(...validKeys.map(k => c[k]));
            addedComics++;
          } else if (c.updated_at && (!ex.updated_at || c.updated_at > ex.updated_at)) {
            const validKeys = comicCols.filter(k => c[k] !== undefined);
            const placeholders = validKeys.map(() => '?').join(', ');
            currentDb.prepare(`INSERT OR REPLACE INTO comics (${validKeys.join(', ')}) VALUES (${placeholders})`)
              .run(...validKeys.map(k => c[k]));
            updatedComics++;
          }
        }
      }

      // 4. Sales
      if (Array.isArray(salvaged.sales_refunds)) {
        const salesCols = currentDb.prepare('PRAGMA table_info(sales_refunds)').all().map(c => c.name);
        for (const s of salvaged.sales_refunds) {
          if (!s || !s.id || !s.title) continue;
          const ex = currentDb.prepare('SELECT id FROM sales_refunds WHERE id = ?').get(s.id);
          if (!ex) {
            const validKeys = salesCols.filter(k => s[k] !== undefined);
            const placeholders = validKeys.map(() => '?').join(', ');
            currentDb.prepare(`INSERT INTO sales_refunds (${validKeys.join(', ')}) VALUES (${placeholders})`)
              .run(...validKeys.map(k => s[k]));
            addedSales++;
          }
        }
      }

      // 5. Readings
      if (Array.isArray(salvaged.readings)) {
        const readCols = currentDb.prepare('PRAGMA table_info(readings)').all().map(c => c.name);
        for (const r of salvaged.readings) {
          if (!r || !r.id || !r.title) continue;
          const ex = currentDb.prepare('SELECT id FROM readings WHERE id = ?').get(r.id);
          if (!ex) {
            const validKeys = readCols.filter(k => r[k] !== undefined);
            const placeholders = validKeys.map(() => '?').join(', ');
            currentDb.prepare(`INSERT INTO readings (${validKeys.join(', ')}) VALUES (${placeholders})`)
              .run(...validKeys.map(k => r[k]));
            addedReadings++;
          }
        }
      }
    });
    tx();
  } catch (err) {
    console.error('[DB] Errore durante mergeSalvagedIntoDb:', err.message);
  } finally {
    try { currentDb.pragma('foreign_keys = ON'); } catch (e) {}
  }

  return { addedComics, updatedComics, addedUsers, addedSales, addedReadings };
}

/**
 * Sostituisce il database attivo con un buffer SQLite verificato in modo sicuro:
 * 1. Verifica che il buffer sia integro PRIMA di toccare il disco
 * 2. Chiude la connessione corrente SENZA eseguire wal_checkpoint (che sovrascriverebbe il nuovo file con vecchie pagine WAL!)
 * 3. Elimina i file -wal e -shm residui
 * 4. Scrive il nuovo buffer e riapre la connessione
 */
function replaceDbWithBuffer(cloudBuffer) {
  const check = inspectSqliteBuffer(cloudBuffer);
  if (!check.valid) {
    console.error(`[DB] Sostituzione database annullata: buffer non valido (${check.error})`);
    return { success: false, error: check.error };
  }

  try {
    if (currentDb) {
      try {
        currentDb.close();
      } catch (e) {}
      currentDb = null;
    }
    removeWalFiles(dbPath);
    fs.writeFileSync(dbPath, cloudBuffer);
    removeWalFiles(dbPath);

    currentDb = new Database(dbPath);
    currentDb.pragma('journal_mode = WAL');
    currentDb.pragma('foreign_keys = ON');
    initDatabase();

    const health = checkDatabaseHealth();
    console.log(`[DB] Database sostituito e ricaricato con successo (${check.comicsCount} fumetti, maxId=${check.maxComicId})`);
    return { success: health.healthy, ...check, health };
  } catch (err) {
    console.error(`[DB] Errore critico durante replaceDbWithBuffer:`, err.message);
    return { success: false, error: err.message };
  }
}

function reopenDb(newBuffer = null) {
  if (newBuffer && Buffer.isBuffer(newBuffer)) {
    return replaceDbWithBuffer(newBuffer).success;
  }
  try {
    if (currentDb) {
      try {
        // NON eseguire wal_checkpoint qui se il file dbPath è stato appena sovrascritto dall'esterno!
        currentDb.close();
      } catch (e) {}
      currentDb = null;
    }
    removeWalFiles(dbPath);
    currentDb = new Database(dbPath);
    currentDb.pragma('journal_mode = WAL');
    currentDb.pragma('foreign_keys = ON');
    initDatabase();
    console.log(`[DB] Database ricaricato con successo da ${dbPath}`);
    return true;
  } catch (err) {
    console.error(`[DB] Errore ricaricamento database:`, err.message);
    return false;
  }
}

function serializeDatabase() {
  const health = checkDatabaseHealth();
  if (!health.healthy) {
    throw new Error(`Esportazione bloccata: database locale non integro (${health.error})`);
  }
  let buf;
  if (typeof currentDb.serialize === 'function') {
    buf = currentDb.serialize();
  } else {
    currentDb.pragma('wal_checkpoint(TRUNCATE)');
    buf = fs.readFileSync(dbPath);
  }
  const check = inspectSqliteBuffer(buf);
  if (!check.valid) {
    throw new Error(`Buffer serializzato non valido: ${check.error}`);
  }
  return buf;
}

const db = new Proxy({}, {
  get(target, prop) {
    if (prop === 'reopenDb') return reopenDb;
    if (prop === 'replaceDbWithBuffer') return replaceDbWithBuffer;
    if (prop === 'checkDatabaseHealth') return checkDatabaseHealth;
    if (prop === 'inspectSqliteBuffer') return inspectSqliteBuffer;
    if (prop === 'serializeDatabase') return serializeDatabase;
    if (prop === 'salvageFromBuffer') return salvageFromBuffer;
    if (prop === 'mergeSalvagedIntoDb') return mergeSalvagedIntoDb;
    if (prop === 'dbPath') return dbPath;
    if (prop === '_rawDb') return currentDb;
    const val = currentDb[prop];
    return typeof val === 'function' ? val.bind(currentDb) : val;
  }
});

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS publishers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6366f1',
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS comics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      title TEXT NOT NULL,
      series TEXT,
      issue_number TEXT,
      variant_info TEXT,
      publisher_id INTEGER,
      year TEXT NOT NULL,
      month TEXT NOT NULL,
      release_date TEXT,
      purchase_date TEXT,
      cover_price REAL DEFAULT 0,
      purchase_price REAL DEFAULT 0,
      isbn TEXT,
      ean TEXT,
      upc TEXT,
      cover_url TEXT,
      local_cover_path TEXT,
      status TEXT DEFAULT 'Acquistato',
      channel TEXT DEFAULT 'Fumetteria',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sales_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      year TEXT NOT NULL,
      month TEXT,
      title TEXT NOT NULL,
      price REAL NOT NULL,
      channel TEXT DEFAULT 'Vinted',
      notes TEXT,
      date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      store_name TEXT NOT NULL,
      title TEXT NOT NULL,
      items_count INTEGER DEFAULT 1,
      total_price REAL NOT NULL,
      original_price REAL,
      month TEXT,
      year TEXT,
      date TEXT,
      status TEXT DEFAULT 'Completato',
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      comic_id INTEGER,
      title TEXT NOT NULL,
      year TEXT NOT NULL,
      month TEXT NOT NULL,
      category TEXT,
      rating INTEGER,
      read_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS monthly_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER DEFAULT 1,
      year TEXT NOT NULL,
      month TEXT NOT NULL,
      budget_amount REAL DEFAULT 0,
      UNIQUE(user_id, year, month),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id INTEGER DEFAULT 1,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Migrazione dinamica colonne user_id per tabelle preesistenti
  const tables = ['comics', 'sales_refunds', 'orders', 'readings', 'monthly_budgets', 'settings'];
  for (const table of tables) {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
    if (!cols.includes('user_id')) {
      try {
        db.exec(`ALTER TABLE ${table} ADD COLUMN user_id INTEGER DEFAULT 1;`);
      } catch (err) {
        console.log(`Nota migrazione colonna user_id su ${table}:`, err.message);
      }
    }
  }

  // Migrazione colonna comic_id per sales_refunds
  const salesCols = db.prepare('PRAGMA table_info(sales_refunds)').all().map(c => c.name);
  if (!salesCols.includes('comic_id')) {
    try {
      db.exec('ALTER TABLE sales_refunds ADD COLUMN comic_id INTEGER;');
    } catch (err) {
      console.log('Nota migrazione colonna comic_id su sales_refunds:', err.message);
    }
  }

  // Creazione indici multiutente
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_comics_user ON comics(user_id);
    CREATE INDEX IF NOT EXISTS idx_comics_user_year_month ON comics(user_id, year, month);
    CREATE INDEX IF NOT EXISTS idx_sales_user ON sales_refunds(user_id);
    CREATE INDEX IF NOT EXISTS idx_sales_comic ON sales_refunds(comic_id);
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_readings_user ON readings(user_id);
  `);

  // Creazione account principale di default (Tryy_Nexus) se la tabella users non ha questo utente
  const existingUser = db.prepare('SELECT id FROM users WHERE username = ?').get('Tryy_Nexus');
  if (!existingUser) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync('Developer', salt);
    const res = db.prepare(`
      INSERT INTO users (username, email, password_hash, display_name)
      VALUES (?, ?, ?, ?)
    `).run('Tryy_Nexus', 'tryynexus@comics-count.local', hash, 'Tryy Nexus');
    
    const tryyId = res.lastInsertRowid;
    // Assicuriamo che tutti i dati già salvati siano associati a Tryy_Nexus
    db.prepare('UPDATE comics SET user_id = ? WHERE user_id IS NULL OR user_id = 1').run(tryyId);
    db.prepare('UPDATE sales_refunds SET user_id = ? WHERE user_id IS NULL OR user_id = 1').run(tryyId);
    db.prepare('UPDATE orders SET user_id = ? WHERE user_id IS NULL OR user_id = 1').run(tryyId);
    db.prepare('UPDATE readings SET user_id = ? WHERE user_id IS NULL OR user_id = 1').run(tryyId);
  }

  // Insert default publishers if table is empty
  const defaultPublishers = [
    { name: 'DC', color: '#0284c7', description: 'DC Comics / Panini' },
    { name: 'Marvel', color: '#e11d48', description: 'Marvel Comics / Panini' },
    { name: 'Manga', color: '#8b5cf6', description: 'Planet Manga, Star Comics, J-Pop, ecc.' },
    { name: 'Panini Comics', color: '#ea580c', description: 'Panini Comics Italia' },
    { name: 'Star Comics', color: '#10b981', description: 'Edizioni Star Comics' },
    { name: 'J-Pop', color: '#f43f5e', description: 'J-Pop Manga / Edizioni BD' },
    { name: 'Sergio Bonelli', color: '#d97706', description: 'Sergio Bonelli Editore' },
    { name: 'Saldapress', color: '#06b6d4', description: 'Saldapress' },
    { name: 'Ordini / Usato', color: '#64748b', description: 'Vinted, Libraccio, eBay, HVC' },
    { name: 'Eventi / Fiere', color: '#ec4899', description: 'Comicon, Lucca Comics, firmacopie' },
    { name: 'Altro', color: '#94a3b8', description: 'Altre edizioni indipendenti o autoproduzioni' }
  ];

  const insertPub = db.prepare('INSERT OR IGNORE INTO publishers (name, color, description) VALUES (?, ?, ?)');
  for (const pub of defaultPublishers) {
    insertPub.run(pub.name, pub.color, pub.description);
  }
}

initDatabase();

module.exports = {
  db,
  initDatabase,
  reopenDb,
  replaceDbWithBuffer,
  checkDatabaseHealth,
  inspectSqliteBuffer,
  serializeDatabase,
  salvageFromBuffer,
  mergeSalvagedIntoDb,
  dbPath,
  DATA_DIR
};

