// --- Global Değişkenler ---
let fideQuestions = [], productList = [], migrationMap = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
let isFirebaseConnected = false;
let currentManagerView = 'active'; 

// --- Ana Uygulama Mantığı ---
window.onload = initializeApp;

async function initializeApp() {
    if (typeof auth === 'undefined') {
        console.error("Firebase auth başlatılamadı. db-config.js yüklendiğinden emin olun.");
        return;
    }
    
    setupEventListeners();

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
        renderQuestionManager();
    });
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
    
    // --- İSTEĞİNİZİ YERİNE GETİREN DEĞİŞİKLİK BURADA ---
    if (!questionsLoaded) {
        // Soru listesini boşaltıyoruz.
        fideQuestions = []; 
        
        // Sadece kullanıcı giriş yapmış olmasına rağmen yükleme başarısız olursa uyarı gösteriyoruz.
        // Eğer kullanıcı zaten çıkış yapmışsa (auth.currentUser yoksa), hiçbir uyarı göstermiyoruz.
        if (auth.currentUser) {
             alert("Soru listesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.");
        } else {
            console.log("Soruları görmek için lütfen giriş yapın.");
        }
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
            if(loginPopup) loginPopup.style.display = 'none';
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

    const questionToUpdate = fideQuestions.find(q => String(q.id) === oldId);
    if (!questionToUpdate) {
        alert(`HATA: "${oldId}" ID'li bir soru bulunamadı.`);
        return;
    }

    const isNewIdTaken = fideQuestions.some(q => String(q.id) === newId);
    if (isNewIdTaken) {
        alert(`HATA: "${newId}" ID'li bir soru zaten mevcut. Lütfen farklı bir ID seçin veya mevcut soruyu önce değiştirin.`);
        return;
    }

    // 1. Arka plandaki asıl veri kaynağını (diziyi) güncelle
    questionToUpdate.id = parseInt(newId, 10);

    // 2. Eski raporların yeni ID'yi bulabilmesi için yönlendirme kuralı ekle
    addMigrationMapping(oldId, newId);

    // 3. Güncellenmiş ve sıralanmış veriye göre tüm yönetici listesini yeniden çiz
    renderQuestionManager();

    // 4. Kullanıcıya geri bildirim ver ve güncellenen soruyu ekranda göster
    alert(`Başarılı!\n\n- Soru ${oldId} ID'si, ${newId} olarak güncellendi ve liste yeniden sıralandı.\n- Veri kaybını önlemek için yönlendirme kuralı eklendi.\n\nDeğişiklikleri kalıcı yapmak için 'Kaydet' butonuna basmayı unutmayın.`);
    
    // Kullanıcı deneyimini iyileştir: güncellenen elemanı bul, ona odaklan ve vurgula
    const newQuestionItem = document.querySelector(`.manager-item[data-id="${newId}"]`);
    if (newQuestionItem) {
        newQuestionItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        newQuestionItem.style.transition = 'background-color 0.5s ease';
        newQuestionItem.style.backgroundColor = '#dcfce7'; // Vurgu rengi
        setTimeout(() => {
            newQuestionItem.style.backgroundColor = ''; // Rengi normale döndür
        }, 3000);
    }

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
    if (!fideQuestions || fideQuestions.length === 0) {
        const isEmpty = !auth.currentUser ? "Soruları görmek için lütfen giriş yapın." : "Yüklenecek soru bulunamadı.";
        managerList.innerHTML = `<div class="empty-manager-message"><i class="fas fa-info-circle"></i> ${isEmpty}</div>`;
        return;
    }
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
            const originalPopQuestion = fideQuestions.find(q => q.id === id);
            newQuestion.popCodes = originalPopQuestion ? originalPopQuestion.popCodes : [];
            newQuestion.expiredCodes = originalPopQuestion ? originalPopQuestion.expiredCodes : [];
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
