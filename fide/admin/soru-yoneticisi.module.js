// Bu dosya, Soru Yöneticisi panelinin tüm işlevselliğini içerir.
// (Soru Yönetimi Departmanı)

// --- Modül İçi (Lokal) Değişkenler ---
let fideQuestions = [], productList = [], migrationMap = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
let currentManagerView = 'active'; 

// --- Dışa Aktarılan (Exported) Fonksiyonlar ---

/**
 * Soru Yöneticisi için gerekli olan verileri Firebase'den yükler.
 */
export async function loadQuestionManagerData(auth, database) {
    await loadMigrationMap(auth, database);
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
    return questionsLoaded;
}

/**
 * Soru Yöneticisi arayüzünü ekrana çizer.
 */
export function renderQuestionManager() {
    const managerList = document.getElementById('manager-list');
    if(!managerList) return;
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
                <div><label>Soru Tipi</label><select class="question-type-select" data-action="toggle-special-ui">${selectOptionsHTML}</select></div>
                <div><label>Cevap Tipi</label><select class="answer-type-select">${answerTypeOptionsHTML}</select></div>
                <div class="manager-grid-switch-group">
                    <div class="archive-switch-container"><label>E-posta Ekle</label><label class="switch"><input type="checkbox" class="wants-email-checkbox" ${wantsStoreEmailChecked}><span class="slider green"></span></label></div>
                    <div class="archive-switch-container"><label>Arşivle</label><label class="switch"><input type="checkbox" class="archive-checkbox" data-action="filter-view" ${isArchivedChecked}><span class="slider"></span></label></div>
                </div>
            </div>
            <div>
                <label>Statik Maddeler (product_list / pop_system tipi için kullanılmaz)</label>
                <div class="editor-toolbar">
                   <button data-command="bold" title="Kalın"><i class="fas fa-bold"></i></button>
                   <button data-command="italic" title="İtalik"><i class="fas fa-italic"></i></button>
                   <button data-command="underline" title="Altı Çizili"><i class="fas fa-underline"></i></button>
                   <button data-command="link" title="Köprü Ekle/Düzenle/Kaldır"><i class="fas fa-link"></i></button>
                </div>
                <div class="editable-textarea" contenteditable="true">${staticItemsHtml}</div>
            </div>
            <div class="special-manager-container"></div>
            <div class="manager-item-footer">
                <button class="btn-warning btn-sm" data-action="clear-answers" data-id="${q.id}" title="Bu soruya ait TÜM cevapları BÜTÜN bayi raporlarından kalıcı olarak siler."><i class="fas fa-eraser"></i>Cevapları Temizle</button>
            </div>`;
        managerList.appendChild(itemDiv);
        toggleSpecialManagerUI(itemDiv.querySelector('.question-type-select'));
    });
    filterManagerView(); 
}

/**
 * Aktif/Arşivlenmiş soru görünümünü filtreler.
 */
export function filterManagerView() {
    currentManagerView = document.getElementById('view-active-btn').classList.contains('active') ? 'active' : 'archived';
    
    const items = document.querySelectorAll('#manager-list .manager-item');
    let visibleItemCount = 0;
    items.forEach(item => {
        const isArchived = item.querySelector('.archive-checkbox').checked;
        const shouldBeVisible = (currentManagerView === 'active' && !isArchived) || (currentManagerView === 'archived' && isArchived);
        item.classList.toggle('hidden-question', !shouldBeVisible);
        if(shouldBeVisible) visibleItemCount++;
    });

    const deleteAllBtn = document.getElementById('delete-all-archived-btn');
    const restoreAllBtn = document.getElementById('restore-all-archived-btn');
    if (currentManagerView === 'archived') {
        deleteAllBtn.disabled = visibleItemCount === 0;
        restoreAllBtn.disabled = visibleItemCount === 0;
    }
}

/**
 * Soru listesindeki tüm değişiklikleri Firebase'e kaydeder.
 */
export async function saveQuestions(auth, database) {
    if (!auth.currentUser || !database) return alert("Değişiklikleri buluta kaydetmek için lütfen giriş yapın.");
    
    const newProductList = [];
    const activeProductManager = document.querySelector('.product-list-manager');
    if (activeProductManager && activeProductManager.offsetParent !== null) {
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
         newProductList.push(...productList);
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

        if ((!id && id !== 0) || !title) { alert(`ID veya Başlık boş olamaz.`); return; }
        if(ids.has(id)) { alert(`HATA: ${id} ID'si mükerrer kullanılamaz.`); return; }
        ids.add(id);

        const staticItems = staticItemsHTML.split(/<br\s*\/?>/gi).map(s => s.trim()).filter(Boolean);
        const newQuestion = { id, title, type, answerType };
        if (staticItems.length > 0 && type !== 'product_list' && type !== 'pop_system') newQuestion.staticItems = staticItems;
        if (isArchived) newQuestion.isArchived = true;
        if (wantsStoreEmail) newQuestion.wantsStoreEmail = true;

        if (type === 'pop_system') {
            const popInput = item.querySelector('.pop-codes-input');
            const expiredInput = item.querySelector('.expired-pop-codes-input');
            if (popInput && expiredInput) {
                newQuestion.popCodes = popInput.value.split(',').map(c => c.trim()).filter(Boolean);
                newQuestion.expiredCodes = expiredInput.value.split(',').map(c => c.trim()).filter(Boolean);
            } else {
                 const original = fideQuestions.find(q => q.id === id);
                 newQuestion.popCodes = original ? original.popCodes : [];
                 newQuestion.expiredCodes = original ? original.expiredCodes : [];
            }
        }
        newQuestions.push(newQuestion);
    }

    newQuestions.sort((a, b) => a.id - b.id);

    const finalJsonData = { questions: newQuestions, productList: newProductList };

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        await database.ref('fideQuestionsData').set(finalJsonData);
        alert("Değişiklikler başarıyla buluta kaydedildi. Sayfa yenileniyor...");
        window.location.reload();
    } catch (error) {
        console.error("Sorular buluta kaydedilirken hata oluştu:", error);
        alert("HATA: Değişiklikler buluta kaydedilemedi. Lütfen internet bağlantınızı kontrol edin.");
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

// --- Diğer Dışa Aktarılan Fonksiyonlar ---
export function addNewQuestionUI() {
    // ... (içerik öncekiyle aynı)
    if (currentManagerView !== 'active') {
        alert("Yeni soru eklemek için 'Aktif Sorular' görünümünde olmalısınız.");
        return;
    }
    const managerList = document.getElementById('manager-list');
    const existingIds = Array.from(managerList.querySelectorAll('.manager-item')).map(item => parseInt(item.querySelector('.manager-id-input').value));
    const newId = existingIds.length > 0 ? Math.max(...existingIds.filter(id => !isNaN(id))) + 1 : 1;
    
    const itemDiv = document.createElement('div');
    itemDiv.className = 'manager-item';
    itemDiv.style.backgroundColor = '#dcfce7';
    itemDiv.dataset.id = newId;
    itemDiv.innerHTML = `
        <div class="manager-item-grid">
            <div><label>Soru ID</label><input type="number" class="manager-id-input" value="${newId}"></div>
            <div><label>Soru Başlığı</label><input type="text" class="question-title-input" placeholder="Yeni sorunun başlığını yazın..."></div>
            <div><label>Soru Tipi</label><select class="question-type-select" data-action="toggle-special-ui"><option value="standard" selected>standard</option><option value="product_list">product_list</option><option value="pop_system">pop_system</option></select></div>
            <div><label>Cevap Tipi</label><select class="answer-type-select"><option value="variable" selected>Değişken</option><option value="fixed">Sabit</option></select></div>
            <div class="manager-grid-switch-group">
                <div class="archive-switch-container"><label>E-posta Ekle</label><label class="switch"><input type="checkbox" class="wants-email-checkbox"><span class="slider green"></span></label></div>
                <div class="archive-switch-container"><label>Arşivle</label><label class="switch"><input type="checkbox" class="archive-checkbox" data-action="filter-view"><span class="slider"></span></label></div>
            </div>
        </div>
        <div>
            <label>Statik Maddeler</label>
            <div class="editor-toolbar">
               <button data-command="bold" title="Kalın"><i class="fas fa-bold"></i></button>
               <button data-command="italic" title="İtalik"><i class="fas fa-italic"></i></button>
               <button data-command="underline" title="Altı Çizili"><i class="fas fa-underline"></i></button>
               <button data-command="link" title="Köprü Ekle/Düzenle/Kaldır"><i class="fas fa-link"></i></button>
            </div>
            <div class="editable-textarea" contenteditable="true"></div>
        </div>
        <div class="special-manager-container"></div>
        <div class="manager-item-footer"><button class="btn-sm" data-action="cancel-new-question"><i class="fas fa-times"></i> İptal Et</button></div>`;
    managerList.appendChild(itemDiv);
    itemDiv.querySelector('input[type="text"]').focus();
}
export function restoreAllArchivedQuestions() {
    const itemsToRestore = document.querySelectorAll('#manager-list .manager-item:not(.hidden-question)');
    if (itemsToRestore.length === 0) return alert("Aktif edilecek arşivlenmiş soru bulunamadı.");
    
    if (confirm(`Arşivdeki ${itemsToRestore.length} sorunun tümünü aktif hale getirmek istediğinizden emin misiniz?`)) {
        itemsToRestore.forEach(item => {
            const checkbox = item.querySelector('.archive-checkbox');
            if (checkbox) checkbox.checked = false;
        });
        filterManagerView();
        alert("Arşivlenmiş tüm sorular aktif hale getirildi. Değişiklikleri kalıcı hale getirmek için 'Kaydet' butonuna tıklayın.");
    }
}
export function deleteAllArchivedQuestions() {
    const itemsToDelete = document.querySelectorAll('#manager-list .manager-item:not(.hidden-question)');
    if (itemsToDelete.length === 0) return alert("Silinecek arşivlenmiş soru bulunamadı.");

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
export async function deleteAllAnswersForQuestion(auth, database, questionId) {
    const questionTitle = document.querySelector(`.manager-item[data-id="${questionId}"] .question-title-input`).value;
    const confirmation = confirm(`DİKKAT! Bu işlem geri alınamaz.\n\nFiDe ${questionId} ("${questionTitle}") sorusuna ait TÜM cevapları, BÜTÜN bayi raporlarından kalıcı olarak silmek istediğinizden emin misiniz?`);
    
    if (!confirmation) return alert("İşlem iptal edildi.");
    if (!auth.currentUser || !database) return alert("Bu işlem için bulut bağlantısı gereklidir.");

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        const reportsRef = database.ref('allFideReports');
        const snapshot = await reportsRef.once('value');
        if (snapshot.exists()) {
            let updates = {};
            for (const storeKey in snapshot.val()) {
                if (snapshot.val()[storeKey]?.data?.questions_status?.[questionId]) {
                     updates[`${storeKey}/data/questions_status/${questionId}`] = null;
                }
            }
            if (Object.keys(updates).length > 0) await reportsRef.update(updates);
        }
        alert(`İşlem tamamlandı!\n\nFiDe ${questionId} sorusuna ait tüm cevaplar bütün raporlardan (bulut) başarıyla silindi.`);
    } catch (error) {
        console.error("Cevapları silerken bir hata oluştu:", error);
        alert("Bir hata oluştu! Cevaplar silinemedi. Lütfen konsolu kontrol edin.");
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

// --- Sadece Bu Modül İçinde Kullanılan (Lokal) Fonksiyonlar ---
// Bu fonksiyonların başına "export" eklemiyoruz, çünkü başka dosyaların
// bunları doğrudan çağırmasına gerek yok.

async function loadMigrationMap(auth, database) {
    migrationMap = {}; 
    if (auth.currentUser && database) {
        // ... içerik aynı
    }
}
function toggleSpecialManagerUI(selectElement) {
    // ... içerik aynı
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
    } else {
        specialContainer.className = 'special-manager-container'; 
    }
}
function renderProductManagerUI(container) {
    // ... içerik aynı
    const categories = productList.filter(p => p.type === 'header');
    let categoryOptions = '<option value="__end">Ana Liste (Sona Ekle)</option>';
    categories.forEach(cat => categoryOptions += `<option value="${cat.name}">${cat.name}</option>`);

    container.innerHTML = `
        <h4><i class="fas fa-boxes"></i> Ürün Listesi Yöneticisi</h4>
        <div class="bulk-add-container">
            <h5><i class="fas fa-paste"></i> Toplu Ürün Ekle</h5>
            <div class="bulk-add-controls">
                <select class="bulk-add-category-select">${categoryOptions}</select>
                <textarea class="bulk-product-input" placeholder="88001 Ürün Adı..."></textarea>
            </div>
            <button class="btn-success btn-sm" data-action="parse-products"><i class="fas fa-plus-circle"></i> Ekle</button>
        </div>
        <button class="btn-sm" data-action="toggle-detailed-editor"><i class="fas fa-edit"></i> Detaylı Editörü Göster</button>
        <div class="detailed-editor-panel">
            <div class="product-manager-actions">
                <button class="btn-primary btn-sm" data-action="add-category"><i class="fas fa-tags"></i> Kategori Ekle</button>
                <button class="btn-success btn-sm" data-action="add-product"><i class="fas fa-box"></i> Ürün Ekle</button>
            </div>
            <div class="product-list-editor"></div>
        </div>
    `;
    
    const editor = container.querySelector('.product-list-editor');
    productList.forEach(item => {
        if(item.type === 'header') addCategoryRow(editor, item);
        else addProductRow(editor, item);
    });
    setupProductManagerDragDrop(editor);
}
//... Diğer tüm lokal yardımcı fonksiyonlar buraya eklenecek
// (renderPopManagerUI, toggleDetailedEditor, parseAndAddProducts,
// addCategoryRow, addProductRow, setupProductManagerDragDrop, vs...)
// Bunlar çok uzun olduğu için tekrar eklemiyorum, ama hepsi export'suz olmalı.

// --- Dinamik olarak oluşturulan butonlara event atamak için fonksiyonlar ---
export function handleManagerListClick(event, auth, database) {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const managerItem = target.closest('.manager-item');

    switch (action) {
        case 'toggle-special-ui':
            toggleSpecialManagerUI(target);
            break;
        case 'filter-view':
            filterManagerView();
            break;
        case 'clear-answers':
            deleteAllAnswersForQuestion(auth, database, target.dataset.id);
            break;
        case 'cancel-new-question':
            managerItem.remove();
            break;
    }
}

export function handleEditorToolbarClick(event) {
    const button = event.target.closest('button[data-command]');
    if(button) {
        formatText(button, button.dataset.command);
    }
}

export function handleProductManagerClick(event) {
    const target = event.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const panel = target.closest('.product-list-manager');

    switch (action) {
        case 'parse-products':
            parseAndAddProducts(panel);
            break;
        case 'toggle-detailed-editor':
            toggleDetailedEditor(target);
            break;
        case 'add-category':
            addCategoryRow(panel.querySelector('.product-list-editor'));
            break;
        case 'add-product':
            addProductRow(panel.querySelector('.product-list-editor'));
            break;
        case 'remove-row':
            target.closest('.category-manager-row, .product-manager-row').remove();
            break;
    }
}