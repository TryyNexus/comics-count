const XLSX = require('xlsx');
const { db } = require('./db');

function exportToExcel() {
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
    ORDER BY c.year DESC, c.month ASC, c.id ASC
  `).all();

  const wsComics = XLSX.utils.json_to_sheet(comics);
  XLSX.utils.book_append_sheet(wb, wsComics, 'Fumetti');

  // 2. Monthly Summary
  const monthlyData = db.prepare(`
    SELECT 
      c.year AS Anno, c.month AS Mese,
      COUNT(c.id) AS 'Fumetti Acquistati',
      ROUND(SUM(c.purchase_price), 2) AS 'Totale Spesa Spesa (€)'
    FROM comics c
    GROUP BY c.year, c.month
    ORDER BY c.year DESC, c.month ASC
  `).all();

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
    GROUP BY p.name
    ORDER BY SUM(c.purchase_price) DESC
  `).all();

  const wsPubs = XLSX.utils.json_to_sheet(pubData);
  XLSX.utils.book_append_sheet(wb, wsPubs, 'Spesa per Editore');

  // 4. Sales and refunds
  const sales = db.prepare(`
    SELECT 
      id, year AS Anno, month AS Mese, title AS 'Titolo / Articolo',
      price AS 'Importo (€)', channel AS Canale, notes AS Note
    FROM sales_refunds
    ORDER BY year DESC, id DESC
  `).all();

  const wsSales = XLSX.utils.json_to_sheet(sales);
  XLSX.utils.book_append_sheet(wb, wsSales, 'Vendite e Rimborsi');

  // 5. Readings
  const readings = db.prepare(`
    SELECT 
      id, year AS Anno, month AS Mese, category AS Categoria,
      title AS Titolo, rating AS Voto, notes AS Note
    FROM readings
    ORDER BY year DESC, id DESC
  `).all();

  const wsReadings = XLSX.utils.json_to_sheet(readings);
  XLSX.utils.book_append_sheet(wb, wsReadings, 'Letture');

  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function exportToJson() {
  const comics = db.prepare('SELECT * FROM comics').all();
  const publishers = db.prepare('SELECT * FROM publishers').all();
  const sales = db.prepare('SELECT * FROM sales_refunds').all();
  const orders = db.prepare('SELECT * FROM orders').all();
  const readings = db.prepare('SELECT * FROM readings').all();
  const budgets = db.prepare('SELECT * FROM monthly_budgets').all();
  const settings = db.prepare('SELECT * FROM settings').all();

  return {
    exportDate: new Date().toISOString(),
    version: '1.0',
    data: {
      comics,
      publishers,
      sales_refunds: sales,
      orders,
      readings,
      monthly_budgets: budgets,
      settings
    }
  };
}

module.exports = { exportToExcel, exportToJson };
