/**
 * cloudSync.js - Sincronizzazione automatica del database e copertine per Comics Count su Cloud (Render, ecc.)
 * 
 * Supporta:
 * 1. SUPABASE STORAGE (Consigliato: salva sia comics_count.db sia le copertine caricate)
 *    Variabili d'ambiente:
 *      SUPABASE_URL = https://xyzcompany.supabase.co
 *      SUPABASE_KEY = <service_role_key oppure anon_key con policy di scrittura>
 *      SUPABASE_BUCKET = comics-storage (opzionale, default: comics-storage)
 * 
 * 2. GITHUB GIST (Alternativa zero-registrazioni: salva il database SQLite codificato in base64 su un Gist privato)
 *    Variabili d'ambiente:
 *      GITHUB_TOKEN = ghp_xxxx (Personal Access Token con permesso 'gist')
 *      GIST_ID = xxxxxxxx (ID del Gist privato creato su gist.github.com)
 */

const fs = require('fs');
const path = require('path');

let config = {
  db: null,
  dbPath: null,
  reopenDb: null,
  replaceDbWithBuffer: null,
  checkDatabaseHealth: null,
  inspectSqliteBuffer: null,
  serializeDatabase: null,
  coversDir: null
};

let syncState = {
  provider: 'none', // 'supabase' | 'github' | 'none'
  isInitialized: false,
  isSyncing: false,
  lastSyncTime: null,
  lastSyncStatus: 'idle', // 'idle' | 'syncing' | 'success' | 'error'
  lastError: null,
  syncPending: false,
  recoveredRevision: null,
  dbStats: null
};

let debounceTimer = null;

/**
 * Rileva il provider configurato nelle variabili d'ambiente
 */
function detectProvider() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (supabaseUrl && supabaseKey) {
    return 'supabase';
  }

  const ghToken = process.env.GITHUB_TOKEN;
  const gistId = process.env.GIST_ID;
  if (ghToken && gistId) {
    return 'github';
  }

  return 'none';
}

/**
 * =========================================================================
 * SUPABASE STORAGE IMPLEMENTATION
 * =========================================================================
 */
async function supabaseEnsureBucket(supabaseUrl, supabaseKey, bucket) {
  try {
    const res = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ id: bucket, name: bucket, public: true })
    });
    if (res.ok) {
      console.log(`[CloudSync] Bucket '${bucket}' creato con successo su Supabase.`);
    }
  } catch (err) {
    // Il bucket potrebbe già esistere, ignora
  }
}

async function supabaseDownloadFile(remotePath) {
  const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || 'comics-storage';

  const url = `${supabaseUrl}/storage/v1/object/authenticated/${bucket}/${remotePath}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey
    }
  });

  if (res.status === 404) {
    return null; // File non ancora presente nel cloud
  }
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase download (${remotePath}) fallito [${res.status}]: ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function supabaseUploadFile(remotePath, buffer, contentType = 'application/octet-stream') {
  const supabaseUrl = process.env.SUPABASE_URL.replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_BUCKET || 'comics-storage';

  let url = `${supabaseUrl}/storage/v1/object/${bucket}/${remotePath}`;
  let res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseKey}`,
      'apikey': supabaseKey,
      'Content-Type': contentType,
      'x-upsert': 'true'
    },
    body: buffer
  });

  // Se il bucket non esiste, prova a crearlo e riprova una volta
  if (!res.ok && res.status === 404) {
    await supabaseEnsureBucket(supabaseUrl, supabaseKey, bucket);
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseKey}`,
        'apikey': supabaseKey,
        'Content-Type': contentType,
        'x-upsert': 'true'
      },
      body: buffer
    });
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase upload (${remotePath}) fallito [${res.status}]: ${errText}`);
  }

  return true;
}

/**
 * =========================================================================
 * GITHUB GIST IMPLEMENTATION (inclusa cronologia revisioni)
 * =========================================================================
 */
async function extractBufferFromGistData(data, token) {
  const fileObj = data && data.files && (data.files['comics_count.db.b64'] || data.files['comics_count.db']);
  if (!fileObj) {
    return null;
  }

  let base64Content = fileObj.content;
  if ((fileObj.truncated || !base64Content) && fileObj.raw_url) {
    const rawRes = await fetch(fileObj.raw_url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Comics-Count-Sync'
      }
    });
    if (!rawRes.ok) {
      throw new Error(`GitHub Gist raw_url fetch fallito [${rawRes.status}]`);
    }
    base64Content = await rawRes.text();
  }

  if (!base64Content) return null;
  return Buffer.from(base64Content.trim(), 'base64');
}

async function githubDownloadGist(version = null) {
  const token = process.env.GITHUB_TOKEN;
  const gistId = process.env.GIST_ID;
  const url = version
    ? `https://api.github.com/gists/${gistId}/${version}`
    : `https://api.github.com/gists/${gistId}`;

  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Comics-Count-Sync'
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub Gist fetch fallito [${res.status}]: ${errText}`);
  }

  const data = await res.json();
  return extractBufferFromGistData(data, token);
}

async function githubGetGistCommits(perPage = 15) {
  const token = process.env.GITHUB_TOKEN;
  const gistId = process.env.GIST_ID;

  const res = await fetch(`https://api.github.com/gists/${gistId}/commits?per_page=${perPage}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Comics-Count-Sync'
    }
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub Gist commits fetch fallito [${res.status}]: ${errText}`);
  }

  return res.json();
}

async function githubUploadGist(buffer) {
  const token = process.env.GITHUB_TOKEN;
  const gistId = process.env.GIST_ID;
  const b64 = buffer.toString('base64');

  const payload = {
    description: `Comics Count SQLite Backup - ${new Date().toISOString()}`,
    files: {
      'comics_count.db.b64': {
        content: b64
      }
    }
  };

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Comics-Count-Sync',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub Gist upload fallito [${res.status}]: ${errText}`);
  }

  return true;
}

function isValidSqliteBuffer(buf) {
  if (!buf || buf.length < 100) return false;
  return buf.subarray(0, 16).toString('utf8') === 'SQLite format 3\0';
}

function validateBufferIntegrity(buf) {
  if (!isValidSqliteBuffer(buf)) {
    return { valid: false, error: 'Header SQLite non valido' };
  }
  const inspectFn = config.inspectSqliteBuffer || (config.db && config.db.inspectSqliteBuffer);
  if (typeof inspectFn === 'function') {
    return inspectFn(buf);
  }
  return { valid: true, sizeBytes: buf.length, comicsCount: 0, maxComicId: 0 };
}

/**
 * Confronta due snapshot SQLite validi per determinare quale contiene i dati più completi/recenti.
 * Restituisce > 0 se `cand` è migliore di `best`.
 */
function compareDatabaseSnapshots(cand, best) {
  if (!best || !best.valid) return 1;
  if (!cand || !cand.valid) return -1;

  // Preferisci snapshot con più fumetti
  if ((cand.comicsCount || 0) !== (best.comicsCount || 0)) {
    return (cand.comicsCount || 0) - (best.comicsCount || 0);
  }
  // A parità di fumetti, preferisci maxComicId maggiore
  if ((cand.maxComicId || 0) !== (best.maxComicId || 0)) {
    return (cand.maxComicId || 0) - (best.maxComicId || 0);
  }
  // A parità, preferisci più vendite + letture
  const candExtra = (cand.salesCount || 0) + (cand.readingsCount || 0);
  const bestExtra = (best.salesCount || 0) + (best.readingsCount || 0);
  if (candExtra !== bestExtra) {
    return candExtra - bestExtra;
  }
  // A parità, preferisci maxUpdatedAt più recente
  if (cand.maxUpdatedAt && best.maxUpdatedAt && cand.maxUpdatedAt !== best.maxUpdatedAt) {
    return cand.maxUpdatedAt > best.maxUpdatedAt ? 1 : -1;
  }
  return 0;
}

/**
 * Esamina la cronologia delle revisioni del Gist e restituisce i metadati di ciascuna versione.
 */
async function inspectGistRevisions(limit = 15) {
  if (syncState.provider !== 'github') {
    return [];
  }
  const commits = await githubGetGistCommits(limit);
  const results = [];

  for (const c of commits) {
    try {
      const buf = await githubDownloadGist(c.version);
      const check = validateBufferIntegrity(buf);
      results.push({
        version: c.version,
        committedAt: c.committed_at,
        ...check
      });
    } catch (err) {
      results.push({
        version: c.version,
        committedAt: c.committed_at,
        valid: false,
        error: err.message
      });
    }
  }
  return results;
}

/**
 * Cerca nella versione corrente e nella cronologia del Gist la revisione SQLite integra più completa
 * e la ripristina in modo atomico senza corruzione WAL.
 */
async function recoverBestGistDatabase(options = {}) {
  const { targetVersion = null, commitsLimit = 25, salvageCorrupted = true } = options;

  if (syncState.provider === 'github') {
    if (targetVersion) {
      const buf = await githubDownloadGist(targetVersion);
      const check = validateBufferIntegrity(buf);
      if (!check.valid) {
        throw new Error(`La revisione richiesta (${targetVersion}) non è un database SQLite integro: ${check.error}`);
      }
      const replaceFn = config.replaceDbWithBuffer || (config.db && config.db.replaceDbWithBuffer);
      const res = replaceFn ? replaceFn(buf) : { success: config.reopenDb(buf), ...check };
      syncState.recoveredRevision = { version: targetVersion, ...check };
      syncState.dbStats = check;
      return res;
    }

    const commits = await githubGetGistCommits(commitsLimit);
    let bestVersion = null;
    let bestCommittedAt = null;
    let bestBuffer = null;
    let bestCheck = null;
    const candidatesForSalvage = [];

    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      try {
        const buf = await githubDownloadGist(c.version);
        if (!buf) continue;
        const check = validateBufferIntegrity(buf);
        console.log(`[CloudSync] Revisione Gist #${i} (${c.version.slice(0, 8)} @ ${c.committed_at}): valid=${check.valid}, comics=${check.comicsCount ?? 'N/A'}, maxId=${check.maxComicId ?? 'N/A'}, maxUpdated=${check.maxUpdatedAt ?? 'N/A'}${check.error ? ' ERR=' + check.error : ''}`);

        if (check.valid) {
          if (!bestCheck || compareDatabaseSnapshots(check, bestCheck) > 0) {
            bestVersion = c.version;
            bestCommittedAt = c.committed_at;
            bestBuffer = buf;
            bestCheck = check;
          }
          // Tieni anche il primo commit valido se diverso da bestVersion per unire eventuali vendite/letture recenti
          if (i < 4) {
            candidatesForSalvage.push({ version: c.version, committedAt: c.committed_at, buf, valid: true });
          }
        } else {
          candidatesForSalvage.push({ version: c.version, committedAt: c.committed_at, buf, valid: false });
        }
      } catch (err) {
        console.warn(`[CloudSync] Errore controllo revisione ${c.version.slice(0, 8)}:`, err.message);
      }
    }

    if (bestBuffer && bestCheck && bestCheck.valid) {
      console.log(`[CloudSync] Selezionata migliore revisione Gist ${bestVersion.slice(0, 8)} (${bestCommittedAt}) con ${bestCheck.comicsCount} fumetti (maxId=${bestCheck.maxComicId}). Ripristino in corso...`);
      const replaceFn = config.replaceDbWithBuffer || (config.db && config.db.replaceDbWithBuffer);
      let replaceRes;
      if (typeof replaceFn === 'function') {
        replaceRes = replaceFn(bestBuffer);
      } else {
        fs.writeFileSync(config.dbPath, bestBuffer);
        if (typeof config.reopenDb === 'function') config.reopenDb();
        replaceRes = { success: true, ...bestCheck };
      }

      // Recupero (salvage) di eventuali righe aggiunte nelle revisioni successive anche se parzialmente corrotte
      let totalSalvaged = { addedComics: 0, updatedComics: 0, addedUsers: 0, addedSales: 0, addedReadings: 0 };
      const salvageFn = config.salvageFromBuffer || (config.db && config.db.salvageFromBuffer);
      const mergeFn = config.mergeSalvagedIntoDb || (config.db && config.db.mergeSalvagedIntoDb);

      if (salvageCorrupted && typeof salvageFn === 'function' && typeof mergeFn === 'function' && candidatesForSalvage.length > 0) {
        // Ordine cronologico dal più vecchio al più recente
        const ordered = candidatesForSalvage
          .filter(item => item.version !== bestVersion)
          .slice()
          .reverse();

        for (const item of ordered) {
          try {
            const salvaged = salvageFn(item.buf);
            const mRes = mergeFn(salvaged);
            totalSalvaged.addedComics += mRes.addedComics || 0;
            totalSalvaged.updatedComics += mRes.updatedComics || 0;
            totalSalvaged.addedUsers += mRes.addedUsers || 0;
            totalSalvaged.addedSales += mRes.addedSales || 0;
            totalSalvaged.addedReadings += mRes.addedReadings || 0;
            if (mRes.addedComics > 0 || mRes.addedUsers > 0 || mRes.addedSales > 0 || mRes.addedReadings > 0) {
              console.log(`[CloudSync] Salvage da ${item.version.slice(0, 8)} (${item.committedAt}): +${mRes.addedComics} fumetti, +${mRes.addedUsers} utenti, +${mRes.addedSales} vendite, +${mRes.addedReadings} letture`);
            }
          } catch (sErr) {
            console.warn(`[CloudSync] Avviso salvage su ${item.version.slice(0, 8)}:`, sErr.message);
          }
        }
      }

      const healthFn = config.checkDatabaseHealth || (config.db && config.db.checkDatabaseHealth);
      const finalHealth = typeof healthFn === 'function' ? healthFn() : bestCheck;

      syncState.recoveredRevision = {
        version: bestVersion,
        committedAt: bestCommittedAt,
        salvaged: totalSalvaged,
        ...finalHealth
      };
      syncState.dbStats = finalHealth;
      syncState.lastSyncTime = new Date().toISOString();
      syncState.lastSyncStatus = 'success';
      syncState.lastError = null;

      // Se la revisione migliore non era l'ultima o abbiamo recuperato righe extra, riallinea subito il Gist
      if ((commits.length > 0 && bestVersion !== commits[0].version) || totalSalvaged.addedComics > 0 || totalSalvaged.addedSales > 0) {
        console.log(`[CloudSync] Riallineo il Gist con il database completo e risanato...`);
        await syncDatabaseNow();
      }

      return { ...replaceRes, salvaged: totalSalvaged, finalHealth };
    }

    return { success: false, error: 'Nessuna revisione SQLite valida trovata nella cronologia Gist' };
  }

  if (syncState.provider === 'supabase') {
    const cloudBuffer = await supabaseDownloadFile('comics_count.db');
    if (cloudBuffer) {
      const check = validateBufferIntegrity(cloudBuffer);
      if (check.valid) {
        const replaceFn = config.replaceDbWithBuffer || (config.db && config.db.replaceDbWithBuffer);
        const replaceRes = typeof replaceFn === 'function' ? replaceFn(cloudBuffer) : { success: config.reopenDb(cloudBuffer), ...check };
        syncState.dbStats = check;
        syncState.lastSyncTime = new Date().toISOString();
        syncState.lastSyncStatus = 'success';
        return replaceRes;
      }
    }
    return { success: false, error: 'Nessun backup Supabase valido trovato' };
  }

  return { success: false, error: 'Nessun provider configurato' };
}

/**
 * =========================================================================
 * CORE CLOUD SYNC LOGIC
 * =========================================================================
 */

/**
 * Inizializza il modulo di Cloud Sync all'avvio del server.
 * Scarica il database più recente e integro dal cloud prima dell'uso effettivo.
 */
async function initCloudSync(opts) {
  config = { ...config, ...opts };
  syncState.provider = detectProvider();

  if (syncState.provider === 'none') {
    console.log('[CloudSync] Nessuna configurazione cloud rilevata (SUPABASE_* o GITHUB_*).');
    console.log('[CloudSync] Il server utilizzerà il database locale standard.');
    syncState.isInitialized = true;
    return false;
  }

  console.log(`[CloudSync] Provider attivo: ${syncState.provider.toUpperCase()}.`);
  console.log('[CloudSync] Controllo presenza backup remoto e verifica integrità...');

  try {
    const result = await recoverBestGistDatabase({ commitsLimit: 25, salvageCorrupted: true });
    if (result && result.success) {
      console.log(`[CloudSync] Database ripristinato e verificato con successo (${result.comicsCount} fumetti)!`);
    } else {
      console.log('[CloudSync] Nessun database remoto valido trovato. Eseguo upload del database locale sano...');
      await syncDatabaseNow();
    }
  } catch (err) {
    console.error('[CloudSync] Avviso durante inizializzazione cloud:', err.message);
    syncState.lastError = err.message;
    syncState.lastSyncStatus = 'error';
  }

  syncState.isInitialized = true;

  // Protezione anti-SIGTERM durante il rolling deploy su Render:
  // Il vecchio container viene terminato da Render 2-10 secondi dopo l'avvio del nuovo container
  // e potrebbe caricare il suo DB corrotto su SIGTERM. Verifica dopo 15s e 35s che il Gist sia sano.
  if (syncState.provider === 'github') {
    const postDeployGuard = async (label) => {
      try {
        const latestBuf = await githubDownloadGist();
        const latestCheck = validateBufferIntegrity(latestBuf);
        const healthFn = config.checkDatabaseHealth || (config.db && config.db.checkDatabaseHealth);
        const localHealth = typeof healthFn === 'function' ? healthFn() : { healthy: true };

        if (!latestCheck.valid && localHealth.healthy) {
          console.warn(`[CloudSync] [${label}] Rilevato Gist corrotto dal vecchio container in chiusura! Ripristino immediato del Gist dal DB locale sano...`);
          await syncDatabaseNow();
        } else if (latestCheck.valid && localHealth.healthy && (localHealth.comicsCount || 0) > (latestCheck.comicsCount || 0)) {
          console.warn(`[CloudSync] [${label}] Il DB locale ha più fumetti (${localHealth.comicsCount}) rispetto all'ultimo Gist (${latestCheck.comicsCount}). Riallineo il Gist...`);
          await syncDatabaseNow();
        }
      } catch (e) {
        console.warn(`[CloudSync] [${label}] Errore controllo post-deploy:`, e.message);
      }
    };

    setTimeout(() => postDeployGuard('Guard-15s'), 15000);
    setTimeout(() => postDeployGuard('Guard-35s'), 35000);
  }

  return true;
}

/**
 * Esegue immediatamente l'esportazione sicura di SQLite e l'upload sul Cloud.
 * Rifiuta categoricamente di caricare un database corrotto.
 */
async function syncDatabaseNow() {
  if (syncState.provider === 'none') return;
  if (!config.dbPath || !fs.existsSync(config.dbPath)) return;

  if (syncState.isSyncing) {
    syncState.syncPending = true;
    return;
  }

  syncState.isSyncing = true;
  syncState.lastSyncStatus = 'syncing';

  try {
    // 1. Verifica rigorosa di integrità prima dell'upload
    const healthFn = config.checkDatabaseHealth || (config.db && config.db.checkDatabaseHealth);
    if (typeof healthFn === 'function') {
      const health = healthFn();
      if (!health.healthy) {
        throw new Error(`Upload cloud bloccato per proteggere il backup: database locale corrotto (${health.error})`);
      }
      syncState.dbStats = health;
    }

    // 2. Esporta un buffer SQLite atomico e integro (senza dipendere da file -wal aperti)
    let dbBuffer;
    const serializeFn = config.serializeDatabase || (config.db && config.db.serializeDatabase);
    if (typeof serializeFn === 'function') {
      dbBuffer = serializeFn();
    } else {
      if (config.db && typeof config.db.pragma === 'function') {
        try {
          config.db.pragma('wal_checkpoint(TRUNCATE)');
        } catch (walErr) {
          console.warn('[CloudSync] Nota WAL checkpoint:', walErr.message);
        }
      }
      dbBuffer = fs.readFileSync(config.dbPath);
    }

    const bufferCheck = validateBufferIntegrity(dbBuffer);
    if (!bufferCheck.valid) {
      throw new Error(`Upload cloud bloccato: il buffer generato non supera integrity_check (${bufferCheck.error})`);
    }

    // 3. Esegui l'upload sul provider attivo
    if (syncState.provider === 'supabase') {
      await supabaseUploadFile('comics_count.db', dbBuffer, 'application/octet-stream');
    } else if (syncState.provider === 'github') {
      await githubUploadGist(dbBuffer);
    }

    syncState.lastSyncTime = new Date().toISOString();
    syncState.lastSyncStatus = 'success';
    syncState.lastError = null;
    syncState.dbStats = bufferCheck;
    console.log(`[CloudSync] Modifiche sincronizzate su ${syncState.provider.toUpperCase()} (${Math.round(dbBuffer.length / 1024)} KB, ${bufferCheck.comicsCount} fumetti) alle ${new Date().toLocaleTimeString('it-IT')}.`);
  } catch (err) {
    console.error(`[CloudSync] Errore sincronizzazione su ${syncState.provider}:`, err.message);
    syncState.lastSyncStatus = 'error';
    syncState.lastError = err.message;
  } finally {
    syncState.isSyncing = false;
    if (syncState.syncPending) {
      syncState.syncPending = false;
      scheduleSync(1000);
    }
  }
}

/**
 * Pianifica una sincronizzazione debounced (evita upload multipli durante modifiche consecutive)
 */
function scheduleSync(delayMs = 3000) {
  if (syncState.provider === 'none') return;

  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    syncDatabaseNow();
  }, delayMs);
}

/**
 * Gestione sincronizzazione copertine (attiva per Supabase Storage)
 */
async function uploadCover(fileName, localFilePath) {
  if (syncState.provider !== 'supabase') return;
  if (!fs.existsSync(localFilePath)) return;

  try {
    const buffer = fs.readFileSync(localFilePath);
    const ext = path.extname(fileName).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    await supabaseUploadFile(`covers/${fileName}`, buffer, mime);
    console.log(`[CloudSync] Copertina '${fileName}' salvata su Supabase Storage.`);
  } catch (err) {
    console.warn(`[CloudSync] Errore salvataggio copertina '${fileName}':`, err.message);
  }
}

async function downloadCoverIfMissing(fileName) {
  if (syncState.provider !== 'supabase') return false;
  if (!config.coversDir) return false;

  const targetPath = path.join(config.coversDir, fileName);
  if (fs.existsSync(targetPath)) return true;

  try {
    const buffer = await supabaseDownloadFile(`covers/${fileName}`);
    if (buffer && buffer.length > 0) {
      fs.writeFileSync(targetPath, buffer);
      console.log(`[CloudSync] Copertina '${fileName}' scaricata da Supabase Storage.`);
      return true;
    }
  } catch (err) {
    // Non presente nel cloud o errore di rete
  }
  return false;
}

/**
 * Restituisce lo stato corrente della sincronizzazione e la salute del database locale
 */
function getSyncStatus() {
  const healthFn = config.checkDatabaseHealth || (config.db && config.db.checkDatabaseHealth);
  const localHealth = typeof healthFn === 'function' ? healthFn() : null;
  return {
    ...syncState,
    localHealth,
    dbPath: config.dbPath,
    hasDbFile: config.dbPath ? fs.existsSync(config.dbPath) : false
  };
}

module.exports = {
  initCloudSync,
  syncDatabaseNow,
  scheduleSync,
  uploadCover,
  downloadCoverIfMissing,
  getSyncStatus,
  inspectGistRevisions,
  recoverBestGistDatabase
};
