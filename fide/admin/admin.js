// --- Modül Tanımlamaları (Yeni Tasarıma Göre) ---
const modules = [
    {
        id: 'dashboard',
        name: 'Logistics Dashboard',
        icon: 'fa-solid fa-chart-pie',
        path: '../modules/dashboard/' // Örnek yol, kendinize göre değiştirin
    },
    {
        id: 'fleet-management',
        name: 'Fleet Management',
        icon: 'fa-solid fa-truck',
        path: '../modules/fleet-management/'
    },
    {
        id: 'warehouse-inventory',
        name: 'Warehouse Inventory',
        icon: 'fa-solid fa-warehouse',
        path: '../modules/warehouse-inventory/'
    },
    {
        id: 'orders-income',
        name: 'Orders & Income',
        icon: 'fa-solid fa-file-invoice-dollar',
        path: '../modules/orders-income/'
    },
    {
        id: 'reports',
        name: 'Reports',
        icon: 'fa-solid fa-chart-line',
        path: '../modules/reports/'
    },
    {
        id: 'settings',
        name: 'Settings',
        icon: 'fa-solid fa-cog',
        path: '../modules/settings/'
    }
];

// --- Global Değişkenler ---
let currentModuleId = null;

// --- Uygulama Başlatma ---
window.onload = initializeAdminPanel;

function initializeAdminPanel() {
    // Giriş kontrolü ve diğer başlangıç işlemleri burada kalabilir
    // Şimdilik direkt menüyü ve varsayılan modülü yüklüyoruz
    renderModuleMenu();
    
    // Varsayılan olarak 'dashboard' modülünü seçili hale getir
    // Eğer dashboard içeriği HTML'de statikse bu satırı kaldırabilirsiniz
    if (!currentModuleId) {
        // loadModule('dashboard'); // İlk başta boş gelmesi isteniyorsa bu satır açılabilir
        // Şimdilik HTML'e gömülü olduğu için ilk yüklemeyi pas geçiyoruz
        currentModuleId = 'dashboard';
        const initialActiveLink = document.querySelector(`.sidebar-menu a[data-module-id="dashboard"]`);
        if (initialActiveLink) {
            initialActiveLink.classList.add('active');
        }
    }
}

// --- Menüyü Oluşturan Fonksiyon ---
function renderModuleMenu() {
    const menu = document.getElementById('module-menu');
    menu.innerHTML = ''; 

    modules.forEach(module => {
        const li = document.createElement('li');
        
        // Bu tasarımda alt menü yok, istenirse eklenebilir.
        li.innerHTML = `
            <a href="#" data-module-id="${module.id}">
                <i class="${module.icon}"></i>
                <span>${module.name}</span>
            </a>`;
            
        li.querySelector('a').addEventListener('click', (e) => {
            e.preventDefault();
            if (currentModuleId !== module.id) {
                loadModule(module.id);
            }
        });
        
        menu.appendChild(li);
    });
}

// --- Modül Yükleyici Fonksiyon ---
async function loadModule(moduleId) {
    const module = modules.find(m => m.id === moduleId);

    if (!module) { 
        console.error("Modül bulunamadı:", moduleId); 
        return; 
    }

    currentModuleId = moduleId;

    // Menüdeki aktif durumu güncelle
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-menu a[data-module-id="${moduleId}"]`);
    if (activeLink) {
        activeLink.classList.add('active');
    }
    
    const container = document.getElementById('module-container');
    const title = document.getElementById('module-title');
    
    // Yükleniyor... mesajı
    container.innerHTML = `<p>Modül yükleniyor: ${module.name}...</p>`;
    title.innerHTML = `<i class="${module.icon}"></i> ${module.name}`;
    
    try {
        // İlgili modülün HTML dosyasını çek ve içeriği bas
        const htmlResponse = await fetch(`${module.path}${module.id}.html`);
        if (!htmlResponse.ok) throw new Error(`HTML dosyası bulunamadı: ${module.id}.html`);
        container.innerHTML = await htmlResponse.text();

        // Modüle özel CSS dosyasını yükle (daha önce yüklenmediyse)
        const cssId = `module-css-${module.id}`;
        if (!document.getElementById(cssId)) {
            const link = document.createElement('link');
            link.id = cssId;
            link.rel = 'stylesheet';
            link.href = `${module.path}${module.id}.css`;
            document.head.appendChild(link);
        }

        // Modüle özel JS dosyasını yükle
        const oldScript = document.getElementById('module-script');
        if (oldScript) oldScript.remove(); // Önceki modülün script'ini kaldır
        
        const script = document.createElement('script');
        script.id = 'module-script';
        script.src = `${module.path}${module.id}.js`;
        
        // Script yüklendikten sonra başlatma fonksiyonunu çalıştır
        script.onload = () => {
            // Örn: initializeDashboardModule() gibi bir fonksiyonu çalıştırır
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
        container.innerHTML = `<p>Modül yüklenirken bir hata oluştu. Lütfen konsolu kontrol edin.</p>`;
    }
}