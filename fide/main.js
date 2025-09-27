// --- Global Değişkenler ---
let dideData = [], fideData = [], uniqueStores = [], selectedStore = null;
let fideQuestions = [], popCodes = [], expiredCodes = [], productList = [], expiredExcelFiles = [];
let migrationMap = {}, storeEmails = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan veya yerel dosyadan yüklenemedi." }];
const monthNames = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let isFirebaseConnected = false;

// --- Yardımcı Fonksiyonlar ---
function createElement(tag, options, children = []) {
    const element = document.createElement(tag);
    Object.assign(element, options);
    children.forEach(child => element.appendChild(child));
    return element;
}

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
    let dideLoaded = false, fideLoaded = false;

    if (user && database) {
        try {
            const dideRef = database.ref('excelData/dide');
            const dideSnapshot = await dideRef.once('value');
            if (dideSnapshot.exists()) {
                const storedData = dideSnapshot.val();
                if ((new Date().getTime() - storedData.timestamp) / (1000 * 60 * 60 * 24) <= 30) {
                    if (storedData.filename) document.getElementById('file-name').textContent = `Buluttan yüklendi: ${storedData.filename}`;
                    populateDideState(storedData.data);
                    dideLoaded = true;
                }
            }
            const fideRef = database.ref('excelData/fide');
            const fideSnapshot = await fideRef.once('value');
            if (fideSnapshot.exists()) {
                const storedData = fideSnapshot.val();
                if ((new Date().getTime() - storedData.timestamp) / (1000 * 60 * 60 * 24) <= 30) {
                    if (storedData.filename) document.getElementById('fide-file-name').textContent = `Buluttan yüklendi: ${storedData.filename}`;
                    populateFideState(storedData.data);
                    fideLoaded = true;
                }
            }
        } catch (error) { console.error("Buluttan Excel verisi yüklenirken hata:", error); }
    }

    if (!dideLoaded) loadDataFromStorage('didePersistenceData', 'file-name', 'DiDe Puan Excel', populateDideState);
    if (!fideLoaded) loadDataFromStorage('fidePersistenceData', 'fide-file-name', 'FiDe Puan Excel', populateFideState);
}

function loadDataFromStorage(storageKey, fileNameId, expiredMessage, populateFunction) {
    const storedDataJSON = localStorage.getItem(storageKey);
    if (!storedDataJSON) return;
    try {
        const storedData = JSON.parse(storedDataJSON);
        const ageInDays = (new Date().getTime() - storedData.timestamp) / (1000 * 60 * 60 * 24);
        if (ageInDays > 30) {
            localStorage.removeItem(storageKey);
            expiredExcelFiles.push(expiredMessage);
            return;
        }
        const fileNameSpan = document.getElementById(fileNameId);
        if (fileNameSpan && storedData.filename) {
            fileNameSpan.textContent = `Yerel hafızadan yüklendi: ${storedData.filename}`;
        }
        populateFunction(storedData.data);
    } catch (e) {
        localStorage.removeItem(storageKey);
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
    document.querySelector('#load-from-email-section').style.display = 'block';
    document.getElementById('form-content').style.display = 'block';
    document.querySelector('.action-button').style.display = 'block';
    
    const emailDraft = document.getElementById('email-draft-container');
    if (emailDraft) emailDraft.remove();
}

function returnToMainPage() {
    const emailDraft = document.getElementById('email-draft-container');
    if (emailDraft) emailDraft.remove();
    
    document.getElementById('dide-upload-card').style.display = 'block';
    document.querySelector('#load-from-email-section').style.display = 'block';
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
    document.getElementById('load-from-email-btn').addEventListener('click', parseAndLoadFromEmail);
    
    document.getElementById('clear-storage-btn').addEventListener('click', () => {
        if (btoa(prompt("Bu işlem geri alınamaz. Lütfen şifreyi girin:")) === 'ZmRlMDAx') {
            if (confirm("Şifre doğru. TÜM verileri silmek istediğinizden emin misiniz?")) {
                localStorage.clear();
                if(auth.currentUser && database) {
                    ['allFideReports', 'excelData', 'migrationSettings', 'storeEmails'].forEach(ref => database.ref(ref).remove());
                }
                alert("Tüm veriler temizlendi. Sayfa yenileniyor.");
                window.location.reload();
            }
        } else {
            alert("Hatalı şifre!");
        }
    });

    ['clear-excel-btn', 'clear-fide-excel-btn'].forEach(id => {
        document.getElementById(id).addEventListener('click', () => {
            const type = id.includes('fide') ? 'FiDe' : 'DiDe';
            const storageKey = id.includes('fide') ? 'fidePersistenceData' : 'didePersistenceData';
            const dbRef = id.includes('fide') ? 'excelData/fide' : 'excelData/dide';
            if (confirm(`${type} Excel verisini silmek istediğinizden emin misiniz?`)) {
                localStorage.removeItem(storageKey);
                if(auth.currentUser && database) database.ref(dbRef).remove();
                alert(`${type} Excel verisi temizlendi. Sayfa yenileniyor.`);
                window.location.reload();
            }
        });
    });

    document.getElementById('store-search-input').addEventListener('keyup', (e) => {
        selectedStore = null; 
        const filter = e.target.value.toLowerCase().trim();
        const storeListDiv = document.getElementById('store-list');
        storeListDiv.style.display = 'block';
        if (!filter) {
            storeListDiv.innerHTML = ''; 
            return;
        }
        const filteredStores = uniqueStores.filter(store => 
            (store.bayiAdi?.toLowerCase().includes(filter)) || 
            (String(store.bayiKodu).toLowerCase().includes(filter))
        );
        displayStores(filteredStores);
    });
    
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const loginPopup = document.getElementById('login-popup');
    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });
    document.getElementById('logout-btn').addEventListener('click', () => { auth.signOut(); window.location.reload(); });
    document.getElementById('login-submit-btn').addEventListener('click', () => {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';
        if (!email || !password) { errorDiv.textContent = 'Lütfen tüm alanları doldurun.'; return; }
        auth.signInWithEmailAndPassword(email, password)
            .then(() => { loginPopup.style.display = 'none'; })
            .catch(error => { errorDiv.textContent = 'E-posta veya şifre hatalı.'; });
    });

    document.getElementById('upload-backup-to-cloud-btn').addEventListener('click', uploadLocalBackupToCloud);
    document.getElementById('restore-from-backup-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
    document.getElementById('merge-backups-btn').addEventListener('click', () => document.getElementById('merge-file-input').click());

    window.addEventListener('click', (event) => {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });

    document.getElementById('toggle-backup-manager-btn').addEventListener('click', () => {
        const manager = document.getElementById('backup-manager');
        if (manager.style.display === 'none' || manager.style.display === '') {
            if (btoa(prompt("Lütfen Yedekleme Yöneticisi şifresini girin:")) === 'ZmRlMDAx') {
                returnToMainPage();
                closeManager();
                manager.style.display = 'block';
                ['dide-upload-card', 'load-from-email-section', 'form-content'].forEach(id => document.querySelector(`#${id}`).style.display = 'none');
                document.querySelector('.action-button').style.display = 'none';
            } else {
                alert("Hatalı şifre!");
            }
        } else {
            closeManager();
        }
    });
}

function uploadLocalBackupToCloud() {
    if (!auth.currentUser) return alert("Bu işlem için önce sisteme giriş yapmalısınız.");
    const localDataString = localStorage.getItem('allFideReports');
    if (!localDataString) return alert("Buluta yüklenecek yerel bir yedek bulunamadı.");
    if (confirm("DİKKAT! Bu işlem, buluttaki mevcut tüm raporların üzerine yazacaktır. Emin misiniz?")) {
        try {
            database.ref('allFideReports').set(JSON.parse(localDataString))
                .then(() => alert("Yerel yedek başarıyla buluta yüklendi!"))
                .catch(error => alert("Buluta yükleme hatası: " + error.message));
        } catch (error) { alert("Yerel yedek verisi bozuk olabilir."); }
    }
}

function saveFormState() {
    if (!document.getElementById('form-content').innerHTML || !selectedStore) return;
    const allReports = JSON.parse(localStorage.getItem('allFideReports')) || {};
    const reportData = getFormDataForSaving();
    const storeKey = `store_${selectedStore.bayiKodu}`;
    allReports[storeKey] = { timestamp: new Date().getTime(), data: reportData };
    localStorage.setItem('allFideReports', JSON.stringify(allReports));
    if (database && auth.currentUser) {
        database.ref('allFideReports/' + storeKey).set({ timestamp: new Date().getTime(), data: reportData })
            .catch(error => console.error("Firebase'e yazma hatası:", error));
    }
}

function loadReportForStore(bayiKodu) {
    const storeKey = `store_${bayiKodu}`;
    const loadFromLocalStorage = () => {
        const allReports = JSON.parse(localStorage.getItem('allFideReports')) || {};
        if (allReports[storeKey]) loadReport(allReports[storeKey].data); else resetForm();
    };

    if (database && auth.currentUser) {
        database.ref('allFideReports/' + storeKey).once('value')
            .then(snapshot => {
                if (snapshot.exists()) loadReport(snapshot.val().data); else loadFromLocalStorage();
            })
            .catch(error => {
                console.error("Firebase'den okuma hatası:", error);
                loadFromLocalStorage();
            });
    } else {
        loadFromLocalStorage();
    }
}

function getUnitForProduct(productName) {
    const upperCaseName = productName.toUpperCase();
    return (upperCaseName.includes('TSHIRT') || upperCaseName.includes('HIRKA')) ? 'Adet' : 'Paket';
}

function resetForm() {
    document.getElementById('form-content').innerHTML = '';
    buildForm();
}

function generateQuestionHtml(q) {
    let questionActionsHTML = '';
    let questionContentHTML = '';
    const isArchivedClass = q.isArchived ? 'archived-item' : '';

    if (q.type === 'standard') {
        questionActionsHTML = `<div class="fide-actions"><button class="add-item-btn btn-sm" onclick="addDynamicInput('fide${q.id}')" title="Bu maddeyle ilgili yeni bir eksiklik satırı ekler."><i class="fas fa-plus"></i> Yeni Eksik Ekle</button><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})" title="Bu soruyu 'Tamamlandı' olarak işaretler. Geri alınabilir."><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})" title="Bu soruyu e-posta raporundan tamamen çıkarır. Geri alınabilir."><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
        const staticItemsHTML = (q.staticItems || []).map(item => `<div class="static-item"><div class="content">${item}</div><button class="delete-bar btn-danger" onclick="initiateDeleteItem(this)" title="Bu satırı silmek için tıklayın. 4 saniye içinde geri alınabilir."><i class="fas fa-trash"></i></button></div>`).join('');
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
    formContainer.innerHTML = fideQuestions.filter(q => !q.isArchived).map(generateQuestionHtml).join('');
    if (document.getElementById('popCodesContainer')) initializePopSystem();
}

function initiateDeleteItem(buttonEl) {
    const itemEl = buttonEl.parentElement;
    if (itemEl.classList.contains('is-deleting')) {
        clearTimeout(itemEl.dataset.deleteTimer);
        itemEl.removeAttribute('data-delete-timer');
        itemEl.classList.remove('is-deleting');
        buttonEl.querySelector('i').className = 'fas fa-trash';
        buttonEl.classList.replace('btn-warning', 'btn-danger');
    } else {
        itemEl.classList.add('is-deleting');
        buttonEl.querySelector('i').className = 'fas fa-undo';
        buttonEl.classList.replace('btn-danger', 'btn-warning');
        itemEl.dataset.deleteTimer = setTimeout(() => { itemEl.remove(); saveFormState(); }, 4000);
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
    if (!product) return console.error("Ürün bulunamadı: ", selectedProductCode);

    const listContainer = document.getElementById('selected-products-list');
    if (document.querySelector(`.selected-product-item[data-code="${product.code}"]`)) return alert('Bu ürün zaten listede.');
    
    const newItem = createElement('div', { 
        className: 'selected-product-item',
        'data-code': product.code,
        'data-qty': selectedQty
    }, [
        createElement('span', { innerHTML: `${product.code} ${product.name} - <b>${selectedQty} ${getUnitForProduct(product.name)}</b>` }),
        createElement('button', {
            className: 'delete-item-btn btn-sm',
            title: 'Bu malzemeyi sipariş listesinden siler.',
            innerHTML: '<i class="fas fa-trash"></i>',
            onclick: function() { this.parentElement.remove(); saveFormState(); }
        })
    ]);
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

function toggleQuestionState(button, id, stateClass, buttonTexts) {
    const itemDiv = document.getElementById(`fide-item-${id}`);
    const isToggled = itemDiv.classList.toggle(stateClass);
    button.innerHTML = isToggled ? buttonTexts.toggled : buttonTexts.initial;
    
    if (stateClass === 'question-completed') {
        button.classList.toggle('undo', isToggled);
        const inputArea = itemDiv.querySelector('.input-area');
        if (inputArea) inputArea.style.display = isToggled ? 'none' : 'block';
    } else if (stateClass === 'question-removed') {
        button.classList.toggle('btn-danger', !isToggled);
        button.classList.toggle('btn-primary', isToggled);
        const actionsContainer = button.closest('.fide-actions');
        if (actionsContainer) {
            actionsContainer.querySelectorAll('.add-item-btn, .status-btn').forEach(btn => btn.disabled = isToggled);
        }
        const inputArea = itemDiv.querySelector('.input-area');
        if (inputArea) inputArea.style.display = isToggled ? 'none' : 'block';
    }
    saveFormState();
}

function toggleQuestionCompleted(button, id) {
    toggleQuestionState(button, id, 'question-completed', {
        toggled: '<i class="fas fa-undo"></i> Geri Al',
        initial: '<i class="fas fa-check"></i> Tamamlandı'
    });
}

function toggleQuestionRemoved(button, id) {
    toggleQuestionState(button, id, 'question-removed', {
        toggled: '<i class="fas fa-undo"></i> Geri Al',
        initial: '<i class="fas fa-times-circle"></i> Çıkar'
    });
}

function addDynamicInput(id, value = '', isCompleted = false) {
    const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) return console.warn(`Konteyner bulunamadı: '${id}'`);
    
    const inputEl = createElement('input', {
        type: 'text',
        placeholder: 'Eksikliği yazın...',
        value: value,
        onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); addDynamicInput(id); } },
        onblur: saveFormState
    });

    const completeButton = createElement('button', {
        className: 'status-btn btn-sm',
        innerHTML: '<i class="fas fa-check"></i> Tamamlandı',
        onclick: (e) => toggleCompleted(e.currentTarget),
        title: "Bu eksikliği 'Tamamlandı' olarak işaretler."
    });

    const newItem = createElement('div', { className: 'dynamic-input-item' }, [
        inputEl,
        completeButton,
        createElement('button', {
            className: 'delete-bar btn-danger',
            innerHTML: '<i class="fas fa-trash"></i>',
            onclick: (e) => initiateDeleteItem(e.currentTarget),
            title: "Bu satırı silmek için tıklayın."
        })
    ]);
    
    if (isCompleted) toggleCompleted(completeButton);
    container.prepend(newItem);
    if (value === '') inputEl.focus();
    saveFormState();
}

function getCombinedInputs(id) {
    const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) return [];
    return Array.from(container.childNodes).reverse()
        .filter(node => node.classList && (node.classList.contains('static-item') || node.classList.contains('dynamic-input-item')) && !node.classList.contains('is-deleting'))
        .map(node => {
            if (node.classList.contains('static-item')) {
                return { text: node.querySelector('.content').innerHTML, completed: false, type: 'static' };
            }
            const input = node.querySelector('input[type="text"]');
            return { text: input.value.trim(), completed: input.classList.contains('completed'), type: 'dynamic' };
        }).filter(item => item.text);
}

function getDynamicInputsForSaving(id) {
    const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) return [];
    return Array.from(container.querySelectorAll('.dynamic-input-item'))
        .map(node => ({
            text: node.querySelector('input[type="text"]').value.trim(),
            completed: node.querySelector('input[type="text"]').classList.contains('completed')
        })).filter(item => item.text).reverse();
}

function initializePopSystem() {
    const container = document.getElementById('popCodesContainer');
    if (!container) return;
    container.innerHTML = '';
    popCodes.forEach(code => {
        const checkbox = createElement('input', { type: 'checkbox', value: code, className: 'pop-checkbox', onchange: () => { checkExpiredPopCodes(); saveFormState(); } });
        container.appendChild(createElement('label', { className: 'checkbox-label' }, [checkbox, document.createTextNode(code)]));
    });
}

function checkExpiredPopCodes() {
    const warningMessage = document.getElementById('expiredWarning');
    if (!warningMessage) return;
    const hasExpired = Array.from(document.querySelectorAll('.pop-checkbox:checked')).some(cb => expiredCodes.includes(cb.value));
    warningMessage.style.display = hasExpired ? 'block' : 'none';
}

function copySelectedCodes() {
    const codes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(code => !expiredCodes.includes(code));
    if (codes.length === 0) return alert("Kopyalamak için geçerli kod seçin.");
    navigator.clipboard.writeText(codes.join(', ')).then(() => alert("Seçilen geçerli kodlar kopyalandı!"));
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
    const nonExpiredCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(code => !expiredCodes.includes(code));
    if (nonExpiredCodes.length === 0) return alert("E-Posta göndermek için geçerli (süresi dolmamış) kod seçin.");
    const emailHTML = `<!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>E-Posta Taslağı</title><style>body{font-family:Arial;padding:20px;}.block{margin-bottom:15px;}.label{font-weight:bold;color:#555;}</style></head><body><div class="block"><span class="label">Kime:</span> berkcan_boza@arcelik.com.tr</div><div class="block"><span class="label">CC:</span> "ugur.dogan@arcelik.com" &lt;ugur.dogan@arcelik.com.tr&gt;; "aykut.demen@arcelik.com.tr" &lt;aykut.demen@arcelik.com.tr&gt;; "Ahmet.Erol2@arcelik.com.tr" &lt;ahmet.erol2@arcelik.com.tr&gt;</div><div class="block"><span class="label">Konu:</span></div><div class="block"><span class="label">İçerik:</span><div style="margin-top:10px;">${nonExpiredCodes.join(', ')}</div></div></body></html>`;
    const emailWindow = window.open('', '_blank');
    emailWindow.document.write(emailHTML);
    emailWindow.document.close();
}

function handleFileSelect(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    const fileNameSpan = type === 'dide' ? document.getElementById('file-name') : document.getElementById('fide-file-name');
    fileNameSpan.textContent = `Yüklü dosya: ${file.name}`;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const workbook = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
            const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, defval: "" });
            if (type === 'dide') processDideExcelData(data, true, file.name); else processFideExcelData(data, true, file.name);
        } catch (error) { alert("Excel dosyası okunamadı."); console.error("Excel okuma hatası:", error); }
    };
    reader.readAsArrayBuffer(file);
}

function processExcelData(dataAsArray, config, saveToStorage, filename) {
    const { headerIdentifier, requiredColumns, dataProcessor } = config;
    let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => String(cell).trim() === headerIdentifier));
    if (headerRowIndex === -1) return alert(`Excel dosyasında "${headerIdentifier}" başlığı bulunamadı.`);
    
    const headerRow = dataAsArray[headerRowIndex].map(h => String(h).trim());
    const columnIndices = {};
    for (const col of requiredColumns) {
        const index = headerRow.indexOf(col);
        if (index === -1) return alert(`Excel dosyasında "${col}" sütunu bulunamadı.`);
        columnIndices[col] = index;
    }

    const dataRows = dataAsArray.slice(headerRowIndex + 1);
    const processedData = dataProcessor(dataRows, headerRow, columnIndices, dataAsArray);
    
    if (saveToStorage) {
        const persistenceData = { timestamp: new Date().getTime(), data: processedData, filename };
        localStorage.setItem(config.storageKey, JSON.stringify(persistenceData));
        if (auth.currentUser && database) database.ref(config.dbRef).set(persistenceData);
        alert(`${config.name} puan dosyası başarıyla işlendi ve kaydedildi.`);
    }
    config.populateFunction(processedData);
}

function processDideExcelData(data, save, filename) {
    processExcelData(data, {
        headerIdentifier: 'Bayi Kodu',
        requiredColumns: ['Bayi Kodu', 'Bayi', 'Bayi Yönetmeni'],
        storageKey: 'didePersistenceData',
        dbRef: 'excelData/dide',
        name: 'DiDe',
        populateFunction: populateDideState,
        dataProcessor: (dataRows, headerRow, indices) => {
            return dataRows.map(row => {
                if (!row[indices['Bayi Kodu']]) return null;
                const scores = {};
                headerRow.forEach((header, index) => {
                    const monthNumber = parseInt(header);
                    if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12 && row[index] != null) {
                        scores[monthNumber] = row[index];
                    }
                });
                return { 'Bayi Kodu': row[indices['Bayi Kodu']], 'Bayi': row[indices['Bayi']], 'Bayi Yönetmeni': row[indices['Bayi Yönetmeni']], scores };
            }).filter(Boolean);
        }
    }, save, filename);
}

function processFideExcelData(data, save, filename) {
    processExcelData(data, {
        headerIdentifier: 'Bayi Kodu',
        requiredColumns: ['Bayi Kodu'],
        storageKey: 'fidePersistenceData',
        dbRef: 'excelData/fide',
        name: 'FiDe',
        populateFunction: populateFideState,
        dataProcessor: (dataRows, headerRow, indices, fullData) => {
            const currentYear = new Date().getFullYear();
            let yearRowIndex = fullData.findIndex(row => row.some(cell => String(cell).trim() == currentYear));
            if (yearRowIndex === -1) { alert(`FiDe Excel'de '${currentYear}' yılı bulunamadı.`); return []; }
            
            const yearRow = fullData[yearRowIndex];
            const filledYearRow = yearRow.map((cell, i) => cell || yearRow[i-1]);
            const monthRow = fullData[yearRowIndex + 1];

            return dataRows.map(row => {
                if (!row[indices['Bayi Kodu']]) return null;
                const scores = {};
                for (let i = 0; i < filledYearRow.length; i++) {
                    const monthNumber = parseInt(monthRow[i]);
                    if (filledYearRow[i] == currentYear && !isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12 && row[i] != null && row[i] !== "") {
                        scores[monthNumber] = row[i];
                    }
                }
                return { 'Bayi Kodu': row[indices['Bayi Kodu']], scores };
            }).filter(Boolean);
        }
    }, save, filename);
}

function populateDideState(data) {
    dideData = data;
    const storeMap = new Map(dideData.map(row => [row['Bayi Kodu'], { bayiKodu: row['Bayi Kodu'], bayiAdi: row['Bayi'] }]));
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
        item.textContent = `${store.bayiAdi} (${store.bayiKodu})`;
        item.dataset.bayiKodu = store.bayiKodu;
        item.dataset.bayiAdi = store.bayiAdi;
        item.onclick = () => selectStore(store);
        storeListDiv.appendChild(item);
    });
}

function selectStore(store, loadSavedData = true) {
    document.querySelectorAll('.store-item.selected').forEach(i => i.classList.remove('selected'));
    const storeItem = document.querySelector(`.store-item[data-bayi-kodu="${store.bayiKodu}"]`);
    if (storeItem) storeItem.classList.add('selected');
    
    selectedStore = { bayiKodu: store.bayiKodu, bayiAdi: store.bayiAdi };
    localStorage.setItem('lastSelectedStoreCode', store.bayiKodu);
    
    document.getElementById('store-search-input').value = `${store.bayiKodu} - ${store.bayiAdi}`;
    document.getElementById('store-list').style.display = 'none';
    
    if (loadSavedData) loadReportForStore(store.bayiKodu); else resetForm();
    updateFormInteractivity(true);
}

function generateEmail() {
    if (!selectedStore) return alert('Lütfen bir bayi seçin!');
    saveFormState(); 
    const storeInfo = dideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    if (!storeInfo) return alert("Seçilen bayi için DiDe verisi bulunamadı.");
    
    const storeEmail = storeEmails[selectedStore.bayiKodu] || null;
    const storeEmailTag = storeEmail ? ` <a href="mailto:${storeEmail}" style="background-color:#e0f2f7;color:#005f73;font-weight:bold;padding:1px 6px;border-radius:4px;text-decoration:none;">@${storeEmail}</a>` : '';
    const yonetmenFirstName = (storeInfo['Bayi Yönetmeni'] || '').split(' ')[0];
    let greetingHtml = `<p>${yonetmenFirstName ? yonetmenFirstName + ' Bey' : ''} Merhaba,</p><p>&nbsp;</p><p>Ziyaret etmiş olduğum ${selectedStore.bayiKodu} ${selectedStore.bayiAdi} bayi karnesi ektedir.</p>`;
    
    let fideReportHtml = fideQuestions.map(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        if (!itemDiv || itemDiv.classList.contains('question-removed')) return '';
        const isCompleted = itemDiv.querySelector('.fide-title-container')?.classList.contains('question-completed');
        let contentHtml = '';

        if (q.type === 'standard') {
            const itemsForEmail = getCombinedInputs(`fide${q.id}`).filter(item => item.type === 'dynamic' || item.text.includes('<a href'));
            if (itemsForEmail.length > 0) {
                 contentHtml = `<ul>${itemsForEmail.map(item => `<li>${item.text}${item.completed ? ' <span style="background-color:#dcfce7;color:#166534;font-weight:bold;padding:1px 6px;border-radius:4px;">Tamamlandı</span>' : ''}</li>`).join('')}</ul>`;
            }
        } else if (q.type === 'product_list') {
            const productItems = Array.from(document.querySelectorAll('#selected-products-list .selected-product-item')).map(item => `<li>${productList.find(p=>p.code===item.dataset.code)?.name}: ${item.dataset.qty} ${getUnitForProduct(item.querySelector('span').textContent)}</li>`).join('');
            const pleksiItems = getCombinedInputs(`fide${q.id}_pleksi`).filter(item => !item.completed).map(item => `<li>${item.text}</li>`).join('');
            if (productItems) contentHtml += `<b><i>Sipariş verilmesi gerekenler:</i></b><ul>${productItems}</ul>`;
            if (pleksiItems) contentHtml += `<b><i>Pleksiyle sergilenmesi gerekenler:</i></b><ul>${pleksiItems}</ul>`;
        } else if (q.type === 'pop_system') {
            const codes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(c => !expiredCodes.includes(c));
            if (codes.length > 0) contentHtml = `<ul><li>${codes.join(', ')}</li></ul>`;
        }
        
        if (contentHtml || isCompleted) {
            const completedSpan = isCompleted ? ` <span style="background-color:#dcfce7;color:#166534;font-weight:bold;padding:1px 6px;border-radius:4px;">Tamamlandı</span>` : '';
            let emailTag = (q.type === 'pop_system') ? ` <a href="mailto:berkcan_boza@arcelik.com.tr" style="background-color:#e0f2f7;color:#005f73;font-weight:bold;padding:1px 6px;border-radius:4px;text-decoration:none;">@berkcan_boza</a>` : (q.wantsStoreEmail ? storeEmailTag : '');
            return `<p><b>FiDe ${q.id}. ${q.title}</b>${completedSpan}${emailTag}</p>${(!isCompleted || q.type === 'product_list') ? contentHtml : ''}<p>&nbsp;</p>`;
        }
        return '';
    }).join('');
    
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const fideStoreInfo = fideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    const monthHeaders = Array.from({length: currentMonth}, (_, i) => `<th style="border:1px solid #ddd;padding:6px;background-color:#f2f2f2;">${monthNames[i+1]}</th>`).join('');
    const dideScores = Array.from({length: currentMonth}, (_, i) => `<td style="border:1px solid #ddd;text-align:center;padding:6px;">${storeInfo.scores[i+1] || '-'}</td>`).join('');
    const fideScores = Array.from({length: currentMonth}, (_, i) => `<td style="border:1px solid #ddd;text-align:center;padding:6px;">${(fideStoreInfo?.scores?.[i+1] != null) ? fideStoreInfo.scores[i+1] : '-'}</td>`).join('');
    const tableHtml = `<div style="overflow-x:auto;"><table style="border-collapse:collapse;margin-top:10px;font-size:10pt;"><thead><tr><th style="border:1px solid #ddd;padding:6px;background-color:#f2f2f2;">${currentYear}</th>${monthHeaders}</tr></thead><tbody><tr><td style="border:1px solid #ddd;padding:6px;font-weight:bold;">DiDe</td>${dideScores}</tr><tr><td style="border:1px solid #ddd;padding:6px;font-weight:bold;">FiDe</td>${fideScores}</tr></tbody></table></div>`;
    
    const finalEmailBody = `${greetingHtml}<p>&nbsp;</p>${fideReportHtml}${tableHtml}`;
    
    ['dide-upload-card', 'form-content', 'load-from-email-section'].forEach(id => document.getElementById(id).style.display = 'none');
    document.querySelector('.action-button').style.display = 'none';

    document.getElementById('email-draft-container')?.remove();
    const draftContainer = createElement('div', { id: 'email-draft-container', className: 'card' });
    draftContainer.innerHTML = `<h2><a href="#" onclick="event.preventDefault(); returnToMainPage();" title="Ana Sayfaya Dön"><i class="fas fa-arrow-left" style="margin-right:10px;"></i></a><i class="fas fa-envelope-open-text"></i> E-posta Taslağı</h2><p>Aşağıdaki metni kopyalayıp e-posta olarak gönderebilirsiniz.</p><div id="email-draft-area" contenteditable="true" style="width:100%;min-height:500px;border:1px solid #ccc;padding:10px;margin-top:10px;font-family:Aptos,sans-serif;font-size:11pt;">${finalEmailBody}</div>`;
    document.querySelector('.container').appendChild(draftContainer);
}

function loadReport(reportData) {
    try {
        Object.keys(migrationMap).forEach(oldId => {
            if (reportData.questions_status[oldId]) {
                const newId = migrationMap[oldId];
                if (!reportData.questions_status[newId]) {
                    reportData.questions_status[newId] = reportData.questions_status[oldId];
                    delete reportData.questions_status[oldId];
                }
            }
        });

        if (reportData.selectedStore) {
            const storeData = uniqueStores.find(s => s.bayiKodu == reportData.selectedStore.bayiKodu);
            if (storeData) selectStore(storeData, false);
        } else {
            resetForm();
        }

        const formContainer = document.getElementById('form-content');
        for (const qId in reportData.questions_status) {
            let questionItem = document.getElementById(`fide-item-${qId}`);
            const archivedQuestion = fideQuestions.find(q => String(q.id) === String(qId));
            if (!questionItem && archivedQuestion?.isArchived) {
                formContainer.insertAdjacentHTML('beforeend', generateQuestionHtml(archivedQuestion));
                questionItem = document.getElementById(`fide-item-${qId}`);
            }
            if (!questionItem) continue;

            const data = reportData.questions_status[qId];
            const completeBtn = questionItem.querySelector('.fide-actions .status-btn');
            const removeBtn = questionItem.querySelector('.fide-actions .remove-btn');
            if (data.removed && removeBtn) toggleQuestionRemoved(removeBtn, qId);
            else if (data.completed && completeBtn) toggleQuestionCompleted(completeBtn, qId);
            
            if (data.dynamicInputs) {
                const containerId = (archivedQuestion?.type === 'product_list') ? `fide${qId}_pleksi` : `fide${qId}`;
                data.dynamicInputs.forEach(input => addDynamicInput(containerId, input.text, input.completed));
            }
            if (data.selectedProducts) data.selectedProducts.forEach(p => addProductToList(p.code, p.qty)); 
            if (data.selectedPops) {
                data.selectedPops.forEach(code => { const cb = document.querySelector(`.pop-checkbox[value="${code}"]`); if(cb) cb.checked = true; });
                checkExpiredPopCodes();
            }
        }
        updateFormInteractivity(true);
    } catch (error) { alert('Rapor yüklenirken bir hata oluştu!'); console.error("Rapor yükleme hatası:", error); }
}

function parseAndLoadFromEmail() {
    const emailText = document.getElementById('load-email-area').value.trim();
    if (!emailText) return alert("Lütfen e-posta içeriğini yapıştırın.");

    const storeMatch = emailText.match(/Ziyaret etmiş olduğum (\d{5,})\s/);
    if (storeMatch) {
        const storeToSelect = uniqueStores.find(s => String(s.bayiKodu) === storeMatch[1]);
        if (storeToSelect) selectStore(storeToSelect, false);
    } else if (!selectedStore) {
        return alert("E-postadan bayi bulunamadı, lütfen önce manuel bayi seçin.");
    } else {
        resetForm();
    }
    
    const questionRegex = /^[\s•o-]*FiDe\s+(\d+)\./i;
    const idsInEmail = new Set();
    let currentQuestionId = null;
    
    emailText.split('\n').forEach(line => {
        const trimmed = line.trim();
        const headerMatch = trimmed.match(questionRegex);
        if (headerMatch) {
            currentQuestionId = migrationMap[headerMatch[1]] || headerMatch[1];
            idsInEmail.add(currentQuestionId);
        } else if (currentQuestionId && trimmed) {
            const cleaned = trimmed.replace(/^[\s•o-]+\s*/, '');
            const q = fideQuestions.find(q => String(q.id) === currentQuestionId);
            if (!q || q.answerType === 'fixed' || /sipariş|pleksi/i.test(cleaned)) return;
            
            if (q.type === 'product_list' && /^\d{8,}/.test(cleaned)) {
                const [code, , qty] = cleaned.match(/(\d{8,}).*?(\d+)/) || [];
                if (productList.some(p => p.code === code)) return addProductToList(code, qty || 1);
            }
            if (!q.staticItems?.some(si => si.replace(/<[^>]*>/g, '').trim().includes(cleaned))) {
                addDynamicInput(q.type === 'product_list' ? `fide${currentQuestionId}_pleksi` : `fide${currentQuestionId}`, cleaned, false);
            }
        }
    });
    
    fideQuestions.forEach(q => {
        if (!q.isArchived && !idsInEmail.has(String(q.id))) {
            const removeBtn = document.querySelector(`#fide-item-${q.id} .fide-actions .remove-btn`);
            if (removeBtn && !removeBtn.closest('.fide-item').classList.contains('question-removed')) {
                toggleQuestionRemoved(removeBtn, q.id);
            }
        }
    });

    alert("E-posta içeriği forma aktarıldı!");
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
        if (!itemDiv && q.isArchived) return;
        
        const isRemoved = itemDiv?.classList.contains('question-removed') || false;
        const isCompleted = itemDiv?.querySelector('.fide-title-container')?.classList.contains('question-completed') || false;
        const questionData = { removed: isRemoved, completed: isCompleted };

        if (itemDiv) {
            if (q.type === 'standard') questionData.dynamicInputs = getDynamicInputsForSaving(`fide${q.id}`);
            else if (q.type === 'product_list') {
                questionData.selectedProducts = Array.from(document.querySelectorAll('#selected-products-list .selected-product-item')).map(item => ({ code: item.dataset.code, qty: item.dataset.qty }));
                questionData.dynamicInputs = getDynamicInputsForSaving(`fide${q.id}_pleksi`);
            } else if (q.type === 'pop_system') {
                questionData.selectedPops = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value);
            }
        }
        reportData.questions_status[q.id] = questionData;
    });
    return reportData;
}

function backupAllReports() {
    const allReports = localStorage.getItem('allFideReports');
    if (!allReports || Object.keys(JSON.parse(allReports)).length === 0) return alert('Yedeklenecek kayıtlı rapor bulunamadı.');
    const blob = new Blob([allReports], { type: 'application/json;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fide_rapor_yedek_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

function handleRestoreUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (confirm("Bu işlem mevcut tüm raporların üzerine yazacaktır. Emin misiniz?")) {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                JSON.parse(e.target.result); 
                localStorage.setItem('allFideReports', e.target.result);
                alert('Yedek başarıyla geri yüklendi! Sayfa yenileniyor.');
                window.location.reload();
            } catch (error) { alert('Geçersiz yedek dosyası!'); }
        };
        reader.readAsText(file);
    }
    event.target.value = null; 
}

async function handleMergeUpload(event) {
    const files = event.target.files;
    if (!files || files.length < 2) return alert("Birleştirmek için en az 2 dosya seçin.");
    
    try {
        const fileContents = await Promise.all(Array.from(files).map(file => file.text().then(JSON.parse)));
        const mergedReports = {};
        fileContents.forEach(backup => {
            for (const key in backup) {
                if (!mergedReports[key] || backup[key].timestamp > mergedReports[key].timestamp) {
                    mergedReports[key] = backup[key];
                }
            }
        });
        const blob = new Blob([JSON.stringify(mergedReports, null, 2)], { type: 'application/json;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `birlesik_fide_rapor_yedek_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        alert(`Başarılı! ${Object.keys(mergedReports).length} rapor içeren birleşik yedek indirildi.`);
    } catch (error) {
        alert("Birleştirme hatası: " + error);
    }
    event.target.value = null;
}

function restoreLastSession() {
    const lastStoreCode = localStorage.getItem('lastSelectedStoreCode');
    if (lastStoreCode && uniqueStores.length > 0) {
        const storeToRestore = uniqueStores.find(s => String(s.bayiKodu) === String(lastStoreCode));
        if (storeToRestore) selectStore(storeToRestore);
    }
}

function updateFormInteractivity(enable) {
    const formContent = document.getElementById('form-content');
    if (!formContent) return;
    formContent.querySelectorAll('button, select, input').forEach(el => el.disabled = !enable);
}