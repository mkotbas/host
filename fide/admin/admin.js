// --- Modül Tanımlamaları (SİZİN PROJENİZE AİT YAPI KORUNDU) ---
const modules = [
    {
        id: 'denetim-takip',
        name: 'Denetim Takip',
        icon: 'fas fa-calendar-check',
        path: '../modules/denetim-takip/'
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
        id: 'bayi-yoneticisi-parent', 
        name: 'Bayi Yöneticisi',
        icon: 'fas fa-store',
        submenu: [
            {
                id: 'bayi-yoneticisi',
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
let currentModuleId = null;

// --- Uygulama Başlatma ---
window.onload = initializeAdminPanel;

function initializeAdminPanel() {
    renderModuleMenu();
    // Varsayılan olarak ilk modülü yükle
    if (!currentModuleId) {
        // Alt menüsü olmayan ilk modülü bul ve yükle
        const firstModule = modules.find(m => !m.submenu);
        if (firstModule) {
            loadModule(firstModule.id);
        }
    }
}

// --- Menüyü Oluşturan Fonksiyon (ALT MENÜ DESTEKLİ) ---
function renderModuleMenu() {
    const menu = document.getElementById('module-menu');
    menu.innerHTML = ''; 

    modules.forEach(module => {
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
                    e.stopPropagation(); // Ana menünün tıklama olayını tetiklemesin
                    if (currentModuleId !== sub.id) {
                        loadModule(sub.id);
                    }
                });
                subMenu.appendChild(subLi);
            });
            
            li.appendChild(subMenu);

            // Ana menüye tıklayınca alt menüyü aç/kapat
            li.querySelector('a').addEventListener('click', (e) => {
                e.preventDefault();
                li.classList.toggle('open');
                subMenu.classList.toggle('open');
            });

        } else {
            // Alt menüsü olmayan normal menü elemanı
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

// --- Modül Yükleyici Fonksiyon ---
async function loadModule(moduleId) {
    let module;
    let parentModule;

    // Yüklenecek modülü ve ana menüsünü bul
    for (const main of modules) {
        if (main.id === moduleId) {
            module = main;
            break;
        }
        if (main.submenu) {
            const sub = main.submenu.find(s => s.id === moduleId);
            if (sub) {
                module = sub;
                parentModule = main;
                break;
            }
        }
    }

    if (!module) { 
        console.error("Modül bulunamadı:", moduleId); 
        return; 
    }

    currentModuleId = moduleId;

    // Menüdeki aktif durumu güncelle
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-menu a[data-module-id="${moduleId}"]`);
    if(activeLink) {
        activeLink.classList.add('active');
        // Eğer bir alt menü elemanıysa, ana menüsünü de açık tut
        const parentLi = activeLink.closest('.has-submenu');
        if (parentLi && !parentLi.classList.contains('open')) {
            parentLi.classList.add('open');
            parentLi.querySelector('.submenu').classList.add('open');
        }
    }
    
    const container = document.getElementById('module-container');
    const title = document.getElementById('module-title');
    
    container.innerHTML = `<p>Modül yükleniyor: ${module.name}...</p>`;
    // Üst başlığı ana modülün adıyla güncelle, daha estetik durur
    const titleModule = parentModule || module;
    title.innerHTML = `<i class="${titleModule.icon}"></i> ${titleModule.name}`;
    
    try {
        const htmlResponse = await fetch(`${module.path}${module.id}.html`);
        if (!htmlResponse.ok) throw new Error(`HTML dosyası bulunamadı: ${module.id}.html`);
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
            }
        };
        document.body.appendChild(script);

    } catch (error) {
        console.error("Modül yüklenirken hata oluştu:", error);
        container.innerHTML = `<p>Modül yüklenirken bir hata oluştu.</p>`;
    }
}