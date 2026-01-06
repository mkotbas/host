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
let currentUserPermissions = {}; // YENİ: Anlık yetkileri tutar
// 'pb' değişkeni 'db-config.js' dosyasından global olarak geliyor.

// --- Uygulama Başlatma ---
window.onload = initializeAdminPanel;

async function initializeAdminPanel() {
    // --- GÜVENLİK KONTROLÜ (GÜNCELLENDİ) ---
    const isLoggedIn = pb.authStore.isValid;
    const user = isLoggedIn ? pb.authStore.model : null;
    const userRole = user ? user.role : null;

    // Yetkileri yükle (Admin ise boş kalabilir, Client ise DB'den gelir)
    if (user && user.permissions) {
        currentUserPermissions = user.permissions;
    } else {
        currentUserPermissions = {};
    }

    updateAuthUI(isLoggedIn);
    updateConnectionIndicator(isLoggedIn);

    if (userRole === 'admin') {
        // --- ADMIN SENARYOSU ---
        // Admin her şeyi görür, permissions parametresi null/boş gidebilir
        renderModuleMenu('admin'); 
        
        // Varsayılan modül
        if (!currentModuleId) {
            loadModule('denetim-takip');
        }

        // Anlık takip başlat
        subscribeToUserChanges(user.id);

    } else if (userRole === 'client') {
        // --- CLIENT (BURAK) SENARYOSU ---
        // Menüyü yetkilere göre oluştur
        renderModuleMenu('client', currentUserPermissions);

        // Varsayılan olarak hangi modülü açalım?
        // Önce 'denetim-takip' yetkisi var mı bakalım, yoksa ilk yetkili modülü açalım.
        if (checkAccess('denetim-takip', currentUserPermissions)) {
            loadModule('denetim-takip');
        } else {
            // Denetim takip yetkisi yoksa, listedeki ilk yetkili modülü bul
            const firstAllowed = findFirstAccessibleModuleId(currentUserPermissions);
            if (firstAllowed) {
                loadModule(firstAllowed);
            } else {
                showAccessDeniedMessage("Erişim yetkiniz olan hiç bir modül bulunamadı.");
            }
        }
        
        // Anlık takip başlat
        subscribeToUserChanges(user.id);

    } else {
        // --- YETKİSİZ SENARYOSU ---
        showAccessDeniedMessage("Bu alana erişim yetkiniz bulunmamaktadır.");
    }
    setupEventListeners();
}

/**
 * YENİ: Menüyü role ve yetkilere göre dinamik oluşturur.
 */
function renderModuleMenu(userRole, permissions = {}) {
    const menu = document.getElementById('module-menu');
    menu.innerHTML = ''; 

    // 1. Modülleri filtrele
    let accessibleModules = [];

    if (userRole === 'admin') {
        accessibleModules = modules; // Admin hepsini görür
    } else {
        // Client için yetki kontrolü (Recursion / Map yapısı)
        accessibleModules = modules.map(mod => {
            // Ana modül kopyası oluştur (Referans bozmamak için)
            const moduleCopy = { ...mod };

            if (moduleCopy.submenu) {
                // Alt menüsü varsa, alt menü elemanlarını filtrele
                const filteredSubmenu = moduleCopy.submenu.filter(sub => checkAccess(sub.id, permissions));
                
                // Eğer filtrelenmiş alt menüde eleman kaldıysa, bu ana modülü menüye ekle
                if (filteredSubmenu.length > 0) {
                    moduleCopy.submenu = filteredSubmenu;
                    return moduleCopy;
                }
                return null; // Alt menüsü boşaldıysa ana başlığı da gösterme
            } else {
                // Tekil modülse direkt kontrol et
                return checkAccess(moduleCopy.id, permissions) ? moduleCopy : null;
            }
        }).filter(m => m !== null); // null olanları temizle
    }

    // 2. Menüyü DOM'a bas (Eski mantıkla aynı)
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
                    if (currentModuleId !== sub.id) loadModule(sub.id);
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
                if (currentModuleId !== module.id) loadModule(module.id);
            });
        }
        menu.appendChild(li);
    });
}

// --- MODÜL YÜKLEYİCİ (GÜNCELLENDİ: Güvenlik Kontrolü Eklendi) ---
async function loadModule(moduleId) {
    // YENİ: Yüklemeden önce son bir kez yetki kontrolü yap
    // Eğer kullanıcı admin değilse VE yetkisi yoksa DUR.
    const userRole = pb.authStore.model?.role;
    if (userRole !== 'admin') {
        if (!checkAccess(moduleId, currentUserPermissions)) {
            console.error(`Erişim Reddedildi: ${moduleId}`);
            document.getElementById('module-container').innerHTML = `
                <div style="padding: 20px; color: red; text-align: center;">
                    <i class="fas fa-lock fa-2x"></i>
                    <h3>Erişim Reddedildi</h3>
                    <p>Bu modülü görüntüleme yetkiniz yok.</p>
                </div>`;
            return;
        }
    }

    // ... Buradan sonrası standart yükleme işlemi ...
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
        const htmlResponse = await fetch(`${module.path}${module.id}.html`);
        if (!htmlResponse.ok) throw new Error(`Dosya bulunamadı: ${module.id}.html`);
        container.innerHTML = await htmlResponse.text();

        const cssId = `module-css-${module.id}`;
        if (!document.getElementById(cssId)) {
            const link = document.createElement('link');
            link.id = cssId;
            link.rel = 'stylesheet';
            link.href = `${module.path}${module.id}.css`;
            document.head.appendChild(link);
        }

        const oldScript = document.getElementById('module-script');
        if (oldScript) oldScript.remove();

        const formattedId = module.id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        const initFunctionName = `initialize${formattedId}Module`;

        const moduleUrl = `${module.path}${module.id}.js?v=${new Date().getTime()}`;
        
        const moduleExports = await import(moduleUrl);
        
        if (typeof moduleExports[initFunctionName] === 'function') {
            moduleExports[initFunctionName](pb);
        } else {
            console.error(`Modern modül (import) başlatma fonksiyonu bulunamadı: ${initFunctionName}`);
        }

    } catch (error) {
        console.error("Modül yüklenirken hata oluştu:", error);
        container.innerHTML = `<p style="color: red;">'${module.name}' modülü yüklenemedi. <br>Hata: ${error.message}.</p>`;
    }
}

/**
 * YENİ: Anlık kullanıcı değişikliklerini dinler (Ban + Yetki Değişimi)
 */
function subscribeToUserChanges(userId) {
    if (!pb || !pb.authStore.isValid) return;

    try {
        // Kullanıcının kendi kaydını dinle
        pb.collection('users').subscribe(userId, function(e) {
            if (e.action === 'delete') {
                alert("Kullanıcı hesabınız silindi. Çıkış yapılıyor.");
                pb.authStore.clear();
                window.location.reload();
                return;
            }
            
            const record = e.record;

            // 1. BAN KONTROLÜ
            if (record.is_banned === true) {
                alert("Hesabınız yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor.");
                pb.authStore.clear();
                window.location.reload();
                return;
            }

            // 2. YETKİ (PERMISSIONS) GÜNCELLEMESİ
            // Eğer permissions değiştiyse arayüzü güncelle
            // PocketBase authStore'u güncellemek için kaydı save yapıyoruz
            pb.authStore.save(pb.authStore.token, record);
            
            // Global değişkeni güncelle
            currentUserPermissions = record.permissions || {};
            
            // Menüyü yeniden çiz
            const role = record.role;
            renderModuleMenu(role, currentUserPermissions);

            // 3. AKTİF MODÜL KONTROLÜ
            // Eğer kullanıcı şu an bir modüldeyse ve o modülün yetkisi alındıysa at!
            if (currentModuleId && role !== 'admin') {
                if (!checkAccess(currentModuleId, currentUserPermissions)) {
                    alert("Yöneticiniz bu sayfaya erişim yetkinizi kaldırdı. Ana sayfaya yönlendiriliyorsunuz.");
                    // Varsa başka bir modüle geç, yoksa kapat
                    if (checkAccess('denetim-takip', currentUserPermissions)) {
                        loadModule('denetim-takip');
                    } else {
                        const first = findFirstAccessibleModuleId(currentUserPermissions);
                        if (first) loadModule(first);
                        else {
                             document.getElementById('module-container').innerHTML = '<p>Erişim yetkiniz kalmadı.</p>';
                             document.getElementById('module-title').innerHTML = 'Yetkisiz';
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('Kullanıcı dinlemesi (subscribe) başlatılamadı:', error);
    }
}

/**
 * YARDIMCI: Modül ID'sini (kebab-case) permission key'ine (snake_case) çevirir ve kontrol eder.
 * Örn: 'bayi-yoneticisi' -> 'bayi_yoneticisi'
 */
function checkAccess(moduleId, permissions) {
    if (!permissions) return false;
    
    // Tireleri alt çizgiye çevir
    const key = moduleId.replace(/-/g, '_');
    
    // İlgili anahtar var mı ve access true mu?
    if (permissions[key] && permissions[key].access === true) {
        return true;
    }
    return false;
}

/**
 * YARDIMCI: İlk erişilebilir modülü bulur.
 */
function findFirstAccessibleModuleId(permissions) {
    for (const mod of modules) {
        if (mod.submenu) {
            for (const sub of mod.submenu) {
                if (checkAccess(sub.id, permissions)) return sub.id;
            }
        } else {
            if (checkAccess(mod.id, permissions)) return mod.id;
        }
    }
    return null;
}

function showAccessDeniedMessage(msg) {
    document.getElementById('module-menu').innerHTML = ''; 
    const container = document.getElementById('module-container');
    container.innerHTML = `
        <div style="text-align: center; padding: 50px; color: #dc3545;">
            <i class="fas fa-exclamation-triangle fa-3x"></i>
            <h2>Erişim Reddedildi</h2>
            <p>${msg}</p>
        </div>
    `;
    document.getElementById('module-title').innerHTML = '<i class="fas fa-ban"></i> Yetkisiz Erişim';
}

// --- ARAYÜZ GÜNCELLEME VE EVENT LISTENERS (DEĞİŞİKLİK YOK) ---
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