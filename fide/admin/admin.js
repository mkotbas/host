// --- Global Değişkenler ---
let fideQuestions = [], productList = [], migrationMap = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
let isFirebaseConnected = false;
let currentManagerView = 'active'; 
let isQuestionManagerRendered = false; // Soru yöneticisinin daha önce yüklenip yüklenmediğini kontrol eder

// --- Ana Uygulama Mantığı ---
window.onload = initializeApp;

async function initializeApp() {
    if (typeof auth === 'undefined') {
        console.error("Firebase auth başlatılamadı. db-config.js yüklendiğinden emin olun.");
        return;
    }
    await auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
    auth.onAuthStateChanged(async user => { 
        const loginToggleBtn = document.getElementById('login-toggle-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const loginPopup = document.getElementById('login-popup');
        
        if (user) {
            loginToggleBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-flex';
            loginPopup.style.display = 'none';
            // Sadece giriş yapıldıysa ilk paneli yükle
            switchPanel('veritabani-ayarlari'); 
        } else {
            loginToggleBtn.style.display = 'inline-flex';
            logoutBtn.style.display = 'none';
        }
        updateConnectionIndicator();
        setupEventListeners();
    });

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
    
    // Sol Menü Navigasyon
    document.querySelectorAll('.nav-link').forEach(link => {
        // Ana sayfaya dön linki hariç
        if (!link.classList.contains('nav-link-back')) {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetId = e.currentTarget.dataset.target;
                switchPanel(targetId);
            });
        }
    });

    // Giriş/Çıkış Butonları
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

    // --- VERİTABANI AYARLARI BUTONLARI ---
    document.getElementById('backup-btn').addEventListener('click', backupAllReports);
    document.getElementById('restore-from-backup-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
    document.getElementById('merge-backups-btn').addEventListener('click', () => document.getElementById('merge-file-input').click());
    document.getElementById('restore-file-input').addEventListener('change', handleRestoreUpload);
    document.getElementById('merge-file-input').addEventListener('change', handleMergeUpload);
    document.getElementById('analyze-orphan-reports-btn').addEventListener('click', analyzeOrphanReports);
    document.getElementById('check-consistency-btn').addEventListener('click', checkDataConsistency);
    document.getElementById('clean-field-btn').addEventListener('click', openFieldCleaner);
    document.getElementById('analyze-corrupt-reports-btn').addEventListener('click', analyzeCorruptReports);


    // --- SORU YÖNETİCİSİ BUTONLARI ---
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
}


// --- YENİ: Panel Değiştirme Fonksiyonu ---
async function switchPanel(targetId) {
    // Tüm panelleri ve linkleri pasif yap
    document.querySelectorAll('.content-panel').forEach(panel => panel.classList.remove('active'));
    document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

    // Hedef paneli ve linki aktif yap
    document.getElementById(`${targetId}-panel`).classList.add('active');
    document.querySelector(`.nav-link[data-target="${targetId}"]`).classList.add('active');

    // Eğer Soru Yöneticisi paneli seçildiyse ve daha önce yüklenmediyse, verileri çek ve render et
    if (targetId === 'soru-yoneticisi' && !isQuestionManagerRendered) {
        if (!auth.currentUser) {
            alert("Soru Yöneticisi'ni kullanmak için lütfen giriş yapın.");
            return;
        }
        document.getElementById('loading-overlay').style.display = 'flex';
        await loadQuestionManagerData();
        renderQuestionManager();
        isQuestionManagerRendered = true; // Yüklendi olarak işaretle
        document.getElementById('loading-overlay').style.display = 'none';
    }
}


// ============================================================================================
// --- SORU YÖNETİCİSİ BÖLÜMÜ (soru-yoneticisi.js'den taşındı) ---
// ============================================================================================

async function loadQuestionManagerData() {
    await loadMigrationMap();
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
        fideQuestions = fallbackFideQuestions;
        alert("Soru listesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin ve sisteme giriş yaptığınızdan emin olun.");
    }
}

async function loadMigrationMap() {
    const user = auth.currentUser;
    migrationMap = {}; // Her zaman temiz bir harita ile başla

    if (user && database) {
        try {
            const migrationRef = database.ref('migrationSettings/map');
            const snapshot = await migrationRef.once('value');
            if (snapshot.exists()) {
                migrationMap = snapshot.val();
            }
        } catch (error) {
            console.error("Buluttan veri taşıma ayarları yüklenemedi:", error);
            alert("Uyarı: Yönlendirme kuralları buluttan yüklenemedi.");
        }
    }
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

async function migrateQuestionData(oldId, newId) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    console.log(`Veri TAŞIMA işlemi başlatıldı: ${oldId} -> ${newId}`);
    try {
        if (!auth.currentUser || !database) {
            alert("Bu işlem için bulut bağlantısı gereklidir.");
            return false;
        }

        const reportsRef = database.ref('allFideReports');
        const snapshot = await reportsRef.once('value');
        if (snapshot.exists()) {
            let allCloudReports = snapshot.val();
            let updates = {};
            for (const storeKey in allCloudReports) {
                const report = allCloudReports[storeKey]?.data?.questions_status;
                if (report && report[oldId]) {
                    updates[`${storeKey}/data/questions_status/${newId}`] = report[oldId];
                    updates[`${storeKey}/data/questions_status/${oldId}`] = null;
                }
            }
            if (Object.keys(updates).length > 0) await reportsRef.update(updates);
        }
        
        console.log("Veri TAŞIMA işlemi başarıyla tamamlandı.");
        return true;
    } catch (error) {
        console.error("Veri taşıma sırasında bir hata oluştu:", error);
        alert("Kritik Hata: Raporlardaki cevaplar taşınamadı. Lütfen konsolu kontrol edin.");
        return false;
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function swapQuestionData(idA, idB) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    console.log(`Veri TAKAS işlemi başlatıldı: ${idA} <-> ${idB}`);
    try {
         if (!auth.currentUser || !database) {
            alert("Bu işlem için bulut bağlantısı gereklidir.");
            return false;
        }

        const reportsRef = database.ref('allFideReports');
        const snapshot = await reportsRef.once('value');
        if (snapshot.exists()) {
            let allCloudReports = snapshot.val();
            let updates = {};
            for (const storeKey in allCloudReports) {
                const report = allCloudReports[storeKey]?.data?.questions_status;
                if (report) {
                    const answerA = report[idA];
                    const answerB = report[idB];
                    updates[`${storeKey}/data/questions_status/${idA}`] = answerB || null;
                    updates[`${storeKey}/data/questions_status/${idB}`] = answerA || null;
                }
            }
            if (Object.keys(updates).length > 0) await reportsRef.update(updates);
        }
        
        console.log("Veri TAKAS işlemi başarıyla tamamlandı.");
        return true;
    } catch (error) {
        console.error("Veri takas sırasında bir hata oluştu:", error);
        alert("Kritik Hata: Raporlardaki cevaplar takas edilemedi. Lütfen konsolu kontrol edin.");
        return false;
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function applyIdChangeScenario() {
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

    const questionToMove = fideQuestions.find(q => String(q.id) === String(oldId));
    if (!questionToMove) {
        alert(`HATA: "${oldId}" ID'li bir soru bulunamadı.`);
        return;
    }

    const targetQuestion = fideQuestions.find(q => String(q.id) === String(newId));

    if (!targetQuestion) {
        const confirmation = confirm(`Bu işlem, ${oldId} ID'li soruyu ${newId} olarak güncelleyecek ve TÜM cevapları kalıcı olarak yeni ID'ye taşıyacaktır. Devam etmek istiyor musunuz?`);
        if (!confirmation) return;

        const migrationSuccess = await migrateQuestionData(oldId, newId);
        if (!migrationSuccess) return;

        questionToMove.id = parseInt(newId, 10);
        addMigrationMapping(oldId, newId);
        
        alert(`Başarılı!\n\n- Soru ${oldId}, ${newId} ID'sine taşındı.\n- Tüm raporlardaki cevaplar kalıcı olarak taşındı.\n\nDeğişiklikleri kalıcı yapmak için 'Kaydet' butonuna basmayı unutmayın.`);

    } else {
        const confirmation = confirm(`"${newId}" ID'si zaten başka bir soru tarafından kullanılıyor.\n\nİki sorunun ID'lerini ve kaydedilmiş TÜM cevaplarını birbiriyle DEĞİŞTİRMEK (takas etmek) istediğinizden emin misiniz?`);
        if (!confirmation) return;

        const swapSuccess = await swapQuestionData(oldId, newId);
        if (!swapSuccess) return;

        questionToMove.id = parseInt(newId, 10);
        targetQuestion.id = parseInt(oldId, 10);

        delete migrationMap[oldId];
        delete migrationMap[newId];
        await saveMigrationMap();
        
        alert(`Başarılı!\n\n- ${oldId} ve ${newId} ID'li sorular birbiriyle değiştirildi.\n- Her iki soruya ait tüm cevaplar da raporlarda takas edildi.\n\nDeğişiklikleri kalıcı yapmak için 'Kaydet' butonuna basmayı unutmayın.`);
    }

    renderQuestionManager();
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

        const newQuestions = fideQuestions.filter(q => String(q.id) !== String(questionIdToDelete));

        const finalJsonData = {
            questions: newQuestions,
            productList: productList
        };

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

async function addMigrationMapping(oldIdValue, newIdValue) {
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
    await saveMigrationMap();
}

async function deleteMigrationMapping(oldIdToDelete) {
    if (confirm(`'${oldIdToDelete}' ID'li yönlendirmeyi silmek istediğinizden emin misiniz?`)) {
        delete migrationMap[oldIdToDelete];
        await saveMigrationMap();
        renderMigrationManagerUI();
    }
}

async function saveMigrationMap() {
    const user = auth.currentUser;
    if (user && database) {
        try {
            await database.ref('migrationSettings/map').set(migrationMap);
        } catch (error) {
            console.error("Veri taşıma ayarları buluta kaydedilemedi:", error);
            alert("Hata: Yönlendirme ayarları buluta kaydedilemedi.");
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
                <div><label>Soru Tipi</label><select class="question-type-select" onchange="toggleSpecialManagerUI(this)">${selectOptionsHTML}</select></div>
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
                <label>Statik Maddeler (product_list / pop_system tipi için kullanılmaz)</label>
                <div class="editor-toolbar">
                   <button onclick="formatText(this, 'bold')" title="Kalın"><i class="fas fa-bold"></i></button>
                   <button onclick="formatText(this, 'italic')" title="İtalik"><i class="fas fa-italic"></i></button>
                   <button onclick="formatText(this, 'underline')" title="Altı Çizili"><i class="fas fa-underline"></i></button>
                   <button onclick="formatText(this, 'link')" title="Köprü Ekle/Düzenle/Kaldır"><i class="fas fa-link"></i></button>
                </div>
                <div class="editable-textarea" contenteditable="true">${staticItemsHtml}</div>
            </div>
            <div class="special-manager-container"></div>
            <div class="manager-item-footer">
                <button class="btn-warning btn-sm" onclick="deleteAllAnswersForQuestion(${q.id})" title="Bu soruya ait TÜM cevapları BÜTÜN bayi raporlarından kalıcı olarak siler."><i class="fas fa-eraser"></i>Cevapları Temizle</button>
            </div>`;
        managerList.appendChild(itemDiv);

        toggleSpecialManagerUI(itemDiv.querySelector('.question-type-select'));
    });
    filterManagerView(); 
}

function toggleSpecialManagerUI(selectElement) {
    const managerItem = selectElement.closest('.manager-item');
    const specialContainer = managerItem.querySelector('.special-manager-container');
    const question = fideQuestions.find(q => String(q.id) === managerItem.dataset.id) || {};

    specialContainer.innerHTML = ''; 

    if (selectElement.value === 'product_list') {
        specialContainer.classList.add('product-list-manager');
        specialContainer.classList.remove('pop-manager-container');
        renderProductManagerUI(specialContainer);
    } else if (selectElement.value === 'pop_system') {
        specialContainer.classList.add('pop-manager-container');
        specialContainer.classList.remove('product-list-manager');
        renderPopManagerUI(specialContainer, question);
    } else {
        specialContainer.className = 'special-manager-container'; 
    }
}

function renderPopManagerUI(container, questionData) {
    const popCodes = (questionData.popCodes || []).join(', ');
    const expiredCodes = (questionData.expiredCodes || []).join(', ');

    container.innerHTML = `
        <p class="pop-manager-info">
            <i class="fas fa-info-circle"></i> Kodları aralarına virgül (,) koyarak girin. Boşluklar otomatik olarak temizlenecektir. Bu listeler, ana ekrandaki materyal seçim kutularını ve 'Bitenler' butonunun işlevini belirler.
        </p>
        <div class="pop-manager-group">
            <label for="pop-codes-input-${questionData.id}">Geçerli POP Kodları</label>
            <textarea id="pop-codes-input-${questionData.id}" class="pop-codes-input" rows="5" placeholder="100001, 100002, 100003...">${popCodes}</textarea>
        </div>
        <div class="pop-manager-group">
            <label for="expired-pop-codes-input-${questionData.id}">Süresi Dolmuş (Biten) POP Kodları</label>
            <textarea id="expired-pop-codes-input-${questionData.id}" class="expired-pop-codes-input" rows="3" placeholder="900001, 900002...">${expiredCodes}</textarea>
        </div>
    `;
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
            <div><label>Soru Tipi</label><select class="question-type-select" onchange="toggleSpecialManagerUI(this)"><option value="standard" selected>standard</option><option value="product_list">product_list</option><option value="pop_system">pop_system</option></select></div>
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
            <label>Statik Maddeler (product_list / pop_system tipi için kullanılmaz)</label>
            <div class="editor-toolbar">
               <button onclick="formatText(this, 'bold')" title="Kalın"><i class="fas fa-bold"></i></button>
               <button onclick="formatText(this, 'italic')" title="İtalik"><i class="fas fa-italic"></i></button>
               <button onclick="formatText(this, 'underline')" title="Altı Çizili"><i class="fas fa-underline"></i></button>
               <button onclick="formatText(this, 'link')" title="Köprü Ekle/Düzenle/Kaldır"><i class="fas fa-link"></i></button>
            </div>
            <div class="editable-textarea" contenteditable="true"></div>
        </div>
        <div class="special-manager-container"></div>
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

    if (!auth.currentUser || !database) {
        alert("Bu işlem için bulut bağlantısı gereklidir.");
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        const reportsRef = database.ref('allFideReports');
        const snapshot = await reportsRef.once('value');
        if (snapshot.exists()) {
            let allCloudReports = snapshot.val();
            let updates = {};
            for (const storeKey in allCloudReports) {
                if (allCloudReports[storeKey]?.data?.questions_status?.[questionId]) {
                     updates[`${storeKey}/data/questions_status/${questionId}`] = null;
                }
            }
            if (Object.keys(updates).length > 0) {
                await reportsRef.update(updates);
            }
        }
        
        alert(`İşlem tamamlandı!\n\nFiDe ${questionId} sorusuna ait tüm cevaplar bütün raporlardan (bulut) başarıyla silindi.`);

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
    const activeProductManager = document.querySelector('.product-list-manager');
    if (activeProductManager && activeProductManager.offsetParent !== null) { // Check if it's visible
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
        if (staticItems.length > 0 && type !== 'product_list' && type !== 'pop_system') newQuestion.staticItems = staticItems;
        if (isArchived) newQuestion.isArchived = true;
        if (wantsStoreEmail) newQuestion.wantsStoreEmail = true;

        if (type === 'pop_system') {
            const popInput = item.querySelector('.pop-codes-input');
            const expiredInput = item.querySelector('.expired-pop-codes-input');
            if (popInput && expiredInput) {
                newQuestion.popCodes = popInput.value.split(',').map(c => c.trim()).filter(c => c);
                newQuestion.expiredCodes = expiredInput.value.split(',').map(c => c.trim()).filter(c => c);
            } else {
                 const originalPopQuestion = fideQuestions.find(q => q.id === id);
                 newQuestion.popCodes = originalPopQuestion ? originalPopQuestion.popCodes : [];
                 newQuestion.expiredCodes = originalPopQuestion ? originalPopQuestion.expiredCodes : [];
            }
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


// ============================================================================================
// --- VERİTABANI YÖNETİMİ BÖLÜMÜ (main.js'den taşındı) ---
// ============================================================================================

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

async function backupAllReports() {
    if (!auth.currentUser || !database) {
        return alert('Yedekleme yapmak için giriş yapmalısınız.');
    }
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        const reportsRef = database.ref();
        const snapshot = await reportsRef.once('value');
        if (!snapshot.exists()) {
            return alert('Yedeklenecek veri bulunamadı.');
        }
        const allData = JSON.stringify(snapshot.val(), null, 2); // null, 2 for pretty print
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
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function handleRestoreUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!auth.currentUser || !database) {
        return alert('Yedek yüklemek için giriş yapmalısınız.');
    }

    if (confirm("Bu işlem, buluttaki mevcut tüm verilerin üzerine yazılacaktır. Devam etmek istediğinizden emin misiniz?")) {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.display = 'flex';
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
                 loadingOverlay.style.display = 'none';
            }
        };
        reader.readAsText(file);
    }
    event.target.value = null; 
}

async function handleMergeUpload(event) {
    const files = event.target.files;
    if (!files || files.length < 2) { alert("Lütfen birleştirmek için en az 2 yedek dosyası seçin."); return; }
    
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    let mergedReports = {};
    let fileReadPromises = [];
    for (const file of files) {
        const promise = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    const reportData = data.allFideReports ? data.allFideReports : (data.reports ? data.reports : null);
                    if (reportData === null) reject(`'${file.name}' dosyasında 'allFideReports' veya 'reports' anahtarı bulunamadı.`);
                    resolve(reportData);
                } catch (err) { reject(`'${file.name}' dosyası okunamadı veya JSON formatında değil.`); }
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
        loadingOverlay.style.display = 'none';
        event.target.value = null; 
    }
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

async function analyzeCorruptReports() {
    if (!backupReminder()) return;
    showModal(
        '<i class="fas fa-spinner fa-spin"></i> Bozuk Raporlar Taranıyor...',
        '<p>Lütfen bekleyin. Tüm raporların yapısı kontrol ediliyor...</p>',
        '<button class="btn-secondary" onclick="hideModal()">Kapat</button>'
    );

    try {
        const reportsSnapshot = await database.ref('allFideReports').once('value');
        if (!reportsSnapshot.exists()) {
            showModal('<i class="fas fa-info-circle"></i> Analiz Tamamlandı', '<p>Veritabanında analiz edilecek rapor bulunamadı.</p>', '<button class="btn-primary" onclick="hideModal()">Tamam</button>');
            return;
        }

        const allReports = reportsSnapshot.val();
        const corruptReports = [];

        for (const reportKey in allReports) {
            const report = allReports[reportKey];
            if (!report.data || !report.data.questions_status) {
                const bayiKodu = reportKey.replace('store_', '');
                corruptReports.push({
                    key: reportKey,
                    bayiKodu: bayiKodu,
                    bayiAdi: 'Bilinmeyen Bayi (Detaylar Rapor İçinde)'
                });
            }
        }

        if (corruptReports.length === 0) {
            showModal('<i class="fas fa-check-circle"></i> Analiz Sonucu', '<p>Harika! Sistemde hiç bozuk ("hayalet") rapor bulunamadı. Veritabanınız temiz.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } else {
            let listHtml = `<div class="maintenance-info"><i class="fas fa-info-circle"></i> Sistemde ${corruptReports.length} adet içi boş veya bozuk yapıda rapor bulundu. Bu raporlar uygulamanın hata vermesine neden olur. Silmek istediklerinizi seçin.</div>`;
            listHtml += '<div class="maintenance-list">';
            corruptReports.forEach(report => {
                listHtml += `
                    <div class="maintenance-list-item">
                        <label>
                            <input type="checkbox" class="corrupt-checkbox" value="${report.key}">
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
                <button class="btn-danger" onclick="deleteSelectedCorruptReports()"><i class="fas fa-trash"></i> Seçilenleri Kalıcı Olarak Sil</button>
            `;
            showModal('<i class="fas fa-heart-crack"></i> Bozuk Rapor Analizi Sonuçları', listHtml, footerHtml);
        }

    } catch (error) {
        console.error("Bozuk rapor analizi hatası:", error);
        showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Analiz sırasında bir hata oluştu. Lütfen konsolu kontrol edin.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
    }
}

async function deleteSelectedCorruptReports() {
    const selectedCorrupt = Array.from(document.querySelectorAll('.corrupt-checkbox:checked')).map(cb => cb.value);
    if (selectedCorrupt.length === 0) {
        return alert("Lütfen silmek için en az bir rapor seçin.");
    }
    if (confirm(`${selectedCorrupt.length} adet bozuk rapor kalıcı olarak silinecektir. Bu işlem geri alınamaz. Emin misiniz?`)) {
        showModal(
            '<i class="fas fa-spinner fa-spin"></i> Siliniyor...',
            `<p>${selectedCorrupt.length} adet rapor siliniyor, lütfen bekleyin...</p>`,
            ''
        );
        try {
            const updates = {};
            selectedCorrupt.forEach(key => {
                updates[`/allFideReports/${key}`] = null;
            });
            await database.ref().update(updates);
            showModal('<i class="fas fa-check-circle"></i> Başarılı', `<p>${selectedCorrupt.length} adet bozuk rapor başarıyla silindi.</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } catch (error) {
            console.error("Bozuk rapor silme hatası:", error);
            showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Raporlar silinirken bir hata oluştu. Lütfen konsolu kontrol edin.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        }
    }
}