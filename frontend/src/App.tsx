import React, { useState, useEffect } from 'react';
import { Comic, Publisher, MonthlySummary, ComicStatus } from './types';
import { api } from './api';
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
  ChevronRight,
  ChevronDown,
  Calendar,
  Sparkles,
  Loader2,
  Smartphone,
  LogOut,
  User as UserIcon
} from 'lucide-react';

const MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
];

const YEARS = ['2023', '2024', '2025', '2026', '2027'];

export function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  const [currentYear, setCurrentYear] = useState('2026');
  const [currentMonth, setCurrentMonth] = useState('Gennaio');
  // TABLE IS THE PRIMARY / DEFAULT VIEW AS REQUESTED
  const [activeTab, setActiveTab] = useState<'table' | 'grid' | 'dashboard' | 'orders' | 'readings'>('table');

  const [comics, setComics] = useState<Comic[]>([]);
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [summary, setSummary] = useState<MonthlySummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnrichingHvc, setIsEnrichingHvc] = useState(false);

  // Modals state
  const [isAddEditOpen, setIsAddEditOpen] = useState(false);
  const [comicToEdit, setComicToEdit] = useState<Comic | null>(null);
  const [isImportExportOpen, setIsImportExportOpen] = useState(false);
  const [isMobileModalOpen, setIsMobileModalOpen] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);

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
    try {
      await api.updateComicStatus(id, status);
      setComics(prev => prev.map(c => c.id === id ? { ...c, status } : c));
      api.getSummary(currentYear, currentMonth).then(setSummary);
    } catch (e) {
      alert('Errore aggiornamento stato');
    }
  };

  const handleDeleteComic = async (id: number) => {
    if (!confirm('Eliminare definitivamente questo fumetto?')) return;
    try {
      await api.deleteComic(id);
      loadComicsAndSummary();
    } catch (e) {
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
      const res = await fetch('/api/comics/enrich-hvc-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: currentYear, month: currentMonth, limit: 100 })
      });
      const data = await res.json();
      if (data.success) {
        alert(`Arricchimento HoVistoCose completato!\nAggiornati con successo ${data.enriched} fumetti HVC su ${data.processed} con copertine e codici a barre.`);
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navigation Bar with Safe Area Top Support */}
      <header 
        className="sticky top-0 z-40 bg-slate-900/95 border-b border-slate-800 backdrop-blur-md shadow-md"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          {/* DESKTOP BAR (hidden on mobile, visible from md up) */}
          <div className="hidden md:flex items-center justify-between h-16 gap-4">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-indigo-500/20 border border-slate-800 shrink-0 bg-slate-900">
                <img src="/logo.png" alt="Comics Count Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                  Comics Count <span className="text-indigo-400 font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">2.0</span>
                </span>
                <span className="text-[11px] text-slate-400 block -mt-0.5">
                  Tracker Uscite, HoVistoCose & Contabilità
                </span>
              </div>
            </div>

            {/* Desktop Temporal Selector (Year & Month) */}
            <div className="flex items-center gap-1 bg-slate-950/80 border border-slate-800 p-1 rounded-xl shadow-inner">
              <button 
                onClick={handlePrevMonth}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                title="Mese precedente"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <select
                value={currentMonth}
                onChange={e => setCurrentMonth(e.target.value)}
                className="bg-transparent text-xs font-bold text-white px-2 py-1 focus:outline-hidden cursor-pointer"
              >
                {MONTHS.map(m => (
                  <option key={m} value={m} className="bg-slate-900 text-white">{m}</option>
                ))}
              </select>

              <select
                value={currentYear}
                onChange={e => setCurrentYear(e.target.value)}
                className="bg-transparent text-xs font-bold font-mono text-indigo-400 px-2 py-1 focus:outline-hidden cursor-pointer border-l border-slate-800"
              >
                {YEARS.map(y => (
                  <option key={y} value={y} className="bg-slate-900 text-white">{y}</option>
                ))}
              </select>

              <button 
                onClick={handleNextMonth}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                title="Mese successivo"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Desktop Quick Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleEnrichHVCForMonth}
                disabled={isEnrichingHvc}
                className="px-3 py-1.5 rounded-lg bg-indigo-950/60 hover:bg-indigo-900/60 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                title="Cerca copertine e codici mancanti su HoVistoCose"
              >
                {isEnrichingHvc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
                <span>Auto-Arricchisci HVC</span>
              </button>

              <button
                onClick={() => setIsImportExportOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Sincronizza con OneDrive o esporta"
              >
                <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                <span>OneDrive / Esporta</span>
              </button>

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

              {/* User badge & Logout */}
              {currentUser && (
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
                <span className="font-black text-sm tracking-tight text-white flex items-center gap-1">
                  Comics Count <span className="text-[10px] text-indigo-400 font-mono px-1 py-0.2 rounded bg-indigo-500/10 border border-indigo-500/20">2.0</span>
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
                onClick={() => setIsImportExportOpen(true)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition cursor-pointer"
                title="OneDrive / Sincronizza"
                aria-label="OneDrive / Sincronizza"
              >
                <RefreshCw className="w-4 h-4 text-indigo-400" />
              </button>

              <button
                onClick={() => { setComicToEdit(null); setIsAddEditOpen(true); }}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-1 shadow-md shadow-indigo-600/30 active:scale-95 transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nuovo</span>
              </button>

              {currentUser && (
                <button
                  onClick={handleLogout}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 border border-slate-700 text-slate-400 transition cursor-pointer"
                  title={`Disconnetti (${currentUser.username})`}
                  aria-label="Disconnetti"
                >
                  <LogOut className="w-4 h-4" />
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
          <div className="hidden md:flex items-center gap-2 overflow-x-auto py-2 border-t border-slate-800/80 text-xs">
            <button
              onClick={() => setActiveTab('table')}
              className={`px-3.5 py-1.5 rounded-lg font-bold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'table'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-indigo-400/50'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>Tabella Contabile (Principale)</span>
            </button>

            <button
              onClick={() => setActiveTab('grid')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'grid'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              Griglia Copertine
            </button>

            <button
              onClick={() => setActiveTab('dashboard')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <PieChart className="w-3.5 h-3.5" />
              Statistiche & Vendite
            </button>

            <button
              onClick={() => setActiveTab('orders')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'orders'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              Preordini HVC & Store
            </button>

            <button
              onClick={() => setActiveTab('readings')}
              className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-2 transition cursor-pointer shrink-0 ${
                activeTab === 'readings'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
              }`}
            >
              <BookMarked className="w-3.5 h-3.5" />
              Diario Letture
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

        {/* View: Statistiche & Vendite */}
        {activeTab === 'dashboard' && (
          <DashboardView
            year={currentYear}
            month={currentMonth}
            summary={summary}
            onRefresh={loadComicsAndSummary}
          />
        )}

        {/* View: Preordini HVC & Store */}
        {activeTab === 'orders' && (
          <OrdersView currentYear={currentYear} />
        )}

        {/* View: Diario Letture */}
        {activeTab === 'readings' && (
          <ReadingsView currentYear={currentYear} currentMonth={currentMonth} />
        )}
      </main>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <div 
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 border-t border-slate-800 backdrop-blur-md flex items-center justify-around py-2 px-1 shadow-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)' }}
      >
        <button
          onClick={() => setActiveTab('table')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
            activeTab === 'table' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Table className="w-4 h-4" />
          <span>Tabella</span>
        </button>

        <button
          onClick={() => setActiveTab('grid')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
            activeTab === 'grid' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutGrid className="w-4 h-4" />
          <span>Copertine</span>
        </button>

        {/* Center Quick Add Button */}
        <button
          onClick={() => { setComicToEdit(null); setIsAddEditOpen(true); }}
          className="w-11 h-11 -mt-5 rounded-full bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/40 ring-4 ring-slate-950 transition active:scale-95 cursor-pointer"
          title="Nuovo fumetto"
        >
          <Plus className="w-5 h-5 stroke-2" />
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
            activeTab === 'orders' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Preordini</span>
        </button>

        <button
          onClick={() => setActiveTab('readings')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2.5 rounded-lg text-[10px] font-bold transition cursor-pointer ${
            activeTab === 'readings' ? 'text-indigo-400' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <BookMarked className="w-4 h-4" />
          <span>Letture</span>
        </button>
      </div>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 text-center text-xs text-slate-500 hidden md:block">
        Comics Count 2.0 • Basato sul file personale OneDrive • Metadati & Copertine ufficiali da HoVistoCose
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

      {/* Authentication Modal when not logged in */}
      {!currentUser && !isAuthChecking && (
        <AuthModal
          onSuccess={(user) => {
            setCurrentUser(user);
          }}
        />
      )}
    </div>
  );
}

export default App;
