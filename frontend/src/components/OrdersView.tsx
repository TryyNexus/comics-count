import React, { useState, useEffect } from 'react';
import { Order, Comic } from '../types';
import { api } from '../api';
import { ShoppingCart, Plus, Trash2, PackageCheck, Store, Calendar, Info, BookOpen } from 'lucide-react';
import { getComicCoverUrl } from '../utils/coverHelper';

interface OrdersViewProps {
  currentYear: string;
}

export const OrdersView: React.FC<OrdersViewProps> = ({ currentYear }) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [hvcComics, setHvcComics] = useState<Comic[]>([]);
  const [activeTab, setActiveTab] = useState<'hvc' | 'stores'>('hvc');

  // Form for store order
  const [storeName, setStoreName] = useState('Libraccio');
  const [orderTitle, setOrderTitle] = useState('');
  const [orderPrice, setOrderPrice] = useState('');
  const [itemsCount, setItemsCount] = useState('1');
  const [isAddingOrder, setIsAddingOrder] = useState(false);

  useEffect(() => {
    loadData();
  }, [currentYear]);

  // Default active tab based on which has content for the selected year
  useEffect(() => {
    if (currentYear === '2024') {
      setActiveTab('stores');
    } else {
      setActiveTab('hvc');
    }
  }, [currentYear]);

  const loadData = async () => {
    try {
      // Online store orders belong ONLY to 2024. HVC pre-orders belong to their sheet year (e.g. 2026).
      const [ordList, allComics] = await Promise.all([
        api.getOrders(currentYear),
        api.getComics({ channel: 'HVC / Preordine', year: currentYear })
      ]);
      setOrders(ordList);
      setHvcComics(allComics);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderTitle.trim() || !orderPrice) return;
    try {
      await api.createOrder({
        store_name: storeName,
        title: orderTitle.trim(),
        total_price: parseFloat(orderPrice) || 0,
        items_count: parseInt(itemsCount) || 1,
        year: '2024' // Strictly ascribed to 2024 as requested
      });
      setOrderTitle('');
      setOrderPrice('');
      setItemsCount('1');
      setIsAddingOrder(false);
      loadData();
    } catch (e) {
      alert('Errore nel salvataggio ordine');
    }
  };

  const handleDeleteOrder = async (id: number) => {
    if (!confirm('Eliminare questo ordine?')) return;
    try {
      await api.deleteOrder(id);
      loadData();
    } catch (e) {
      alert('Errore nella cancellazione');
    }
  };

  const totalStoresSpent = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);

  return (
    <div className="space-y-6 pb-12">
      {/* Tab Switcher */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3 items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('hvc')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'hvc'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <PackageCheck className="w-4 h-4" />
            Preordini HoVistoCose (HVC {currentYear}) ({hvcComics.length})
          </button>
          <button
            onClick={() => setActiveTab('stores')}
            className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === 'stores'
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            <Store className="w-4 h-4" />
            Ordini Store Online {currentYear === '2024' ? `(2024)` : ''} ({orders.length})
          </button>
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Anno selezionato: <span className="font-bold text-white">{currentYear}</span>
        </div>
      </div>

      {activeTab === 'hvc' ? (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <PackageCheck className="w-5 h-5 text-indigo-400" />
                Catalogo Preordini HoVistoCose (HVC {currentYear})
              </h3>
              <p className="text-xs text-slate-400">
                Volumi, spillati, variant e copertine prenotate su HVC basate sul foglio HVC{currentYear}.
              </p>
            </div>
            <span className="text-xs px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 font-semibold font-mono">
              {hvcComics.length} titoli prenotati ({currentYear})
            </span>
          </div>

          {hvcComics.length === 0 ? (
            <div className="py-12 px-4 text-center bg-slate-950/40 rounded-xl border border-slate-800/60">
              <PackageCheck className="w-8 h-8 mx-auto mb-2 opacity-40 text-indigo-400" />
              <p className="text-xs font-semibold text-slate-300">
                Nessun preordine HoVistoCose per il {currentYear}.
              </p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                I preordini HVC sono ascritti all'anno indicato sul relativo foglio (es. HVC2026 per il 2026). Quando creerai altri fogli HVC nel file Excel (es. HVC2027), verranno catalogati automaticamente per quell'anno.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {hvcComics.map((item) => {
                const cover = getComicCoverUrl(item);

                return (
                  <div 
                    key={item.id}
                    className="bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 p-3.5 rounded-xl transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                          {item.month} {item.year}
                        </span>
                        <span 
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md text-white border"
                          style={{ 
                            backgroundColor: `${item.publisher_color || '#6366f1'}cc`,
                            borderColor: item.publisher_color || '#6366f1'
                          }}
                        >
                          {item.publisher_name}
                        </span>
                      </div>

                      <div className="flex gap-2.5">
                        {cover && (
                          <div className="w-8 h-11 shrink-0 bg-slate-900 rounded border border-slate-800 overflow-hidden shadow">
                            <img 
                              src={cover} 
                              alt={item.title} 
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover" 
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          </div>
                        )}

                        <div className="grow min-w-0">
                          <h4 className="text-xs font-semibold text-white line-clamp-2 leading-relaxed" title={item.title}>
                            {item.title}
                          </h4>

                          {item.variant_info && (
                            <div className="mt-1">
                              <span className="text-[9px] text-purple-300 bg-purple-950/50 border border-purple-800/40 px-1.5 py-0.5 rounded-xs inline-block truncate max-w-[200px]" title={item.variant_info}>
                                ✨ {item.variant_info}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
                      <span className="text-amber-400 font-semibold">{item.status}</span>
                      <span className="font-mono text-slate-300">
                        {item.purchase_price > 0 ? `${item.purchase_price.toFixed(2)} €` : 'Da contabilizzare'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-400" />
                Ordini Store Online (Libraccio, My Comics, MangaYo, Amazon...)
              </h3>
              <p className="text-xs text-slate-400">
                Ordini aggregati e cumulativi da store online ascritti all'anno 2024.
              </p>
            </div>

            {currentYear === '2024' ? (
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-500/40 px-3 py-1 rounded-lg">
                  Totale Store 2024: {totalStoresSpent.toFixed(2)} €
                </span>
                <button 
                  onClick={() => setIsAddingOrder(!isAddingOrder)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Nuovo Ordine Store
                </button>
              </div>
            ) : null}
          </div>

          {currentYear !== '2024' ? (
            <div className="py-12 px-6 text-center bg-slate-950/50 rounded-xl border border-slate-800/70 space-y-2">
              <Info className="w-8 h-8 mx-auto text-amber-400/80 mb-2" />
              <h4 className="text-sm font-bold text-white">
                Ordini Store Online non visibili per il {currentYear}
              </h4>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                Tutti gli ordini su store online (Libraccio, My Comics, MangaYo, Amazon, Feltrinelli) sono ascritti esclusivamente al <strong>2024</strong>.
              </p>
              <p className="text-[11px] text-slate-500">
                Per visualizzare la lista completa e i totali, seleziona l'anno <strong>2024</strong> dal selettore temporale in cima alla pagina.
              </p>
            </div>
          ) : (
            <>
              {isAddingOrder && (
                <form onSubmit={handleCreateOrder} className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-5 space-y-3">
                  <h4 className="text-xs font-bold text-slate-200 uppercase">Aggiungi Ordine Cumulativo (2024)</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <select 
                        value={storeName}
                        onChange={e => setStoreName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                      >
                        <option value="Libraccio">Libraccio</option>
                        <option value="My Comics">My Comics</option>
                        <option value="MangaYo">MangaYo</option>
                        <option value="Amazon">Amazon</option>
                        <option value="Feltrinelli">Feltrinelli</option>
                        <option value="Altro">Altro Store</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <input 
                        type="text"
                        required
                        placeholder="Titoli o descrizione ordine (es. Jujutsu Kaisen 0-3 + 5-7)..."
                        value={orderTitle}
                        onChange={e => setOrderTitle(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs"
                      />
                    </div>
                    <div>
                      <input 
                        type="number"
                        step="0.01"
                        required
                        placeholder="Totale Speso (€)..."
                        value={orderPrice}
                        onChange={e => setOrderPrice(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono font-bold"
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <button 
                      type="button" 
                      onClick={() => setIsAddingOrder(false)}
                      className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
                    >
                      Annulla
                    </button>
                    <button 
                      type="submit"
                      className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg"
                    >
                      Salva Ordine
                    </button>
                  </div>
                </form>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {orders.map((ord) => (
                  <div 
                    key={ord.id}
                    className="bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 p-3.5 rounded-xl transition flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-indigo-400 bg-indigo-950/60 border border-indigo-800/40 px-2 py-0.5 rounded-md">
                          {ord.store_name}
                        </span>
                        <button 
                          onClick={() => handleDeleteOrder(ord.id)}
                          className="text-slate-500 hover:text-rose-400 p-1 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-xs font-medium text-slate-200 line-clamp-2">
                        {ord.title}
                      </p>
                    </div>
                    <div className="mt-3 pt-2 border-t border-slate-800/60 flex items-center justify-between">
                      <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded-xs">
                        {ord.status}
                      </span>
                      <span className="text-sm font-bold font-mono text-white">
                        {ord.total_price.toFixed(2)} €
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
