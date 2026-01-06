// --- Modül Tanımlamaları (Alt Menü Destekli Yapı) ---
const modules = [
    {
        id: 'denetim-takip',
        name: 'Denetim Takip',
        icon: 'fas fa-calendar-check',
        path: './modules/denetim-takip/'
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
                path: './modules/eposta-taslagi/'
            }
        ]
    },
    {
        id: 'bayi-yoneticisi', // ID, modül klasör adıyla aynı olmalı
        name: 'Bayi Yöneticisi',
        icon: 'fas fa-store',
        path: './modules/bayi-yoneticisi/'
    },
    {
        id: 'soru-yoneticisi',
        name: 'Soru Yöneticisi',
        icon: 'fas fa-edit',
        path: './modules/soru-yoneticisi/'
    },
    {
        id: 'veritabani-yonetim',
        name: 'Veritabanı Yönetimi',
        icon: 'fas fa-cogs',
        path: './modules/veritabani-yonetim/'
    },
    {
        id: 'kullanici-yoneticisi',
        name: 'Kullanıcı Yönetimi',
        icon: 'fas fa-users-cog',
        path: './modules/kullanici-yoneticisi/'
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
