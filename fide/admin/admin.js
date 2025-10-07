// --- Global Değişkenler ---
let isFirebaseConnected = false;
let currentModuleScript = null; // Halihazırda yüklenmiş modül script'ini takip etmek için
let currentModuleStyle = null; // Halihazırda yüklenmiş modül stilini takip etmek için

// --- Ana Uygulama Mantığı ---
window.onload = initializeAdminPanel;

/**
 * Yönetim panelini başlatan ana fonksiyon.
 */
async function initializeAdminPanel() {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    auth.onAuthStateChanged(user => {
        updateAuthUI(user);
        setupEventListeners();
    });

    if (database) {
        const connectionRef = database.ref('.info/connected');
        connectionRef.on('value', (snapshot) => {
            isFirebaseConnected = snapshot.val();
            updateConnectionIndicator();
        });
    }
}

/**
 * Kullanıcının oturum durumuna göre arayüzü günceller.
 */
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
    updateConnectionIndicator();
}

/**
 * Firebase bağlantı durumuna göre görsel göstergeyi günceller.
 */
function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = isFirebaseConnected && auth.currentUser;

    if (statusSwitch && statusText) {
        statusSwitch.classList.toggle('connected', isOnline);
        statusSwitch.classList.toggle('disconnected', !isOnline);
        statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
    }
}

/**
 * Olay dinleyicilerini ayarlar.
 */
function setupEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const loginPopup = document.getElementById('login-popup');

    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });

    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => window.location.reload());
    });

    loginSubmitBtn.addEventListener('click', handleLogin);

    window.addEventListener('click', (event) => {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });

    document.querySelectorAll('.nav-menu a[data-module]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const moduleName = e.currentTarget.dataset.module;
            loadModule(moduleName, e.currentTarget);
        });
    });
}

/**
 * Firebase'e giriş yapmayı dener.
 */
function handleLogin() {
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
            document.getElementById('login-popup').style.display = 'none';
            window.location.reload();
        })
        .catch(error => {
            errorDiv.textContent = 'E-posta veya şifre hatalı.';
            console.error("Giriş Hatası:", error);
        });
}

/**
 * Belirtilen modülün HTML, JS ve CSS dosyalarını dinamik olarak yükler.
 */
async function loadModule(moduleName, clickedLink) {
    const contentArea = document.getElementById('module-content');
    
    // Önceki modülün script ve stil dosyalarını kaldırarak çakışmaları önle
    if (currentModuleScript) {
        document.body.removeChild(currentModuleScript);
        currentModuleScript = null;
    }
    if (currentModuleStyle) {
        document.head.removeChild(currentModuleStyle);
        currentModuleStyle = null;
    }

    document.querySelectorAll('.nav-menu a.active').forEach(link => link.classList.remove('active'));
    clickedLink.classList.add('active');

    const moduleBaseName = moduleName.split('-')[0];
    const htmlPath = `../modules/${moduleName}/${moduleBaseName}.html`;
    const jsPath = `../modules/${moduleName}/${moduleBaseName}.js`;
    const cssPath = `../modules/${moduleName}/${moduleBaseName}.css`;

    contentArea.innerHTML = `<div class="placeholder"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Yükleniyor...</p></div>`;

    try {
        // Modülün CSS dosyasını yükle
        const styleLink = document.createElement('link');
        styleLink.id = 'module-style';
        styleLink.rel = 'stylesheet';
        styleLink.href = cssPath;
        document.head.appendChild(styleLink);
        currentModuleStyle = styleLink;
        
        // Modülün HTML içeriğini çek ve ekrana bas
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`HTML dosyası bulunamadı: ${response.statusText}`);
        const htmlContent = await response.text();
        contentArea.innerHTML = htmlContent;

        // Modülün JavaScript dosyasını yükle ve çalıştır
        const script = document.createElement('script');
        script.src = jsPath;
        script.onerror = () => { throw new Error('JS dosyası yüklenemedi.'); };
        currentModuleScript = script;
        document.body.appendChild(script);

    } catch (error) {
        console.error(`Modül yükleme hatası (${moduleName}):`, error);
        contentArea.innerHTML = `<div class="placeholder"><i class="fas fa-exclamation-triangle fa-2x" style="color:var(--danger-color)"></i><p>Modül yüklenirken bir hata oluştu.</p><small>${error.message}</small></div>`;
    }
}