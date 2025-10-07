// --- UYGULAMA BAŞLANGICI ---
// Sayfa tamamen yüklendiğinde ana fonksiyonu çalıştır
window.addEventListener('DOMContentLoaded', initializeAdminPanel);

// --- GLOBAL DEĞİŞKENLER ---
let isFirebaseConnected = false;
let currentModule = null; // Şu anki aktif modülün adını tutar

/**
 * Yönetim panelini başlatan ana fonksiyon.
 * Event listener'ları ayarlar ve Firebase durumunu dinler.
 */
function initializeAdminPanel() {
    setupEventListeners();
    initializeFirebase();
}

/**
 * Firebase servislerini başlatır ve kullanıcı oturum durumunu dinler.
 */
function initializeFirebase() {
    if (typeof firebase === 'undefined') {
        console.error("Firebase kütüphanesi bulunamadı. Lütfen firebase-config.js dosyasını kontrol edin.");
        updateConnectionIndicator();
        return;
    }
    
    // Kullanıcının oturum açma/kapama durumlarını dinle
    firebase.auth().onAuthStateChanged(user => {
        updateAuthUI(user);
        updateConnectionIndicator();
        
        if (user) {
            // Kullanıcı giriş yapmışsa, varsayılan modülü yükle
            const defaultModuleLink = document.querySelector('.sidebar-nav .nav-link.active');
            if (defaultModuleLink) {
                const moduleName = defaultModuleLink.dataset.module;
                loadModule(moduleName);
            }
        } else {
            // Kullanıcı giriş yapmamışsa, içeriği temizle ve giriş yapmasını iste
            clearModuleContent("Lütfen panele erişim için giriş yapın.");
        }
    });

    // Veritabanı bağlantı durumunu dinle
    const connectionRef = firebase.database().ref('.info/connected');
    connectionRef.on('value', (snapshot) => {
        isFirebaseConnected = snapshot.val();
        updateConnectionIndicator();
    });
}

/**
 * Paneldeki tüm tıklama ve diğer olayları dinleyicilere atar.
 */
function setupEventListeners() {
    // Sol menüdeki modül linklerine tıklanma olayları
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', (event) => {
            event.preventDefault(); // Sayfanın yeniden yüklenmesini engelle
            if (!firebase.auth().currentUser) {
                alert("Modülleri görüntülemek için lütfen giriş yapın.");
                return;
            }
            const moduleName = link.dataset.module;
            loadModule(moduleName);

            // Tıklanan linki aktif yap
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Giriş/Çıkış Butonları
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    loginToggleBtn.addEventListener('click', () => {
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });

    logoutBtn.addEventListener('click', () => {
        firebase.auth().signOut();
    });

    loginSubmitBtn.addEventListener('click', handleLogin);
    
    // Popup dışına tıklanınca kapatma
     window.addEventListener('click', function(event) {
        const sidebarFooter = document.querySelector('.sidebar-footer');
        if (sidebarFooter && !sidebarFooter.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });
}

/**
 * Modülleri dinamik olarak yükleyen ana fonksiyon (Orkestra Şefi).
 * @param {string} moduleName Yüklenecek modülün adı (örn: "database")
 */
async function loadModule(moduleName) {
    if (currentModule === moduleName) return; // Aynı modül tekrar yüklenmesin

    const contentArea = document.getElementById('module-content');
    const title = document.getElementById('module-title');
    const moduleStyleTag = document.getElementById('module-styles');
    
    // Önceki modülün script'ini kaldır
    const oldScript = document.getElementById('module-script');
    if (oldScript) oldScript.remove();

    // Yükleniyor... mesajı
    contentArea.innerHTML = '<div class="placeholder"><i class="fas fa-spinner fa-spin fa-2x"></i><p>Modül Yükleniyor...</p></div>';
    title.textContent = "Yükleniyor...";
    moduleStyleTag.innerHTML = '';
    currentModule = moduleName;

    try {
        const htmlPath = `../modules/${moduleName}/${moduleName}.html`;
        const cssPath = `../modules/${moduleName}/${moduleName}.css`;
        const jsPath = `../modules/${moduleName}/${moduleName}.js`;

        // HTML, CSS ve JS dosyalarını aynı anda çek
        const [htmlRes, cssRes] = await Promise.all([
            fetch(htmlPath),
            fetch(cssPath)
        ]);

        if (!htmlRes.ok) throw new Error(`${moduleName}.html dosyası bulunamadı.`);
        
        // HTML içeriğini bas
        contentArea.innerHTML = await htmlRes.text();
        
        // CSS içeriğini bas (sadece dosya varsa)
        if(cssRes.ok) {
            moduleStyleTag.innerHTML = await cssRes.text();
        }

        // JS dosyasını yeni bir script etiketi olarak ekle
        const script = document.createElement('script');
        script.id = 'module-script';
        script.src = jsPath;
        script.defer = true;
        document.body.appendChild(script);

        // Modül başlığını güncelle
        const navLink = document.querySelector(`.nav-link[data-module="${moduleName}"] span`);
        title.textContent = navLink ? navLink.textContent : "Modül";

    } catch (error) {
        console.error("Modül yükleme hatası:", error);
        contentArea.innerHTML = `<div class="placeholder"><i class="fas fa-exclamation-triangle fa-2x" style="color:var(--danger)"></i><p>Modül yüklenirken bir hata oluştu. Lütfen konsolu kontrol edin.</p></div>`;
        title.textContent = "Hata";
        currentModule = null; // Hata durumunda modülü sıfırla
    }
}


// --- YARDIMCI FONKSİYONLAR ---

/**
 * Kullanıcı giriş yaptığında arayüzü günceller.
 * @param {object|null} user Firebase kullanıcı nesnesi veya null
 */
function updateAuthUI(user) {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');

    if (user) {
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'flex';
        loginPopup.style.display = 'none';
    } else {
        loginToggleBtn.style.display = 'flex';
        logoutBtn.style.display = 'none';
    }
}

/**
 * Sol alttaki bulut bağlantı göstergesini günceller.
 */
function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const user = firebase.auth().currentUser;
    const isOnline = isFirebaseConnected && user;

    statusSwitch.className = isOnline ? 'connected' : 'disconnected';
    
    if (user) {
        statusText.textContent = isFirebaseConnected ? 'Buluta Bağlı' : 'Bağlantı Kesildi';
    } else {
        statusText.textContent = 'Giriş Yapılmadı';
    }
}

/**
 * E-posta ve şifre ile giriş yapma işlemini gerçekleştirir.
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

    firebase.auth().signInWithEmailAndPassword(email, password)
        .catch(error => {
            errorDiv.textContent = 'E-posta veya şifre hatalı.';
            console.error("Giriş Hatası:", error);
        });
}

/**
 * Modül içerik alanını temizler ve bir mesaj gösterir.
 * @param {string} message Gösterilecek mesaj.
 */
function clearModuleContent(message) {
    const contentArea = document.getElementById('module-content');
    const title = document.getElementById('module-title');
    
    contentArea.innerHTML = `<div class="placeholder"><i class="fas fa-lock fa-3x"></i><p>${message}</p></div>`;
    title.textContent = 'Yönetim Paneli';
    currentModule = null;
}