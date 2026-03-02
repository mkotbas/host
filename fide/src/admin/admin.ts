import { pb } from '../core/db-config';

// ─── Modül Tanımları ──────────────────────────────────────────────────────────

interface ModuleItem {
  id: string;
  name: string;
  icon: string;
  path?: string;
  submenu?: ModuleItem[];
}

const MODULES: ModuleItem[] = [
  {
    id: 'denetim-takip',
    name: 'Denetim Takip',
    icon: 'fas fa-calendar-check',
    path: '../modules/denetim-takip/',
  },
  {
    id: 'calisma-takvimi',
    name: 'Çalışma Takvimi',
    icon: 'fas fa-calendar-alt',
    path: '../modules/calisma-takvimi/',
  },
  {
    id: 'fide-main-parent',
    name: 'FiDe Ana Sayfası',
    icon: 'fas fa-home',
    submenu: [
      {
        id: 'eposta-taslagi',
        name: 'E-posta Taslağı',
        icon: 'fas fa-envelope-open-text',
        path: '../modules/eposta-taslagi/',
      },
    ],
  },
  {
    id: 'bayi-yoneticisi',
    name: 'Bayi Yöneticisi',
    icon: 'fas fa-store',
    path: '../modules/bayi-yoneticisi/',
  },
  {
    id: 'soru-yoneticisi',
    name: 'Soru Yöneticisi',
    icon: 'fas fa-edit',
    path: '../modules/soru-yoneticisi/',
  },
  {
    id: 'veritabani-yonetim',
    name: 'Veritabanı Yönetimi',
    icon: 'fas fa-cogs',
    path: '../modules/veritabani-yonetim/',
  },
  {
    id: 'kullanici-yoneticisi',
    name: 'Kullanıcı Yönetimi',
    icon: 'fas fa-users-cog',
    path: '../modules/kullanici-yoneticisi/',
  },
];

// Vite build için: modül dosyalarını derleme zamanında keşfet
const moduleHtmlLoaders = import.meta.glob('../modules/*/*.html', { as: 'raw' });
const moduleCssLoaders = import.meta.glob('../modules/*/*.css');
const moduleJsLoaders = import.meta.glob('../modules/*/*.ts');


// ─── State ────────────────────────────────────────────────────────────────────

let currentModuleId: string | null = null;

// ─── Uygulama Başlangıcı ──────────────────────────────────────────────────────

async function initializeAdminPanel(): Promise<void> {
  const isLoggedIn = pb.authStore.isValid;
  const userRole = isLoggedIn ? (pb.authStore.model?.['role'] as string | undefined) : null;

  updateAuthUI(isLoggedIn);
  updateConnectionIndicator(isLoggedIn);

  if (userRole === 'admin' || userRole === 'client') {
    renderModuleMenu(userRole);
    if (!currentModuleId) {
      await loadModule('denetim-takip');
    }
    subscribeToAdminChanges();
  } else {
    const menu = document.getElementById('module-menu');
    if (menu) menu.innerHTML = '';
    showAccessDenied();
  }

  setupEventListeners();
}

// ─── Erişim Reddedildi ────────────────────────────────────────────────────────

function showAccessDenied(): void {
  const container = document.getElementById('module-container');
  if (!container) return;

  container.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.className = 'access-denied';

  const icon = document.createElement('i');
  icon.className = 'fas fa-exclamation-triangle';
  icon.setAttribute('aria-hidden', 'true');

  const heading = document.createElement('h2');
  heading.textContent = 'Erişim Reddedildi';

  const text = document.createElement('p');
  text.textContent = 'Lütfen sisteme giriş yapın.';

  wrapper.appendChild(icon);
  wrapper.appendChild(heading);
  wrapper.appendChild(text);
  container.appendChild(wrapper);
}

// ─── Menü Oluşturma ───────────────────────────────────────────────────────────

function renderModuleMenu(userRole: string): void {
  const menu = document.getElementById('module-menu');
  if (!menu) return;
  menu.innerHTML = '';

  const accessibleModules = userRole === 'admin'
    ? MODULES
    : MODULES.filter(m => m.id === 'denetim-takip');

  accessibleModules.forEach(module => {
    menu.appendChild(createMenuItemElement(module));
  });
}

function createMenuItemElement(module: ModuleItem): HTMLLIElement {
  const li = document.createElement('li');
  li.setAttribute('role', 'none');

  if (module.submenu) {
    li.classList.add('has-submenu');

    const link = document.createElement('a');
    link.href = '#';
    link.setAttribute('role', 'menuitem');
    link.setAttribute('aria-haspopup', 'true');
    link.setAttribute('aria-expanded', 'false');
    link.innerHTML = `<i class="${module.icon}" aria-hidden="true"></i><span>${module.name}</span>`;

    const subMenu = document.createElement('ul');
    subMenu.className = 'submenu';
    subMenu.setAttribute('role', 'menu');

    link.addEventListener('click', (e) => {
      e.preventDefault();
      const isOpen = li.classList.toggle('open');
      subMenu.classList.toggle('open', isOpen);
      link.setAttribute('aria-expanded', String(isOpen));
    });

    module.submenu.forEach(sub => {
      const subLi = document.createElement('li');
      subLi.setAttribute('role', 'none');

      const subLink = document.createElement('a');
      subLink.href = '#';
      subLink.dataset['moduleId'] = sub.id;
      subLink.setAttribute('role', 'menuitem');
      subLink.innerHTML = `<i class="${sub.icon}" aria-hidden="true"></i><span>${sub.name}</span>`;

      subLink.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void loadModule(sub.id);
      });

      subLi.appendChild(subLink);
      subMenu.appendChild(subLi);
    });

    li.appendChild(link);
    li.appendChild(subMenu);

  } else {
    const link = document.createElement('a');
    link.href = '#';
    link.dataset['moduleId'] = module.id;
    link.setAttribute('role', 'menuitem');
    link.innerHTML = `<i class="${module.icon}" aria-hidden="true"></i><span>${module.name}</span>`;

    link.addEventListener('click', (e) => {
      e.preventDefault();
      void loadModule(module.id);
    });

    li.appendChild(link);
  }

  return li;
}

// ─── Modül Yükleme (Lazy) ────────────────────────────────────────────────────


async function loadModule(moduleId: string): Promise<void> {
  let module: ModuleItem | undefined;
  for (const m of MODULES) {
    if (m.id === moduleId) { module = m; break; }
    const sub = m.submenu?.find(s => s.id === moduleId);
    if (sub) { module = sub; break; }
  }
  if (!module) return;

  currentModuleId = moduleId;

  // Aktif menü bağlantısını güncelle
  document.querySelectorAll<HTMLAnchorElement>('.sidebar-menu a').forEach(a => {
    a.classList.remove('active');
    a.removeAttribute('aria-current');
  });
  const activeLink = document.querySelector<HTMLAnchorElement>(`.sidebar-menu a[data-module-id="${moduleId}"]`);
  if (activeLink) {
    activeLink.classList.add('active');
    activeLink.setAttribute('aria-current', 'page');
  }

  // Başlık güncelle
  const title = document.getElementById('module-title');
  if (title) title.innerHTML = `<i class="${module.icon}" aria-hidden="true"></i> ${module.name}`;

  const container = document.getElementById('module-container');
  if (!container) return;
  container.innerHTML = '';

  const loadingMsg = document.createElement('p');
  loadingMsg.className = 'module-loading';
  loadingMsg.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Modül yükleniyor...';
  container.appendChild(loadingMsg);

  // Klasik path’i tek bir anahtar üretmek için kullanıyoruz
  const keyBase = `../modules/${module.id}/${module.id}`;

  try {
    // HTML’i (raw) yükle
    const htmlLoader = moduleHtmlLoaders[`${keyBase}.html`];
    if (!htmlLoader) throw new Error(`${module.id}.html bulunamadı.`);
    const html = await htmlLoader();
    container.innerHTML = String(html);

    // CSS’i yükle (Vite otomatik inject eder)
    const cssLoader = moduleCssLoaders[`${keyBase}.css`];
    if (cssLoader) await cssLoader();

    // TS modülünü yükle ve init çalıştır
    const jsLoader = moduleJsLoaders[`${keyBase}.ts`];
    if (!jsLoader) return;

    const initFnName = moduleIdToInitFn(module.id);
    const mod = (await jsLoader()) as Record<string, unknown>;
    const init = mod[initFnName];
    if (typeof init === 'function') (init as (pb: unknown) => void)(pb);

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Bilinmeyen hata';
    container.innerHTML = '';

    const errDiv = document.createElement('div');
    errDiv.className = 'module-error';

    const icon = document.createElement('i');
    icon.className = 'fas fa-exclamation-circle';
    icon.setAttribute('aria-hidden', 'true');

    const text = document.createElement('p');
    text.textContent = `Modül yüklenemedi: ${errorMsg}`;

    errDiv.appendChild(icon);
    errDiv.appendChild(text);
    container.appendChild(errDiv);
  }
}


/**
 * Modül ID → init fonksiyon adı
 * "bayi-yoneticisi" → "initializeBayiYoneticisiModule"
 */
function moduleIdToInitFn(moduleId: string): string {
  const pascal = moduleId
    .split('-')
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  return `initialize${pascal}Module`;
}

// ─── Gerçek Zamanlı Ban Dinleyicisi ──────────────────────────────────────────

function subscribeToAdminChanges(): void {
  if (!pb.authStore.isValid) return;
  const userId = pb.authStore.model?.['id'] as string;

  pb.collection('users').subscribe(userId, (e) => {
    if (e.record?.['is_banned'] === true) {
      alert('Hesabınız kilitlendi.');
      pb.authStore.clear();
      window.location.reload();
    }
  });
}

// ─── Auth UI ──────────────────────────────────────────────────────────────────

function updateAuthUI(isLoggedIn: boolean): void {
  const loginBtn = document.getElementById('login-toggle-btn');
  const logoutBtn = document.getElementById('logout-btn');

  if (isLoggedIn) {
    loginBtn?.setAttribute('hidden', '');
    logoutBtn?.removeAttribute('hidden');
  } else {
    loginBtn?.removeAttribute('hidden');
    logoutBtn?.setAttribute('hidden', '');
  }
}

function updateConnectionIndicator(isLoggedIn: boolean): void {
  const track = document.getElementById('connection-status-switch');
  const text = document.getElementById('connection-status-text');

  track?.classList.toggle('connected', isLoggedIn);
  track?.classList.toggle('disconnected', !isLoggedIn);
  if (text) text.textContent = isLoggedIn ? 'Buluta Bağlı' : 'Bağlı Değil';
}

// ─── Event Listener Kurulumu (onclick="" kullanılmaz) ────────────────────────

function setupEventListeners(): void {
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
    pb.authStore.clear();
    window.location.reload();
  });

  loginSubmitBtn?.addEventListener('click', async () => {
    if (!emailInput || !passwordInput || !errorDiv) return;
    errorDiv.textContent = '';
    try {
      await pb.collection('users').authWithPassword(emailInput.value, passwordInput.value);
      window.location.reload();
    } catch {
      errorDiv.textContent = 'E-posta veya şifre hatalı.';
    }
  });

  passwordInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loginSubmitBtn?.click();
  });

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
}

// ─── Başlat ───────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => { void initializeAdminPanel(); });
