document.addEventListener('DOMContentLoaded', () => {

    // --- GLOBAL DEĞİŞKENLER VE MODÜL TANIMLAMALARI ---

    // Sisteme eklenecek olan tüm modüller bu liste üzerinden yönetilecek.
    // Yeni bir modül eklemek istediğimizde buraya yeni bir nesne eklememiz yeterli olacak.
    const modules = [
        {
            id: 'veritabani',
            name: 'Veritabanı Ayarları',
            icon: 'fas fa-database',
            html: '../modules/veritabani/veritabani.html',
            css: '../modules/veritabani/veritabani.css',
            js: '../modules/veritabani/veritabani.js'
        }
        // Gelecekteki modüller buraya eklenecek...
    ];

    const moduleMenu = document.getElementById('module-menu');
    const moduleContainer = document.getElementById('module-container');
    let isFirebaseConnected = false;


    // --- MODÜL YÖNETİMİ ---

    /**
     * Tanımlı modülleri sol menüye (sidebar) ekler ve tıklama olaylarını ayarlar.
     */
    function renderModuleMenu() {
        moduleMenu.innerHTML = ''; // Menüyü temizle
        modules.forEach(module => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="#" data-module-id="${module.id}">
                              <i class="${module.icon}"></i>
                              <span>${module.name}</span>
                            </a>`;
            moduleMenu.appendChild(li);
        });
    }

    /**
     * ID'si verilen modülü ana içerik alanına yükler.
     * @param {string} moduleId Yüklenecek modülün ID'si
     */
    async function loadModule(moduleId) {
        const module = modules.find(m => m.id === moduleId);
        if (!module) {
            console.error(`'${moduleId}' ID'li modül bulunamadı.`);
            moduleContainer.innerHTML = '<p>Hata: Modül yüklenemedi.</p>';
            return;
        }

        try {
            // 1. Önceki modülün stillerini ve script'lerini kaldır
            document.getElementById('module-style')?.remove();
            document.getElementById('module-script')?.remove();

            // 2. Modülün HTML içeriğini yükle
            const response = await fetch(module.html);
            if (!response.ok) throw new Error(`HTML dosyası yüklenemedi: ${response.statusText}`);
            moduleContainer.innerHTML = await response.text();

            // 3. Modülün CSS dosyasını <head> içine ekle
            const styleLink = document.createElement('link');
            styleLink.id = 'module-style';
            styleLink.rel = 'stylesheet';
            styleLink.href = module.css;
            document.head.appendChild(styleLink);

            // 4. Modülün JS dosyasını <body> sonuna ekle
            const scriptElement = document.createElement('script');
            scriptElement.id = 'module-script';
            scriptElement.src = module.js;
            scriptElement.defer = true;
            document.body.appendChild(scriptElement);

            // 5. Aktif menü öğesini güncelle
            updateActiveMenu(moduleId);

        } catch (error) {
            console.error(`Modül yüklenirken hata oluştu: `, error);
            moduleContainer.innerHTML = `<div class="module-placeholder">
                                            <i class="fas fa-exclamation-triangle fa-3x"></i>
                                            <h2>Modül Yüklenemedi</h2>
                                            <p>${module.name} modülü yüklenirken bir sorun oluştu. Lütfen konsolu kontrol edin.</p>
                                         </div>`;
        }
    }
    
    /**
     * Sol menüde aktif olan modülün görsel olarak işaretlenmesini sağlar.
     * @param {string} moduleId Aktif olan modülün ID'si
     */
    function updateActiveMenu(moduleId) {
        const menuLinks = moduleMenu.querySelectorAll('a');
        menuLinks.forEach(link => {
            link.classList.remove('active');
            if (link.dataset.moduleId === moduleId) {
                link.classList.add('active');
            }
        });
    }


    // --- FIREBASE AUTH VE BAĞLANTI YÖNETİMİ (Ana uygulamadan uyarlandı) ---
    
    function setupAuthAndConnection() {
        const auth = firebase.auth();
        const database = firebase.database();

        // Bağlantı durumunu izle
        const connectionRef = database.ref('.info/connected');
        connectionRef.on('value', (snapshot) => {
            isFirebaseConnected = snapshot.val();
            updateConnectionIndicator(auth.currentUser);
        });

        // Kullanıcı giriş/çıkış durumunu izle
        auth.onAuthStateChanged(user => {
            updateConnectionIndicator(user);
            const loginToggleBtn = document.getElementById('login-toggle-btn');
            const logoutBtn = document.getElementById('logout-btn');
            
            if (user) {
                loginToggleBtn.style.display = 'none';
                logoutBtn.style.display = 'inline-flex';
            } else {
                loginToggleBtn.style.display = 'inline-flex';
                logoutBtn.style.display = 'none';
                // Kullanıcı çıkış yaptıysa, modül içeriğini temizle ve başlangıç ekranını göster.
                moduleContainer.innerHTML = `<div class="module-placeholder">
                                                <i class="fas fa-cogs fa-3x"></i>
                                                <h2>Modül Yöneticisi</h2>
                                                <p>Lütfen yönetmek istediğiniz bir modülü sol menüden seçin.</p>
                                             </div>`;
                updateActiveMenu(null);
            }
        });

        // Butonlara olay dinleyicileri ekle
        document.getElementById('login-toggle-btn').addEventListener('click', (event) => {
            event.stopPropagation();
            const loginPopup = document.getElementById('login-popup');
            loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
        });

        document.getElementById('logout-btn').addEventListener('click', () => {
            auth.signOut();
        });

        document.getElementById('login-submit-btn').addEventListener('click', () => {
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

        window.addEventListener('click', (event) => {
            if (!document.getElementById('auth-controls').contains(event.target)) {
                document.getElementById('login-popup').style.display = 'none';
            }
        });
    }

    /**
     * Ekranın sol alt köşesindeki bağlantı durumu göstergesini günceller.
     * @param {object|null} user Mevcut Firebase kullanıcısı
     */
    function updateConnectionIndicator(user) {
        const statusSwitch = document.getElementById('connection-status-switch');
        const statusText = document.getElementById('connection-status-text');
        const isOnline = isFirebaseConnected && user;
        
        statusSwitch.classList.toggle('connected', isOnline);
        statusSwitch.classList.toggle('disconnected', !isOnline);
        statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
    }


    // --- UYGULAMAYI BAŞLATMA ---

    function initializeAdminPanel() {
        renderModuleMenu();
        setupAuthAndConnection();

        // Menüdeki linklere tıklama olayını ata
        moduleMenu.addEventListener('click', (e) => {
            const link = e.target.closest('a');
            if (link && link.dataset.moduleId) {
                e.preventDefault();
                if (firebase.auth().currentUser) {
                    loadModule(link.dataset.moduleId);
                } else {
                    alert("Lütfen modülleri görüntülemek için giriş yapın.");
                }
            }
        });
    }

    initializeAdminPanel();
});