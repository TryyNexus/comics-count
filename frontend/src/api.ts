import {
  Comic,
  Publisher,
  SaleRefund,
  Order,
  Reading,
  PurchasedComic,
  MonthlySummary,
  PublisherBreakdownItem,
  MonthlyTrendItem,
  YearlyComparisonItem,
  MetadataSearchResult,
  User,
  AuthResponse
} from './types';

const API_BASE = '/api';

const TOKEN_KEY = 'comics_count_token';
const USER_KEY = 'comics_count_user';

export const authStorage = {
  getToken: (): string | null => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  removeToken: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  getUser: (): User | null => {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },
  setUser: (user: User) => localStorage.setItem(USER_KEY, JSON.stringify(user))
};

function authHeaders(isJson = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (isJson) headers['Content-Type'] = 'application/json';
  const token = authStorage.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // Authentication
  login: async (username: string, password: string): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Credenziali non valide');
    }
    const data: AuthResponse = await res.json();
    authStorage.setToken(data.token);
    authStorage.setUser(data.user);
    return data;
  },

  register: async (username: string, password: string, email?: string, displayName?: string): Promise<AuthResponse> => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email, displayName })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Errore nella registrazione');
    }
    const data: AuthResponse = await res.json();
    authStorage.setToken(data.token);
    authStorage.setUser(data.user);
    return data;
  },

  getMe: async (): Promise<User | null> => {
    const token = authStorage.getToken();
    if (!token) return null;
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: authHeaders()
      });
      if (!res.ok) {
        authStorage.removeToken();
        return null;
      }
      const data = await res.json();
      authStorage.setUser(data.user);
      return data.user;
    } catch {
      return null;
    }
  },

  logout: () => {
    authStorage.removeToken();
  },

  // Comics
  getComics: async (params?: {
    year?: string;
    month?: string;
    publisherId?: string;
    status?: string;
    channel?: string;
    search?: string;
  }): Promise<Comic[]> => {
    const q = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, val]) => {
        if (val !== undefined && val !== null && val !== '') {
          q.append(key, val);
        }
      });
    }
    const res = await fetch(`${API_BASE}/comics?${q.toString()}`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nel caricamento dei fumetti');
    return res.json();
  },

  getPurchasedComics: async (params?: { category?: string; search?: string }): Promise<PurchasedComic[]> => {
    const q = new URLSearchParams();
    if (params?.category) q.append('category', params.category);
    if (params?.search) q.append('search', params.search);
    const res = await fetch(`${API_BASE}/comics/purchased?${q.toString()}`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nel caricamento dei fumetti acquistati');
    return res.json();
  },

  createComic: async (comic: Partial<Comic>): Promise<Comic> => {
    const res = await fetch(`${API_BASE}/comics`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(comic)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Errore nella creazione del fumetto');
    }
    return res.json();
  },

  updateComic: async (id: number, comic: Partial<Comic>): Promise<Comic> => {
    const res = await fetch(`${API_BASE}/comics/${id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(comic)
    });
    if (!res.ok) throw new Error('Errore nell\'aggiornamento del fumetto');
    return res.json();
  },

  updateComicStatus: async (id: number, status: string): Promise<void> => {
    const res = await fetch(`${API_BASE}/comics/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Errore nell\'aggiornamento dello stato');
  },

  deleteComic: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/comics/${id}`, { 
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nella cancellazione del fumetto');
  },

  // Publishers
  getPublishers: async (): Promise<Publisher[]> => {
    const res = await fetch(`${API_BASE}/publishers`);
    if (!res.ok) throw new Error('Errore nel caricamento degli editori');
    return res.json();
  },

  createPublisher: async (publisher: Partial<Publisher>): Promise<Publisher> => {
    const res = await fetch(`${API_BASE}/publishers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(publisher)
    });
    if (!res.ok) throw new Error('Errore nella creazione dell\'editore');
    return res.json();
  },

  // Statistics
  getSummary: async (year: string, month: string): Promise<MonthlySummary> => {
    const res = await fetch(`${API_BASE}/stats/summary?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nel caricamento del riepilogo');
    return res.json();
  },

  getPublisherBreakdown: async (year: string, month?: string): Promise<{ rows: PublisherBreakdownItem[]; grandTotal: number }> => {
    let url = `${API_BASE}/stats/publishers?year=${encodeURIComponent(year)}`;
    if (month && month !== 'all') url += `&month=${encodeURIComponent(month)}`;
    const res = await fetch(url, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nel caricamento del breakdown editori');
    return res.json();
  },

  getMonthlyTrends: async (year: string): Promise<MonthlyTrendItem[]> => {
    const res = await fetch(`${API_BASE}/stats/monthly-trends?year=${encodeURIComponent(year)}`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nel caricamento dei trend mensili');
    return res.json();
  },

  getYearlyComparison: async (): Promise<YearlyComparisonItem[]> => {
    const res = await fetch(`${API_BASE}/stats/yearly-comparison`, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nel caricamento del confronto annuale');
    return res.json();
  },

  // Budgets
  setBudget: async (year: string, month: string, budget_amount: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/budgets`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ year, month, budget_amount })
    });
    if (!res.ok) throw new Error('Errore nel salvataggio del budget');
  },

  // Sales / Refunds
  getSales: async (year?: string, month?: string): Promise<SaleRefund[]> => {
    let url = `${API_BASE}/sales?`;
    if (year) url += `year=${encodeURIComponent(year)}&`;
    if (month) url += `month=${encodeURIComponent(month)}&`;
    const res = await fetch(url, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nel caricamento delle vendite/rimborsi');
    return res.json();
  },

  createSale: async (sale: Partial<SaleRefund>): Promise<SaleRefund> => {
    const res = await fetch(`${API_BASE}/sales`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(sale)
    });
    if (!res.ok) throw new Error('Errore nella registrazione della vendita/rimborso');
    return res.json();
  },

  deleteSale: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/sales/${id}`, { 
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nella cancellazione');
  },

  // Orders
  getOrders: async (year?: string): Promise<Order[]> => {
    let url = `${API_BASE}/orders`;
    if (year && year !== 'all') {
      url += `?year=${encodeURIComponent(year)}`;
    }
    const res = await fetch(url, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nel caricamento degli ordini');
    return res.json();
  },

  createOrder: async (order: Partial<Order>): Promise<Order> => {
    const res = await fetch(`${API_BASE}/orders`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(order)
    });
    if (!res.ok) throw new Error('Errore nella registrazione dell\'ordine');
    return res.json();
  },

  deleteOrder: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/orders/${id}`, { 
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nella cancellazione');
  },

  // Readings
  getReadings: async (year?: string, month?: string): Promise<Reading[]> => {
    let url = `${API_BASE}/readings?`;
    if (year) url += `year=${encodeURIComponent(year)}&`;
    if (month) url += `month=${encodeURIComponent(month)}&`;
    const res = await fetch(url, {
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nel caricamento delle letture');
    return res.json();
  },

  createReading: async (reading: Partial<Reading>): Promise<Reading> => {
    const res = await fetch(`${API_BASE}/readings`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(reading)
    });
    if (!res.ok) throw new Error('Errore nella registrazione della lettura');
    return res.json();
  },

  deleteReading: async (id: number): Promise<void> => {
    const res = await fetch(`${API_BASE}/readings/${id}`, { 
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Errore nella cancellazione');
  },

  // Metadata Search & Cover Caching
  searchMetadata: async (title: string, issue?: string, publisher?: string): Promise<MetadataSearchResult[]> => {
    const q = new URLSearchParams({ title });
    if (issue) q.append('issue', issue);
    if (publisher) q.append('publisher', publisher);
    const res = await fetch(`${API_BASE}/metadata/search?${q.toString()}`);
    if (!res.ok) throw new Error('Errore nella ricerca dei metadati');
    return res.json();
  },

  cacheCover: async (imageUrl: string, comicId?: number): Promise<{ localPath: string; coverUrl: string }> => {
    const res = await fetch(`${API_BASE}/metadata/save-cover`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ imageUrl, comicId })
    });
    if (!res.ok) throw new Error('Errore nel download della copertina');
    return res.json();
  },

  uploadCover: async (file: File): Promise<{ localPath: string }> => {
    const formData = new FormData();
    formData.append('cover', file);
    const headers = authHeaders(false);
    const res = await fetch(`${API_BASE}/upload/cover`, {
      method: 'POST',
      headers,
      body: formData
    });
    if (!res.ok) throw new Error('Errore nell\'upload dell\'immagine');
    return res.json();
  },

  // Import / Export
  checkOneDriveStatus: async (): Promise<{ found: boolean; path: string | null; size?: number; lastModified?: string }> => {
    const res = await fetch(`${API_BASE}/import/onedrive-status`);
    if (!res.ok) throw new Error('Errore nella verifica di OneDrive');
    return res.json();
  },

  importFromOneDrive: async (): Promise<any> => {
    const res = await fetch(`${API_BASE}/import/onedrive`, { 
      method: 'POST',
      headers: authHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Errore durante l\'importazione da OneDrive');
    }
    return res.json();
  },

  importUploadedFile: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('excelFile', file);
    const headers = authHeaders(false);
    const res = await fetch(`${API_BASE}/import/upload`, {
      method: 'POST',
      headers,
      body: formData
    });
    if (!res.ok) throw new Error('Errore durante l\'importazione del file');
    return res.json();
  },

  exportExcelUrl: (): string => {
    const token = authStorage.getToken();
    return `${API_BASE}/export/excel?token=${encodeURIComponent(token || '')}`;
  },

  exportJsonUrl: (): string => {
    const token = authStorage.getToken();
    return `${API_BASE}/export/json?token=${encodeURIComponent(token || '')}`;
  },

  // Network Info for Mobile (Local Wi-Fi + Global Remote Tunnel)
  getNetworkInfo: async (): Promise<{
    localIp: string;
    port: number;
    localUrl: string;
    publicUrl: string | null;
    tunnelStatus?: { active: boolean; url: string | null; binaryAvailable: boolean; isStarting: boolean };
  }> => {
    const res = await fetch(`${API_BASE}/network-info`);
    if (!res.ok) throw new Error('Errore nel recupero delle info di rete');
    return res.json();
  },

  startTunnel: async (): Promise<{ success: boolean; url: string | null }> => {
    const res = await fetch(`${API_BASE}/tunnel/start`, { method: 'POST' });
    if (!res.ok) throw new Error('Errore durante l\'avvio del tunnel');
    return res.json();
  }
};
