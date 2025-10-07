// --- Global Değişkenler ---
let dideData = [], fideData = [], uniqueStores = [], selectedStore = null;
let fideQuestions = [], popCodes = [], expiredCodes = [], productList = [], expiredExcelFiles = [];
let migrationMap = {}, storeEmails = {}, allStoresList = [];
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
const monthNames = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let isFirebaseConnected = false;

// --- Ana Uygulama Mantığı ---
window.onload = initializeApp;

async function initializeApp() {
    // NOT: Kullanıcı giriş bilgisinin kalıcılığını LOCAL'den SESSION'a çevirmek daha güvenli olabilir.
    // Şimdilik orijinal haliyle (LOCAL) bırakıyorum. İsterseniz değiştirebiliriz.
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
        await loadInitialData();
        setupEventListeners();
        updateFormInteractivity(selectedStore !== null);
    });
}

async function loadStoreEmails() {
    const user = auth.currentUser;
    storeEmails = {}; 
    if (user && database) {
        try {
            const emailsRef = database.ref('storeEmails');
            const snapshot = await emailsRef.once('value');
            if (snapshot.exists()) {
                storeEmails = snapshot.val();
            }
        } catch (error) {
            console.error("Buluttan bayi e-postaları yüklenemedi:", error);
        }
    }
}

async function loadAllStoresList() {
    const user = auth.currentUser;
    allStoresList = [];
    if (user && database) {
        try {
            const storesRef = database.ref('tumBayilerListesi/stores');
            const snapshot = await storesRef.once('value');
            if (snapshot.exists()) {
                allStoresList = snapshot.val();
            }
        } catch (error) {
            console.error("Buluttan ana bayi listesi yüklenemedi:", error);
        }
    }
}

async function loadMigrationMap() {
    const user = auth.currentUser;
    migrationMap = {}; 
    if (user && database) {
        try {
            const migrationRef = database.ref('migrationSettings/map');
            const snapshot = await migrationRef.once('value');
            if (snapshot.exists()) {
                migrationMap = snapshot.val();
            }
        } catch (error) {
            console.error("Buluttan veri taşıma ayarları yüklenemedi:", error);
        }
    }
}

async function loadInitialData() {
    if (!auth.currentUser) {
        buildForm();
        return;
    }
    
    await loadMigrationMap();
    await loadStoreEmails();
    await loadAllStoresList();
    let questionsLoaded = false;

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
    
    if (!questionsLoaded) {
        fideQuestions = fallbackFideQuestions;
        document.getElementById('initialization-error').style.display = 'block';
    }

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
    buildForm();
}

async function loadExcelData() {
    const user = auth.currentUser;
    if (!user || !database) return;

    try {
        const dideRef = database.ref('excelData/dide');
        const dideSnapshot = await dideRef.once('value');
        if (dideSnapshot.exists()) {
            const storedData = dideSnapshot.val();
            if (storedData.filename) { document.getElementById('file-name').textContent = `Buluttan yüklendi: ${storedData.filename}`; }
            populateDideState(storedData.data);
        }

        const fideRef = database.ref('excelData/fide');
        const fideSnapshot = await fideRef.once('value');
        if (fideSnapshot.exists()) {
            const storedData = fideSnapshot.val();
            if (storedData.filename) { document.getElementById('fide-file-name').textContent = `Buluttan yüklendi: ${storedData.filename}`; }
            populateFideState(storedData.data);
        }
    } catch (error) {
        console.error("Buluttan Excel verileri yüklenirken hata oluştu:", error);
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

function returnToMainPage() {
    const emailDraft = document.getElementById('email-draft-container');
    if (emailDraft) emailDraft.remove();
    document.getElementById('dide-upload-card').style.display = 'block';
    document.getElementById('form-content').style.display = 'block';
    document.querySelector('.action-button').style.display = 'block';
}

function setupEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    document.getElementById('excel-file-input').addEventListener('change', (e) => handleFileSelect(e, 'dide'));
    document.getElementById('fide-excel-file-input').addEventListener('change', (e) => handleFileSelect(e, 'fide'));
    document.getElementById('new-report-btn').addEventListener('click', startNewReport);
    
    // TEMİZLENDİ: Yönetim paneli ile ilgili tüm event listener'lar kaldırıldı.
    
    document.getElementById('clear-storage-btn').addEventListener('click', () => {
        const dogruSifreHash = 'ZmRlMDAx';
        const girilenSifre = prompt("Bu işlem geri alınamaz. Buluttaki TÜM uygulama verilerini kalıcı olarak silmek için lütfen şifreyi girin:");

        if (girilenSifre) { 
            const girilenSifreHash = btoa(girilenSifre);
            if (girilenSifreHash === dogruSifreHash) {
                if (confirm("Şifre doğru. Emin misiniz? Kaydedilmiş TÜM bayi raporları, yüklenmiş Excel dosyaları ve diğer ayarlar dahil olmak üzere bulutta saklanan BÜTÜN uygulama verileri kalıcı olarak silinecektir.")) {
                    if(auth.currentUser && database){
                        database.ref('allFideReports').remove();
                        database.ref('excelData').remove();
                        database.ref('migrationSettings').remove();
                        database.ref('storeEmails').remove();
                        alert("Tüm bulut verileri başarıyla temizlendi. Sayfa yenileniyor.");
                        window.location.reload();
                    } else {
                        alert("Bu işlem için giriş yapmış olmalısınız.");
                    }
                }
            } else {
                alert("Hatalı şifre! Silme işlemi iptal edildi.");
            }
        }
    });
    document.getElementById('clear-excel-btn').addEventListener('click', () => {
        if (confirm("Yüklenmiş olan DiDe Excel verisini buluttan silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
            if(auth.currentUser && database) {
                database.ref('excelData/dide').remove();
                alert("DiDe Excel verisi buluttan temizlendi. Sayfa yenileniyor.");
                window.location.reload();
            } else {
                alert("Bu işlem için giriş yapmış olmalısınız.");
            }
        }
    });
     document.getElementById('clear-fide-excel-btn').addEventListener('click', () => {
        if (confirm("Yüklenmiş olan FiDe Excel verisini buluttan silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
            if(auth.currentUser && database) {
                database.ref('excelData/fide').remove();
                alert("FiDe Excel verisi buluttan temizlendi. Sayfa yenileniyor.");
                window.location.reload();
            } else {
                alert("Bu işlem için giriş yapmış olmalısınız.");
            }
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
}

// TEMİZLENDİ: Yönetim Paneli ve Veri Bakım Araçları ile ilgili tüm fonksiyonlar (showModal, backupAllReports, analyzeOrphanReports vb.) kaldırıldı.

// --- MEVCUT ANA SAYFA FONKSİYONLARI ---
function saveFormState(isFinalizing = false) {
    if (!document.getElementById('form-content').innerHTML || !selectedStore || !auth.currentUser || !database) return;

    const reportData = getFormDataForSaving();
    const storeKey = `store_${selectedStore.bayiKodu}`;
    const firebaseStoreRef = database.ref('allFideReports/' + storeKey);
    const bayiKodu = String(selectedStore.bayiKodu);

    firebaseStoreRef.once('value').then(snapshot => {
        const existingReport = snapshot.val();
        if (existingReport && existingReport.data && existingReport.data.auditCompletedTimestamp) {
            reportData.auditCompletedTimestamp = existingReport.data.auditCompletedTimestamp;
        }

        if (isFinalizing) {
            reportData.auditCompletedTimestamp = new Date().getTime();
        }

        const dataToSave = { timestamp: new Date().getTime(), data: reportData };
        firebaseStoreRef.set(dataToSave)
            .then(() => {
                if (isFinalizing) {
                    removeStoreCodeFromRevertedList(bayiKodu);
                }
            })
            .catch(error => console.error("Firebase'e yazma hatası:", error));
    });
}

async function removeStoreCodeFromRevertedList(bayiKodu) {
    if (!auth.currentUser || !database) return;

    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
    const geriAlinanlarRef = database.ref('denetimGeriAlinanlar');

    try {
        const snapshot = await geriAlinanlarRef.once('value');
        let geriAlinanlar = snapshot.exists() ? snapshot.val() : {};

        if (geriAlinanlar[currentMonthKey]) {
            const index = geriAlinanlar[currentMonthKey].indexOf(bayiKodu);
            if (index > -1) {
                geriAlinanlar[currentMonthKey].splice(index, 1);
                
                await geriAlinanlarRef.set(geriAlinanlar);
                console.log(`Bayi ${bayiKodu} geri alınanlar listesinden başarıyla çıkarıldı.`);
            }
        }
    } catch (error) {
        console.error("Geri alınanlar listesi güncellenirken hata oluştu:", error);
    }
}

function loadReportForStore(bayiKodu) {
    const storeKey = `store_${bayiKodu}`;
    if (database && auth.currentUser) {
        const firebaseStoreRef = database.ref('allFideReports/' + storeKey);
        firebaseStoreRef.once('value', (snapshot) => {
            if (snapshot.exists()) { 
                loadReport(snapshot.val().data); 
            } else { 
                resetForm(); 
            }
        }).catch(error => {
            console.error("Firebase'den okuma hatası:", error);
            resetForm();
        });
    } else {
        resetForm();
    }
}

// ... Geri kalan tüm fonksiyonlar (getUnitForProduct, resetForm, generateQuestionHtml, buildForm, ...) aynı şekilde kalacak.
// Buraya, size gönderdiğim main.js dosyasındaki bu satırdan sonraki tüm fonksiyonları ekleyebilirsiniz.
// Sadece yönetim paneli ile ilgili olanlar silinmiştir.