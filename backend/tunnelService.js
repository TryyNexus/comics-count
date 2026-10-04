const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let tunnelProcess = null;
let currentPublicUrl = null;
let isStarting = false;
let listeners = [];

const CLOUDFLARED_BIN = path.join(__dirname, 'bin', 'cloudflared.exe');

function getTunnelUrl() {
  return currentPublicUrl;
}

function getTunnelStatus() {
  return {
    active: !!tunnelProcess,
    url: currentPublicUrl,
    binaryAvailable: fs.existsSync(CLOUDFLARED_BIN),
    isStarting
  };
}

function startTunnel(port = 3001) {
  if (!fs.existsSync(CLOUDFLARED_BIN)) {
    console.warn('[Tunnel] cloudflared.exe non trovato in backend/bin/');
    return Promise.resolve(null);
  }

  if (tunnelProcess && currentPublicUrl) {
    return Promise.resolve(currentPublicUrl);
  }

  if (isStarting) {
    return new Promise((resolve) => listeners.push(resolve));
  }

  isStarting = true;

  return new Promise((resolve) => {
    listeners.push(resolve);

    try {
      tunnelProcess = spawn(CLOUDFLARED_BIN, ['tunnel', '--url', `http://localhost:${port}`]);

      const onData = (data) => {
        const text = data.toString();
        const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && !currentPublicUrl) {
          currentPublicUrl = match[0];
          isStarting = false;
          console.log(`[Tunnel] Accesso Pubblico Remoto Attivo: ${currentPublicUrl}`);
          
          // Write link to easy text file in project root
          try {
            const infoFile = path.join(__dirname, '..', 'LINK_TELEFONO.txt');
            const content = `=====================================================
COMICS COUNT - LINK ACCESSO SMARTPHONE (4G / 5G / Wi-Fi)
=====================================================

Link da aprire sul tuo smartphone:
${currentPublicUrl}

Questo link funziona ovunque (anche fuori casa).
- Su iPhone (Safari): Condividi -> "Aggiungi a schermata Home"
- Su Android (Chrome): Menu (3 puntini) -> "Installa app" o "Aggiungi a schermata Home"

Ultimo avvio: ${new Date().toLocaleString('it-IT')}
=====================================================
`;
            fs.writeFileSync(infoFile, content, 'utf8');
          } catch (e) {}

          listeners.forEach(fn => fn(currentPublicUrl));
          listeners = [];
        }
      };

      tunnelProcess.stdout.on('data', onData);
      tunnelProcess.stderr.on('data', onData);

      tunnelProcess.on('error', (err) => {
        console.error('[Tunnel] Errore avvio cloudflared:', err.message);
        isStarting = false;
        currentPublicUrl = null;
        tunnelProcess = null;
        listeners.forEach(fn => fn(null));
        listeners = [];
      });

      tunnelProcess.on('exit', (code) => {
        console.log(`[Tunnel] Processo cloudflared terminato (codice: ${code})`);
        tunnelProcess = null;
        currentPublicUrl = null;
        isStarting = false;
      });

      // Timeout fallback 15s
      setTimeout(() => {
        if (isStarting) {
          isStarting = false;
          listeners.forEach(fn => fn(currentPublicUrl));
          listeners = [];
        }
      }, 15000);

    } catch (e) {
      console.error('[Tunnel] Errore spawn cloudflared:', e.message);
      isStarting = false;
      listeners.forEach(fn => fn(null));
      listeners = [];
    }
  });
}

function stopTunnel() {
  if (tunnelProcess) {
    try {
      tunnelProcess.kill();
    } catch (e) {}
    tunnelProcess = null;
    currentPublicUrl = null;
    isStarting = false;
  }
}

// Clean up child process on exit
process.on('exit', stopTunnel);
process.on('SIGINT', () => { stopTunnel(); process.exit(); });
process.on('SIGTERM', () => { stopTunnel(); process.exit(); });

module.exports = {
  startTunnel,
  stopTunnel,
  getTunnelUrl,
  getTunnelStatus
};
