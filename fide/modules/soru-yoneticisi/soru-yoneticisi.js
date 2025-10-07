// --- Global Değişkenler ---
let fideQuestions = [], productList = [], migrationMap = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
let currentManagerView = 'active'; 

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeSoruYoneticisiModule() {
    await loadInitialData();
    setupModuleEventListeners();
    renderQuestionManager();
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
            alert("Uyarı: Yönlendirme kuralları buluttan yüklenemedi.");
        }
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
    
    if (!questionsLoaded) {
        fideQuestions = fallbackFideQuestions;
        alert("Soru listesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin ve sisteme giriş yaptığınızdan emin olun.");
    }
}

function setupModuleEventListeners() {
    if (document.body.dataset.soruYoneticisiListenersAttached) return;
    document.body.dataset.soruYoneticisiListenersAttached = 'true';

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

async function migrateQuestionData(oldId, newId) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
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
        return true;
    } catch (error) {
        console.error("Veri taşıma sırasında bir hata oluştu:", error);
        alert("Kritik Hata: Raporlardaki cevaplar taşınamadı.");
        return false;
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function swapQuestionData(idA, idB) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
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
        return true;
    } catch (error) {
        console.error("Veri takas sırasında bir hata oluştu:", error);
        alert("Kritik Hata: Raporlardaki cevaplar takas edilemedi.");
        return false;
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function applyIdChangeScenario() {
    const oldId = document.getElementById('scenario-old-id').value.trim();
    const newId = document.getElementById('scenario-new-id').value.trim();
    if (!oldId || !newId) { alert("Lütfen hem 'Eski Soru ID' hem de 'Yeni Soru ID' alanlarını doldurun."); return; }
    if (oldId === newId) { alert("Eski ve yeni ID aynı olamaz."); return; }
    const questionToMove = fideQuestions.find(q => String(q.id) === String(oldId));
    if (!questionToMove) { alert(`HATA: "${oldId}" ID'li bir soru bulunamadı.`); return; }
    const targetQuestion = fideQuestions.find(q => String(q.id) === String(newId));
    if (!targetQuestion) {
        if (!confirm(`Bu işlem, ${oldId} ID'li soruyu ${newId} olarak güncelleyecek ve TÜM cevapları kalıcı olarak yeni ID'ye taşıyacaktır. Devam etmek istiyor musunuz?`)) return;
        const migrationSuccess = await migrateQuestionData(oldId, newId);
        if (!migrationSuccess) return;
        questionToMove.id = parseInt(newId, 10);
        addMigrationMapping(oldId, newId);
        alert(`Başarılı!\n\n- Soru ${oldId}, ${newId} ID'sine taşındı.\n- Tüm raporlardaki cevaplar kalıcı olarak taşındı.\n\nDeğişiklikleri kalıcı yapmak için 'Kaydet' butonuna basmayı unutmayın.`);
    } else {
        if (!confirm(`"${newId}" ID'si zaten başka bir soru tarafından kullanılıyor.\n\nİki sorunun ID'lerini ve kaydedilmiş TÜM cevaplarını birbiriyle DEĞİŞTİRMEK (takas etmek) istediğinizden emin misiniz?`)) return;
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
        deleteBtn.disabled = true;
        return;
    }
    const question = fideQuestions.find(q => String(q.id) === String(id));
    if (question) {
        previewArea.innerHTML = `<b>Silinecek Soru:</b> "${question.title.substring(0, 45)}..."`;
        deleteBtn.disabled = false;
    } else {
        previewArea.innerHTML = `"${id}" ID'li soru bulunamadı.`;
        deleteBtn.disabled = true;
    }
}

async function applyDeleteQuestionScenario() {
    const questionIdToDelete = document.getElementById('scenario-delete-id').value;
    if (!questionIdToDelete) { alert("Lütfen silinecek soru ID'sini girin."); return; }
    const question = fideQuestions.find(q => String(q.id) === String(questionIdToDelete));
    if (!question) { alert(`HATA: "${questionIdToDelete}" ID'li bir soru bulunamadı.`); return; }
    if (!confirm(`DİKKAT! BU İŞLEM GERİ ALINAMAZ!\n\nID: ${question.id}\nSoru: "${question.title}"\n\nYukarıdaki soruyu ve bu soruya ait TÜM bayi raporlarındaki cevapları kalıcı olarak silmek istediğinizden KESİNLİKLE emin misiniz?`)) return;
    if (!auth.currentUser || !database) { alert("Bu kritik işlem için bulut sistemine giriş yapmış olmanız gerekmektedir."); return; }
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
             if (Object.keys(updates).length > 0) { await reportsRef.update(updates); }
        }
        const newQuestions = fideQuestions.filter(q => String(q.id) !== String(questionIdToDelete));
        const finalJsonData = { questions: newQuestions, productList: productList };
        await database.ref('fideQuestionsData').set(finalJsonData);
        alert(`Başarılı!\n\nFiDe ${questionIdToDelete} sorusu ve ilişkili tüm cevaplar kalıcı olarak silindi. Sayfa yenileniyor.`);
        window.location.reload();
    } catch (error) {
        console.error("Soru silme senaryosu sırasında bir hata oluştu:", error);
        alert("Bir hata oluştu! Soru ve cevaplar silinemedi.");
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function renderMigrationManagerUI() {
    const listContainer = document.getElementById('migration-list-container');
    listContainer.innerHTML = '';
    if (Object.keys(migrationMap).length === 0) { listContainer.innerHTML = '<li class="empty-message">Henüz yönlendirme eklenmemiş.</li>'; }
    else {
        for (const oldId in migrationMap) {
            const newId = migrationMap[oldId];
            const listItem = document.createElement('li');
            listItem.innerHTML = `
                <span class="mapping-text">Eski ID: <b>${oldId}</b> <i class="fas fa-long-arrow-alt-right"></i> Yeni ID: <b>${newId}</b></span>
                <button class="btn-danger btn-sm" onclick="deleteMigrationMapping('${oldId}')" title="Bu yönlendirmeyi sil."><i class="fas fa-trash"></i></button>`;
            listContainer.appendChild(listItem);
        }
    }
}

async function addMigrationMapping(oldIdValue, newIdValue) {
    if (!oldIdValue || !newIdValue) { return; }
    if (oldIdValue === newIdValue) { return; }
    migrationMap[oldIdValue] = newIdValue;
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
    if (auth.currentUser && database) {
        try { await database.ref('migrationSettings/map').set(migrationMap); } 
        catch (error) { console.error("Veri taşıma ayarları buluta kaydedilemedi:", error); }
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
            if (newUrl === null) return;
            else if (newUrl === "") linkElement.outerHTML = linkElement.innerHTML;
            else linkElement.href = newUrl;
        } else {
            if (selection.toString().length === 0) { alert("Lütfen köprüye dönüştürmek istediğiniz metni seçin."); return; }
            const url = prompt("Lütfen köprü için URL girin:", "https://");
            if (url) {
                document.execCommand('createLink', false, url);
                const newLink = selection.anchorNode.parentNode.closest('a');
                if (newLink) newLink.target = '_blank';
            }
        }
    } else { document.execCommand(command, false, null); }
}

function renderQuestionManager() {
    const managerList = document.getElementById('manager-list');
    if (!managerList) return;
    managerList.innerHTML = '';
    fideQuestions.sort((a, b) => a.id - b.id).forEach(q => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'manager-item';
        itemDiv.dataset.id = q.id;
        let staticItemsHtml = (q.staticItems || []).join('<br>'); 
        const typeOptions = ['standard', 'product_list', 'pop_system'];
        const selectOptionsHTML = typeOptions.map(type => `<option value="${type}" ${q.type === type ? 'selected' : ''}>${type}</option>`).join('');
        const answerType = q.answerType || 'variable';
        const answerTypeOptionsHTML = `<option value="variable" ${answerType === 'variable' ? 'selected' : ''}>Değişken</option><option value="fixed" ${answerType === 'fixed' ? 'selected' : ''}>Sabit</option>`;
        const isArchivedChecked = q.isArchived ? 'checked' : '';
        const wantsStoreEmailChecked = q.wantsStoreEmail ? 'checked' : '';
        itemDiv.innerHTML = `
            <div class="manager-item-grid">
                <div><label>Soru ID</label><input type="number" class="manager-id-input" value="${q.id}" disabled></div>
                <div><label>Soru Başlığı</label><input type="text" class="question-title-input" value="${q.title}"></div>
                <div><label>Soru Tipi</label><select class="question-type-select" onchange="toggleSpecialManagerUI(this)">${selectOptionsHTML}</select></div>
                <div><label>Cevap Tipi</label><select class="answer-type-select">${answerTypeOptionsHTML}</select></div>
                <div class="manager-grid-switch-group">
                    <div class="archive-switch-container"><label>E-posta Ekle</label><label class="switch"><input type="checkbox" class="wants-email-checkbox" ${wantsStoreEmailChecked}><span class="slider green"></span></label></div>
                    <div class="archive-switch-container"><label>Arşivle</label><label class="switch"><input type="checkbox" class="archive-checkbox" ${isArchivedChecked} onchange="filterManagerView()"><span class="slider"></span></label></div>
                </div>
            </div>
            <div>
                <label>Statik Maddeler</label>
                <div class="editor-toolbar">
                   <button onclick="formatText(this, 'bold')"><i class="fas fa-bold"></i></button><button onclick="formatText(this, 'italic')"><i class="fas fa-italic"></i></button>
                   <button onclick="formatText(this, 'underline')"><i class="fas fa-underline"></i></button><button onclick="formatText(this, 'link')"><i class="fas fa-link"></i></button>
                </div>
                <div class="editable-textarea" contenteditable="true">${staticItemsHtml}</div>
            </div>
            <div class="special-manager-container"></div>
            <div class="manager-item-footer"><button class="btn-warning btn-sm" onclick="deleteAllAnswersForQuestion(${q.id})"><i class="fas fa-eraser"></i>Cevapları Temizle</button></div>`;
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
        renderProductManagerUI(specialContainer);
    } else if (selectElement.value === 'pop_system') {
        specialContainer.classList.add('pop-manager-container');
        renderPopManagerUI(specialContainer, question);
    } else { specialContainer.className = 'special-manager-container'; }
}

function renderPopManagerUI(container, questionData) {
    const popCodes = (questionData.popCodes || []).join(', ');
    const expiredCodes = (questionData.expiredCodes || []).join(', ');
    container.innerHTML = `
        <p class="pop-manager-info"><i class="fas fa-info-circle"></i> Kodları aralarına virgül (,) koyarak girin.</p>
        <div class="pop-manager-group"><label>Geçerli POP Kodları</label><textarea class="pop-codes-input" rows="5">${popCodes}</textarea></div>
        <div class="pop-manager-group"><label>Süresi Dolmuş POP Kodları</label><textarea class="expired-pop-codes-input" rows="3">${expiredCodes}</textarea></div>`;
}

function renderProductManagerUI(container) {
    const categories = productList.filter(p => p.type === 'header');
    let categoryOptions = '<option value="__end">Ana Liste (Sona Ekle)</option>';
    categories.forEach(cat => { categoryOptions += `<option value="${cat.name}">${cat.name}</option>`; });
    container.innerHTML = `
        <h4><i class="fas fa-boxes"></i> Ürün Listesi Yöneticisi</h4>
        <p class="product-manager-info"><i class="fas fa-info-circle"></i> Bu liste tüm "product_list" tipi sorular için ortaktır.</p>
        <div class="bulk-add-container">
            <h5><i class="fas fa-paste"></i> Toplu Ürün Ekle</h5>
            <p class="bulk-add-info">Her satıra bir ürün gelecek şekilde yapıştırın. (Örn: 123456 Enerji Etiketi)</p>
            <div class="bulk-add-controls">
                <select id="bulk-add-category-select">${categoryOptions}</select>
                <textarea id="bulk-product-input"></textarea>
            </div>
            <button class="btn-success btn-sm" onclick="parseAndAddProducts()"><i class="fas fa-plus-circle"></i> Yapıştırılanları Ekle</button>
        </div>
        <button id="toggle-detailed-editor-btn" class="btn-sm" onclick="toggleDetailedEditor(this)"><i class="fas fa-edit"></i> Detaylı Editörü Göster</button>
        <div id="detailed-editor-panel">
            <div class="product-manager-actions">
                <button class="btn-primary btn-sm" onclick="addCategoryRow(this.closest('#detailed-editor-panel').querySelector('.product-list-editor'))"><i class="fas fa-tags"></i> Kategori Ekle</button>
                <button class="btn-success btn-sm" onclick="addProductRow(this.closest('#detailed-editor-panel').querySelector('.product-list-editor'))"><i class="fas fa-box"></i> Ürün Ekle</button>
            </div>
            <div class="product-list-editor"></div>
        </div>`;
    const editor = container.querySelector('.product-list-editor');
    productList.forEach(item => {
        if(item.type === 'header') { addCategoryRow(editor, item); }
        else { addProductRow(editor, item); }
    });
     setupProductManagerDragDrop(editor);
}
function toggleDetailedEditor(button) {
    const panel = document.getElementById('detailed-editor-panel');
    panel.classList.toggle('open');
    button.innerHTML = panel.classList.contains('open') ? '<i class="fas fa-eye-slash"></i> Detaylı Editörü Gizle' : '<i class="fas fa-edit"></i> Detaylı Editörü Göster';
}
function parseAndAddProducts() {
    const container = document.querySelector('.product-list-manager');
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
        if (firstSpaceIndex > 0) {
            const product = { code: trimmedLine.substring(0, firstSpaceIndex).trim(), name: trimmedLine.substring(firstSpaceIndex + 1).trim() };
            if (product.code && product.name) {
                const newRow = addProductRow(editor, product, targetElement);
                targetElement = newRow; 
                addedCount++;
            }
        }
    });
    if (addedCount > 0) {
        alert(`${addedCount} adet ürün eklendi!`);
        textarea.value = '';
        if (!document.getElementById('detailed-editor-panel').classList.contains('open')) { document.getElementById('toggle-detailed-editor-btn').click(); }
    } else { alert("Hiçbir ürün eklenemedi. Formatı kontrol edin."); }
}
function addCategoryRow(container, category = {}, targetElement = null) {
    const row = document.createElement('div');
    row.className = 'category-manager-row';
    row.dataset.type = 'category';
    row.draggable = true;
    row.innerHTML = `<i class="fas fa-grip-vertical drag-handle"></i><i class="fas fa-tag category-icon"></i><input type="text" value="${category.name || ''}"><button class="btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>`;
    if (targetElement) { container.insertBefore(row, targetElement.nextSibling); }
    else { container.appendChild(row); }
    return row;
}
function addProductRow(container, product = {}, targetElement = null) {
    const row = document.createElement('div');
    row.className = 'product-manager-row';
    row.dataset.type = 'product';
    row.draggable = true;
    row.innerHTML = `<i class="fas fa-grip-vertical drag-handle"></i><input class="product-code" value="${product.code || ''}"><input class="product-name" value="${product.name || ''}"><button class="btn-danger btn-sm" onclick="this.parentElement.remove()"><i class="fas fa-trash"></i></button>`;
    if (targetElement) { container.insertBefore(row, targetElement.nextSibling); }
    else { container.appendChild(row); }
    return row;
}
function setupProductManagerDragDrop(container) {
    let draggingElement = null;
    container.addEventListener('dragstart', e => {
        draggingElement = e.target;
        setTimeout(() => { e.target.classList.add('dragging'); }, 0);
    });
    container.addEventListener('dragend', e => {
        if (draggingElement) { draggingElement.classList.remove('dragging'); draggingElement = null; }
    });
    container.addEventListener('dragover', e => {
        e.preventDefault();
        const afterElement = getDragAfterElement(container, e.clientY);
        const currentlyDragged = document.querySelector('.dragging');
        if (currentlyDragged) {
            if (afterElement == null) { container.appendChild(currentlyDragged); }
            else { container.insertBefore(currentlyDragged, afterElement); }
        }
    });
    function getDragAfterElement(container, y) {
        const draggableElements = [...container.querySelectorAll('[draggable="true"]:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) { return { offset: offset, element: child }; }
            else { return closest; }
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
    if (currentManagerView !== 'active') { return; }
    const managerList = document.getElementById('manager-list');
    const existingIds = Array.from(managerList.querySelectorAll('.manager-id-input')).map(input => parseInt(input.value));
    const newId = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 1;
    const itemDiv = document.createElement('div');
    itemDiv.className = 'manager-item';
    itemDiv.style.backgroundColor = '#dcfce7';
    itemDiv.dataset.id = newId;
    itemDiv.innerHTML = `
        <div class="manager-item-grid">
            <div><label>Soru ID</label><input type="number" class="manager-id-input" value="${newId}"></div>
            <div><label>Soru Başlığı</label><input type="text" class="question-title-input" placeholder="Yeni soru..."></div>
            <div><label>Soru Tipi</label><select class="question-type-select" onchange="toggleSpecialManagerUI(this)"><option value="standard" selected>standard</option><option value="product_list">product_list</option><option value="pop_system">pop_system</option></select></div>
            <div><label>Cevap Tipi</label><select class="answer-type-select"><option value="variable" selected>Değişken</option><option value="fixed">Sabit</option></select></div>
            <div class="manager-grid-switch-group">
                <div class="archive-switch-container"><label>E-posta Ekle</label><label class="switch"><input type="checkbox" class="wants-email-checkbox"><span class="slider green"></span></label></div>
                <div class="archive-switch-container"><label>Arşivle</label><label class="switch"><input type="checkbox" class="archive-checkbox" onchange="filterManagerView()"><span class="slider"></span></label></div>
            </div>
        </div>
        <div><label>Statik Maddeler</label><div class="editor-toolbar">...</div><div class="editable-textarea" contenteditable="true"></div></div>
        <div class="special-manager-container"></div>
        <div class="manager-item-footer"><button class="btn-sm" onclick="this.parentElement.parentElement.remove()"><i class="fas fa-times"></i> İptal</button></div>`;
    managerList.appendChild(itemDiv);
    itemDiv.querySelector('input[type="text"]').focus();
}
function restoreAllArchivedQuestions() {
    const itemsToRestore = document.querySelectorAll('#manager-list .manager-item:not(.hidden-question)');
    if (itemsToRestore.length === 0) return;
    if (confirm(`Arşivdeki ${itemsToRestore.length} sorunun tümünü aktif hale getirmek ister misiniz?`)) {
        itemsToRestore.forEach(item => { item.querySelector('.archive-checkbox').checked = false; });
        filterManagerView();
        alert("Arşivdeki sorular aktifleştirildi. Kaydetmeyi unutmayın.");
    }
}
function deleteAllArchivedQuestions() {
    const itemsToDelete = document.querySelectorAll('#manager-list .manager-item:not(.hidden-question)');
    if (itemsToDelete.length === 0) return;
    if (confirm(`Arşivdeki ${itemsToDelete.length} sorunun tümünü kalıcı olarak silmek istediğinizden emin misiniz?`)) {
        itemsToDelete.forEach(item => {
            item.style.opacity = '0';
            setTimeout(() => { item.classList.add('to-be-deleted'); item.style.display = 'none'; }, 500);
        });
        document.getElementById('delete-all-archived-btn').disabled = true;
        alert("Arşivdeki sorular silinmek üzere işaretlendi. Kaydetmeyi unutmayın.");
    }
}
async function deleteAllAnswersForQuestion(questionId) {
    const questionTitle = document.querySelector(`.manager-item[data-id="${questionId}"] .question-title-input`).value;
    if (!confirm(`FiDe ${questionId} ("${questionTitle}") sorusuna ait TÜM cevapları BÜTÜN raporlardan kalıcı olarak silmek istediğinizden emin misiniz?`)) return;
    if (!auth.currentUser || !database) { alert("Bulut bağlantısı gerekli."); return; }
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
            if (Object.keys(updates).length > 0) { await reportsRef.update(updates); }
        }
        alert(`FiDe ${questionId} sorusuna ait tüm cevaplar silindi.`);
    } catch (error) { console.error("Cevapları silerken hata oluştu:", error); } 
    finally { loadingOverlay.style.display = 'none'; }
}
async function saveQuestions() {
    if (!auth.currentUser || !database) { alert("Kaydetmek için giriş yapın."); return; }
    const newProductList = [];
    const activeProductManager = document.querySelector('.product-list-manager');
    if (activeProductManager && activeProductManager.offsetParent !== null) {
        activeProductManager.querySelectorAll('.category-manager-row, .product-manager-row').forEach(row => {
            if (row.dataset.type === 'category') {
                const name = row.querySelector('input').value.trim();
                if (name) newProductList.push({ type: 'header', name });
            } else if (row.dataset.type === 'product') {
                const code = row.querySelector('.product-code').value.trim();
                const name = row.querySelector('.product-name').value.trim();
                if (code && name) newProductList.push({ code, name });
            }
        });
    } else { Object.assign(newProductList, productList); }
    const newQuestions = [];
    const ids = new Set();
    document.querySelectorAll('#manager-list .manager-item').forEach(item => {
        if (item.classList.contains('to-be-deleted')) return;
        const id = parseInt(item.querySelector('.manager-id-input').value);
        const title = item.querySelector('.question-title-input').value.trim();
        if (!id || !title) { alert(`ID veya Başlık boş olamaz.`); return; }
        if(ids.has(id)) { alert(`HATA: ${id} ID'si mükerrer.`); return; }
        ids.add(id);
        const type = item.querySelector('.question-type-select').value;
        const answerType = item.querySelector('.answer-type-select').value;
        const staticItemsHTML = item.querySelector('.editable-textarea').innerHTML;
        const isArchived = item.querySelector('.archive-checkbox').checked;
        const wantsStoreEmail = item.querySelector('.wants-email-checkbox').checked;
        const staticItems = staticItemsHTML.split(/<br\s*\/?>/gi).map(s => s.trim()).filter(s => s);
        const newQuestion = { id, title, type, answerType };
        if (staticItems.length > 0) newQuestion.staticItems = staticItems;
        if (isArchived) newQuestion.isArchived = true;
        if (wantsStoreEmail) newQuestion.wantsStoreEmail = true;
        if (type === 'pop_system') {
            const popInput = item.querySelector('.pop-codes-input');
            const expiredInput = item.querySelector('.expired-pop-codes-input');
            if (popInput && expiredInput) {
                newQuestion.popCodes = popInput.value.split(',').map(c => c.trim()).filter(c => c);
                newQuestion.expiredCodes = expiredInput.value.split(',').map(c => c.trim()).filter(c => c);
            }
        }
        newQuestions.push(newQuestion);
    });
    newQuestions.sort((a, b) => a.id - b.id);
    const finalJsonData = { questions: newQuestions, productList: newProductList };
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        await database.ref('fideQuestionsData').set(finalJsonData);
        alert("Değişiklikler kaydedildi. Sayfa yenileniyor...");
        window.location.reload();
    } catch (error) { console.error("Kaydederken hata oluştu:", error); }
    finally { loadingOverlay.style.display = 'none'; }
}