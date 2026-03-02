/* fide/src/modules/denetim-takip/denetim-takip.ts */
import type PocketBase from 'pocketbase';
import { getWorkDaysOfMonth, seededShuffle } from '../../core/utils';


// ─── DOM Helpers (no inline styles) ─────────────────────────────────────────
function setHidden(el: HTMLElement | null, hidden: boolean): void {
  if (!el) return;
  if (hidden) {
    el.setAttribute('hidden', '');
    // legacy fallback if some HTML still uses style display
    el.style.display = 'none';
  } else {
    el.removeAttribute('hidden');
    el.style.display = '';
  }
}

function showLoading(message?: string): void {
  const overlay = document.getElementById('loading-overlay') as HTMLElement | null;
  if (!overlay) return;
  if (message) {
    const p = overlay.querySelector('p');
    if (p) p.textContent = message;
  }
  setHidden(overlay, false);
}

function hideLoading(): void {
  const overlay = document.getElementById('loading-overlay') as HTMLElement | null;
  if (!overlay) return;
  setHidden(overlay, true);
}


// ─── Tip Tanımları ────────────────────────────────────────────────────────────

interface StoreRecord {
  id: string;
  bayiKodu: string;
  bayiAdi: string;
  bolge?: string;
  sehir?: string;
  ilce?: string;
  yonetmen?: string;
  sorumlu_kullanici?: string;
}

interface ReportRecord {
  id: string;
  user: string;
  bayi: string;
  denetimTamamlanmaTarihi: string;
  expand?: { bayi?: StoreRecord };
}

interface RevertRecord {
  id: string;
  yil_ay: string;
  bayi: string;
  expand?: { bayi?: StoreRecord };
}

interface UserRecord {
  id: string;
  name?: string;
  email: string;
  role?: string;
}

interface AuditedStore {
  code: string;
  timestamp: number;
}

// ─── Modül Durumu ─────────────────────────────────────────────────────────────

let pbInstance: PocketBase | null = null;
let currentUserRole: string | null = null;
let currentUserId: string | null = null;

let allStoresMaster: StoreRecord[] = [];
let allReportsMaster: ReportRecord[] = [];
let allGeriAlinanMaster: RevertRecord[] = [];
let allUsers: UserRecord[] = [];

let allStores: StoreRecord[] = [];
let auditedStoreCodesCurrentMonth: AuditedStore[] = [];
let auditedStoreCodesCurrentYear: string[] = [];
let leaveDataBulut: Record<string, boolean> = {};

let currentGlobalFilteredStores: StoreRecord[] = [];
let localCityFilterValue = 'Tümü';
let currentViewMode: 'monthly' | 'yearly' = 'monthly';

let globalAylikHedef = 0;
let globalMinDaily = 2;

// ─── Yardımcı: Bugün Gereken Ziyaret ─────────────────────────────────────────

function calculateTodayRequirement(): number {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const day = today.getDate();

  if (
    today.getDay() === 0 ||
    today.getDay() === 6 ||
    leaveDataBulut[`${year}-${month}-${day}`]
  ) return 0;

  const allWorkDays = getWorkDaysOfMonth(year, month);
  const activeWorkDays = allWorkDays.filter(d => !leaveDataBulut[`${year}-${month}-${d}`]);
  const base = globalAylikHedef || 47;
  const monthlyAdjusted = Math.round(base * (activeWorkDays.length / (allWorkDays.length || 1)));

  const totalCompleted = auditedStoreCodesCurrentMonth.length;
  const remainingTotal = Math.max(0, monthlyAdjusted - totalCompleted);
  const remainingDays = activeWorkDays.filter(d => d >= day);

  if (remainingDays.length === 0) return 0;

  const basePerDay = Math.floor(remainingTotal / remainingDays.length);
  const extras = remainingTotal % remainingDays.length;
  const shuffled = seededShuffle([...remainingDays], year + month);

  let targetForToday = 0;
  const idx = shuffled.indexOf(day);
  if (idx !== -1) targetForToday = basePerDay + (idx < extras ? 1 : 0);
  if (remainingTotal > 0) targetForToday = Math.max(globalMinDaily, targetForToday);

  const doneTodayCount = auditedStoreCodesCurrentMonth.filter(a => {
    const d = new Date(a.timestamp);
    return d.getDate() === day && d.getMonth() === month && d.getFullYear() === year;
  }).length;

  return Math.max(0, targetForToday - doneTodayCount);
}

function getRemainingWorkdays(): number {
  const today = new Date();
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  let rem = 0;
  for (let d = today.getDate(); d <= lastDay; d++) {
    const date = new Date(today.getFullYear(), today.getMonth(), d);
    if (
      [1, 2, 3, 4, 5].includes(date.getDay()) &&
      !leaveDataBulut[`${today.getFullYear()}-${today.getMonth()}-${d}`]
    ) rem++;
  }
  return rem;
}

// ─── Veri Yükleme ─────────────────────────────────────────────────────────────

async function loadSettings(): Promise<void> {
  try {
    const r = await pbInstance!.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
    globalAylikHedef = (r['deger'] as number) || 0;
  } catch { globalAylikHedef = 0; }

  try {
    const r = await pbInstance!.collection('ayarlar').getFirstListItem('anahtar="minZiyaret"');
    globalMinDaily = (r['deger'] as number) || 0;
  } catch { globalMinDaily = 2; }

  try {
    const r = await pbInstance!.collection('ayarlar').getFirstListItem(
      `anahtar="leaveData_${currentUserId}"`,
    );
    leaveDataBulut = (r['deger'] as Record<string, boolean>) || {};
  } catch { leaveDataBulut = {}; }
}



async function loadMasterData(): Promise<void> {
  try {
    allStoresMaster = await pbInstance!.collection('bayiler').getFullList({ sort: 'bayiAdi' }) as StoreRecord[];
    const firstDay = new Date(new Date().getFullYear(), 0, 1).toISOString();
    allReportsMaster = await pbInstance!.collection('denetim_raporlari').getFullList({
      filter: `denetimTamamlanmaTarihi != null && denetimTamamlanmaTarihi >= "${firstDay}"`,
      expand: 'bayi',
      sort: '-denetimTamamlanmaTarihi',
    }) as ReportRecord[];
    allGeriAlinanMaster = await pbInstance!.collection('denetim_geri_alinanlar').getFullList({
      filter: `yil_ay ~ "${new Date().getFullYear()}-"`,
      expand: 'bayi',
    }) as RevertRecord[];
  } catch { /* Hata sessizce göz ardı edilir */ }
}

async function populateUserFilterDropdown(): Promise<void> {
  try {
    allUsers = await pbInstance!.collection('users').getFullList({ sort: 'name' }) as UserRecord[];
    const sel = document.getElementById('admin-user-filter') as HTMLSelectElement | null;
    if (!sel) return;

    sel.innerHTML = '';
    const opts: Array<{ value: string; label: string }> = [
      { value: 'my_data', label: 'Benim Verilerim (Admin)' },
      { value: 'global', label: 'Genel Bakış' },
    ];
    allUsers.filter(u => u.id !== currentUserId).forEach(u => {
      opts.push({ value: u.id, label: u.name || u.email });
    });
    opts.forEach(({ value, label }) => {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = label;
      sel.appendChild(opt);
    });
  } catch { /* boş */ }
}

// ─── Veri Filtresi ────────────────────────────────────────────────────────────

function applyDataFilterAndRunDashboard(viewId: string): void {
  const today = new Date();
  const curMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

  if (currentUserRole !== 'admin' || viewId === 'global') {
    allStores = [...allStoresMaster];
  } else {
    const userId = viewId === 'my_data' ? currentUserId! : viewId;
    allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === userId);
  }

  const geriAlinanlar = new Set<string>();
  allGeriAlinanMaster.forEach(r => {
    if (r.expand?.bayi && r.yil_ay === curMonthKey) {
      geriAlinanlar.add(r.expand.bayi.bayiKodu);
    }
  });

  let filteredReports: ReportRecord[];
  if (currentUserRole !== 'admin' || viewId === 'global') {
    filteredReports = [...allReportsMaster];
  } else {
    const userId = viewId === 'my_data' ? currentUserId! : viewId;
    filteredReports = allReportsMaster.filter(r => r.user === userId);
  }

  const monthlyMap = new Map<string, AuditedStore>();
  const yearlyCodes = new Set<string>();

  filteredReports.forEach(r => {
    if (!r.expand?.bayi) return;
    const code = r.expand.bayi.bayiKodu;
    const d = new Date(r.denetimTamamlanmaTarihi);
    yearlyCodes.add(code);
    if (
      d.getMonth() === today.getMonth() &&
      d.getFullYear() === today.getFullYear() &&
      !geriAlinanlar.has(code)
    ) {
      if (!monthlyMap.has(code)) {
        monthlyMap.set(code, { code, timestamp: d.getTime() });
      }
    }
  });

  auditedStoreCodesCurrentMonth = Array.from(monthlyMap.values());
  auditedStoreCodesCurrentYear = Array.from(yearlyCodes);
  runDashboard();
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function runDashboard(): void {
  calculateAndDisplayDashboard();
  updateAllFilterOptions();
  applyAndRepopulateFilters();
}

function calculateAndDisplayDashboard(): void {
  const today = new Date();
  const allWorkDays = getWorkDaysOfMonth(today.getFullYear(), today.getMonth());
  const activeWorkDays = allWorkDays.filter(
    d => !leaveDataBulut[`${today.getFullYear()}-${today.getMonth()}-${d}`],
  );
  const base = globalAylikHedef || 47;
  const adjustedTarget = Math.round(base * (activeWorkDays.length / (allWorkDays.length || 1)));
  const target = currentViewMode === 'monthly' ? adjustedTarget : allStores.length;
  const audited = currentViewMode === 'monthly'
    ? auditedStoreCodesCurrentMonth.length
    : auditedStoreCodesCurrentYear.length;

  const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  const setEl = (id: string, val: string | number): void => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  };

  const title = document.getElementById('dashboard-title');
  if (title) {
    title.innerHTML = `<i class="fas fa-calendar-day" aria-hidden="true"></i> ${today.getFullYear()} ${MONTH_NAMES[today.getMonth()]} Performansı`;
  }

  setEl('total-stores-count', target);
  setEl('audited-stores-count', audited);
  setEl('remaining-stores-count', Math.max(0, target - audited));
  setEl('work-days-count', getRemainingWorkdays());

  const workDaysCard = document.getElementById('work-days-card');
  const todayCard = document.getElementById('today-required-card');

  if (currentViewMode === 'monthly') {
    workDaysCard?.removeAttribute('hidden');
    todayCard?.removeAttribute('hidden');
    setEl('today-required-count', calculateTodayRequirement());
  } else {
    workDaysCard?.setAttribute('hidden', '');
    todayCard?.setAttribute('hidden', '');
  }

  renderAuditedStores();
  renderRemainingStores(currentGlobalFilteredStores);

  document.getElementById('dashboard-content')?.removeAttribute('hidden');
}

// ─── Filtreler ────────────────────────────────────────────────────────────────

function updateAllFilterOptions(): void {
  const filters: Record<string, string> = {
    'bolge-filter': 'bolge',
    'yonetmen-filter': 'yonetmen',
    'sehir-filter': 'sehir',
    'ilce-filter': 'ilce',
  };

  Object.keys(filters).forEach(id => {
    const sel = document.getElementById(id) as HTMLSelectElement | null;
    if (!sel) return;
    const prev = sel.value;
    const filterKey = filters[id]!;

    const available = allStores.filter(s =>
      Object.keys(filters).every(fId => {
        const fEl = document.getElementById(fId) as HTMLSelectElement | null;
        const fVal = fEl?.value ?? 'Tümü';
        return fId === id || fVal === 'Tümü' || s[filterKey as keyof StoreRecord] === fVal;
      }),
    );

    const vals = [...new Set(available.map(s => s[filterKey as keyof StoreRecord] as string))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'tr'));

    sel.innerHTML = '<option value="Tümü">Tümü</option>';
    vals.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      sel.appendChild(opt);
    });
    sel.value = vals.includes(prev) ? prev : 'Tümü';
  });
}

function applyAndRepopulateFilters(): void {
  const get = (id: string): string =>
    (document.getElementById(id) as HTMLSelectElement | null)?.value ?? 'Tümü';

  currentGlobalFilteredStores = allStores.filter(st =>
    (get('bolge-filter') === 'Tümü' || st.bolge === get('bolge-filter')) &&
    (get('yonetmen-filter') === 'Tümü' || st.yonetmen === get('yonetmen-filter')) &&
    (get('sehir-filter') === 'Tümü' || st.sehir === get('sehir-filter')) &&
    (get('ilce-filter') === 'Tümü' || st.ilce === get('ilce-filter')),
  );

  updateAllFilterOptions();
  renderRemainingStores(currentGlobalFilteredStores);
}

// ─── Liste Render ─────────────────────────────────────────────────────────────

function renderRemainingStores(filtered: StoreRecord[]): void {
  const cont = document.getElementById('denetlenecek-bayiler-container');
  if (!cont) return;

  const audited = currentViewMode === 'monthly'
    ? auditedStoreCodesCurrentMonth.map(a => a.code)
    : auditedStoreCodesCurrentYear;

  const rem = filtered.filter(s => !audited.includes(s.bayiKodu));

  cont.innerHTML = '';

  if (!rem.length) {
    const msg = document.createElement('p');
    msg.className = 'empty-list-message';
    msg.textContent = 'Kayıt yok.';
    cont.appendChild(msg);
    return;
  }

  // Şehir filtresi dropdown'ını güncelle
  const cities = [...new Set(rem.map(s => s.sehir ?? ''))].filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'tr'));
  const lSel = document.getElementById('local-city-filter') as HTMLSelectElement | null;
  if (lSel) {
    lSel.innerHTML = '<option value="Tümü">Tüm Şehirler</option>';
    cities.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      lSel.appendChild(opt);
    });
    lSel.value = cities.includes(localCityFilterValue) ? localCityFilterValue : 'Tümü';
  }

  const show = localCityFilterValue === 'Tümü' ? rem : rem.filter(s => s.sehir === localCityFilterValue);

  // Bölgeye göre grupla
  const byReg = show.reduce<Record<string, StoreRecord[]>>((acc, s) => {
    const r = s.bolge ?? 'Bölgesiz';
    (acc[r] ??= []).push(s);
    return acc;
  }, {});

  Object.keys(byReg).sort().forEach(r => {
    const total = allStores.filter(s => (s.bolge ?? 'Bölgesiz') === r).length;
    const done = allStores.filter(s => (s.bolge ?? 'Bölgesiz') === r && audited.includes(s.bayiKodu)).length;
    const prog = total > 0 ? Math.round(done / total * 100) : 0;

    const regionEl = document.createElement('div');
    regionEl.className = 'region-container';

    const header = document.createElement('div');
    header.className = 'region-header';
    const headerSpan = document.createElement('span');
    headerSpan.textContent = `${r} (${done}/${total})`;
    header.appendChild(headerSpan);

    const progBar = document.createElement('div');
    progBar.className = 'progress-bar';
    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    fill.style.setProperty('--progress', `${prog}%`);
    fill.textContent = `${prog}%`;
    progBar.appendChild(fill);

    const ul = document.createElement('ul');
    ul.className = 'store-list';
    byReg[r]!.forEach(s => {
      const li = document.createElement('li');
      li.className = 'store-list-item';
      const truncated = s.bayiAdi.length > 35 ? `${s.bayiAdi.substring(0, 35)}...` : s.bayiAdi;
      li.textContent = `${truncated} (${s.bayiKodu}) - ${s.sehir ?? ''}/${s.ilce ?? ''}`;
      ul.appendChild(li);
    });

    regionEl.appendChild(header);
    regionEl.appendChild(progBar);
    regionEl.appendChild(ul);
    cont.appendChild(regionEl);
  });
}

function renderAuditedStores(): void {
  const cont = document.getElementById('denetlenen-bayiler-container');
  if (!cont) return;

  const data = currentViewMode === 'monthly'
    ? auditedStoreCodesCurrentMonth
    : auditedStoreCodesCurrentYear.map(code => ({ code, timestamp: 0 }));

  if (!data.length) {
    cont.innerHTML = '';
    const msg = document.createElement('p');
    msg.className = 'empty-list-message';
    msg.textContent = 'Kayıt yok.';
    cont.appendChild(msg);
    return;
  }

  const details = data
    .map(a => ({
      ...(allStoresMaster.find(s => s.bayiKodu === a.code) ?? { bayiAdi: 'Bilinmeyen', bayiKodu: a.code } as StoreRecord),
      timestamp: a.timestamp,
    }))
    .sort((a, b) => b.timestamp - a.timestamp);

  const ul = document.createElement('ul');
  ul.className = 'store-list';

  details.forEach(s => {
    const li = document.createElement('li');
    li.className = 'store-list-item completed-item';

    const truncated = s.bayiAdi.length > 35 ? `${s.bayiAdi.substring(0, 35)}...` : s.bayiAdi;
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${truncated} (${s.bayiKodu})`;
    li.appendChild(nameSpan);

    if (currentUserRole === 'admin' && currentViewMode === 'monthly') {
      const undoBtn = document.createElement('button');
      undoBtn.className = 'btn btn-warning btn-sm btn-revert-audit';
      undoBtn.innerHTML = '<i class="fas fa-undo" aria-hidden="true"></i> Geri Al';
      undoBtn.addEventListener('click', () => { void revertAudit(s.bayiKodu); });
      li.appendChild(undoBtn);
    }

    ul.appendChild(li);
  });

  cont.innerHTML = '';
  cont.appendChild(ul);
}

// ─── Denetim Geri Alma ────────────────────────────────────────────────────────

async function revertAudit(code: string): Promise<void> {
  const store = allStoresMaster.find(x => x.bayiKodu === code);
  if (!store) return;
  if (!confirm('Denetim kaydını geri almak istiyor musunuz?')) return;

  try {
    await pbInstance!.collection('denetim_geri_alinanlar').create({
      yil_ay: `${new Date().getFullYear()}-${new Date().getMonth()}`,
      bayi: store.id,
    });
    await loadMasterData();
    const viewId = (document.getElementById('admin-user-filter') as HTMLSelectElement | null)?.value ?? 'my_data';
    applyDataFilterAndRunDashboard(viewId);
  } catch { /* hata sessiz */ }
}

// ─── Event Listener'lar ───────────────────────────────────────────────────────

function setupModuleEventListeners(role: string): void {
  // Takvimden izin verisi güncellenince
  window.addEventListener('calendarDataChanged', async (e) => {
    await loadSettings();
    leaveDataBulut = (e as CustomEvent<Record<string, boolean>>).detail;
    calculateAndDisplayDashboard();
  });

  // Rapor tamamlanınca verileri yenile
  window.addEventListener('reportFinalized', async () => {
    await loadMasterData();
    const viewId = (document.getElementById('admin-user-filter') as HTMLSelectElement | null)?.value ?? 'my_data';
    applyDataFilterAndRunDashboard(viewId);
  });

  // Admin kullanıcı filtresi
  if (role === 'admin') {
    document.getElementById('admin-user-filter')?.addEventListener('change', (e) => {
      applyDataFilterAndRunDashboard((e.target as HTMLSelectElement).value);
    });
  }

  // Görünüm modu butonu (Aylık / Yıllık)
  document.querySelectorAll<HTMLButtonElement>('#view-mode-toggle button').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll<HTMLButtonElement>('#view-mode-toggle button').forEach(b => {
        b.classList.remove('active', 'btn-primary');
        b.classList.add('btn-light');
      });
      btn.classList.remove('btn-light');
      btn.classList.add('active', 'btn-primary');
      currentViewMode = (btn.dataset['mode'] as 'monthly' | 'yearly') ?? 'monthly';
      calculateAndDisplayDashboard();
    });
  });

  // Genel filtreler
  ['bolge-filter', 'yonetmen-filter', 'sehir-filter', 'ilce-filter'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', applyAndRepopulateFilters);
  });

  // Şehir filtresi
  document.getElementById('local-city-filter')?.addEventListener('change', (e) => {
    localCityFilterValue = (e.target as HTMLSelectElement).value;
    renderRemainingStores(currentGlobalFilteredStores);
  });


}

// ─── Modül Init (Export) ──────────────────────────────────────────────────────

export async function initializeDenetimTakipModule(pb: PocketBase): Promise<void> {
  pbInstance = pb;
  if (!pbInstance.authStore.isValid) return;

  currentUserRole = (pbInstance.authStore.model?.['role'] as string) ?? null;
  currentUserId = (pbInstance.authStore.model?.['id'] as string) ?? null;
  // Güvenlik: yükleme ekranı yanlışlıkla açık kalmasın
  hideLoading();
showLoading('Veriler işleniyor, lütfen bekleyin...');
  try {
    setupModuleEventListeners(currentUserRole ?? '');
    await loadSettings();
    await loadMasterData();

    if (currentUserRole === 'admin') {
      document.getElementById('admin-user-selector-container')?.removeAttribute('hidden');
      await populateUserFilterDropdown();
    } else {
      document.getElementById('admin-user-selector-container')?.setAttribute('hidden', '');
    }

    applyDataFilterAndRunDashboard('my_data');

    // Dashboard'u göster
    setHidden(document.getElementById('dashboard-content') as HTMLElement | null, false);
  } catch (e: any) {
    console.error('Denetim Takip init hatası:', e);
    alert('Denetim Takip verileri yüklenemedi. PocketBase bağlantısını kontrol edin.');
  } finally {
    hideLoading();
  }
}