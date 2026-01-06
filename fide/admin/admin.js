// --- Modül Tanımlamaları (Alt Menü Destekli Yapı) ---
const modules = [
    {
        id: 'denetim-takip',
        name: 'Denetim Takip',
        icon: 'fas fa-calendar-check',
        path: '../modules/denetim-takip/'
    },
    {
        id: 'fide-main-parent', // Ana menü ID'si
        name: 'FiDe Ana Sayfası',
        icon: 'fas fa-home',
        submenu: [
            {
                id: 'eposta-taslagi', // Bu ID, modül klasör adıyla aynı olmalı
                name: 'E-posta Taslağı',
                icon: 'fas fa-envelope-open-text',
                path: '../modules/eposta-taslagi/'
            }
        ]
    },
    {
        id: 'bayi-yoneticisi', // ID, modül klasör adıyla aynı olmalı
        name: 'Bayi Yöneticisi',
        icon: 'fas fa-store',
        path: '../modules/bayi-yoneticisi/'
    },
    {
        id: 'soru-yoneticisi',
        name: 'Soru Yöneticisi',
        icon: 'fas fa-edit',
        path: '../modules/soru-yoneticisi/'
    },
    {
        id: 'veritabani-yonetim',
        name: 'Veritabanı Yönetimi',
        icon: 'fas fa-cogs',
        path: '../modules/veritabani-yonetim/'
    },
    {
        id: 'kullanici-yoneticisi',
        name: 'Kullanıcı Yönetimi',
        icon: 'fas fa-users-cog',
        path: '../modules/kullanici-yoneticisi/'
    }
];

// --- Global Değişkenler ---
let currentModuleId = null;
// 'pb' değişkeni 'db-config.js' dosyasından global olarak geliyor.

// --- RBAC (YETKİ) ÇEKİRDEĞİ ---
let liveUserRecord = null; // users kaydının canlı yansıması

function getNormalizedPermissions(userRecord) {
    const p = (userRecord && userRecord.permissions && typeof userRecord.permissions === 'object')
        ? userRecord.permissions
        : {};

    if (!p.modules || typeof p.modules !== 'object') p.modules = {};
    if (!p.features || typeof p.features !== 'object') p.features = {};
    if (!p.dataScope || typeof p.dataScope !== 'object') p.dataScope = {};
    return p;
}

function isAdminUser() {
    return !!(pb?.authStore?.isValid && pb.authStore.model?.role === 'admin');
}

function getCurrentUserId() {
    return pb?.authStore?.isValid ? pb.authStore.model?.id : null;
}

function canAccessModule(moduleId) {
    if (!pb?.authStore?.isValid) return false;
    if (isAdminUser()) return true;

    const perms = getNormalizedPermissions(liveUserRecord || pb.authStore.model);
    return perms.modules[moduleId] === true;
}

function emitRbacUpdate() {
    try {
        const perms = getNormalizedPermissions(liveUserRecord || pb.authStore.model);
        window.dispatchEvent(new CustomEvent('rbac:updated', {
            detail: {
                user: liveUserRecord || pb.authStore.model,
                permissions: perms,
                isAdmin: isAdminUser()
            }
        }));
    } catch (e) {
        console.warn('RBAC event emit failed:', e);
    }
}

function redirectToSafeModule() {
    const fallback = 'denetim-takip';
    if (currentModuleId !== fallback) {
        loadModule(fallback);
    }
}

// --- Uygulama Başlatma ---
window.onload = initializeAdminPanel;

async function initializeAdminPanel() {
    // --- GÜVENLİK KONTROLÜ ---
    const isLoggedIn = pb.authStore.isValid;
    const userRole = isLoggedIn ? pb.authStore.model.role : null;

    updateAuthUI(isLoggedIn);
    updateConnectionIndicator(isLoggedIn);

    if (userRole === 'admin' || userRole === 'client') {
        // RBAC: Menü ve modül erişimi %100 users.permissions üzerinden yönetilir (admin her şeye erişir).
        renderModuleMenu();

        // Varsayılan modül: denetim-takip (herkes için güvenli başlangıç)
        if (!currentModuleId) {
            loadModule('denetim-takip');
        }

        // Anlık ban + canlı yetki değişimi + cihaz kilidi dinlemeleri
        subscribeToCurrentUserChanges();
        subscribeToCurrentUserDevices();

    } else {
        // Kullanıcı admin/client değilse veya giriş yapmamışsa, erişimi engelle
        document.getElementById('module-menu').innerHTML = '';
        const container = document.getElementById('module-container');
        container.innerHTML = `
            <div style="text-align: center; padding: 50px; color: #dc3545;">
                <i class="fas fa-exclamation-triangle fa-3x"></i>
                <h2>Erişim Reddedildi</h2>
                <p>Bu alana erişim yetkiniz bulunmamaktadır.</p>
            </div>
        `;
        document.getElementById('module-title').innerHTML = '<i class="fas fa-ban"></i> Yetkisiz Erişim';
    }

    setupEventListeners();
}

// --- MENÜ OLUŞTURUCU (RBAC UYUMLU) ---
function renderModuleMenu() {
    const menu = document.getElementById('module-menu');
    menu.innerHTML = '';

    // RBAC: Admin tüm modülleri görür. Client sadece permissions.modules true olanları görür.
    const accessibleModules = isAdminUser()
        ? modules
        : modules
            .map(m => {
                // submenu destekli yapı: parent görünürlüğü, child erişimi olanlara göre belirlenir
                if (m.submenu && Array.isArray(m.submenu)) {
                    const allowedSubs = m.submenu.filter(s => canAccessModule(s.id));
                    if (allowedSubs.length === 0) return null;
                    return { ...m, submenu: allowedSubs };
                }
                return canAccessModule(m.id) ? m : null;
            })
            .filter(Boolean);

    accessibleModules.forEach(module => {
        const li = document.createElement('li');

        if (module.submenu) {
            li.classList.add('has-submenu');
            li.innerHTML = `<a href="#"><i class="${module.icon}"></i><span>${module.name}</span></a>`;
            const subMenu = document.createElement('ul');
            subMenu.className = 'submenu';

            module.submenu.forEach(sub => {
                const subLi = document.createElement('li');
                subLi.innerHTML = `<a href="#" data-module-id="${sub.id}"><i class="${sub.icon}"></i><span>${sub.name}</span></a>`;
                subLi.querySelector('a').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (currentModuleId !== sub.id) {
                        loadModule(sub.id);
                    }
                });
                subMenu.appendChild(subLi);
            });

            li.appendChild(subMenu);

            li.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                li.classList.toggle('open');
                subMenu.classList.toggle('open');
            });

        } else {
            li.innerHTML = `<a href="#" data-module-id="${module.id}"><i class="${module.icon}"></i><span>${module.name}</span></a>`;
            li.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                if (currentModuleId !== module.id) {
                    loadModule(module.id);
                }
            });
        }
        menu.appendChild(li);
    });
}

// --- MODÜL YÜKLEYİCİ (MODERN YAPI - RBAC GUARD EKLENDİ) ---
async function loadModule(moduleId) {
    let module;
    for (const main of modules) {
        if (main.id === moduleId) {
            module = main;
            break;
        }
        if (main.submenu) {
            const sub = main.submenu.find(s => s.id === moduleId);
            if (sub) {
                module = sub;
                break;
            }
        }
    }

    if (!module) { console.error("Modül bulunamadı:", moduleId); return; }

    // RBAC GUARD: Yetkisi yoksa modülü hiç yükleme
    if (!canAccessModule(moduleId)) {
        console.warn('RBAC: Modül erişimi reddedildi:', moduleId);
        alert('Bu modüle erişim yetkiniz yok.');
        redirectToSafeModule();
        return;
    }

    currentModuleId = moduleId;

    // Aktif menü öğesini ayarla
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-menu a[data-module-id="${moduleId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
        const parentLi = activeLink.closest('.has-submenu');
        if (parentLi && !parentLi.classList.contains('open')) {
            parentLi.classList.add('open');
            parentLi.querySelector('.submenu').classList.add('open');
        }
    }

    const container = document.getElementById('module-container');
    const title = document.getElementById('module-title');
    container.innerHTML = `<p>Modül yükleniyor: ${module.name}.</p>`;
    title.innerHTML = `<i class="${module.icon}"></i> ${module.name}`;

    try {
        // HTML Yükle
        const htmlResponse = await fetch(`${module.path}${module.id}.html`);
        if (!htmlResponse.ok) throw new Error(`Dosya bulunamadı: ${module.id}.html`);
        container.innerHTML = await htmlResponse.text();

        // CSS Yükle
        const cssId = `module-css-${module.id}`;
        if (!document.getElementById(cssId)) {
            const link = document.createElement('link');
            link.id = cssId;
            link.rel = 'stylesheet';
            link.href = `${module.path}${module.id}.css`;
            document.head.appendChild(link);
        }

        // JAVASCRIPT YÜKLEYİCİ (Modern 'import' yöntemi)
        const oldScript = document.getElementById('module-script');
        if (oldScript) oldScript.remove();

        const formattedId = module.id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        const initFunctionName = `initialize${formattedId}Module`;

        // Önbelleğe takılmamak için URL'ye zaman damgası ekle
        const moduleUrl = `${module.path}${module.id}.js?v=${new Date().getTime()}`;

        // 'import()' komutu, 'export' içeren modern JS dosyalarını yükler
        const moduleExports = await import(moduleUrl);

        if (typeof moduleExports[initFunctionName] === 'function') {
            moduleExports[initFunctionName](pb);
        } else {
            console.error(`Modern modül (import) başlatma fonksiyonu bulunamadı: ${initFunctionName}. Modülün .js dosyasının bu fonksiyonu 'export' ettiğinden emin olun.`);
        }

    } catch (error) {
        console.error("Modül yüklenirken hata oluştu:", error);
        container.innerHTML = `<p style="color: red;">'${module.name}' modülü yüklenemedi. <br>Hata: ${error.message}. <br>Lütfen '../modules/${module.id}/' klasörünün ve ilgili dosyaların sunucuda olduğundan emin olun.</p>`;
    }
}

/**
 * RBAC + Güvenlik: Giriş yapan kullanıcının kendi users kaydını anlık dinler.
 * - is_banned => anında oturumu düşürür (kill switch)
 * - permissions/role değişikliği => menüyü günceller, açık modül yetkisiz kaldıysa dışarı atar
 */
function subscribeToCurrentUserChanges() {
    if (!pb || !pb.authStore.isValid) return;

    const userId = getCurrentUserId();
    if (!userId) return;

    try {
        pb.collection('users').subscribe(userId, function (e) {
            if (!e || !e.record) return;

            liveUserRecord = e.record;

            // Kill Switch: Ban
            if (e.record.is_banned === true) {
                console.warn('RBAC: Kullanıcı banlandı. Oturum sonlandırılıyor.');
                alert('Hesabınız yönetici tarafından kilitlendi. Sistemden çıkış yapılıyor.');
                pb.authStore.clear();
                window.location.reload();
                return;
            }

            // Menü + açık modül kontrolü
            renderModuleMenu();

            if (currentModuleId && !canAccessModule(currentModuleId)) {
                console.warn('RBAC: Aktif modül yetkisi kaldırıldı:', currentModuleId);
                alert('Bu modül yetkiniz kaldırıldı. Ana sayfaya yönlendiriliyorsunuz.');
                redirectToSafeModule();
            }

            // Modüller UI güncelleyebilsin diye event yay
            emitRbacUpdate();
        });
    } catch (error) {
        console.error('RBAC: users subscribe başlatılamadı:', error);
    }
}

/**
 * Cihaz Kilidi (Realtime): user_devices koleksiyonunu dinler.
 * - Kullanıcının cihazı is_locked=true olursa anında oturumu düşürür.
 *
 * Not: PocketBase subscribe filtrelemesi sürüme göre değişebilir; bu nedenle '*' dinleyip
 * ilgili kullanıcı kaydını ayıklıyoruz.
 */
function subscribeToCurrentUserDevices() {
    if (!pb || !pb.authStore.isValid) return;

    const userId = getCurrentUserId();
    if (!userId) return;

    try {
        pb.collection('user_devices').subscribe('*', function (e) {
            if (!e || !e.record) return;

            const rec = e.record;
            const recUser = rec.user || rec.user_id || rec.userId;

            if (recUser !== userId) return;

            if (rec.is_locked === true) {
                console.warn('RBAC: Cihaz kilitlendi. Oturum sonlandırılıyor.');
                alert('Cihazınız yönetici tarafından kilitlendi. Sistemden çıkış yapılıyor.');
                pb.authStore.clear();
                window.location.reload();
            }
        });
    } catch (error) {
        console.error('RBAC: user_devices subscribe başlatılamadı:', error);
    }
}


// --- ARAYÜZ GÜNCELLEME FONKSİYONLARI (DEĞİŞİKLİK YOK)---
function updateAuthUI(isLoggedIn) {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    if (isLoggedIn) {
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
        if (loginPopup) loginPopup.style.display = 'none';
    } else {
        loginToggleBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'none';
    }
}

function updateConnectionIndicator(isLoggedIn) {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');

    statusSwitch.classList.toggle('connected', isLoggedIn);
    statusSwitch.classList.toggle('disconnected', !isLoggedIn);
    statusText.textContent = isLoggedIn ? 'Buluta Bağlı' : 'Bağlı Değil';
}

// --- GİRİŞ/ÇIKIŞ OLAY DİNLEYİCİLERİ (DEĞİŞİKLİK YOK) ---
function setupEventListeners() {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });

    logoutBtn.addEventListener('click', () => {
        pb.authStore.clear();
        window.location.reload();
    });

    loginSubmitBtn.addEventListener('click', async () => {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';

        if (!email || !password) {
            errorDiv.textContent = 'Lütfen tüm alanları doldurun.';
            return;
        }

        try {
            await pb.collection('users').authWithPassword(email, password);
            window.location.reload();
        } catch (error) {
            errorDiv.textContent = 'E-posta veya şifre hatalı.';
        }
    });

    window.addEventListener('click', function (event) {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            if (loginPopup) loginPopup.style.display = 'none';
        }
    });
}
