// --- Global Değişkenler ---
let dideData = [], fideData = [], uniqueStores = [], selectedStore = null;
let fideQuestions = [], popCodes = [], expiredCodes = [], productList = [], expiredExcelFiles = [];
let migrationMap = {}, storeEmails = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan veya yerel dosyadan yüklenemedi." }];
const monthNames = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let isFirebaseConnected = false;
let currentFormMode = 'fide'; // YENİ: Hangi formun aktif olduğunu tutar ('fide' veya 'special')

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
    
    if (!questionsLoaded) {
         try {
            const response = await fetch(`fide_soru_listesi.json?v=${new Date().getTime()}`);
            if (!response.ok) throw new Error('Soru dosyası bulunamadı.');
            const jsonData = await response.json();
            
            fideQuestions = jsonData.questions || [];
            productList = jsonData.productList || [];
            
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
    document.getElementById('backup-manager').style.display = 'none';

    document.getElementById('dide-upload-card').style.display = 'block';
    document.querySelector('#load-from-email-section').style.display = 'block';
    
    if (currentFormMode === 'fide') {
        document.getElementById('form-content').style.display = 'block';
    } else {
        document.getElementById('special-visit-form').style.display = 'block';
    }

    document.querySelector('.action-button').style.display = 'block';
    
    const emailDraft = document.getElementById('email-draft-container');
     if (emailDraft) emailDraft.remove();
}

function returnToMainPage() {
    const emailDraft = document.getElementById('email-draft-container');
    if (emailDraft) emailDraft.remove();
    
    document.getElementById('dide-upload-card').style.display = 'block';
    document.querySelector('#load-from-email-section').style.display = 'block';
    
    if (currentFormMode === 'fide') {
        document.getElementById('form-content').style.display = 'block';
    } else {
        document.getElementById('special-visit-form').style.display = 'block';
    }
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
    document.getElementById('load-from-email-btn').addEventListener('click', parseAndLoadFromEmail);

    document.getElementById('special-visit-btn').addEventListener('click', startSpecialVisit);
    document.getElementById('add-special-note-btn').addEventListener('click', () => addSpecialNoteInput());
    
    document.getElementById('new-fide-audit-btn').addEventListener('click', startNewFideAuditForCurrentStore);
    
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
                   document.querySelector('#load-from-email-section').style.display = 'none';
                   document.getElementById('form-content').style.display = 'none';
                   document.getElementById('special-visit-form').style.display = 'none';
                   document.querySelector('.action-button').style.display = 'none';
                } else {
                    alert("Hatalı şifre!");
                }
            }
        } else {
            closeManager();
        }
    });
}

// --- GÜNCELLENEN FONKSİYON ---
// Onay penceresi kaldırıldı.
function startNewFideAuditForCurrentStore() {
    if (!selectedStore) {
        alert('Bu işlemi yapmak için önce bir bayi seçmelisiniz.');
        return;
    }
    resetForm(); 
    updateFormInteractivity(true); 
}


function showFiDeForm() {
    currentFormMode = 'fide';
    document.getElementById('form-content').style.display = 'block';
    document.getElementById('special-visit-form').style.display = 'none';
    document.getElementById('load-from-email-section').style.display = 'block';
    updateFormInteractivity(selectedStore !== null);
}

function showSpecialVisitForm() {
    currentFormMode = 'special';
    document.getElementById('form-content').style.display = 'none';
    document.getElementById('special-visit-form').style.display = 'block';
    document.getElementById('load-from-email-section').style.display = 'none'; 
    updateFormInteractivity(selectedStore !== null);
}

// --- GÜNCELLENEN FONKSİYON ---
// Materyal sorusunu standart bir soru kutusu (.fide-item) içinde oluşturur.
function renderSpecialVisitPopSystem() {
    const container = document.getElementById('special-visit-pop-system-container');
    if (!container) return;

    const popQuestion = fideQuestions.find(q => q.id === 14 && q.type === 'pop_system');
    if (!popQuestion) {
        container.innerHTML = '<p>Materyal listesi (FiDe 14) yüklenemedi.</p>';
        return;
    }

    let popCodesHTML = popCodes.map(code => `
        <label class="checkbox-label">
            <input type="checkbox" value="${code}" class="special-pop-checkbox" onchange="saveFormState()">
            ${code}
        </label>
    `).join('');

    container.innerHTML = `
        <div class="fide-item">
            <div class="fide-title-container">
                <p><span class="badge">FiDe ${popQuestion.id}</span> ${popQuestion.title}</p>
            </div>
            <div class="input-area">
                <div class="pop-container">${popCodesHTML}</div>
                <div class="pop-button-container">
                    <button class="btn-success btn-sm" onclick="copySpecialPopCodes()" title="Seçili olan geçerli POP kodlarını panoya kopyalar.">Kopyala</button>
                    <button class="btn-danger btn-sm" onclick="clearSpecialPopCodes()" title="Tüm POP kodu seçimlerini temizler.">Temizle</button>
                    <button class="btn-primary btn-sm" onclick="selectSpecialExpiredCodes()" title="Süresi dolmuş olan tüm POP kodlarını otomatik olarak seçer.">Bitenler</button>
                    <button class="btn-primary btn-sm" onclick="openSpecialPopEmailDraft()" title="Seçili POP kodları için bir e-posta taslağı penceresi açar.">E-Posta</button>
                </div>
            </div>
        </div>
    `;
}

function startSpecialVisit() {
    if (!selectedStore) {
        alert('Lütfen önce bir bayi seçin.');
        return;
    }

    showSpecialVisitForm();
    const notesContainer = document.getElementById('special-notes-container');
    notesContainer.innerHTML = ''; 

    renderSpecialVisitPopSystem();

    const allReports = JSON.parse(localStorage.getItem('allFideReports')) || {};
    const storeKey = `store_${selectedStore.bayiKodu}`;
    const existingReport = allReports[storeKey];

    if (existingReport && existingReport.data && existingReport.data.isSpecialVisit) {
        if (existingReport.data.notes && existingReport.data.notes.length > 0) {
            existingReport.data.notes.forEach(note => addSpecialNoteInput(false, note));
        } else {
            addSpecialNoteInput(true);
        }
        if (existingReport.data.specialPopCodes && existingReport.data.specialPopCodes.length > 0) {
            existingReport.data.specialPopCodes.forEach(code => {
                const cb = document.querySelector(`.special-pop-checkbox[value="${code}"]`);
                if (cb) cb.checked = true;
            });
        }
    } else {
        addSpecialNoteInput(true);
    }
}


function addSpecialNoteInput(isFirst = false, value = '') {
    const container = document.getElementById('special-notes-container');
    const newItem = document.createElement('div');
    newItem.className = 'dynamic-input-item';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Notu veya eksiği yazın...';
    input.value = value;
    input.addEventListener('blur', saveFormState);

    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-bar btn-danger';
    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
    deleteButton.onclick = function() { 
        this.parentElement.remove(); 
        saveFormState();
    };
    deleteButton.title = "Bu satırı sil.";

    newItem.appendChild(input);
    newItem.appendChild(deleteButton);
    container.appendChild(newItem);

    if (isFirst) {
        input.focus();
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

async function saveFormState(isFinalizing = false) {
    if (!selectedStore) return;

    let allReports = JSON.parse(localStorage.getItem('allFideReports')) || {};
    const storeKey = `store_${selectedStore.bayiKodu}`;
    let reportData;

    if (currentFormMode === 'special') {
        const notes = [];
        document.querySelectorAll('#special-notes-container input[type="text"]').forEach(input => {
            const noteText = input.value.trim();
            if (noteText) notes.push(noteText);
        });

        const specialPopCodes = [];
        document.querySelectorAll('.special-pop-checkbox:checked').forEach(input => {
            specialPopCodes.push(input.value);
        });

        reportData = {
            selectedStore: selectedStore,
            isSpecialVisit: true,
            notes: notes,
            specialPopCodes: specialPopCodes
        };
    } else { 
        reportData = getFideFormDataForSaving();
    }

    const existingReport = allReports[storeKey];
    if (existingReport && existingReport.data && existingReport.data.auditCompletedTimestamp) {
        reportData.auditCompletedTimestamp = existingReport.data.auditCompletedTimestamp;
    }

    if (isFinalizing) {
        reportData.auditCompletedTimestamp = new Date().getTime();

        try {
            const today = new Date();
            const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
            const localGeriAlinanlarJSON = localStorage.getItem('denetimGeriAlinanlar');
            if (localGeriAlinanlarJSON) {
                let geriAlinanlar = JSON.parse(localGeriAlinanlarJSON);
                if (geriAlinanlar[currentMonthKey] && geriAlinanlar[currentMonthKey].includes(String(selectedStore.bayiKodu))) {
                    geriAlinanlar[currentMonthKey] = geriAlinanlar[currentMonthKey].filter(code => code !== String(selectedStore.bayiKodu));
                    
                    localStorage.setItem('denetimGeriAlinanlar', JSON.stringify(geriAlinanlar));
                    
                    if (database && auth.currentUser) {
                        const firebaseRef = database.ref('denetimGeriAlinanlar/' + currentMonthKey);
                        await firebaseRef.set(geriAlinanlar[currentMonthKey]);
                    }
                }
            }
        } catch (error) {
            console.error("Denetim 'geri alınanlar' listesinden çıkarılırken bir hata oluştu:", error);
        }
    }

    const dataToSave = { timestamp: new Date().getTime(), data: reportData };
    allReports[storeKey] = dataToSave;

    localStorage.setItem('allFideReports', JSON.stringify(allReports));
    if (database && auth.currentUser) {
        const firebaseStoreRef = database.ref('allFideReports/' + storeKey);
        firebaseStoreRef.set(dataToSave)
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

function resetForm() { 
    document.getElementById('form-content').innerHTML = ''; 
    buildForm(); 
    showFiDeForm();
}

async function generateEmail() {
    if (!selectedStore) {
        alert('Lütfen denetime başlamadan önce bir bayi seçin!');
        return;
    }
    await saveFormState(true); 

    const storeInfo = dideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    if (!storeInfo) {
        alert("Seçilen bayi için DiDe verisi bulunamadı. Lütfen DiDe Excel dosyasını yükleyin.");
        return;
    }
    
    let finalEmailBody = '';
    const bayiYonetmeniFullName = storeInfo['Bayi Yönetmeni'] || '';
    const yonetmenFirstName = bayiYonetmeniFullName.split(' ')[0];
    const shortBayiAdi = selectedStore.bayiAdi.length > 20 ? selectedStore.bayiAdi.substring(0, 20) + '...' : selectedStore.bayiAdi;

    if (currentFormMode === 'special') {
        const notes = [];
        document.querySelectorAll('#special-notes-container input[type="text"]').forEach(input => {
            const noteText = input.value.trim();
            if (noteText) notes.push(noteText);
        });

        const selectedSpecialPops = Array.from(document.querySelectorAll('.special-pop-checkbox:checked')).map(cb => cb.value);

        if (notes.length === 0 && selectedSpecialPops.length === 0) {
            alert("E-posta oluşturmak için en az bir not girmeli veya materyal seçmelisiniz.");
            return;
        }

        let greetingHtml = `<p>${yonetmenFirstName ? yonetmenFirstName + ' Bey' : ''} Merhaba,</p><p>&nbsp;</p><p>${selectedStore.bayiKodu} ${shortBayiAdi} bayisine yapılan özel ziyarete istinaden notlar aşağıdadır.</p>`;
        let notesHtml = notes.length > 0 ? `<ul>${notes.map(note => `<li>${note}</li>`).join('')}</ul>` : '';
        
        let popHtml = '';
        if (selectedSpecialPops.length > 0) {
            const popQuestion = fideQuestions.find(q => q.id === 14);
            const popTitle = popQuestion ? `FiDe ${popQuestion.id}. ${popQuestion.title}` : 'İstenen Materyaller';
            const emailTag = ` <a href="mailto:berkcan_boza@arcelik.com.tr" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@berkcan_boza@arcelik.com.tr</a>`;
            popHtml = `<p>&nbsp;</p><p><b>${popTitle}</b>${emailTag}</p><ul><li>${selectedSpecialPops.join(', ')}</li></ul>`;
        }

        finalEmailBody = `${greetingHtml}<p>&nbsp;</p>${notesHtml}${popHtml}`;

    } else {
        const fideStoreInfo = fideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
        const storeEmail = storeEmails[selectedStore.bayiKodu] || null;
        const storeEmailTag = storeEmail ? ` <a href="mailto:${storeEmail}" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@${storeEmail}</a>` : '';
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
                    emailTag = ` <a href="mailto:berkcan_boza@arcelik.com.tr" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@berkcan_boza@arcelik.com.tr</a>`;
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
        finalEmailBody = `${greetingHtml}<p>&nbsp;</p>${fideReportHtml}${tableHtml}`;
    }
    
    document.getElementById('dide-upload-card').style.display = 'none';
    document.getElementById('form-content').style.display = 'none';
    document.getElementById('special-visit-form').style.display = 'none';
    document.querySelector('.action-button').style.display = 'none';
    document.querySelector('#load-from-email-section').style.display = 'none';

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
    document.querySelector('.container').appendChild(draftContainer);
}

function loadReport(reportData) {
    try {
        if (reportData.isSpecialVisit) {
            selectStore(reportData.selectedStore, false);
            showSpecialVisitForm();
            
            const container = document.getElementById('special-notes-container');
            container.innerHTML = '';
            if (reportData.notes && reportData.notes.length > 0) {
                reportData.notes.forEach(note => addSpecialNoteInput(false, note));
            } else {
                addSpecialNoteInput(true); 
            }
            
            renderSpecialVisitPopSystem();
            if (reportData.specialPopCodes && reportData.specialPopCodes.length > 0) {
                reportData.specialPopCodes.forEach(code => {
                    const cb = document.querySelector(`.special-pop-checkbox[value="${code}"]`);
                    if (cb) cb.checked = true;
                });
            }
            return; 
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
        updateFormInteractivity(true);
    } catch (error) { alert('Geçersiz rapor verisi!'); console.error("Rapor yükleme hatası:", error); }
}

function parseAndLoadFromEmail() {
    showFiDeForm(); 
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

function getFideFormDataForSaving() {
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

function updateFormInteractivity(enable) {
    const formContent = document.getElementById('form-content');
    if (!formContent) return;

    const fideButtons = formContent.querySelectorAll('.add-item-btn, .status-btn, .remove-btn, .delete-bar, .delete-item-btn, .product-adder button');
    const fideInputs = formContent.querySelectorAll('#product-selector, #product-qty');
    
    fideButtons.forEach(btn => btn.disabled = !enable);
    fideInputs.forEach(input => input.disabled = !enable);

    const specialVisitForm = document.getElementById('special-visit-form');
    const specialButtons = specialVisitForm.querySelectorAll('button');
    const specialInputs = specialVisitForm.querySelectorAll('input');

    specialButtons.forEach(btn => btn.disabled = !enable);
    specialInputs.forEach(input => input.disabled = !enable);
}


// --- BU NOKTADAN SONRASI DEĞİŞMEDİ, SADECE OKUNABİLİRLİK İÇİN AYIRDIM ---

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

// --- YENİ EKLENEN YARDIMCI FONKSİYONLAR (ÖZEL ZİYARET İÇİN) ---
function copySpecialPopCodes() {
    const nonExpiredCodes = Array.from(document.querySelectorAll('.special-pop-checkbox:checked')).map(cb => cb.value).filter(code => !expiredCodes.includes(code));
    if (nonExpiredCodes.length === 0) return alert("Kopyalamak için geçerli kod seçin.");
    navigator.clipboard.writeText(nonExpiredCodes.join(', ')).then(() => alert("Seçilen geçerli kodlar kopyalandı!"));
}
function clearSpecialPopCodes() {
    document.querySelectorAll('.special-pop-checkbox').forEach(cb => cb.checked = false);
    saveFormState();
}
function selectSpecialExpiredCodes() {
    document.querySelectorAll('.special-pop-checkbox').forEach(cb => { cb.checked = expiredCodes.includes(cb.value); });
    saveFormState();
}
function openSpecialPopEmailDraft() {
    const selectedCodes = Array.from(document.querySelectorAll('.special-pop-checkbox:checked')).map(cb => cb.value);
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
// --- YENİ FONKSİYONLAR SONU ---

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
