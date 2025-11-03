// === YENİ EKLENDİ: 'db-config.js' artık import ediliyor ===
// 'admin.js' dosyası 'admin' klasöründe olduğu için, 
// ana dizindeki 'db-config.js' dosyasına ../ ile çıkıyoruz.
import { POCKETBASE_URL } from '../db-config.js';

// --- Modül Tanımlamaları (Alt Menü Destekli Yapı) ---
const modules = [
    {
        id: 'denetim-takip',
        name: 'Denetim Takip',
        icon: 'fas fa-calendar-check',
        path: '../modules/denetim-takip/' // (YENİ) Bu yol 'public/modules'a göre değil, 'dist/modules'a göre ayarlandı
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
                path: '../modules/eposta-taslagi/'
            }
        ]
    },
    {
        id: 'bayi-yoneticisi', 
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
let pb; // === GÜNCELLENDİ: 'pb' artık bu modül içinde tanımlanıyor ===

// --- Uygulama Başlatma ---
// === GÜNCELLENDİ: 'window.onload' kaldırıldı, dosya 'module' olduğu için kod doğrudan çalışır ===
initializeAdminPanel();

async function initializeAdminPanel() {
    // === GÜNCELLENDİ: 'pb' artık burada başlatılıyor ===
    try {
        pb = new PocketBase(POCKETBASE_URL);
    } catch (e) {
        console.error("PocketBase başlatılamadı. Adresin doğru olduğundan emin olun.", e);
    }
    
    // --- GÜVENLİK KONTROLÜ ---
    const isLoggedIn = pb && pb.authStore.isValid;
    const userRole = isLoggedIn ? pb.authStore.model.role : null;

    updateAuthUI(isLoggedIn);
    updateConnectionIndicator(isLoggedIn);

    if (userRole === 'admin') {
        renderModuleMenu('admin'); 
        if (!currentModuleId) {
            loadModule('denetim-takip');
        }
        subscribeToAdminChanges();

    } else if (userRole === 'client') {
        renderModuleMenu('client'); 
        loadModule('denetim-takip');
        subscribeToAdminChanges();

    } else {
        // Kullanıcı admin/client değilse veya giriş yapmamışsa, erişimi engelle
        document.getElementById('module-menu').innerHTML = ''; // Menüyü temizle
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

// --- ALT MENÜ DESTEKLİ MENÜ OLUŞTURUCU (Değişiklik yok) ---
function renderModuleMenu(userRole) { 
    const menu = document.getElementById('module-menu');
    menu.innerHTML = ''; 

    let accessibleModules = [];
    if (userRole === 'admin') {
        accessibleModules = modules; 
    } else if (userRole === 'client') {
        accessibleModules = modules.filter(m => m.id === 'denetim-takip');
    }

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

// --- MODÜL YÜKLEYİCİ (MODERN YAPI - DEĞİŞİKLİK YOK) ---
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

    currentModuleId = moduleId;

    // Aktif menü öğesini ayarla
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-menu a[data-module-id="${moduleId}"]`);
    if(activeLink) {
        activeLink.classList.add('active');
        const parentLi = activeLink.closest('.has-submenu');
        if (parentLi && !parentLi.classList.contains('open')) {
            parentLi.classList.add('open');
            parentLi.querySelector('.submenu').classList.add('open');
        }
    }
    
    const container = document.getElementById('module-container');
    const title = document.getElementById('module-title');
    container.innerHTML = `<p>Modül yükleniyor: ${module.name}...</p>`;
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

        // JAVASCRIPT YÜKLEYİCİ
        const oldScript = document.getElementById('module-script');
        if (oldScript) oldScript.remove();

        const formattedId = module.id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        const initFunctionName = `initialize${formattedId}Module`;

        const moduleUrl = `${module.path}${module.id}.js?v=${new Date().getTime()}`;
        
        const moduleExports = await import(moduleUrl);
        
        if (typeof moduleExports[initFunctionName] === 'function') {
            moduleExports[initFunctionName](pb); // 'pb' instance'ı modüle aktar
        } else {
            console.error(`Modern modül (import) başlatma fonksiyonu bulunamadı: ${initFunctionName}. Modülün .js dosyasının bu fonksiyonu 'export' ettiğinden emin olun.`);
        }

    } catch (error) {
        console.error("Modül yüklenirken hata oluştu:", error);
        container.innerHTML = `<p style="color: red;">'${module.name}' modülü yüklenemedi. <br>Hata: ${error.message}. <br>Lütfen '../modules/${module.id}/' klasörünün ve ilgili dosyaların sunucuda olduğundan emin olun.</p>`;
    }
}

/**
 * YENİ FONKSİYON: Anlık ban sistemini dinler (Admin paneli için).
 */
function subscribeToAdminChanges() {
    if (!pb || !pb.authStore.isValid) {
        return; 
    }

    const adminId = pb.authStore.model.id;
    
    try {
        pb.collection('users').subscribe(adminId, function(e) {
            if (e.record && e.record.is_banned === true) {
                console.warn('Admin kilitlendi (is_banned=true). Oturum sonlandırılıyor.');
                alert("Hesabınız başka bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor.");
                pb.authStore.clear();
                window.location.reload();
            }
        });
    } catch (error) {
        console.error('Admin dinlemesi (subscribe) başlatılamadı:', error);
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
        if(loginPopup) loginPopup.style.display = 'none';
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

    window.addEventListener('click', function(event) {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            if(loginPopup) loginPopup.style.display = 'none';
        }
    });
}