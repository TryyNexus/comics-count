import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { 
  X, 
  RefreshCw, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  Database,
  Cloud,
  FileJson
} from 'lucide-react';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete
}) => {
  const [oneDriveStatus, setOneDriveStatus] = useState<{
    found: boolean;
    path: string | null;
    size?: number;
    lastModified?: string;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [importResult, setImportResult] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkOneDrive();
      setImportResult(null);
      setError(null);
    }
  }, [isOpen]);

  const checkOneDrive = async () => {
    try {
      const status = await api.checkOneDriveStatus();
      setOneDriveStatus(status);
    } catch (e: any) {
      console.error(e);
    }
  };

  if (!isOpen) return null;

  const handleImportOneDrive = async () => {
    setIsLoading(true);
    setError(null);
    setImportResult(null);
    try {
      const res = await api.importFromOneDrive();
      setImportResult(res.stats);
      onImportComplete();
    } catch (e: any) {
      setError(e.message || 'Errore durante l\'importazione');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLoading(true);
    setError(null);
    setImportResult(null);
    try {
      const res = await api.importUploadedFile(file);
      setImportResult(res.stats);
      onImportComplete();
    } catch (e: any) {
      setError(e.message || 'Errore durante l\'importazione');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Centro Sincronizzazione, Import & Backup
              </h2>
              <p className="text-xs text-slate-400">
                Gestione dati da OneDrive (`Fumetti.xlsx`) ed esportazione Excel/JSON
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Section 1: OneDrive auto detection */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 mt-0.5">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Sincronizzazione OneDrive Automatico</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Rilevamento del file originale <code className="text-indigo-300">Fumetti.xlsx</code> nella cartella OneDrive.
                  </p>
                  {oneDriveStatus?.found ? (
                    <div className="mt-2 text-xs text-emerald-400 font-mono space-y-0.5">
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> File trovato nel percorso OneDrive!
                      </div>
                      <div className="text-[11px] text-slate-400 break-all">
                        {oneDriveStatus.path}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-amber-400 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" /> File non trovato automaticamente nel percorso standard.
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={handleImportOneDrive}
                disabled={isLoading || !oneDriveStatus?.found}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-2 transition cursor-pointer shadow-lg shadow-indigo-600/20 shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                {isLoading ? 'Sincronizzazione...' : 'Sincronizza Ora'}
              </button>
            </div>
          </div>

          {/* Section 2: Upload manual Excel */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Carica File Excel Alternativo</h3>
                <p className="text-xs text-slate-400">
                  Importa qualsiasi file <code className="text-purple-300">.xlsx</code> con fogli per anno.
                </p>
              </div>
            </div>

            <label className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-2 transition cursor-pointer shrink-0">
              <Upload className="w-3.5 h-3.5" /> Scegli File
              <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
            </label>
          </div>

          {/* Result Alert */}
          {importResult && (
            <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs space-y-2">
              <div className="font-bold flex items-center gap-1.5 text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Importazione completata con successo!
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-slate-900/80 p-2 rounded">
                  <div className="text-slate-400">Fumetti</div>
                  <div className="text-base font-bold text-white">{importResult.comicsImported}</div>
                </div>
                <div className="bg-slate-900/80 p-2 rounded">
                  <div className="text-slate-400">Vendite</div>
                  <div className="text-base font-bold text-white">{importResult.salesImported}</div>
                </div>
                <div className="bg-slate-900/80 p-2 rounded">
                  <div className="text-slate-400">Preordini HVC</div>
                  <div className="text-base font-bold text-white">{importResult.hvcImported}</div>
                </div>
                <div className="bg-slate-900/80 p-2 rounded">
                  <div className="text-slate-400">Ordini Store</div>
                  <div className="text-base font-bold text-white">{importResult.ordersImported}</div>
                </div>
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Section 3: Export Options */}
          <div className="border-t border-slate-800 pt-5">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
              Esportazione e Backup Dati
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <a
                href="/api/export/excel"
                download="Fumetti_Export.xlsx"
                className="p-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between group transition"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                    <FileSpreadsheet className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-emerald-300 transition">
                      Esporta in Excel (.xlsx)
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Tutti i fumetti, riepiloghi e vendite
                    </div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition" />
              </a>

              <a
                href="/api/export/json"
                download="Fumetti_Backup.json"
                className="p-3.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 flex items-center justify-between group transition"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                    <FileJson className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-white group-hover:text-amber-300 transition">
                      Backup Completo JSON
                    </div>
                    <div className="text-[11px] text-slate-400">
                      Copia di sicurezza di tutte le tabelle
                    </div>
                  </div>
                </div>
                <Download className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
