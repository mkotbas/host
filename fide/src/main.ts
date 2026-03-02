import { pb } from './core/db-config';
import {
  loadInitialData,
  logoutUser,
  loginUser,
  subscribeToRealtimeChanges,
  clearExcelFromCloud,
} from './core/api';
import { handleFileSelect } from './core/excel';
import { filterAndDisplayStores } from './core/store';
import { buildForm, updateFormInteractivity, updateConnectionIndicator, startNewReport, generateEmail, returnToMainPage, loadReportUI } from './ui';
import {
  getDideData,
  getFideData,
  getSelectedStore,
  setIsPocketBaseConnected,
} from './core/state';
import { debounce } from './core/utils';

// ─── Uygulama Başlangıcı ──────────────────────────────────────────────────────

async function initializeApp(): Promise<void> {
  updateAuthUI();

  if (pb.authStore.isValid) {
    setIsPocketBaseConnected(true);
    updateConnectionIndicator();

    const dataLoaded = await loadInitialData();
    if (dataLoaded) {
      buildForm();
      toggleExcelButtons();
    }

    void subscribeToRealtimeChanges();
  } else {
    setIsPocketBaseConnected(false);
    updateConnectionIndicator();
    buildForm();
    updateFormInteractivity(false);
  }

  setupEventListeners();

  if (!getSelectedStore()) {
    updateFormInteractivity(false);
  }
}

// ─── Excel Butonları Görünürlüğü ──────────────────────────────────────────────

function toggleExcelButtons(): void {
  const storeArea = document.getElementById('store-selection-area');
  const clearDideBtn = document.getElementById('clear-excel-btn');
  const clearFideBtn = document.getElementById('clear-fide-excel-btn');

  if (getDideData().length > 0) {
    storeArea?.removeAttribute('hidden');
    clearDideBtn?.removeAttribute('hidden');
  }
  if (getFideData().length > 0) {
    clearFideBtn?.removeAttribute('hidden');
  }
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────

function updateAuthUI(): void {
  const loginToggleBtn = document.getElementById('login-toggle-btn');
  const logoutBtn = document.getElementById('logout-btn');
  if (!loginToggleBtn || !logoutBtn) return;

  if (pb.authStore.isValid) {
    loginToggleBtn.setAttribute('hidden', '');
    logoutBtn.removeAttribute('hidden');
  } else {
    loginToggleBtn.removeAttribute('hidden');
    logoutBtn.setAttribute('hidden', '');
  }
}

// ─── Event Listener Kurulumu ──────────────────────────────────────────────────
// Tüm onclick="..." kullanımları buraya taşındı.

function setupEventListeners(): void {
  // ── Giriş / Çıkış ──────────────────────────────────────────────────────────
  const loginToggleBtn = document.getElementById('login-toggle-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const loginPopup = document.getElementById('login-popup');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  const emailInput = document.getElementById('email-input') as HTMLInputElement | null;
  const passwordInput = document.getElementById('password-input') as HTMLInputElement | null;
  const errorDiv = document.getElementById('login-error');

  loginToggleBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    loginPopup?.toggleAttribute('hidden');
  });

  logoutBtn?.addEventListener('click', () => {
    logoutUser();
    window.location.reload();
  });

  loginSubmitBtn?.addEventListener('click', async () => {
    if (!errorDiv) return;
    errorDiv.textContent = '';

    const email = emailInput?.value ?? '';
    const password = passwordInput?.value ?? '';

    if (!email || !password) {
      errorDiv.textContent = 'Lütfen tüm alanları doldurun.';
      return;
    }

    const result = await loginUser(email, password);
    if (result.success) {
      window.location.reload();
    } else {
      errorDiv.textContent = result.message;
    }
  });

  // Enter tuşu ile giriş
  passwordInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginSubmitBtn?.click();
  });

  // Popup dışına tıklayınca kapat
  window.addEventListener('click', (e) => {
    if (
      loginPopup &&
      !loginPopup.hasAttribute('hidden') &&
      !loginPopup.contains(e.target as Node) &&
      e.target !== loginToggleBtn
    ) {
      loginPopup.setAttribute('hidden', '');
    }
  });

  // ── Excel ──────────────────────────────────────────────────────────────────
  document.getElementById('excel-file-input')?.addEventListener('change', async (e) => {
    const success = await handleFileSelect(e, 'dide');
    if (success) {
      document.getElementById('store-selection-area')?.removeAttribute('hidden');
      document.getElementById('clear-excel-btn')?.removeAttribute('hidden');
    }
  });

  document.getElementById('fide-excel-file-input')?.addEventListener('change', async (e) => {
    const success = await handleFileSelect(e, 'fide');
    if (success) {
      document.getElementById('clear-fide-excel-btn')?.removeAttribute('hidden');
    }
  });

  document.getElementById('clear-excel-btn')?.addEventListener('click', () => {
    if (confirm('Yüklenmiş DiDe Excel verisini buluttan silmek istediğinizden emin misiniz?')) {
      void clearExcelFromCloud('dide');
    }
  });

  document.getElementById('clear-fide-excel-btn')?.addEventListener('click', () => {
    if (confirm('Yüklenmiş FiDe Excel verisini buluttan silmek istediğinizden emin misiniz?')) {
      void clearExcelFromCloud('fide');
    }
  });

  // ── Bayi Arama ─────────────────────────────────────────────────────────────
  const searchInput = document.getElementById('store-search-input') as HTMLInputElement | null;
  const debouncedFilter = debounce((query: string) => filterAndDisplayStores(query), 200);

  searchInput?.addEventListener('input', (e) => {
    debouncedFilter((e.target as HTMLInputElement).value);
  });

  // Bayi seçildi — raporu yükle veya formu sıfırla
  window.addEventListener('storeSelected', (e) => {
    const { savedState } = (e as CustomEvent<{ savedState: Record<string, unknown> | null }>).detail;
    if (savedState) {
      loadReportUI(savedState as Parameters<typeof loadReportUI>[0]);
    } else {
      updateFormInteractivity(true);
    }
  });

  // Bayi temizlendi olayı
  window.addEventListener('storeClearred', () => {
    updateFormInteractivity(false);
  });

  // ── Diğer ──────────────────────────────────────────────────────────────────
  document.getElementById('new-report-btn')?.addEventListener('click', () => void startNewReport());

  document.getElementById('generate-email-btn')?.addEventListener('click', () => void generateEmail());

  document.getElementById('toggle-backup-manager-btn')?.addEventListener('click', () => {
    window.open('admin/admin.html', '_blank');
  });
}

// ─── Başlat ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => { void initializeApp(); });
