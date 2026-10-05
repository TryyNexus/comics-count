import React, { useState, useEffect } from 'react';
import { Comic, Publisher, ComicStatus, PurchaseChannel, MetadataSearchResult } from '../types';
import { 
  X, 
  Search, 
  Loader2, 
  Image as ImageIcon, 
  Upload, 
  ExternalLink, 
  Check, 
  Barcode, 
  Sparkles,
  BookOpen
} from 'lucide-react';
import { api } from '../api';
import { getComicCoverUrl } from '../utils/coverHelper';

interface AddEditComicModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  comicToEdit?: Comic | null;
  publishers: Publisher[];
  currentYear: string;
  currentMonth: string;
}

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const YEARS = ['2023', '2024', '2025', '2026', '2027'];

export const AddEditComicModal: React.FC<AddEditComicModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  comicToEdit,
  publishers,
  currentYear,
  currentMonth
}) => {
  const [title, setTitle] = useState('');
  const [series, setSeries] = useState('');
  const [issueNumber, setIssueNumber] = useState('');
  const [variantInfo, setVariantInfo] = useState('');
  const [publisherId, setPublisherId] = useState<number | ''>('');
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [releaseDate, setReleaseDate] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [coverPrice, setCoverPrice] = useState('0');
  const [purchasePrice, setPurchasePrice] = useState('0');
  const [isbn, setIsbn] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [localCoverPath, setLocalCoverPath] = useState('');
  const [status, setStatus] = useState<ComicStatus>('Acquistato');
  const [channel, setChannel] = useState<PurchaseChannel>('Fumetteria');
  const [notes, setNotes] = useState('');

  // Metadata Search state
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<MetadataSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (comicToEdit) {
      setTitle(comicToEdit.title || '');
      setSeries(comicToEdit.series || '');
      setIssueNumber(comicToEdit.issue_number || '');
      setVariantInfo(comicToEdit.variant_info || '');
      setPublisherId(comicToEdit.publisher_id || '');
      setYear(comicToEdit.year || currentYear);
      setMonth(comicToEdit.month || currentMonth);
      setReleaseDate(comicToEdit.release_date || '');
      setPurchaseDate(comicToEdit.purchase_date || '');
      setCoverPrice(comicToEdit.cover_price?.toString() || '0');
      setPurchasePrice(comicToEdit.purchase_price?.toString() || '0');
      setIsbn(comicToEdit.isbn || comicToEdit.ean || '');
      setCoverUrl(comicToEdit.cover_url || '');
      setLocalCoverPath(comicToEdit.local_cover_path || '');
      setStatus(comicToEdit.status || 'Acquistato');
      setChannel(comicToEdit.channel || 'Fumetteria');
      setNotes(comicToEdit.notes || '');
    } else {
      setTitle('');
      setSeries('');
      setIssueNumber('');
      setVariantInfo('');
      setPublisherId(publishers[0]?.id || '');
      setYear(currentYear);
      setMonth(currentMonth);
      setReleaseDate('');
      setPurchaseDate('');
      setCoverPrice('0');
      setPurchasePrice('0');
      setIsbn('');
      setCoverUrl('');
      setLocalCoverPath('');
      setStatus('Acquistato');
      setChannel('Fumetteria');
      setNotes('');
    }
    setSearchResults([]);
    setSearchError(null);
  }, [comicToEdit, isOpen, currentYear, currentMonth, publishers]);

  if (!isOpen) return null;

  const handleSearchMetadata = async () => {
    if (!title.trim()) {
      setSearchError('Inserisci un titolo prima di avviare la ricerca');
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    try {
      const pubName = publishers.find(p => p.id === Number(publisherId))?.name || '';
      const results = await api.searchMetadata(title.trim(), issueNumber.trim(), pubName);
      setSearchResults(results);
      if (results.length === 0) {
        setSearchError('Nessun risultato trovato. Puoi incollare un URL o caricare un file manualmente.');
      }
    } catch (e: any) {
      setSearchError(e.message || 'Errore nella ricerca');
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectResult = (res: MetadataSearchResult) => {
    if (res.coverUrl) {
      setCoverUrl(res.coverUrl);
      setLocalCoverPath(''); // Reset cached cover so the new cover is downloaded & displayed
    }
    if (res.isbn) {
      setIsbn(res.isbn);
    }
    // Auto-fill price from metadata result (always updates the input, user can still freely edit it)
    if (res.price !== undefined && res.price !== null) {
      setPurchasePrice(String(res.price));
    } else if (res.coverPrice !== undefined && res.coverPrice !== null) {
      setPurchasePrice(String(res.coverPrice));
    }

    if (res.coverPrice !== undefined && res.coverPrice !== null) {
      setCoverPrice(String(res.coverPrice));
    } else if (res.price !== undefined && res.price !== null) {
      setCoverPrice(String(res.price));
    }

    // If publisher is not selected or matches
    if (res.publisher) {
      const match = publishers.find(p => p.name.toLowerCase().includes(res.publisher!.toLowerCase()));
      if (match) setPublisherId(match.id);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const { localPath } = await api.uploadCover(file);
      setLocalCoverPath(localPath);
      setCoverUrl(localPath);
    } catch (err) {
      alert('Errore nel caricamento del file');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Il titolo è obbligatorio');
      return;
    }

    setIsSaving(true);
    try {
      const sanitizedCoverPrice = parseFloat(String(coverPrice).replace(',', '.')) || 0;
      const sanitizedPurchasePrice = parseFloat(String(purchasePrice).replace(',', '.')) || 0;

      const payload: Partial<Comic> = {
        title: title.trim(),
        series: series.trim() || undefined,
        issue_number: issueNumber.trim() || undefined,
        variant_info: variantInfo.trim() || undefined,
        publisher_id: publisherId ? Number(publisherId) : undefined,
        year,
        month,
        release_date: releaseDate || undefined,
        purchase_date: purchaseDate || undefined,
        cover_price: sanitizedCoverPrice,
        purchase_price: sanitizedPurchasePrice,
        isbn: isbn.trim() || undefined,
        ean: isbn.trim() || undefined,
        cover_url: coverUrl.trim() || undefined,
        local_cover_path: localCoverPath || undefined,
        status,
        channel,
        notes: notes.trim() || undefined
      };

      if (comicToEdit && comicToEdit.id && comicToEdit.id > 0) {
        await api.updateComic(comicToEdit.id, payload);
      } else {
        await api.createComic(payload);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      alert(err.message || 'Errore durante il salvataggio');
    } finally {
      setIsSaving(false);
    }
  };

  const googleImagesUrl = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${title} ${issueNumber} comic cover`)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {comicToEdit ? 'Modifica Scheda Fumetto' : 'Aggiungi Nuovo Fumetto'}
              </h2>
              <p className="text-xs text-slate-400">
                Inserimento record con ricerca metadati online, copertina e contabilità
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

        {/* Form Body */}
        <form onSubmit={handleSave} className="p-6 overflow-y-auto grow space-y-6">
          {/* Section 1: Identification & Online Search */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-indigo-400" />
                1. Dati Principali & Ricerca Automatica Online
              </span>
              <a 
                href={googleImagesUrl} 
                target="_blank" 
                rel="noreferrer"
                className="text-[11px] text-slate-400 hover:text-indigo-300 flex items-center gap-1 transition"
              >
                Cerca su Google Immagini <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Titolo / Testata *
                </label>
                <input 
                  type="text"
                  required
                  placeholder="es. Absolute Batman, Spider-Man Masterseries..."
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Numero / Volume (#)
                </label>
                <input 
                  type="text"
                  placeholder="es. 15, Vol. 1, 3/10..."
                  value={issueNumber}
                  onChange={e => setIssueNumber(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Variante / Edizione Speciale
                </label>
                <input 
                  type="text"
                  placeholder="es. CVR A Nick Dragotta, Foil, Blank Cover, Variant Cappuccio..."
                  value={variantInfo}
                  onChange={e => setVariantInfo(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Casa Editrice / Categoria *
                </label>
                <select 
                  value={publisherId}
                  onChange={e => setPublisherId(e.target.value ? Number(e.target.value) : '')}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="">Seleziona Editore</option>
                  {publishers.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Pulsante Ricerca Automatica Metadati */}
            {/* Pulsante Ricerca Automatica Metadati */}
            <div className="pt-2">
              <button
                type="button"
                onClick={handleSearchMetadata}
                disabled={isSearching || !title.trim()}
                className="w-full py-2.5 px-4 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-200 font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50 cursor-pointer shadow-md shadow-indigo-600/10"
              >
                {isSearching ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                    Ricerca in corso su HoVistoCose, MangaDex e Open Library...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 text-indigo-400" />
                    Cerca su HoVistoCose & Database Online (ISBN/EAN e Copertina)
                  </>
                )}
              </button>

              {searchError && (
                <p className="text-xs text-amber-400 mt-2 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg">
                  {searchError}
                </p>
              )}

              {/* Selettore Anteprime Copertine (2-4 risultati) */}
              {searchResults.length > 0 && (
                <div className="mt-3 bg-slate-900 p-3.5 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2.5">
                    <span>Risultati trovati ({searchResults.length}) - Clicca per selezionare:</span>
                    <span className="text-[10px] text-emerald-400 font-mono">Fonte primaria: HoVistoCose</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {searchResults.map((res, i) => {
                      const isSelected = coverUrl === res.coverUrl;
                      const thumb = res.coverUrl && res.coverUrl.includes('hovistocose.it')
                        ? `/api/proxy/image?url=${encodeURIComponent(res.coverUrl)}`
                        : (res.thumbnailUrl || res.coverUrl);

                      return (
                        <div 
                          key={i}
                          onClick={() => handleSelectResult(res)}
                          className={`relative border rounded-lg p-2 cursor-pointer transition flex flex-col justify-between ${
                            isSelected 
                              ? 'bg-indigo-950/70 border-indigo-500 ring-2 ring-indigo-500/40 shadow-lg shadow-indigo-500/20' 
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <div className="aspect-3/4 w-full bg-slate-900 rounded overflow-hidden mb-2 relative">
                            {thumb ? (
                              <img 
                                src={thumb} 
                                alt={res.title}
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-slate-600 text-[10px]">
                                No Immagine
                              </div>
                            )}
                            {isSelected && (
                              <div className="absolute top-1 right-1 bg-indigo-600 rounded-full p-1 text-white shadow">
                                <Check className="w-3 h-3" />
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="text-[11px] font-semibold text-white truncate" title={res.title}>
                              {res.title}
                            </div>
                            <div className="text-[10px] text-slate-400 flex justify-between items-center mt-1">
                              <span className="font-medium text-slate-300">{res.source}</span>
                              <div className="flex items-center gap-1">
                                {(res.price || res.coverPrice) && (
                                  <span className="font-mono text-[9px] text-emerald-400 font-bold px-1 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">
                                    €{Number(res.price || res.coverPrice).toFixed(2)}
                                  </span>
                                )}
                                {res.ean && <span className="font-mono text-[9px] text-indigo-300 font-bold">EAN ✓</span>}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Temporal & Economics */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-4">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
              2. Tempistica & Contabilità Economica
            </span>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Anno *</label>
                <select 
                  value={year}
                  onChange={e => setYear(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
                >
                  {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Mese *</label>
                <select 
                  value={month}
                  onChange={e => setMonth(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
                >
                  {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Prezzo Pagato (€) *</label>
                <input 
                  type="number"
                  step="0.01"
                  required
                  value={purchasePrice}
                  onChange={e => setPurchasePrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-indigo-500 focus:outline-hidden font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Prezzo Copertina (€)</label>
                <input 
                  type="number"
                  step="0.01"
                  value={coverPrice}
                  onChange={e => setCoverPrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Stato</label>
                <select 
                  value={status}
                  onChange={e => setStatus(e.target.value as ComicStatus)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="In uscita">In uscita</option>
                  <option value="Preordinato">Preordinato</option>
                  <option value="Acquistato">Acquistato</option>
                  <option value="Da leggere">Da leggere</option>
                  <option value="In lettura">In lettura</option>
                  <option value="Letto">Letto</option>
                  <option value="Venduto">Venduto</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Canale Acquisto</label>
                <select 
                  value={channel}
                  onChange={e => setChannel(e.target.value as PurchaseChannel)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
                >
                  <option value="Fumetteria">Fumetteria</option>
                  <option value="Edicola">Edicola</option>
                  <option value="HVC / Preordine">HVC / Preordine</option>
                  <option value="Vinted / Usato">Vinted / Usato</option>
                  <option value="Ordine Online">Ordine Online</option>
                  <option value="Fiera / Evento">Fiera / Evento</option>
                  <option value="Altro">Altro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Data Uscita / Acquisto</label>
                <input 
                  type="date"
                  value={releaseDate}
                  onChange={e => setReleaseDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Barcode, Cover URL & Notes */}
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-4 space-y-4">
            <span className="text-xs font-bold text-amber-400 uppercase tracking-wider block">
              3. Identificativo Univoco & Copertina
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Codice a Barre (ISBN / EAN / UPC)
                </label>
                <div className="relative">
                  <input 
                    type="text"
                    placeholder="es. 9788828795551"
                    value={isbn}
                    onChange={e => setIsbn(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-8 pr-3 py-2 text-white text-sm font-mono focus:border-indigo-500 focus:outline-hidden"
                  />
                  <Barcode className="w-4 h-4 text-slate-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  URL Copertina / Carica File
                </label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    placeholder="https://..."
                    value={coverUrl}
                    onChange={e => setCoverUrl(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
                  />
                  <label className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer flex items-center gap-1 text-xs transition shrink-0">
                    <Upload className="w-4 h-4" />
                    <span>Upload</span>
                    <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  </label>
                </div>
              </div>
            </div>

            {(coverUrl || localCoverPath) && (
              <div className="flex items-center gap-4 p-3 bg-slate-900/80 border border-slate-800 rounded-lg">
                <div className="w-14 h-20 bg-slate-950 rounded border border-slate-700 overflow-hidden shrink-0">
                  <img
                    src={getComicCoverUrl({ local_cover_path: localCoverPath, cover_url: coverUrl }) || ''}
                    alt="Anteprima copertina"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                <div className="text-xs space-y-1">
                  <div className="font-semibold text-slate-200">Anteprima Copertina Attuale</div>
                  <div className="text-slate-400 text-[11px] truncate max-w-md">
                    {coverUrl || localCoverPath}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCoverUrl('');
                      setLocalCoverPath('');
                    }}
                    className="text-[11px] text-red-400 hover:text-red-300 font-medium cursor-pointer"
                  >
                    Rimuovi copertina
                  </button>
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Note / Note Edizione</label>
              <textarea 
                rows={2}
                placeholder="es. Firmato da Simone Di Meo al Comicon, tiratura limitata, condizioni perfette..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:border-indigo-500 focus:outline-hidden"
              />
            </div>
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm shadow-lg shadow-indigo-600/30 flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
            >
              {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
              {comicToEdit ? 'Aggiorna Fumetto' : 'Salva Fumetto'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
