import React, { useState, useEffect, useMemo, useRef } from 'react';
import { SaleRefund, Comic, PurchasedComic } from '../types';
import { api } from '../api';
import { getComicCoverUrl, handleCoverError } from '../utils/coverHelper';
import { 
  DollarSign, 
  Plus, 
  Trash2, 
  Edit2, 
  Search, 
  TrendingUp, 
  ShoppingBag, 
  Calendar, 
  X, 
  Check, 
  Tag, 
  BookOpen, 
  ExternalLink,
  ChevronDown,
  Sparkles,
  ArrowUpRight
} from 'lucide-react';

interface SalesViewProps {
  currentYear: string;
  currentMonth: string;
}

const MONTHS = [
  'Tutti i mesi', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const CHANNELS = [
  'Vinted',
  'eBay',
  'Wallapop',
  'Subito.it',
  'Fumetteria / Scambio',
  'Privato / Fiera',
  'Altro'
];

export const SalesView: React.FC<SalesViewProps> = ({ currentYear, currentMonth }) => {
  const [sales, setSales] = useState<SaleRefund[]>([]);
  const [comicsCollection, setComicsCollection] = useState<PurchasedComic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingCollection, setIsLoadingCollection] = useState(false);
  
  // Filters
  const [selectedYear, setSelectedYear] = useState<string>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<string>('Tutti i mesi');
  const [searchFilter, setSearchFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('Tutti');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<SaleRefund | null>(null);
  const [saleType, setSaleType] = useState<'registered' | 'custom'>('registered');
  
  // Form State
  const [comicSearchQuery, setComicSearchQuery] = useState('');
  const [selectedComic, setSelectedComic] = useState<PurchasedComic | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleChannel, setSaleChannel] = useState('Vinted');
  const [saleYear, setSaleYear] = useState(currentYear);
  const [saleMonth, setSaleMonth] = useState(currentMonth);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [saleNotes, setSaleNotes] = useState('');
  const [markAsSold, setMarkAsSold] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    loadSales();
    loadComicsCollection();
  }, [selectedYear, selectedMonth]);

  const loadSales = async () => {
    setIsLoading(true);
    try {
      const monthParam = selectedMonth === 'Tutti i mesi' ? undefined : selectedMonth;
      const list = await api.getSales(selectedYear === 'Tutti gli anni' ? undefined : selectedYear, monthParam);
      setSales(list || []);
    } catch (e) {
      console.error('Errore caricamento vendite:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadComicsCollection = async () => {
    setIsLoadingCollection(true);
    try {
      // Prova prima con getPurchasedComics (filtra totali ordine e arricchisce categorie)
      let all = await api.getPurchasedComics().catch(() => []);
      // Se vuoto, fallback a getComics per garantire la massima compatibilità
      if (!all || all.length === 0) {
        const fallback = await api.getComics({}).catch(() => []);
        if (fallback && fallback.length > 0) {
          all = fallback.map(c => ({
            ...c,
            category: 'Altro' as const
          }));
        }
      }
      setComicsCollection(all || []);
    } catch (e) {
      console.error('Errore caricamento collezione:', e);
    } finally {
      setIsLoadingCollection(false);
    }
  };

  // Filtered Comics for Search Dropdown (multi-token search su titolo, collana, editore, numero)
  const searchResultsComics = useMemo(() => {
    const q = comicSearchQuery.trim().toLowerCase();
    if (!q) {
      return comicsCollection.slice(0, 15);
    }
    const tokens = q.split(/\s+/);
    return comicsCollection.filter(c => {
      const fullText = `${c.title || ''} ${c.series || ''} ${c.issue_number ? '#' + c.issue_number : ''} ${c.publisher_name || ''} ${c.category || ''}`.toLowerCase();
      return tokens.every(token => fullText.includes(token));
    }).slice(0, 25);
  }, [comicsCollection, comicSearchQuery]);

  // Open Modal for New Sale
  const handleOpenAddModal = () => {
    setEditingSale(null);
    setSaleType('registered');
    setSelectedComic(null);
    setComicSearchQuery('');
    setCustomTitle('');
    setSalePrice('');
    setSaleChannel('Vinted');
    setSaleYear(currentYear);
    setSaleMonth(currentMonth);
    setSaleDate(new Date().toISOString().split('T')[0]);
    setSaleNotes('');
    setMarkAsSold(true);
    setIsModalOpen(true);
    loadComicsCollection();
  };

  // Open Modal to Edit Existing Sale
  const handleOpenEditModal = (sale: SaleRefund) => {
    setEditingSale(sale);
    if (sale.comic_id) {
      setSaleType('registered');
      const found = comicsCollection.find(c => c.id === sale.comic_id);
      setSelectedComic(found || null);
      setComicSearchQuery(sale.title);
    } else {
      setSaleType('custom');
      setCustomTitle(sale.title);
    }
    setSalePrice(sale.price.toString());
    setSaleChannel(sale.channel || 'Vinted');
    setSaleYear(sale.year || currentYear);
    setSaleMonth(sale.month || currentMonth);
    setSaleDate(sale.date || (sale.created_at ? sale.created_at.split(' ')[0] : ''));
    setSaleNotes(sale.notes || '');
    setMarkAsSold(false);
    setIsModalOpen(true);
    loadComicsCollection();
  };

  const handleSelectComic = (comic: PurchasedComic) => {
    setSelectedComic(comic);
    setComicSearchQuery(comic.title);
    // Suggest sale price based on purchase price if not filled
    if (!salePrice) {
      const suggested = comic.purchase_price || 0;
      if (suggested > 0) setSalePrice(suggested.toFixed(2));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const finalTitle = saleType === 'registered' ? (selectedComic ? selectedComic.title : comicSearchQuery.trim()) : customTitle.trim();
    if (!finalTitle) {
      alert('Inserisci il titolo del fumetto venduto.');
      return;
    }

    const priceNum = parseFloat(salePrice.replace(',', '.'));
    if (isNaN(priceNum) || priceNum < 0) {
      alert('Inserisci un prezzo di vendita valido.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: finalTitle,
        price: priceNum,
        channel: saleChannel,
        year: saleYear,
        month: saleMonth,
        date: saleDate,
        notes: saleNotes.trim() || undefined,
        comic_id: saleType === 'registered' && selectedComic ? selectedComic.id : undefined,
        markAsSold: saleType === 'registered' && !!selectedComic && markAsSold
      };

      if (editingSale) {
        await api.updateSale(editingSale.id, payload);
      } else {
        await api.createSale(payload);
      }

      setIsModalOpen(false);
      loadSales();
      loadComicsCollection();
    } catch (err: any) {
      alert(err.message || 'Errore durante il salvataggio della vendita');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number, title: string) => {
    if (!window.confirm(`Sei sicuro di voler eliminare la vendita di "${title}"?`)) return;
    try {
      await api.deleteSale(id);
      loadSales();
    } catch (e: any) {
      alert(e.message || 'Errore durante la cancellazione');
    }
  };

  // Filtered Sales List
  const filteredSales = useMemo(() => {
    return sales.filter(s => {
      const matchesSearch = !searchFilter.trim() || 
        s.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
        (s.channel && s.channel.toLowerCase().includes(searchFilter.toLowerCase())) ||
        (s.notes && s.notes.toLowerCase().includes(searchFilter.toLowerCase()));
      
      const matchesChannel = channelFilter === 'Tutti' || s.channel === channelFilter;
      return matchesSearch && matchesChannel;
    });
  }, [sales, searchFilter, channelFilter]);

  // Statistics & KPI
  const stats = useMemo(() => {
    const totalRevenue = filteredSales.reduce((acc, s) => acc + s.price, 0);
    const count = filteredSales.length;
    
    // Profit Calculation for items with purchase_price
    let totalProfit = 0;
    let itemsWithPurchasePrice = 0;
    filteredSales.forEach(s => {
      if (s.purchase_price !== undefined && s.purchase_price !== null && s.purchase_price > 0) {
        totalProfit += (s.price - s.purchase_price);
        itemsWithPurchasePrice++;
      }
    });

    // Top Channel
    const channelCounts: Record<string, number> = {};
    filteredSales.forEach(s => {
      const ch = s.channel || 'Altro';
      channelCounts[ch] = (channelCounts[ch] || 0) + 1;
    });
    let topChannel = 'Nessuno';
    let maxCount = 0;
    Object.entries(channelCounts).forEach(([ch, cnt]) => {
      if (cnt > maxCount) {
        maxCount = cnt;
        topChannel = ch;
      }
    });

    return {
      totalRevenue,
      count,
      totalProfit,
      itemsWithPurchasePrice,
      topChannel
    };
  }, [filteredSales]);

  const getChannelBadgeColor = (ch: string) => {
    switch (ch) {
      case 'Vinted':
        return 'bg-teal-500/10 text-teal-300 border-teal-500/30';
      case 'eBay':
        return 'bg-blue-500/10 text-blue-300 border-blue-500/30';
      case 'Wallapop':
        return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
      case 'Subito.it':
        return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
      case 'Fumetteria / Scambio':
        return 'bg-purple-500/10 text-purple-300 border-purple-500/30';
      default:
        return 'bg-slate-500/10 text-slate-300 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* 1. Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 glass-surface p-5 sm:p-6 rounded-2xl shadow-xs">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                Registro Vendite & Rimborsi
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-white/8 text-emerald-300 border border-white/10 font-mono">
                  {filteredSales.length} {filteredSales.length === 1 ? 'vendita' : 'vendite'}
                </span>
              </h1>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Traccia i fumetti venduti su Vinted, eBay o privati con calcolo automatico del profitto
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/25 active:scale-98 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          Registra Nuova Vendita
        </button>
      </div>

      {/* 2. KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-3.5">
        <div className="glass-surface p-4.5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1.5 font-medium">
            <span>Totale Incassato</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono tracking-tight">
            +{stats.totalRevenue.toFixed(2)} <span className="text-sm font-sans font-normal text-slate-400">€</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Ricavo lordo transazioni
          </div>
        </div>

        <div className="glass-surface p-4.5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1.5 font-medium">
            <span>Fumetti Venduti</span>
            <div className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center">
              <ShoppingBag className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono tracking-tight">
            {stats.count} <span className="text-sm font-sans font-normal text-slate-400">volumi</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Transazioni completate
          </div>
        </div>

        <div className="glass-surface p-4.5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1.5 font-medium">
            <span>Margine Netto</span>
            <div className="w-6 h-6 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className={`text-2xl font-bold font-mono tracking-tight ${stats.totalProfit >= 0 ? 'text-indigo-300' : 'text-rose-400'}`}>
            {stats.totalProfit >= 0 ? '+' : ''}{stats.totalProfit.toFixed(2)} <span className="text-sm font-sans font-normal text-slate-400">€</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Calcolato su {stats.itemsWithPurchasePrice} volumi
          </div>
        </div>

        <div className="glass-surface p-4.5 rounded-2xl shadow-xs">
          <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1.5 font-medium">
            <span>Canale Principale</span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Tag className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-xl font-bold text-white tracking-tight truncate">
            {stats.topChannel}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Canale con più vendite
          </div>
        </div>
      </div>

      {/* 3. Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 glass-surface p-3 sm:p-3.5 rounded-2xl shadow-xs">
        <div className="flex flex-wrap items-center gap-2">
          {/* Year Filter */}
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#07080b] border border-white/10 text-xs font-semibold text-white focus:outline-none focus:border-indigo-500/80 cursor-pointer"
          >
            <option value="Tutti gli anni">Tutti gli anni</option>
            <option value="2026">2026</option>
            <option value="2025">2025</option>
            <option value="2024">2024</option>
          </select>

          {/* Month Filter */}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#07080b] border border-white/10 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500/80 cursor-pointer"
          >
            {MONTHS.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>

          {/* Channel Filter */}
          <select
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-[#07080b] border border-white/10 text-xs font-medium text-slate-200 focus:outline-none focus:border-indigo-500/80 cursor-pointer"
          >
            <option value="Tutti">Tutti i canali</option>
            {CHANNELS.map(ch => (
              <option key={ch} value={ch}>{ch}</option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Cerca per titolo, canale, note..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8.5 pr-3 py-1.5 rounded-xl bg-[#07080b] border border-white/10 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/80 transition"
          />
          {searchFilter && (
            <button 
              onClick={() => setSearchFilter('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Sales List / Table */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400 text-sm">
          Caricamento vendite in corso...
        </div>
      ) : filteredSales.length === 0 ? (
        <div className="text-center py-16 px-4 glass-surface rounded-2xl border border-dashed border-white/10">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <DollarSign className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-white mb-1">Nessuna vendita registrata</h3>
          <p className="text-[11px] text-slate-400 max-w-sm mx-auto mb-4">
            Non ci sono vendite registrate per i filtri selezionati. Puoi aggiungere vendite di fumetti dalla tua libreria o fumetti esterni.
          </p>
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs inline-flex items-center gap-2 transition active:scale-98 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Aggiungi la prima vendita
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5">
          {filteredSales.map((sale) => {
            const hasPurchase = sale.purchase_price !== undefined && sale.purchase_price !== null && sale.purchase_price > 0;
            const profit = hasPurchase ? (sale.price - (sale.purchase_price || 0)) : null;

            return (
              <div
                key={sale.id}
                className="p-3.5 sm:p-4 rounded-2xl glass-surface hover:glass-surface-elevated border border-white/6 hover:border-white/12 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 group"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Cover or Icon */}
                  <div className="w-12 h-16 rounded-xl bg-[#07080b] border border-white/8 overflow-hidden shrink-0 flex items-center justify-center relative">
                    {sale.comic_id && (sale.cover_url || sale.local_cover_path) ? (
                      <img
                        src={getComicCoverUrl({ cover_url: sale.cover_url || undefined, local_cover_path: sale.local_cover_path || undefined }) || undefined}
                        alt={sale.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          handleCoverError(e, { cover_url: sale.cover_url, local_cover_path: sale.local_cover_path }, () => {
                            (e.target as HTMLElement).style.display = 'none';
                          });
                        }}
                      />
                    ) : (
                      <BookOpen className="w-5 h-5 text-slate-600" />
                    )}
                    {sale.comic_id && (
                      <span className="absolute bottom-0 right-0 p-0.5 rounded-tl bg-indigo-600/90 text-white text-[8px]" title="Dalla collezione Comics Count">
                        <Sparkles className="w-2.5 h-2.5" />
                      </span>
                    )}
                  </div>

                  {/* Title & Info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-white truncate max-w-md">
                        {sale.title}
                      </h4>
                      {sale.comic_id ? (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                          Collezione CC
                        </span>
                      ) : (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400">
                          Fumetto Esterno
                        </span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getChannelBadgeColor(sale.channel)}`}>
                        {sale.channel || 'Vinted'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-500" />
                        {sale.date ? new Date(sale.date).toLocaleDateString('it-IT') : `${sale.month || ''} ${sale.year}`}
                      </span>

                      {hasPurchase && (
                        <span className="text-[11px] text-slate-500">
                          Pagato in origine: <strong className="text-slate-300">{sale.purchase_price?.toFixed(2)} €</strong>
                        </span>
                      )}

                      {sale.notes && (
                        <span className="text-[11px] text-slate-400 italic truncate max-w-xs">
                          "{sale.notes}"
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Price, Margin & Actions */}
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/60">
                  <div className="text-right">
                    <div className="text-base sm:text-lg font-black text-emerald-400 font-mono">
                      +{sale.price.toFixed(2)} €
                    </div>
                    {profit !== null && (
                      <div className={`text-[11px] font-mono flex items-center justify-end gap-0.5 ${profit >= 0 ? 'text-indigo-400' : 'text-rose-400'}`}>
                        <ArrowUpRight className="w-3 h-3" />
                        <span>{profit >= 0 ? '+' : ''}{profit.toFixed(2)} € netto</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(sale)}
                      className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                      title="Modifica vendita"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(sale.id, sale.title)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                      title="Elimina vendita"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Modal: Add / Edit Sale */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    {editingSale ? 'Modifica Vendita' : 'Registra Nuova Vendita'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Registra l'incasso e le informazioni sul fumetto venduto
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
              {/* Type Switcher (only for new sales) */}
              {!editingSale && (
                <div className="grid grid-cols-2 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setSaleType('registered');
                      setSelectedComic(null);
                    }}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      saleType === 'registered' 
                        ? 'bg-indigo-600 text-white shadow' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Dalla mia Collezione
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSaleType('custom');
                      setSelectedComic(null);
                    }}
                    className={`py-2 px-3 rounded-lg font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
                      saleType === 'custom' 
                        ? 'bg-indigo-600 text-white shadow' 
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Fumetto Non Registrato
                  </button>
                </div>
              )}

              {/* Option A: Search from Comics Count collection */}
              {saleType === 'registered' ? (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Cerca nella tua collezione Comics Count *
                  </label>
                  
                  {selectedComic ? (
                    <div className="p-3 rounded-xl bg-slate-950 border border-indigo-500/50 flex items-center justify-between gap-3 shadow-inner">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-14 rounded bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                          {selectedComic.cover_url || selectedComic.local_cover_path ? (
                            <img
                              src={getComicCoverUrl(selectedComic) || undefined}
                              alt={selectedComic.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                handleCoverError(e, selectedComic, () => {
                                  (e.target as HTMLElement).style.display = 'none';
                                });
                              }}
                            />
                          ) : (
                            <BookOpen className="w-4 h-4 text-slate-500" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide">Fumetto selezionato</span>
                          <div className="text-xs font-bold text-white truncate">{selectedComic.title}</div>
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {selectedComic.publisher_name} • {selectedComic.month} {selectedComic.year} • Prezzo originale: <span className="text-emerald-400 font-mono font-semibold">{selectedComic.purchase_price?.toFixed(2)} €</span>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setSelectedComic(null);
                          setComicSearchQuery('');
                        }}
                        className="text-xs text-slate-300 hover:text-rose-400 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 shrink-0 font-medium transition cursor-pointer"
                      >
                        Cambia
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Digita per cercare tra tutti i tuoi fumetti (titolo, collana, editore)..."
                          value={comicSearchQuery}
                          onChange={(e) => setComicSearchQuery(e.target.value)}
                          className="w-full pl-9 pr-8 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition"
                          autoFocus
                        />
                        {comicSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setComicSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-0.5 rounded"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Informazioni conteggio & Risultati */}
                      <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
                        <span>
                          {isLoadingCollection ? 'Caricamento collezione...' : `${searchResultsComics.length} fumetti trovati ${comicSearchQuery ? `per "${comicSearchQuery}"` : 'in collezione'}`}
                        </span>
                        {comicsCollection.length > 0 && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            Totale: {comicsCollection.length}
                          </span>
                        )}
                      </div>

                      {/* Lista integrata scrollabile (Inline Scroll Container) */}
                      <div className="max-h-56 overflow-y-auto bg-slate-950/90 border border-slate-800 rounded-xl divide-y divide-slate-800/60 shadow-inner">
                        {searchResultsComics.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            Nessun fumetto corrisponde alla ricerca.
                            <div className="mt-1 text-[11px] text-indigo-400 cursor-pointer hover:underline" onClick={() => {
                              setSaleType('custom');
                              setCustomTitle(comicSearchQuery);
                            }}>
                              → Registralo come fumetto non censito
                            </div>
                          </div>
                        ) : (
                          searchResultsComics.map((c) => (
                            <div
                              key={c.id}
                              onClick={() => handleSelectComic(c)}
                              className="p-2.5 hover:bg-indigo-950/30 hover:border-indigo-500/20 cursor-pointer flex items-center justify-between gap-3 transition group"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-11 rounded bg-slate-900 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                                  {c.cover_url || c.local_cover_path ? (
                                    <img
                                      src={getComicCoverUrl(c) || undefined}
                                      alt={c.title}
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        handleCoverError(e, c, () => {
                                          (e.target as HTMLElement).style.display = 'none';
                                        });
                                      }}
                                    />
                                  ) : (
                                    <BookOpen className="w-3.5 h-3.5 text-slate-600" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-white truncate group-hover:text-indigo-300 transition">
                                    {c.title}
                                  </div>
                                  <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                    <span className="text-slate-300 font-medium">{c.publisher_name || c.category}</span>
                                    <span>•</span>
                                    <span>{c.month} {c.year}</span>
                                    {c.purchase_price > 0 && (
                                      <>
                                        <span>•</span>
                                        <span className="text-emerald-400 font-mono">Pagato {c.purchase_price.toFixed(2)} €</span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="shrink-0 opacity-0 group-hover:opacity-100 transition px-2 py-1 rounded bg-indigo-600 text-white text-[11px] font-semibold flex items-center gap-1">
                                <Check className="w-3 h-3" /> Seleziona
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Mark as Sold in collection checkbox */}
                  {selectedComic && (
                    <label className="flex items-center gap-2 pt-1 text-xs text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={markAsSold}
                        onChange={(e) => setMarkAsSold(e.target.checked)}
                        className="rounded bg-slate-950 border-slate-700 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                      />
                      <span>Segna lo stato di questo fumetto come <strong>"Venduto"</strong> nella tua collezione</span>
                    </label>
                  )}
                </div>
              ) : (
                /* Option B: Custom / External Comic */
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">
                    Titolo del Fumetto Venduto *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Es. Berserk Deluxe 1, Spider-Man Variant, ecc."
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500">
                    Fumetto esterno non presente nel catalogo Comics Count
                  </p>
                </div>
              )}

              {/* Price & Channel */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Prezzo di Vendita (€) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-xs">€</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={salePrice}
                      onChange={(e) => setSalePrice(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono font-bold text-emerald-400 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Canale di Vendita
                  </label>
                  <select
                    value={saleChannel}
                    onChange={(e) => setSaleChannel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {CHANNELS.map(ch => (
                      <option key={ch} value={ch}>{ch}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date & Period */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Data Vendita
                  </label>
                  <input
                    type="date"
                    value={saleDate}
                    onChange={(e) => {
                      setSaleDate(e.target.value);
                      if (e.target.value) {
                        const d = new Date(e.target.value);
                        setSaleYear(d.getFullYear().toString());
                        const mName = MONTHS[d.getMonth() + 1];
                        if (mName) setSaleMonth(mName);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Anno Contabile
                  </label>
                  <select
                    value={saleYear}
                    onChange={(e) => setSaleYear(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="2026">2026</option>
                    <option value="2025">2025</option>
                    <option value="2024">2024</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Mese Contabile
                  </label>
                  <select
                    value={saleMonth}
                    onChange={(e) => setSaleMonth(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    {MONTHS.filter(m => m !== 'Tutti i mesi').map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Note Opzionali
                </label>
                <textarea
                  rows={2}
                  placeholder="Es. Spedizione inclusa, acquirente Mario, pacco consegnato..."
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Salvataggio...' : editingSale ? 'Aggiorna Vendita' : 'Registra Vendita'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
