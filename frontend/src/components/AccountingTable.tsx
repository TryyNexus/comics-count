import React, { useState } from 'react';
import { Comic, ComicStatus, Publisher } from '../types';
import { getComicCoverUrl } from '../utils/coverHelper';
import { 
  Edit2, 
  Trash2, 
  Check, 
  Plus, 
  Search, 
  Barcode, 
  BookOpen, 
  Image as ImageIcon,
  Columns3,
  Smartphone,
  CheckCircle2,
  Clock
} from 'lucide-react';

interface AccountingTableProps {
  comics: Comic[];
  publishers: Publisher[];
  onEdit: (comic: Comic) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: ComicStatus) => void;
  onOpenCoverSearch: (comic: Comic) => void;
  onQuickAdd: (defaultPublisherName: string) => void;
  monthlySpent: number;
  year: string;
  month: string;
}

export type CategoryColumn = 'dc' | 'marvel' | 'manga' | 'altro' | 'ordini' | 'eventi';

export function getComicColumn(c: Comic): CategoryColumn {
  const pName = (c.publisher_name || '').toLowerCase();
  const chan = (c.channel || '').toLowerCase();
  const title = (c.title || '').toLowerCase();

  // 1. Ordini / Usato / HVC Total Row with price
  if (title.startsWith('hvc ordine') || chan.includes('online') || chan.includes('usato') || pName.includes('ordini')) {
    // If it's an HVC single comic (price 0) and not the total row, it must NOT go to ordini!
    if (chan.includes('hvc') && !title.startsWith('hvc ordine') && (c.purchase_price === 0 || !c.purchase_price)) {
      // route to DC, Marvel or Altro below
    } else {
      return 'ordini';
    }
  }

  // 2. DC
  if (pName.includes('dc')) return 'dc';

  // 3. Marvel
  if (pName.includes('marvel')) return 'marvel';

  // 4. Manga
  if (pName.includes('manga') || pName.includes('star') || pName.includes('j-pop')) return 'manga';

  // 5. Eventi
  if (pName.includes('eventi') || chan.includes('fiera')) return 'eventi';

  // 6. Altro (indie / TMNT / Boom / Image / Bonelli / ecc.)
  return 'altro';
}

export const AccountingTable: React.FC<AccountingTableProps> = ({
  comics,
  publishers: _publishers,
  onEdit,
  onDelete,
  onStatusChange,
  onOpenCoverSearch,
  onQuickAdd,
  monthlySpent,
  year,
  month
}) => {
  const [tableSearch, setTableSearch] = useState('');
  const [previewCover, setPreviewCover] = useState<{ title: string; src: string } | null>(null);
  
  // Mobile specific states
  const [mobileCategory, setMobileCategory] = useState<'all' | CategoryColumn>('all');
  const [mobileViewMode, setMobileViewMode] = useState<'cards' | 'table'>('cards');

  // Filter comics if search is typed
  const filteredComics = comics.filter(c => {
    if (!tableSearch.trim()) return true;
    const term = tableSearch.toLowerCase();
    return (
      (c.title || '').toLowerCase().includes(term) ||
      (c.variant_info || '').toLowerCase().includes(term) ||
      (c.isbn || c.ean || '').toLowerCase().includes(term) ||
      (c.notes || '').toLowerCase().includes(term)
    );
  });

  // Mutually exclusive partitioning across the 6 columns
  const dcList = filteredComics.filter(c => getComicColumn(c) === 'dc');
  const marvelList = filteredComics.filter(c => getComicColumn(c) === 'marvel');
  const mangaList = filteredComics.filter(c => getComicColumn(c) === 'manga');
  const altroList = filteredComics.filter(c => getComicColumn(c) === 'altro');
  const ordiniList = filteredComics.filter(c => getComicColumn(c) === 'ordini');
  const eventiList = filteredComics.filter(c => getComicColumn(c) === 'eventi');

  const maxRows = Math.max(
    dcList.length, 
    marvelList.length, 
    mangaList.length, 
    altroList.length, 
    ordiniList.length, 
    eventiList.length, 
    3
  );
  const rows = Array.from({ length: maxRows });

  const sumDC = dcList.reduce((acc, c) => acc + c.purchase_price, 0);
  const sumMarvel = marvelList.reduce((acc, c) => acc + c.purchase_price, 0);
  const sumManga = mangaList.reduce((acc, c) => acc + c.purchase_price, 0);
  const sumAltro = altroList.reduce((acc, c) => acc + c.purchase_price, 0);
  const sumOrdini = ordiniList.reduce((acc, c) => acc + c.purchase_price, 0);
  const sumEventi = eventiList.reduce((acc, c) => acc + c.purchase_price, 0);

  // List to display on mobile cards
  const mobileComicsList = mobileCategory === 'all' 
    ? filteredComics 
    : filteredComics.filter(c => getComicColumn(c) === mobileCategory);

  const getCategoryMeta = (cat: CategoryColumn) => {
    switch (cat) {
      case 'dc': return { name: 'DC Comics', color: 'sky', bg: 'bg-sky-500/10', text: 'text-sky-400', border: 'border-sky-500/30', addKey: 'DC' };
      case 'marvel': return { name: 'Marvel', color: 'rose', bg: 'bg-rose-500/10', text: 'text-rose-400', border: 'border-rose-500/30', addKey: 'Marvel' };
      case 'manga': return { name: 'Manga', color: 'purple', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', addKey: 'Manga' };
      case 'altro': return { name: 'Altro / Indie', color: 'emerald', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', addKey: 'Altro' };
      case 'ordini': return { name: 'Ordini / HVC', color: 'slate', bg: 'bg-slate-700/20', text: 'text-slate-300', border: 'border-slate-700/40', addKey: 'Ordini / Usato' };
      case 'eventi': return { name: 'Eventi / Fiere', color: 'pink', bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30', addKey: 'Eventi / Fiere' };
    }
  };

  const renderCellContent = (comic: Comic | undefined, isLast: boolean) => {
    if (!comic) {
      return (
        <td key={Math.random()} className={`p-2.5 text-slate-700 text-center italic ${isLast ? '' : 'border-r border-slate-800/80'}`}>
          -
        </td>
      );
    }

    const coverSrc = getComicCoverUrl(comic);
    const isRead = comic.status === 'Letto';

    return (
      <td key={comic.id} className={`p-2.5 align-top ${isLast ? '' : 'border-r border-slate-800/80'} hover:bg-slate-800/20 transition group`}>
        <div className="flex gap-2">
          {/* Miniature Cover Thumbnail */}
          <div 
            className="w-8 h-11 shrink-0 bg-slate-950 rounded border border-slate-800 overflow-hidden relative cursor-pointer group/thumb shadow-xs"
            onClick={() => {
              if (coverSrc) setPreviewCover({ title: comic.title, src: coverSrc });
              else onOpenCoverSearch(comic);
            }}
            title={coverSrc ? "Clicca per ingrandire copertina" : "Cerca copertina"}
          >
            {coverSrc ? (
              <>
                <img 
                  src={coverSrc} 
                  alt={comic.title} 
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover group-hover/thumb:scale-110 transition duration-200" 
                  onError={(e) => {
                    const img = e.currentTarget;
                    img.style.display = 'none';
                    const fallback = img.nextElementSibling as HTMLElement;
                    if (fallback) fallback.style.display = 'flex';
                  }}
                />
                <div className="w-full h-full hidden flex-col items-center justify-center text-slate-600 bg-slate-950 text-[8px]">
                  <BookOpen className="w-3 h-3 stroke-1" />
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 bg-slate-950 text-[8px]">
                <BookOpen className="w-3 h-3 stroke-1" />
              </div>
            )}
          </div>

          {/* Comic Details */}
          <div className="grow min-w-0 flex flex-col justify-between">
            <div>
              {/* Variant & Issue tags */}
              <div className="flex items-center gap-1 flex-wrap mb-0.5">
                {comic.issue_number && (
                  <span className="text-[10px] font-bold px-1 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                    #{comic.issue_number}
                  </span>
                )}
                {comic.variant_info && (
                  <span className="text-[9px] font-semibold px-1 py-0.2 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 truncate max-w-[120px]" title={comic.variant_info}>
                    ✨ {comic.variant_info}
                  </span>
                )}
              </div>

              {/* Title */}
              <div 
                onClick={() => onEdit(comic)}
                className="font-semibold text-slate-100 text-xs leading-tight truncate hover:text-indigo-300 cursor-pointer transition"
                title={comic.title}
              >
                {comic.title}
              </div>

              {/* Barcode / EAN */}
              {(comic.isbn || comic.ean) && (
                <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                  <Barcode className="w-3 h-3 text-indigo-400 shrink-0" />
                  <span className="truncate">{comic.isbn || comic.ean}</span>
                </div>
              )}
            </div>

            {/* Footer inside cell: Status pill & Price */}
            <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/40">
              <span 
                onClick={() => onStatusChange(comic.id, isRead ? 'Da leggere' : 'Letto')}
                className={`cursor-pointer px-1.5 py-0.5 rounded text-[10px] font-bold transition flex items-center gap-1 ${
                  isRead 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20' 
                    : comic.status === 'Preordinato'
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20'
                    : 'bg-orange-500/10 text-orange-400 border border-orange-500/20 hover:bg-orange-500/20'
                }`}
                title="Clicca per invertire stato lettura"
              >
                {isRead && <Check className="w-2.5 h-2.5" />}
                {comic.status}
              </span>

              {/* Price & Quick actions */}
              <div className="flex items-center gap-1.5">
                <span className="font-mono font-bold text-white text-xs">
                  {comic.purchase_price > 0 ? `${comic.purchase_price.toFixed(2)} €` : '0 €'}
                </span>
                <div className="opacity-0 group-hover:opacity-100 transition flex items-center">
                  <button 
                    onClick={() => onOpenCoverSearch(comic)}
                    className="text-slate-400 hover:text-indigo-300 p-0.5 transition cursor-pointer"
                    title="Cerca copertina e codice"
                  >
                    <ImageIcon className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => onEdit(comic)}
                    className="text-slate-400 hover:text-white p-0.5 transition cursor-pointer"
                    title="Modifica"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button 
                    onClick={() => onDelete(comic.id)}
                    className="text-slate-400 hover:text-rose-400 p-0.5 transition cursor-pointer"
                    title="Elimina"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </td>
    );
  };

  return (
    <div className="space-y-4 pb-12">
      {/* Table Toolbar Header */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 sm:p-4 shadow-xl flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-extrabold text-white tracking-tight flex items-center gap-2">
              <span>📊 Registro Contabile Uscite</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-semibold font-mono">
                {month} {year}
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Prospetto mensile a 6 colonne: DC, Marvel, Manga, Altro/Indie, Ordini (HVC Totale) ed Eventi.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Quick Table Search */}
          <div className="relative min-w-[180px] sm:min-w-[220px]">
            <input 
              type="text"
              placeholder="Filtra in tabella..."
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-hidden focus:border-indigo-500"
            />
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
          </div>

          {/* Monthly Grand Total Pill */}
          <div className="bg-indigo-950/60 border border-indigo-500/40 px-3 py-1.5 rounded-lg flex items-center gap-2">
            <span className="text-xs text-indigo-300 font-semibold">Totale:</span>
            <span className="text-base font-bold text-white font-mono">{monthlySpent.toFixed(2)} €</span>
          </div>
        </div>
      </div>

      {/* MOBILE CONTROLS (Visible on smaller screens: Category pills & View Switcher) */}
      <div className="md:hidden space-y-3">
        {/* Toggle between Mobile Cards View and Full Horizontal Table */}
        <div className="flex items-center justify-between bg-slate-900/80 p-2 rounded-xl border border-slate-800 text-xs">
          <span className="text-slate-400 font-medium">Visualizzazione Mobile:</span>
          <div className="flex gap-1">
            <button
              onClick={() => setMobileViewMode('cards')}
              className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                mobileViewMode === 'cards'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Schede
            </button>
            <button
              onClick={() => setMobileViewMode('table')}
              className={`px-2.5 py-1 rounded-lg font-semibold flex items-center gap-1.5 transition ${
                mobileViewMode === 'table'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Columns3 className="w-3.5 h-3.5" />
              Tabella
            </button>
          </div>
        </div>

        {/* Category Pills Bar */}
        {mobileViewMode === 'cards' && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
            <button
              onClick={() => setMobileCategory('all')}
              className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition ${
                mobileCategory === 'all'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-900 text-slate-400 border border-slate-800'
              }`}
            >
              Tutti ({filteredComics.length})
            </button>
            <button
              onClick={() => setMobileCategory('dc')}
              className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition ${
                mobileCategory === 'dc'
                  ? 'bg-sky-600 text-white shadow-xs'
                  : 'bg-sky-950/40 text-sky-400 border border-sky-800/40'
              }`}
            >
              DC ({dcList.length}) • {sumDC.toFixed(2)}€
            </button>
            <button
              onClick={() => setMobileCategory('marvel')}
              className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition ${
                mobileCategory === 'marvel'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-rose-950/40 text-rose-400 border border-rose-800/40'
              }`}
            >
              Marvel ({marvelList.length}) • {sumMarvel.toFixed(2)}€
            </button>
            <button
              onClick={() => setMobileCategory('manga')}
              className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition ${
                mobileCategory === 'manga'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-purple-950/40 text-purple-400 border border-purple-800/40'
              }`}
            >
              Manga ({mangaList.length}) • {sumManga.toFixed(2)}€
            </button>
            <button
              onClick={() => setMobileCategory('altro')}
              className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition ${
                mobileCategory === 'altro'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-emerald-950/40 text-emerald-400 border border-emerald-800/40'
              }`}
            >
              Altro ({altroList.length})
            </button>
            <button
              onClick={() => setMobileCategory('ordini')}
              className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition ${
                mobileCategory === 'ordini'
                  ? 'bg-slate-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 border border-slate-700'
              }`}
            >
              Ordini ({ordiniList.length}) • {sumOrdini.toFixed(2)}€
            </button>
            <button
              onClick={() => setMobileCategory('eventi')}
              className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition ${
                mobileCategory === 'eventi'
                  ? 'bg-pink-600 text-white shadow-xs'
                  : 'bg-pink-950/40 text-pink-400 border border-pink-800/40'
              }`}
            >
              Eventi ({eventiList.length}) • {sumEventi.toFixed(2)}€
            </button>
          </div>
        )}
      </div>

      {/* MOBILE CARDS VIEW (Displayed on mobile when cards mode is active) */}
      <div className={`space-y-2.5 ${mobileViewMode === 'cards' ? 'block md:hidden' : 'hidden'}`}>
        {mobileComicsList.length === 0 ? (
          <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl text-slate-500 text-sm">
            Nessun fumetto in questa categoria per {month} {year}.
          </div>
        ) : (
          mobileComicsList.map(comic => {
            const coverSrc = getComicCoverUrl(comic);
            const isRead = comic.status === 'Letto';
            const col = getComicColumn(comic);
            const meta = getCategoryMeta(col);

            return (
              <div 
                key={comic.id} 
                className="bg-slate-900 border border-slate-800 rounded-xl p-3 shadow-md flex gap-3 items-center"
              >
                {/* Miniature cover */}
                <div 
                  className="w-12 h-16 shrink-0 bg-slate-950 rounded-lg border border-slate-800 overflow-hidden relative cursor-pointer"
                  onClick={() => {
                    if (coverSrc) setPreviewCover({ title: comic.title, src: coverSrc });
                    else onOpenCoverSearch(comic);
                  }}
                >
                  {coverSrc ? (
                    <img 
                      src={coverSrc} 
                      alt={comic.title} 
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-600 text-[9px]">
                      <BookOpen className="w-4 h-4 stroke-1" />
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="grow min-w-0">
                  <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${meta.bg} ${meta.text} ${meta.border}`}>
                      {meta.name}
                    </span>
                    {comic.issue_number && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        #{comic.issue_number}
                      </span>
                    )}
                    {comic.variant_info && (
                      <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40 truncate max-w-[140px]">
                        ✨ {comic.variant_info}
                      </span>
                    )}
                  </div>

                  <h4 
                    onClick={() => onEdit(comic)} 
                    className="font-bold text-white text-xs truncate leading-tight cursor-pointer hover:text-indigo-300"
                  >
                    {comic.title}
                  </h4>

                  {(comic.isbn || comic.ean) && (
                    <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                      <Barcode className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span className="truncate">{comic.isbn || comic.ean}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/60">
                    <button
                      onClick={() => onStatusChange(comic.id, isRead ? 'Da leggere' : 'Letto')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition flex items-center gap-1 cursor-pointer ${
                        isRead 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : comic.status === 'Preordinato'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                      }`}
                    >
                      {isRead ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                      {comic.status}
                    </button>

                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-white text-xs">
                        {comic.purchase_price > 0 ? `${comic.purchase_price.toFixed(2)} €` : '0 €'}
                      </span>
                      <button 
                        onClick={() => onEdit(comic)}
                        className="text-slate-400 hover:text-white p-1"
                        title="Modifica"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* FULL 6-COLUMN SPREADSHEET (Visible on desktop, or on mobile when Table mode is selected) */}
      <div className={`bg-slate-900/95 border border-slate-800 rounded-xl overflow-hidden shadow-2xl ${mobileViewMode === 'table' ? 'block' : 'hidden md:block'}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[1200px]">
            <thead>
              {/* Top Category Headers */}
              <tr className="border-b border-slate-800 text-white font-bold text-xs uppercase tracking-wider">
                {/* 1. DC */}
                <th className="p-3 border-r border-slate-800 bg-sky-950/30 text-sky-400" style={{ width: '16.6%' }}>
                  <div className="flex items-center justify-between">
                    <span>DC Comics ({dcList.length})</span>
                    <button 
                      onClick={() => onQuickAdd('DC')}
                      className="text-[11px] p-1 rounded hover:bg-sky-500/20 text-sky-300 transition cursor-pointer"
                      title="Aggiungi fumetto DC"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </th>

                {/* 2. Marvel */}
                <th className="p-3 border-r border-slate-800 bg-rose-950/30 text-rose-400" style={{ width: '16.6%' }}>
                  <div className="flex items-center justify-between">
                    <span>Marvel Comics ({marvelList.length})</span>
                    <button 
                      onClick={() => onQuickAdd('Marvel')}
                      className="text-[11px] p-1 rounded hover:bg-rose-500/20 text-rose-300 transition cursor-pointer"
                      title="Aggiungi fumetto Marvel"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </th>

                {/* 3. Manga */}
                <th className="p-3 border-r border-slate-800 bg-purple-950/30 text-purple-400" style={{ width: '16.6%' }}>
                  <div className="flex items-center justify-between">
                    <span>Manga ({mangaList.length})</span>
                    <button 
                      onClick={() => onQuickAdd('Manga')}
                      className="text-[11px] p-1 rounded hover:bg-purple-500/20 text-purple-300 transition cursor-pointer"
                      title="Aggiungi Manga"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </th>

                {/* 4. Altro / Indie */}
                <th className="p-3 border-r border-slate-800 bg-emerald-950/30 text-emerald-400" style={{ width: '16.6%' }}>
                  <div className="flex items-center justify-between">
                    <span>Altro / Indie ({altroList.length})</span>
                    <button 
                      onClick={() => onQuickAdd('Altro')}
                      className="text-[11px] p-1 rounded hover:bg-emerald-500/20 text-emerald-300 transition cursor-pointer"
                      title="Aggiungi fumetto Altro / Indipendente"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </th>

                {/* 5. Ordini & Vinted (Only HVC summary with price + store orders) */}
                <th className="p-3 border-r border-slate-800 bg-slate-800/40 text-slate-300" style={{ width: '16.6%' }}>
                  <div className="flex items-center justify-between">
                    <span>Ordini & Vinted ({ordiniList.length})</span>
                    <button 
                      onClick={() => onQuickAdd('Ordini / Usato')}
                      className="text-[11px] p-1 rounded hover:bg-slate-700 text-slate-200 transition cursor-pointer"
                      title="Aggiungi Ordine o acquisto usato"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </th>

                {/* 6. Eventi / Fiere */}
                <th className="p-3 bg-pink-950/30 text-pink-400" style={{ width: '16.6%' }}>
                  <div className="flex items-center justify-between">
                    <span>Eventi / Fiere ({eventiList.length})</span>
                    <button 
                      onClick={() => onQuickAdd('Eventi / Fiere')}
                      className="text-[11px] p-1 rounded hover:bg-pink-500/20 text-pink-300 transition cursor-pointer"
                      title="Aggiungi acquisto fiera/evento"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </th>
              </tr>
            </thead>

            {/* Table Rows */}
            <tbody className="divide-y divide-slate-800/60 font-normal">
              {rows.map((_, idx) => {
                const dc = dcList[idx];
                const marvel = marvelList[idx];
                const manga = mangaList[idx];
                const altro = altroList[idx];
                const ordini = ordiniList[idx];
                const eventi = eventiList[idx];

                return (
                  <tr key={idx} className="hover:bg-slate-800/10 transition">
                    {renderCellContent(dc, false)}
                    {renderCellContent(marvel, false)}
                    {renderCellContent(manga, false)}
                    {renderCellContent(altro, false)}
                    {renderCellContent(ordini, false)}
                    {renderCellContent(eventi, true)}
                  </tr>
                );
              })}
            </tbody>

            {/* Subtotals & Formula Footer */}
            <tfoot>
              <tr className="bg-slate-950 font-bold border-t border-slate-700 text-xs text-white">
                {/* Subtotale DC */}
                <td className="p-3 border-r border-slate-800 bg-sky-950/20">
                  <div className="flex justify-between items-center text-sky-400">
                    <span>Subtotale DC</span>
                    <span className="font-mono text-sm">{sumDC.toFixed(2)} €</span>
                  </div>
                </td>

                {/* Subtotale Marvel */}
                <td className="p-3 border-r border-slate-800 bg-rose-950/20">
                  <div className="flex justify-between items-center text-rose-400">
                    <span>Subtotale Marvel</span>
                    <span className="font-mono text-sm">{sumMarvel.toFixed(2)} €</span>
                  </div>
                </td>

                {/* Subtotale Manga */}
                <td className="p-3 border-r border-slate-800 bg-purple-950/20">
                  <div className="flex justify-between items-center text-purple-400">
                    <span>Subtotale Manga</span>
                    <span className="font-mono text-sm">{sumManga.toFixed(2)} €</span>
                  </div>
                </td>

                {/* Subtotale Altro */}
                <td className="p-3 border-r border-slate-800 bg-emerald-950/20">
                  <div className="flex justify-between items-center text-emerald-400">
                    <span>Subtotale Altro</span>
                    <span className="font-mono text-sm">{sumAltro.toFixed(2)} €</span>
                  </div>
                </td>

                {/* Subtotale Ordini */}
                <td className="p-3 border-r border-slate-800 bg-slate-800/20">
                  <div className="flex justify-between items-center text-slate-300">
                    <span>Subtotale Ordini/HVC</span>
                    <span className="font-mono text-sm">{sumOrdini.toFixed(2)} €</span>
                  </div>
                </td>

                {/* Subtotale Eventi */}
                <td className="p-3 bg-pink-950/20">
                  <div className="flex justify-between items-center text-pink-400">
                    <span>Subtotale Eventi</span>
                    <span className="font-mono text-sm">{sumEventi.toFixed(2)} €</span>
                  </div>
                </td>
              </tr>

              {/* Grand Total Row */}
              <tr className="bg-slate-950 border-t border-slate-800 text-xs text-white">
                <td colSpan={6} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="text-xs text-slate-400 font-mono flex items-center gap-2">
                      <span className="text-indigo-400 font-bold">Formula Excel:</span>
                      <code>= SOMMA(DC + Marvel + Manga + Altro + Ordini + Eventi)</code>
                      <span className="text-slate-500">
                        ({sumDC.toFixed(2)} + {sumMarvel.toFixed(2)} + {sumManga.toFixed(2)} + {sumAltro.toFixed(2)} + {sumOrdini.toFixed(2)} + {sumEventi.toFixed(2)})
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Totale Mese:</span>
                      <span className="text-xl font-black text-white font-mono bg-indigo-600/30 px-3 py-1 rounded-lg border border-indigo-500/40">
                        {monthlySpent.toFixed(2)} €
                      </span>
                    </div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
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
