// --- Global Değişkenler ve Ayarlar ---

// Sisteme eklenecek modüllerin listesi.
// Yeni bir modül eklemek için bu listeye yeni bir nesne eklemek yeterli olacaktır.
const modules = [
    {
        id: 'veritabani',
        name: 'Veritabanı Modülü',
        icon: 'fas fa-database'
    },
    // Gelecekteki modüller buraya eklenecek...
    // { id: 'soru-yoneticisi', name: 'Soru Yöneticisi', icon: 'fas fa-tasks' },
];

let isFirebaseConnected = false;
let activeModule = null; // Aktif olarak yüklenmiş modülün bilgisini tutar

// --- Ana Uygulama Mantığı ---
window.onload = initializeAdminPanel;

function initializeAdminPanel() {
    // Firebase yetkilendirme durumunu LOCAL'de kalıcı yap
    firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
        .then(() => {
            // Yetkilendirme durumu değişikliğini dinle
            firebase.auth().onAuthStateChanged(user => {
                if (user) {
                    // Kullanıcı giriş yapmışsa
                    isFirebaseConnected = true;
                    document.getElementById('login-toggle-btn').style.display = 'none';
                    document.getElementById('logout-btn').style.display = 'block';
                    document.getElementById('login-popup').style.display = 'none';
                    populateSidebar(); // Modül menüsünü oluştur
                } else {
                    // Kullanıcı giriş yapmamışsa
                    isFirebaseConnected = false;
                    document.getElementById('login-toggle-btn').style.display = 'block';
                    document.getElementById('logout-btn').style.display = 'none';
                    clearModuleContent(); // İçeriği temizle
                    document.getElementById('module-menu').innerHTML = ''; // Menüyü temizle
                }
                updateConnectionIndicator();
            });
        });

    setupEventListeners();
}

// --- Arayüz Fonksiyonları ---

function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = isFirebaseConnected && firebase.auth().currentUser;

    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}

function populateSidebar() {
    const menu = document.getElementById('module-menu');
    menu.innerHTML = ''; // Menüyü temizle

    modules.forEach(module => {
        const menuItem = document.createElement('li');
        menuItem.className = 'module-menu-item';
        menuItem.dataset.moduleId = module.id;

        menuItem.innerHTML = `
            <a href="#">
                <i class="${module.icon}"></i>
                <span>${module.name}</span>
            </a>
        `;
        menu.appendChild(menuItem);
    });
}


function clearModuleContent() {
    document.getElementById('module-title').textContent = 'Modül Yöneticisi';
    document.querySelector('#module-header i').className = 'fas fa-cogs';
    document.getElementById('module-body').innerHTML = '<p>Lütfen yönetmek istediğiniz bir modülü sol menüden seçin.</p>';
    document.getElementById('module-styles').innerHTML = '';
    
    // Varsa eski modül script'ini tamamen kaldır
    const oldScript = document.getElementById('module-script-tag');
    if(oldScript) {
        oldScript.remove();
    }
}

// --- Modül Yükleme Fonksiyonu ---

async function loadModule(moduleId) {
    if (activeModule === moduleId) return; // Zaten aktif olan modüle tıklanırsa bir şey yapma

    const moduleData = modules.find(m => m.id === moduleId);
    if (!moduleData) {
        console.error(`'${moduleId}' id'li modül bulunamadı.`);
        return;
    }

    // Önceki modül içeriğini temizle
    clearModuleContent();

    // Yeni modül başlığını ve ikonunu ayarla
    document.getElementById('module-title').textContent = moduleData.name;
    document.querySelector('#module-header i').className = moduleData.icon;
    document.getElementById('module-body').innerHTML = '<p><i class="fas fa-spinner fa-spin"></i> Modül yükleniyor...</p>';

    // Menüdeki aktif durumu güncelle
    document.querySelectorAll('.module-menu-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.moduleId === moduleId) {
            item.classList.add('active');
        }
    });

    try {
        // Modülün HTML, CSS ve JS dosyalarını al
        const [html, css, js] = await Promise.all([
            fetch(`../modules/${moduleId}/${moduleId}.html`).then(res => res.ok ? res.text() : ''),
            fetch(`../modules/${moduleId}/${moduleId}.css`).then(res => res.ok ? res.text() : ''),
            fetch(`../modules/${moduleId}/${moduleId}.js`).then(res => res.ok ? res.text() : '')
        ]);

        // İlgili alanlara yükle
        document.getElementById('module-body').innerHTML = html;
        document.getElementById('module-styles').innerHTML = css;

        // Modülün JS'ini bir script etiketi oluşturarak sayfaya ekle
        // Bu, modülün kendi kapsamı içinde çalışmasını sağlar
        const scriptTag = document.createElement('script');
        scriptTag.id = 'module-script-tag';
        scriptTag.textContent = js;
        document.body.appendChild(scriptTag);
        
        // Modülün JS'i içinde `initializeModule` adında bir fonksiyon olduğunu varsayıyoruz.
        // Bu fonksiyon, modül yüklendikten sonra çalıştırılacak.
        if (window.initializeModule) {
            window.initializeModule();
        }

        activeModule = moduleId;

    } catch (error) {
        console.error(`Modül yüklenirken hata oluştu: ${moduleId}`, error);
        document.getElementById('module-body').innerHTML = '<p style="color: red;">Modül yüklenirken bir hata oluştu. Lütfen konsolu kontrol edin.</p>';
    }
}

// --- Olay Dinleyicileri (Event Listeners) ---

function setupEventListeners() {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const moduleMenu = document.getElementById('module-menu');

    // Modül menüsü tıklamaları
    moduleMenu.addEventListener('click', (event) => {
        const menuItem = event.target.closest('.module-menu-item');
        if (menuItem && menuItem.dataset.moduleId) {
            loadModule(menuItem.dataset.moduleId);
        }
    });
    
    // Giriş/Çıkış butonları
    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });

    logoutBtn.addEventListener('click', () => {
        firebase.auth().signOut();
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

        firebase.auth().signInWithEmailAndPassword(email, password)
            .catch(error => {
                errorDiv.textContent = 'E-posta veya şifre hatalı.';
            });
    });

    // Pop-up dışına tıklayınca kapat
    window.addEventListener('click', function(event) {
        if (!loginPopup.contains(event.target) && !loginToggleBtn.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });
}