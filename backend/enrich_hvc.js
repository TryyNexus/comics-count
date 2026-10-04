const { db } = require('./db');
const { searchMetadata, downloadAndCacheCover } = require('./metadataService');

async function enrichHVCComics(limit = 20) {
  const comics = db.prepare(`
    SELECT * FROM comics 
    WHERE channel = 'HVC / Preordine' 
      AND purchase_price = 0 
      AND (isbn IS NULL OR cover_url IS NULL)
    LIMIT ?
  `).all(limit);

  console.log(`Trovati ${comics.length} fumetti HVC da arricchire con metadati e copertine da HoVistoCose...`);

  let enrichedCount = 0;
  for (const c of comics) {
    try {
      console.log(`\nRicerca su HoVistoCose per: "${c.title}"...`);
      const results = await searchMetadata(c.title);
      if (results && results.length > 0) {
        const best = results[0];
        console.log(` -> Trovato: ${best.title}`);
        console.log(`    EAN: ${best.ean || 'N/D'} | Copertina: ${best.coverUrl ? 'Presente' : 'N/D'}`);

        let localCover = null;
        if (best.coverUrl) {
          localCover = await downloadAndCacheCover(best.coverUrl, c.id);
          if (localCover) console.log(`    Scaricata localmente: ${localCover}`);
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

        enrichedCount++;
      }
      // Brief pause to be respectful to HoVistoCose server
      await new Promise(r => setTimeout(r, 600));
    } catch (err) {
      console.error(`Errore per "${c.title}":`, err.message);
    }
  }

  console.log(`\nCompletato! ${enrichedCount} fumetti HVC arricchiti con successo.`);
}

module.exports = { enrichHVCComics };

if (require.main === module) {
  enrichHVCComics(100);
}
