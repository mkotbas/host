import * as state from './state.js';
import { saveFormState } from './api.js';

let pb; // PocketBase instance

// --- DEBOUNCE MEKANİZMASI (Değişiklik yok) ---
let saveDebounceTimer;
function debouncedSaveFormState() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
        if (state.isPocketBaseConnected && state.selectedStore) {
            saveFormState(getFormDataForSaving()); 
        }
    }, 800);
}
// --- DEBOUNCE MEKANİZMASI BİTTİ ---


/**
 * UI modülünü PocketBase instance ile başlatır.
 * @param {object} pbInstance 
 */
export function initUi(pbInstance) {
    pb = pbInstance;
}

// --- Form ve Arayüz Yönetimi Fonksiyonları ---

function getUnitForProduct(productName) {
    const upperCaseName = productName.toUpperCase();
    if (upperCaseName.includes('TSHIRT') || upperCaseName.includes('HIRKA')) { return 'Adet'; }
    return 'Paket';
}

// === GÜNCELLENDİ: 'onclick' yerine 'data-action' eklendi ===
function generateQuestionHtml(q) {
    let questionActionsHTML = '';
    let questionContentHTML = '';
    let isArchivedClass = q.isArchived ? 'archived-item' : ''; 

    if (q.type === 'standard') {
        questionActionsHTML = `<div class="fide-actions">
            <button class="add-item-btn btn-sm" data-action="add-input" data-container-id="fide${q.id}" title="Bu maddeyle ilgili yeni bir eksiklik satırı ekler."><i class="fas fa-plus"></i> Yeni Eksik Ekle</button>
            <button class="status-btn btn-sm" data-action="toggle-complete" data-question-id="${q.id}" title="Bu soruyu 'Tamamlandı' olarak işaretler. Geri alınabilir."><i class="fas fa-check"></i> Tamamlandı</button>
            <button class="remove-btn btn-danger btn-sm" data-action="toggle-remove" data-question-id="${q.id}" title="Bu soruyu e-posta raporundan tamamen çıkarır. Geri alınabilir."><i class="fas fa-times-circle"></i> Çıkar</button>
            </div>`;
        let staticItemsHTML = (q.staticItems || []).map(item => `<div class="static-item"><div class="content">${item}</div><button class="delete-bar btn-danger" data-action="delete-item" title="Bu satırı silmek için tıklayın. 4 saniye içinde geri alınabilir."><i class="fas fa-trash"></i></button></div>`).join('');
        questionContentHTML = `<div class="input-area"><div id="sub-items-container-fide${q.id}">${staticItemsHTML}</div></div>`;
    
    } else if (q.type === 'product_list') {
        questionActionsHTML = `<div class="fide-actions">
            <button class="add-item-btn btn-sm" data-action="add-input" data-container-id="fide${q.id}_pleksi" title="Pleksi kullanımıyla ilgili yeni bir eksiklik satırı ekler."><i class="fas fa-plus"></i> Yeni Ekle</button>
            <button class="status-btn btn-sm" data-action="toggle-complete" data-question-id="${q.id}" title="Bu soruyu 'Tamamlandı' olarak işaretler. Geri alınabilir."><i class="fas fa-check"></i> Tamamlandı</button>
            <button class="remove-btn btn-danger btn-sm" data-action="toggle-remove" data-question-id="${q.id}" title="Bu soruyu e-posta raporundan tamamen çıkarır. Geri alınabilir."><i class="fas fa-times-circle"></i> Çıkar</button>
            </div>`;
        let productOptions = '';
        let currentOptgroup = false;
        state.productList.forEach(p => {
            if (p.type === 'header') {
                if (currentOptgroup) productOptions += `</optgroup>`;
                productOptions += `<optgroup label="${p.name}">`;
                currentOptgroup = true;
            } else {
                productOptions += `<option value="${p.code}">${p.code} - ${p.name}</option>`;
            }
        });
        if (currentOptgroup) productOptions += `</optgroup>`;
        questionContentHTML = `<div class="input-area"><b><i>Sipariş verilmesi gerekenler:</i></b>
            <div class="product-adder">
                <select id="product-selector"><option value="">-- Malzeme Seçin --</option>${productOptions}</select>
                <input type="number" id="product-qty" placeholder="Adet" min="1" value="1">
                <button class="btn-success btn-sm" data-action="add-product" title="Seçili malzemeyi ve adedini aşağıdaki sipariş listesine ekler."><i class="fas fa-plus"></i> Ekle</button>
            </div>
            <div id="selected-products-list"></div><hr><b class="plexi-header"><i>Pleksiyle sergilenmesi gerekenler veya Yanlış Pleksi malzeme ile kullanılanlar:</i></b>
            <div id="sub-items-container-fide${q.id}_pleksi"></div></div>`;
    
    } else if (q.type === 'pop_system') {
        questionActionsHTML = `<div class="fide-actions">
            <button class="status-btn btn-sm" data-action="toggle-complete" data-question-id="${q.id}" title="Bu soruyu 'Tamamlandı' olarak işaretler. Geri alınabilir."><i class="fas fa-check"></i> Tamamlandı</button>
            <button class="remove-btn btn-danger btn-sm" data-action="toggle-remove" data-question-id="${q.id}" title="Bu soruyu e-posta raporundan tamamen çıkarır. Geri alınabilir."><i class="fas fa-times-circle"></i> Çıkar</button>
            </div>`;
        questionContentHTML = `<div class="input-area"><div class="pop-container" id="popCodesContainer"></div><div class="warning-message" id="expiredWarning">Seçiminizde süresi dolmuş kodlar bulunmaktadır.</div>
            <div class="pop-button-container">
                <button class="btn-success btn-sm" data-action="pop-copy" title="Seçili olan geçerli POP kodlarını panoya kopyalar.">Kopyala</button>
                <button class="btn-danger btn-sm" data-action="pop-clear" title="Tüm POP kodu seçimlerini temizler.">Temizle</button>
                <button class="btn-primary btn-sm" data-action="pop-expired" title="Süresi dolmuş olan tüm POP kodlarını otomatik olarak seçer.">Bitenler</button>
                <button class="btn-primary btn-sm" data-action="pop-email" title="Seçili POP kodları için bir e-posta taslağı penceresi açar.">E-Posta</button>
            </div></div>`;
    }
    return `<div class="fide-item ${isArchivedClass}" id="fide-item-${q.id}"><div class="fide-title-container"><p><span class="badge">FiDe ${q.id}</span> ${q.title}</p></div>${questionContentHTML}${questionActionsHTML}</div>`;
}
// === GÜNCELLEME BİTTİ ===

function getFormDataForSaving() {
    let reportData = { questions_status: {} };
    state.fideQuestions.forEach(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        if (!itemDiv) return;

        const isRemoved = itemDiv.classList.contains('question-removed');
        const titleContainer = itemDiv.querySelector('.fide-title-container');
        const isCompleted = titleContainer ? titleContainer.classList.contains('question-completed') : false;
        
        const questionData = { removed: isRemoved, completed: isCompleted, dynamicInputs: [], selectedProducts: [], selectedPops: [] };

        if (q.type === 'standard') {
            const container = document.getElementById(`sub-items-container-fide${q.id}`);
            if (container) {
                Array.from(container.childNodes).reverse().forEach(node => {
                    if (node.classList && node.classList.contains('dynamic-input-item')) {
                        const input = node.querySelector('input[type="text"]');
                        const text = input.value.trim();
                        if (text) questionData.dynamicInputs.push({ text: text, completed: input.classList.contains('completed') });
                    }
                });
            }
        } else if (q.type === 'product_list') {
            document.querySelectorAll(`#fide-item-${q.id} #selected-products-list .selected-product-item`).forEach(item => {
                questionData.selectedProducts.push({ code: item.dataset.code, qty: item.dataset.qty });
            });
            const pleksiContainer = document.getElementById(`sub-items-container-fide${q.id}_pleksi`);
             if (pleksiContainer) {
                Array.from(pleksiContainer.childNodes).reverse().forEach(node => {
                    if (node.classList && node.classList.contains('dynamic-input-item')) {
                        const input = node.querySelector('input[type="text"]');
                        const text = input.value.trim();
                        if (text) questionData.dynamicInputs.push({ text: text, completed: input.classList.contains('completed') });
                    }
                });
            }
        } else if (q.type === 'pop_system') {
            questionData.selectedPops = Array.from(document.querySelectorAll(`#fide-item-${q.id} .pop-checkbox:checked`)).map(cb => cb.value);
        }
        reportData.questions_status[q.id] = questionData;
    });
    return reportData;
}


// --- Dışarıya Açılacak Ana Fonksiyonlar ---

export function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = state.isPocketBaseConnected && (typeof pb !== 'undefined' && pb && pb.authStore.isValid);
    
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}

export function returnToMainPage() {
    const emailDraft = document.getElementById('email-draft-container');
    if (emailDraft) emailDraft.remove();
    document.getElementById('dide-upload-card').style.display = 'block';
    document.getElementById('form-content').style.display = 'block';
    // 'generate-email-btn' id'li butonu bul
    const emailBtn = document.getElementById('generate-email-btn');
    if(emailBtn) emailBtn.style.display = 'block';
}

export function resetForm() { 
    state.setCurrentReportId(null);
    const formContainer = document.getElementById('form-content');
    if(formContainer) formContainer.innerHTML = ''; 
    buildForm(); 
}

export function buildForm() {
    const formContainer = document.getElementById('form-content');
    if (!formContainer) return;
    formContainer.innerHTML = '';
    let html = '';
    state.fideQuestions.forEach(q => {
        if (q.isArchived) { return; }
        html += generateQuestionHtml(q);
    });
    formContainer.innerHTML = html;
    
    const popContainer = document.getElementById('popCodesContainer');
    if (popContainer) {
        initializePopSystem(popContainer);
    }
}

export function startNewReport() {
    state.setSelectedStore(null);
    state.setCurrentReportId(null);
    const searchInput = document.getElementById('store-search-input');
    if (searchInput) searchInput.value = '';
    resetForm();
    updateFormInteractivity(false);
}

export async function generateEmail() {
    if (!state.selectedStore) {
        alert('Lütfen denetime başlamadan önce bir bayi seçin!');
        return;
    }

    let emailTemplate = `<p>{YONETMEN_ADI} Bey Merhaba,</p><p>Ziyaret etmiş olduğum {BAYI_BILGISI} bayi karnesi aşağıdadır.</p><p><br></p>{DENETIM_ICERIGI}<p><br></p>{PUAN_TABLOSU}`;
    if (pb && pb.authStore.isValid) {
        try {
            const templateRecord = await pb.collection('ayarlar').getFirstListItem('anahtar="emailTemplate"');
            if (templateRecord && templateRecord.deger) emailTemplate = templateRecord.deger;
        } catch (error) {
             if (error.status !== 404) console.error("E-posta şablonu buluttan yüklenemedi.", error);
        }
    }

    const reportData = getFormDataForSaving();
    await saveFormState(reportData, true);

    const storeInfo = state.dideData.find(row => String(row['Bayi Kodu']) === String(state.selectedStore.bayiKodu));
    const fideStoreInfo = state.fideData.find(row => String(row['Bayi Kodu']) === String(state.selectedStore.bayiKodu));
    if (!storeInfo) {
        alert("Seçilen bayi için DiDe verisi bulunamadı. Lütfen DiDe Excel dosyasını yükleyin.");
        return;
    }
    
    const storeEmail = state.storeEmails[state.selectedStore.bayiKodu] || null;
    const storeEmailTag = storeEmail ? ` <a href="mailto:${storeEmail}" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@${storeEmail}</a>` : '';
    const yonetmenFirstName = (storeInfo['Bayi Yönetmeni'] || '').split(' ')[0];
    const shortBayiAdi = state.selectedStore.bayiAdi.length > 20 ? state.selectedStore.bayiAdi.substring(0, 20) + '...' : state.selectedStore.bayiAdi;
    
    let fideReportHtml = "";
    state.fideQuestions.forEach(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        if (!itemDiv || itemDiv.classList.contains('question-removed')) return;
        
        const isQuestionCompleted = itemDiv.querySelector('.fide-title-container')?.classList.contains('question-completed');
        let contentHtml = '';

        if (q.type === 'standard') {
            const container = document.getElementById(`sub-items-container-fide${q.id}`);
            if (container) {
                const allItems = [];
                Array.from(container.childNodes).reverse().forEach(node => {
                    if (node.classList && (node.classList.contains('static-item') || node.classList.contains('dynamic-input-item'))) {
                        if(node.classList.contains('is-deleting')) return;
                        let text, completed = false, type = '';
                        if (node.classList.contains('static-item')) {
                            text = node.querySelector('.content').innerHTML; type = 'static';
                        } else {
                            const input = node.querySelector('input[type="text"]');
                            text = input.value.trim(); completed = input.classList.contains('completed'); type = 'dynamic';
                        }
                        if (text) allItems.push({ text, completed, type });
                    }
                });
                 const hasDynamicItems = allItems.some(item => item.type === 'dynamic');
                 let itemsForEmail = hasDynamicItems ? allItems.filter(item => item.type === 'dynamic' || (item.type === 'static' && item.text.includes('<a href'))) : allItems.filter(item => item.type === 'static');
                 if (itemsForEmail.length > 0) {
                     itemsForEmail.sort((a,b) => (a.text.includes('<a href') ? 1 : -1) - (b.text.includes('<a href') ? 1 : -1));
                     contentHtml = `<ul>${itemsForEmail.map(item => item.completed ? `<li>${item.text} <span style="background-color:#dcfce7; color:#166534; font-weight:bold; padding: 1px 6px; border-radius: 4px;">Tamamlandı</span></li>` : `<li>${item.text}</li>`).join('')}</ul>`;
                 }
            }
        } else if (q.type === 'product_list') {
            const productItemsHtml = Array.from(document.querySelectorAll('#selected-products-list .selected-product-item')).map(item => {
                const product = state.productList.find(p => p.code === item.dataset.code);
                if(product) { const unit = getUnitForProduct(product.name); return `<li>${product.code} ${product.name}: <b>${item.dataset.qty} ${unit}</b></li>`; }
                return null;
            }).filter(Boolean);
            const pleksiContainer = document.getElementById(`sub-items-container-fide${q.id}_pleksi`);
            const pleksiItemsHtml = pleksiContainer ? Array.from(pleksiContainer.querySelectorAll('input[type="text"]')).filter(i => !i.classList.contains('completed')).map(i => `<li>${i.value}</li>`) : [];
            if (productItemsHtml.length > 0) contentHtml += `<b><i>Sipariş verilmesi gerekenler:</i></b><ul>${productItemsHtml.join('')}</ul>`;
            if (pleksiItemsHtml.length > 0) contentHtml += `<b><i>Pleksiyle sergilenmesi gerekenler veya Yanlış Pleksi malzeme ile kullanılanlar:</i></b><ul>${pleksiItemsHtml.join('')}</ul>`;
        } else if (q.type === 'pop_system') {
            const nonExpiredCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(code => !state.expiredCodes.includes(code));
            if (nonExpiredCodes.length > 0) contentHtml = `<ul><li>${nonExpiredCodes.join(', ')}</li></ul>`;
        }

        if (contentHtml !== '' || isQuestionCompleted) {
            const completedSpan = isQuestionCompleted ? ` <span style="background-color:#dcfce7; color:#166534; font-weight:bold; padding: 1px 6px; border-radius: 4px;">Tamamlandı</span>` : "";
            let emailTag = (q.wantsStoreEmail && q.type !== 'pop_system') ? storeEmailTag : '';
            if (q.type === 'pop_system' && q.popEmailTo && q.popEmailTo.length > 0) {
                emailTag = ` <a href="mailto:${q.popEmailTo.join(',')}" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@${q.popEmailTo.join(', ')}</a>`;
            }
            fideReportHtml += `<p><b>FiDe ${q.id}. ${q.title}</b>${completedSpan}${emailTag}</p>`;
            if (!isQuestionCompleted || q.type === 'product_list' || (isQuestionCompleted && q.type === 'standard' && contentHtml !== '')) fideReportHtml += contentHtml;
        }
    });

    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    let monthHeaders = Array.from({length: currentMonth}, (_, i) => `<th style="border: 1px solid #dddddd; text-align: center; padding: 6px; background-color: #f2f2f2; font-weight: bold; white-space: nowrap;">${state.monthNames[i + 1] || i + 1}</th>`).join('');
    let dideScores = Array.from({length: currentMonth}, (_, i) => `<td style="border: 1px solid #dddddd; text-align: center; padding: 6px; white-space: nowrap;">${storeInfo.scores[i + 1] || '-'}</td>`).join('');
    let fideScores = Array.from({length: currentMonth}, (_, i) => {
         const score = (fideStoreInfo && fideStoreInfo.scores && fideStoreInfo.scores[i+1] !== undefined) ? fideStoreInfo.scores[i+1] : '-';
         return `<td style="border: 1px solid #dddddd; text-align: center; padding: 6px; white-space: nowrap;">${score}</td>`;
    }).join('');
    const tableHtml = `<div style="overflow-x: auto;"><table style="border-collapse: collapse; margin-top: 10px; font-size: 10pt; border: 1px solid #dddddd;"><thead><tr><th style="border: 1px solid #dddddd; text-align: center; padding: 6px; background-color: #f2f2f2; font-weight: bold;">${currentYear}</th>${monthHeaders}</tr></thead><tbody><tr><td style="border: 1px solid #dddddd; text-align: left; padding: 6px; font-weight: bold;">DiDe</td>${dideScores}</tr><tr><td style="border: 1px solid #dddddd; text-align: left; padding: 6px; font-weight: bold;">FiDe</td>${fideScores}</tr></tbody></table></div>`;

    let finalEmailBody = emailTemplate
        .replace(/{YONETMEN_ADI}/g, yonetmenFirstName || 'Yetkili')
        .replace(/{BAYI_BILGISI}/g, `${state.selectedStore.bayiKodu} ${shortBayiAdi}`)
        .replace(/{DENETIM_ICERIGI}/g, fideReportHtml)
        .replace(/{PUAN_TABLOSU}/g, tableHtml);

    document.getElementById('dide-upload-card').style.display = 'none';
    document.getElementById('form-content').style.display = 'none';
    // 'generate-email-btn' id'li butonu bul ve gizle
    const emailBtn = document.getElementById('generate-email-btn');
    if(emailBtn) emailBtn.style.display = 'none';

    const draftContainer = document.createElement('div');
    draftContainer.id = 'email-draft-container';
    draftContainer.className = 'card';
    
    // === GÜNCELLENDİ: 'onclick' kaldırıldı, 'data-action' eklendi ===
    draftContainer.innerHTML = `<h2><a href="#" data-action="return-to-main" style="text-decoration: none; color: inherit;" title="Ana Sayfaya Dön"><i class="fas fa-arrow-left" style="margin-right: 10px;"></i></a><i class="fas fa-envelope-open-text"></i> Kopyalanacak E-posta Taslağı</h2><div id="email-draft-area" contenteditable="true" style="min-height: 500px; border: 1px solid #ccc; padding: 10px; margin-top: 10px; font-family: Aptos, sans-serif; font-size: 11pt;">${finalEmailBody}</div>`;
    
    document.querySelector('.container').appendChild(draftContainer);
}

export function loadReportUI(reportData) {
    if (!reportData) { resetForm(); updateFormInteractivity(true); return; }
    try {
        resetForm(); 
        for (const qId in reportData) {
            let questionItem = document.getElementById(`fide-item-${qId}`);
            if (!questionItem) continue;

            const data = reportData[qId];
            if (data.removed) toggleQuestionRemoved(questionItem.querySelector('[data-action="toggle-remove"]'), qId, false);
            else if (data.completed) toggleQuestionCompleted(questionItem.querySelector('[data-action="toggle-complete"]'), qId, false);
            
            if (data.dynamicInputs) {
                const qInfo = state.fideQuestions.find(q => String(q.id) === qId);
                data.dynamicInputs.forEach(input => {
                    const containerId = (qInfo && qInfo.type === 'product_list') ? `fide${qId}_pleksi` : `fide${qId}`;
                    addDynamicInput(containerId, input.text, input.completed, false);
                });
            }
            if (data.selectedProducts) data.selectedProducts.forEach(prod => addProductToList(prod.code, prod.qty, false)); 
            if (data.selectedPops) {
                data.selectedPops.forEach(popCode => { const cb = document.querySelector(`.pop-checkbox[value="${popCode}"]`); if(cb) cb.checked = true; });
                checkExpiredPopCodes();
            }
        }
        updateFormInteractivity(true);
    } catch (error) { alert('Geçersiz rapor verisi!'); console.error("Rapor yükleme hatası:", error); }
}

export function updateFormInteractivity(enable) {
    const formContent = document.getElementById('form-content');
    if (!formContent) return;
    formContent.querySelectorAll('button, input, select').forEach(el => { el.disabled = !enable; });
    // Ana e-posta butonunu da etkinleştir/devre dışı bırak
    const emailBtn = document.getElementById('generate-email-btn');
    if(emailBtn) emailBtn.disabled = !enable;
}

// --- === YENİ FONKSİYON: Tüm dinamik tıklamaları yönetir === ---
/**
 * form-content içindeki tüm data-action tıklamalarını yakalar.
 * @param {Event} event 
 */
export function handleFormClick(event) {
    const target = event.target;
    // Tıklanan öğeyi veya en yakın 'data-action'a sahip ebeveyni bul
    const actionTarget = target.closest('[data-action]');
    if (!actionTarget) return; // Tıklanan yer eyleme bağlı değil

    const action = actionTarget.dataset.action;
    // 'fide-item' en dışta olduğu için, 'question-id'yi oradan al
    const qId = actionTarget.closest('.fide-item')?.id.split('-')[2];

    switch (action) {
        case 'add-input':
            addDynamicInput(actionTarget.dataset.containerId);
            break;
        case 'toggle-complete':
            toggleQuestionCompleted(actionTarget, qId);
            break;
        case 'toggle-remove':
            toggleQuestionRemoved(actionTarget, qId);
            break;
        case 'delete-item':
            initiateDeleteItem(actionTarget);
            break;
        case 'toggle-input-complete':
            toggleCompleted(actionTarget);
            break;
        case 'add-product':
            addProductToList();
            break;
        case 'pop-copy':
            copySelectedCodes();
            break;
        case 'pop-clear':
            clearSelectedCodes();
            break;
        case 'pop-expired':
            selectExpiredCodes();
            break;
        case 'pop-email':
            openEmailDraft();
            break;
        case 'return-to-main':
            event.preventDefault();
            returnToMainPage();
            break;
    }
}


// --- Dahili Fonksiyonlar ('window'a atanmayacaklar) ---

function initializePopSystem(container) {
    container.innerHTML = '';
    state.popCodes.forEach(code => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = code;
        checkbox.className = 'pop-checkbox';
        checkbox.addEventListener('change', () => {
            checkExpiredPopCodes();
            debouncedSaveFormState();
        });
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(code));
        container.appendChild(label);
    });
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
        const timerId = setTimeout(() => { 
            itemEl.remove(); 
            debouncedSaveFormState(); 
        }, 4000);
        itemEl.dataset.deleteTimer = timerId;
    }
    debouncedSaveFormState();
}

function addProductToList(productCode, quantity, shouldSave = true) {
    const select = document.getElementById('product-selector');
    const qtyInput = document.getElementById('product-qty');
    const selectedProductCode = productCode || select.value;
    const selectedQty = quantity || qtyInput.value;
    if (!selectedProductCode || !selectedQty || selectedQty < 1) return alert('Lütfen malzeme ve geçerli bir miktar girin.');
    
    const product = state.productList.find(p => p.code === selectedProductCode);
    if (!product) { console.error("Ürün bulunamadı: ", selectedProductCode); return; }

    const listContainer = document.getElementById('selected-products-list');
    if (document.querySelector(`.selected-product-item[data-code="${product.code}"]`)) return alert('Bu ürün zaten listede.');
    
    const unit = getUnitForProduct(product.name);
    const newItem = document.createElement('div');
    newItem.className = 'selected-product-item';
    newItem.dataset.code = product.code;
    newItem.dataset.qty = selectedQty;
    
    newItem.innerHTML = `<span>${product.code} ${product.name} - <span class="product-quantity"><b>${selectedQty} ${unit}</b></span></span><button class="delete-item-btn btn-sm" title="Bu malzemeyi sipariş listesinden siler."><i class="fas fa-trash"></i></button>`;
    
    // 'onclick' yerine 'data-action' kullanmak için bu butona da eklenebilir,
    // ancak bu buton 'form-content' içinde olmadığı için 'handleFormClick'
    // tarafından yakalanamaz. 'addEventListener' burada en temiz yöntemdir.
    newItem.querySelector('.delete-item-btn').addEventListener('click', function() {
        this.parentElement.remove();
        debouncedSaveFormState();
    });
    
    listContainer.appendChild(newItem);
    
    if (!productCode) { select.value = ''; qtyInput.value = '1'; }
    if (shouldSave) debouncedSaveFormState();
}

function toggleCompleted(button) {
    const input = button.parentElement.querySelector('input[type="text"]');
    const isCompleted = input.classList.toggle('completed');
    input.readOnly = isCompleted;
    button.innerHTML = isCompleted ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    button.classList.toggle('undo', isCompleted);
    debouncedSaveFormState();
}

function toggleQuestionCompleted(button, id, shouldSave = true) {
    const itemDiv = document.getElementById(`fide-item-${id}`);
    const titleContainer = itemDiv.querySelector('.fide-title-container');
    const isQuestionCompleted = titleContainer.classList.toggle('question-completed');
    button.innerHTML = isQuestionCompleted ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    button.classList.toggle('undo', isQuestionCompleted);
    const inputArea = itemDiv.querySelector('.input-area');
    if (inputArea) inputArea.style.display = isQuestionCompleted ? 'none' : 'block';
    if (shouldSave) debouncedSaveFormState();
}

function toggleQuestionRemoved(button, id, shouldSave = true) {
    const itemDiv = document.getElementById(`fide-item-${id}`);
    const isRemoved = itemDiv.classList.toggle('question-removed');
    const inputArea = itemDiv.querySelector('.input-area');
    const actionsContainer = button.closest('.fide-actions');
    if(inputArea) inputArea.style.display = isRemoved ? 'none' : 'block';
    button.innerHTML = isRemoved ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-times-circle"></i> Çıkar';
    button.classList.toggle('btn-danger', !isRemoved);
    button.classList.toggle('btn-primary', isRemoved);
    if(actionsContainer) actionsContainer.querySelectorAll('[data-action="add-input"], [data-action="toggle-complete"]').forEach(btn => btn.disabled = isRemoved);
    if (shouldSave) debouncedSaveFormState();
}

function addDynamicInput(id, value = '', isCompleted = false, shouldSave = true) {
    const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) return;

    const newItem = document.createElement('div');
    newItem.className = 'dynamic-input-item';
    // === GÜNCELLENDİ: 'onclick' yerine 'data-action' eklendi ===
    newItem.innerHTML = `<input type="text" placeholder="Eksikliği yazın..." value="${value}">
        <button class="status-btn btn-sm" data-action="toggle-input-complete" title="Bu eksikliği 'Tamamlandı' olarak işaretler."><i class="fas fa-check"></i> Tamamlandı</button>
        <button class="delete-bar btn-danger" data-action="delete-item" title="Bu satırı silmek için tıklayın."><i class="fas fa-trash"></i></button>`;
    
    const input = newItem.querySelector('input');
    const completeButton = newItem.querySelector('[data-action="toggle-input-complete"]');
    
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addDynamicInput(id); } });
    input.addEventListener('blur', () => debouncedSaveFormState());
    
    // 'onclick' atamaları kaldırıldı, artık 'handleFormClick' yönetecek
    
    if(isCompleted) toggleCompleted(completeButton);
    container.prepend(newItem);
    if (value === '') input.focus();
    
    if (shouldSave) debouncedSaveFormState();
}

function checkExpiredPopCodes() {
    const warningMessage = document.getElementById('expiredWarning');
    if (!warningMessage) return;
    const hasExpired = Array.from(document.querySelectorAll('.pop-checkbox:checked')).some(cb => state.expiredCodes.includes(cb.value));
    warningMessage.style.display = hasExpired ? 'block' : 'none';
}

function copySelectedCodes() {
    const nonExpiredCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(code => !state.expiredCodes.includes(code));
    if (nonExpiredCodes.length === 0) return alert("Kopyalamak için geçerli kod seçin.");
    navigator.clipboard.writeText(nonExpiredCodes.join(', ')).then(() => alert("Seçilen geçerli kodlar kopyalandı!"));
}

function clearSelectedCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => cb.checked = false);
    checkExpiredPopCodes();
    debouncedSaveFormState();
}

function selectExpiredCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => { cb.checked = state.expiredCodes.includes(cb.value); });
    checkExpiredPopCodes();
    debouncedSaveFormState();
}

function openEmailDraft() {
    const selectedCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value);
    const nonExpiredCodes = selectedCodes.filter(code => !state.expiredCodes.includes(code));
    if (nonExpiredCodes.length === 0) { alert("E-Posta göndermek için geçerli (süresi dolmamış) kod seçin."); return; }
    
    const popQuestion = state.fideQuestions.find(q => q.type === 'pop_system') || {};
    const emailTo = (popQuestion.popEmailTo || []).join(',');
    const emailCc = (popQuestion.popEmailCc || []).join(',');
    const emailHTML = `<!DOCTYPE html><html><head><title>E-Posta Taslağı</title></head><body><div>Kime: ${emailTo}</div><div>CC: ${emailCc}</div><div>Konu: (Boş)</div><div>İçerik:<br>${nonExpiredCodes.join(', ')}</div></body></html>`;
    const emailWindow = window.open('', '_blank');
    emailWindow.document.write(emailHTML);
    emailWindow.document.close();
}

// === GÜNCELLENDİ: Bu fonksiyon artık gereksiz ve SİLİNDİ ===
/*
export function attachUiFunctionsToWindow() {
    // ...tüm window.xxx atamaları...
}
*/