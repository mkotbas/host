// --- YENİ: PocketBase Yapılandırması ---
const pb = new PocketBase('http://127.0.0.1:8090');

// --- Modül Tanımlamaları ---
const modules = [
    {
        id: 'denetim-takip',
        name: 'Denetim Takip',
        icon: 'fas fa-calendar-check',
        path: 'modules/denetim-takip/'
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
                path: 'modules/eposta-taslagi/'
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
                name: 'E-posta & Bayi Sistemi',
                icon: 'fas fa-at',
                path: 'modules/bayi-yoneticisi/'
            }
        ]
    },
    {
        id: 'soru-yoneticisi',
        name: 'Soru Yöneticisi',
        icon: 'fas fa-tasks',
        path: 'modules/soru-yoneticisi/'
    }
];

// --- Ana Panel Mantığı ---
document.addEventListener('DOMContentLoaded', () => {
    // PocketBase'in oturum durumunu dinle
    pb.authStore.onChange((token, model) => {
        updateAuthUI(model);
        updateConnectionIndicator();
        renderSidebarMenu(); // Menüyü yetki durumuna göre yeniden çiz
        // Eğer giriş yapılmamışsa, modül içeriğini temizle
        if (!model) {
            clearModuleContainer();
        }
    }, true); // `true` ile sayfa yüklenir yüklenmez durumu kontrol et
    
    setupAuthEventListeners();
});


function renderSidebarMenu() {
    const menu = document.getElementById('module-menu');
    menu.innerHTML = '';
    
    // Sadece giriş yapılmışsa menüyü göster
    if (!pb.authStore.isValid) {
        menu.innerHTML = '<li class="sidebar-menu-item disabled-menu">Modülleri görmek için lütfen giriş yapın.</li>';
        return;
    }
    
    modules.forEach(module => {
        const li = document.createElement('li');
        li.className = 'sidebar-menu-item';

        if (module.submenu) {
            li.innerHTML = `
                <a href="#" class="menu-link has-submenu">
                    <i class="${module.icon}"></i>
                    <span>${module.name}</span>
                    <i class="fas fa-chevron-right submenu-arrow"></i>
                </a>
                <ul class="submenu">
                    ${module.submenu.map(sub => `
                        <li class="submenu-item" data-module-id="${sub.id}" data-module-path="${sub.path}" data-module-name="${sub.name}">
                            <a href="#"><i class="${sub.icon}"></i> <span>${sub.name}</span></a>
                        </li>
                    `).join('')}
                </ul>
            `;
            const submenu = li.querySelector('.submenu');
            li.querySelector('.menu-link').addEventListener('click', (e) => {
                e.preventDefault();
                li.classList.toggle('active');
            });

        } else {
            li.innerHTML = `
                <a href="#" class="menu-link" data-module-id="${module.id}" data-module-path="${module.path}" data-module-name="${module.name}">
                    <i class="${module.icon}"></i>
                    <span>${module.name}</span>
                </a>
            `;
        }
        menu.appendChild(li);
    });

    // Menüdeki tüm modül linklerine olay dinleyicisi ekle
    menu.querySelectorAll('[data-module-id]').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const moduleId = item.dataset.moduleId;
            const modulePath = item.dataset.modulePath;
            const moduleName = item.dataset.moduleName;
            loadModule(moduleId, modulePath, moduleName);
        });
    });
}

async function loadModule(id, path, name) {
    const container = document.getElementById('module-container');
    const title = document.getElementById('module-title');
    const loadingOverlay = document.getElementById('loading-overlay');
    
    loadingOverlay.style.display = 'flex';
    title.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${name} Yükleniyor...`;

    try {
        const response = await fetch(`${path}${id}.html`);
        if (!response.ok) throw new Error(`HTML dosyası yüklenemedi: ${response.statusText}`);
        container.innerHTML = await response.text();

        // CSS dosyasını yükle
        loadCss(`${path}${id}.css`);
        
        // JS dosyasını yükle ve başlatıcı fonksiyonu çağır
        await loadScript(`${path}${id}.js`);
        
        // Modülün başlatıcı fonksiyonunu çağır (Örn: initializeSoruYoneticisiModule)
        const initFunctionName = `initialize${id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, '')}Module`;
        if (typeof window[initFunctionName] === 'function') {
            await window[initFunctionName]();
        } else {
            console.warn(`${initFunctionName} fonksiyonu bulunamadı.`);
        }
        
        title.innerHTML = `<i class="${getModuleIcon(id)}"></i> ${name}`;

    } catch (error) {
        console.error(`Modül yüklenirken hata oluştu: ${id}`, error);
        container.innerHTML = `<p class="error-message">Hata: '${name}' modülü yüklenemedi. Dosya yollarını kontrol edin.</p>`;
        title.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Yükleme Hatası`;
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function clearModuleContainer() {
    document.getElementById('module-container').innerHTML = '<p>Lütfen yönetmek istediğiniz bir modülü sol menüden seçin veya panele giriş yapın.</p>';
    document.getElementById('module-title').innerHTML = `<i class="fas fa-tachometer-alt"></i> Modül Yöneticisi`;
}

// --- Yetkilendirme (Auth) Fonksiyonları ---

function setupAuthEventListeners() {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const loginPopup = document.getElementById('login-popup');

    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });
    
    logoutBtn.addEventListener('click', () => {
        pb.authStore.clear(); // PocketBase'den çıkış yap
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
            showLoading(true);
            await pb.admins.authWithPassword(email, password);
            // Başarılı giriş sonrası `onChange` tetiklenecek, menü ve arayüz güncellenecek.
            loginPopup.style.display = 'none';
        } catch (error) {
            errorDiv.textContent = 'E-posta veya şifre hatalı.';
            console.error('Giriş hatası:', error);
        } finally {
            showLoading(false);
        }
    });
    
    // Popup dışına tıklayınca kapat
    window.addEventListener('click', (event) => {
        if (!document.getElementById('auth-controls').contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });
}

function updateAuthUI(user) {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');

    if (user) { // Kullanıcı giriş yapmışsa
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'block';
        loginPopup.style.display = 'none';
    } else { // Kullanıcı çıkış yapmışsa
        loginToggleBtn.style.display = 'block';
        logoutBtn.style.display = 'none';
    }
}


// --- Yardımcı Fonksiyonlar ---

function updateConnectionIndicator() {
    const switchDiv = document.getElementById('connection-status-switch');
    const textSpan = document.getElementById('connection-status-text');
    if (pb.authStore.isValid) {
        switchDiv.classList.remove('disconnected');
        switchDiv.classList.add('connected');
        textSpan.textContent = "Bağlandı";
    } else {
        switchDiv.classList.remove('disconnected');
        switchDiv.classList.add('disconnected');
        textSpan.textContent = "Bağlı Değil";
    }
}

function showLoading(show) {
    const loadingOverlay = document.getElementById('loading-overlay');
    if(loadingOverlay) {
        loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        // Eğer script zaten yüklenmişse tekrar yükleme
        const existingScript = document.querySelector(`script[src="${src}"]`);
        if (existingScript) {
            existingScript.remove(); // Eskisini kaldır ki yenisi temiz yüklensin
        }
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Script yüklenemedi: ${src}`));
        document.body.appendChild(script);
    });
}

function loadCss(href) {
    const existingLink = document.querySelector(`link[href="${href}"]`);
    if (existingLink) {
       return; // Zaten varsa tekrar ekleme
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
}

function getModuleIcon(id) {
    for (const module of modules) {
        if (module.id === id) return module.icon;
        if (module.submenu) {
            const sub = module.submenu.find(s => s.id === id);
            if (sub) return sub.icon;
        }
    }
    return 'fas fa-question-circle'; // Varsayılan ikon
}