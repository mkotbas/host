// --- Global Değişkenler ---
let storeEmails = {};
let isFirebaseConnected = false;

// --- Ana Uygulama Mantığı ---
window.onload = initializeApp;

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
    const user = auth.currentUser;
    storeEmails = {}; // Her yüklemede sıfırla

    if (user && database) {
        try {
            const emailsRef = database.ref('storeEmails');
            const snapshot = await emailsRef.once('value');
            if (snapshot.exists()) {
                storeEmails = snapshot.val();
            }
        } catch (error) {
            console.error("Buluttan bayi e-postaları yüklenemedi:", error);
            alert("E-posta listesi buluttan yüklenemedi. Lütfen internet bağlantınızı kontrol edin.");
        }
    } else {
        console.log("E-postaları yüklemek için kullanıcı girişi gerekli.");
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
            .then(() => { loginPopup.style.display = 'none'; window.location.reload(); })
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
     if (!auth.currentUser || !database) { alert("Bu işlem için sisteme giriş yapmalısınız."); return; }
     if (confirm(`'${kodu}' kodlu bayiye ait e-postayı silmek istediğinizden emin misiniz?`)) {
         try {
             await database.ref(`storeEmails/${kodu}`).remove();
             delete storeEmails[kodu];
             document.querySelector(`.email-manager-item[data-kodu="${kodu}"]`).remove();
         } catch(error) {
             alert("E-posta silinirken bir hata oluştu: " + error.message);
         }
     }
}

function addNewEmailUI() {
    const listContainer = document.getElementById('email-manager-list');
    if (document.querySelector('.email-manager-item.new-item')) {
        document.querySelector('.email-manager-item.new-item .email-manager-code-input').focus();
        alert("Önce mevcut yeni kaydı tamamlayın.");
        return;
    }
    const itemDiv = document.createElement('div');
    itemDiv.className = 'email-manager-item new-item';
    
    const newCode = 'YENI_BAYI_KODU';
    itemDiv.dataset.kodu = newCode;

    itemDiv.innerHTML = `
        <input type="text" class="email-manager-code-input" placeholder="Bayi Kodu">
        <input type="email" class="email-manager-input" placeholder="E-posta Adresi">
        <div class="email-manager-actions">
            <button class="btn-success btn-sm" onclick="saveNewEmail()" title="Yeni Kaydı Ekle"><i class="fas fa-check"></i></button>
            <button class="btn-danger btn-sm" onclick="this.closest('.email-manager-item').remove()" title="İptal Et"><i class="fas fa-times"></i></button>
        </div>`;
    listContainer.prepend(itemDiv);
    itemDiv.querySelector('.email-manager-code-input').focus();
}

async function saveNewEmail() {
     const newItemDiv = document.querySelector('.email-manager-item.new-item');
     if (!newItemDiv) return;
     
     const codeInput = newItemDiv.querySelector('.email-manager-code-input');
     const emailInput = newItemDiv.querySelector('.email-manager-input');
     const newCode = codeInput.value.trim();
     const newEmail = emailInput.value.trim();

     if (!newCode || !newEmail) {
         alert("Bayi kodu ve e-posta alanları boş bırakılamaz.");
         return;
     }
    if (storeEmails[newCode]) {
        alert("Bu bayi kodu zaten mevcut. Lütfen listeden güncelleyin.");
        return;
    }
    
    newItemDiv.dataset.kodu = newCode;
    await saveEmail(newCode, true);
    renderEmailManager();
}

function handleBulkEmailUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!auth.currentUser || !database) { alert("Bu işlem için sisteme giriş yapmalısınız."); return; }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const text = e.target.result;
            const lines = text.split('\n');
            const newEmailData = {};
            let count = 0;
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const kodu = parts[0];
                    const email = parts[1];
                    if (kodu && email && email.includes('@')) {
                        newEmailData[kodu] = email;
                        count++;
                    }
                }
            });
            
            if(count === 0) {
                alert("Dosya okundu ancak geçerli 'bayikodu e-posta' formatında satır bulunamadı.");
                return;
            }

            if (confirm(`${count} adet e-posta bulundu. Bu işlem buluttaki mevcut tüm bayi e-posta listesinin üzerine yazılacaktır. Devam etmek istiyor musunuz?`)) {
                await database.ref('storeEmails').set(newEmailData);
                storeEmails = newEmailData;
                alert('Toplu e-posta yüklemesi başarıyla tamamlandı!');
                renderEmailManager();
            }

        } catch (error) {
            alert('Dosya okunurken veya işlenirken bir hata oluştu!');
            console.error("Toplu e-posta yükleme hatası:", error);
        }
    };
    reader.readAsText(file);
    event.target.value = null;
}