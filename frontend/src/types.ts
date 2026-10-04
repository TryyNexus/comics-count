export type ComicStatus = 
  | 'In uscita'
  | 'Preordinato'
  | 'Acquistato'
  | 'Da leggere'
  | 'In lettura'
  | 'Letto'
  | 'Venduto';

export type PurchaseChannel = 
  | 'Fumetteria'
  | 'Edicola'
  | 'HVC / Preordine'
  | 'Vinted / Usato'
  | 'Ordine Online'
  | 'Fiera / Evento'
  | 'Altro';

export interface Publisher {
  id: number;
  name: string;
  color: string;
  description?: string;
  comics_count?: number;
}

export interface Comic {
  id: number;
  title: string;
  series?: string;
  issue_number?: string;
  variant_info?: string;
  publisher_id?: number;
  publisher_name?: string;
  publisher_color?: string;
  year: string;
  month: string;
  release_date?: string;
  purchase_date?: string;
  cover_price: number;
  purchase_price: number;
  isbn?: string;
  ean?: string;
  upc?: string;
  cover_url?: string;
  local_cover_path?: string;
  status: ComicStatus;
  channel: PurchaseChannel;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SaleRefund {
  id: number;
  year: string;
  month?: string;
  title: string;
  price: number;
  channel: string;
  notes?: string;
  date?: string;
  created_at?: string;
}

export interface Order {
  id: number;
  store_name: string;
  title: string;
  items_count: number;
  total_price: number;
  original_price?: number;
  month?: string;
  year: string;
  date?: string;
  status: string;
  notes?: string;
}

export interface PurchasedComic {
  id: number;
  title: string;
  series?: string;
  issue_number?: string;
  variant_info?: string;
  publisher_id?: number;
  publisher_name?: string;
  publisher_color?: string;
  category: 'DC' | 'Marvel' | 'Manga' | 'Altro';
  year: string;
  month: string;
  cover_url?: string;
  local_cover_path?: string;
  status: ComicStatus;
  channel: PurchaseChannel;
  purchase_price: number;
}

export interface Reading {
  id: number;
  comic_id?: number;
  title: string;
  year: string;
  month: string;
  category?: string;
  rating?: number;
  read_date?: string;
  notes?: string;
  cover_url?: string;
  local_cover_path?: string;
  issue_number?: string;
  variant_info?: string;
  purchase_year?: string;
  purchase_month?: string;
  publisher_name?: string;
  publisher_color?: string;
}

export interface MonthlySummary {
  year: string;
  month: string;
  monthlySpent: number;
  monthlySales: number;
  monthlyNet: number;
  monthlyCount: number;
  monthlyReadCount: number;
  annualSpent: number;
  annualSales: number;
  annualNet: number;
  annualCount: number;
  budget: number;
  budgetRemaining: number | null;
}

export interface PublisherBreakdownItem {
  name: string;
  color: string;
  total: number;
  count: number;
  percentage: number;
}

export interface MonthlyTrendItem {
  month: string;
  spent: number;
  sales: number;
  net: number;
  budget: number;
  count: number;
}

export interface YearlyComparisonItem {
  year: string;
  spent: number;
  sales: number;
  net: number;
  count: number;
}

export interface MetadataSearchResult {
  source: string;
  title: string;
  publisher?: string;
  author?: string;
  year?: string;
  isbn?: string;
  ean?: string;
  coverUrl?: string;
  thumbnailUrl?: string;
}
