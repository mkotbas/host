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
let isPocketBaseConnected = false;
let currentModuleId = null;

// --- Uygulama Başlatma ---
window.onload = initializeAdminPanel;

async function initializeAdminPanel() {
    // PocketBase'de bu adıma gerek yok, SDK oturumu kendi yönetir.
    // Kullanıcının giriş durumuna göre arayüzü güncelliyoruz.
    const isLoggedIn = pb.authStore.isValid;
    updateAuthUI(isLoggedIn);
    await checkConnection(); // Bağlantıyı kontrol et
    
    if (isLoggedIn) {
        renderModuleMenu();
        // Eğer daha önce bir modül seçilmemişse, varsayılanı yükle
        if (!currentModuleId) {
            loadModule('denetim-takip');
        }
    } else {
        // Kullanıcı giriş yapmamışsa menüyü ve modül alanını temizle
        document.getElementById('module-menu').innerHTML = '';
        document.getElementById('module-container').innerHTML = '<p>Lütfen panele erişmek için giriş yapın.</p>';
        document.getElementById('module-title').innerHTML = '<i class="fas fa-tachometer-alt"></i> Modül Yöneticisi';
    }

    // Olay dinleyicilerini (buton tıklamaları vb.) ayarla
    setupEventListeners();
}

// PocketBase bağlantısını kontrol eden fonksiyon
async function checkConnection() {
    try {
        // Sunucunun sağlık durumunu kontrol eden basit bir istek atıyoruz.
        await pb.health.check();
        isPocketBaseConnected = true;
    } catch (error) {
        console.error("PocketBase sunucusuna bağlanılamadı.", error);
        isPocketBaseConnected = false;
    }
    // Göstergeyi güncelle
    updateConnectionIndicator();
}


// --- ALT MENÜ DESTEKLİ YENİ MENÜ OLUŞTURUCU ---
// Bu fonksiyonda veritabanı bağlantısı olmadığı için değişiklik yapılmadı.
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

// Bu fonksiyonda veritabanı bağlantısı olmadığı için değişiklik yapılmadı.
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

// Arayüzü kullanıcının giriş durumuna göre güncelleyen fonksiyon
function updateAuthUI(isLoggedIn) {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    if (isLoggedIn) {
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
        loginPopup.style.display = 'none';
    } else {
        loginToggleBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'none';
    }
}

// Bağlantı göstergesini güncelleyen fonksiyon
function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    // Artık hem sunucu bağlantısını hem de kullanıcı girişini kontrol ediyoruz
    const isOnline = isPocketBaseConnected && pb.authStore.isValid;
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
        event.stopPropagation(); // Olayın dışarıya yayılmasını engelle
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });
    
    // Çıkış yap butonu
    logoutBtn.addEventListener('click', () => {
        // PocketBase'den çıkış yap
        pb.authStore.clear();
        // Sayfayı yenileyerek arayüzü güncelle
        window.location.reload();
    });

    // Popup içindeki onayla butonu ile giriş yapma
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
            // PocketBase 'users' collection'ı ile giriş denemesi
            await pb.collection('users').authWithPassword(email, password);
            // Başarılı giriş sonrası sayfayı yenileyerek modüllerin yüklenmesini sağla
            window.location.reload();
        } catch (error) {
            console.error("Giriş hatası:", error);
            errorDiv.textContent = 'E-posta veya şifre hatalı.';
        }
    });

    // Sayfanın herhangi bir yerine tıklandığında popup'ı kapat
    window.addEventListener('click', function(event) {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });
}