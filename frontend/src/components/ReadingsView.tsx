import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Reading, PurchasedComic } from '../types';
import { api } from '../api';
import { getComicCoverUrl } from '../utils/coverHelper';
import { 
  BookOpen, 
  Plus, 
  Trash2, 
  Star, 
  CheckCircle, 
  Search, 
  Filter, 
  X, 
  Check, 
  ChevronDown,
  Calendar,
  Layers,
  Sparkles
} from 'lucide-react';

interface ReadingsViewProps {
  currentYear: string;
  currentMonth: string;
}

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

type CategoryFilter = 'Tutti' | 'Marvel' | 'DC' | 'Manga' | 'Altro';

export const ReadingsView: React.FC<ReadingsViewProps> = ({ currentYear, currentMonth }) => {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [isAdding, setIsAdding] = useState(false);

  // Purchased comics collection
  const [purchasedComics, setPurchasedComics] = useState<PurchasedComic[]>([]);
  const [isLoadingComics, setIsLoadingComics] = useState(false);

  // Form & Search state
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('Tutti');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedComic, setSelectedComic] = useState<PurchasedComic | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Cover preview modal
  const [previewCover, setPreviewCover] = useState<{ title: string; src: string } | null>(null);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadReadings();
  }, [currentYear, selectedMonth]);

  useEffect(() => {
    loadPurchasedComics();
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const loadReadings = async () => {
    try {
      const items = await api.getReadings(currentYear, selectedMonth);
      setReadings(items);
    } catch (e) {
      console.error('Errore nel caricamento delle letture:', e);
    }
  };

  const loadPurchasedComics = async () => {
    setIsLoadingComics(true);
    try {
      const items = await api.getPurchasedComics();
      setPurchasedComics(items);
    } catch (e) {
      console.error('Errore nel caricamento dei fumetti acquistati:', e);
    } finally {
      setIsLoadingComics(false);
    }
  };

  // Letter-by-letter live filtering across purchased comics based on category & search query
  const filteredComics = useMemo(() => {
    let list = purchasedComics;

    // Filter by selected category (Marvel, DC, Manga, Altro)
    if (selectedCategory !== 'Tutti') {
      list = list.filter(c => c.category === selectedCategory);
    }

    // Filter letter by letter: exclude titles that don't match the query
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/);
      list = list.filter(c => {
        const fullString = `${c.title} ${c.series || ''} ${c.issue_number ? '#' + c.issue_number : ''} ${c.variant_info || ''}`.toLowerCase();
        return tokens.every(token => fullString.includes(token));
      });
    }

    return list;
  }, [purchasedComics, selectedCategory, searchQuery]);

  const handleSelectComic = (comic: PurchasedComic) => {
    setSelectedComic(comic);
    setSearchQuery(comic.title);
    setSelectedCategory(comic.category);
    setIsDropdownOpen(false);
  };

  const handleClearSelectedComic = () => {
    setSelectedComic(null);
    setSearchQuery('');
  };

  const handleAddReading = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = searchQuery.trim();
    if (!finalTitle) {
      alert('Inserisci o seleziona il titolo di un fumetto');
      return;
    }

    setIsSaving(true);
    try {
      const readingCategory = selectedComic?.category || (selectedCategory === 'Tutti' ? 'Altro' : selectedCategory);

      await api.createReading({
        comic_id: selectedComic?.id || undefined,
        title: finalTitle,
        year: currentYear,
        month: selectedMonth,
        category: readingCategory,
        rating,
        notes: notes.trim() || undefined
      });

      // Reset form
      setSearchQuery('');
      setSelectedComic(null);
      setNotes('');
      setRating(5);
      setIsAdding(false);
      loadReadings();
    } catch (e: any) {
      alert('Errore nel salvataggio della lettura: ' + (e.message || 'Errore sconosciuto'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Eliminare questa lettura registrata?')) return;
    try {
      await api.deleteReading(id);
      loadReadings();
    } catch (e) {
      alert('Errore nella cancellazione');
    }
  };

  // Helper for category badge styling
  const getCategoryBadgeClass = (category?: string) => {
    switch (category) {
      case 'DC':
        return 'bg-sky-950/70 text-sky-300 border-sky-800/50';
      case 'Marvel':
        return 'bg-rose-950/70 text-rose-300 border-rose-800/50';
      case 'Manga':
        return 'bg-purple-950/70 text-purple-300 border-purple-800/50';
      default:
        return 'bg-emerald-950/70 text-emerald-300 border-emerald-800/50';
    }
  };

  // Monthly statistics calculation
  const totalRead = readings.length;
  const countManga = readings.filter(r => r.category === 'Manga').length;
  const countMarvel = readings.filter(r => r.category === 'Marvel').length;
  const countDC = readings.filter(r => r.category === 'DC').length;
  const countAltro = readings.filter(r => r.category !== 'Manga' && r.category !== 'Marvel' && r.category !== 'DC').length;
  const avgRating = totalRead > 0 
    ? (readings.reduce((acc, r) => acc + (r.rating || 5), 0) / totalRead).toFixed(1) 
    : '0.0';

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="glass-surface rounded-2xl p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-purple-400" />
              Diario delle Letture ({selectedMonth} {currentYear})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Registra i fumetti che leggi cercando direttamente tra tutti quelli che hai acquistato negli anni.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-black/40 border border-white/8 text-white text-xs px-3 py-1.5 rounded-xl focus:outline-hidden cursor-pointer"
            >
              {MONTHS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button
              onClick={() => setIsAdding(!isAdding)}
              className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95 border border-purple-400/30"
            >
              {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              {isAdding ? 'Chiudi' : 'Nuova Lettura'}
            </button>
          </div>
        </div>

        {/* Monthly Summary Statistics Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 mb-5 p-3 rounded-2xl bg-white/2 border border-white/6 text-xs">
          <div className="p-2.5 rounded-xl glass-surface-elevated flex flex-col justify-between">
            <span className="text-[11px] text-slate-400">Totale Letti</span>
            <span className="text-sm sm:text-base font-bold text-white font-mono mt-1">{totalRead}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-sky-950/20 border border-sky-500/20 flex flex-col justify-between">
            <span className="text-[11px] text-sky-400">DC Comics</span>
            <span className="text-sm sm:text-base font-bold text-sky-300 font-mono mt-1">{countDC}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-500/20 flex flex-col justify-between">
            <span className="text-[11px] text-rose-400">Marvel</span>
            <span className="text-sm sm:text-base font-bold text-rose-300 font-mono mt-1">{countMarvel}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-purple-950/20 border border-purple-500/20 flex flex-col justify-between">
            <span className="text-[11px] text-purple-400">Manga</span>
            <span className="text-sm sm:text-base font-bold text-purple-300 font-mono mt-1">{countManga}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 flex flex-col justify-between">
            <span className="text-[11px] text-emerald-400">Altro</span>
            <span className="text-sm sm:text-base font-bold text-emerald-300 font-mono mt-1">{countAltro}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/20 flex flex-col justify-between">
            <span className="text-[11px] text-amber-400">Voto Medio</span>
            <div className="flex items-center gap-1 mt-1">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span className="text-sm sm:text-base font-bold text-amber-300 font-mono">{avgRating}</span>
            </div>
          </div>
        </div>

        {/* Dynamic Form: Real-time letter-by-letter search & category filter */}
        {isAdding && (
          <form onSubmit={handleAddReading} className="bg-slate-950 p-4 sm:p-5 rounded-xl border border-purple-500/30 mb-6 space-y-4 shadow-2xl relative">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-400" />
                Registra Fumetto Letto
              </h4>
              <span className="text-[11px] text-slate-400 font-mono">
                {purchasedComics.length} fumetti in collezione
              </span>
            </div>

            {/* Row 1: Category Filter & Letter-by-letter Search Combobox */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
              {/* Category Dropdown Menu */}
              <div className="md:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5 flex items-center gap-1">
                  <Filter className="w-3.5 h-3.5 text-indigo-400" /> Categoria:
                </label>
                <select
                  value={selectedCategory}
                  onChange={e => {
                    setSelectedCategory(e.target.value as CategoryFilter);
                    setIsDropdownOpen(true);
                  }}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-semibold focus:outline-hidden focus:border-purple-500 cursor-pointer shadow-inner"
                >
                  <option value="Tutti">📁 Tutte le Categorie ({purchasedComics.length})</option>
                  <option value="Marvel">🔴 Marvel Comics ({purchasedComics.filter(c => c.category === 'Marvel').length})</option>
                  <option value="DC">🔵 DC Comics ({purchasedComics.filter(c => c.category === 'DC').length})</option>
                  <option value="Manga">🟣 Manga ({purchasedComics.filter(c => c.category === 'Manga').length})</option>
                  <option value="Altro">🟢 Altro / Graphic Novel ({purchasedComics.filter(c => c.category === 'Altro').length})</option>
                </select>
              </div>

              {/* Autocomplete Input with letter-by-letter filtering */}
              <div className="md:col-span-8 relative" ref={searchContainerRef}>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Search className="w-3.5 h-3.5 text-purple-400" />
                    Cerca Titolo (scrivi lettera per lettera):
                  </span>
                  {selectedComic && (
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Collegato ad acquisto
                    </span>
                  )}
                </label>

                <div className="relative">
                  <input 
                    type="text"
                    required
                    placeholder={`Scrivi il titolo (es. Absolute Batman, Berserk, Spider-Man...)...`}
                    value={searchQuery}
                    onChange={e => {
                      setSearchQuery(e.target.value);
                      setIsDropdownOpen(true);
                      if (selectedComic && selectedComic.title !== e.target.value) {
                        setSelectedComic(null);
                      }
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-9 pr-9 py-2 text-white text-xs focus:outline-hidden focus:border-purple-500 shadow-inner"
                  />
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />

                  {searchQuery && (
                    <button
                      type="button"
                      onClick={handleClearSelectedComic}
                      className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 p-0.5 rounded transition"
                      title="Cancella testo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown with live filtered comics */}
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto">
                    {/* Header with match count */}
                    <div className="bg-slate-950 px-3 py-1.5 border-b border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
                      <span>
                        {filteredComics.length} fumetti trovati
                        {selectedCategory !== 'Tutti' && ` in ${selectedCategory}`}
                      </span>
                      <span className="text-[10px] text-purple-400 font-mono">
                        Filtro attivo lettera per lettera
                      </span>
                    </div>

                    {filteredComics.length === 0 ? (
                      <div className="p-4 text-center">
                        <p className="text-xs text-slate-400 mb-2">
                          Nessun fumetto trovato con "{searchQuery}" nella categoria {selectedCategory}.
                        </p>
                        <button
                          type="button"
                          onClick={() => setIsDropdownOpen(false)}
                          className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold underline cursor-pointer"
                        >
                          Usa comunque "{searchQuery}" come titolo manuale
                        </button>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-800/70">
                        {filteredComics.slice(0, 30).map((comic) => {
                          const cover = getComicCoverUrl(comic);
                          const isSelected = selectedComic?.id === comic.id;

                          return (
                            <div
                              key={comic.id}
                              onClick={() => handleSelectComic(comic)}
                              className={`p-2.5 flex items-center gap-3 cursor-pointer transition hover:bg-purple-950/30 ${
                                isSelected ? 'bg-purple-950/60 border-l-4 border-purple-500' : ''
                              }`}
                            >
                              {/* Mini Thumbnail */}
                              <div className="w-7 h-10 shrink-0 bg-slate-950 rounded border border-slate-800 overflow-hidden flex items-center justify-center">
                                {cover ? (
                                  <img 
                                    src={cover} 
                                    alt={comic.title} 
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover" 
                                    onError={(e) => {
                                      (e.currentTarget as HTMLElement).style.display = 'none';
                                    }}
                                  />
                                ) : (
                                  <BookOpen className="w-3.5 h-3.5 text-slate-600" />
                                )}
                              </div>

                              {/* Title & Metadata */}
                              <div className="grow min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-white truncate max-w-[340px]" title={comic.title}>
                                    {comic.title}
                                  </span>
                                  {comic.issue_number && (
                                    <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-800 text-slate-300">
                                      #{comic.issue_number}
                                    </span>
                                  )}
                                  {comic.variant_info && (
                                    <span className="text-[9px] px-1 py-0.2 rounded bg-purple-900/40 text-purple-300 border border-purple-800/40 truncate max-w-[120px]">
                                      ✨ {comic.variant_info}
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                                  <span className={`px-1.5 py-0.2 rounded font-bold border ${getCategoryBadgeClass(comic.category)}`}>
                                    {comic.category}
                                  </span>
                                  <span>
                                    Acquistato: {comic.month} {comic.year}
                                  </span>
                                  <span className="text-slate-600">•</span>
                                  <span className="italic text-slate-400">{comic.channel}</span>
                                </div>
                              </div>

                              {isSelected && (
                                <div className="shrink-0 p-1 rounded-full bg-purple-600 text-white">
                                  <Check className="w-3 h-3" />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected Comic Preview Card */}
            {selectedComic && (
              <div className="p-3 rounded-xl bg-purple-950/20 border border-purple-500/30 flex items-center justify-between gap-3 animate-fadeIn">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-14 shrink-0 bg-slate-900 rounded-md border border-purple-500/40 overflow-hidden shadow">
                    {getComicCoverUrl(selectedComic) ? (
                      <img 
                        src={getComicCoverUrl(selectedComic)!} 
                        alt={selectedComic.title} 
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-600">
                        <BookOpen className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-wide">Fumetto selezionato dalla collezione</span>
                    <h5 className="text-xs font-bold text-white truncate" title={selectedComic.title}>
                      {selectedComic.title}
                    </h5>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                      <span className={`px-1.5 py-0.2 rounded font-semibold border ${getCategoryBadgeClass(selectedComic.category)}`}>
                        {selectedComic.category}
                      </span>
                      <span>Acquisto: {selectedComic.month} {selectedComic.year}</span>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleClearSelectedComic}
                  className="px-2.5 py-1 text-[11px] font-semibold text-purple-300 hover:text-white bg-purple-900/40 hover:bg-purple-900/60 border border-purple-700/40 rounded-lg transition"
                >
                  Cambia
                </button>
              </div>
            )}

            {/* Row 2: Star Rating & Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1">
              {/* Interactive Star Rating */}
              <div className="sm:col-span-4">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Valutazione Lettura:
                </label>
                <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const isFilled = (hoverRating !== null ? hoverRating : rating) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRating(star)}
                        onMouseEnter={() => setHoverRating(star)}
                        onMouseLeave={() => setHoverRating(null)}
                        className="p-1 hover:scale-125 transition-transform cursor-pointer"
                        title={`${star} stelle`}
                      >
                        <Star 
                          className={`w-4 h-4 ${
                            isFilled 
                              ? 'fill-amber-400 text-amber-400' 
                              : 'text-slate-600 hover:text-slate-500'
                          }`} 
                        />
                      </button>
                    );
                  })}
                  <span className="text-xs font-mono font-bold text-amber-300 ml-2">
                    {rating}/5
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div className="sm:col-span-8">
                <label className="block text-[11px] font-semibold text-slate-300 mb-1.5">
                  Note / Impressioni (opzionale):
                </label>
                <input
                  type="text"
                  placeholder="Es. Finale stupendo, disegni incredibili, volume autoconclusivo..."
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-hidden focus:border-purple-500"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button 
                type="button" 
                onClick={() => setIsAdding(false)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Annulla
              </button>
              <button 
                type="submit"
                disabled={isSaving}
                className="px-5 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg transition shadow-md shadow-purple-600/30 flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                {isSaving ? 'Salvataggio...' : 'Registra nel Diario'}
              </button>
            </div>
          </form>
        )}

        {/* Readings List Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {readings.length === 0 ? (
            <div className="col-span-full py-12 text-center text-slate-500 italic bg-slate-950/40 rounded-xl border border-slate-800/60">
              <BookOpen className="w-8 h-8 mx-auto mb-2 opacity-40 text-purple-400" />
              Nessuna lettura registrata per {selectedMonth} {currentYear}.
              <p className="text-[11px] text-slate-600 mt-1">
                Fai clic su "Nuova Lettura" per cercare e registrare il tuo primo albo del mese.
              </p>
            </div>
          ) : (
            readings.map((r) => {
              const coverSrc = getComicCoverUrl({ local_cover_path: r.local_cover_path, cover_url: r.cover_url });

              return (
                <div 
                  key={r.id}
                  className="glass-surface-elevated p-3.5 rounded-xl transition-all flex flex-col justify-between hover:-translate-y-0.5 hover:shadow-md group"
                >
                  <div>
                    {/* Header: Category Badge & Delete Button */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getCategoryBadgeClass(r.category)}`}>
                          {r.category || 'Fumetto'}
                        </span>
                        {r.purchase_year && (
                          <span className="text-[9px] text-slate-500 font-mono">
                            Acq. {r.purchase_month?.slice(0, 3)} '{r.purchase_year.slice(-2)}
                          </span>
                        )}
                      </div>

                      <button 
                        onClick={() => handleDelete(r.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 rounded-md hover:bg-rose-500/10 transition-all cursor-pointer active:scale-90"
                        title="Elimina lettura"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Middle: Miniature Cover & Title Info */}
                    <div className="flex gap-3 mb-3">
                      {/* Clickable thumbnail to enlarge */}
                      <div 
                        className="w-10 h-14 shrink-0 bg-slate-900 rounded-md border border-white/10 overflow-hidden relative cursor-pointer group/thumb shadow-xs"
                        onClick={() => {
                          if (coverSrc) setPreviewCover({ title: r.title, src: coverSrc });
                        }}
                        title={coverSrc ? "Clicca per ingrandire copertina" : "Nessuna copertina"}
                      >
                        {coverSrc ? (
                          <img 
                            src={coverSrc} 
                            alt={r.title} 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover group-hover/thumb:scale-110 transition duration-200"
                            onError={(e) => {
                              (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-600 bg-slate-900">
                            <BookOpen className="w-4 h-4 stroke-1 text-slate-500" />
                          </div>
                        )}
                      </div>

                      <div className="grow min-w-0">
                        <h4 className="text-xs font-bold text-white line-clamp-2 leading-snug group-hover:text-purple-300 transition" title={r.title}>
                          {r.title}
                        </h4>

                        {r.issue_number && (
                          <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                            Albo #{r.issue_number}
                          </span>
                        )}

                        {r.notes && (
                          <p className="text-[11px] text-slate-400 mt-1 italic line-clamp-2 bg-slate-900/60 p-1 rounded border border-slate-800/40">
                            "{r.notes}"
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer: Rating Stars & Letto Status */}
                  <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between text-[11px]">
                    <div className="flex text-amber-400 items-center gap-0.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-3.5 h-3.5 ${
                            i < (r.rating || 5) 
                              ? 'fill-amber-400 text-amber-400' 
                              : 'text-slate-700'
                          }`} 
                        />
                      ))}
                      <span className="text-[10px] text-amber-300 font-mono font-bold ml-1">
                        {r.rating || 5}/5
                      </span>
                    </div>

                    <span className="text-emerald-400 font-semibold flex items-center gap-1 text-[10px] bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800/40">
                      <CheckCircle className="w-3 h-3" /> Letto
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Enlarged Cover Preview Modal */}
      {previewCover && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4"
          onClick={() => setPreviewCover(null)}
        >
          <div className="bg-slate-900 p-3 rounded-2xl max-w-sm w-full border border-slate-700 shadow-2xl relative" onClick={e => e.stopPropagation()}>
            <div className="aspect-3/4 w-full rounded-xl overflow-hidden mb-3 bg-black">
              <img 
                src={previewCover.src} 
                alt={previewCover.title} 
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain"
              />
            </div>
            <h4 className="text-xs font-bold text-white truncate text-center mb-2">{previewCover.title}</h4>
            <button 
              onClick={() => setPreviewCover(null)}
              className="w-full py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
            >
              Chiudi Anteprima
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
