// --- Modül Tanımlamaları (Alt Menü Destekli Yeni Yapı) ---
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
        id: 'bayi-yoneticisi-parent', // Ana menü olduğu için benzersiz bir ID
        name: 'Bayi Yöneticisi',
        icon: 'fas fa-store',
        submenu: [
            {
                id: 'bayi-yoneticisi', // Bu ID, modül klasör adıyla aynı olmalı
                name: 'E-posta Sistemi',
                icon: 'fas fa-at',
                path: '../modules/bayi-yoneticisi/'
            }
        ]
    },
    {
        id: 'soru-yoneticisi',
        name: 'Soru Yöneticisi',
        icon: 'fas fa-edit',
        path: '../modules/soru-yoneticisi/'
    },
    {
        id: 'veritabani',
        name: 'Veritabanı Modülü',
        icon: 'fas fa-database',
        path: '../modules/veritabani/'
    }
];

// --- Global Değişkenler ---
let isFirebaseConnected = false;
let currentModuleId = null;

// --- Uygulama Başlatma ---
window.onload = initializeAdminPanel;

async function initializeAdminPanel() {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    auth.onAuthStateChanged(user => {
        updateAuthUI(user);
        updateConnectionIndicator();
        if (user) {
            renderModuleMenu();
            if (!currentModuleId) {
                // Varsayılan olarak ilk modülü yükle
                loadModule(modules[0].id);
            }
        } else {
            document.getElementById('module-menu').innerHTML = '';
            document.getElementById('module-container').innerHTML = '<div class="alert alert-warning text-center">Lütfen panele erişmek için giriş yapın.</div>';
            document.getElementById('module-title').innerHTML = '<i class="fas fa-tachometer-alt"></i> Modül Yöneticisi';
        }
    });
    if (database) {
        const connectionRef = database.ref('.info/connected');
        connectionRef.on('value', (snapshot) => {
            isFirebaseConnected = snapshot.val();
            updateConnectionIndicator();
        });
    }
    setupEventListeners();
}

// --- YENİ ADMINLTE MENÜ OLUŞTURUCU ---
function renderModuleMenu() {
    const menu = document.getElementById('module-menu');
    menu.innerHTML = ''; 

    modules.forEach(module => {
        const li = document.createElement('li');
        li.className = 'nav-item';

        if (module.submenu) {
            li.classList.add('has-treeview');
            li.innerHTML = `
                <a href="#" class="nav-link">
                    <i class="nav-icon ${module.icon}"></i>
                    <p>
                        ${module.name}
                        <i class="right fas fa-angle-left"></i>
                    </p>
                </a>`;
            
            const subMenu = document.createElement('ul');
            subMenu.className = 'nav nav-treeview';
            
            module.submenu.forEach(sub => {
                const subLi = document.createElement('li');
                subLi.className = 'nav-item';
                subLi.innerHTML = `
                    <a href="#" class="nav-link" data-module-id="${sub.id}">
                        <i class="nav-icon ${sub.icon}"></i>
                        <p>${sub.name}</p>
                    </a>`;
                
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

        } else {
            li.innerHTML = `
                <a href="#" class="nav-link" data-module-id="${module.id}">
                    <i class="nav-icon ${module.icon}"></i>
                    <p>${module.name}</p>
                </a>`;

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

    // Menüdeki aktifliği ayarla
    document.querySelectorAll('.sidebar .nav-link').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar a[data-module-id="${moduleId}"]`);
    if(activeLink) {
        activeLink.classList.add('active');
        const parentTree = activeLink.closest('.has-treeview');
        if (parentTree) {
             // AdminLTE'nin kendi mekanizması açıp kapatacağı için biz sadece aktif sınıfı veriyoruz
            if (!parentTree.classList.contains('menu-open')) {
                 // Eğer AdminLTE js'i yüklendiyse, bu tıklama menüyü açacaktır.
                 // Ancak script'in bunu yönetmesi daha doğrudur. 
                 // Genellikle sadece 'active' sınıfı vermek yeterlidir.
                 parentTree.querySelector('a').classList.add('active');
            }
        }
    }
    
    const container = document.getElementById('module-container');
    const title = document.getElementById('module-title');
    container.innerHTML = `<div class="d-flex justify-content-center align-items-center" style="min-height: 200px;">
                                <div class="spinner-border text-primary" role="status">
                                    <span class="sr-only">Yükleniyor...</span>
                                </div>
                                <b class="ml-3">${module.name} yükleniyor...</b>
                           </div>`;
    title.innerHTML = `<i class="${module.icon}"></i> ${module.name}`;
    
    try {
        const htmlResponse = await fetch(`${module.path}${module.id}.html`);
        if (!htmlResponse.ok) throw new Error(`Dosya bulunamadı: ${module.id}.html`);
        container.innerHTML = await htmlResponse.text();

        // Eski modül stilini kaldır (opsiyonel, eğer çakışma olursa)
        const oldCss = document.querySelector('link[id^="module-css-"]');
        if (oldCss) oldCss.remove();

        // Yeni modül CSS'ini ekle
        const link = document.createElement('link');
        link.id = `module-css-${module.id}`;
        link.rel = 'stylesheet';
        link.href = `${module.path}${module.id}.css`;
        document.head.appendChild(link);
        
        // Eski modül script'ini kaldır
        const oldScript = document.getElementById('module-script');
        if (oldScript) oldScript.remove();
        
        // Yeni modül script'ini ekle
        const script = document.createElement('script');
        script.id = 'module-script';
        script.src = `${module.path}${module.id}.js`;
        script.onload = () => {
            const formattedId = module.id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
            const initFunctionName = `initialize${formattedId}Module`;
            if (typeof window[initFunctionName] === 'function') {
                window[initFunctionName]();
            } else {
                console.warn(`Başlatma fonksiyonu bulunamadı: ${initFunctionName}`);
            }
        };
        document.body.appendChild(script);

    } catch (error) {
        container.innerHTML = `<div class="alert alert-danger"><b>Hata!</b> Modül yüklenirken bir sorun oluştu. <br><small>${error.message}</small></div>`;
        console.error("Modül yüklenirken hata oluştu:", error);
    }
}


function updateAuthUI(user) {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    if (user) {
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
        loginPopup.style.display = 'none';
    } else {
        loginToggleBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'none';
    }
}
function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    // Giriş yapılmış ve Firebase'e bağlı ise 'Bağlı' durumuna geç
    const isOnline = isFirebaseConnected && auth.currentUser;
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}

// --- GÜNCELLENEN OLAY DİNLEYİCİLERİ ---
function setupEventListeners() {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    // Giriş yap butonuna tıklandığında popup'ı göster/gizle
    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation(); 
        loginPopup.style.display = loginPopup.style.display === 'flex' ? 'none' : 'flex';
    });
    
    // Çıkış yap butonu
    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });

    // Popup içindeki onayla butonu ile giriş yapma
    loginSubmitBtn.addEventListener('click', () => {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';
        
        if (!email || !password) {
            errorDiv.textContent = 'Lütfen tüm alanları doldurun.';
            return;
        }

        auth.signInWithEmailAndPassword(email, password)
            .then(() => {
                loginPopup.style.display = 'none';
                // Başarılı giriş sonrası sayfa yenilenmesine gerek yok, onAuthStateChanged tetiklenecek
            })
            .catch(error => {
                errorDiv.textContent = 'E-posta veya şifre hatalı.';
            });
    });

    // Sayfanın herhangi bir yerine tıklandığında popup'ı kapat
    window.addEventListener('click', function(event) {
        if (!loginPopup.contains(event.target) && event.target !== loginToggleBtn) {
            loginPopup.style.display = 'none';
        }
    });
}