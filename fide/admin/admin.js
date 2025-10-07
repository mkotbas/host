// --- Global Değişkenler ---
let isFirebaseConnected = false;

// --- Uygulama Başlatma ---
window.onload = initializeAdminPanel;

/**
 * Yönetim panelini başlatan ana fonksiyon.
 * Firebase kimlik doğrulama durumunu dinler ve gerekli olayları bağlar.
 */
async function initializeAdminPanel() {
    // Firebase'in kullanıcı oturumunu tarayıcıda kalıcı yapmasını sağlar.
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

    // Kullanıcı giriş/çıkış yaptığında tetiklenecek fonksiyonları ayarlar.
    auth.onAuthStateChanged(user => {
        updateAuthUI(user);
        updateConnectionIndicator();
    });

    // Firebase veritabanı bağlantı durumunu dinler.
    if (database) {
        const connectionRef = database.ref('.info/connected');
        connectionRef.on('value', (snapshot) => {
            isFirebaseConnected = snapshot.val();
            updateConnectionIndicator();
        });
    }

    setupEventListeners();
    // Gelecekte modülleri buraya yükleyeceğiz.
    // renderModuleMenu(); 
}

/**
 * Kullanıcının giriş durumuna göre arayüzü (UI) günceller.
 * @param {object|null} user - Firebase'den gelen kullanıcı nesnesi veya null.
 */
function updateAuthUI(user) {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');

    if (user) {
        // Kullanıcı giriş yapmışsa
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
    } else {
        // Kullanıcı giriş yapmamışsa
        loginToggleBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'none';
    }
}

/**
 * Sol alttaki bağlantı durumu göstergesini günceller.
 * Hem Firebase bağlantısı hem de kullanıcı girişi kontrol edilir.
 */
function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = isFirebaseConnected && auth.currentUser;
    
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}


/**
 * Paneldeki butonlar için olay dinleyicilerini (event listener) ayarlar.
 */
function setupEventListeners() {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');

    loginToggleBtn.addEventListener('click', () => {
        // Ana sayfaya yönlendirerek giriş yapmasını sağlıyoruz.
        alert('Giriş yapmak için lütfen ana sayfaya dönün.');
        window.location.href = '../index.html';
    });

    logoutBtn.addEventListener('click', () => {
        auth.signOut().then(() => {
            // Çıkış yapıldıktan sonra arayüz güncellenir.
            console.log('Başarıyla çıkış yapıldı.');
        }).catch(error => {
            console.error('Çıkış yaparken hata oluştu:', error);
        });
    });
}

/**
 * (GELECEKTE KULLANILACAK)
 * Belirtilen modülün HTML, CSS ve JS dosyalarını dinamik olarak yükler.
 * @param {string} moduleId - Yüklenecek modülün kimliği (örn: 'veritabani').
 */
async function loadModule(moduleId) {
    const container = document.getElementById('module-container');
    const title = document.getElementById('module-title');
    
    container.innerHTML = `<p>Modül yükleniyor: ${moduleId}...</p>`;
    title.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Yükleniyor...`;

    // Bu fonksiyonun içini ilerleyen adımlarda dolduracağız.
    console.log(`'${moduleId}' modülünü yükleme fonksiyonu çağrıldı.`);
}