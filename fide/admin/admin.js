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
        id: 'bayi-yoneticisi-parent', // Ana menü olduğu için benzersiz bir ID
        name: 'Bayi Yöneticisi',
        icon: 'fas fa-store',
        submenu: [
            {
                id: 'bayi-bilgileri', // YENİ EKLENDİ
                name: 'Bayi Bilgileri',
                icon: 'fas fa-file-excel',
                path: '../modules/bayi-bilgileri/'
            },
            {
                id: 'bayi-yoneticisi', // Bu artık E-posta Sistemi oldu
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
let isPocketBaseConnected = false;
let currentModuleId = null;

// --- Uygulama Başlatma ---
window.onload = initializeAdminPanel;

async function initializeAdminPanel() {
    // PocketBase'in giriş durumunu kontrol et
    const userIsValid = pb.authStore.isValid;

    updateAuthUI(userIsValid);
    updateConnectionIndicator(userIsValid);

    if (userIsValid) {
        renderModuleMenu();
        // Varsayılan olarak 'denetim-takip' modülünü yükle
        if (!currentModuleId) {
            loadModule('denetim-takip');
        }
    } else {
        document.getElementById('module-menu').innerHTML = '';
        document.getElementById('module-container').innerHTML = '<p>Lütfen panele erişmek için giriş yapın.</p>';
        document.getElementById('module-title').innerHTML = '<i class="fas fa-tachometer-alt"></i> Modül Yöneticisi';
    }
    setupEventListeners();
}

// --- ALT MENÜ DESTEKLİ MENÜ OLUŞTURUCU (DEĞİŞİKLİK YOK) ---
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

// --- MODÜL YÜKLEYİCİ (DEĞİŞİKLİK YOK) ---
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
        
        const script = document.createElement('script');
        script.id = 'module-script';
        script.src = `${module.path}${module.id}.js`;
        script.onload = () => {
            const formattedId = module.id.split('-').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
            const initFunctionName = `initialize${formattedId}Module`;
            if (typeof window[initFunctionName] === 'function') {
                // Modülün kendi JS dosyasındaki başlatma fonksiyonunu çağırıyoruz.
                // Bu fonksiyonun PocketBase'den gelen `pb` nesnesini kullanabilmesi için `pb`'yi parametre olarak gönderiyoruz.
                window[initFunctionName](pb);
            } else {
                console.warn(`Başlatma fonksiyonu bulunamadı: ${initFunctionName}`);
            }
        };
        document.body.appendChild(script);

    } catch (error) {
        console.error("Modül yüklenirken hata oluştu:", error);
        container.innerHTML = `<p style="color: red;">'${module.name}' modülü yüklenemedi. Dosyaların doğru yerde olduğundan emin olun.</p>`;
    }
}

// --- ARAYÜZ GÜNCELLEME FONKSİYONLARI ---
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
    isPocketBaseConnected = isLoggedIn; // Bağlantı durumunu giriş durumuna bağlıyoruz.
    
    statusSwitch.classList.toggle('connected', isPocketBaseConnected);
    statusSwitch.classList.toggle('disconnected', !isPocketBaseConnected);
    statusText.textContent = isPocketBaseConnected ? 'Buluta Bağlı' : 'Bağlı Değil';
}

// --- POCKETBASE İÇİN GÜNCELLENEN OLAY DİNLEYİCİLERİ ---
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
        pb.authStore.clear(); // PocketBase'den çıkış yap
        window.location.reload(); // Sayfayı yenile
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
            // PocketBase'de "users" veya "admins" collection'ına göre giriş yapılır.
            // Yönetici paneli olduğu için "admins" kullanmak daha mantıklı olabilir.
            // Şimdilik "users" ile devam edelim, gerekirse değiştiririz.
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