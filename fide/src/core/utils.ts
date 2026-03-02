// ─── Yükleme Ekranı ───────────────────────────────────────────────────────────
// Tüm stil değişimleri CSS sınıfları üzerinden yapılır; inline style kullanılmaz.

const getOverlay = (): HTMLElement | null => document.getElementById('loading-overlay');

/**
 * Standart yükleme ekranını gösterir.
 */
export function showLoadingOverlay(message: string): void {
  const overlay = getOverlay();
  if (!overlay) return;

  // Lockout CSS sınıfını kaldır, standart görünüme dön
  overlay.classList.remove('loading-overlay--lockout');
  overlay.classList.add('loading-overlay--loading');

  const p = overlay.querySelector<HTMLElement>('p');
  if (p) p.textContent = message;

  overlay.removeAttribute('hidden');
}

/**
 * Yükleme ekranını gizler.
 */
export function hideLoadingOverlay(): void {
  const overlay = getOverlay();
  if (!overlay) return;
  overlay.classList.remove('loading-overlay--loading', 'loading-overlay--lockout');
  overlay.setAttribute('hidden', '');
}

/**
 * Erişim engeli ekranını gösterir (BAN / cihaz kilidi).
 */
export function showLockoutOverlay(message: string): void {
  const overlay = getOverlay();
  if (!overlay) return;

  overlay.classList.remove('loading-overlay--loading');
  overlay.classList.add('loading-overlay--lockout');

  const p = overlay.querySelector<HTMLElement>('p');
  if (p) p.textContent = message;

  overlay.removeAttribute('hidden');
}

// ─── DOM Yardımcıları ─────────────────────────────────────────────────────────

/**
 * Bir elementi DOM'dan güvenli şekilde sorgular.
 * Bulunamazsa hata fırlatır.
 */
export function requireElement<T extends HTMLElement>(
  selector: string,
  context: Document | HTMLElement = document,
): T {
  const el = context.querySelector<T>(selector);
  if (!el) throw new Error(`Element bulunamadı: "${selector}"`);
  return el;
}

/**
 * Kullanıcı girdisini XSS saldırılarına karşı temizler.
 * innerHTML yerine textContent ve DOMParser kullanılır.
 */
export function sanitizeText(input: string): string {
  const div = document.createElement('div');
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Sayı formatını standartlaştırır: "95,5" → 95.5
 */
export function parseScore(val: unknown): number {
  if (val === undefined || val === null || val === '') return NaN;
  const cleaned = String(val).replace(/\./g, '').replace(',', '.');
  return parseFloat(cleaned);
}

/**
 * Deterministik karıştırma (seeded shuffle).
 * Aynı seed ile her zaman aynı sırayı üretir.
 */
export function seededShuffle<T>(array: T[], seed: number): T[] {
  const result = [...array];
  let s = seed;
  const rnd = (): number => {
    const x = Math.sin(s++) * 10000;
    return x - Math.floor(x);
  };
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

/**
 * Bir ayın iş günlerini (Pzt–Cum) döndürür.
 */
export function getWorkDaysOfMonth(year: number, month: number): number[] {
  const days: number[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    const day = date.getDay();
    if (day !== 0 && day !== 6) days.push(date.getDate());
    date.setDate(date.getDate() + 1);
  }
  return days;
}

/**
 * Debounce — art arda çağrılarda yalnızca son çağrıyı çalıştırır.
 */
export function debounce<T extends unknown[]>(
  fn: (...args: T) => void,
  delay: number,
): (...args: T) => void {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: T): void => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Tarih nesnesini "YYYY-MM-DD HH:MM:SS" formatına çevirir (PocketBase filtresi için).
 */
export function toDbDateString(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Yıl-ay anahtarı üretir: "2026-2" gibi.
 */
export function getYearMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}
