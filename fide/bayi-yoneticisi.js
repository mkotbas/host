// --- Global Değişkenler ---
let storeEmails = {};
let isFirebaseConnected = false;

// --- Ana Uygulama Mantığı ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    if (typeof auth === 'undefined') {
        console.error("Firebase auth başlatılamadı. db-config.js yüklendiğinden emin olun.");
        return;
    }
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    auth.onAuthStateChanged(async user => { 
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
        await loadStoreEmails();
        setupEventListeners();
        renderEmailManager();
    });
}

async function loadStoreEmails() {
    // 1. Önce yerel hafızadan veriyi anında yükle ve göster
    const storedEmails = localStorage.getItem('fideStoreEmails');
    if (storedEmails) {
        storeEmails = JSON.parse(storedEmails);
        renderEmailManager(); // Yerel veriyle arayüzü hemen çiz
    }

    // 2. Arka planda buluttan güncel veriyi çek
    const user = auth.currentUser;
    if (user && database) {
        try {
            const emailsRef = database.ref('storeEmails');
            const snapshot = await emailsRef.once('value');
            if (snapshot.exists()) {
                const cloudEmails = snapshot.val();
                // Sadece veriler farklıysa güncelle, kaydet ve arayüzü yeniden çiz
                if (JSON.stringify(storeEmails) !== JSON.stringify(cloudEmails)) {
                    console.log("Daha güncel e-posta listesi buluttan yüklendi.");
                    storeEmails = cloudEmails;
                    localStorage.setItem('fideStoreEmails', JSON.stringify(storeEmails));
                    renderEmailManager(); // Arayüzü yeni veriyle güncelle
                }
            }
        } catch (error) {
            console.error("Buluttan bayi e-postaları yüklenemedi:", error);
        }
    } else if (!storedEmails && !user) {
         alert("E-posta listesi yüklenemedi. Lütfen internet bağlantınızı kontrol edip sisteme giriş yapın.");
    }
    
    if (database) {
        const connectionRef = database.ref('.info/connected');
        connectionRef.on('value', (snapshot) => {
            isFirebaseConnected = snapshot.val();
            updateConnectionIndicator();
        });
    }
}

function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = isFirebaseConnected && auth.currentUser;
    
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}

function setupEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';
    
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });
    logoutBtn.addEventListener('click', () => { auth.signOut().then(() => window.location.reload()); });
    loginSubmitBtn.addEventListener('click', () => {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';
        if (!email || !password) { errorDiv.textContent = 'Lütfen tüm alanları doldurun.'; return; }
        auth.signInWithEmailAndPassword(email, password)
            .then(() => { loginPopup.style.display = 'none'; })
            .catch(error => { errorDiv.textContent = 'E-posta veya şifre hatalı.'; });
    });

    window.addEventListener('click', function(event) {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });

    document.getElementById('bulk-upload-emails-btn').addEventListener('click', () => document.getElementById('email-bulk-upload-input').click());
    document.getElementById('email-bulk-upload-input').addEventListener('change', handleBulkEmailUpload);
    document.getElementById('add-new-email-btn').addEventListener('click', addNewEmailUI);
    document.getElementById('email-search-input').addEventListener('keyup', () => renderEmailManager());
}

function renderEmailManager() {
    const listContainer = document.getElementById('email-manager-list');
    const filterText = document.getElementById('email-search-input').value.toLowerCase();
    listContainer.innerHTML = '';

    const filteredEntries = Object.entries(storeEmails).filter(([kodu, email]) => {
        return kodu.toLowerCase().includes(filterText) || email.toLowerCase().includes(filterText);
    });
    
    if(filteredEntries.length === 0 && Object.keys(storeEmails).length > 0) {
         listContainer.innerHTML = '<p class="empty-list-message">Aramanızla eşleşen bayi e-postası bulunamadı.</p>';
         return;
    }
    
    if(Object.keys(storeEmails).length === 0) {
        listContainer.innerHTML = '<p class="empty-list-message">Henüz hiç bayi e-postası eklenmedi.</p>';
        return;
    }

    filteredEntries.sort((a, b) => a[0].localeCompare(b[0])).forEach(([kodu, email]) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'email-manager-item';
        itemDiv.dataset.kodu = kodu;
        itemDiv.innerHTML = `
            <span class="email-manager-code">${kodu}</span>
            <input type="email" class="email-manager-input" value="${email}">
            <div class="email-manager-actions">
                <button class="btn-success btn-sm" onclick="saveEmail('${kodu}')" title="Değişikliği Kaydet"><i class="fas fa-save"></i></button>
                <button class="btn-danger btn-sm" onclick="deleteEmail('${kodu}')" title="Bu Kaydı Sil"><i class="fas fa-trash"></i></button>
            </div>
        `;
        listContainer.appendChild(itemDiv);
    });
}

async function saveEmail(kodu, isNew = false) {
    if (!auth.currentUser || !database) { alert("Bu işlem için sisteme giriş yapmalısınız."); return; }
    const itemDiv = document.querySelector(`.email-manager-item[data-kodu="${kodu}"]`);
    if (!itemDiv) return;
    const emailInput = itemDiv.querySelector('.email-manager-input');
    const newEmail = emailInput.value.trim();
    if (!newEmail) { alert("E-posta alanı boş bırakılamaz."); return; }
    
    try {
        await database.ref(`storeEmails/${kodu}`).set(newEmail);
        storeEmails[kodu] = newEmail;
        localStorage.setItem('fideStoreEmails', JSON.stringify(storeEmails));
        if(isNew) {
           itemDiv.querySelector('.email-manager-code').textContent = kodu;
           itemDiv.dataset.kodu = kodu;
           itemDiv.classList.remove('new-item');
        }
        emailInput.style.border = '2px solid var(--success)';
        setTimeout(() => { emailInput.style.border = '1px solid var(--border)'; }, 2000);

    } catch (error) {
        alert("E-posta kaydedilirken bir hata oluştu: " + error.message);
    }
}

async function deleteEmail(kodu) {
     if (!auth.