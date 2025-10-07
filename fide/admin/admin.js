// --- Modül Tanımlamaları ---
const modules = [
    {
        id: 'veritabani',
        name: 'Veritabanı Modülü',
        icon: 'fas fa-database',
        path: '../modules/veritabani/'
    },
    {
        id: 'soru-yoneticisi',
        name: 'Soru Yöneticisi',
        icon: 'fas fa-edit',
        path: '../modules/soru-yoneticisi/'
    }
];

// --- Global Değişkenler ---
let isFirebaseConnected = false;
let currentModuleId = null;

// --- Uygulama Başlatma ---
window.onload = initializeAdminPanel;

async function initializeAdminPanel() {
    // Kullanıcının isteği üzerine oturum kalıcılığı 'session' olarak ayarlandı.
    // Bu ayar, tarayıcı kapatıldığında oturumun otomatik olarak sona ermesini sağlar.
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);

    auth.onAuthStateChanged(user => {
        updateAuthUI(user);
        updateConnectionIndicator();
        if (user) {
            renderModuleMenu();
        } else {
            document.getElementById('module-menu').innerHTML = '';
            document.getElementById('module-container').innerHTML = '<p>Lütfen panele erişmek için giriş yapın.</p>';
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

function renderModuleMenu() {
    const menu = document.getElementById('module-menu');
    menu.innerHTML = ''; 

    modules.forEach(module => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="#" data-module-id="${module.id}"><i class="${module.icon}"></i> ${module.name}</a>`;
        li.querySelector('a').addEventListener('click', (event) => {
            event.preventDefault();
            if (currentModuleId !== module.id) {
                loadModule(module.id);
            }
        });
        menu.appendChild(li);
    });

    const styleId = 'module-menu-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            .sidebar-menu li a {
                display: block; padding: 12px 15px; color: var(--secondary-text); text-decoration: none;
                border-radius: 6px; transition: var(--transition); font-weight: 500;
            }
            .sidebar-menu li a:hover {
                background-color: var(--bg-dark-accent); color: var(--primary-text);
            }
            .sidebar-menu li a.active {
                background-color: var(--primary-accent); color: var(--primary-text); font-weight: 600;
            }
        `;
        document.head.appendChild(style);
    }
}

async function loadModule(moduleId) {
    const module = modules.find(m => m.id === moduleId);
    if (!module) {
        console.error("Modül bulunamadı:", moduleId);
        return;
    }

    currentModuleId = moduleId;

    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    document.querySelector(`.sidebar-menu a[data-module-id="${moduleId}"]`).classList.add('active');

    const container = document.getElementById('module-container');
    const title = document.getElementById('module-title');
    
    container.innerHTML = `<p>Modül yükleniyor: ${module.name}...</p>`;
    title.innerHTML = `<i class="${module.icon}"></i> ${module.name}`;
    
    try {
        const htmlResponse = await fetch(`${module.path}${module.id}.html`);
        if (!htmlResponse.ok) throw new Error(`Dosya bulunamadı veya okunamadı: ${module.id}.html (HTTP ${htmlResponse.status})`);
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
            const initFunctionName = `initialize${module.id.charAt(0).toUpperCase() + module.id.slice(1).replace(/-/g, '')}Module`;
            if (typeof window[initFunctionName] === 'function') {
                window[initFunctionName]();
            } else {
                console.warn(`Başlatma fonksiyonu bulunamadı: ${initFunctionName}`);
            }
        };
        document.body.appendChild(script);

    } catch (error) {
        console.error("Modül yüklenirken hata oluştu:", error);
        container.innerHTML = `
            <div style="color: #fca5a5; background-color: #450a0a; border: 1px solid #991b1b; border-radius: 8px; padding: 15px;">
                <p style="font-weight: bold; font-size: 16px;">"${module.name}" yüklenirken bir hata oluştu.</p>
                <p style="font-size: 12px; margin-top: 10px; color: #fda4af;">Sunucunuzda dosya yolu, dosya izni veya başka bir konfigürasyon sorunu olabilir.</p>
                <hr style="border-color: #991b1b; margin: 15px 0;">
                <p style="font-size: 12px; font-family: monospace; color: #fecaca;"><b>Teknik Hata Detayı:</b><br>${error.toString()}</p>
            </div>
        `;
    }
}

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