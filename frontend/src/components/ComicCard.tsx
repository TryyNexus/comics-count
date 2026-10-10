import React, { useState } from 'react';
import { Comic, ComicStatus } from '../types';
import { getComicCoverUrl, handleCoverError } from '../utils/coverHelper';
import { 
  BookOpen, 
  Check, 
  Edit, 
  Trash2, 
  Image as ImageIcon,
  Barcode,
  Search,
  Sparkles
} from 'lucide-react';

interface ComicCardProps {
  comic: Comic;
  onEdit: (comic: Comic) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: ComicStatus) => void;
  onOpenCoverSearch: (comic: Comic) => void;
}

const STATUS_CONFIG: Record<ComicStatus, { label: string; color: string; bg: string }> = {
  'In uscita': { label: 'In uscita', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30' },
  'Preordinato': { label: 'Preordinato', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30' },
  'Acquistato': { label: 'Acquistato', color: 'text-indigo-400', bg: 'bg-indigo-500/10 border-indigo-500/30' },
  'Da leggere': { label: 'Da leggere', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  'In lettura': { label: 'In lettura', color: 'text-cyan-400', bg: 'bg-cyan-500/10 border-cyan-500/30' },
  'Letto': { label: 'Letto', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' },
  'Venduto': { label: 'Venduto', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30' }
};

export const ComicCard: React.FC<ComicCardProps> = ({
  comic,
  onEdit,
  onDelete,
  onStatusChange,
  onOpenCoverSearch
}) => {
  const [imgError, setImgError] = useState(false);
  const statusInfo = STATUS_CONFIG[comic.status] || STATUS_CONFIG['Acquistato'];
  const coverSrc = getComicCoverUrl(comic);

  const nextStatus: ComicStatus = comic.status === 'Letto' 
    ? 'Da leggere' 
    : 'Letto';

  return (
    <div className="bg-slate-900/90 border border-slate-800 hover:border-slate-700 rounded-xl overflow-hidden shadow-lg hover:shadow-indigo-500/5 transition flex flex-col group">
      {/* Cover / Image Header */}
      <div className="relative aspect-3/4 w-full bg-slate-950 flex items-center justify-center overflow-hidden border-b border-slate-800/80">
        {coverSrc && !imgError ? (
          <img 
            src={coverSrc} 
            alt={comic.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              handleCoverError(e, comic, () => setImgError(true));
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-600 p-4 text-center w-full h-full bg-gradient-to-b from-slate-900 to-slate-950">
            <BookOpen className="w-10 h-10 mb-2 stroke-1 text-slate-700" />
            <span className="text-[11px] text-slate-500 font-medium">Nessuna copertina</span>
            <button 
              onClick={() => onOpenCoverSearch(comic)}
              className="mt-2 text-[11px] font-semibold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20 cursor-pointer transition hover:bg-indigo-500/20"
            >
              <Search className="w-3 h-3" /> Cerca su HVC
            </button>
          </div>
        )}

        {/* Publisher Tag */}
        <div className="absolute top-2 left-2 z-10">
          <span 
            className="text-[11px] font-bold px-2 py-0.5 rounded-md shadow-md backdrop-blur-md text-white border"
            style={{ 
              backgroundColor: `${comic.publisher_color || '#6366f1'}dd`,
              borderColor: `${comic.publisher_color || '#6366f1'}`
            }}
          >
            {comic.publisher_name || 'Altro'}
          </span>
        </div>

        {/* Issue Number Tag */}
        {comic.issue_number && (
          <div className="absolute top-2 right-2 z-10">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-slate-900/90 text-white border border-slate-700 shadow-md">
              #{comic.issue_number}
            </span>
          </div>
        )}

        {/* Hover quick action overlay */}
        <div className="absolute inset-0 bg-slate-950/75 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
          <button 
            onClick={() => onStatusChange(comic.id, nextStatus)}
            title={comic.status === 'Letto' ? 'Segna come da leggere' : 'Segna come letto'}
            className="p-2 rounded-lg bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-lg transition cursor-pointer"
          >
            <Check className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onOpenCoverSearch(comic)}
            title="Cerca / Cambia copertina su HoVistoCose"
            className="p-2 rounded-lg bg-indigo-600/90 hover:bg-indigo-500 text-white shadow-lg transition cursor-pointer"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onEdit(comic)}
            title="Modifica scheda"
            className="p-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white shadow-lg transition cursor-pointer"
          >
            <Edit className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onDelete(comic.id)}
            title="Elimina"
            className="p-2 rounded-lg bg-rose-600/80 hover:bg-rose-500 text-white shadow-lg transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Comic Card Content */}
      <div className="p-3.5 flex flex-col grow justify-between">
        <div>
          {/* Variant badge */}
          {comic.variant_info && (
            <div className="mb-1.5">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30 truncate max-w-full inline-block">
                ✨ {comic.variant_info}
              </span>
            </div>
          )}

          {/* Title */}
          <h3 className="text-xs font-semibold text-white line-clamp-2 leading-snug group-hover:text-indigo-300 transition" title={comic.title}>
            {comic.title}
          </h3>

          {/* ISBN / EAN indicator */}
          {(comic.isbn || comic.ean) && (
            <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-1.5 font-mono">
              <Barcode className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">{comic.isbn || comic.ean}</span>
            </div>
          )}

          {/* Channel tag */}
          {comic.channel && comic.channel !== 'Fumetteria' && (
            <div className="mt-1">
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                {comic.channel}
              </span>
            </div>
          )}
        </div>

        {/* Footer: Status + Prices */}
        <div className="pt-3 mt-3 border-t border-slate-800/80 flex items-center justify-between">
          {/* Status selector */}
          <select 
            value={comic.status}
            onChange={(e) => onStatusChange(comic.id, e.target.value as ComicStatus)}
            className={`text-[11px] font-medium px-2 py-1 rounded-md border ${statusInfo.bg} ${statusInfo.color} focus:outline-hidden cursor-pointer`}
          >
            <option value="In uscita">In uscita</option>
            <option value="Preordinato">Preordinato</option>
            <option value="Acquistato">Acquistato</option>
            <option value="Da leggere">Da leggere</option>
            <option value="In lettura">In lettura</option>
            <option value="Letto">Letto</option>
            <option value="Venduto">Venduto</option>
          </select>

          {/* Price */}
          <div className="text-right">
            <span className="text-sm font-bold text-white font-mono">
              {comic.purchase_price > 0 ? `${comic.purchase_price.toFixed(2)} €` : '0.00 €'}
            </span>
            {comic.cover_price > comic.purchase_price && (
              <div className="text-[10px] text-slate-500 line-through font-mono">
                {comic.cover_price.toFixed(2)} €
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
