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

function closeManager() {
    document.getElementById('backup-manager').style.display = 'none';
    document.getElementById('dide-upload-card').style.display = 'block';
    document.getElementById('form-content').style.display = 'block';
    document.querySelector('.action-button').style.display = 'block';
    const emailDraft = document.getElementById('email-draft-container');
    if (emailDraft) emailDraft.remove();
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
    document.getElementById('backup-btn').addEventListener('click', backupAllReports);
    document.getElementById('restore-file-input').addEventListener('change', handleRestoreUpload);
    document.getElementById('merge-file-input').addEventListener('change', handleMergeUpload);
    document.getElementById('new-report-btn').addEventListener('click', startNewReport);
    
    // --- YENİ EKLENEN VERİ BAKIM ARAÇLARI ---
    document.getElementById('analyze-orphan-reports-btn').addEventListener('click', analyzeOrphanReports);
    document.getElementById('check-consistency-btn').addEventListener('click', checkDataConsistency);
    document.getElementById('clean-field-btn').addEventListener('click', openFieldCleaner);

    
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
    const restoreBtn = document.getElementById('restore-from-backup-btn');
    const mergeBtn = document.getElementById('merge-backups-btn');

    restoreBtn.addEventListener('click', () => document.getElementById('restore-file-input').click());
    mergeBtn.addEventListener('click', () => document.getElementById('merge-file-input').click());
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

    document.getElementById('toggle-backup-manager-btn').addEventListener('click', () => {
        const manager = document.getElementById('backup-manager');
        const isManagerHidden = manager.style.display === 'none' || manager.style.display === '';
         if (isManagerHidden) {
            const dogruSifreHash = 'ZmRlMDAx';
            const girilenSifre = prompt("Lütfen Yönetim Paneli şifresini girin:");
             if (girilenSifre) {
                const girilenSifreHash = btoa(girilenSifre);
                 if (girilenSifreHash === dogruSifreHash) {
                   returnToMainPage();
                   closeManager();
                   manager.style.display = 'block';
                   document.getElementById('dide-upload-card').style.display = 'none';
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
}

// --- VERİ BAKIM ARAÇLARI FONKSİYONLARI ---

function showModal(title, body, footer) {
    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer;
    document.getElementById('maintenance-modal').style.display = 'flex';
}

function hideModal() {
    document.getElementById('maintenance-modal').style.display = 'none';
}

function backupReminder() {
    return confirm("ÖNEMLİ UYARI:\n\nBu işlem veritabanında kalıcı değişiklikler yapacaktır. İşleme başlamadan önce 'Raporları Yedekle' butonunu kullanarak verilerinizin tamamını yedeklemeniz şiddetle tavsiye edilir.\n\nYedek aldınız mı veya bu riski kabul ederek devam etmek istiyor musunuz?");
}

async function analyzeOrphanReports() {
    if (!backupReminder()) return;
    showModal(
        '<i class="fas fa-spinner fa-spin"></i> Kalıntı Raporlar Analiz Ediliyor...',
        '<p>Lütfen bekleyin. Ana bayi listesi ile tüm raporlar karşılaştırılıyor...</p>',
        '<button class="btn-secondary" onclick="hideModal()">Kapat</button>'
    );

    try {
        const reportsSnapshot = await database.ref('allFideReports').once('value');
        const storesSnapshot = await database.ref('tumBayilerListesi/stores').once('value');

        if (!reportsSnapshot.exists() || !storesSnapshot.exists()) {
            showModal('<i class="fas fa-info-circle"></i> Analiz Tamamlandı', '<p>Analiz için yeterli veri bulunamadı (Raporlar veya ana bayi listesi boş).</p>', '<button class="btn-primary" onclick="hideModal()">Tamam</button>');
            return;
        }

        const allReports = reportsSnapshot.val();
        const validStoreCodes = new Set(storesSnapshot.val().map(store => String(store.bayiKodu)));
        const orphanReports = [];

        for (const reportKey in allReports) {
            const bayiKodu = reportKey.replace('store_', '');
            if (!validStoreCodes.has(bayiKodu)) {
                const reportData = allReports[reportKey].data;
                orphanReports.push({
                    key: reportKey,
                    bayiKodu: bayiKodu,
                    bayiAdi: reportData.selectedStore ? reportData.selectedStore.bayiAdi : 'Bilinmeyen Bayi'
                });
            }
        }

        if (orphanReports.length === 0) {
            showModal('<i class="fas fa-check-circle"></i> Analiz Sonucu', '<p>Harika! Sistemde hiç kalıntı (orphan) rapor bulunamadı. Veritabanınız temiz.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } else {
            let listHtml = `<div class="maintenance-info"><i class="fas fa-info-circle"></i> Ana bayi listesinde bulunmayan ${orphanReports.length} adet rapora ait kayıt bulundu. Silmek istediklerinizi seçin.</div>`;
            listHtml += '<div class="maintenance-list">';
            orphanReports.forEach(report => {
                listHtml += `
                    <div class="maintenance-list-item">
                        <label>
                            <input type="checkbox" class="orphan-checkbox" value="${report.key}">
                            <div>
                                <p>${report.bayiAdi}</p>
                                <span>Kod: ${report.bayiKodu}</span>
                            </div>
                        </label>
                    </div>`;
            });
            listHtml += '</div>';

            const footerHtml = `
                <button class="btn-secondary" onclick="hideModal()">İptal</button>
                <button class="btn-danger" onclick="deleteSelectedOrphans()"><i class="fas fa-trash"></i> Seçilenleri Kalıcı Olarak Sil</button>
            `;
            showModal('<i class="fas fa-user-slash"></i> Kalıntı Rapor Analizi Sonuçları', listHtml, footerHtml);
        }

    } catch (error) {
        console.error("Kalıntı rapor analizi hatası:", error);
        showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Analiz sırasında bir hata oluştu. Lütfen konsolu kontrol edin.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
    }
}

async function deleteSelectedOrphans() {
    const selectedOrphans = Array.from(document.querySelectorAll('.orphan-checkbox:checked')).map(cb => cb.value);
    if (selectedOrphans.length === 0) {
        return alert("Lütfen silmek için en az bir rapor seçin.");
    }
    if (confirm(`${selectedOrphans.length} adet kalıntı rapor kalıcı olarak silinecektir. Bu işlem geri alınamaz. Emin misiniz?`)) {
        showModal(
            '<i class="fas fa-spinner fa-spin"></i> Siliniyor...',
            `<p>${selectedOrphans.length} adet rapor siliniyor, lütfen bekleyin...</p>`,
            ''
        );
        try {
            const updates = {};
            selectedOrphans.forEach(key => {
                updates[`/allFideReports/${key}`] = null;
            });
            await database.ref().update(updates);
            showModal('<i class="fas fa-check-circle"></i> Başarılı', `<p>${selectedOrphans.length} adet kalıntı rapor başarıyla silindi.</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } catch (error) {
            console.error("Kalıntı rapor silme hatası:", error);
            showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Raporlar silinirken bir hata oluştu. Lütfen konsolu kontrol edin.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        }
    }
}

async function checkDataConsistency() {
    showModal('<i class="fas fa-spinner fa-spin"></i> Tutarlılık Kontrol Ediliyor...', '<p>Lütfen bekleyin. Bayi listeleri karşılaştırılıyor...</p>', '<button class="btn-secondary" onclick="hideModal()">Kapat</button>');
    
    try {
        const storesSnapshot = await database.ref('tumBayilerListesi/stores').once('value');
        const emailsSnapshot = await database.ref('storeEmails').once('value');

        const mainStoreList = storesSnapshot.exists() ? storesSnapshot.val() : [];
        const emailList = emailsSnapshot.exists() ? emailsSnapshot.val() : {};

        const mainStoreCodes = new Set(mainStoreList.map(s => String(s.bayiKodu)));
        const emailStoreCodes = new Set(Object.keys(emailList).map(String));

        const dealersWithoutEmail = mainStoreList.filter(store => !emailStoreCodes.has(String(store.bayiKodu)));
        const emailsWithoutDealer = Object.keys(emailList).filter(code => !mainStoreCodes.has(String(code)));
        
        let bodyHtml = `<div class="maintenance-info"><i class="fas fa-info-circle"></i> Bayi ana listesi ('tumBayilerListesi') ile bayi e-posta listesi ('storeEmails') arasındaki tutarsızlıklar aşağıdadır.</div>`;
        
        bodyHtml += `<div class="consistency-section"><h5><i class="fas fa-at"></i> E-postası Eksik Olan Bayiler (${dealersWithoutEmail.length} adet)</h5><div class="maintenance-list">`;
        if (dealersWithoutEmail.length > 0) {
            dealersWithoutEmail.forEach(store => {
                bodyHtml += `<div class="maintenance-list-item"><p>${store.bayiAdi} <span>(Kod: ${store.bayiKodu})</span></p></div>`;
            });
        } else {
            bodyHtml += `<div class="maintenance-list-item"><span>Tüm bayilerin e-posta adresi girilmiş.</span></div>`;
        }
        bodyHtml += `</div></div>`;
        
        bodyHtml += `<div class="consistency-section"><h5><i class="fas fa-user-times"></i> Ana Listede Olmayan E-posta Kayıtları (${emailsWithoutDealer.length} adet)</h5><div class="maintenance-list">`;
        if (emailsWithoutDealer.length > 0) {
            emailsWithoutDealer.forEach(code => {
                bodyHtml += `<div class="maintenance-list-item"><p>${emailList[code]} <span>(Kod: ${code})</span></p></div>`;
            });
        } else {
            bodyHtml += `<div class="maintenance-list-item"><span>Listede olmayan e-posta kaydı bulunamadı.</span></div>`;
        }
        bodyHtml += `</div></div>`;

        showModal('<i class="fas fa-check-double"></i> Veri Tutarlılığı Raporu', bodyHtml, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');

    } catch (error) {
        console.error("Veri tutarlılığı kontrolü hatası:", error);
        showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Kontrol sırasında bir hata oluştu. Lütfen konsolu kontrol edin.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
    }
}

function openFieldCleaner() {
    const bodyHtml = `
        <div class="maintenance-info"><i class="fas fa-exclamation-triangle"></i> <strong>DİKKAT:</strong> Bu işlem tehlikelidir ve geri alınamaz. Sadece ne yaptığınızdan eminseniz kullanın.</div>
        <div class="field-cleaner-form">
            <label for="field-to-clean">Tüm raporlardan silmek istediğiniz alanın adını yazın:</label>
            <input type="text" id="field-to-clean" placeholder="Örn: isSpecialVisit">
            <small>Bu alan, tüm raporların içindeki 'data' objesinden silinecektir.</small>
        </div>
    `;
    const footerHtml = `
        <button class="btn-secondary" onclick="hideModal()">İptal</button>
        <button class="btn-danger" onclick="cleanObsoleteField()"><i class="fas fa-eraser"></i> Yazılan Alanı Temizle</button>
    `;
    showModal('<i class="fas fa-broom"></i> Gereksiz Alan Temizleyici', bodyHtml, footerHtml);
}

async function cleanObsoleteField() {
    const fieldName = document.getElementById('field-to-clean').value.trim();
    if (!fieldName) {
        return alert("Lütfen silmek istediğiniz alanın adını girin.");
    }
    if (!backupReminder()) return;
    if (confirm(`'${fieldName}' isimli alanı tüm raporlardan kalıcı olarak silmek üzeresiniz.\n\nBU İŞLEM GERİ ALINAMAZ!\n\nDevam etmek istediğinizden kesinlikle emin misiniz?`)) {
        showModal('<i class="fas fa-spinner fa-spin"></i> Temizleniyor...', `<p>'${fieldName}' alanı tüm raporlardan siliniyor. Lütfen bekleyin...</p>`, '');

        try {
            const reportsRef = database.ref('allFideReports');
            const snapshot = await reportsRef.once('value');
            if (!snapshot.exists()) {
                 showModal('<i class="fas fa-info-circle"></i> Bilgi', '<p>Temizlenecek rapor bulunamadı.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
                 return;
            }
            
            const updates = {};
            let fieldsFound = 0;
            snapshot.forEach(childSnapshot => {
                if (childSnapshot.child('data').hasChild(fieldName)) {
                    updates[`/${childSnapshot.key}/data/${fieldName}`] = null;
                    fieldsFound++;
                }
            });

            if (fieldsFound > 0) {
                await reportsRef.update(updates);
                showModal('<i class="fas fa-check-circle"></i> Başarılı', `<p>${fieldsFound} adet raporda bulunan '${fieldName}' alanı başarıyla silindi.</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
            } else {
                showModal('<i class="fas fa-info-circle"></i> Bilgi', `<p>Hiçbir raporda '${fieldName}' alanı bulunamadı. Veritabanı zaten temiz.</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
            }

        } catch (error) {
            console.error("Alan temizleme hatası:", error);
            showModal('<i class="fas fa-exclamation-triangle"></i> Hata', `<p>Temizleme sırasında bir hata oluştu: ${error.message}</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        }
    }
}
// --- MEVCUT FONKSİYONLAR ---
function saveFormState(isFinalizing = false) {
    if (!document.getElementById('form-content').innerHTML || !selectedStore || !auth.currentUser || !database) return;

    const reportData = getFormDataForSaving();
    const storeKey = `store_${selectedStore.bayiKodu}`;
    const firebaseStoreRef = database.ref('allFideReports/' + storeKey);
    const bayiKodu = String(selectedStore.bayiKodu); // Bayi kodunu al

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
                // YENİ EKLENEN KOD BAŞLANGICI
                if (isFinalizing) {
                    removeStoreCodeFromRevertedList(bayiKodu);
                }
                // YENİ EKLENEN KOD BİTİŞİ
            })
            .catch(error => console.error("Firebase'e yazma hatası:", error));
    });
}

// YENİ FONKSİYON
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
                // Bayi kodunu diziden çıkar
                geriAlinanlar[currentMonthKey].splice(index, 1);
                
                // Güncellenmiş listeyi Firebase'e yaz
                await geriAlinanlarRef.set(geriAlinanlar);
                console.log(`Bayi ${bayiKodu} geri alınanlar listesinden başarıyla çıkarıldı.`);
            }
        }
    } catch (error) {
        console.error("Geri alınanlar listesi güncellenirken hata oluştu:", error);
    }
}
// ... (Diğer tüm mevcut fonksiyonlarınız burada değişmeden kalacak)
// ... Bu fonksiyonların tamamını buraya kopyalamak yerine, sadece yeni eklenenleri ve değişiklikleri gösteriyorum.
// ... Lütfen bu yeni fonksiyonları mevcut main.js dosyanızın uygun yerlerine ekleyin veya dosyanın tamamını değiştirin.

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
function processDideExcelData(dataAsArray, saveToCloud = false, filename = '') {
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
    
    if (saveToCloud && auth.currentUser && database) {
        const persistenceData = { timestamp: new Date().getTime(), data: processedData, filename: filename };
        database.ref('excelData/dide').set(persistenceData);
        alert('DiDe puan dosyası başarıyla işlendi ve buluta kaydedildi.');
    }
    populateDideState(processedData);
}

function processFideExcelData(dataAsArray, saveToCloud = false, filename = '') {
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

    if (saveToCloud && auth.currentUser && database) {
        const persistenceData = { timestamp: new Date().getTime(), data: processedData, filename: filename };
        database.ref('excelData/fide').set(persistenceData);
        alert('FiDe puan dosyası başarıyla işlendi ve buluta kaydedildi.');
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
    if (!selectedStore) {
        alert('Lütfen denetime başlamadan önce bir bayi seçin!');
        return;
    }
    saveFormState(true); // Raporu "tamamlandı" olarak işaretleyerek kaydet

    const storeInfo = dideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    const fideStoreInfo = fideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    if (!storeInfo) {
        alert("Seçilen bayi için DiDe verisi bulunamadı. Lütfen DiDe Excel dosyasını yükleyin.");
        return;
    }
    
    const storeEmail = storeEmails[selectedStore.bayiKodu] || null;
    
    const storeEmailTag = storeEmail ? ` <a href="mailto:${storeEmail}" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@${storeEmail}</a>` : '';

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
    const finalEmailBody = `${greetingHtml}<p>&nbsp;</p>${fideReportHtml}${tableHtml}`;
    
    document.getElementById('dide-upload-card').style.display = 'none';
    document.getElementById('form-content').style.display = 'none';
    document.querySelector('.action-button').style.display = 'none';

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
    // --- GÜNCELLENEN BÖLÜM BAŞLANGICI ---
    // Hatanın çözümü için bu kontrol eklenmiştir.
    // Bu blok, buluttan gelen rapor verisinin (reportData) veya raporun temelini oluşturan
    // 'questions_status' objesinin mevcut olup olmadığını kontrol eder. Eğer bu verilerden biri
    // eksikse, bu, raporun bozuk olduğu anlamına gelir. Hata mesajı göstermek yerine,
    // formu temizleyip (resetForm) kullanıcıya boş bir denetim sayfası sunarız.
    // Bu sayede uygulama kilitlenmez ve kullanıcı işine devam edebilir.
    if (!reportData || !reportData.questions_status) {
        console.warn("Rapor verisi bulunamadı veya 'questions_status' alanı eksik. Form sıfırlanıyor. Gelen Veri:", reportData);
        resetForm();
        updateFormInteractivity(true); // Formun kullanılabilir olduğundan emin ol.
        return; // Fonksiyonun geri kalanının çalışmasını engelle.
    }
    // --- GÜNCELLENEN BÖLÜM SONU ---

    try {
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

function startNewReport() {
    selectedStore = null;
    document.getElementById('store-search-input').value = '';
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

async function backupAllReports() {
    if (!auth.currentUser || !database) {
        return alert('Yedekleme yapmak için giriş yapmalısınız.');
    }
    try {
        const reportsRef = database.ref(); // Tüm veritabanını yedekle
        const snapshot = await reportsRef.once('value');
        if (!snapshot.exists()) {
            return alert('Yedeklenecek veri bulunamadı.');
        }
        const allData = JSON.stringify(snapshot.val());
        const blob = new Blob([allData], { type: 'application/json;charset=utf-8' });
        const today = new Date().toISOString().slice(0, 10);
        const filename = `fideraporuygulamasi_full_backup_${today}.json`;
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        alert('Yedekleme sırasında bir hata oluştu.');
        console.error("Yedekleme hatası:", error);
    }
}

async function handleRestoreUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!auth.currentUser || !database) {
        return alert('Yedek yüklemek için giriş yapmalısınız.');
    }

    if (confirm("Bu işlem, buluttaki mevcut tüm verilerin üzerine yazılacaktır. Devam etmek istediğinizden emin misiniz?")) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const restoredData = JSON.parse(e.target.result);
                await database.ref().set(restoredData);
                alert('Yedek başarıyla buluta geri yüklendi! Değişikliklerin yansıması için sayfa yenileniyor.');
                window.location.reload();
            } catch (error) {
                alert('Geçersiz veya bozuk yedek dosyası! Yükleme başarısız oldu.');
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
                    // Beklenen format 'allFideReports' ise onu al, değilse dosyayı olduğu gibi kabul et
                    const reportData = data.allFideReports ? data.allFideReports : data;
                    resolve(reportData);
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
        // Birleştirilmiş veriyi 'allFideReports' anahtarı altına koy
        const finalMergedData = { allFideReports: mergedReports };
        const mergedDataStr = JSON.stringify(finalMergedData, null, 2);
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