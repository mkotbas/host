// --- Global Değişkenler ---
let currentModule = null; // Aktif olarak yüklenmiş modülün adını tutar

// --- Firebase Yapılandırması (Ana uygulamadaki ile aynı) ---
const auth = firebase.auth();
const database = firebase.database();
let isFirebaseConnected = false;

// --- Uygulama Başlatma ---
document.addEventListener('DOMContentLoaded', () => {
    initializeAuth();
    setupModuleMenuListeners();
});

/**
 * Firebase Authentication durumunu dinler ve arayüzü günceller.
 */
function initializeAuth() {
    auth.onAuthStateChanged(user => {
        const loginToggleBtn = document.getElementById('login-toggle-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const loginPopup = document.getElementById('login-popup');
        
        if (user) {
            // Kullanıcı giriş yapmış
            loginToggleBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-flex';
            loginPopup.style.display = 'none';
        } else {
            // Kullanıcı çıkış yapmış
            loginToggleBtn.style.display = 'inline-flex';
            logoutBtn.style.display = 'none';
        }
        updateConnectionIndicator();
    });

    // Bağlantı durumunu dinle
    const connectionRef = database.ref('.info/connected');
    connectionRef.on('value', (snapshot) => {
        isFirebaseConnected = snapshot.val();
        updateConnectionIndicator();
    });

    // Login/Logout buton olayları
    setupAuthEventListeners();
}

/**
 * Giriş/Çıkış butonları için olay dinleyicilerini kurar.
 */
function setupAuthEventListeners() {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });

    logoutBtn.addEventListener('click', () => {
        auth.signOut();
    });

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
            .catch(error => {
                errorDiv.textContent = 'E-posta veya şifre hatalı.';
            });
    });

    window.addEventListener('click', function(event) {
        if (loginPopup && !loginPopup.contains(event.target) && !loginToggleBtn.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });
}


/**
 * Sol menüdeki modül linkleri için tıklama olaylarını ayarlar.
 */
function setupModuleMenuListeners() {
    const moduleLinks = document.querySelectorAll('#module-menu a[data-module]');
    moduleLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const moduleName = link.getAttribute('data-module');

            // Aktif menü öğesini güncelle
            document.querySelectorAll('#module-menu a').forEach(a => a.classList.remove('active'));
            link.classList.add('active');
            
            loadModule(moduleName);
        });
    });
}

/**
 * İstenen modülün HTML, CSS ve JS dosyalarını dinamik olarak yükler.
 * @param {string} moduleName - Yüklenecek modülün adı (örn: "veritabani")
 */
async function loadModule(moduleName) {
    if (currentModule === moduleName && document.getElementById(`module-${moduleName}-script`)) return; // Modül zaten yüklü
    currentModule = moduleName;

    const mainContent = document.getElementById('main-content');
    mainContent.innerHTML = '<div class="loading-spinner"></div>'; // Yükleniyor animasyonu

    // Önceki modülün stil dosyasını kaldır
    const oldStyle = document.querySelector('link[data-module-style]');
    if (oldStyle) {
        oldStyle.remove();
    }
    
    // Önceki modülün script'ini kaldır (opsiyonel, ama temiz bir başlangıç için iyi)
    const oldScript = document.querySelector('script[data-module-script]');
    if(oldScript) {
        oldScript.remove();
    }


    try {
        // 1. Modülün HTML'ini yükle
        const htmlResponse = await fetch(`modules/${moduleName}/${moduleName}.html`);
        if (!htmlResponse.ok) throw new Error(`${moduleName} HTML dosyası yüklenemedi.`);
        const htmlContent = await htmlResponse.text();
        mainContent.innerHTML = htmlContent;

        // 2. Modülün CSS'ini yükle
        const cssLink = document.createElement('link');
        cssLink.rel = 'stylesheet';
        cssLink.href = `modules/${moduleName}/${moduleName}.css`;
        cssLink.setAttribute('data-module-style', 'true'); // Kaldırmak için işaretle
        document.head.appendChild(cssLink);

        // 3. Modülün JS'ini yükle
        const script = document.createElement('script');
        script.src = `modules/${moduleName}/${moduleName}.js`;
        script.id = `module-${moduleName}-script`; // Scriptin zaten var olup olmadığını kontrol etmek için
        script.setAttribute('data-module-script', 'true'); // Kaldırmak için işaretle
        document.body.appendChild(script);

    } catch (error) {
        mainContent.innerHTML = `<div class="error-message">Modül yüklenirken bir hata oluştu: ${error.message}</div>`;
        console.error(error);
    }
}


/**
 * Bağlantı durumu göstergesini (switch) günceller.
 */
function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    if (!statusSwitch || !statusText) return;

    const isOnline = isFirebaseConnected && auth.currentUser;
    
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}