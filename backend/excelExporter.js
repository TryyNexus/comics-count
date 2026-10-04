const XLSX = require('xlsx');
const { db } = require('./db');

function exportToExcel(userId = 1) {
  const wb = XLSX.utils.book_new();

  // 1. All comics
  const comics = db.prepare(`
    SELECT 
      c.id, c.year AS Anno, c.month AS Mese, p.name AS Editore,
      c.title AS Titolo, c.series AS Serie, c.issue_number AS Numero,
      c.variant_info AS Variante, c.purchase_price AS 'Prezzo Pagato (€)',
      c.cover_price AS 'Prezzo Copertina (€)', c.status AS Stato,
      c.channel AS Canale, c.isbn AS ISBN, c.ean AS EAN, c.notes AS Note
    FROM comics c
    LEFT JOIN publishers p ON c.publisher_id = p.id
    WHERE c.user_id = ?
    ORDER BY c.year DESC, c.month ASC, c.id ASC
  `).all(userId);

  const wsComics = XLSX.utils.json_to_sheet(comics);
  XLSX.utils.book_append_sheet(wb, wsComics, 'Fumetti');

  // 2. Monthly Summary
  const monthlyData = db.prepare(`
    SELECT 
      c.year AS Anno, c.month AS Mese,
      COUNT(c.id) AS 'Fumetti Acquistati',
      ROUND(SUM(c.purchase_price), 2) AS 'Totale Spesa Spesa (€)'
    FROM comics c
    WHERE c.user_id = ?
    GROUP BY c.year, c.month
    ORDER BY c.year DESC, c.month ASC
  `).all(userId);

  const wsMonthly = XLSX.utils.json_to_sheet(monthlyData);
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Riepilogo Mensile');

  // 3. Publisher breakdown
  const pubData = db.prepare(`
    SELECT 
      COALESCE(p.name, 'Non specificato') AS Editore,
      COUNT(c.id) AS 'Numero Volumi',
      ROUND(SUM(c.purchase_price), 2) AS 'Totale Speso (€)'
    FROM comics c
    LEFT JOIN publishers p ON c.publisher_id = p.id
    WHERE c.user_id = ?
    GROUP BY p.name
    ORDER BY SUM(c.purchase_price) DESC
  `).all(userId);

  const wsPubs = XLSX.utils.json_to_sheet(pubData);
  XLSX.utils.book_append_sheet(wb, wsPubs, 'Spesa per Editore');

  // 4. Sales and refunds
  const sales = db.prepare(`
    SELECT 
      id, year AS Anno, month AS Mese, title AS 'Titolo / Articolo',
      price AS 'Importo (€)', channel AS Canale, notes AS Note
    FROM sales_refunds
    WHERE user_id = ?
    ORDER BY year DESC, id DESC
  `).all(userId);

  const wsSales = XLSX.utils.json_to_sheet(sales);
  XLSX.utils.book_append_sheet(wb, wsSales, 'Vendite e Rimborsi');

  // 5. Orders
  const orders = db.prepare(`
    SELECT 
      id, store_name AS Negozio, title AS Descrizione,
      items_count AS Articoli, total_price AS 'Totale (€)',
      year AS Anno, month AS Mese, status AS Stato, notes AS Note
    FROM orders
    WHERE user_id = ?
    ORDER BY id DESC
  `).all(userId);

  const wsOrders = XLSX.utils.json_to_sheet(orders);
  XLSX.utils.book_append_sheet(wb, wsOrders, 'Ordini');

  // 6. Readings
  const readings = db.prepare(`
    SELECT 
      r.id, r.title AS Titolo, r.year AS Anno, r.month AS Mese,
      r.category AS Categoria, r.rating AS Voto, r.notes AS Note
    FROM readings r
    WHERE r.user_id = ?
    ORDER BY r.id DESC
  `).all(userId);

  const wsReadings = XLSX.utils.json_to_sheet(readings);
  XLSX.utils.book_append_sheet(wb, wsReadings, 'Letture');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function exportToJson(userId = 1) {
  const data = {
    exportedAt: new Date().toISOString(),
    comics: db.prepare('SELECT * FROM comics WHERE user_id = ?').all(userId),
    sales: db.prepare('SELECT * FROM sales_refunds WHERE user_id = ?').all(userId),
    orders: db.prepare('SELECT * FROM orders WHERE user_id = ?').all(userId),
    readings: db.prepare('SELECT * FROM readings WHERE user_id = ?').all(userId),
    budgets: db.prepare('SELECT * FROM monthly_budgets WHERE user_id = ?').all(userId)
  };
  return Buffer.from(JSON.stringify(data, null, 2), 'utf-8');
}

module.exports = {
  exportToExcel,
  exportToJson
};
