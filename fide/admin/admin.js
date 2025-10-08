// --- Modül Tanımlamaları (Alt Menü Destekli Yeni Yapı) ---
const modules = [
    {
        id: 'denetim-takip',
        name: 'Denetim Takip',
        icon: 'fas fa-calendar-check',
        path: '../modules/denetim-takip/'
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
            // Gelecekte bu ana menünün altına başka alt menüler eklenebilir
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
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    auth.onAuthStateChanged(user => {
        updateAuthUI(user);
        updateConnectionIndicator();
        if (user) {
            renderModuleMenu();
            if (!currentModuleId) {
                loadModule('denetim-takip');
            }
        } else {
            document.getElementById('module-menu').innerHTML = '';
            document.getElementById('module-container').innerHTML = '<p>Lütfen panele erişmek için giriş yapın.</p>';
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

// --- ALT MENÜ DESTEKLİ YENİ MENÜ OLUŞTURUCU ---
function renderModuleMenu() {
    const menu = document.getElementById('module-menu');
    menu.innerHTML = ''; 

    modules.forEach(module => {
        const li = document.createElement('li');
        
        if (module.submenu) {
            // Alt menüsü olan ana menü
            li.classList.add('has-submenu');
            li.innerHTML = `<a href="#"><i class="${module.icon}"></i><span>${module.name}</span></a>`;
            const subMenu = document.createElement('ul');
            subMenu.className = 'submenu';
            
            module.submenu.forEach(sub => {
                const subLi = document.createElement('li');
                subLi.innerHTML = `<a href="#" data-module-id="${sub.id}"><i class="${sub.icon}"></i><span>${sub.name}</span></a>`;
                subLi.querySelector('a').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation(); // Ana menünün tıklama olayını tetiklemesini engelle
                    if (currentModuleId !== sub.id) {
                        loadModule(sub.id);
                    }
                });
                subMenu.appendChild(subLi);
            });
            
            li.appendChild(subMenu);

            // Ana menüye tıklama olayı (aç/kapa)
            li.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                li.classList.toggle('open');
                subMenu.classList.toggle('open');
            });

        } else {
            // Normal (alt menüsü olmayan) menü
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


async function loadModule(moduleId) {
    // Bu fonksiyon artık hem ana hem de alt menülerden gelen ID'leri bulabilir.
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

    // Aktif menü stillerini ayarla
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-menu a[data-module-id="${moduleId}"]`);
    if(activeLink) {
        activeLink.classList.add('active');
        // Eğer bir alt menüdeyse, ana menüsünü de 'open' yap
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
        console.error("Modül yüklenirken hata oluştu:", error);
    }
}

// updateAuthUI, updateConnectionIndicator, setupEventListeners fonksiyonları değişmemiştir.
function updateAuthUI(user) {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    if (user) {
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
    } else {
        loginToggleBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'none';
    }
}
function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = isFirebaseConnected && auth.currentUser;
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}
function setupEventListeners() {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    loginToggleBtn.addEventListener('click', () => {
        alert('Giriş yapmak için lütfen ana sayfaya dönün.');
        window.location.href = '../index.html';
    });
    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });
}