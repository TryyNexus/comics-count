import React, { useState, useEffect } from 'react';
import { X, Calendar, ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface MonthYearPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentYear: string;
  currentMonth: string;
  onSelect: (year: string, month: string) => void;
  months: string[];
  years: string[];
}

export const MonthYearPickerModal: React.FC<MonthYearPickerModalProps> = ({
  isOpen,
  onClose,
  currentYear,
  currentMonth,
  onSelect,
  months,
  years
}) => {
  const [selectedYear, setSelectedYear] = useState(currentYear);

  useEffect(() => {
    if (isOpen) {
      setSelectedYear(currentYear);
    }
  }, [isOpen, currentYear]);

  if (!isOpen) return null;

  const handleMonthClick = (m: string) => {
    onSelect(selectedYear, m);
    onClose();
  };

  const currentMonthIndex = months.indexOf(currentMonth);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-xs p-0 sm:p-4 transition-opacity"
      onClick={onClose}
    >
      <div 
        className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl relative animate-in fade-in slide-in-from-bottom-6 duration-200"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.25rem)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Mobile Pull Handle */}
        <div className="sm:hidden w-12 h-1.5 bg-slate-700/80 rounded-full mx-auto -mt-2 mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 flex items-center justify-center">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Scegli Mese e Anno</h3>
              <p className="text-xs text-slate-400">Tocca un mese per visualizzare il registro</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Chiudi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Year Selector Bar */}
        <div className="mb-4">
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
            Anno
          </label>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {years.map(y => {
              const isSelected = selectedYear === y;
              return (
                <button
                  key={y}
                  onClick={() => setSelectedYear(y)}
                  className={`flex-1 min-w-[64px] py-2 px-3 rounded-xl text-xs font-mono font-bold transition cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                      : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                  }`}
                >
                  {y}
                </button>
              );
            })}
          </div>
        </div>

        {/* Months Grid (3 columns x 4 rows) */}
        <div>
          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">
            Mese
          </label>
          <div className="grid grid-cols-3 gap-2">
            {months.map((m, idx) => {
              const isCurrent = currentMonth === m && currentYear === selectedYear;
              return (
                <button
                  key={m}
                  onClick={() => handleMonthClick(m)}
                  className={`min-h-[48px] py-3 px-2 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 ${
                    isCurrent
                      ? 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/30 ring-2 ring-indigo-400'
                      : 'bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <span>{m}</span>
                  {isCurrent && <Check className="w-3.5 h-3.5 text-white stroke-3" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Quick actions at bottom */}
        <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2 text-xs">
          <button
            onClick={() => {
              const now = new Date();
              const thisYear = String(now.getFullYear());
              const thisMonth = months[now.getMonth()] || 'Gennaio';
              if (years.includes(thisYear)) {
                onSelect(thisYear, thisMonth);
                onClose();
              }
            }}
            className="py-1.5 px-3 rounded-lg text-indigo-400 hover:bg-indigo-950/50 transition font-semibold"
          >
            Mese Corrente
          </button>

          <button
            onClick={onClose}
            className="py-1.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition font-semibold"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
};
