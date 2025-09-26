// --- Firebase Başlatma ---
const firebaseConfig = {
    apiKey: "AIzaSyBzTb9cop8B4k8D8VGRBnojlxvIKoaGcbQ",
    authDomain: "fideraporuygulamasi.firebaseapp.com",
    databaseURL: "https://fideraporuygulamasi-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fideraporuygulamasi",
    storageBucket: "fideraporuygulamasi.appspot.com",
    messagingSenderId: "351112274026",
    appId: "1:351112274026:web:2e7433982f3b4bc747ea13"
};

let database, auth;
try {
    firebase.initializeApp(firebaseConfig);
    database = firebase.database();
    auth = firebase.auth();
} catch (e) { console.error("Firebase başlatılamadı.", e); }

// --- Global Değişkenler ---
let dideData = [], fideData = [], uniqueStores = [], selectedStore = null;
let fideQuestions = [], popCodes = [], expiredCodes = [], productList = [], expiredExcelFiles = [];
let migrationMap = {}, storeEmails = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan veya yerel dosyadan yüklenemedi." }];
const monthNames = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let isFirebaseConnected = false;
let currentManagerView = 'active'; 

// --- Ana Uygulama Mantığı ---
window.onload = initializeApp;

async function initializeApp() {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    auth.onAuthStateChanged(async user => { 
        const loginToggleBtn = document.getElementById('login-toggle-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const loginPopup = document.getElementById('login-popup');
        const uploadBtn = document.getElementById('upload-backup-to-cloud-btn');
        if (user) {
            loginToggleBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-flex';
            loginPopup.style.display = 'none';
            if (uploadBtn) uploadBtn.disabled = false;
        } else {
            loginToggleBtn.style.display = 'inline-flex';
            logoutBtn.style.display = 'none';
            if (uploadBtn) uploadBtn.disabled = true;
        }
        updateConnectionIndicator();
        await loadInitialData();
        setupEventListeners();
        updateFormInteractivity(selectedStore !== null);
    });
}

async function loadStoreEmails() {
    const user = auth.currentUser;
    let loadedFromCloud = false;

    if (user && database) {
        try {
            const emailsRef = database.ref('storeEmails');
            const snapshot = await emailsRef.once('value');
            if (snapshot.exists()) {
                storeEmails = snapshot.val();
                localStorage.setItem('fideStoreEmails', JSON.stringify(storeEmails));
                loadedFromCloud = true;
            }
        } catch (error) {
            console.error("Buluttan bayi e-postaları yüklenemedi:", error);
        }
    }

    if (!loadedFromCloud) {
        const storedEmails = localStorage.getItem('fideStoreEmails');
        storeEmails = storedEmails ? JSON.parse(storedEmails) : {};
    }
}

async function loadMigrationMap() {
    const user = auth.currentUser;
    let loadedFromCloud = false;

    if (user && database) {
        try {
            const migrationRef = database.ref('migrationSettings/map');
            const snapshot = await migrationRef.once('value');
            if (snapshot.exists()) {
                migrationMap = snapshot.val();
                localStorage.setItem('fideMigrationMap', JSON.stringify(migrationMap));
                loadedFromCloud = true;
            }
        } catch (error) {
            console.error("Buluttan veri taşıma ayarları yüklenemedi:", error);
        }
    }

    if (!loadedFromCloud) {
        const storedMap = localStorage.getItem('fideMigrationMap');
        migrationMap = storedMap ? JSON.parse(storedMap) : {};
    }
}

async function loadInitialData() {
    await loadMigrationMap();
    await loadStoreEmails();
    let questionsLoaded = false;

    // 1. Önce buluttan yüklemeyi dene
    if (auth.currentUser && database) {
        try {
            const questionsRef = database.ref('fideQuestionsData');
            const snapshot = await questionsRef.once('value');
            if (snapshot.exists()) {
                const cloudData = snapshot.val();
                fideQuestions = cloudData.questions || [];
                productList = cloudData.productList || [];
                console.log("Sorular ve ürün listesi başarıyla buluttan yüklendi.");
                questionsLoaded = true;
            }
        } catch (error) {
            console.error("Firebase'den soru verisi okunurken hata oluştu:", error);
        }
    }
    
    // 2. Bulutta veri yoksa veya yüklenemediyse, yerel JSON'dan yükle ve bulutu besle
    if (!questionsLoaded) {
         try {
            const response = await fetch(`fide_soru_listesi.json?v=${new Date().getTime()}`);
            if (!response.ok) throw new Error('Soru dosyası bulunamadı.');
            const jsonData = await response.json();
            
            fideQuestions = jsonData.questions || [];
            productList = jsonData.productList || [];
            
            // Veriyi buluta yaz (ilk kurulum için)
            if (auth.currentUser && database) {
                await database.ref('fideQuestionsData').set(jsonData);
                alert("BİLGİ: Bulutta soru veritabanı bulunamadı. Yerel 'fide_soru_listesi.json' dosyası okunarak bulut veritabanı otomatik olarak oluşturuldu. Bundan sonra tüm değişiklikler bulut üzerinden yönetilecektir.");
            } else {
                 console.log("Kullanıcı giriş yapmadığı için yerel JSON verisi buluta yazılamadı. Sadece yerel dosya kullanılıyor.");
            }
             questionsLoaded = true;

        } catch (error) {
            console.error("Yerel soru dosyası 'fide_soru_listesi.json' yüklenemedi:", error);
            fideQuestions = fallbackFideQuestions;
            document.getElementById('initialization-error').style.display = 'block';
        }
    }

    // POP sistemi kodlarını ayıkla
    const popSystemQuestion = fideQuestions.find(q => q.type === 'pop_system');
    if (popSystemQuestion) {
        popCodes = popSystemQuestion.popCodes || [];
        expiredCodes = popSystemQuestion.expiredCodes || [];
    }


    if (database) {
        const connectionRef = database.ref('.info/connected');
        connectionRef.on('value', (snapshot) => {
            isFirebaseConnected = snapshot.val();
            updateConnectionIndicator();
        });
    }

    await loadExcelData();

    if (expiredExcelFiles.length > 0) {
        const warningDiv = document.getElementById('excel-expiry-warning');
        const list = document.getElementById('expired-files-list');
        list.innerHTML = expiredExcelFiles.map(file => `<li>${file}</li>`).join('');
        warningDiv.style.display = 'block';
    }

    buildForm();
    restoreLastSession();
}

async function loadExcelData() {
    const user = auth.currentUser;
    let dideLoaded = false;
    let fideLoaded = false;

    if (user && database) {
        const dideRef = database.ref('excelData/dide');
        const dideSnapshot = await dideRef.once('value');
        if (dideSnapshot.exists()) {
            const storedData = dideSnapshot.val();
            const ageInDays = (new Date().getTime() - storedData.timestamp) / (1000 * 60 * 60 * 24);
            if (ageInDays <= 30) {
                if (storedData.filename) { document.getElementById('file-name').textContent = `Buluttan yüklendi: ${storedData.filename}`; }
                populateDideState(storedData.data);
                dideLoaded = true;
            }
        }

        const fideRef = database.ref('excelData/fide');
        const fideSnapshot = await fideRef.once('value');
        if (fideSnapshot.exists()) {
            const storedData = fideSnapshot.val();
            const ageInDays = (new Date().getTime() - storedData.timestamp) / (1000 * 60 * 60 * 24);
            if (ageInDays <= 30) {
                if (storedData.filename) { document.getElementById('fide-file-name').textContent = `Buluttan yüklendi: ${storedData.filename}`; }
                populateFideState(storedData.data);
                fideLoaded = true;
            }
        }
    }

    if (!dideLoaded) loadDideDataFromStorage();
    if (!fideLoaded) loadFideDataFromStorage();
}

function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = isFirebaseConnected && auth.currentUser;
    
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}

function closeManager() {
    document.getElementById('question-manager').style.display = 'none';
    document.getElementById('email-manager').style.display = 'none';
    document.getElementById('backup-manager').style.display = 'none';

    document.getElementById('dide-upload-card').style.display = 'block';
    document.querySelector('.load-container').style.display = 'flex';
    document.getElementById('form-content').style.display = 'block';
    document.querySelector('.action-button').style.display = 'block';
    
    const emailDraft = document.getElementById('email-draft-container');
     if (emailDraft) emailDraft.remove();
    
    const saveSection = document.getElementById('save-section');
    if(saveSection) saveSection.style.display = 'none';
}

function returnToMainPage() {
    const emailDraft = document.getElementById('email-draft-container');
    if (emailDraft) emailDraft.remove();
    const saveSection = document.getElementById('save-section');
    if(saveSection) saveSection.style.display = 'none';
    
    document.getElementById('dide-upload-card').style.display = 'block';
    document.querySelector('.load-container').style.display = 'flex';
    document.getElementById('form-content').style.display = 'block';
    document.querySelector('.action-button').style.display = 'block';
}

function setupEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    document.getElementById('excel-file-input').addEventListener('change', (e) => handleFileSelect(e, 'dide'));
    document.getElementById('fide-excel-file-input').addEventListener('change', (e) => handleFileSelect(e, 'fide'));
    document.getElementById('backup-btn').addEventListener('click', backupAllReports);
    document.getElementById('restore-file-input').addEventListener('change', handleRestoreUpload);
    document.getElementById('merge-file-input').addEventListener('change', handleMergeUpload);
    document.getElementById('new-report-btn').addEventListener('click', startNewReport);
    document.getElementById('load-from-code-btn').addEventListener('click', () => loadReport());
    document.getElementById('load-from-email-btn').addEventListener('click', parseAndLoadFromEmail);
    
    document.getElementById('clear-storage-btn').addEventListener('click', () => {
        const dogruSifreHash = 'ZmRlMDAx';
        const girilenSifre = prompt("Bu işlem geri alınamaz. Tarayıcıdaki TÜM uygulama verilerini kalıcı olarak silmek için lütfen şifreyi girin:");

        if (girilenSifre) { 
            const girilenSifreHash = btoa(girilenSifre);
            if (girilenSifreHash === dogruSifreHash) {
                if (confirm("Şifre doğru. Emin misiniz? Kaydedilmiş TÜM bayi raporları, yüklenmiş Excel dosyaları ve son oturum bilgileri dahil olmak üzere tarayıcıda ve bulutta saklanan BÜTÜN uygulama verileri kalıcı olarak silinecektir.")) {
                    localStorage.clear();
                    
                    if(auth.currentUser && database){
                        database.ref('allFideReports').remove();
                        database.ref('excelData').remove();
                        database.ref('migrationSettings').remove();
                        database.ref('storeEmails').remove();
                        // ÖNEMLİ: Soru veritabanını silmek tehlikeli olabilir, bu yüzden varsayılan olarak kapalı.
                        // İstenirse bu satır açılabilir: database.ref('fideQuestionsData').remove();
                    }
                    
                    alert("Tüm uygulama verileri başarıyla temizlendi. Sayfa yenileniyor.");
                    window.location.reload();
                }
            } else {
                alert("Hatalı şifre! Silme işlemi iptal edildi.");
            }
        }
    });
    document.getElementById('clear-excel-btn').addEventListener('click', () => {
        if (confirm("Yüklenmiş olan DiDe Excel verisini hafızadan ve buluttan silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
            localStorage.removeItem('didePersistenceData');
            if(auth.currentUser && database) {
                database.ref('excelData/dide').remove();
            }
            alert("DiDe Excel verisi temizlendi. Sayfa yenileniyor.");
            window.location.reload();
        }
    });
     document.getElementById('clear-fide-excel-btn').addEventListener('click', () => {
        if (confirm("Yüklenmiş olan FiDe Excel verisini hafızadan ve buluttan silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
            localStorage.removeItem('fidePersistenceData');
            if(auth.currentUser && database) {
                database.ref('excelData/fide').remove();
            }
            alert("FiDe Excel verisi temizlendi. Sayfa yenileniyor.");
            window.location.reload();
        }
    });
    document.getElementById('store-search-input').addEventListener('keyup', (e) => {
        selectedStore = null; 
        const filter = e.target.value.toLowerCase().trim();
        const storeListDiv = document.getElementById('store-list');
        storeListDiv.style.display = 'block';
        if (filter === "") {
            storeListDiv.innerHTML = ''; 
            return;
        }
        const filteredStores = uniqueStores.filter(store => 
            (store.bayiAdi && store.bayiAdi.toLowerCase().includes(filter)) || 
            (store.bayiKodu && String(store.bayiKodu).toLowerCase().includes(filter))
        );
        displayStores(filteredStores);
    });
    
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const uploadBackupBtn = document.getElementById('upload-backup-to-cloud-btn');
    const restoreBtn = document.getElementById('restore-from-backup-btn');
    const mergeBtn = document.getElementById('merge-backups-btn');

    restoreBtn.addEventListener('click', () => document.getElementById('restore-file-input').click());
    mergeBtn.addEventListener('click', () => document.getElementById('merge-file-input').click());
    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });
    logoutBtn.addEventListener('click', () => { auth.signOut(); window.location.reload(); });
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
    uploadBackupBtn.addEventListener('click', uploadLocalBackupToCloud);
    window.addEventListener('click', function(event) {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });

    document.getElementById('toggle-manager-btn').addEventListener('click', () => {
        const manager = document.getElementById('question-manager');
        const isManagerHidden = manager.style.display === 'none' || manager.style.display === '';
        if (isManagerHidden) {
            const dogruSifreHash = 'ZmRlMDAx';
            const girilenSifre = prompt("Lütfen Soru Yöneticisi şifresini girin:");
            if (girilenSifre) {
                const girilenSifreHash = btoa(girilenSifre);
                if (girilenSifreHash === dogruSifreHash) {
                   returnToMainPage();
                   closeManager();
                   manager.style.display = 'block';
                   document.getElementById('dide-upload-card').style.display = 'none';
                   document.querySelector('.load-container').style.display = 'none';
                   document.getElementById('form-content').style.display = 'none';
                   document.querySelector('.action-button').style.display = 'none';
                   renderQuestionManager();
                } else {
                    alert("Hatalı şifre!");
                }
            }
        } else {
            closeManager();
        }
    });
    
    document.getElementById('toggle-email-manager-btn').addEventListener('click', () => {
        const manager = document.getElementById('email-manager');
        const isManagerHidden = manager.style.display === 'none' || manager.style.display === '';
         if (isManagerHidden) {
            const dogruSifreHash = 'ZmRlMDAx';
            const girilenSifre = prompt("Lütfen Bayi E-posta Yöneticisi şifresini girin:");
             if (girilenSifre) {
                const girilenSifreHash = btoa(girilenSifre);
                 if (girilenSifreHash === dogruSifreHash) {
                   returnToMainPage();
                   closeManager();
                   manager.style.display = 'block';
                   document.getElementById('dide-upload-card').style.display = 'none';
                   document.querySelector('.load-container').style.display = 'none';
                   document.getElementById('form-content').style.display = 'none';
                   document.querySelector('.action-button').style.display = 'none';
                   renderEmailManager();
                } else {
                    alert("Hatalı şifre!");
                }
            }
        } else {
            closeManager();
        }
    });
    
    document.getElementById('toggle-backup-manager-btn').addEventListener('click', () => {
        const manager = document.getElementById('backup-manager');
        const isManagerHidden = manager.style.display === 'none' || manager.style.display === '';
         if (isManagerHidden) {
            const dogruSifreHash = 'ZmRlMDAx';
            const girilenSifre = prompt("Lütfen Yedekleme Yöneticisi şifresini girin:");
             if (girilenSifre) {
                const girilenSifreHash = btoa(girilenSifre);
                 if (girilenSifreHash === dogruSifreHash) {
                   returnToMainPage();
                   closeManager();
                   manager.style.display = 'block';
                   document.getElementById('dide-upload-card').style.display = 'none';
                   document.querySelector('.load-container').style.display = 'none';
                   document.getElementById('form-content').style.display = 'none';
                   document.querySelector('.action-button').style.display = 'none';
                } else {
                    alert("Hatalı şifre!");
                }
            }
        } else {
            closeManager();
        }
    });

    document.getElementById('view-active-btn').addEventListener('click', () => {
        currentManagerView = 'active';
        filterManagerView();
    });
    document.getElementById('view-archived-btn').addEventListener('click', () => {
        currentManagerView = 'archived';
        filterManagerView();
    });
    document.getElementById('add-new-question-btn').addEventListener('click', addNewQuestionUI);
    document.getElementById('save-questions-btn').addEventListener('click', saveQuestions);
    document.getElementById('delete-all-archived-btn').addEventListener('click', deleteAllArchivedQuestions);
    document.getElementById('restore-all-archived-btn').addEventListener('click', restoreAllArchivedQuestions);
    
    document.getElementById('unlock-ids-btn').addEventListener('click', () => {
        const dogruSifreHash = 'ZmRlMDAx';
        const girilenSifre = prompt("ID alanlarını düzenlemeye açmak için lütfen yönetici şifresini tekrar girin:");
        if (girilenSifre) {
            const girilenSifreHash = btoa(girilenSifre);
            if (girilenSifreHash === dogruSifreHash) {
                const idInputs = document.querySelectorAll('.manager-id-input');
                idInputs.forEach(input => {
                    input.disabled = false;
                });
                const unlockBtn = document.getElementById('unlock-ids-btn');
                unlockBtn.disabled = true;
                unlockBtn.innerHTML = '<i class="fas fa-lock-open"></i> ID Alanları Düzenlenebilir';
                alert('Soru ID alanları artık düzenlenebilir.');
            } else {
                alert('Hatalı şifre!');
            }
        }
    });

    document.getElementById('open-migration-manager-from-scenario-btn').addEventListener('click', () => {
        document.getElementById('scenario-system-overlay').style.display = 'none';
        renderMigrationManagerUI();
        document.getElementById('migration-manager-overlay').style.display = 'flex';
    });
    document.getElementById('close-migration-manager-btn').addEventListener('click', () => {
        document.getElementById('migration-manager-overlay').style.display = 'none';
    });
   
    document.getElementById('open-scenario-system-btn').addEventListener('click', openScenarioSystem);
    document.getElementById('close-scenario-system-btn').addEventListener('click', closeScenarioSystem);
    document.querySelectorAll('.scenario-btn').forEach(btn => {
        btn.addEventListener('click', (e) => selectScenario(e.currentTarget.dataset.scenario));
    });
    document.getElementById('apply-id-change-btn').addEventListener('click', applyIdChangeScenario);
    document.getElementById('scenario-delete-id').addEventListener('input', previewQuestionForDelete);
    document.getElementById('apply-delete-question-btn').addEventListener('click', applyDeleteQuestionScenario);
    
    document.getElementById('bulk-upload-emails-btn').addEventListener('click', () => document.getElementById('email-bulk-upload-input').click());
    document.getElementById('email-bulk-upload-input').addEventListener('change', handleBulkEmailUpload);
    document.getElementById('add-new-email-btn').addEventListener('click', addNewEmailUI);
    document.getElementById('email-search-input').addEventListener('keyup', () => renderEmailManager());
}

function openScenarioSystem() {
    document.getElementById('scenario-system-overlay').style.display = 'flex';
    document.querySelector('.scenario-selection').style.display = 'flex';
    document.querySelectorAll('.scenario-form').forEach(form => form.style.display = 'none');
    document.getElementById('scenario-old-id').value = '';
    document.getElementById('scenario-new-id').value = '';
    document.getElementById('scenario-delete-id').value = '';
    previewQuestionForDelete();
}

function closeScenarioSystem() {
    document.getElementById('scenario-system-overlay').style.display = 'none';
}

function selectScenario(scenario) {
    document.querySelector('.scenario-selection').style.display = 'none';
    if (scenario === 'id-change') {
        document.getElementById('scenario-id-change-form').style.display = 'block';
    } else if (scenario === 'delete-question') {
        document.getElementById('scenario-delete-question-form').style.display = 'block';
    }
}

function applyIdChangeScenario() {
    const oldId = document.getElementById('scenario-old-id').value.trim();
    const newId = document.getElementById('scenario-new-id').value.trim();

    if (!oldId || !newId) {
        alert("Lütfen hem 'Eski Soru ID' hem de 'Yeni Soru ID' alanlarını doldurun.");
        return;
    }
    if (oldId === newId) {
        alert("Eski ve yeni ID aynı olamaz.");
        return;
    }

    const questionItem = document.querySelector(`.manager-item[data-id="${oldId}"]`);
    if (!questionItem) {
        alert(`HATA: "${oldId}" ID'li bir soru bulunamadı.`);
        return;
    }
    
    const idInput = questionItem.querySelector('.manager-id-input');
    idInput.value = newId;
    questionItem.dataset.id = newId;

    addMigrationMapping(oldId, newId);
    
    alert(`Başarılı!\n\n- Soru ${oldId} ID'si, ${newId} olarak güncellendi.\n- Veri kaybını önlemek için otomatik yönlendirme kuralı eklendi.\n\nDeğişiklikleri kalıcı yapmak için 'Kaydet' butonuna basmayı unutmayın.`);
    closeScenarioSystem();
}

function previewQuestionForDelete() {
    const id = document.getElementById('scenario-delete-id').value;
    const previewArea = document.getElementById('scenario-delete-preview');
    const deleteBtn = document.getElementById('apply-delete-question-btn');
    if (!id) {
        previewArea.innerHTML = "Lütfen silmek istediğiniz sorunun ID'sini girin.";
        previewArea.style.color = 'var(--secondary)';
        deleteBtn.disabled = true;
        return;
    }
    const question = fideQuestions.find(q => String(q.id) === String(id));
    if (question) {
        previewArea.innerHTML = `<b>Silinecek Soru:</b> "${question.title.substring(0, 45)}..."`;
        previewArea.style.color = 'var(--dark)';
        deleteBtn.disabled = false;
    } else {
        previewArea.innerHTML = `"${id}" ID'li soru bulunamadı.`;
        previewArea.style.color = 'var(--danger)';
        deleteBtn.disabled = true;
    }
}

async function applyDeleteQuestionScenario() {
    const questionIdToDelete = document.getElementById('scenario-delete-id').value;
    if (!questionIdToDelete) {
        alert("Lütfen silinecek soru ID'sini girin.");
        return;
    }
    const question = fideQuestions.find(q => String(q.id) === String(questionIdToDelete));
    if (!question) {
        alert(`HATA: "${questionIdToDelete}" ID'li bir soru bulunamadı.`);
        return;
    }
    const confirmationText = `DİKKAT! BU İŞLEM GERİ ALINAMAZ!\n\nID: ${question.id}\nSoru: "${question.title}"\n\nYukarıdaki soruyu ve bu soruya ait TÜM bayi raporlarındaki cevapları kalıcı olarak silmek istediğinizden KESİNLİKLE emin misiniz?`;
    if (!confirm(confirmationText)) {
        alert("İşlem iptal edildi.");
        return;
    }
    if (!auth.currentUser || !database) {
        alert("Bu kritik işlem için bulut sistemine giriş yapmış olmanız gerekmektedir.");
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        // Adım 1: Bu soruya ait tüm cevapları sil (yerel ve bulut)
        const localDataString = localStorage.getItem('allFideReports');
        if (localDataString) {
            let allReports = JSON.parse(localDataString);
            for (const storeKey in allReports) {
                if (allReports[storeKey]?.data?.questions_status?.[questionIdToDelete]) {
                    delete allReports[storeKey].data.questions_status[questionIdToDelete];
                }
            }
            localStorage.setItem('allFideReports', JSON.stringify(allReports));
        }

        const reportsRef = database.ref('allFideReports');
        const snapshot = await reportsRef.once('value');
        if (snapshot.exists()) {
            let allCloudReports = snapshot.val();
            let updates = {};
             for (const storeKey in allCloudReports) {
                if (allCloudReports[storeKey]?.data?.questions_status?.[questionIdToDelete]) {
                    updates[`${storeKey}/data/questions_status/${questionIdToDelete}`] = null;
                }
            }
             if (Object.keys(updates).length > 0) {
                await reportsRef.update(updates);
            }
        }

        // Adım 2: Sorunun kendisini ana listeden sil
        const newQuestions = fideQuestions.filter(q => String(q.id) !== String(questionIdToDelete));

        const finalJsonData = {
            questions: newQuestions,
            productList: productList
        };

        // Adım 3: Yeni soru listesini buluta kaydet
        const questionsRef = database.ref('fideQuestionsData');
        await questionsRef.set(finalJsonData);

        alert(`Başarılı!\n\nFiDe ${questionIdToDelete} sorusu ve ilişkili tüm cevaplar kalıcı olarak silindi. Sayfa yenileniyor.`);
        window.location.reload();

    } catch (error) {
        console.error("Soru silme senaryosu sırasında bir hata oluştu:", error);
        alert("Bir hata oluştu! Soru ve cevaplar silinemedi. Lütfen konsolu kontrol edin.");
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function renderMigrationManagerUI() {
    const listContainer = document.getElementById('migration-list-container');
    listContainer.innerHTML = '';
    if (Object.keys(migrationMap).length === 0) {
        listContainer.innerHTML = '<li class="empty-message">Henüz yönlendirme eklenmemiş.</li>';
    } else {
        for (const oldId in migrationMap) {
            const newId = migrationMap[oldId];
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span class="mapping-text">
                    Eski ID: <b>${oldId}</b> <i class="fas fa-long-arrow-alt-right"></i> Yeni ID: <b>${newId}</b>
                </span>
                <button class="btn-danger btn-sm" onclick="deleteMigrationMapping('${oldId}')" title="Bu yönlendirmeyi sil."><i class="fas fa-trash"></i></button>
            `;
            listContainer.appendChild(listItem);
        }
    }
}

function addMigrationMapping(oldIdValue, newIdValue) {
    const oldId = oldIdValue;
    const newId = newIdValue;

    if (!oldId || !newId) {
        alert("Lütfen hem 'Eski ID' hem de 'Yeni ID' alanlarını doldurun.");
        return;
    }
    if (oldId === newId) {
        alert("Eski ve yeni ID aynı olamaz.");
        return;
    }

    migrationMap[oldId] = newId;
    saveMigrationMap();
}

function deleteMigrationMapping(oldIdToDelete) {
    if (confirm(`'${oldIdToDelete}' ID'li yönlendirmeyi silmek istediğinizden emin misiniz?`)) {
        delete migrationMap[oldIdToDelete];
        saveMigrationMap();
        renderMigrationManagerUI();
    }
}

function saveMigrationMap() {
    localStorage.setItem('fideMigrationMap', JSON.stringify(migrationMap));
    const user = auth.currentUser;
    if (user && database) {
        database.ref('migrationSettings/map').set(migrationMap).catch(error => {
            console.error("Veri taşıma ayarları buluta kaydedilemedi:", error);
        });
    }
}

function uploadLocalBackupToCloud() {
    if (!auth.currentUser) { alert("Bu işlem için önce sisteme giriş yapmalısınız."); return; }
    const localDataString = localStorage.getItem('allFideReports');
    if (!localDataString) { alert("Buluta yüklenecek yerel bir yedek bulunamadı."); return; }
    const confirmation = confirm("DİKKAT! Bu işlem, buluttaki mevcut tüm raporların üzerine yazacaktır. Tarayıcı hafızanızdaki yedek buluta yüklenecektir. Emin misiniz?");
    if (confirmation) {
        try {
            const localData = JSON.parse(localDataString);
            const firebaseRef = database.ref('allFideReports');
            
            firebaseRef.set(localData)
                .then(() => { alert("Yerel yedek başarıyla buluta yüklendi! Sayfanın yenilenmesi önerilir."); })
                .catch(error => { alert("Buluta yükleme sırasında bir hata oluştu: " + error.message); console.error("Firebase'e yazma hatası:", error); });
        } catch (error) { alert("Yerel yedek verisi okunurken bir hata oluştu. Yedek dosyası bozuk olabilir."); console.error("JSON parse hatası:", error); }
    }
}
function saveFormState() {
    if (!document.getElementById('form-content').innerHTML || !selectedStore) return;
    let allReports = JSON.parse(localStorage.getItem('allFideReports')) || {};
    const reportData = getFormDataForSaving();
    const storeKey = `store_${selectedStore.bayiKodu}`;
    allReports[storeKey] = { timestamp: new Date().getTime(), data: reportData };
    localStorage.setItem('allFideReports', JSON.stringify(allReports));
    if (database && auth.currentUser) {
        const firebaseStoreRef = database.ref('allFideReports/' + storeKey);
        firebaseStoreRef.set({ timestamp: new Date().getTime(), data: reportData })
            .catch(error => console.error("Firebase'e yazma hatası:", error));
    }
}
function loadReportForStore(bayiKodu) {
    const storeKey = `store_${bayiKodu}`;
    if (database && auth.currentUser) {
        const firebaseStoreRef = database.ref('allFideReports/' + storeKey);
        firebaseStoreRef.once('value', (snapshot) => {
            if (snapshot.exists()) { loadReport(snapshot.val().data); } 
            else {
                const allReports = JSON.parse(localStorage.getItem('allFideReports')) || {};
                if (allReports[storeKey]) { loadReport(allReports[storeKey].data); } else { resetForm(); }
            }
        }).catch(error => {
            console.error("Firebase'den okuma hatası:", error);
            const allReports = JSON.parse(localStorage.getItem('allFideReports')) || {};
            if (allReports[storeKey]) { loadReport(allReports[storeKey].data); } else { resetForm(); }
        });
    } else {
        const allReports = JSON.parse(localStorage.getItem('allFideReports')) || {};
        if (allReports[storeKey]) { loadReport(allReports[storeKey].data); } else { resetForm(); }
    }
}
function getUnitForProduct(productName) {
    const upperCaseName = productName.toUpperCase();
    if (upperCaseName.includes('TSHIRT') || upperCaseName.includes('HIRKA')) { return 'Adet'; }
    return 'Paket';
}
function resetForm() { document.getElementById('form-content').innerHTML = ''; buildForm(); }

function generateQuestionHtml(q) {
    let questionActionsHTML = '';
    let questionContentHTML = '';
    let isArchivedClass = q.isArchived ? 'archived-item' : ''; 

    if (q.type === 'standard') {
        questionActionsHTML = `<div class="fide-actions"><button class="add-item-btn btn-sm" onclick="addDynamicInput('fide${q.id}')" title="Bu maddeyle ilgili yeni bir eksiklik satırı ekler."><i class="fas fa-plus"></i> Yeni Eksik Ekle</button><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})" title="Bu soruyu 'Tamamlandı' olarak işaretler. Geri alınabilir."><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})" title="Bu soruyu e-posta raporundan tamamen çıkarır. Geri alınabilir."><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
        let staticItemsHTML = (q.staticItems || []).map(item => `<div class="static-item"><div class="content">${item}</div><button class="delete-bar btn-danger" onclick="initiateDeleteItem(this)" title="Bu satırı silmek için tıklayın. 4 saniye içinde geri alınabilir."><i class="fas fa-trash"></i></button></div>`).join('');
        questionContentHTML = `<div class="input-area"><div id="sub-items-container-fide${q.id}">${staticItemsHTML}</div></div>`;
    } else if (q.type === 'product_list') {
        questionActionsHTML = `<div class="fide-actions"><button class="add-item-btn btn-sm" onclick="addDynamicInput('fide${q.id}_pleksi')" title="Pleksi kullanımıyla ilgili yeni bir eksiklik satırı ekler."><i class="fas fa-plus"></i> Yeni Ekle</button><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})" title="Bu soruyu 'Tamamlandı' olarak işaretler. Geri alınabilir."><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})" title="Bu soruyu e-posta raporundan tamamen çıkarır. Geri alınabilir."><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
        let productOptions = '';
        let currentOptgroup = false;
        productList.forEach(p => {
            if (p.type === 'header') {
                if (currentOptgroup) productOptions += `</optgroup>`;
                productOptions += `<optgroup label="${p.name}">`;
                currentOptgroup = true;
            } else {
                productOptions += `<option value="${p.code}">${p.code} - ${p.name}</option>`;
            }
        });
        if (currentOptgroup) productOptions += `</optgroup>`;
        questionContentHTML = `<div class="input-area"><b><i>Sipariş verilmesi gerekenler:</i></b><div class="product-adder"><select id="product-selector"><option value="">-- Malzeme Seçin --</option>${productOptions}</select><input type="number" id="product-qty" placeholder="Adet" min="1" value="1"><button class="btn-success btn-sm" onclick="addProductToList()" title="Seçili malzemeyi ve adedini aşağıdaki sipariş listesine ekler."><i class="fas fa-plus"></i> Ekle</button></div><div id="selected-products-list"></div><hr><b><i>Pleksiyle sergilenmesi gerekenler veya Yanlış Pleksi malzeme ile kullanılanlar:</i></b><div id="sub-items-container-fide${q.id}_pleksi"></div></div>`;
    } else if (q.type === 'pop_system') {
        questionActionsHTML = `<div class="fide-actions"><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})" title="Bu soruyu 'Tamamlandı' olarak işaretler. Geri alınabilir."><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})" title="Bu soruyu e-posta raporundan tamamen çıkarır. Geri alınabilir."><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
        questionContentHTML = `<div class="input-area"><div class="pop-container" id="popCodesContainer"></div><div class="warning-message" id="expiredWarning">Seçiminizde süresi dolmuş kodlar bulunmaktadır.</div><div class="pop-button-container"><button class="btn-success btn-sm" onclick="copySelectedCodes()" title="Seçili olan geçerli POP kodlarını panoya kopyalar.">Kopyala</button><button class="btn-danger btn-sm" onclick="clearSelectedCodes()" title="Tüm POP kodu seçimlerini temizler.">Temizle</button><button class="btn-primary btn-sm" onclick="selectExpiredCodes()" title="Süresi dolmuş olan tüm POP kodlarını otomatik olarak seçer.">Bitenler</button><button class="btn-primary btn-sm" onclick="openEmailDraft()" title="Seçili POP kodları için bir e-posta taslağı penceresi açar.">E-Posta</button></div></div>`;
    }
    return `<div class="fide-item ${isArchivedClass}" id="fide-item-${q.id}"><div class="fide-title-container"><p><span class="badge">FiDe ${q.id}</span> ${q.title}</p></div>${questionContentHTML}${questionActionsHTML}</div>`;
}

function buildForm() {
    const formContainer = document.getElementById('form-content');
    formContainer.innerHTML = '';
    let html = '';
    fideQuestions.forEach(q => {
        if (q.isArchived) { return; }
        html += generateQuestionHtml(q);
    });
    formContainer.innerHTML = html;
    if (document.getElementById('popCodesContainer')) initializePopSystem();
}
function initiateDeleteItem(buttonEl) {
    const itemEl = buttonEl.parentElement;
    if (itemEl.classList.contains('is-deleting')) {
        clearTimeout(itemEl.dataset.deleteTimer);
        itemEl.removeAttribute('data-delete-timer');
        itemEl.classList.remove('is-deleting');
        buttonEl.querySelector('i').className = 'fas fa-trash';
        buttonEl.classList.remove('btn-warning');
        buttonEl.classList.add('btn-danger');
    } else {
        itemEl.classList.add('is-deleting');
        buttonEl.querySelector('i').className = 'fas fa-undo';
        buttonEl.classList.remove('btn-danger');
        buttonEl.classList.add('btn-warning');
        const timerId = setTimeout(() => { itemEl.remove(); saveFormState(); }, 4000);
        itemEl.dataset.deleteTimer = timerId;
    }
    saveFormState();
}

function addProductToList(productCode, quantity) {
    const select = document.getElementById('product-selector');
    const qtyInput = document.getElementById('product-qty');
    const selectedProductCode = productCode || select.value;
    const selectedQty = quantity || qtyInput.value;
    if (!selectedProductCode || !selectedQty || selectedQty < 1) return alert('Lütfen malzeme ve geçerli bir miktar girin.');
    
    const product = productList.find(p => p.code === selectedProductCode);
    if (!product) { console.error("Ürün bulunamadı: ", selectedProductCode); return; }

    const listContainer = document.getElementById('selected-products-list');
    if (document.querySelector(`.selected-product-item[data-code="${product.code}"]`)) return alert('Bu ürün zaten listede.');
    
    const unit = getUnitForProduct(product.name);
    const newItem = document.createElement('div');
    newItem.className = 'selected-product-item';
    newItem.dataset.code = product.code;
    newItem.dataset.qty = selectedQty;
    newItem.innerHTML = `<span>${product.code} ${product.name} - <b>${selectedQty} ${unit}</b></span><button class="delete-item-btn btn-sm" title="Bu malzemeyi sipariş listesinden siler." onclick="this.parentElement.remove(); saveFormState();"><i class="fas fa-trash"></i></button>`;
    listContainer.appendChild(newItem);
    
    if (!productCode) { select.value = ''; qtyInput.value = '1'; }
    saveFormState();
}

function toggleCompleted(button) {
    const input = button.parentElement.querySelector('input[type="text"]');
    const isCompleted = input.classList.toggle('completed');
    input.readOnly = isCompleted;
    button.innerHTML = isCompleted ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    button.classList.toggle('undo', isCompleted);
    saveFormState();
}
function toggleQuestionCompleted(button, id) {
    const itemDiv = document.getElementById(`fide-item-${id}`);
    const titleContainer = itemDiv.querySelector('.fide-title-container');
    const isQuestionCompleted = titleContainer.classList.toggle('question-completed');
    button.innerHTML = isQuestionCompleted ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    button.classList.toggle('undo', isQuestionCompleted);
    const inputArea = itemDiv.querySelector('.input-area');
    if (inputArea) inputArea.style.display = isQuestionCompleted ? 'none' : 'block';
    saveFormState();
}
function toggleQuestionRemoved(button, id) {
    const itemDiv = document.getElementById(`fide-item-${id}`);
    const inputArea = itemDiv.querySelector('.input-area');
    const actionsContainer = button.closest('.fide-actions');
    const addItemBtn = actionsContainer.querySelector('.add-item-btn');
    const completeBtn = actionsContainer.querySelector('.status-btn');
    const isRemoved = itemDiv.classList.toggle('question-removed');
    if (isRemoved) {
        if (inputArea) inputArea.style.display = 'none';
        button.innerHTML = '<i class="fas fa-undo"></i> Geri Al';
        button.classList.remove('btn-danger');
        button.classList.add('btn-primary');
        if (addItemBtn) addItemBtn.disabled = true;
        if (completeBtn) completeBtn.disabled = true;
    } else {
        if (inputArea) inputArea.style.display = 'block';
        button.innerHTML = '<i class="fas fa-times-circle"></i> Çıkar';
        button.classList.remove('btn-primary');
        button.classList.add('btn-danger');
        if (addItemBtn) addItemBtn.disabled = false;
        if (completeBtn) completeBtn.disabled = false;
    }
    saveFormState();
}
function addDynamicInput(id, value = '', isCompleted = false) {
    const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) {
        console.warn(`Dinamik girdi eklenemedi: '${id}' ID'li konteyner bulunamadı.`);
        return;
    }
    const newItem = document.createElement('div');
    newItem.className = 'dynamic-input-item';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Eksikliği yazın...';
    input.value = value;
    input.addEventListener('keydown', function(event) { if (event.key === 'Enter') { event.preventDefault(); addDynamicInput(id); } });
    input.addEventListener('blur', saveFormState);
    const completeButton = document.createElement('button');
    completeButton.className = 'status-btn btn-sm';
    completeButton.innerHTML = '<i class="fas fa-check"></i> Tamamlandı';
    completeButton.onclick = () => toggleCompleted(completeButton);
    completeButton.title = "Bu eksikliği 'Tamamlandı' olarak işaretler. Geri alınabilir.";
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-bar btn-danger';
    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
    deleteButton.onclick = function() { initiateDeleteItem(this); };
    deleteButton.title = "Bu satırı silmek için tıklayın. 4 saniye içinde geri alınabilir.";
    newItem.appendChild(input);
    newItem.appendChild(completeButton);
    newItem.appendChild(deleteButton);
    if(isCompleted) toggleCompleted(completeButton);
    container.prepend(newItem);
    if (value === '') input.focus();
    saveFormState();
}
function getCombinedInputs(id) {
    const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) return [];
    const allItems = [];
    Array.from(container.childNodes).reverse().forEach(node => {
        if (node.classList && (node.classList.contains('static-item') || node.classList.contains('dynamic-input-item'))) {
            if(node.classList.contains('is-deleting')) return;
            let text, completed = false, type = '';
            if (node.classList.contains('static-item')) {
                text = node.querySelector('.content').innerHTML;
                type = 'static';
            } else {
                const input = node.querySelector('input[type="text"]');
                text = input.value.trim();
                completed = input.classList.contains('completed');
                type = 'dynamic';
            }
            if (text) allItems.push({ text, completed, type });
        }
    });
    return allItems;
}
function getDynamicInputsForSaving(id) {
     const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) return [];
    const dynamicItems = [];
    Array.from(container.childNodes).reverse().forEach(node => {
        if (node.classList && node.classList.contains('dynamic-input-item')) {
            const input = node.querySelector('input[type="text"]');
            const text = input.value.trim();
            if (text) dynamicItems.push({ text: text, completed: input.classList.contains('completed') });
        }
    });
    return dynamicItems;
}
function initializePopSystem() {
    const popCodesContainer = document.getElementById('popCodesContainer');
    if (!popCodesContainer) return;
    popCodesContainer.innerHTML = '';
    popCodes.forEach(code => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = code;
        checkbox.className = 'pop-checkbox';
        checkbox.addEventListener('change', () => {
            checkExpiredPopCodes();
            saveFormState();
        });
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(code));
        popCodesContainer.appendChild(label);
    });
}
function checkExpiredPopCodes() {
    const warningMessage = document.getElementById('expiredWarning');
    if (!warningMessage) return;
    const hasExpired = Array.from(document.querySelectorAll('.pop-checkbox:checked')).some(cb => expiredCodes.includes(cb.value));
    warningMessage.style.display = hasExpired ? 'block' : 'none';
}
function copySelectedCodes() {
    const nonExpiredCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(code => !expiredCodes.includes(code));
    if (nonExpiredCodes.length === 0) return alert("Kopyalamak için geçerli kod seçin.");
    navigator.clipboard.writeText(nonExpiredCodes.join(', ')).then(() => alert("Seçilen geçerli kodlar kopyalandı!"));
}
function clearSelectedCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => cb.checked = false);
    checkExpiredPopCodes();
    saveFormState();
}
function selectExpiredCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => { cb.checked = expiredCodes.includes(cb.value); });
    checkExpiredPopCodes();
    saveFormState();
}
function openEmailDraft() {
    const selectedCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value);
    const nonExpiredCodes = selectedCodes.filter(code => !expiredCodes.includes(code));
    if (nonExpiredCodes.length === 0) { alert("E-Posta göndermek için geçerli (süresi dolmamış) kod seçin."); return; }
    const kodSatiri = nonExpiredCodes.join(', ');
    const emailHTML = `
        <!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>E-Posta Taslağı</title>
        <style>body { font-family: Arial; padding: 20px; background-color: #fff; } .block { margin-bottom: 15px; } .label { font-weight: bold; color: #555; display: inline-block; margin-bottom: 8px; }</style>
        </head><body>
        <div class="block"><span class="label">Kime:</span> berkcan_boza@arcelik.com.tr</div>
        <div class="block"><span class="label">CC:</span> "ugur.dogan@arcelik.com" &lt;ugur.dogan@arcelik.com.tr&gt;; "aykut.demen@arcelik.com.tr" &lt;aykut.demen@arcelik.com.tr&gt;; "Ahmet.Erol2@arcelik.com.tr" &lt;ahmet.erol2@arcelik.com.tr&gt;</div>
        <div class="block"><span class="label">Konu:</span> (Boş)</div>
        <div class="block"><span class="label">İçerik:</span><div style="margin-top: 10px;">${kodSatiri}</div></div>
        </body></html>`;
    const emailWindow = window.open('', '_blank');
    emailWindow.document.write(emailHTML);
    emailWindow.document.close();
}
function handleFileSelect(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    const filename = file.name;
    const fileNameSpan = type === 'dide' ? document.getElementById('file-name') : document.getElementById('fide-file-name');
    fileNameSpan.textContent = `Yüklü dosya: ${filename}`;
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
            if (type === 'dide') { processDideExcelData(dataAsArray, true, filename); } else { processFideExcelData(dataAsArray, true, filename); }
        } catch (error) { alert("Excel dosyası okunurken bir hata oluştu."); console.error("Excel okuma hatası:", error); }
    };
}
function processDideExcelData(dataAsArray, saveToStorage = false, filename = '') {
    if (dataAsArray.length < 2) return alert('DiDe Excel dosyası beklenen formatta değil (en az 2 satır gerekli).');
    let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim() === 'Bayi Kodu'));
    if (headerRowIndex === -1) return alert('DiDe Excel dosyasında "Bayi Kodu" içeren bir başlık satırı bulunamadı.');
    const headerRow = dataAsArray[headerRowIndex].map(h => typeof h === 'string' ? h.trim() : h);
    const dataRows = dataAsArray.slice(headerRowIndex + 1);
    const bayiKoduIndex = headerRow.indexOf('Bayi Kodu');
    const bayiIndex = headerRow.indexOf('Bayi');
    const bayiYonetmeniIndex = headerRow.indexOf('Bayi Yönetmeni');
    if ([bayiKoduIndex, bayiIndex, bayiYonetmeniIndex].includes(-1)) return alert('DiDe Excel dosyasında "Bayi Kodu", "Bayi" veya "Bayi Yönetmeni" sütunlarından biri bulunamadı.');
    const processedData = dataRows.map(row => {
        if (!row[bayiKoduIndex]) return null;
        const scores = {};
        headerRow.forEach((header, index) => {
            const monthNumber = parseInt(header);
            if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
                if(row[index] !== null && row[index] !== undefined) scores[monthNumber] = row[index];
            }
        });
        return { 'Bayi Kodu': row[bayiKoduIndex], 'Bayi': row[bayiIndex], 'Bayi Yönetmeni': row[bayiYonetmeniIndex], 'scores': scores };
    }).filter(d => d);
    if (saveToStorage) {
        const persistenceData = { timestamp: new Date().getTime(), data: processedData, filename: filename };
        localStorage.setItem('didePersistenceData', JSON.stringify(persistenceData));
        if (auth.currentUser && database) {
            database.ref('excelData/dide').set(persistenceData);
        }
        alert('DiDe puan dosyası başarıyla işlendi, tarayıcıya ve buluta kaydedildi.');
    }
    populateDideState(processedData);
}
function processFideExcelData(dataAsArray, saveToStorage = false, filename = '') {
    if (dataAsArray.length < 3) return alert('FiDe Excel dosyası beklenen formatta değil (en az 3 satır gerekli).');
    const currentYear = new Date().getFullYear();
    let yearRowIndex = -1;
    for(let i = 0; i < dataAsArray.length; i++) {
        if(dataAsArray[i].some(cell => String(cell).trim() == currentYear)) {
            yearRowIndex = i;
            break;
        }
    }
    if (yearRowIndex === -1) return alert(`FiDe Excel dosyasında '${currentYear}' yılını içeren bir satır bulunamadı.`);
    const yearRow = dataAsArray[yearRowIndex];
    const filledYearRow = [];
    let lastKnownYear = null;
    for (const cell of yearRow) {
        if (cell !== null && cell !== undefined && String(cell).trim() !== "") { lastKnownYear = String(cell).trim(); }
        filledYearRow.push(lastKnownYear);
    }
    let monthRowIndex = yearRowIndex + 1;
    if (monthRowIndex >= dataAsArray.length) return alert('FiDe Excel dosyasında ay bilgileri (yıl satırının altında) bulunamadı.');
    const monthRow = dataAsArray[monthRowIndex];
    let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim() === 'Bayi Kodu'));
    if (headerRowIndex === -1) return alert('FiDe Excel dosyasında "Bayi Kodu" içeren bir başlık satırı bulunamadı.');
    const headerRow = dataAsArray[headerRowIndex].map(h => typeof h === 'string' ? h.trim() : h);
    const dataRows = dataAsArray.slice(headerRowIndex + 1);
    const bayiKoduIndex = headerRow.indexOf('Bayi Kodu');
    if (bayiKoduIndex === -1) return alert('FiDe Excel dosyasında "Bayi Kodu" sütunu bulunamadı.');
    const processedData = dataRows.map(row => {
        if (!row[bayiKoduIndex]) return null;
        const scores = {};
        for (let i = 0; i < filledYearRow.length; i++) {
            if (filledYearRow[i] == currentYear) {
                const monthNumber = parseInt(monthRow[i]);
                if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
                    if(row[i] !== null && row[i] !== undefined && row[i] !== "") scores[monthNumber] = row[i];
                }
            }
        }
        return { 'Bayi Kodu': row[bayiKoduIndex], 'scores': scores };
    }).filter(d => d);

    if (saveToStorage) {
        const persistenceData = { timestamp: new Date().getTime(), data: processedData, filename: filename };
        localStorage.setItem('fidePersistenceData', JSON.stringify(persistenceData));
        if (auth.currentUser && database) {
            database.ref('excelData/fide').set(persistenceData);
        }
        alert('FiDe puan dosyası başarıyla işlendi, tarayıcıya ve buluta kaydedildi.');
    }
    populateFideState(processedData);
}
function populateDideState(data) {
    dideData = data;
    const storeMap = new Map();
    dideData.forEach(row => { 
        if (row['Bayi Kodu'] && !storeMap.has(row['Bayi Kodu'])) {
            storeMap.set(row['Bayi Kodu'], { bayiKodu: row['Bayi Kodu'], bayiAdi: row['Bayi'] });
        }
    });
    uniqueStores = Array.from(storeMap.values()).sort((a, b) => a.bayiAdi.localeCompare(b.bayiAdi));
    document.getElementById('store-list').innerHTML = '';
    document.getElementById('store-selection-area').style.display = 'block';
    document.getElementById('clear-storage-btn').style.display = 'inline-flex';
    document.getElementById('clear-excel-btn').style.display = 'inline-flex';
}
function populateFideState(data) {
    fideData = data;
    document.getElementById('clear-fide-excel-btn').style.display = 'inline-flex';
}
function loadDideDataFromStorage() {
    const storedDataJSON = localStorage.getItem('didePersistenceData');
    if (!storedDataJSON) return;
    try {
        const storedData = JSON.parse(storedDataJSON);
        const ageInDays = (new Date().getTime() - storedData.timestamp) / (1000 * 60 * 60 * 24);
        if (ageInDays > 30) {
            localStorage.removeItem('didePersistenceData');
            expiredExcelFiles.push('DiDe Puan Excel');
            return;
        }
        if (storedData.filename) { document.getElementById('file-name').textContent = `Yerel hafızadan yüklendi: ${storedData.filename}`; }
        populateDideState(storedData.data);
    } catch (e) { localStorage.removeItem('didePersistenceData'); }
}
function loadFideDataFromStorage() {
    const storedDataJSON = localStorage.getItem('fidePersistenceData');
    if (!storedDataJSON) return;
    try {
        const storedData = JSON.parse(storedDataJSON);
        const ageInDays = (new Date().getTime() - storedData.timestamp) / (1000 * 60 * 60 * 24);
        if (ageInDays > 30) {
            localStorage.removeItem('fidePersistenceData');
            expiredExcelFiles.push('FiDe Puan Excel');
            return;
        }
        if (storedData.filename) { document.getElementById('fide-file-name').textContent = `Yerel hafızadan yüklendi: ${storedData.filename}`; }
        populateFideState(storedData.data);
    } catch(e) { localStorage.removeItem('fidePersistenceData'); }
}
function displayStores(stores) {
    const storeListDiv = document.getElementById('store-list');
    storeListDiv.innerHTML = '';
    stores.forEach(store => {
        const item = document.createElement('div');
        item.className = 'store-item';
        let displayName = store.bayiAdi;
        if (displayName && displayName.length > 20) displayName = displayName.substring(0, 20) + '...';
        item.textContent = `${displayName} (${store.bayiKodu})`;
        item.dataset.bayiKodu = store.bayiKodu;
        item.dataset.bayiAdi = store.bayiAdi;
        item.addEventListener('click', () => {
            selectStore(store);
        });
        storeListDiv.appendChild(item);
    });
}
function selectStore(store, loadSavedData = true) {
    document.querySelectorAll('.store-item').forEach(i => i.classList.remove('selected'));
    const storeItem = document.querySelector(`.store-item[data-bayi-kodu="${store.bayiKodu}"]`);
    if (storeItem) storeItem.classList.add('selected');
    
    selectedStore = { bayiKodu: store.bayiKodu, bayiAdi: store.bayiAdi };
    localStorage.setItem('lastSelectedStoreCode', store.bayiKodu);
    
    const searchInput = document.getElementById('store-search-input');
    let shortBayiAdi = store.bayiAdi.length > 20 ? store.bayiAdi.substring(0, 20) + '...' : store.bayiAdi;
    searchInput.value = `${store.bayiKodu} - ${shortBayiAdi}`;
    
    document.getElementById('store-list').innerHTML = '';
    document.getElementById('store-list').style.display = 'none';
    
    if (loadSavedData) {
        loadReportForStore(store.bayiKodu);
    } else {
        resetForm();
        updateFormInteractivity(true);
    }
}
function generateEmail() {
    if (!selectedStore) return alert('Lütfen denetime başlamadan önce bir bayi seçin!');
    saveFormState(); 
    const storeInfo = dideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    const fideStoreInfo = fideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    if (!storeInfo) return alert("Seçilen bayi için DiDe verisi bulunamadı. Lütfen DiDe Excel dosyasını yükleyin.");
    
    const storeEmail = storeEmails[selectedStore.bayiKodu] || null;
    
    // === DEĞİŞİKLİK BURADA BAŞLIYOR ===
    // Mail adresini tıklanabilir bir link haline getiren HTML kodu oluşturuluyor.
    const storeEmailTag = storeEmail ? ` <a href="mailto:${storeEmail}" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@${storeEmail}</a>` : '';
    // === DEĞİŞİKLİK BURADA BİTİYOR ===

    const reportData = getFormDataForSaving();
    document.getElementById('save-code-area').value = JSON.stringify(reportData, null, 2);
    document.getElementById('save-section').style.display = 'block';
    const bayiYonetmeniFullName = storeInfo['Bayi Yönetmeni'] || '';
    const yonetmenFirstName = bayiYonetmeniFullName.split(' ')[0];
    const shortBayiAdi = selectedStore.bayiAdi.length > 20 ? selectedStore.bayiAdi.substring(0, 20) + '...' : selectedStore.bayiAdi;
    let greetingHtml = `<p>${yonetmenFirstName ? yonetmenFirstName + ' Bey' : ''} Merhaba,</p><p>&nbsp;</p><p>Ziyaret etmiş olduğum ${selectedStore.bayiKodu} ${shortBayiAdi} bayi karnesi ektedir.</p>`;
    let fideReportHtml = "";
    fideQuestions.forEach(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        if (!itemDiv || itemDiv.classList.contains('question-removed')) return;
        const titleContainer = itemDiv.querySelector('.fide-title-container');
        const isQuestionCompleted = titleContainer ? titleContainer.classList.contains('question-completed') : false;
        let contentHtml = '';
        if (q.type === 'standard') {
            const allItems = getCombinedInputs(`fide${q.id}`);
            const hasDynamicItems = allItems.some(item => item.type === 'dynamic');
            let itemsForEmail = [];

            if (hasDynamicItems) {
                itemsForEmail = allItems.filter(item => item.type === 'dynamic' || (item.type === 'static' && item.text.includes('<a href')));
            } else {
                itemsForEmail = allItems.filter(item => item.type === 'static');
            }
            
            if (itemsForEmail.length > 0) {
                itemsForEmail.sort((a, b) => {
                    const aIsLink = a.text.includes('<a href');
                    const bIsLink = b.text.includes('<a href');
                    if (aIsLink && !bIsLink) return 1;
                    if (!aIsLink && bIsLink) return -1;
                    return 0;
                });

                contentHtml = `<ul>${itemsForEmail.map(item => {
                    if (item.completed) return `<li>${item.text} <span style="background-color:#dcfce7; color:#166534; font-weight:bold; padding: 1px 6px; border-radius: 4px;">Tamamlandı</span></li>`;
                    return `<li>${item.text}</li>`;
                }).join('')}</ul>`;
            }
        } else if (q.type === 'product_list') {
            const productItemsHtml = Array.from(document.querySelectorAll('#selected-products-list .selected-product-item')).map(item => {
                const product = productList.find(p => p.code === item.dataset.code);
                if(product) { const unit = getUnitForProduct(product.name); return `<li>${product.code} ${product.name}: ${item.dataset.qty} ${unit}</li>`; }
            }).filter(Boolean);
            const pleksiItemsHtml = getCombinedInputs(`fide${q.id}_pleksi`).filter(item => !item.completed).map(item => `<li>${item.text}</li>`);
            if (productItemsHtml.length > 0) contentHtml += `<b><i>Sipariş verilmesi gerekenler:</i></b><ul>${productItemsHtml.join('')}</ul>`;
            if (pleksiItemsHtml.length > 0) contentHtml += `<b><i>Pleksiyle sergilenmesi gerekenler veya Yanlış Pleksi malzeme ile kullanılanlar:</i></b><ul>${pleksiItemsHtml.join('')}</ul>`;
        } else if (q.type === 'pop_system') {
            const nonExpiredCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(code => !expiredCodes.includes(code));
            if (nonExpiredCodes.length > 0) contentHtml = `<ul><li>${nonExpiredCodes.join(', ')}</li></ul>`;
        }
        if (contentHtml !== '' || isQuestionCompleted) {
            const completedSpan = isQuestionCompleted ? ` <span style="background-color:#dcfce7; color:#166534; font-weight:bold; padding: 1px 6px; border-radius: 4px;">Tamamlandı</span>` : "";
            
            let emailTag = '';
            if (q.type === 'pop_system') {
                // === DEĞİŞİKLİK BURADA BAŞLIYOR ===
                // Sabit mail adresi de tıklanabilir bir link haline getiriliyor.
                emailTag = ` <a href="mailto:berkcan_boza@arcelik.com.tr" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@berkcan_boza@arcelik.com.tr</a>`;
                // === DEĞİŞİKLİK BURADA BİTİYOR ===
            } else if (q.wantsStoreEmail) {
                emailTag = storeEmailTag;
            }

            fideReportHtml += `<p><b>FiDe ${q.id}. ${q.title}</b>${completedSpan}${emailTag}</p>`;
            if (!isQuestionCompleted || q.type === 'product_list' || (isQuestionCompleted && q.type === 'standard' && contentHtml !== '')) fideReportHtml += contentHtml;
            fideReportHtml += '<p>&nbsp;</p>';
        }
    });
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    let monthHeaders = '';
    for (let m = 1; m <= currentMonth; m++) monthHeaders += `<th style="border: 1px solid #dddddd; text-align: center; padding: 6px; background-color: #f2f2f2; font-weight: bold; white-space: nowrap;">${monthNames[m] || m}</th>`;
    let dideScores = '';
    for (let m = 1; m <= currentMonth; m++) dideScores += `<td style="border: 1px solid #dddddd; text-align: center; padding: 6px; white-space: nowrap;">${storeInfo.scores[m] || '-'}</td>`;
    let fideScores = '';
    for (let m = 1; m <= currentMonth; m++) {
         const score = (fideStoreInfo && fideStoreInfo.scores && fideStoreInfo.scores[m] !== undefined) ? fideStoreInfo.scores[m] : '-';
         fideScores += `<td style="border: 1px solid #dddddd; text-align: center; padding: 6px; white-space: nowrap;">${score}</td>`;
    }
    const tableHtml = `<div style="overflow-x: auto; -webkit-overflow-scrolling: touch;"><table style="border-collapse: collapse; margin-top: 10px; font-size: 10pt; border: 1px solid #dddddd;"><thead><tr><th style="border: 1px solid #dddddd; text-align: center; padding: 6px; background-color: #f2f2f2; font-weight: bold; white-space: nowrap;">${currentYear}</th>${monthHeaders}</tr></thead><tbody><tr><td style="border: 1px solid #dddddd; text-align: left; padding: 6px; font-weight: bold; white-space: nowrap;">DiDe</td>${dideScores}</tr><tr><td style="border: 1px solid #dddddd; text-align: left; padding: 6px; font-weight: bold; white-space: nowrap;">FiDe</td>${fideScores}</tr></tbody></table></div>`;
    const finalEmailBody = `${greetingHtml}<p>&nbsp;</p>${fideReportHtml}${tableHtml}`;
    
    document.getElementById('dide-upload-card').style.display = 'none';
    document.getElementById('form-content').style.display = 'none';
    document.querySelector('.action-button').style.display = 'none';
    document.querySelector('.load-container').style.display = 'none';

    const existingDraft = document.getElementById('email-draft-container');
    if (existingDraft) existingDraft.remove();
    const draftContainer = document.createElement('div');
    draftContainer.id = 'email-draft-container';
    draftContainer.className = 'card';
    draftContainer.innerHTML = `
        <h2>
            <a href="#" onclick="event.preventDefault(); returnToMainPage();" style="text-decoration: none; color: inherit; cursor: pointer;" title="Ana Sayfaya Dön">
                 <i class="fas fa-arrow-left" style="margin-right: 10px; font-size: 16px;"></i>
            </a>
            <i class="fas fa-envelope-open-text"></i> Kopyalanacak E-posta Taslağı
        </h2>
        <p>Aşağıdaki metni kopyalayıp e-posta olarak gönderebilirsiniz.</p>
        <div id="email-draft-area" contenteditable="true" style="width: 100%; min-height: 500px; border: 1px solid #ccc; padding: 10px; margin-top: 10px; font-family: Aptos, sans-serif; font-size: 11pt;">${finalEmailBody}</div>`;
    document.querySelector('.container').insertBefore(draftContainer, document.getElementById('save-section'));
}
function downloadReportCode() {
    const reportCode = document.getElementById('save-code-area').value;
    if (!selectedStore || !reportCode) return alert('Bayi seçilmediği veya indirilecek rapor kodu bulunamadığı için dosya oluşturulamadı.');
    const bayiKodu = selectedStore.bayiKodu;
    const shortBayiAdi = selectedStore.bayiAdi.substring(0, 15).trim();
    const sanitizedBayiAdi = shortBayiAdi.replace(/[\\/:*?"<>|]/g, '_'); 
    const filename = `${bayiKodu} - ${sanitizedBayiAdi}.txt`;
    const blob = new Blob([reportCode], { type: 'text/plain;charset=utf-8' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
function loadReport(reportDataFromCode) {
    try {
        let reportData = reportDataFromCode;
        if (!reportData) {
            const loadCode = document.getElementById('load-code-area').value.trim();
            if (!loadCode) return alert('Lütfen yüklemek için bir rapor kodu yapıştırın.');
            reportData = JSON.parse(loadCode);
        }

        for (const oldId in migrationMap) {
            if (reportData.questions_status[oldId]) {
                const newId = migrationMap[oldId];
                if (!reportData.questions_status[newId]) {
                    reportData.questions_status[newId] = reportData.questions_status[oldId];
                    delete reportData.questions_status[oldId];
                }
            }
        }

        if (reportData.selectedStore) {
            const storeData = uniqueStores.find(s => s.bayiKodu == reportData.selectedStore.bayiKodu);
            if(storeData) selectStore(storeData, false);
        } else {
             resetForm();
        }
        
        const formContainer = document.getElementById('form-content');

        for (const qId in reportData.questions_status) {
            let questionItem = document.getElementById(`fide-item-${qId}`);

            if (!questionItem) {
                const archivedQuestion = fideQuestions.find(q => String(q.id) === String(qId));
                if (archivedQuestion && archivedQuestion.isArchived) {
                    const questionHtml = generateQuestionHtml(archivedQuestion);
                    formContainer.insertAdjacentHTML('beforeend', questionHtml);
                    questionItem = document.getElementById(`fide-item-${qId}`);
                }
            }
            
            if (!questionItem) continue;

            const data = reportData.questions_status[qId];
            const completeButton = questionItem.querySelector('.fide-actions .status-btn');
            const removeButton = questionItem.querySelector('.fide-actions .remove-btn');
            if (data.removed && removeButton) toggleQuestionRemoved(removeButton, qId);
            else if (data.completed && completeButton) toggleQuestionCompleted(completeButton, qId);
            
            const questionInfo = fideQuestions.find(q => String(q.id) === qId);
            if (data.dynamicInputs) {
                data.dynamicInputs.forEach(input => {
                    const containerId = (questionInfo && questionInfo.type === 'product_list') ? `fide${qId}_pleksi` : `fide${qId}`;
                    addDynamicInput(containerId, input.text, input.completed);
                });
            }
            
            if (data.selectedProducts) data.selectedProducts.forEach(prod => addProductToList(prod.code, prod.qty)); 
            
            if (data.selectedPops) {
                data.selectedPops.forEach(popCode => { const cb = document.querySelector(`.pop-checkbox[value="${popCode}"]`); if(cb) cb.checked = true; });
                checkExpiredPopCodes();
            }
        }
        if (!reportDataFromCode) { alert('Rapor başarıyla yüklendi!'); document.getElementById('load-code-area').value = ''; }
        updateFormInteractivity(true);
    } catch (error) { alert('Geçersiz rapor kodu!'); console.error("Rapor yükleme hatası:", error); }
}

function parseAndLoadFromEmail() {
    const emailText = document.getElementById('load-email-area').value.trim();
    if (!emailText) {
        alert("Lütfen e-posta içeriğini yapıştırın.");
        return;
    }

    const lines = emailText.split('\n');
    let storeCodeFound = null;
    let storeFoundAndSelected = false;

    for (const line of lines) {
        const match = line.match(/Ziyaret etmiş olduğum (\d{5,})\s/);
        if (match) {
            storeCodeFound = match[1];
            const storeToSelect = uniqueStores.find(s => String(s.bayiKodu) === storeCodeFound);
            if (storeToSelect) {
                selectStore(storeToSelect, false);
                storeFoundAndSelected = true;
                break;
            }
        }
    }

    if (!storeFoundAndSelected) {
        if(selectedStore) {
            resetForm();
            updateFormInteractivity(true);
        } else {
            alert("E-posta metninden bayi bulunamadı ve manuel olarak da bir bayi seçilmedi. Lütfen önce bir bayi seçin.");
            return;
        }
    }
    
    const questionHeaderRegex = /^[\s•o-]*FiDe\s+(\d+)\./i;
    const idsInEmail = new Set();
    let currentQuestionId = null;
    
    const ignorePhrases = [
        "sipariş verilmesi gerekenler",
        "pleksiyle sergilenmesi gerekenler",
        "yanlış pleksi malzeme ile kullanılanlar"
    ];

    lines.forEach(line => {
        const trimmedLine = line.trim();
        const headerMatch = trimmedLine.match(questionHeaderRegex);

        if (headerMatch) {
            const originalId = headerMatch[1];
            const finalId = migrationMap[originalId] || originalId;
            currentQuestionId = finalId;
            idsInEmail.add(finalId);
        } else if (currentQuestionId && trimmedLine) {
            const cleanedLine = trimmedLine.replace(/^[\s•o-]+\s*/, '');
            if (!cleanedLine) return; 

            const question = fideQuestions.find(q => String(q.id) === currentQuestionId);
            if (!question || (question.answerType === 'fixed')) {
                return; 
            }

            if (question.type === 'product_list') {
                const productMatch = cleanedLine.match(/^(\d{8,})/); 
                if (productMatch) {
                    const productCode = productMatch[1];
                    let quantity = 1; 
                    const quantityMatch = cleanedLine.match(/:?\s*(\d+)\s*(paket|adet)/i);
                    if (quantityMatch && quantityMatch[1]) {
                        quantity = parseInt(quantityMatch[1], 10);
                    }
                    
                    const productExists = productList.some(p => p.code === productCode);
                    if (productExists) {
                        addProductToList(productCode, quantity);
                        return; 
                    }
                }
            }
            
            if (ignorePhrases.some(phrase => cleanedLine.toLowerCase().includes(phrase))) {
                return; 
            }
            
            const staticItems = question.staticItems || [];
            const isStatic = staticItems.some(staticItem => {
                const plainStaticItem = staticItem.replace(/<[^>]*>/g, '').trim();
                return plainStaticItem.includes(cleanedLine);
            });
            
            if (!isStatic) {
                const containerId = (question.type === 'product_list') ? `fide${currentQuestionId}_pleksi` : `fide${currentQuestionId}`;
                addDynamicInput(containerId, cleanedLine, false);
            }
        }
    });
    
    fideQuestions.forEach(q => {
        if (q.isArchived) return;
        if (!idsInEmail.has(String(q.id))) {
            const questionItem = document.getElementById(`fide-item-${q.id}`);
            if (questionItem) {
                const removeButton = questionItem.querySelector('.fide-actions .remove-btn');
                if (removeButton && !questionItem.classList.contains('question-removed')) {
                    toggleQuestionRemoved(removeButton, q.id);
                }
            }
        }
    });

    alert("E-posta içeriği başarıyla forma aktarıldı!");
    document.getElementById('load-email-area').value = '';
}


function startNewReport() {
    selectedStore = null;
    document.getElementById('store-search-input').value = '';
    localStorage.removeItem('lastSelectedStoreCode');
    resetForm();
    updateFormInteractivity(false);
}
function getFormDataForSaving() {
    let reportData = { selectedStore: selectedStore, questions_status: {} };
     fideQuestions.forEach(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        const isRemoved = itemDiv ? itemDiv.classList.contains('question-removed') : false;
        const titleContainer = itemDiv ? itemDiv.querySelector('.fide-title-container') : null;
        const isCompleted = titleContainer ? titleContainer.classList.contains('question-completed') : false;
        
        if (!itemDiv && q.isArchived) { return; }

        const questionData = { removed: isRemoved, completed: isCompleted, dynamicInputs: [], selectedProducts: [], selectedPops: [] };

        if (itemDiv) {
            if (q.type === 'standard') questionData.dynamicInputs = getDynamicInputsForSaving(`fide${q.id}`);
            else if (q.type === 'product_list') {
                document.querySelectorAll('#selected-products-list .selected-product-item').forEach(item => questionData.selectedProducts.push({ code: item.dataset.code, qty: item.dataset.qty }));
                questionData.dynamicInputs = getDynamicInputsForSaving(`fide${q.id}_pleksi`);
            } else if (q.type === 'pop_system') questionData.selectedPops = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value);
        }
        reportData.questions_status[q.id] = questionData;
    });
    return reportData;
}
function backupAllReports() {
    const allReports = localStorage.getItem('allFideReports');
    if (!allReports || Object.keys(JSON.parse(allReports)).length === 0) return alert('Yedeklenecek kayıtlı rapor bulunamadı.');
    const blob = new Blob([allReports], { type: 'application/json;charset=utf-8' });
    const today = new Date().toISOString().slice(0, 10);
    const filename = `fide_rapor_yedek_${today}.json`;
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
function handleRestoreUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (confirm("Bu işlem mevcut tüm raporların üzerine yazılacaktır. Devam etmek istediğinizden emin misiniz?")) {
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const restoredData = e.target.result;
                JSON.parse(restoredData); 
                localStorage.setItem('allFideReports', restoredData);
                alert('Yedek başarıyla geri yüklendi! "Yedekleme Yöneticisi" üzerinden bu yedeği bulutla eşitleyebilirsiniz.');
                window.location.reload();
            } catch (error) {
                alert('Geçersiz veya bozuk yedek dosyası!');
                console.error("Yedek yükleme hatası:", error);
            }
        };
        reader.readAsText(file);
    }
    event.target.value = null; 
}
async function handleMergeUpload(event) {
    const files = event.target.files;
    if (!files || files.length < 2) { alert("Lütfen birleştirmek için en az 2 yedek dosyası seçin."); return; }
    let mergedReports = {};
    let fileReadPromises = [];
    for (const file of files) {
        const promise = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    resolve(data);
                } catch (err) { reject(`'${file.name}' dosyası okunamadı.`); }
            };
            reader.onerror = () => reject(`'${file.name}' dosyası okunurken bir hata oluştu.`);
            reader.readAsText(file);
        });
        fileReadPromises.push(promise);
    }
    try {
        const allBackupData = await Promise.all(fileReadPromises);
        allBackupData.forEach(backupData => {
            for (const storeKey in backupData) {
                if (Object.hasOwnProperty.call(backupData, storeKey)) {
                    const newReport = backupData[storeKey];
                    if (!mergedReports[storeKey] || newReport.timestamp > mergedReports[storeKey].timestamp) {
                        mergedReports[storeKey] = newReport;
                    }
                }
            }
        });
        const mergedDataStr = JSON.stringify(mergedReports, null, 2);
        const blob = new Blob([mergedDataStr], { type: 'application/json;charset=utf-8' });
        const today = new Date().toISOString().slice(0, 10);
        const filename = `birlesik_fide_rapor_yedek_${today}.json`;
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        alert(`Başarılı! ${Object.keys(mergedReports).length} adet güncel raporu içeren birleştirilmiş yedek dosyanız '${filename}' adıyla indirildi.`);
    } catch (error) {
        alert("Birleştirme sırasında bir hata oluştu:\n" + error);
        console.error("Yedek birleştirme hatası:", error);
    } finally {
        event.target.value = null; 
    }
}
function restoreLastSession() {
    const lastStoreCode = localStorage.getItem('lastSelectedStoreCode');
    if (lastStoreCode && uniqueStores.length > 0) {
        const storeToRestore = uniqueStores.find(s => String(s.bayiKodu) === String(lastStoreCode));
        if (storeToRestore) {
            selectStore(storeToRestore);
        }
    }
}

function formatText(buttonEl, command) {
    const editor = buttonEl.closest('.manager-item').querySelector('.editable-textarea');
    editor.focus();

    if (command === 'link') {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        const anchorNode = selection.anchorNode;
        const linkElement = anchorNode.nodeType === 3 ? anchorNode.parentNode.closest('a') : anchorNode.closest('a');

        if (linkElement) {
            const currentUrl = linkElement.getAttribute('href');
            const newUrl = prompt("Köprüyü düzenleyin veya kaldırmak için bu alanı boş bırakın:", currentUrl);
            
            if (newUrl === null) {
                return;
            } else if (newUrl === "") {
                linkElement.outerHTML = linkElement.innerHTML;
            } else {
                linkElement.href = newUrl;
            }
        } else {
             if (selection.toString().length === 0) {
                alert("Lütfen köprüye dönüştürmek istediğiniz metni seçin.");
                return;
            }
            const url = prompt("Lütfen köprü için URL girin:", "https://");
            if (url) {
                document.execCommand('createLink', false, url);
                const newLink = selection.anchorNode.parentNode.closest('a');
                if (newLink) newLink.target = '_blank';
            }
        }
    } else {
         document.execCommand(command, false, null);
    }
}

function renderQuestionManager() {
    const managerList = document.getElementById('manager-list');
    managerList.innerHTML = '';
    fideQuestions.sort((a, b) => a.id - b.id).forEach(q => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'manager-item';
        itemDiv.dataset.id = q.id;
        let staticItemsHtml = (q.staticItems || []).join('<br>'); 
        const typeOptions = ['standard', 'product_list', 'pop_system'];
        const selectOptionsHTML = typeOptions.map(type => `<option value="${type}" ${q.type === type ? 'selected' : ''}>${type}</option>`).join('');
        
        const answerType = q.answerType || 'variable';
        const answerTypeOptionsHTML = `
            <option value="variable" ${answerType === 'variable' ? 'selected' : ''}>Değişken</option>
            <option value="fixed" ${answerType === 'fixed' ? 'selected' : ''}>Sabit</option>
        `;

        const isArchivedChecked = q.isArchived ? 'checked' : '';
        const wantsStoreEmailChecked = q.wantsStoreEmail ? 'checked' : '';

        itemDiv.innerHTML = `
            <div class="manager-item-grid">
                <div>
                    <label>Soru ID</label>
                    <input type="number" class="manager-id-input" value="${q.id}" disabled title="ID değiştirmek veri bütünlüğünü bozabilir. Düzenlemek için şifre gerekir.">
                </div>
                <div><label>Soru Başlığı</label><input type="text" class="question-title-input" value="${q.title}"></div>
                <div><label>Soru Tipi</label><select class="question-type-select" onchange="toggleProductManager(this)">${selectOptionsHTML}</select></div>
                <div><label>Cevap Tipi</label><select class="answer-type-select">${answerTypeOptionsHTML}</select></div>
                <div class="manager-grid-switch-group">
                    <div class="archive-switch-container">
                        <label>E-posta Ekle</label>
                        <label class="switch">
                            <input type="checkbox" class="wants-email-checkbox" ${wantsStoreEmailChecked}>
                            <span class="slider green"></span>
                        </label>
                    </div>
                    <div class="archive-switch-container">
                        <label>Arşivle</label>
                        <label class="switch">
                            <input type="checkbox" class="archive-checkbox" ${isArchivedChecked} onchange="filterManagerView()">
                            <span class="slider"></span>
                        </label>
                    </div>
                </div>
            </div>
            <div>
                <label>Statik Maddeler (product_list tipi için kullanılmaz)</label>
                <div class="editor-toolbar">
                   <button onclick="formatText(this, 'bold')" title="Kalın"><i class="fas fa-bold"></i></button>
                   <button onclick="formatText(this, 'italic')" title="İtalik"><i class="fas fa-italic"></i></button>
                   <button onclick="formatText(this, 'underline')" title="Altı Çizili"><i class="fas fa-underline"></i></button>
                   <button onclick="formatText(this, 'link')" title="Köprü Ekle/Düzenle/Kaldır"><i class="fas fa-link"></i></button>
                </div>
                <div class="editable-textarea" contenteditable="true">${staticItemsHtml}</div>
            </div>
            <div class="product-list-manager" style="display: none;"></div>
            <div class="manager-item-footer">
                <button class="btn-warning btn-sm" onclick="deleteAllAnswersForQuestion(${q.id})" title="Bu soruya ait TÜM cevapları BÜTÜN bayi raporlarından kalıcı olarak siler."><i class="fas fa-eraser"></i>Cevapları Temizle</button>
            </div>`;
        managerList.appendChild(itemDiv);

        if(q.type === 'product_list') {
            toggleProductManager(itemDiv.querySelector('select'));
        }
    });
    filterManagerView(); 
}

function toggleProductManager(selectElement) {
    const managerItem = selectElement.closest('.manager-item');
    const productManagerContainer = managerItem.querySelector('.product-list-manager');
    if (selectElement.value === 'product_list') {
        productManagerContainer.style.display = 'block';
        renderProductManagerUI(productManagerContainer);
    } else {
        productManagerContainer.style.display = 'none';
        productManagerContainer.innerHTML = '';
    }
}

function renderProductManagerUI(container) {
    const categories = productList.filter(p => p.type === 'header');
    let categoryOptions = '<option value="__end">Ana Liste (Sona Ekle)</option>';
    categories.forEach(cat => {
        categoryOptions += `<option value="${cat.name}">${cat.name}</option>`;
    });

    container.innerHTML = `
        <h4><i class="fas fa-boxes"></i> Ürün Listesi Yöneticisi</h4>
        <p class="product-manager-info">
            <i class="fas fa-info-circle"></i> Bu liste tüm "product_list" tipi sorular için ortaktır. Değişiklikleriniz tüm listeyi etkiler.
        </p>
        
        <div class="bulk-add-container">
            <h5><i class="fas fa-paste"></i> Toplu Ürün Ekle</h5>
            <p class="bulk-add-info">Her satıra bir ürün gelecek şekilde yapıştırın. Stok Kodu ile Ürün Adı arasına bir <strong>BOŞLUK</strong> bırakmanız yeterlidir (Örn: 123456 Enerji Etiketi).</p>
            <div class="bulk-add-controls">
                <select id="bulk-add-category-select" title="Ürünlerin hangi kategori altına ekleneceğini seçin.">${categoryOptions}</select>
                <textarea id="bulk-product-input" placeholder="88001 Siyah T-Shirt\n88002 Mavi Kot Pantolon..."></textarea>
            </div>
            <button class="btn-success btn-sm" onclick="parseAndAddProducts()"><i class="fas fa-plus-circle"></i> Yapıştırılanları Listeye Ekle</button>
        </div>

        <button id="toggle-detailed-editor-btn" class="btn-sm" onclick="toggleDetailedEditor(this)">
            <i class="fas fa-edit"></i> Detaylı Liste Editörünü Göster
        </button>

        <div id="detailed-editor-panel">
            <div class="product-manager-actions">
                <button class="btn-primary btn-sm" onclick="addCategoryRow(this.closest('#detailed-editor-panel').querySelector('.product-list-editor'))"><i class="fas fa-tags"></i> Kategori Ekle</button>
                <button class="btn-success btn-sm" onclick="addProductRow(this.closest('#detailed-editor-panel').querySelector('.product-list-editor'))"><i class="fas fa-box"></i> Ürün Ekle</button>
            </div>
            <div class="product-list-editor"></div>
        </div>
    `;
    
    const editor = container.querySelector('.product-list-editor');
    productList.forEach(item => {
        if(item.type === 'header') {
            addCategoryRow(editor, item);
        } else {
            addProductRow(editor, item);
        }
    });
     setupProductManagerDragDrop(editor);
}

function toggleDetailedEditor(button) {
    const panel = document.getElementById('detailed-editor-panel');
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
        button.innerHTML = '<i class="fas fa-eye-slash"></i> Detaylı Liste Editörünü Gizle';
    } else {
        button.innerHTML = '<i class="fas fa-edit"></i> Detaylı Liste Editörünü Göster';
    }
}

function parseAndAddProducts() {
    const container = document.querySelector('.product-list-manager:not([style*="display: none"])');
    if (!container) return; 

    const textarea = container.querySelector('#bulk-product-input');
    const editor = container.querySelector('.product-list-editor');
    const categorySelect = container.querySelector('#bulk-add-category-select');
    const selectedCategoryName = categorySelect.value;
    const text = textarea.value.trim();
    if (!text) return;

    const lines = text.split('\n');
    let addedCount = 0;
    
    let targetElement = null;
    if (selectedCategoryName !== '__end') {
        const allRows = Array.from(editor.querySelectorAll('.category-manager-row, .product-manager-row'));
        const categoryIndex = allRows.findIndex(row => row.dataset.type === 'category' && row.querySelector('input').value === selectedCategoryName);

        if (categoryIndex > -1) {
            targetElement = allRows[categoryIndex]; 
            for (let i = categoryIndex + 1; i < allRows.length; i++) {
                if (allRows[i].dataset.type === 'category') break; 
                targetElement = allRows[i];
            }
        }
    }

    lines.forEach(line => {
        const trimmedLine = line.trim();
        if (!trimmedLine) return;

        const firstSpaceIndex = trimmedLine.indexOf(' ');

        if (firstSpaceIndex > 0 && firstSpaceIndex < trimmedLine.length - 1) {
            const product = {
                code: trimmedLine.substring(0, firstSpaceIndex).trim(),
                name: trimmedLine.substring(firstSpaceIndex + 1).trim()
            };
            
            if (product.code && product.name) {
                const newRow = addProductRow(editor, product, targetElement);
                targetElement = newRow; 
                addedCount++;
            }
        }
    });

    if (addedCount > 0) {
        alert(`${addedCount} adet ürün başarıyla eklendi!`);
        textarea.value = '';
        const panel = document.getElementById('detailed-editor-panel');
        if (panel && !panel.classList.contains('open')) {
            document.getElementById('toggle-detailed-editor-btn').click();
        }
    } else {
        alert("Hiçbir ürün eklenemedi. Lütfen formatı kontrol edin (Stok Kodu BOŞLUK Ürün Adı).");
    }
}

function addCategoryRow(container, category = {}, targetElement = null) {
    const row = document.createElement('div');
    row.className = 'category-manager-row';
    row.dataset.type = 'category';
    row.draggable = true;
    row.innerHTML = `
        <i class="fas fa-grip-vertical drag-handle" title="Sıralamak için sürükleyin"></i>
        <i class="fas fa-tag category-icon"></i>
        <input type="text" placeholder="Kategori Adı" value="${category.name || ''}">
        <button class="btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>
    `;
    if (targetElement) {
        container.insertBefore(row, targetElement.nextSibling);
    } else {
        container.appendChild(row);
    }
    return row;
}

function addProductRow(container, product = {}, targetElement = null) {
    const row = document.createElement('div');
    row.className = 'product-manager-row';
    row.dataset.type = 'product';
    row.draggable = true;
    row.innerHTML = `
        <i class="fas fa-grip-vertical drag-handle" title="Sıralamak için sürükleyin"></i>
        <input type="text" class="product-code" placeholder="Stok Kodu" value="${product.code || ''}">
        <input type="text" class="product-name" placeholder="Ürün Adı" value="${product.name || ''}">
        <button class="btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>
    `;
    
    if (targetElement) {
        container.insertBefore(row, targetElement.nextSibling);
    } else {
        container.appendChild(row);
    }
    return row;
}

function setupProductManagerDragDrop(container) {
    let draggingElement = null;

    container.addEventListener('dragstart', e => {
        draggingElement = e.target;
        setTimeout(() => {
            e.target.classList.add('dragging');
        }, 0);
    });

    container.addEventListener('dragend', e => {
        if (draggingElement) {
            draggingElement.classList.remove('dragging');
            draggingElement = null;
        }
    });

    container.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        const currentlyDragged = document.querySelector('.dragging');
        if (currentlyDragged) {
            if (afterElement == null) {
                container.appendChild(currentlyDragged);
            } else {
                container.insertBefore(currentlyDragged, afterElement);
            }
        }
    });

    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('[draggable="true"]:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY }).element;
    }
}


function filterManagerView() {
    const viewActiveBtn = document.getElementById('view-active-btn');
    const viewArchivedBtn = document.getElementById('view-archived-btn');
    const addNewBtn = document.getElementById('add-new-question-btn');
    const deleteAllArchivedBtn = document.getElementById('delete-all-archived-btn');
    const restoreAllArchivedBtn = document.getElementById('restore-all-archived-btn');

    viewActiveBtn.classList.toggle('active', currentManagerView === 'active');
    viewArchivedBtn.classList.toggle('active', currentManagerView === 'archived');
    
    addNewBtn.style.display = currentManagerView === 'active' ? 'inline-flex' : 'none';
    deleteAllArchivedBtn.style.display = currentManagerView === 'archived' ? 'inline-flex' : 'none';
    restoreAllArchivedBtn.style.display = currentManagerView === 'archived' ? 'inline-flex' : 'none';

    const items = document.querySelectorAll('#manager-list .manager-item');
    let visibleItemCount = 0;
    items.forEach(item => {
        const isArchived = item.querySelector('.archive-checkbox').checked;
        const shouldBeVisible = (currentManagerView === 'active' && !isArchived) || (currentManagerView === 'archived' && isArchived);
        item.classList.toggle('hidden-question', !shouldBeVisible);
        if(shouldBeVisible) visibleItemCount++;
    });

    if (currentManagerView === 'archived') {
        deleteAllArchivedBtn.disabled = visibleItemCount === 0;
        restoreAllArchivedBtn.disabled = visibleItemCount === 0;
    }
}

function addNewQuestionUI() {
    if (currentManagerView !== 'active') {
        alert("Yeni soru eklemek için 'Aktif Sorular' görünümünde olmalısınız.");
        return;
    }
    const managerList = document.getElementById('manager-list');
    const existingIds = Array.from(managerList.querySelectorAll('.manager-item')).map(item => parseInt(item.querySelector('.manager-id-input').value));
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'manager-item';
    itemDiv.style.backgroundColor = '#dcfce7';
    itemDiv.dataset.id = newId;
    itemDiv.innerHTML = `
        <div class="manager-item-grid">
            <div>
                <label>Soru ID</label>
                <input type="number" class="manager-id-input" value="${newId}">
            </div>
            <div><label>Soru Başlığı</label><input type="text" class="question-title-input" placeholder="Yeni sorunun başlığını yazın..."></div>
            <div><label>Soru Tipi</label><select class="question-type-select" onchange="toggleProductManager(this)"><option value="standard" selected>standard</option><option value="product_list">product_list</option><option value="pop_system">pop_system</option></select></div>
            <div>
                <label>Cevap Tipi</label>
                <select class="answer-type-select">
                    <option value="variable" selected>Değişken</option>
                    <option value="fixed">Sabit</option>
                </select>
            </div>
            <div class="manager-grid-switch-group">
                <div class="archive-switch-container">
                    <label>E-posta Ekle</label>
                    <label class="switch">
                        <input type="checkbox" class="wants-email-checkbox">
                        <span class="slider green"></span>
                    </label>
                </div>
                <div class="archive-switch-container">
                    <label>Arşivle</label>
                    <label class="switch">
                        <input type="checkbox" class="archive-checkbox" onchange="filterManagerView()">
                        <span class="slider"></span>
                    </label>
                </div>
            </div>
        </div>
        <div>
            <label>Statik Maddeler (product_list tipi için kullanılmaz)</label>
            <div class="editor-toolbar">
               <button onclick="formatText(this, 'bold')" title="Kalın"><i class="fas fa-bold"></i></button>
               <button onclick="formatText(this, 'italic')" title="İtalik"><i class="fas fa-italic"></i></button>
               <button onclick="formatText(this, 'underline')" title="Altı Çizili"><i class="fas fa-underline"></i></button>
               <button onclick="formatText(this, 'link')" title="Köprü Ekle/Düzenle/Kaldır"><i class="fas fa-link"></i></button>
            </div>
            <div class="editable-textarea" contenteditable="true"></div>
        </div>
        <div class="product-list-manager" style="display: none;"></div>
        <div class="manager-item-footer"><button class="btn-sm" onclick="this.parentElement.parentElement.remove()"><i class="fas fa-times"></i> İptal Et</button></div>`;
    managerList.appendChild(itemDiv);
    itemDiv.querySelector('input[type="text"]').focus();
}

function restoreAllArchivedQuestions() {
    const itemsToRestore = document.querySelectorAll('#manager-list .manager-item:not(.hidden-question)');
    if (itemsToRestore.length === 0) {
        alert("Aktif edilecek arşivlenmiş soru bulunamadı.");
        return;
    }
    if (confirm(`Arşivdeki ${itemsToRestore.length} sorunun tümünü aktif hale getirmek istediğinizden emin misiniz?`)) {
        itemsToRestore.forEach(item => {
            const checkbox = item.querySelector('.archive-checkbox');
            if (checkbox) checkbox.checked = false;
        });
        filterManagerView();
        alert("Arşivlenmiş tüm sorular aktif hale getirildi. Değişiklikleri kalıcı hale getirmek için 'Kaydet' butonuna tıklayın.");
    }
}

function deleteAllArchivedQuestions() {
    const itemsToDelete = document.querySelectorAll('#manager-list .manager-item:not(.hidden-question)');
    if (itemsToDelete.length === 0) {
        alert("Silinecek arşivlenmiş soru bulunamadı.");
        return;
    }
    if (confirm(`Arşivdeki ${itemsToDelete.length} sorunun tümünü kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
        itemsToDelete.forEach(item => {
             item.style.transition = 'opacity 0.5s ease';
            item.style.opacity = '0';
            setTimeout(() => {
                item.style.display = 'none';
                item.classList.add('to-be-deleted');
            }, 500);
        });
         document.getElementById('delete-all-archived-btn').disabled = true;
         alert("Arşivlenmiş sorular silinmek üzere işaretlendi. Değişiklikleri kalıcı hale getirmek için 'Kaydet' butonuna tıklayın.");
    }
}

async function deleteAllAnswersForQuestion(questionId) {
    const questionTitle = document.querySelector(`.manager-item[data-id="${questionId}"] .question-title-input`).value;
    const confirmation = confirm(`DİKKAT! Bu işlem geri alınamaz.\n\nFiDe ${questionId} ("${questionTitle}") sorusuna ait TÜM cevapları, BÜTÜN bayi raporlarından kalıcı olarak silmek istediğinizden emin misiniz?`);
    
    if (!confirmation) {
        alert("İşlem iptal edildi.");
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        const localDataString = localStorage.getItem('allFideReports');
        if (localDataString) {
            let allReports = JSON.parse(localDataString);
            for (const storeKey in allReports) {
                if (allReports[storeKey] && allReports[storeKey].data && allReports[storeKey].data.questions_status && allReports[storeKey].data.questions_status[questionId]) {
                    delete allReports[storeKey].data.questions_status[questionId];
                }
            }
            localStorage.setItem('allFideReports', JSON.stringify(allReports));
        }

        if (auth.currentUser && database) {
            const reportsRef = database.ref('allFideReports');
            const snapshot = await reportsRef.once('value');
            if (snapshot.exists()) {
                let allCloudReports = snapshot.val();
                for (const storeKey in allCloudReports) {
                    if (allCloudReports[storeKey] && allCloudReports[storeKey].data && allCloudReports[storeKey].data.questions_status && allCloudReports[storeKey].data.questions_status[questionId]) {
                        delete allCloudReports[storeKey].data.questions_status[questionId];
                    }
                }
                await reportsRef.set(allCloudReports);
            }
        }
        
        alert(`İşlem tamamlandı!\n\nFiDe ${questionId} sorusuna ait tüm cevaplar bütün raporlardan (hem yerel hem de bulut) başarıyla silindi.`);

    } catch (error) {
        console.error("Cevapları silerken bir hata oluştu:", error);
        alert("Bir hata oluştu! Cevaplar silinemedi. Lütfen konsolu kontrol edin.");
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function saveQuestions() {
    if (!auth.currentUser || !database) {
        alert("Değişiklikleri buluta kaydetmek için lütfen giriş yapın.");
        return;
    }

    const newProductList = [];
    const activeProductManager = document.querySelector('.product-list-manager:not([style*="display: none"])');
    
    if (activeProductManager) {
        const rows = activeProductManager.querySelectorAll('.category-manager-row, .product-manager-row');
        rows.forEach(row => {
            if (row.dataset.type === 'category') {
                const name = row.querySelector('input').value.trim();
                if (name) newProductList.push({ type: 'header', name });
            } else if (row.dataset.type === 'product') {
                const code = row.querySelector('.product-code').value.trim();
                const name = row.querySelector('.product-name').value.trim();
                if (code && name) newProductList.push({ code, name });
            }
        });
    } else {
         productList.forEach(p => newProductList.push(p));
    }

    const newQuestions = [];
    const ids = new Set();
    const items = document.querySelectorAll('#manager-list .manager-item');
    
    for (const item of items) {
        if (item.classList.contains('to-be-deleted')) continue;

        const id = parseInt(item.querySelector('.manager-id-input').value);
        const title = item.querySelector('.question-title-input').value.trim();
        const type = item.querySelector('.question-type-select').value;
        const answerType = item.querySelector('.answer-type-select').value;
        const staticItemsHTML = item.querySelector('.editable-textarea').innerHTML;
        const isArchived = item.querySelector('.archive-checkbox').checked;
        const wantsStoreEmail = item.querySelector('.wants-email-checkbox').checked;


        if (!id && id !== 0 || !title) { alert(`ID veya Başlık boş olamaz.`); return; }
        if(ids.has(id)) { alert(`HATA: ${id} ID'si mükerrer kullanılamaz.`); return; }
        ids.add(id);

        const staticItems = staticItemsHTML.split(/<br\s*\/?>/gi).map(s => s.trim()).filter(s => s);
        const newQuestion = { id, title, type, answerType };
        if (staticItems.length > 0 && type !== 'product_list') newQuestion.staticItems = staticItems;
        if (isArchived) newQuestion.isArchived = true;
        if (wantsStoreEmail) newQuestion.wantsStoreEmail = true;


        if (type === 'pop_system') {
            const originalPopQuestion = fideQuestions.find(q => q.type === 'pop_system');
            newQuestion.popCodes = popCodes || (originalPopQuestion ? originalPopQuestion.popCodes : []);
            newQuestion.expiredCodes = expiredCodes || (originalPopQuestion ? originalPopQuestion.expiredCodes : []);
        }
        newQuestions.push(newQuestion);
    }

    newQuestions.sort((a, b) => a.id - b.id);

    const finalJsonData = {
        questions: newQuestions,
        productList: newProductList
    };

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        const questionsRef = database.ref('fideQuestionsData');
        await questionsRef.set(finalJsonData);
        alert("Değişiklikler başarıyla buluta kaydedildi. Sayfa yenileniyor...");
        window.location.reload();
    } catch (error) {
        console.error("Sorular buluta kaydedilirken hata oluştu:", error);
        alert("HATA: Değişiklikler buluta kaydedilemedi. Lütfen internet bağlantınızı kontrol edin ve tekrar deneyin.");
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

// --- YENİ EKLENEN E-POSTA YÖNETİCİSİ FONKSİYONLARI ---
function renderEmailManager() {
    const listContainer = document.getElementById('email-manager-list');
    const filterText = document.getElementById('email-search-input').value.toLowerCase();
    listContainer.innerHTML = '';

    const filteredEntries = Object.entries(storeEmails).filter(([kodu, email]) => {
        return kodu.toLowerCase().includes(filterText) || email.toLowerCase().includes(filterText);
    });
    
    if(filteredEntries.length === 0) {
         listContainer.innerHTML = '<p class="empty-list-message">Eşleşen bayi e-postası bulunamadı veya hiç e-posta eklenmedi.</p>';
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
     if (!auth.currentUser || !database) { alert("Bu işlem için sisteme giriş yapmalısınız."); return; }
     if (confirm(`'${kodu}' kodlu bayiye ait e-postayı silmek istediğinizden emin misiniz?`)) {
         try {
             await database.ref(`storeEmails/${kodu}`).remove();
             delete storeEmails[kodu];
             localStorage.setItem('fideStoreEmails', JSON.stringify(storeEmails));
             document.querySelector(`.email-manager-item[data-kodu="${kodu}"]`).remove();
         } catch(error) {
             alert("E-posta silinirken bir hata oluştu: " + error.message);
         }
     }
}

function addNewEmailUI() {
    const listContainer = document.getElementById('email-manager-list');
    if (document.querySelector('.email-manager-item.new-item')) {
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
                const parts = line.trim().split(/\s+/); // Boşluk veya tab ile ayır
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
                localStorage.setItem('fideStoreEmails', JSON.stringify(storeEmails));
                alert('Toplu e-posta yüklemesi başarıyla tamamlandı!');
                renderEmailManager();
            }

        } catch (error) {
            alert('Dosya okunurken veya işlenirken bir hata oluştu!');
            console.error("Toplu e-posta yükleme hatası:", error);
        }
    };
    reader.readAsText(file);
    event.target.value = null; // Aynı dosyayı tekrar seçebilmek için
}
// --- BİTİŞ: E-POSTA YÖNETİCİSİ FONKSİYONLARI ---


function updateFormInteractivity(enable) {
    const formContent = document.getElementById('form-content');
    if (!formContent) return;

    const buttons = formContent.querySelectorAll(
        '.add-item-btn, .status-btn, .remove-btn, .delete-bar, .delete-item-btn, .product-adder button'
    );
    const inputs = formContent.querySelectorAll(
        '#product-selector, #product-qty'
    );

    buttons.forEach(btn => {
        btn.disabled = !enable;
    });
    inputs.forEach(input => {
        input.disabled = !enable;
    });
}