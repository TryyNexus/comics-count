import React, { useState, useEffect } from 'react';
import { 
  MonthlySummary, 
  PublisherBreakdownItem, 
  MonthlyTrendItem, 
  YearlyComparisonItem,
  SaleRefund 
} from '../types';
import { api } from '../api';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  TrendingUp, 
  PieChart as PieIcon, 
  Euro, 
  Plus, 
  Trash2, 
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';

interface DashboardViewProps {
  year: string;
  month: string;
  summary: MonthlySummary | null;
  onRefresh: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  year,
  month,
  summary,
  onRefresh
}) => {
  const [publisherBreakdown, setPublisherBreakdown] = useState<PublisherBreakdownItem[]>([]);
  const [monthlyTrends, setMonthlyTrends] = useState<MonthlyTrendItem[]>([]);
  const [yearlyComparison, setYearlyComparison] = useState<YearlyComparisonItem[]>([]);
  const [sales, setSales] = useState<SaleRefund[]>([]);

  // Add sale form state
  const [saleTitle, setSaleTitle] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleChannel, setSaleChannel] = useState('Vinted');
  const [saleNotes, setSaleNotes] = useState('');
  const [isAddingSale, setIsAddingSale] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, [year, month]);

  const loadDashboardData = async () => {
    try {
      const [pubRes, trendRes, yearRes, saleRes] = await Promise.all([
        api.getPublisherBreakdown(year),
        api.getMonthlyTrends(year),
        api.getYearlyComparison(),
        api.getSales(year)
      ]);
      setPublisherBreakdown(pubRes.rows || []);
      setMonthlyTrends(trendRes || []);
      setYearlyComparison(yearRes || []);
      setSales(saleRes || []);
    } catch (e) {
      console.error('Errore caricamento dati dashboard:', e);
    }
  };

  const handleAddSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleTitle.trim() || !salePrice) return;
    try {
      await api.createSale({
        year,
        month,
        title: saleTitle.trim(),
        price: parseFloat(salePrice) || 0,
        channel: saleChannel,
        notes: saleNotes.trim() || undefined
      });
      setSaleTitle('');
      setSalePrice('');
      setSaleNotes('');
      setIsAddingSale(false);
      loadDashboardData();
      onRefresh();
    } catch (e) {
      alert('Errore nel salvataggio della vendita');
    }
  };

  const handleDeleteSale = async (id: number) => {
    if (!confirm('Eliminare questa voce di vendita/rimborso?')) return;
    try {
      await api.deleteSale(id);
      loadDashboardData();
      onRefresh();
    } catch (e) {
      alert('Errore nella cancellazione');
    }
  };

  // Colors for publisher donut chart
  const CHART_COLORS = ['#38bdf8', '#f43f5e', '#a855f7', '#fb923c', '#34d399', '#facc15', '#e879f9', '#94a3b8'];

  return (
    <div className="space-y-8 pb-12">
      {/* 1. Bar Chart: Andamento Mensile Spese e Budget */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-indigo-400" />
              Andamento Spese Mese su Mese ({year})
            </h3>
            <p className="text-xs text-slate-400">
              Confronto della spesa lorda mensile, vendite registrate e budget
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-indigo-500 inline-block" />
              <span className="text-slate-300">Spesa Lorda (€)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
              <span className="text-slate-300">Spesa Netta (€)</span>
            </div>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyTrends} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" stroke="#64748b" fontSize={11} tickLine={false} />
              <YAxis stroke="#64748b" fontSize={11} tickLine={false} unit="€" />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                formatter={(val: any) => [`${Number(val).toFixed(2)} €`]}
              />
              <Bar dataKey="spent" name="Spesa Lorda" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="net" name="Spesa Netta" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Grid with Publisher Breakdown Donut & Breakdown Table */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
              <PieIcon className="w-5 h-5 text-purple-400" />
              Ripartizione per Casa Editrice ({year})
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Percentuale e importi di spesa suddivisi per editore/canale
            </p>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={publisherBreakdown}
                  dataKey="total"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={3}
                >
                  {publisherBreakdown.map((entry, index) => (
                    <Cell 
                      key={`cell-${index}`} 
                      fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]} 
                    />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                  formatter={(val: any, name: any, item: any) => [
                    `${Number(val).toFixed(2)} € (${item.payload.percentage}%)`, 
                    name
                  ]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-800/80">
            {publisherBreakdown.slice(0, 6).map((item, i) => (
              <div key={i} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950/40">
                <div className="flex items-center gap-2 truncate">
                  <span 
                    className="w-2.5 h-2.5 rounded-full shrink-0" 
                    style={{ backgroundColor: item.color || CHART_COLORS[i % CHART_COLORS.length] }} 
                  />
                  <span className="text-slate-300 truncate font-medium">{item.name}</span>
                </div>
                <span className="font-mono text-slate-400 font-bold ml-2 shrink-0">{item.percentage}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Breakdown Table */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2 mb-1">
              <Euro className="w-5 h-5 text-emerald-400" />
              Dettaglio Spesa per Editore
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Importo totale e volumi acquistati per ciascun editore
            </p>
          </div>

          <div className="overflow-x-auto grow">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                  <th className="pb-2">Editore</th>
                  <th className="pb-2 text-center">Volumi</th>
                  <th className="pb-2 text-right">Spesa (€)</th>
                  <th className="pb-2 text-right">% su Totale</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {publisherBreakdown.map((item, i) => (
                  <tr key={i} className="hover:bg-slate-800/20 transition">
                    <td className="py-2.5 font-medium text-slate-200 flex items-center gap-2">
                      <span 
                        className="w-2.5 h-2.5 rounded-full" 
                        style={{ backgroundColor: item.color || CHART_COLORS[i % CHART_COLORS.length] }} 
                      />
                      {item.name}
                    </td>
                    <td className="py-2.5 text-center text-slate-400 font-mono">{item.count}</td>
                    <td className="py-2.5 text-right font-mono font-bold text-white">{item.total.toFixed(2)} €</td>
                    <td className="py-2.5 text-right font-mono text-indigo-400 font-semibold">{item.percentage}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. Yearly Comparison */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
        <h3 className="text-base font-bold text-white mb-1">
          📅 Confronto Storico Anno su Anno (2023 - 2027)
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Confronto progressivo della spesa lorda, ricavi da vendite/rimborsi e spesa netta annuale
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
          {yearlyComparison.map((yc) => {
            const isCurrent = yc.year === year;
            return (
              <div 
                key={yc.year}
                className={`p-4 rounded-xl border transition ${
                  isCurrent 
                    ? 'bg-indigo-950/40 border-indigo-500/50 shadow-indigo-500/10 shadow-lg' 
                    : 'bg-slate-950/60 border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-bold text-white font-mono">{yc.year}</span>
                  {isCurrent && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-sm bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      In corso
                    </span>
                  )}
                </div>
                <div className="text-lg font-bold text-white font-mono">
                  {yc.net.toFixed(2)} € <span className="text-xs text-slate-400 font-normal">netti</span>
                </div>
                <div className="text-xs text-slate-400 mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Lordo:</span>
                    <span className="text-slate-300 font-mono">{yc.spent.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-emerald-400">
                    <span>Vendite:</span>
                    <span className="font-mono">-{yc.sales.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-800 text-slate-400">
                    <span>Volumi:</span>
                    <span className="font-mono text-slate-300">{yc.count}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Sales / Refunds Section (Vendite & Rimborsi Vinted) */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-amber-400" />
              Vendite, Vinted & Rimborsi ({year})
            </h3>
            <p className="text-xs text-slate-400">
              Registra i fumetti venduti o i rimborsi ricevuti: questi importi riducono direttamente la tua spesa netta annuale.
            </p>
          </div>
          <button 
            onClick={() => setIsAddingSale(!isAddingSale)}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md"
          >
            <Plus className="w-4 h-4" /> Registra Nuova Vendita / Rimborso
          </button>
        </div>

        {isAddingSale && (
          <form onSubmit={handleAddSale} className="bg-slate-950 p-4 rounded-xl border border-slate-800 mb-4 space-y-3">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Nuovo Articolo Venduto</h4>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <input 
                  type="text" 
                  required
                  placeholder="Titolo fumetto o lotto venduto (es. Daredevil 1-14)..."
                  value={saleTitle}
                  onChange={e => setSaleTitle(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-hidden focus:border-indigo-500"
                />
              </div>
              <div>
                <input 
                  type="number" 
                  step="0.01" 
                  required
                  placeholder="Prezzo Incassato (€)..."
                  value={salePrice}
                  onChange={e => setSalePrice(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs font-mono focus:outline-hidden focus:border-indigo-500"
                />
              </div>
              <div>
                <select 
                  value={saleChannel}
                  onChange={e => setSaleChannel(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-xs focus:outline-hidden focus:border-indigo-500"
                >
                  <option value="Vinted">Vinted</option>
                  <option value="Subito">Subito</option>
                  <option value="eBay">eBay</option>
                  <option value="Privato">Scambio Privato</option>
                  <option value="Rimborso">Rimborso / Reso</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button 
                type="button" 
                onClick={() => setIsAddingSale(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white"
              >
                Annulla
              </button>
              <button 
                type="submit"
                className="px-4 py-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg"
              >
                Salva Vendita
              </button>
            </div>
          </form>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
                <th className="pb-2">Titolo / Lotto Venduto</th>
                <th className="pb-2">Canale</th>
                <th className="pb-2 text-right">Importo Ricavato (€)</th>
                <th className="pb-2 text-right">Azione</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {sales.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-4 text-center text-slate-500 italic">
                    Nessuna vendita registrata per il {year}.
                  </td>
                </tr>
              ) : (
                sales.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/20 transition">
                    <td className="py-2.5 font-medium text-slate-200">{s.title}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                        {s.channel}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono font-bold text-emerald-400">
                      +{s.price.toFixed(2)} €
                    </td>
                    <td className="py-2.5 text-right">
                      <button 
                        onClick={() => handleDeleteSale(s.id)}
                        className="text-slate-500 hover:text-rose-400 transition cursor-pointer p-1"
                        title="Elimina voce"
                      >
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {sales.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-700 font-bold text-white bg-slate-950/40">
                  <td colSpan={2} className="py-3 pl-2 text-emerald-400">Totale Vendite {year}:</td>
                  <td className="py-3 text-right font-mono text-emerald-400 pr-2">
                    +{sales.reduce((acc, s) => acc + s.price, 0).toFixed(2)} €
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
