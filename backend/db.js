const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
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

// Primo avvio o ripristino se corrotto: parte da una copia del database incluso nel repository
const seedPath = path.join(__dirname, 'comics_count.db');
if (fs.existsSync(seedPath)) {
  if (!fs.existsSync(dbPath) || !isValidSqliteFile(dbPath)) {
    if (path.resolve(seedPath) !== path.resolve(dbPath)) {
      fs.copyFileSync(seedPath, dbPath);
      console.log(`[DB] Database valido ripristinato da seed in ${dbPath}`);
    }
  }
}
console.log(`[DB] Uso database: ${dbPath}`);

let currentDb;
try {
  currentDb = new Database(dbPath);
} catch (dbErr) {
  console.warn(`[DB] Errore apertura ${dbPath} (${dbErr.message}). Tentativo ripristino da seed...`);
  if (fs.existsSync(seedPath) && path.resolve(seedPath) !== path.resolve(dbPath)) {
    fs.copyFileSync(seedPath, dbPath);
    currentDb = new Database(dbPath);
  } else {
    throw dbErr;
  }
}
currentDb.pragma('journal_mode = WAL');
currentDb.pragma('foreign_keys = ON');

function reopenDb() {
  try {
    if (currentDb) {
      try {
        currentDb.pragma('wal_checkpoint(TRUNCATE)');
        currentDb.close();
      } catch (e) {}
    }
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

const db = new Proxy({}, {
  get(target, prop) {
    if (prop === 'reopenDb') return reopenDb;
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

  // Creazione indici multiutente
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_comics_user ON comics(user_id);
    CREATE INDEX IF NOT EXISTS idx_comics_user_year_month ON comics(user_id, year, month);
    CREATE INDEX IF NOT EXISTS idx_sales_user ON sales_refunds(user_id);
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

module.exports = { db, initDatabase, reopenDb, dbPath, DATA_DIR };

