import React, { useState } from 'react';
import { Comic, Publisher, ComicStatus, PurchaseChannel } from '../types';
import { ComicCard } from './ComicCard';
import { Search, Plus, Filter, BookOpen } from 'lucide-react';

interface ComicsGridProps {
  comics: Comic[];
  publishers: Publisher[];
  onEdit: (comic: Comic) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: ComicStatus) => void;
  onOpenCoverSearch: (comic: Comic) => void;
  onAddNew: () => void;
}

export const ComicsGrid: React.FC<ComicsGridProps> = ({
  comics,
  publishers,
  onEdit,
  onDelete,
  onStatusChange,
  onOpenCoverSearch,
  onAddNew
}) => {
  const [search, setSearch] = useState('');
  const [selectedPublisher, setSelectedPublisher] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const filteredComics = comics.filter(c => {
    if (selectedPublisher !== 'all') {
      if (c.publisher_name !== selectedPublisher && c.publisher_id?.toString() !== selectedPublisher) {
        return false;
      }
    }
    if (selectedStatus !== 'all' && c.status !== selectedStatus) {
      return false;
    }
    if (search.trim()) {
      const term = search.toLowerCase();
      const matchTitle = (c.title || '').toLowerCase().includes(term);
      const matchVariant = (c.variant_info || '').toLowerCase().includes(term);
      const matchNotes = (c.notes || '').toLowerCase().includes(term);
      const matchIsbn = (c.isbn || c.ean || '').toLowerCase().includes(term);
      if (!matchTitle && !matchVariant && !matchNotes && !matchIsbn) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5 pb-12">
      {/* Filter and Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg flex flex-wrap items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px]">
          <input
            type="text"
            placeholder="Cerca per titolo, variante, codice ISBN o note..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-lg pl-9 pr-4 py-2 text-white text-xs placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        </div>

        {/* Publisher Filter */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 max-w-full">
          <button
            onClick={() => setSelectedPublisher('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition cursor-pointer ${
              selectedPublisher === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            Tutti gli Editori
          </button>
          {publishers.slice(0, 7).map(p => (
            <button
              key={p.id}
              onClick={() => setSelectedPublisher(p.name)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition cursor-pointer flex items-center gap-1.5 ${
                selectedPublisher === p.name
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
              {p.name}
            </button>
          ))}
        </div>

        {/* Status Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="bg-slate-950 border border-slate-700/80 rounded-lg px-3 py-2 text-white text-xs focus:outline-hidden cursor-pointer"
          >
            <option value="all">Tutti gli stati</option>
            <option value="In uscita">In uscita</option>
            <option value="Preordinato">Preordinato</option>
            <option value="Acquistato">Acquistato</option>
            <option value="Da leggere">Da leggere</option>
            <option value="In lettura">In lettura</option>
            <option value="Letto">Letto</option>
            <option value="Venduto">Venduto</option>
          </select>

          <button
            onClick={onAddNew}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-indigo-600/30 shrink-0"
          >
            <Plus className="w-4 h-4" /> Nuovo Fumetto
          </button>
        </div>
      </div>

      {/* Comics Grid */}
      {filteredComics.length === 0 ? (
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
          <BookOpen className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white mb-1">Nessun fumetto trovato</h3>
          <p className="text-xs text-slate-400 mb-4 max-w-sm mx-auto">
            Nessun fumetto corrisponde ai filtri selezionati per questo mese o ricerca.
          </p>
          <button
            onClick={onAddNew}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs inline-flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" /> Aggiungi Fumetto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredComics.map(comic => (
            <ComicCard
              key={comic.id}
              comic={comic}
              onEdit={onEdit}
              onDelete={onDelete}
              onStatusChange={onStatusChange}
              onOpenCoverSearch={onOpenCoverSearch}
            />
          ))}
        </div>
      )}
    </div>
  );
};
