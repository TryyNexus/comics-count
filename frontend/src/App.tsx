import React, { useState, useEffect } from 'react';
import { Comic, Publisher, MonthlySummary, ComicStatus } from './types';
import { api, authStorage } from './api';
import { KPIBanner } from './components/KPIBanner';
import { ComicsGrid } from './components/ComicsGrid';
import { AccountingTable } from './components/AccountingTable';
import { DashboardView } from './components/DashboardView';
import { OrdersView } from './components/OrdersView';
import { ReadingsView } from './components/ReadingsView';
import { AddEditComicModal } from './components/AddEditComicModal';
import { ImportExportModal } from './components/ImportExportModal';
import { MobileAppModal } from './components/MobileAppModal';
import { MonthYearPickerModal } from './components/MonthYearPickerModal';
import { AuthModal } from './components/AuthModal';
import { SalesView } from './components/SalesView';
import { User } from './types';
import { 
  BookOpen, 
  LayoutGrid, 
  Table, 
  PieChart, 
  Package, 
  BookMarked, 
  Plus, 
  RefreshCw, 
  ChevronLeft,
  DollarSign, 
  ChevronRight,
  ChevronDown,
  Calendar,
  Sparkles,
  Loader2,
  Smartphone,
  LogOut,
  User as UserIcon,
  Radio,
  Wifi,
  WifiOff
} from 'lucide-react';

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const YEARS = ['2023', '2024', '2025', '2026', '2027'];

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(() => authStorage.getUser());
  const [isAuthChecking, setIsAuthChecking] = useState(() => !authStorage.getToken());

  const [currentYear, setCurrentYear] = useState<string>(() => localStorage.getItem('comics_count_year') || '2026');
  const [currentMonth, setCurrentMonth] = useState<string>(() => localStorage.getItem('comics_count_month') || 'Gennaio');
  // TABLE IS THE PRIMARY / DEFAULT VIEW AS REQUESTED
  const [activeTab, setActiveTab] = useState<'table' | 'grid' | 'dashboard' | 'sales' | 'readings'>(() => {
    const saved = localStorage.getItem('comics_count_tab');
    if (saved && ['table', 'grid', 'dashboard', 'sales', 'readings'].includes(saved)) {
      return saved as any;
    }
    return 'table';
  });

  // Persist selections across refreshes/reopens
  useEffect(() => {
    localStorage.setItem('comics_count_year', currentYear);
  }, [currentYear]);

  useEffect(() => {
    localStorage.setItem('comics_count_month', currentMonth);
  }, [currentMonth]);

  useEffect(() => {
    localStorage.setItem('comics_count_tab', activeTab);
  }, [activeTab]);

  const [comics, setComics] = useState<Comic[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrichingHvc, setIsEnrichingHvc] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'connected' | 'connecting' | 'disconnected'>('connecting');

  // Modals state
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [comicToEdit, setComicToEdit] = useState<Comic | null>(null);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAuthModalDismissed, setIsAuthModalDismissed] = useState(false);

  // Check login on startup
  useEffect(() => {
    checkCurrentUser();
  }, []);

  const checkCurrentUser = async () => {
    try {
      const user = await api.getMe();
      setCurrentUser(user);
    } catch {
      setCurrentUser(null);
    } finally {
      setIsAuthChecking(false);
    }
  };

  const handleLogout = () => {
    api.logout();
    setCurrentUser(null);
    setIsAuthModalDismissed(false);
    setIsAuthModalOpen(true);
    setComics([]);
    setSummary(null);
  };

  useEffect(() => {
    if (currentUser) {
      loadPublishers();
    }
  }, [currentUser]);

  useEffect(() => {
    if (currentUser) {
      loadComicsAndSummary();
    }
  }, [currentUser, currentYear, currentMonth]);

  // Real-time synchronization stream (SSE) across tabs/devices
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = api.subscribeToSyncEvents(
      (event) => {
        // Handle incoming live sync events from server
        if (event.type === 'comic_created') {
          const newComic = event.data.comic;
          if (newComic && String(newComic.year) === String(currentYear) && newComic.month === currentMonth) {
            setComics(prev => {
              if (prev.some(c => c.id === newComic.id)) return prev;
              return [newComic, ...prev];
            });
            api.getSummary(currentYear, currentMonth).then(setSummary);
          }
        } else if (event.type === 'comic_updated') {
          const updatedComic = event.data.comic;
          if (updatedComic) {
            if (String(updatedComic.year) === String(currentYear) && updatedComic.month === currentMonth) {
              setComics(prev => {
                const exists = prev.some(c => c.id === updatedComic.id);
                if (exists) {
                  return prev.map(c => c.id === updatedComic.id ? updatedComic : c);
                } else {
                  return [updatedComic, ...prev];
                }
              });
            } else {
              // Comic was moved to a different month/year
              setComics(prev => prev.filter(c => c.id !== updatedComic.id));
            }
            api.getSummary(currentYear, currentMonth).then(setSummary);
          }
        } else if (event.type === 'comic_status_changed') {
          const { id, status } = event.data;
          setComics(prev => prev.map(c => c.id === id ? { ...c, status } : c));
          api.getSummary(currentYear, currentMonth).then(setSummary);
        } else if (event.type === 'comic_deleted') {
          const { id } = event.data;
          setComics(prev => prev.filter(c => c.id !== id));
          api.getSummary(currentYear, currentMonth).then(setSummary);
        } else if (event.type === 'sales_updated' || event.type === 'budget_updated' || event.type === 'data_imported' || event.type === 'batch_enriched') {
          loadComicsAndSummary();
        }
      },
      (status) => {
        setSyncStatus(status);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [currentUser, currentYear, currentMonth]);

  const loadPublishers = async () => {
    try {
      const data = await api.getPublishers();
      setPublishers(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadComicsAndSummary = async () => {
    setIsLoading(true);
    try {
      const [comicsData, summaryData] = await Promise.all([
        api.getComics({ year: currentYear, month: currentMonth }),
        api.getSummary(currentYear, currentMonth)
      ]);
      setComics(comicsData);
      setSummary(summaryData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (id: number, status: ComicStatus) => {
    // Optimistic UI: update state instantly
    const prevStatus = comics.find(c => c.id === id)?.status;
    setComics(prev => prev.map(c => c.id === id ? { ...c, status } : c));

    try {
      await api.updateComicStatus(id, status);
      api.getSummary(currentYear, currentMonth).then(setSummary);
    } catch (e) {
      // Rollback on failure
      if (prevStatus) {
        setComics(prev => prev.map(c => c.id === id ? { ...c, status: prevStatus } : c));
      }
      alert('Errore aggiornamento stato');
    }
  };

  const handleDeleteComic = async (id: number) => {
    if (!confirm('Eliminare definitivamente questo fumetto?')) return;
    // Optimistic UI: remove immediately
    const removedComic = comics.find(c => c.id === id);
    setComics(prev => prev.filter(c => c.id !== id));

    try {
      await api.deleteComic(id);
      api.getSummary(currentYear, currentMonth).then(setSummary);
    } catch (e) {
      if (removedComic) {
        setComics(prev => [removedComic, ...prev]);
      }
      alert('Errore eliminazione');
    }
  };

  const handleEditComic = (comic: Comic) => {
    setComicToEdit(comic);
    setIsAddEditOpen(true);
  };

  const handleOpenCoverSearch = (comic: Comic) => {
    setComicToEdit(comic);
    setIsAddEditOpen(true);
  };

  const handleQuickAdd = (defaultCategory: string) => {
    const matchedPub = publishers.find(p => p.name.toLowerCase().includes(defaultCategory.toLowerCase()));
    setComicToEdit({
      id: 0,
      title: '',
      year: currentYear,
      month: currentMonth,
      publisher_id: matchedPub?.id,
      purchase_price: 0,
      cover_price: 0,
      status: 'Acquistato',
      channel: defaultCategory.includes('Ordini') ? 'Ordine Online' : (defaultCategory.includes('Eventi') ? 'Fiera / Evento' : 'Fumetteria')
    } as Comic);
    setIsAddEditOpen(true);
  };

  const handleEnrichHVCForMonth = async () => {
    setIsEnrichingHvc(true);
    try {
      const data = await api.batchEnrichHVC(currentYear, currentMonth);
      if (data.success) {
        alert(`Arricchimento HoVistoCose completato!\nAggiornati con successo ${data.enriched} fumetti HVC su ${data.processed} con copertine, prezzi e codici.`);
        loadComicsAndSummary();
      } else {
        alert('Errore durante l\'arricchimento batch');
      }
    } catch (err: any) {
      alert('Errore durante l\'arricchimento: ' + err.message);
    } finally {
      setIsEnrichingHvc(false);
    }
  };

  const handlePrevMonth = () => {
    const idx = MONTHS.indexOf(currentMonth);
    if (idx > 0) {
      setCurrentMonth(MONTHS[idx - 1]);
    } else {
      const yIdx = YEARS.indexOf(currentYear);
      if (yIdx > 0) {
        setCurrentYear(YEARS[yIdx - 1]);
        setCurrentMonth(MONTHS[11]);
      }
    }
  };

  const handleNextMonth = () => {
    const idx = MONTHS.indexOf(currentMonth);
    if (idx < 11) {
      setCurrentMonth(MONTHS[idx + 1]);
    } else {
      const yIdx = YEARS.indexOf(currentYear);
      if (yIdx < YEARS.length - 1) {
        setCurrentYear(YEARS[yIdx + 1]);
        setCurrentMonth(MONTHS[0]);
      }
    }
  };

  const isTryyNexus = currentUser?.username?.toLowerCase() === 'tryy_nexus';

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col font-sans selection:bg-indigo-500/30 selection:text-white">
      {/* Top Navigation Bar with Safe Area Top Support */}
      <header 
        className="sticky top-0 z-40 glass-surface border-b border-white/6 shadow-xs"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          {/* DESKTOP BAR (hidden on mobile, visible from md up) */}
          <div className="hidden md:flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl overflow-hidden shadow-md shadow-indigo-500/10 border border-white/10 shrink-0 bg-[#0f1118]">
                <img src="/logo.png" alt="Comics Count Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <span className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                  Comics Count <span className="text-indigo-400 font-mono text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/20">2.0</span>
                </span>
                <span className="text-[11px] text-slate-400 block -mt-0.5 font-normal">
                  Tracker Uscite, HoVistoCose & Contabilità
                </span>
              </div>
            </div>

            {/* Desktop Temporal Selector (Year & Month) */}
            <div className="flex items-center gap-1 bg-white/4 border border-white/8 p-1 rounded-xl shadow-inner backdrop-blur-md">
              <button 
                onClick={handlePrevMonth}
                className="p-1.5 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition cursor-pointer active:scale-95"
                title="Mese precedente"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <select
                value={currentMonth}
                onChange={e => setCurrentMonth(e.target.value)}
                className="bg-transparent text-xs font-semibold text-white px-2 py-1 focus:outline-hidden cursor-pointer"
              >
                {MONTHS.map(m => (
                  <option key={m} value={m} className="bg-[#0f1118] text-white">{m}</option>
                ))}
              </select>

              <select
                value={currentYear}
                onChange={e => setCurrentYear(e.target.value)}
                className="bg-transparent text-xs font-semibold font-mono text-indigo-400 px-2 py-1 focus:outline-hidden cursor-pointer border-l border-white/8"
              >
                {YEARS.map(y => (
                  <option key={y} value={y} className="bg-[#0f1118] text-white">{y}</option>
                ))}
              </select>

              <button 
                onClick={handleNextMonth}
                className="p-1.5 rounded-lg hover:bg-white/8 text-slate-400 hover:text-white transition cursor-pointer active:scale-95"
                title="Mese successivo"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Desktop Quick Actions */}
            <div className="flex items-center gap-2">
              {isTryyNexus && (
                <button
                  onClick={handleEnrichHVCForMonth}
                  disabled={isEnrichingHvc}
                  className="px-3 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  title="Cerca copertine e codici mancanti su HoVistoCose"
                >
                  {isEnrichingHvc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
                  <span>Auto-Arricchisci HVC</span>
                </button>
              )}

              <button
                onClick={() => setIsMobileModalOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Apri Comics Count sul tuo smartphone o installa l'app"
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
                <span>📱 App Telefono</span>
              </button>

              <button
                onClick={() => { setComicToEdit(null); setIsAddEditOpen(true); }}
                className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuovo</span>
              </button>

              {/* Real-time Live Sync Indicator */}
              <div 
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px]"
                title={
                  syncStatus === 'connected' 
                    ? 'Sincronizzazione in tempo reale attiva: le modifiche si riflettono all\'istante su tutti i dispositivi' 
                    : syncStatus === 'connecting'
                    ? 'Connessione al canale di sincronizzazione in corso...'
                    : 'Riconnessione automatica al canale in tempo reale...'
                }
              >
                <span className="relative flex h-2 w-2">
                  {syncStatus === 'connected' && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${
                    syncStatus === 'connected' ? 'bg-emerald-500' : syncStatus === 'connecting' ? 'bg-amber-400' : 'bg-slate-500'
                  }`}></span>
                </span>
                <span className={`font-mono text-[10px] font-bold ${
                  syncStatus === 'connected' ? 'text-emerald-400' : syncStatus === 'connecting' ? 'text-amber-400' : 'text-slate-400'
                }`}>
                  {syncStatus === 'connected' ? 'LIVE' : syncStatus === 'connecting' ? 'SYNC...' : 'OFFLINE'}
                </span>
              </div>

              {/* User badge & Logout OR Login Button */}
              {currentUser ? (
                <div className="flex items-center gap-2 pl-2 border-l border-slate-800 ml-1">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-200">
                    <UserIcon className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="font-semibold max-w-[100px] truncate">{currentUser.username}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-rose-950/60 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/30 text-slate-400 transition cursor-pointer"
                    title="Esci dall'account"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-300 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ml-1"
                >
                  <UserIcon className="w-3.5 h-3.5" />
                  <span>Accedi</span>
                </button>
              )}
            </div>
          </div>

          {/* MOBILE TOP BAR (Row 1: Logo & Fast Action Icons) */}
          <div className="flex md:hidden items-center justify-between h-14">
            {/* Logo */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg overflow-hidden shadow-md shadow-indigo-500/20 border border-slate-800 shrink-0 bg-slate-900">
                <img src="/logo.png" alt="Comics Count Logo" className="w-full h-full object-cover" />
              </div>
              <div className="truncate">
                <span className="font-black text-sm tracking-tight text-white flex items-center gap-1.5">
                  Comics Count <span className="text-[10px] text-indigo-400 font-mono px-1 py-0.2 rounded bg-indigo-500/10 border border-indigo-500/20">2.0</span>
                  <span className={`inline-block w-1.5 h-1.5 rounded-full ${
                    syncStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : syncStatus === 'connecting' ? 'bg-amber-400' : 'bg-slate-500'
                  }`} title={syncStatus === 'connected' ? 'Sincronizzazione in tempo reale' : syncStatus} />
                </span>
              </div>
            </div>

            {/* Mobile Header Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setIsMobileModalOpen(true)}
                className="p-2 rounded-xl bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 text-emerald-300 transition cursor-pointer"
                title="Info connessione smartphone"
                aria-label="Info connessione smartphone"
              >
                <Smartphone className="w-4 h-4 text-emerald-400" />
              </button>

              <button
                onClick={() => { setComicToEdit(null); setIsAddEditOpen(true); }}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-indigo-600/30 active:scale-95 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuovo</span>
              </button>

              {currentUser ? (
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 border border-slate-700 text-slate-400 transition cursor-pointer"
                  title={`Disconnetti (${currentUser.username})`}
                  aria-label="Disconnetti"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={() => setIsAuthModalOpen(true)}
                  className="p-2 rounded-xl bg-indigo-950/80 hover:bg-indigo-900 border border-indigo-500/40 text-indigo-300 transition cursor-pointer"
                  title="Accedi"
                  aria-label="Accedi"
                >
                  <UserIcon className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* MOBILE DEDICATED MONTH & YEAR NAVIGATION BAR (Row 2: Large, thumb-friendly touch targets!) */}
          <div className="md:hidden py-2 px-1 border-t border-slate-800/80 flex items-center justify-between gap-2">
            <button
              onClick={handlePrevMonth}
              className="w-12 h-11 rounded-xl bg-slate-800/90 active:bg-slate-700 active:scale-95 flex items-center justify-center text-slate-200 transition shadow-sm border border-slate-700/80 shrink-0 cursor-pointer"
              title="Mese precedente"
              aria-label="Mese precedente"
            >
              <ChevronLeft className="w-6 h-6 text-slate-200" />
            </button>

            {/* Large Center Date Display & Picker Trigger */}
            <button
              onClick={() => setIsDatePickerOpen(true)}
              className="grow min-h-[44px] px-3.5 py-2 rounded-xl bg-slate-950 hover:bg-slate-800/60 active:bg-slate-800 border border-slate-700/80 active:scale-98 transition shadow-xs flex items-center justify-center gap-2 cursor-pointer group"
              title="Tocca per cambiare mese e anno"
            >
              <Calendar className="w-4 h-4 text-indigo-400 group-hover:scale-110 transition shrink-0" />
              <span className="text-base font-black text-white tracking-wide">
                {currentMonth} <span className="font-mono text-indigo-400 ml-1">{currentYear}</span>
              </span>
              <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-white transition shrink-0" />
            </button>

            <button
              onClick={handleNextMonth}
              className="w-12 h-11 rounded-xl bg-slate-800/90 active:bg-slate-700 active:scale-95 flex items-center justify-center text-slate-200 transition shadow-sm border border-slate-700/80 shrink-0 cursor-pointer"
              title="Mese successivo"
              aria-label="Mese successivo"
            >
              <ChevronRight className="w-6 h-6 text-slate-200" />
            </button>
          </div>

          {/* Desktop Sub Navigation Tabs */}
          <div className="hidden md:flex items-center gap-1.5 overflow-x-auto py-2 border-t border-white/6 text-xs">
            <button
              onClick={() => setActiveTab('table')}
              className={`px-3.5 py-1.5 rounded-xl font-medium flex items-center gap-2 transition cursor-pointer shrink-0 active:scale-98 ${
                activeTab === 'table'
                  ? 'bg-white/12 text-white border border-white/20 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <Table className="w-3.5 h-3.5 text-indigo-400" />
              <span>Tabella Contabile</span>
            </button>

            <button
              onClick={() => setActiveTab('grid')}
              className={`px-3.5 py-1.5 rounded-xl font-medium flex items-center gap-2 transition cursor-pointer shrink-0 active:scale-98 ${
                activeTab === 'grid'
                  ? 'bg-white/12 text-white border border-white/20 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 text-indigo-400" />
              <span>Griglia Copertine</span>
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3.5 py-1.5 rounded-xl font-medium flex items-center gap-2 transition cursor-pointer shrink-0 active:scale-98 ${
                activeTab === 'dashboard'
                  ? 'bg-white/12 text-white border border-white/20 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <PieChart className="w-3.5 h-3.5 text-indigo-400" />
              <span>Statistiche</span>
            </button>

            <button
              onClick={() => setActiveTab('sales')}
              className={`px-3.5 py-1.5 rounded-xl font-medium flex items-center gap-2 transition cursor-pointer shrink-0 active:scale-98 ${
                activeTab === 'sales'
                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
              <span>Vendite</span>
            </button>

            <button
              onClick={() => setActiveTab('readings')}
              className={`px-3.5 py-1.5 rounded-xl font-medium flex items-center gap-2 transition cursor-pointer shrink-0 active:scale-98 ${
                activeTab === 'readings'
                  ? 'bg-white/12 text-white border border-white/20 shadow-xs'
                  : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5 text-indigo-400" />
              <span>Diario Letture</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main 
        className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 grow w-full pb-28 md:pb-12"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 6rem)' }}
      >
        {/* KPI Banner */}
        <KPIBanner summary={summary} onRefresh={loadComicsAndSummary} />

        {/* Primary View: Tabella Contabile */}
        {activeTab === 'table' && (
          <AccountingTable
            comics={comics}
            publishers={publishers}
            onEdit={handleEditComic}
            onDelete={handleDeleteComic}
            onStatusChange={handleStatusChange}
            onOpenCoverSearch={handleOpenCoverSearch}
            onQuickAdd={handleQuickAdd}
            monthlySpent={summary?.monthlySpent || 0}
            year={currentYear}
            month={currentMonth}
          />
        )}

        {/* View: Griglia Copertine */}
        {activeTab === 'grid' && (
          <ComicsGrid
            comics={comics}
            publishers={publishers}
            onEdit={handleEditComic}
            onDelete={handleDeleteComic}
            onStatusChange={handleStatusChange}
            onOpenCoverSearch={handleOpenCoverSearch}
            onAddNew={() => { setComicToEdit(null); setIsAddEditOpen(true); }}
          />
        )}

        {/* View: Statistiche */}
        {activeTab === 'dashboard' && (
          <DashboardView
            year={currentYear}
            month={currentMonth}
            summary={summary}
            onRefresh={loadComicsAndSummary}
          />
        )}

        {/* View: Vendite */}
        {activeTab === 'sales' && (
          <SalesView currentYear={currentYear} currentMonth={currentMonth} />
        )}

        {/* View: Diario Letture */}
        {activeTab === 'readings' && (
          <ReadingsView currentYear={currentYear} currentMonth={currentMonth} />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <div 
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 glass-surface border-t border-white/8 flex items-center justify-around py-1.5 px-2 shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.4rem)' }}
      >
        <button
          onClick={() => setActiveTab('table')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition cursor-pointer active:scale-95 ${
            activeTab === 'table' ? 'text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Table className={`w-4 h-4 ${activeTab === 'table' ? 'text-indigo-400' : 'text-slate-400'}`} />
          <span>Tabella</span>
        </button>

        <button
          onClick={() => setActiveTab('grid')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition cursor-pointer active:scale-95 ${
            activeTab === 'grid' ? 'text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className={`w-4 h-4 ${activeTab === 'grid' ? 'text-indigo-400' : 'text-slate-400'}`} />
          <span>Copertine</span>
        </button>

        {/* Center Quick Add Button */}
        <button
          onClick={() => { setComicToEdit(null); setIsAddEditOpen(true); }}
          className="w-11 h-11 -mt-4 rounded-full bg-indigo-600 hover:bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30 ring-4 ring-[#090a0f] transition active:scale-90 cursor-pointer"
          title="Nuovo fumetto"
        >
          <Plus className="w-5 h-5 stroke-2" />
        </button>

        <button
          onClick={() => setActiveTab('sales')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition cursor-pointer active:scale-95 ${
            activeTab === 'sales' ? 'text-emerald-300 font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <DollarSign className={`w-4 h-4 ${activeTab === 'sales' ? 'text-emerald-400' : 'text-slate-400'}`} />
          <span>Vendite</span>
        </button>

        <button
          onClick={() => setActiveTab('readings')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-xl text-[10px] font-medium transition cursor-pointer active:scale-95 ${
            activeTab === 'readings' ? 'text-white font-semibold' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookMarked className={`w-4 h-4 ${activeTab === 'readings' ? 'text-indigo-400' : 'text-slate-400'}`} />
          <span>Letture</span>
        </button>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 hidden md:block">
        Comics Count 2.0 • Tracker Uscite, Contabilità & Metadati ufficiali da HoVistoCose
      </footer>

      {/* Modals */}
      <AddEditComicModal
        isOpen={isAddEditOpen}
        onClose={() => setIsAddEditOpen(false)}
        onSaved={loadComicsAndSummary}
        comicToEdit={comicToEdit}
        publishers={publishers}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />

      <ImportExportModal
        isOpen={isImportExportOpen}
        onClose={() => setIsImportExportOpen(false)}
        onImportComplete={() => {
          loadPublishers();
          loadComicsAndSummary();
        }}
      />

      <MobileAppModal
        isOpen={isMobileModalOpen}
        onClose={() => setIsMobileModalOpen(false)}
      />

      <MonthYearPickerModal
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        currentYear={currentYear}
        currentMonth={currentMonth}
        onSelect={(y, m) => {
          setCurrentYear(y);
          setCurrentMonth(m);
        }}
        months={MONTHS}
        years={YEARS}
      />

      {/* Authentication Modal */}
      {(!currentUser && !isAuthChecking && !isAuthModalDismissed || isAuthModalOpen) && (
        <AuthModal
          onSuccess={(user) => {
            setCurrentUser(user);
            setIsAuthModalOpen(false);
            setIsAuthModalDismissed(false);
          }}
          onClose={() => {
            setIsAuthModalOpen(false);
            setIsAuthModalDismissed(true);
          }}
        />
      )}
    </div>
  );
}

export default App;
