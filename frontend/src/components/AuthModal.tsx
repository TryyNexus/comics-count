import React, { useState } from 'react';
import { api } from '../api';
import { User } from '../types';
import { 
  Lock, 
  User as UserIcon, 
  LogIn, 
  UserPlus, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  X, 
  KeyRound, 
  CheckCircle2, 
  Mail, 
  ArrowLeft 
} from 'lucide-react';

interface AuthModalProps {
  onSuccess: (user: User) => void;
  onClose?: () => void;
}

type AuthMode = 'login' | 'register' | 'forgot_password';

export function AuthModal({ onSuccess, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  
  // Password reset fields
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (mode === 'login') {
      if (!username.trim() || !password) {
        setError('Inserisci sia lo Username che la Password.');
        return;
      }
      setIsLoading(true);
      try {
        const res = await api.login(username.trim(), password);
        onSuccess(res.user);
      } catch (err: any) {
        setError(err.message || 'Errore durante l\'accesso');
      } finally {
        setIsLoading(false);
      }
    } else if (mode === 'register') {
      if (!username.trim() || !password) {
        setError('Inserisci sia lo Username che la Password.');
        return;
      }
      setIsLoading(true);
      try {
        const res = await api.register(username.trim(), password, email.trim() || undefined, displayName.trim() || undefined);
        onSuccess(res.user);
      } catch (err: any) {
        setError(err.message || 'Errore durante la registrazione');
      } finally {
        setIsLoading(false);
      }
    } else if (mode === 'forgot_password') {
      if (!username.trim() || !email.trim() || !newPassword) {
        setError('Compila tutti i campi: Username, Email e Nuova Password.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Le due password digitate non coincidono.');
        return;
      }
      if (newPassword.length < 4) {
        setError('La nuova password deve contenere almeno 4 caratteri.');
        return;
      }
      setIsLoading(true);
      try {
        const res = await api.resetPassword(username.trim(), email.trim(), newPassword);
        setSuccessMessage(res.message || 'Password reimpostata con successo!');
        setPassword(newPassword);
        setTimeout(() => {
          setMode('login');
          setSuccessMessage('Password reimpostata! Ora puoi accedere.');
        }, 1500);
      } catch (err: any) {
        setError(err.message || 'Errore durante il recupero password');
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div 
        className="relative bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden p-6 sm:p-8 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 z-20 p-2.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 active:scale-95 transition cursor-pointer"
            title="Chiudi finestra"
            aria-label="Chiudi finestra"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* App Logo & Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-xl shadow-indigo-500/20 border border-slate-800 mb-3 bg-slate-950">
            <img src="/logo.png" alt="Comics Count" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-1.5">
            Comics Count <span className="text-indigo-400 font-mono text-xs font-semibold px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20">2.0</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'register' && 'Crea il tuo profilo personale per tracciare la tua collezione privata'}
            {mode === 'login' && 'Accedi per visualizzare e gestire la tua collezione di fumetti'}
            {mode === 'forgot_password' && 'Recupera l\'accesso verificando il tuo username e la tua email'}
          </p>
        </div>

        {/* Feedback Messages */}
        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-950/50 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Username {mode === 'login' && 'o Email'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                <UserIcon className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="es. Tryy_Nexus"
                autoCapitalize="none"
                autoCorrect="off"
                required
                className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition"
              />
            </div>
          </div>

          {mode === 'register' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nome Visualizzato (opzionale)
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Il tuo nome o nickname"
                  className="w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Email (consigliata per il recupero password)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="tua@email.com"
                    autoCapitalize="none"
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition"
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'forgot_password' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Email Associata all'Account
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="La tua email di registrazione"
                  autoCapitalize="none"
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition"
                />
              </div>
            </div>
          )}

          {mode !== 'forgot_password' ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Password
                </label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot_password');
                      setError(null);
                      setSuccessMessage(null);
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                  >
                    Password dimenticata?
                  </button>
                )}
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition"
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nuova Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Minimo 4 caratteri"
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Conferma Nuova Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="Ripeti la nuova password"
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 transition"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-bold text-sm shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-60 mt-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : mode === 'register' ? (
              <>
                <UserPlus className="w-4 h-4" />
                <span>Crea Account</span>
              </>
            ) : mode === 'forgot_password' ? (
              <>
                <KeyRound className="w-4 h-4" />
                <span>Reimposta Password</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Accedi a Comics Count</span>
              </>
            )}
          </button>
        </form>

        {/* Toggle Mode Navigation */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
          {mode === 'forgot_password' ? (
            <button
              type="button"
              onClick={() => {
                setMode('login');
                setError(null);
                setSuccessMessage(null);
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold flex items-center justify-center gap-1.5 mx-auto transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Torna alla schermata di Accesso</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError(null);
                setSuccessMessage(null);
              }}
              className="text-xs text-slate-400 hover:text-indigo-400 transition cursor-pointer"
            >
              {mode === 'register' ? (
                <>Hai già un account? <strong className="text-white">Accedi qui</strong></>
              ) : (
                <>Nuovo utente? <strong className="text-white">Registrati gratis</strong></>
              )}
            </button>
          )}
        </div>

        {/* Privacy Note */}
        <div className="mt-4 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 text-[11px] text-slate-400 text-center flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span>Database privato isolato con crittografia delle credenziali.</span>
        </div>
      </div>
    </div>
  );
}
