import React, { useState } from 'react';
import { MonthlySummary } from '../types';
import { 
  Euro, 
  TrendingUp, 
  BookOpen, 
  CheckCircle2, 
  Target, 
  ArrowUpRight, 
  ArrowDownRight,
  Edit2
} from 'lucide-react';
import { api } from '../api';

interface KPIBannerProps {
  summary: MonthlySummary | null;
  onRefresh: () => void;
}

export const KPIBanner: React.FC<KPIBannerProps> = ({ summary, onRefresh }) => {
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const [budgetValue, setBudgetValue] = useState(summary?.budget?.toString() || '');

  if (!summary) return null;

  const handleSaveBudget = async () => {
    try {
      const val = parseFloat(budgetValue) || 0;
      await api.setBudget(summary.year, summary.month, val);
      setIsEditingBudget(false);
      onRefresh();
    } catch (e) {
      alert('Errore nel salvataggio del budget');
    }
  };

  const budgetProgress = summary.budget > 0 
    ? Math.min(100, Math.round((summary.monthlySpent / summary.budget) * 100))
    : 0;

  const isOverBudget = summary.budget > 0 && summary.monthlySpent > summary.budget;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Spesa Mese */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider">Spesa Mese ({summary.month})</span>
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
            <Euro className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-white tracking-tight">
          {summary.monthlySpent.toFixed(2)} €
        </div>
        {summary.budget > 0 ? (
          <div className="mt-2 text-xs">
            <div className="flex justify-between text-slate-400 mb-1">
              <span>Budget: {summary.budget.toFixed(2)} €</span>
              <span className={isOverBudget ? 'text-rose-400 font-semibold' : 'text-emerald-400'}>
                {budgetProgress}%
              </span>
            </div>
            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
              <div 
                className={`h-full rounded-full transition-all duration-500 ${isOverBudget ? 'bg-rose-500' : 'bg-indigo-500'}`}
                style={{ width: `${budgetProgress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Nessun budget impostato</span>
            <button 
              onClick={() => { setBudgetValue(''); setIsEditingBudget(true); }}
              className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 cursor-pointer"
            >
              <Edit2 className="w-3 h-3" /> Imposta
            </button>
          </div>
        )}
      </div>

      {/* Spesa Netta Annuale */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider">Spesa Netta {summary.year}</span>
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <TrendingUp className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-white tracking-tight">
          {summary.annualNet.toFixed(2)} €
        </div>
        <div className="mt-1 text-xs text-slate-400 flex items-center gap-1">
          <span className="text-slate-300 font-medium">Lordo: {summary.annualSpent.toFixed(2)} €</span>
          {summary.annualSales > 0 && (
            <span className="text-emerald-400 font-medium">
              (-{summary.annualSales.toFixed(2)} € vendite)
            </span>
          )}
        </div>
      </div>

      {/* Fumetti Mese */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider">Acquisti nel Mese</span>
          <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
            <BookOpen className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-white tracking-tight">
          {summary.monthlyCount} <span className="text-sm font-normal text-slate-400">volumi</span>
        </div>
        <div className="mt-1 text-xs text-slate-400">
          Totale anno {summary.year}: <span className="text-slate-200 font-medium">{summary.annualCount} volumi</span>
        </div>
      </div>

      {/* Stato Lettura */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-lg backdrop-blur-sm relative overflow-hidden group hover:border-slate-700 transition">
        <div className="flex items-center justify-between text-slate-400 mb-1">
          <span className="text-xs font-semibold uppercase tracking-wider">Progresso Lettura</span>
          <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="text-2xl font-bold text-white tracking-tight">
          {summary.monthlyReadCount} <span className="text-sm font-normal text-slate-400">/ {summary.monthlyCount} letti</span>
        </div>
        <div className="mt-1 text-xs text-slate-400">
          {summary.monthlyCount > 0 
            ? `${Math.round((summary.monthlyReadCount / summary.monthlyCount) * 100)}% letti di questo mese`
            : 'Nessun fumetto nel mese'}
        </div>
      </div>

      {/* Budget Edit Modal / Popover */}
      {isEditingBudget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-semibold text-white mb-2">
              Imposta Budget per {summary.month} {summary.year}
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Definisci un tetto massimo di spesa per monitorare gli acquisti mensili.
            </p>
            <div className="relative mb-4">
              <input 
                type="number"
                step="0.01"
                placeholder="es. 150.00"
                value={budgetValue}
                onChange={e => setBudgetValue(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white pl-8 focus:outline-hidden focus:border-indigo-500"
                autoFocus
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">€</span>
            </div>
            <div className="flex justify-end gap-2">
              <button 
                onClick={() => setIsEditingBudget(false)}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg transition"
              >
                Annulla
              </button>
              <button 
                onClick={handleSaveBudget}
                className="px-4 py-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition"
              >
                Salva Budget
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
