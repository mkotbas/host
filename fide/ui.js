import * as state from './state.js';
import { saveFormState } from './api.js';

let pb; // PocketBase instance

// --- DEBOUNCE MEKANİZMASI ---
let saveDebounceTimer;
function debouncedSaveFormState() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
        if (state.isPocketBaseConnected && state.selectedStore) {
            saveFormState(getFormDataForSaving()); 
        }
    }, 800); 
}

/**
 * UI modülünü PocketBase instance ile başlatır.
 */
export function initUi(pbInstance) {
    pb = pbInstance;
}

/**
 * Tüm UI fonksiyonlarını window nesnesine bağlar.
 * (HTML içindeki onclick="" özelliklerinin çalışması için gereklidir)
 */
export function attachUiFunctionsToWindow() {
    window.generateEmail = generateEmail;
    window.returnToMainPage = returnToMainPage;
    window.toggleQuestionCompleted = toggleQuestionCompleted;
    window.toggleQuestionRemoved = toggleQuestionRemoved;
    window.addDynamicInput = addDynamicInput;
    window.initiateDeleteItem = initiateDeleteItem;
    window.addProductToList = addProductToList;
    window.removeProductFromList = removeProductFromList;
    window.addStylingProductToList = addStylingProductToList;
    window.removeStylingProductFromList = removeStylingProductFromList;
}

/**
 * DiDe ve FiDe formunu inşa eder.
 */
export function buildForm() {
    const formContainer = document.getElementById('form-content');
    formContainer.innerHTML = '';

    // --- FiDe Soruları ---
    if (state.fideQuestions && state.fideQuestions.length > 0) {
        const fideHeader = document.createElement('h3');
        fideHeader.innerHTML = '<i class="fas fa-check-double"></i> FiDe Denetim Maddeleri';
        fideHeader.style.marginTop = '20px';
        fideHeader.style.marginBottom = '15px';
        fideHeader.style.color = 'var(--primary)';
        formContainer.appendChild(fideHeader);

        state.fideQuestions.forEach(q => {
            const questionCard = createQuestionCard(q);
            formContainer.appendChild(questionCard);
        });
    }

    // --- DiDe Puan Kartı (Sadece bilgilendirme amaçlı) ---
    // Eğer seçili bayi varsa puanlarını göster
    if (state.selectedStore) {
        updateStoreScoreDisplay();
    }
}

/**
 * Tek bir soru kartı oluşturur.
 */
function createQuestionCard(q) {
    const card = document.createElement('div');
    card.className = 'card question-card';
    card.id = `fide-item-${q.id}`;

    let inputSection = '';
    if (q.type === 'standard') {
        inputSection = `
            <div class="input-area">
                <div id="sub-items-container-fide${q.id}" class="sub-items-container"></div>
                <button class="btn-secondary btn-sm" onclick="addDynamicInput('fide${q.id}')">
                    <i class="fas fa-plus"></i> Madde Ekle
                </button>
            </div>
        `;
    } else if (q.type === 'product_list') {
        inputSection = `
            <div class="input-area product-list-area">
                <div class="search-container">
                    <input type="text" class="product-search-input" placeholder="Ürün ara (Kod veya Ad)..." onkeyup="searchProducts(this, ${q.id})">
                    <div class="product-search-results" id="results-${q.id}"></div>
                </div>
                <div id="selected-products-fide${q.id}" class="selected-items-list"></div>
                <hr>
                <p style="font-size: 12px; margin-bottom: 5px;"><b>Pleksiyle Sergilenecek Diğer Ürünler:</b></p>
                <div id="sub-items-container-fide${q.id}_pleksi" class="sub-items-container"></div>
                <button class="btn-secondary btn-sm" onclick="addDynamicInput('fide${q.id}_pleksi')">
                    <i class="fas fa-plus"></i> Madde Ekle
                </button>
            </div>
        `;
    } else if (q.type === 'styling_list') {
        inputSection = `
            <div class="input-area styling-list-area">
                <div class="styling-toggle-container">
                    <label class="switch">
                        <input type="checkbox" class="styling-mode-toggle" onchange="toggleStylingMode(this, ${q.id})">
                        <span class="slider round"></span>
                    </label>
                    <span class="toggle-label">Styling Ürün Listesi Kullan</span>
                </div>
                
                <div id="standard-view-container-${q.id}">
                    <div id="sub-items-container-fide${q.id}_notes" class="sub-items-container"></div>
                    <button class="btn-secondary btn-sm" onclick="addDynamicInput('fide${q.id}_notes')">
                        <i class="fas fa-plus"></i> Not/Madde Ekle
                    </button>
                </div>

                <div id="styling-view-container-${q.id}" class="styling-list-container" style="display: none;">
                    <div class="styling-controls">
                        <select class="styling-main-category-select" onchange="handleStylingMainCategoryChange(this, ${q.id})">
                            <option value="">Kategori Seçin...</option>
                        </select>
                        <select class="styling-sub-category-select" style="display:none;" onchange="handleStylingSubCategoryChange(this, ${q.id})">
                            <option value="">Alt Kategori Seçin...</option>
                        </select>
                        <input type="number" class="sub-category-qty-input" placeholder="Adet" min="1" value="1" style="display:none; width: 60px;">
                        <button class="btn-primary btn-sm add-styling-btn" style="display:none;" onclick="addStylingSelectionToList(${q.id})">Ekle</button>
                    </div>
                    <div id="selected-styling-products-fide${q.id}" class="selected-items-list"></div>
                </div>
            </div>
        `;
    } else if (q.type === 'pop_system') {
        inputSection = `
            <div class="input-area pop-system-area">
                <div id="pop-container-${q.id}" class="pop-grid"></div>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="question-header">
            <span class="question-title">${q.id}. ${q.title}</span>
            <div class="question-actions">
                <button class="action-btn status-btn" onclick="toggleQuestionCompleted(this, '${q.id}')" title="Tamamlandı olarak işaretle">
                    <i class="fas fa-check"></i>
                </button>
                <button class="action-btn remove-btn" onclick="toggleQuestionRemoved(this, '${q.id}')" title="Bu denetimde uygulama (Pasif yap)">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
        ${inputSection}
    `;

    if (q.type === 'pop_system') {
        setTimeout(() => initializePopSystem(card.querySelector('.pop-grid')), 0);
    }

    return card;
}

/**
 * E-posta taslağını oluşturur.
 */
export async function generateEmail() {
    if (!state.selectedStore) {
        alert('Lütfen denetime başlamadan önce bir bayi seçin!');
        return;
    }

    let emailTemplate = `<p>{YONETMEN_ADI} Bey Merhaba,</p><p>Ziyaret etmiş olduğum {BAYI_BILGISI} bayi karnesi aşağıdadır.</p><p><br></p>{DENETIM_ICERIGI}<p><br></p>{PUAN_TABLOSU}`;
    if (pb && pb.authStore.isValid) {
        try {
            const templateRecord = await pb.collection('ayarlar').getFirstListItem('anahtar="emailTemplate"');
            if (templateRecord?.deger) emailTemplate = templateRecord.deger;
        } catch (e) { console.warn("E-posta şablonu yüklenemedi."); }
    }

    const reportData = getFormDataForSaving();
    await saveFormState(reportData, true);

    // --- YENİ: DİĞER MODÜLLERE GÜNCELLEME SİNYALİ GÖNDER ---
    window.dispatchEvent(new CustomEvent('reportFinalized'));

    const storeInfo = state.dideData.find(row => String(row['Bayi Kodu']) === String(state.selectedStore.bayiKodu)) || null;
    const fideStoreInfo = state.fideData.find(row => String(row['Bayi Kodu']) === String(state.selectedStore.bayiKodu)) || null;
    
    const storeEmail = state.storeEmails[state.selectedStore.bayiKodu] || null;
    const storeEmailTag = storeEmail ? ` <a href="mailto:${storeEmail}" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@${storeEmail}</a>` : '';
    
    const pbStore = state.allStores.find(s => String(s.bayiKodu) === String(state.selectedStore.bayiKodu)) || null;
    const managerFullName =
        (pbStore && pbStore.yonetmen && String(pbStore.yonetmen).trim()) ||
        (state.selectedStore && state.selectedStore.yonetmen && String(state.selectedStore.yonetmen).trim()) ||
        (storeInfo && storeInfo['Bayi Yönetmeni'] && String(storeInfo['Bayi Yönetmeni']).trim()) ||
        '';
    const yonetmenFirstName = managerFullName ? managerFullName.split(/\s+/)[0] : 'Yetkili';
    const shortBayiAdi = state.selectedStore.bayiAdi.length > 20 ? state.selectedStore.bayiAdi.substring(0, 20) + '...' : state.selectedStore.bayiAdi;
    
    let fideReportHtml = "";
    state.fideQuestions.forEach(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        if (!itemDiv || itemDiv.classList.contains('question-removed')) return;
        const qStatus = reportData.questions_status[q.id];
        if (!qStatus) return;
        
        let contentHtml = '';
        if (q.type === 'standard') {
            const container = document.getElementById(`sub-items-container-fide${q.id}`);
            if (container) {
                const items = Array.from(container.childNodes).reverse().filter(n => n.classList && !n.classList.contains('is-deleting')).map(node => {
                    if (node.classList.contains('static-item')) return { text: node.querySelector('.content').innerHTML, type: 'static', comp: false };
                    const input = node.querySelector('input[type="text"]');
                    return { text: input.value.trim(), type: 'dynamic', comp: input.classList.contains('completed') };
                }).filter(i => i.text);
                
                const hasDyn = items.some(i => i.type === 'dynamic');
                let emailItems = hasDyn ? items.filter(i => i.type === 'dynamic' || (i.type === 'static' && i.text.includes('<a href'))) : items.filter(i => i.type === 'static');
                if (emailItems.length > 0) {
                    emailItems.sort((a,b) => (a.text.includes('<a href') ? 1 : -1) - (b.text.includes('<a href') ? 1 : -1));
                    contentHtml = `<ul>${emailItems.map(i => i.comp ? `<li>${i.text} <span style="background-color:#dcfce7; color:#166534; font-weight:bold; padding: 1px 6px; border-radius: 4px;">Tamamlandı</span></li>` : `<li>${i.text}</li>`).join('')}</ul>`;
                }
            }
        } else if (q.type === 'product_list' || q.type === 'styling_list') {
            const prods = (qStatus.selectedProducts || []).map(p => `<li>${p.code} ${p.name}: <b>${p.qty} ${getUnitForProduct(p.name)}</b></li>`).join('');
            if (q.type === 'product_list') {
                const pleksi = Array.from(document.querySelectorAll(`#sub-items-container-fide${q.id}_pleksi input[type="text"]`)).filter(i => !i.classList.contains('completed') && i.value.trim()).map(i => `<li>${i.value}</li>`).join('');
                if (prods) contentHtml += `<b><i>Sipariş verilmesi gerekenler:</i></b><ul>${prods}</ul>`;
                if (pleksi) contentHtml += `<b><i>Pleksiyle sergilenmesi gerekenler:</i></b><ul>${pleksi}</ul>`;
            } else {
                const staticBox = document.getElementById(`standard-view-container-${q.id}`);
                if (staticBox) contentHtml += `<ul>${Array.from(staticBox.querySelectorAll('.static-item .content')).map(d => `<li>${d.innerHTML}</li>`).join('')}</ul>`;
                const notes = Array.from(document.querySelectorAll(`#sub-items-container-fide${q.id}_notes input[type="text"]`)).filter(i => !i.classList.contains('completed') && i.value.trim()).map(i => `<li>${i.value}</li>`).join('');
                if (notes) contentHtml += `<ul>${notes}</ul>`;
                if (prods) contentHtml += `<b><i>Sipariş verilmesi gerekenler:</i></b><ul>${prods}</ul>`;
            }
        } else if (q.type === 'pop_system') {
            const pops = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(c => !state.expiredCodes.includes(c));
            if (pops.length > 0) contentHtml = `<ul><li>${pops.join(', ')}</li></ul>`;
        }

        if (contentHtml !== '' || qStatus.completed) {
            const compSpan = qStatus.completed ? ` <span style="background-color:#dcfce7; color:#166534; font-weight:bold; padding: 1px 6px; border-radius: 4px;">Tamamlandı</span>` : "";
            let tag = (q.wantsStoreEmail && q.type !== 'pop_system') ? storeEmailTag : (q.type === 'pop_system' && q.popEmailTo?.length > 0 ? ` <a href="mailto:${q.popEmailTo.join(',')}" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@${q.popEmailTo.join(', ')}</a>` : '');
            fideReportHtml += `<p><b>FiDe ${q.id}. ${q.title}</b>${compSpan}${tag}</p>${contentHtml}`;
        }
    });

    const cYear = new Date().getFullYear();
    
    // Ortalama hesaplama fonksiyonu (Sadece sayı olan ayları baz alır)
    const calculateAvg = (scoresObj) => {
        if (!scoresObj) return '-';
        const values = Object.values(scoresObj).map(v => parseFloat(v)).filter(v => !isNaN(v));
        if (values.length === 0) return '-';
        const sum = values.reduce((a, b) => a + b, 0);
        return (sum / values.length).toFixed(1);
    };

    const dAvg = calculateAvg(storeInfo?.scores);
    const fAvg = calculateAvg(fideStoreInfo?.scores);

    let mHeaders = Array.from({length: 12}, (_, i) => `<th style="border: 1px solid #ddd; text-align: center; padding: 6px; background-color: #f2f2f2; font-weight: bold;">${state.monthNames[i + 1] || i + 1}</th>`).join('');
    mHeaders += `<th style="border: 1px solid #ddd; text-align: center; padding: 6px; background-color: #f2f2f2; font-weight: bold;">ORT.</th>`;
    
    let dScores = Array.from({length: 12}, (_, i) => `<td style="border: 1px solid #ddd; text-align: center; padding: 6px;">${(storeInfo?.scores?.[i + 1]) || '-'}</td>`).join('');
    dScores += `<td style="border: 1px solid #ddd; text-align: center; padding: 6px; font-weight: bold; background-color: #f9f9f9;">${dAvg}</td>`;

    let fScores = Array.from({length: 12}, (_, i) => `<td style="border: 1px solid #ddd; text-align: center; padding: 6px;">${(fideStoreInfo?.scores?.[i + 1]) || '-'}</td>`).join('');
    fScores += `<td style="border: 1px solid #ddd; text-align: center; padding: 6px; font-weight: bold; background-color: #f9f9f9;">${fAvg}</td>`;
    
    const tableHtml = `<div style="overflow-x: auto;"><table style="border-collapse: collapse; margin-top: 10px; font-size: 10pt; border: 1px solid #ddd;"><thead><tr><th style="border: 1px solid #ddd; text-align: center; padding: 6px; background-color: #f2f2f2; font-weight: bold;">${cYear}</th>${mHeaders}</tr></thead><tbody><tr><td style="border: 1px solid #ddd; font-weight: bold; padding: 6px;">DiDe</td>${dScores}</tr><tr><td style="border: 1px solid #ddd; font-weight: bold; padding: 6px;">FiDe</td>${fScores}</tr></tbody></table></div>`;

    let finalBody = emailTemplate
        .replace(/{YONETMEN_ADI}/g, yonetmenFirstName)
        .replace(/{BAYI_BILGISI}/g, `${state.selectedStore.bayiKodu} ${shortBayiAdi}`)
        .replace(/{DENETIM_ICERIGI}/g, fideReportHtml)
        .replace(/{PUAN_TABLOSU}/g, tableHtml);

    document.getElementById('dide-upload-card').style.display = 'none';
    document.getElementById('form-content').style.display = 'none';
    document.querySelector('.action-button').style.display = 'none';

    const draft = document.createElement('div');
    draft.id = 'email-draft-container';
    draft.className = 'card';
    draft.innerHTML = `<h2><a href="#" onclick="event.preventDefault(); returnToMainPage();"><i class="fas fa-arrow-left"></i></a> Kopyalanacak E-posta Taslağı</h2><div id="email-draft-area" contenteditable="true" style="min-height: 500px; border: 1px solid #ccc; padding: 10px; margin-top: 10px; font-family: Aptos, sans-serif; font-size: 11pt;">${finalBody}</div>`;
    document.querySelector('.container').appendChild(draft);
}

export function loadReportUI(reportData) {
    if (!reportData) { resetForm(); updateFormInteractivity(true); return; }
    try {
        resetForm(); 
        for (const qId in reportData) {
            let item = document.getElementById(`fide-item-${qId}`);
            if (!item) continue;
            const data = reportData[qId];
            if (data.removed) toggleQuestionRemoved(item.querySelector('.remove-btn'), qId, false);
            else if (data.completed) toggleQuestionCompleted(item.querySelector('.status-btn'), qId, false);
            
            if (data.dynamicInputs) {
                const qInfo = state.fideQuestions.find(q => String(q.id) === qId);
                data.dynamicInputs.forEach(inp => {
                    let cid = `fide${qId}`;
                    if (qInfo.type === 'product_list') cid = `fide${qId}_pleksi`;
                    else if (qInfo.type === 'styling_list') cid = `fide${qId}_notes`;
                    addDynamicInput(cid, inp.text, inp.completed, false);
                });
            }
            if (data.selectedProducts) {
                const qInfo = state.fideQuestions.find(q => String(q.id) === qId);
                if (qInfo.type === 'styling_list' && data.selectedProducts.length > 0) {
                    item.querySelector('.styling-mode-toggle').checked = true;
                    item.querySelector('.styling-list-container').style.display = 'block';
                    document.getElementById(`standard-view-container-${qId}`).style.display = 'none';
                }
                data.selectedProducts.forEach(p => {
                    if (qInfo.type === 'product_list') addProductToList(p.code, p.qty, false, p.name);
                    else if (qInfo.type === 'styling_list') addStylingProductToList(qId, p.code, p.qty, p.name, false);
                });
            }
            if (data.selectedPops) {
                data.selectedPops.forEach(pc => { const cb = document.querySelector(`.pop-checkbox[value="${pc}"]`); if(cb) cb.checked = true; });
                checkExpiredPopCodes();
            }
            if (data.stylingCategorySelections) {
                const sel = data.stylingCategorySelections;
                const mSel = item.querySelector('.styling-main-category-select');
                if (mSel && sel.mainCategory) {
                    mSel.value = sel.mainCategory;
                    mSel.dispatchEvent(new Event('change')); 
                    const sSel = item.querySelector('.styling-sub-category-select');
                    const sQty = item.querySelector('.sub-category-qty-input');
                    if (sQty && sel.subCategoryQty) sQty.value = sel.subCategoryQty;
                    if (sSel && sel.subCategory) { sSel.value = sel.subCategory; sSel.dispatchEvent(new Event('change')); }
                }
            }
        }
        updateFormInteractivity(true);
    } catch (e) { console.error("Rapor yükleme hatası:", e); }
}

export function updateFormInteractivity(enable) {
    const fc = document.getElementById('form-content');
    if (fc) fc.querySelectorAll('button, input, select').forEach(el => { el.disabled = !enable; });
}

function initializePopSystem(container) {
    container.innerHTML = '';
    state.popCodes.forEach(code => {
        const lbl = document.createElement('label');
        lbl.className = 'checkbox-label';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = code;
        cb.className = 'pop-checkbox';
        cb.addEventListener('change', () => { checkExpiredPopCodes(); debouncedSaveFormState(); });
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(code));
        container.appendChild(lbl);
    });
}

function initiateDeleteItem(btn) {
    const item = btn.parentElement;
    if (item.classList.contains('is-deleting')) {
        clearTimeout(item.dataset.deleteTimer);
        item.classList.remove('is-deleting');
        btn.querySelector('i').className = 'fas fa-trash';
        btn.classList.replace('btn-warning', 'btn-danger');
    } else {
        item.classList.add('is-deleting');
        btn.querySelector('i').className = 'fas fa-undo';
        btn.classList.replace('btn-danger', 'btn-warning');
        item.dataset.deleteTimer = setTimeout(() => { item.remove(); debouncedSaveFormState(); }, 4000);
    }
    debouncedSaveFormState();
}

function addProductToList(code, qty, save = true, name = null) {
    const qId = state.fideQuestions.find(q => q.type === 'product_list')?.id;
    if (!qId) return;

    const listContainer = document.getElementById(`selected-products-fide${qId}`);
    const product = state.productList.find(p => p.code === code);
    const productName = name || (product ? product.name : "Bilinmeyen Ürün");

    // Aynı ürün listede var mı?
    const existing = Array.from(listContainer.querySelectorAll('.selected-item')).find(el => el.dataset.code === code);
    if (existing) {
        alert("Bu ürün zaten listede!");
        return;
    }

    const item = document.createElement('div');
    item.className = 'selected-item';
    item.dataset.code = code;
    item.dataset.name = productName;
    item.dataset.qty = qty;

    item.innerHTML = `
        <span class="content"><b>${code}</b> ${productName}: <b>${qty} ${getUnitForProduct(productName)}</b></span>
        <button class="btn-danger btn-xs" onclick="removeProductFromList(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;

    listContainer.appendChild(item);
    if (save) debouncedSaveFormState();
}

export function removeProductFromList(btn) {
    btn.closest('.selected-item').remove();
    debouncedSaveFormState();
}

function addStylingProductToList(qId, code, qty, name, save = true) {
    const listContainer = document.getElementById(`selected-styling-products-fide${qId}`);
    
    // Aynı ürün (kod/isim kombinasyonu) listede var mı?
    const existing = Array.from(listContainer.querySelectorAll('.selected-item')).find(el => el.dataset.code === code && el.dataset.name === name);
    if (existing) {
        alert("Bu seçim zaten listede!");
        return;
    }

    const item = document.createElement('div');
    item.className = 'selected-item';
    item.dataset.code = code;
    item.dataset.name = name;
    item.dataset.qty = qty;

    item.innerHTML = `
        <span class="content"><b>${code}</b> ${name}: <b>${qty} ${getUnitForProduct(name)}</b></span>
        <button class="btn-danger btn-xs" onclick="removeStylingProductFromList(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;

    listContainer.appendChild(item);
    if (save) debouncedSaveFormState();
}

export function removeStylingProductFromList(btn) {
    btn.closest('.selected-item').remove();
    debouncedSaveFormState();
}

function addDynamicInput(containerId, text = '', completed = false, save = true) {
    const container = document.getElementById(`sub-items-container-${containerId}`);
    const item = document.createElement('div');
    item.className = 'dynamic-input-item';
    if (completed) item.classList.add('completed-container');

    item.innerHTML = `
        <input type="text" value="${text}" placeholder="Madde içeriğini yazın..." onkeyup="debouncedSaveFormState()" class="${completed ? 'completed' : ''}">
        <button class="btn-danger btn-xs" onclick="initiateDeleteItem(this)">
            <i class="fas fa-trash"></i>
        </button>
    `;

    container.prepend(item);
    if (save) debouncedSaveFormState();
}

function getFormDataForSaving() {
    const questions_status = {};
    state.fideQuestions.forEach(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        if (!itemDiv) return;

        questions_status[q.id] = {
            completed: itemDiv.querySelector('.status-btn').classList.contains('active'),
            removed: itemDiv.classList.contains('question-removed'),
            dynamicInputs: [],
            selectedProducts: [],
            selectedPops: [],
            stylingCategorySelections: null
        };

        // Dinamik metin kutularını topla
        const dynContainers = itemDiv.querySelectorAll('.sub-items-container');
        dynContainers.forEach(container => {
            const items = Array.from(container.querySelectorAll('.dynamic-input-item:not(.is-deleting)'));
            items.forEach(it => {
                const inp = it.querySelector('input');
                if (inp.value.trim()) {
                    questions_status[q.id].dynamicInputs.push({
                        text: inp.value.trim(),
                        completed: inp.classList.contains('completed')
                    });
                }
            });
        });

        // Ürün listelerini topla
        const productItems = itemDiv.querySelectorAll('.selected-items-list .selected-item');
        productItems.forEach(it => {
            questions_status[q.id].selectedProducts.push({
                code: it.dataset.code,
                name: it.dataset.name,
                qty: it.dataset.qty
            });
        });

        // POP seçimlerini topla
        if (q.type === 'pop_system') {
            const pops = Array.from(itemDiv.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value);
            questions_status[q.id].selectedPops = pops;
        }

        // Styling kategori seçimlerini topla
        if (q.type === 'styling_list') {
            const mSel = itemDiv.querySelector('.styling-main-category-select');
            const sSel = itemDiv.querySelector('.styling-sub-category-select');
            const sQty = itemDiv.querySelector('.sub-category-qty-input');
            questions_status[q.id].stylingCategorySelections = {
                mainCategory: mSel.value,
                subCategory: sSel.value,
                subCategoryQty: sQty.value
            };
        }
    });

    return {
        questions_status: questions_status,
        timestamp: new Date().toISOString()
    };
}

function returnToMainPage() {
    window.location.reload();
}

function toggleQuestionCompleted(btn, qId, save = true) {
    const card = document.getElementById(`fide-item-${qId}`);
    btn.classList.toggle('active');
    
    const inputs = card.querySelectorAll('input[type="text"]');
    if (btn.classList.contains('active')) {
        inputs.forEach(inp => {
            inp.classList.add('completed');
            inp.parentElement.classList.add('completed-container');
        });
    } else {
        inputs.forEach(inp => {
            inp.classList.remove('completed');
            inp.parentElement.classList.remove('completed-container');
        });
    }

    if (save) debouncedSaveFormState();
}

function toggleQuestionRemoved(btn, qId, save = true) {
    const card = document.getElementById(`fide-item-${qId}`);
    card.classList.toggle('question-removed');
    btn.classList.toggle('active');
    if (save) debouncedSaveFormState();
}

function resetForm() {
    state.fideQuestions.forEach(q => {
        const card = document.getElementById(`fide-item-${q.id}`);
        if (!card) return;
        card.classList.remove('question-removed');
        card.querySelector('.status-btn').classList.remove('active');
        card.querySelector('.remove-btn').classList.remove('active');
        const containers = card.querySelectorAll('.sub-items-container, .selected-items-list');
        containers.forEach(c => c.innerHTML = '');
        const inputs = card.querySelectorAll('input, select');
        inputs.forEach(i => { if(i.type === 'checkbox') i.checked = false; else i.value = ''; });
    });
}

function updateConnectionIndicator() {
    const switchEl = document.getElementById('connection-status-switch');
    const textEl = document.getElementById('connection-status-text');
    if (state.isPocketBaseConnected) {
        switchEl.className = 'connected';
        textEl.textContent = 'Buluta Bağlı';
    } else {
        switchEl.className = 'disconnected';
        textEl.textContent = 'Bağlı Değil';
    }
}

function updateStoreScoreDisplay() {
    // Bu fonksiyon opsiyonel olarak bayi kartında anlık puan gösterimi için kullanılabilir.
}

function getUnitForProduct(productName) {
    if (!productName) return "Adet";
    const name = productName.toLowerCase();
    if (name.includes('etiket') || name.includes('pleksi') || name.includes('fiyat')) return "Adet";
    if (name.includes('kablo') || name.includes('şerit')) return "Metre";
    return "Adet";
}

// Global olarak erişilmesi gereken bazı UI yardımcıları
window.searchProducts = function(input, qId) {
    const term = input.value.toLowerCase().trim();
    const resultsDiv = document.getElementById(`results-${qId}`);
    if (term.length < 2) { resultsDiv.innerHTML = ''; return; }

    const filtered = state.productList.filter(p => 
        p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term)
    ).slice(0, 10);

    resultsDiv.innerHTML = filtered.map(p => `
        <div class="product-result-item" onclick="addProductToList('${p.code}', 1, true, '${p.name}')">
            <b>${p.code}</b> - ${p.name}
        </div>
    `).join('');
};

window.toggleStylingMode = function(cb, qId) {
    const standard = document.getElementById(`standard-view-container-${qId}`);
    const styling = document.getElementById(`styling-view-container-${qId}`);
    if (cb.checked) {
        standard.style.display = 'none';
        styling.style.display = 'block';
        populateStylingMainCategories(qId);
    } else {
        standard.style.display = 'block';
        styling.style.display = 'none';
    }
    debouncedSaveFormState();
};

function populateStylingMainCategories(qId) {
    const select = document.querySelector(`#fide-item-${qId} .styling-main-category-select`);
    if (select.options.length > 1) return;
    const cats = [...new Set(state.productList.map(p => p.mainCategory))].filter(Boolean).sort();
    cats.forEach(c => select.add(new Option(c, c)));
}

window.handleStylingMainCategoryChange = function(select, qId) {
    const mainCat = select.value;
    const subSelect = document.querySelector(`#fide-item-${qId} .styling-sub-category-select`);
    const qtyInput = document.querySelector(`#fide-item-${qId} .sub-category-qty-input`);
    const addBtn = document.querySelector(`#fide-item-${qId} .add-styling-btn`);

    subSelect.innerHTML = '<option value="">Alt Kategori Seçin...</option>';
    if (!mainCat) {
        subSelect.style.display = 'none';
        qtyInput.style.display = 'none';
        addBtn.style.display = 'none';
        return;
    }

    const subCats = [...new Set(state.productList.filter(p => p.mainCategory === mainCat).map(p => p.subCategory))].filter(Boolean).sort();
    subCats.forEach(sc => subSelect.add(new Option(sc, sc)));
    subSelect.style.display = 'inline-block';
    qtyInput.style.display = 'inline-block';
    addBtn.style.display = 'inline-block';
};

window.handleStylingSubCategoryChange = function(select, qId) {
    debouncedSaveFormState();
};

window.addStylingSelectionToList = function(qId) {
    const mainCat = document.querySelector(`#fide-item-${qId} .styling-main-category-select`).value;
    const subCat = document.querySelector(`#fide-item-${qId} .styling-sub-category-select`).value;
    const qty = document.querySelector(`#fide-item-${qId} .sub-category-qty-input`).value;

    if (!mainCat || !subCat || !qty) return;
    addStylingProductToList(qId, mainCat, qty, subCat, true);
};

function checkExpiredPopCodes() {
    const checked = Array.from(document.querySelectorAll('.pop-checkbox:checked'));
    checked.forEach(cb => {
        const lbl = cb.parentElement;
        if (state.expiredCodes.includes(cb.value)) {
            lbl.style.color = '#ef4444';
            lbl.style.fontWeight = 'bold';
            lbl.title = "DİKKAT: Bu POP malzemesinin kullanım süresi dolmuştur!";
        } else {
            lbl.style.color = '';
            lbl.style.fontWeight = '';
            lbl.title = '';
        }
    });
}

// Export functions to window
attachUiFunctionsToWindow();
export { updateConnectionIndicator };