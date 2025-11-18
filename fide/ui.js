import * as state from './state.js';
import { saveFormState } from './api.js';

let pb; 

// --- DEBOUNCE (Otomatik Kayıt) ---
let saveDebounceTimer;
function debouncedSaveFormState() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
        if (state.isPocketBaseConnected && state.selectedStore) {
            saveFormState(getFormDataForSaving()); 
        }
    }, 800); 
}

export function initUi(pbInstance) { pb = pbInstance; }

// --- HTML OLUŞTURUCULAR ---

function generateQuestionHtml(q) {
    let contentHTML = '';
    // Ortak Butonlar
    const btnDone = `<button class="status-btn btn-success btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})"><i class="fas fa-check"></i> Tamamlandı</button>`;
    const btnRemove = `<button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})"><i class="fas fa-times"></i> Çıkar</button>`;
    
    // 1. STANDART SORU
    if (q.type === 'standard') {
        const staticItems = (q.staticItems || []).map(item => `
            <div class="static-item">
                <div class="content">${item}</div>
                <button class="delete-bar btn-danger" onclick="initiateDeleteItem(this)"><i class="fas fa-trash"></i></button>
            </div>`).join('');
            
        contentHTML = `
            <div class="input-area">
                <div id="sub-items-container-fide${q.id}">${staticItems}</div>
            </div>
            <div class="fide-actions">
                <button class="add-item-btn btn-primary btn-sm" onclick="addDynamicInput('fide${q.id}')"><i class="fas fa-plus"></i> Not Ekle</button>
                ${btnDone} ${btnRemove}
            </div>`;

    // 2. ÜRÜN LİSTESİ
    } else if (q.type === 'product_list') {
        let options = state.productList.map(p => 
            p.type === 'header' ? `<optgroup label="${p.name}">` : `<option value="${p.code}">${p.code} - ${p.name}</option>`
        ).join('').replace(/<optgroup/g, '</optgroup><optgroup').replace(/^<\/optgroup>/, '') + '</optgroup>';

        contentHTML = `
            <div class="input-area">
                <div class="product-adder">
                    <select id="product-selector" style="flex-grow:1"><option value="">-- Malzeme Seçin --</option>${options}</select>
                    <input type="number" id="product-qty" value="1" min="1" style="width:80px">
                    <button class="btn-success btn-sm" onclick="addProductToList()"><i class="fas fa-plus"></i> Ekle</button>
                </div>
                <div id="selected-products-list"></div>
                <hr style="margin:15px 0; border-color:#e2e8f0">
                <p><b>Pleksi Notları:</b></p>
                <div id="sub-items-container-fide${q.id}_pleksi"></div>
            </div>
            <div class="fide-actions">
                <button class="add-item-btn btn-primary btn-sm" onclick="addDynamicInput('fide${q.id}_pleksi')"><i class="fas fa-plus"></i> Pleksi Notu</button>
                ${btnDone} ${btnRemove}
            </div>`;

    // 3. POP SİSTEMİ (Akıllı Checkboxlar)
    } else if (q.type === 'pop_system') {
        contentHTML = `
            <div class="input-area">
                <div class="pop-container" id="popCodesContainer"></div>
                <div class="warning-message" id="expiredWarning" style="display:none; margin-top:10px; color:red">Seçiminizde süresi dolmuş kodlar var!</div>
                <div style="margin-top:15px; display:flex; gap:5px; flex-wrap:wrap">
                    <button class="btn-primary btn-sm" onclick="copySelectedCodes()">Kopyala</button>
                    <button class="btn-warning btn-sm" onclick="clearSelectedCodes()">Temizle</button>
                    <button class="btn-danger btn-sm" onclick="selectExpiredCodes()">Bitenler</button>
                    <button class="btn-success btn-sm" onclick="openEmailDraft()">E-Posta</button>
                </div>
            </div>
            <div class="fide-actions">${btnDone} ${btnRemove}</div>`;

    // 4. STYLING LISTESI (v1.0.1 Mantığı Korundu, Tasarım Düzeltildi)
    } else if (q.type === 'styling_list') {
        let mainCats = (q.stylingData || []).map(mc => `<option value="${mc.name}">${mc.name}</option>`).join('');
        let staticItems = (q.staticItems || []).map(item => `
            <div class="static-item">
                <div class="content">${item}</div>
                <button class="delete-bar btn-danger" onclick="initiateDeleteItem(this)"><i class="fas fa-trash"></i></button>
            </div>`).join('');

        contentHTML = `
            <div class="input-area">
                <div class="mode-toggle-container">
                    <span class="mode-toggle-label">Malzeme Girişi</span>
                    <label class="switch">
                        <input type="checkbox" class="styling-mode-toggle" onchange="toggleStylingView(this, ${q.id})">
                        <span class="slider round"></span>
                    </label>
                </div>
                
                <div id="standard-view-container-${q.id}">${staticItems}</div>

                <div class="styling-list-container" id="styling-container-${q.id}" data-question-id="${q.id}" style="display:none">
                    <div style="display:flex; gap:10px; margin-bottom:10px">
                        <select class="styling-main-category-select"><option value="">-- Ana Kategori --</option>${mainCats}</select>
                    </div>
                    <div id="styling-sub-container-${q.id}" style="display:none; gap:10px; align-items:center">
                        <select class="styling-sub-category-select" style="flex-grow:1"></select>
                        <input type="number" class="sub-category-qty-input" value="1" min="1" style="width:60px; text-align:center">
                    </div>
                    <div class="styling-selected-products-list" style="margin-top:15px"></div>
                </div>
            </div>
            <div class="fide-actions">${btnDone} ${btnRemove}</div>`;
    }

    const isArchived = q.isArchived ? 'opacity:0.6; border:2px dashed #fbbf24' : '';
    return `
        <div class="fide-item" id="fide-item-${q.id}" style="${isArchived}">
            <div class="fide-title-container">
                <p><span class="badge">FiDe ${q.id}</span> ${q.title}</p>
            </div>
            ${contentHTML}
        </div>`;
}

// --- MANTIK VE VERİ YÖNETİMİ ---

function getFormDataForSaving() {
    // (Orijinal koddaki mantık korundu, sadece sadeleştirildi)
    let reportData = { questions_status: {} };
    state.fideQuestions.forEach(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        if (!itemDiv) return;
        
        const titleContainer = itemDiv.querySelector('.fide-title-container');
        const isCompleted = titleContainer ? titleContainer.classList.contains('question-completed') : false;
        const isRemoved = itemDiv.classList.contains('question-removed');
        
        const qData = { removed: isRemoved, completed: isCompleted, dynamicInputs: [], selectedProducts: [], selectedPops: [] };

        // Inputları topla
        itemDiv.querySelectorAll('.dynamic-input-item input').forEach(inp => {
            if(inp.value.trim()) qData.dynamicInputs.push({ text: inp.value.trim(), completed: inp.classList.contains('completed') });
        });
        
        // Ürünleri topla
        itemDiv.querySelectorAll('.selected-product-item').forEach(item => {
            // Styling için input, diğerleri için dataset kontrolü
            const qtyInput = item.querySelector('.qty-edit-input');
            const qty = qtyInput ? qtyInput.value : item.dataset.qty;
            qData.selectedProducts.push({ code: item.dataset.code, name: item.dataset.name, qty: qty });
        });

        // POP kodları
        itemDiv.querySelectorAll('.pop-checkbox:checked').forEach(cb => qData.selectedPops.push(cb.value));
        
        // Styling Seçimleri
        if (q.type === 'styling_list') {
             const mainSel = itemDiv.querySelector('.styling-main-category-select');
             const subSel = itemDiv.querySelector('.styling-sub-category-select');
             const qtyInp = itemDiv.querySelector('.sub-category-qty-input');
             if(mainSel && mainSel.value) {
                 qData.stylingCategorySelections = {
                     mainCategory: mainSel.value,
                     subCategory: subSel ? subSel.value : '',
                     subCategoryQty: qtyInp ? qtyInp.value : '1'
                 };
             }
        }
        
        reportData.questions_status[q.id] = qData;
    });
    return reportData;
}

// --- UI OLAYLARI (Event Handlers) ---

function addDynamicInput(id, value = '', isCompleted = false) {
    const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) return;
    
    const div = document.createElement('div');
    div.className = 'dynamic-input-item';
    // DİKKAT: Yeni CSS yapısına uygun HTML
    div.innerHTML = `
        <input type="text" placeholder="Notunuzu buraya yazın..." value="${value}" class="${isCompleted ? 'completed' : ''}">
        <div style="display:flex; gap:5px">
            <button class="status-btn btn-success btn-sm" onclick="toggleCompleted(this)"><i class="fas fa-check"></i></button>
            <button class="delete-bar btn-danger" onclick="initiateDeleteItem(this)"><i class="fas fa-trash"></i></button>
        </div>
    `;
    
    const input = div.querySelector('input');
    input.addEventListener('input', debouncedSaveFormState);
    container.prepend(div);
    if(!value) input.focus();
    debouncedSaveFormState();
}

function toggleCompleted(btn) {
    const input = btn.parentElement.previousElementSibling; // Input'u bul
    input.classList.toggle('completed');
    debouncedSaveFormState();
}

function initiateDeleteItem(btn) {
    const row = btn.closest('.static-item') || btn.closest('.dynamic-input-item');
    if (row) {
        row.remove();
        debouncedSaveFormState();
    }
}

function toggleQuestionCompleted(btn, id) {
    const item = document.getElementById(`fide-item-${id}`);
    const title = item.querySelector('.fide-title-container');
    const isComplete = title.classList.toggle('question-completed');
    
    btn.innerHTML = isComplete ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    btn.classList.toggle('undo', isComplete);
    
    // Styling değilse içeriği gizle
    if (!item.querySelector('.styling-mode-toggle')) {
        const area = item.querySelector('.input-area');
        if(area) area.style.display = isComplete ? 'none' : 'block';
    }
    debouncedSaveFormState();
}

function toggleQuestionRemoved(btn, id) {
    const item = document.getElementById(`fide-item-${id}`);
    const isRemoved = item.classList.toggle('question-removed');
    
    btn.innerHTML = isRemoved ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-times"></i> Çıkar';
    btn.classList.toggle('btn-primary', isRemoved);
    btn.classList.toggle('btn-danger', !isRemoved);
    
    debouncedSaveFormState();
}

// --- EXPORTLAR ---
// (Diğer yardımcı fonksiyonlar: addProductToList, styling fonksiyonları vb. orijinal main.js'ten çağrıldığı için 
// burada kısa tuttum ama orijinal kodunuzdaki fonksiyonların tamamı burada olmalı.
// Ben sadece *değişen* kritik yapıları yazdım. Kodun geri kalanını orijinal dosyanızdan koruyun.)

// ... (Styling ve Pop fonksiyonları buraya gelecek, mevcut mantıkla aynı) ...

export function buildForm() {
    const container = document.getElementById('form-content');
    if (!container) return;
    container.innerHTML = state.fideQuestions.filter(q => !q.isArchived).map(generateQuestionHtml).join('');
    
    // POP Kodlarını Doldur (Checkbox -> Label yapısı)
    const popContainer = document.getElementById('popCodesContainer');
    if(popContainer) {
        popContainer.innerHTML = state.popCodes.map(code => `
            <label class="checkbox-label">
                <input type="checkbox" class="pop-checkbox" value="${code}" onchange="checkExpiredPopCodes(); debouncedSaveFormState()">
                ${code}
            </label>
        `).join('');
    }
    
    // Styling Listenerları
    document.querySelectorAll('.styling-main-category-select').forEach(s => s.addEventListener('change', handleStylingMainCatChange));
}

// Gerekli global atamalar
export function attachUiFunctionsToWindow() {
    window.toggleQuestionCompleted = toggleQuestionCompleted;
    window.toggleQuestionRemoved = toggleQuestionRemoved;
    window.addDynamicInput = addDynamicInput;
    window.initiateDeleteItem = initiateDeleteItem;
    window.toggleCompleted = toggleCompleted;
    // ... diğer fonksiyonlar ...
}

// --- Styling Fonksiyonları (Eksik kalmasın) ---
// Orijinal kodunuzdaki handleStylingMainCatChange, handleStylingSubCatChange vb. fonksiyonları buraya eklemelisiniz.
// Tek fark: CSS sınıfları artık yeni tasarıma uygun çalışacak.
function toggleStylingView(checkbox, id) {
    const stylingCont = document.getElementById(`styling-container-${id}`);
    const stdCont = document.getElementById(`standard-view-container-${id}`);
    if(stylingCont) stylingCont.style.display = checkbox.checked ? 'block' : 'none';
    if(stdCont) stdCont.style.display = checkbox.checked ? 'none' : 'block';
}
window.toggleStylingView = toggleStylingView;