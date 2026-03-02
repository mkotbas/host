// ─── Tip Tanımları ────────────────────────────────────────────────────────────

export interface DideEntry {
  'Bayi Kodu': string;
  'Bayi': string;
  'Bayi Yönetmeni': string;
  scores: Record<number, number | string>;
}

export interface FideEntry {
  'Bayi Kodu': string;
  scores: Record<number, number | string>;
}

export interface Store {
  id: string;
  bayiKodu: string;
  bayiAdi: string;
  bolge: string;
  yonetmen: string;
  sehir: string;
  ilce: string;
  email?: string;
  sorumlu_kullanici?: string;
}

export interface FideQuestion {
  id: number;
  type: 'standard' | 'pop_system' | 'product_order' | 'text_input';
  title: string;
  popCodes?: string[];
  expiredCodes?: string[];
}

export interface ExcelMapping {
  headerRowIndex: number;
  bayiKoduIndex: number;
  bayiAdiIndex: number;
  yonetmenIndex: number;
  signature: string;
}

// ─── Uygulama State'i ─────────────────────────────────────────────────────────
// Tüm değişkenler burada merkezi olarak yönetilir.
// Setter fonksiyonları dışında doğrudan değiştirilemez (readonly dışa aktarım).

let _dideData: DideEntry[] = [];
let _fideData: FideEntry[] = [];
let _allStores: Store[] = [];
let _fideQuestions: FideQuestion[] = [];
let _productList: string[] = [];
let _popCodes: string[] = [];
let _expiredCodes: string[] = [];
let _storeEmails: Record<string, string> = {};
let _auditedThisMonth: string[] = [];
let _selectedStore: Store | null = null;
let _currentReportId: string | null = null;
let _isPocketBaseConnected = false;

// ─── Okuma Erişimleri (Getter'lar) ───────────────────────────────────────────

export const getDideData = (): DideEntry[] => _dideData;
export const getFideData = (): FideEntry[] => _fideData;
export const getAllStores = (): Store[] => _allStores;
export const getFideQuestions = (): FideQuestion[] => _fideQuestions;
export const getProductList = (): string[] => _productList;
export const getPopCodes = (): string[] => _popCodes;
export const getExpiredCodes = (): string[] => _expiredCodes;
export const getStoreEmails = (): Record<string, string> => _storeEmails;
export const getAuditedThisMonth = (): string[] => _auditedThisMonth;
export const getSelectedStore = (): Store | null => _selectedStore;
export const getCurrentReportId = (): string | null => _currentReportId;
export const getIsPocketBaseConnected = (): boolean => _isPocketBaseConnected;

// ─── Yazma Erişimleri (Setter'lar) ───────────────────────────────────────────

export const setDideData = (data: DideEntry[]): void => { _dideData = data; };
export const setFideData = (data: FideEntry[]): void => { _fideData = data; };
export const setAllStores = (data: Store[]): void => { _allStores = data; };
export const setFideQuestions = (data: FideQuestion[]): void => { _fideQuestions = data; };
export const setProductList = (data: string[]): void => { _productList = data; };
export const setPopCodes = (data: string[]): void => { _popCodes = data; };
export const setExpiredCodes = (data: string[]): void => { _expiredCodes = data; };
export const setStoreEmails = (data: Record<string, string>): void => { _storeEmails = data; };
export const setAuditedThisMonth = (data: string[]): void => { _auditedThisMonth = data; };
export const setSelectedStore = (data: Store | null): void => { _selectedStore = data; };
export const setCurrentReportId = (data: string | null): void => { _currentReportId = data; };
export const setIsPocketBaseConnected = (data: boolean): void => { _isPocketBaseConnected = data; };

// ─── Sabitler ─────────────────────────────────────────────────────────────────

export const MONTH_NAMES: readonly string[] = [
  '', 'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];

export const FALLBACK_FIDE_QUESTIONS: FideQuestion[] = [
  { id: 0, type: 'standard', title: 'HATA: Sorular buluttan yüklenemedi.' },
];
