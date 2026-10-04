import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { 
  X, 
  Smartphone, 
  Copy, 
  Check, 
  ExternalLink, 
  Wifi, 
  Globe, 
  Apple, 
  Download,
  Sparkles,
  Loader2,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

interface MobileAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MobileAppModal: React.FC<MobileAppModalProps> = ({ isOpen, onClose }) => {
  const [networkInfo, setNetworkInfo] = useState<{
    localIp: string;
    port: number;
    localUrl: string;
    publicUrl: string | null;
    tunnelStatus?: { active: boolean; url: string | null; binaryAvailable: boolean; isStarting: boolean };
  } | null>(null);

  // 'remote' = Everywhere (4G/5G/Different Wi-Fi), 'local' = Home Wi-Fi
  const [connectionMode, setConnectionMode] = useState<'remote' | 'local'>('remote');
  const [copied, setCopied] = useState(false);
  const [activePlatform, setActivePlatform] = useState<'ios' | 'android'>('ios');
  const [loading, setLoading] = useState(true);
  const [isStartingTunnel, setIsStartingTunnel] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadNetwork();
    }
  }, [isOpen]);

  const loadNetwork = async () => {
    setLoading(true);
    try {
      const data = await api.getNetworkInfo();
      setNetworkInfo(data);
      if (data.publicUrl) {
        setConnectionMode('remote');
      } else {
        setConnectionMode('local');
      }
    } catch {
      // Fallback
      setNetworkInfo({
        localIp: window.location.hostname,
        port: 3001,
        localUrl: `http://${window.location.hostname}:3001`,
        publicUrl: null
      });
      setConnectionMode('local');
    } finally {
      setLoading(false);
    }
  };

  const handleStartOrRefreshTunnel = async () => {
    setIsStartingTunnel(true);
    try {
      const res = await api.startTunnel();
      if (res.url) {
        setNetworkInfo(prev => prev ? { ...prev, publicUrl: res.url } : null);
        setConnectionMode('remote');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsStartingTunnel(false);
    }
  };

  if (!isOpen) return null;

  // Choose the active URL based on mode
  const activeUrl = connectionMode === 'remote' && networkInfo?.publicUrl
    ? networkInfo.publicUrl
    : (networkInfo?.localUrl || `http://${window.location.hostname}:3001`);

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(activeUrl)}&margin=12&format=svg`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(activeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl relative my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-600/30 shrink-0">
            <Smartphone className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              Comics Count per Smartphone
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                PWA Standalone
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Usa l'app ovunque sul tuo telefono (anche fuori casa o sotto rete dati 4G/5G)
            </p>
          </div>
        </div>

        {/* Connection Mode Selector (Remote vs Local) */}
        <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 mb-4">
          <button
            onClick={() => setConnectionMode('remote')}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              connectionMode === 'remote'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-400" />
            <span>🌐 Ovunque (4G/5G / Altro Wi-Fi)</span>
          </button>

          <button
            onClick={() => setConnectionMode('local')}
            className={`py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              connectionMode === 'local'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Wifi className="w-4 h-4 text-sky-400" />
            <span>🏠 Stesso Wi-Fi di Casa</span>
          </button>
        </div>

        {/* Mode Explanation & Status Pill */}
        <div className="mb-4 text-xs">
          {connectionMode === 'remote' ? (
            <div className="p-3 bg-emerald-950/30 border border-emerald-500/30 rounded-xl flex items-start gap-2.5 text-emerald-300">
              <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-200">
                  Accesso Remoto Globale Crittografato (Cloudflare Tunnel HTTPS)
                </p>
                <p className="text-[11px] text-emerald-400/90 mt-0.5">
                  Funziona ovunque ti trovi: in fumetteria con la connessione dati del telefono (4G/5G), all'università o su qualsiasi altro Wi-Fi, <strong>senza essere collegato alla rete del PC</strong>!
                </p>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-sky-950/30 border border-sky-500/30 rounded-xl flex items-start gap-2.5 text-sky-300">
              <Wifi className="w-4 h-4 shrink-0 text-sky-400 mt-0.5" />
              <div>
                <p className="font-semibold text-sky-200">
                  Accesso Diretto su Rete Wi-Fi Locale
                </p>
                <p className="text-[11px] text-sky-400/90 mt-0.5">
                  Funziona quando il telefono e il PC sono collegati allo stesso router di casa.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* QR Code and URL Section */}
        <div className="bg-slate-950 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-5 mb-5 shadow-inner">
          {/* QR Code */}
          <div className="p-2 bg-white rounded-xl shadow-md shrink-0 flex items-center justify-center">
            {loading || (connectionMode === 'remote' && !networkInfo?.publicUrl && isStartingTunnel) ? (
              <div className="w-36 h-36 flex flex-col items-center justify-center text-slate-800 text-xs gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                <span>Generazione...</span>
              </div>
            ) : (
              <img 
                src={qrCodeUrl} 
                alt="QR Code per smartphone" 
                className="w-36 h-36 rounded-lg"
              />
            )}
          </div>

          {/* Connection info */}
          <div className="grow space-y-2.5 text-center sm:text-left w-full">
            <p className="text-xs text-slate-300">
              Inquadra il codice QR con la fotocamera del tuo telefono oppure digita l'indirizzo:
            </p>

            <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg p-1.5 px-2.5">
              <code className="text-xs font-mono text-indigo-300 truncate grow select-all">
                {activeUrl}
              </code>
              <button
                onClick={copyToClipboard}
                className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                title="Copia indirizzo"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
              <a
                href={activeUrl}
                target="_blank"
                rel="noreferrer"
                className="p-1 rounded hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
                title="Apri nel browser"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            {copied && <span className="text-[11px] text-emerald-400 block font-medium">Link copiato negli appunti!</span>}

            {connectionMode === 'remote' && !networkInfo?.publicUrl && (
              <button
                onClick={handleStartOrRefreshTunnel}
                disabled={isStartingTunnel}
                className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                {isStartingTunnel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Attiva Tunnel Remoto Adesso
              </button>
            )}
          </div>
        </div>

        {/* Installation Instructions Tabs (iOS vs Android) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              Come installare l'App a schermo intero:
            </h4>
            <div className="flex gap-1">
              <button
                onClick={() => setActivePlatform('ios')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  activePlatform === 'ios'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Apple className="w-3 h-3" />
                iPhone (iOS)
              </button>
              <button
                onClick={() => setActivePlatform('android')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                  activePlatform === 'android'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-3 h-3" />
                Android
              </button>
            </div>
          </div>

          {activePlatform === 'ios' ? (
            <div className="space-y-2 text-xs text-slate-300 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                <p>Inquadra il QR con la <strong>Fotocamera</strong> dell'iPhone e aprilo con <strong>Safari</strong>.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                <p>Tocca l'icona in basso al centro (<strong>📤 Condividi</strong>).</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                <p>Scorri l'elenco e tocca <strong>"Aggiungi alla schermata Home"</strong>.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                <p>Tocca <strong>"Aggiungi"</strong>: Comics Count si aprirà come una vera app nativa a schermo intero!</p>
              </div>
            </div>
          ) : (
            <div className="space-y-2 text-xs text-slate-300 bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
                <p>Inquadra il codice QR o apri il link in <strong>Google Chrome</strong>.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
                <p>Tocca i <strong>tre puntini (⋮)</strong> in alto a destra.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
                <p>Seleziona <strong>"Installa app"</strong> oppure <strong>"Aggiungi a schermata Home"</strong>.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 font-bold flex items-center justify-center shrink-0 text-[11px]">4</span>
                <p>L'app apparirà sul telefono con avvio immediato e interfaccia ottimizzata!</p>
              </div>
            </div>
          )}
        </div>

        {/* Synchronization Note */}
        <div className="mt-4 p-2.5 bg-indigo-950/30 border border-indigo-500/20 rounded-xl flex items-center gap-2.5 text-xs text-indigo-300">
          <Sparkles className="w-4 h-4 shrink-0 text-indigo-400" />
          <span>Sincronizzazione in tempo reale: qualsiasi acquisto o modifica aggiunta da telefono viene salvata direttamente nel database del tuo PC.</span>
        </div>
      </div>
    </div>
  );
};
