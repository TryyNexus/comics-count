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
  coversDir: null
};

let syncState = {
  provider: 'none', // 'supabase' | 'github' | 'none'
  isInitialized: false,
  isSyncing: false,
  lastSyncTime: null,
  lastSyncStatus: 'idle', // 'idle' | 'syncing' | 'success' | 'error'
  lastError: null,
  syncPending: false
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
 * GITHUB GIST IMPLEMENTATION
 * =========================================================================
 */
async function githubDownloadGist() {
  const token = process.env.GITHUB_TOKEN;
  const gistId = process.env.GIST_ID;

  const res = await fetch(`https://api.github.com/gists/${gistId}`, {
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
  const fileObj = data.files && (data.files['comics_count.db.b64'] || data.files['comics_count.db']);
  if (!fileObj) {
    return null; // Il Gist esiste ma non contiene ancora il file
  }

  let base64Content = fileObj.content;
  if (fileObj.truncated && fileObj.raw_url) {
    const rawRes = await fetch(fileObj.raw_url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Comics-Count-Sync'
      }
    });
    base64Content = await rawRes.text();
  }

  if (!base64Content) return null;
  return Buffer.from(base64Content.trim(), 'base64');
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

/**
 * =========================================================================
 * CORE CLOUD SYNC LOGIC
 * =========================================================================
 */

/**
 * Inizializza il modulo di Cloud Sync all'avvio del server.
 * Scarica il database più recente dal cloud prima dell'uso effettivo.
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
  console.log('[CloudSync] Controllo presenza backup remoto...');

  try {
    let cloudBuffer = null;
    if (syncState.provider === 'supabase') {
      cloudBuffer = await supabaseDownloadFile('comics_count.db');
    } else if (syncState.provider === 'github') {
      cloudBuffer = await githubDownloadGist();
    }

    if (cloudBuffer && cloudBuffer.length > 0) {
      console.log(`[CloudSync] Trovato database nel cloud (${Math.round(cloudBuffer.length / 1024)} KB). Ripristino in corso...`);
      // Salva il buffer su disco
      fs.writeFileSync(config.dbPath, cloudBuffer);

      // Riapre il database per caricare i nuovi dati
      if (typeof config.reopenDb === 'function') {
        config.reopenDb();
      }
      syncState.lastSyncTime = new Date().toISOString();
      syncState.lastSyncStatus = 'success';
      console.log('[CloudSync] Database ripristinato e sincronizzato con successo!');
    } else {
      console.log('[CloudSync] Nessun database trovato nel cloud. Eseguo primo upload del database locale esistente...');
      await syncDatabaseNow();
    }
  } catch (err) {
    console.error('[CloudSync] Avviso durante inizializzazione cloud:', err.message);
    syncState.lastError = err.message;
    syncState.lastSyncStatus = 'error';
  }

  syncState.isInitialized = true;
  return true;
}

/**
 * Esegue immediatamente il checkpoint di SQLite e l'upload sul Cloud
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
    // 1. Forza la scrittura del WAL nel file principale comics_count.db
    if (config.db && typeof config.db.pragma === 'function') {
      try {
        config.db.pragma('wal_checkpoint(TRUNCATE)');
      } catch (walErr) {
        console.warn('[CloudSync] Nota WAL checkpoint:', walErr.message);
      }
    }

    // 2. Leggi il file dal disco
    const dbBuffer = fs.readFileSync(config.dbPath);

    // 3. Esegui l'upload sul provider attivo
    if (syncState.provider === 'supabase') {
      await supabaseUploadFile('comics_count.db', dbBuffer, 'application/octet-stream');
    } else if (syncState.provider === 'github') {
      await githubUploadGist(dbBuffer);
    }

    syncState.lastSyncTime = new Date().toISOString();
    syncState.lastSyncStatus = 'success';
    syncState.lastError = null;
    console.log(`[CloudSync] Modifiche sincronizzate su ${syncState.provider.toUpperCase()} (${Math.round(dbBuffer.length / 1024)} KB) alle ${new Date().toLocaleTimeString('it-IT')}.`);
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
 * Restituisce lo stato corrente della sincronizzazione
 */
function getSyncStatus() {
  return {
    ...syncState,
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
  getSyncStatus
};
