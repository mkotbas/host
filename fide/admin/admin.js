// --- Global Değişkenler ---
let isFirebaseConnected = false;
let currentModuleScript = null; // Halihazırda yüklenmiş modül script'ini takip etmek için

// --- Ana Uygulama Mantığı ---
window.onload = initializeAdminPanel;

/**
 * Yönetim panelini başlatan ana fonksiyon.
 */
async function initializeAdminPanel() {
    // Firebase'in oturum bilgilerini yerel olarak saklamasını sağlar.
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    // Kullanıcının giriş/çıkış durumundaki değişiklikleri dinler.
    auth.onAuthStateChanged(user => {
        updateAuthUI(user);
        setupEventListeners();
    });

    // Firebase veritabanı bağlantı durumunu dinler.
    if (database) {
        const connectionRef = database.ref('.info/connected');
        connectionRef.on('value', (snapshot) => {
            isFirebaseConnected = snapshot.val();
            updateConnectionIndicator();
        });
    }
}

/**
 * Kullanıcının oturum durumuna göre arayüzü (butonlar, göstergeler) günceller.
 * @param {object|null} user - Firebase'den gelen kullanıcı nesnesi.
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
 * Sayfadaki tüm olay dinleyicilerini (buton tıklamaları vb.) ayarlar.
 * Sadece bir kere çalışmasını sağlamak için body'e bir işaret koyar.
 */
function setupEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const loginPopup = document.getElementById('login-popup');

    // Giriş yap butonuna tıklandığında açılır pencereyi göster/gizle
    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });

    // Çıkış yap butonuna tıklandığında oturumu kapat ve sayfayı yenile
    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => window.location.reload());
    });

    // Açılır penceredeki onayla butonuna tıklandığında giriş yapmayı dene
    loginSubmitBtn.addEventListener('click', handleLogin);

    // Açılır pencere dışına tıklandığında pencereyi kapat
    window.addEventListener('click', (event) => {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });

    // Sol menüdeki modül linklerine tıklama olaylarını ekle
    document.querySelectorAll('.nav-menu a[data-module]').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); // href="#"'in sayfayı yukarı kaydırmasını engelle
            const moduleName = e.currentTarget.dataset.module;
            loadModule(moduleName, e.currentTarget);
        });
    });
}

/**
 * Kullanıcı adı ve şifre ile Firebase'e giriş yapmayı dener.
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
 * Belirtilen modülün HTML ve JS dosyalarını dinamik olarak yükler.
 * @param {string} moduleName - Yüklenecek modülün adı (örn: "database-manager").
 * @param {HTMLElement} clickedLink - Tıklanan menü linki elemanı.
 */
async function loadModule(moduleName, clickedLink) {
    const contentArea = document.getElementById('module-content');
    
    // Önceki modülün script'ini kaldırarak çakışmaları önle
    if (currentModuleScript) {
        document.body.removeChild(currentModuleScript);
        currentModuleScript = null;
    }

    // Menüdeki aktif link stilini güncelle
    document.querySelectorAll('.nav-menu a.active').forEach(link => link.classList.remove('active'));
    clickedLink.classList.add('active');

    // Modül dosyalarının yollarını belirle (Örn: database-manager -> database.html)
    const moduleBaseName = moduleName.split('-')[0];
    const htmlPath = `../modules/${moduleName}/${moduleBaseName}.html`;
    const jsPath = `../modules/${moduleName}/${moduleBaseName}.js`;

    contentArea.innerHTML = `<div class="placeholder"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Yükleniyor...</p></div>`;

    try {
        // Modülün HTML içeriğini çek ve ekrana bas
        const response = await fetch(htmlPath);
        if (!response.ok) throw new Error(`HTML dosyası bulunamadı: ${response.statusText}`);
        const htmlContent = await response.text();
        contentArea.innerHTML = htmlContent;

        // Modülün JavaScript dosyasını yeni bir script etiketi oluşturarak yükle ve çalıştır
        // Bu yöntem, script'in doğru şekilde çalışmasını sağlar.
        const script = document.createElement('script');
        script.src = jsPath;
        script.onerror = () => { throw new Error('JS dosyası yüklenemedi.'); };
        currentModuleScript = script; // Yeni script'i takip et
        document.body.appendChild(script);

    } catch (error) {
        console.error(`Modül yükleme hatası (${moduleName}):`, error);
        contentArea.innerHTML = `<div class="placeholder"><i class="fas fa-exclamation-triangle fa-2x" style="color:var(--danger-color)"></i><p>Modül yüklenirken bir hata oluştu.</p><small>${error.message}</small></div>`;
    }
}