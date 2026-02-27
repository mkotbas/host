// --- mkotbas/host/host-main/fide/admin/admin.js ---

const modules = [
    {
        id: 'denetim-takip',
        name: 'Denetim Takip',
        icon: 'fas fa-calendar-check',
        path: '../modules/denetim-takip/'
    },
    {
        id: 'calisma-takvimi', // Takvim modülü listeye eklendi
        name: 'Çalışma Takvimi',
        icon: 'fas fa-calendar-alt',
        path: '../modules/calisma-takvimi/'
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

let currentModuleId = null;

window.onload = initializeAdminPanel;

async function initializeAdminPanel() {
    const isLoggedIn = pb.authStore.isValid;
    const userRole = isLoggedIn ? pb.authStore.model.role : null;

    updateAuthUI(isLoggedIn);
    updateConnectionIndicator(isLoggedIn);

    if (userRole === 'admin' || userRole === 'client') {
        renderModuleMenu(userRole);
        if (!currentModuleId) {
            loadModule('denetim-takip');
        }
        subscribeToAdminChanges();
    } else {
        document.getElementById('module-menu').innerHTML = '';
        const container = document.getElementById('module-container');
        container.innerHTML = `<div style="text-align: center; padding: 50px; color: #dc3545;"><i class="fas fa-exclamation-triangle fa-3x"></i><h2>Erişim Reddedildi</h2><p>Lütfen sisteme giriş yapın.</p></div>`;
    }
    setupEventListeners();
}

function renderModuleMenu(userRole) {
    const menu = document.getElementById('module-menu');
    menu.innerHTML = ''; 

    const accessibleModules = userRole === 'admin' ? modules : modules.filter(m => m.id === 'denetim-takip');

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
                    loadModule(sub.id);
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
                loadModule(module.id);
            });
        }
        menu.appendChild(li);
    });
}

async function loadModule(moduleId) {
    let module;
    for (const main of modules) {
        if (main.id === moduleId) { module = main; break; }
        if (main.submenu) {
            const sub = main.submenu.find(s => s.id === moduleId);
            if (sub) { module = sub; break; }
        }
    }
    if (!module) return;

    currentModuleId = moduleId;
    document.querySelectorAll('.sidebar-menu a').forEach(a => a.classList.remove('active'));
    const activeLink = document.querySelector(`.sidebar-menu a[data-module-id="${moduleId}"]`);
    if(activeLink) activeLink.classList.add('active');

    const container = document.getElementById('module-container');
    const title = document.getElementById('module-title');
    container.innerHTML = `<p style="padding:20px; color:#3b82f6;"><i class="fas fa-spinner fa-spin"></i> Modül yükleniyor...</p>`;
    title.innerHTML = `<i class="${module.icon}"></i> ${module.name}`;

    try {
        const htmlResponse = await fetch(`${module.path}${module.id}.html`);
        if (!htmlResponse.ok) throw new Error(`${module.id}.html dosyası bulunamadı.`);
        container.innerHTML = await htmlResponse.text();

        const cssId = `module-css-${module.id}`;
        if (!document.getElementById(cssId)) {
            const link = document.createElement('link');
            link.id = cssId;
            link.rel = 'stylesheet';
            link.href = `${module.path}${module.id}.css`;
            document.head.appendChild(link);
        }

        const formattedId = module.id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
        const initFunctionName = `initialize${formattedId}Module`;
        const moduleExports = await import(`${module.path}${module.id}.js?v=${new Date().getTime()}`);
        
        if (typeof moduleExports[initFunctionName] === 'function') {
            moduleExports[initFunctionName](pb);
        }
    } catch (error) {
        console.error("Yükleme hatası:", error);
        container.innerHTML = `<div style="padding:20px; color:#ef4444;"><i class="fas fa-exclamation-circle"></i> Modül yüklenemedi: ${error.message}</div>`;
    }
}

function subscribeToAdminChanges() {
    if (!pb || !pb.authStore.isValid) return;
    pb.collection('users').subscribe(pb.authStore.model.id, (e) => {
        if (e.record && e.record.is_banned) {
            alert("Hesabınız kilitlendi.");
            pb.authStore.clear();
            window.location.reload();
        }
    });
}

function updateAuthUI(isLoggedIn) {
    document.getElementById('login-toggle-btn').style.display = isLoggedIn ? 'none' : 'inline-flex';
    document.getElementById('logout-btn').style.display = isLoggedIn ? 'inline-flex' : 'none';
}

function updateConnectionIndicator(isLoggedIn) {
    const statusSwitch = document.getElementById('connection-status-switch');
    statusSwitch.classList.toggle('connected', isLoggedIn);
    statusSwitch.classList.toggle('disconnected', !isLoggedIn);
    document.getElementById('connection-status-text').textContent = isLoggedIn ? 'Buluta Bağlı' : 'Bağlı Değil';
}

function setupEventListeners() {
    document.getElementById('login-toggle-btn').onclick = (e) => {
        e.stopPropagation();
        const popup = document.getElementById('login-popup');
        popup.style.display = popup.style.display === 'block' ? 'none' : 'block';
    };
    document.getElementById('logout-btn').onclick = () => { pb.authStore.clear(); window.location.reload(); };
    document.getElementById('login-submit-btn').onclick = async () => {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;
        try {
            await pb.collection('users').authWithPassword(email, password);
            window.location.reload();
        } catch (e) { alert("E-posta veya şifre hatalı."); }
    };
}