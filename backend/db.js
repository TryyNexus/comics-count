const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'comics_count.db');
const db = new Database(dbPath);

// Enable WAL mode and foreign keys for high performance and integrity
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS publishers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#6366f1',
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS comics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS sales_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year TEXT NOT NULL,
      month TEXT,
      title TEXT NOT NULL,
      price REAL NOT NULL,
      channel TEXT DEFAULT 'Vinted',
      notes TEXT,
      date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      comic_id INTEGER,
      title TEXT NOT NULL,
      year TEXT NOT NULL,
      month TEXT NOT NULL,
      category TEXT,
      rating INTEGER,
      read_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (comic_id) REFERENCES comics(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS monthly_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year TEXT NOT NULL,
      month TEXT NOT NULL,
      budget_amount REAL DEFAULT 0,
      UNIQUE(year, month)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_comics_year_month ON comics(year, month);
    CREATE INDEX IF NOT EXISTS idx_comics_publisher ON comics(publisher_id);
    CREATE INDEX IF NOT EXISTS idx_comics_status ON comics(status);
  `);

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

module.exports = { db, initDatabase };
