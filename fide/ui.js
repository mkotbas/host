import * as state from './state.js';
import { saveFormState } from './api.js';

let pb; // PocketBase instance

// --- TABLO STİLLERİ (Yönetilebilir Stil Nesnesi) ---
const TABLE_STYLES = {
    table: 'border-collapse: collapse; margin-top: 10px; font-size: 11pt; border: 1px solid #000000; width: auto;',
    header: 'border: 1px solid #000000; text-align: center; padding: 0px 10px; background-color: #ff0000; color: #000000; font-weight: bold; font-size: 11pt; white-space: nowrap;',
    cell: 'border: 1px solid #000000; text-align: center; padding: 0px 10px; font-size: 11pt; font-weight: normal;',
    cellLabel: 'border: 1px solid #000000; text-align: center; padding: 0px 10px; font-weight: bold; background-color: #ff0000; color: #000000; font-size: 11pt;',
    avgCell: 'border: 1px solid #000000; text-align: center; padding: 0px 10px; font-weight: bold; background-color: #ffffff; font-size: 11pt;'
};

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

// --- YARDIMCI FONKSİYONLAR (Logic/Veri Temizleme) ---

function parseScore(val) {
    if (val === undefined || val === null || val === "") return NaN;
    // Sayı formatını standartlaştır: "95,5" -> "95.5"
    const cleaned = String(val).replace(/\./g, '').replace(',', '.');
    return parseFloat(cleaned);
}

function calculateAverage(scores, currentMonthIdx, manualScore = null) {
    let sum = 0;
    let count = 0;
    
    for (let i = 1; i <= 12; i++) {
        let val = scores ? scores[i] : null;
        
        if (i === currentMonthIdx && manualScore !== null && !isNaN(manualScore)) {
            val = manualScore;
        }

        const num = typeof val === 'number' ? val : parseScore(val);
        if (!isNaN(num)) {
            sum += num;
            count++;
        }
    }
    return count > 0 ? (sum / count).toLocaleString('tr-TR', { maximumFractionDigits: 1 }) : '';
}

function getUnitForProduct(productName) {
    return 'Adet';
}

// --- GÖRÜNÜM PARÇALARI (View/HTML Components) ---

function renderPerformanceTable(storeInfo, fideStoreInfo, manualFideScore) {
    const cYear = new Date().getFullYear();
    const currentMonthIdx = new Date().getMonth() + 1;
    const manualNum = manualFideScore ? parseScore(manualFideScore) : null;

    let mHeaders = "";
    for (let i = 1; i <= 12; i++) {
        mHeaders += `<th style="${TABLE_STYLES.header}">${state.monthNames[i].toUpperCase()}</th>`;
    }
    mHeaders += `<th style="${TABLE_STYLES.header}">YIL ORTALAMASI</th>`;

    let dScores = "";
    for (let i = 1; i <= 12; i++) {
        dScores += `<td style="${TABLE_STYLES.cell}">${storeInfo?.scores?.[i] || ''}</td>`;
    }
    dScores += `<td style="${TABLE_STYLES.avgCell}">${calculateAverage(storeInfo?.scores, currentMonthIdx)}</td>`;

    let fScores = "";
    for (let i = 1; i <= 12; i++) {
        let displayVal = fideStoreInfo?.scores?.[i] || '';
        if (i === currentMonthIdx && manualNum !== null && !isNaN(manualNum) && !displayVal) {
            displayVal = manualFideScore;
        }
        fScores += `<td style="${TABLE_STYLES.cell}">${displayVal}</td>`;
    }
    fScores += `<td style="${TABLE_STYLES.avgCell}">${calculateAverage(fideStoreInfo?.scores, currentMonthIdx, manualNum)}</td>`;

    return `
        <div style="overflow-x: auto;">
            <table style="${TABLE_STYLES.table}">
                <thead>
                    <tr>
                        <th style="${TABLE_STYLES.header}">${cYear}</th>
                        ${mHeaders}
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td style="${TABLE_STYLES.cellLabel}">DİDE</td>
                        ${dScores}
                    </tr>
                    <tr>
                        <td style="${TABLE_STYLES.cellLabel}">FİDE</td>
                        ${fScores}
                    </tr>
                </tbody>
            </table>
        </div>`;
}

function generateQuestionHtml(q) {
    let questionActionsHTML = '';
    let questionContentHTML = '';
    let isArchivedClass = q.isArchived ? 'archived-item' : ''; 

    if (q.type === 'standard') {
        questionActionsHTML = `<div class="fide-actions"><button class="add-item-btn btn-sm" onclick="addDynamicInput('fide${q.id}')"><i class="fas fa-plus"></i> Yeni Eksik Ekle</button><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})"><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})"><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
        let staticItemsHTML = (q.staticItems || []).map(item => `<div class="static-item"><div class="content">${item}</div><button class="delete-bar btn-danger" onclick="initiateDeleteItem(this)"><i class="fas fa-trash"></i></button></div>`).join('');
        questionContentHTML = `<div class="input-area"><div id="sub-items-container-fide${q.id}">${staticItemsHTML}</div></div>`;
    
    } else if (q.type === 'product_list') {
        questionActionsHTML = `<div class="fide-actions"><button class="add-item-btn btn-sm" onclick="addDynamicInput('fide${q.id}_pleksi')"><i class="fas fa-plus"></i> Yeni Ekle</button><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})"><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})"><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
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
        questionContentHTML = `<div class="input-area"><b><i>Sipariş verilmesi gerekenler:</i></b><div class="product-adder"><select id="product-selector"><option value="">-- Malzeme Seçin --</option>${productOptions}</select><input type="number" id="product-qty" placeholder="Adet" min="1" value="1"><button class="btn-success btn-sm" onclick="addProductToList()"><i class="fas fa-plus"></i> Ekle</button></div><div id="selected-products-list"></div><hr><b class="plexi-header"><i>Pleksiyle sergilenmesi gerekenler veya yanlış pleksi malzemeyle kullanılanlar</i></b><div id="sub-items-container-fide${q.id}_pleksi"></div></div>`;
    
    } else if (q.type === 'pop_system') {
        questionActionsHTML = `<div class="fide-actions"><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})"><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})"><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
        questionContentHTML = `<div class="input-area"><div class="pop-container" id="popCodesContainer"></div><div class="warning-message" id="expiredWarning">Seçiminizde süresi dolmuş kodlar bulunmaktadır.</div><div class="pop-button-container"><button class="btn-success btn-sm" onclick="copySelectedCodes()">Kopyala</button><button class="btn-danger btn-sm" onclick="clearSelectedCodes()">Temizle</button><button class="btn-primary btn-sm" onclick="selectExpiredCodes()">Bitenler</button><button class="btn-primary btn-sm" onclick="openEmailDraft()">E-Posta</button></div></div>`;
    
    } else if (q.type === 'styling_list') {
        questionActionsHTML = `<div class="fide-actions"><button class="add-item-btn btn-sm" onclick="addDynamicInput('fide${q.id}_notes')"><i class="fas fa-plus"></i> Yeni Eksik Ekle</button><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})"><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})"><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
        
        let mainCategoryOptions = '<option value="">-- Ana Kategori Seçin --</option>';
        if (q.stylingData && Array.isArray(q.stylingData)) {
            q.stylingData.forEach((mainCat) => {
                mainCategoryOptions += `<option value="${mainCat.name}">${mainCat.name}</option>`;
            });
        }

        let standardViewHTML = (q.staticItems || []).map(item => `<div class="static-item"><div class="content">${item}</div><button class="delete-bar btn-danger" onclick="initiateDeleteItem(this)"><i class="fas fa-trash"></i></button></div>`).join('');
        standardViewHTML = `<div id="standard-view-container-${q.id}">${standardViewHTML}</div>`;

        questionContentHTML = `<div id="sub-items-container-fide${q.id}_notes" style="margin-bottom: 15px;"></div><div class="mode-toggle-container"><span class="mode-toggle-label">Detaylı Giriş / Malzeme Ekle</span><label class="switch"><input type="checkbox" class="styling-mode-toggle" onchange="toggleStylingView(this, ${q.id})"><span class="slider round"></span></label></div>${standardViewHTML}<div class="input-area styling-list-container" id="styling-container-${q.id}" data-question-id="${q.id}" style="display: none;"><div class="styling-row"><div class="styling-label">Ana Kategori</div><div class="styling-content"><select class="styling-main-category-select">${mainCategoryOptions}</select></div></div><div class="styling-row" id="styling-sub-container-${q.id}" style="display: none;"><div class="styling-label">Alt Kategori</div><div class="styling-content d-flex align-items-center gap-2"><select class="styling-sub-category-select flex-grow-1"></select><input type="number" class="sub-category-qty-input" min="1" value="1" style="width: 70px;"></div></div><div class="styling-row"><div class="styling-label">Sipariş Listesi</div><div class="styling-content" style="display: block;"><div class="styling-selected-products-list"></div></div></div></div>`;
    }

    return `<div class="fide-item ${isArchivedClass}" id="fide-item-${q.id}"><div class="fide-title-container"><p><span class="badge">FiDe ${q.id}</span> ${q.title}</p></div>${questionContentHTML}${questionActionsHTML}</div>`;
}

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
                        if (input.value.trim()) questionData.dynamicInputs.push({ text: input.value.trim(), completed: input.classList.contains('completed') });
                    }
                });
            }
        } else if (q.type === 'product_list') {
            document.querySelectorAll(`#fide-item-${q.id} #selected-products-list .selected-product-item`).forEach(item => {
                questionData.selectedProducts.push({ code: item.dataset.code, name: item.dataset.name, qty: item.dataset.qty });
            });
            const pleksiContainer = document.getElementById(`sub-items-container-fide${q.id}_pleksi`);
             if (pleksiContainer) {
                Array.from(pleksiContainer.childNodes).reverse().forEach(node => {
                    if (node.classList && node.classList.contains('dynamic-input-item')) {
                        const input = node.querySelector('input[type="text"]');
                        if (input.value.trim()) questionData.dynamicInputs.push({ text: input.value.trim(), completed: input.classList.contains('completed') });
                    }
                });
            }
        } else if (q.type === 'pop_system') {
            questionData.selectedPops = Array.from(document.querySelectorAll(`#fide-item-${q.id} .pop-checkbox:checked`)).map(cb => cb.value);
        } else if (q.type === 'styling_list') {
            const container = itemDiv.querySelector('.styling-list-container');
            const mainSelect = container.querySelector('.styling-main-category-select');
            const subSelect = container.querySelector('.styling-sub-category-select');
            const subQty = container.querySelector('.sub-category-qty-input');

            document.querySelectorAll(`#fide-item-${q.id} .styling-selected-products-list .selected-product-item`).forEach(item => {
                const qtyInput = item.querySelector('.qty-edit-input');
                questionData.selectedProducts.push({ code: item.dataset.code, name: item.dataset.name, qty: qtyInput ? qtyInput.value : item.dataset.qty });
            });

            if (mainSelect.value || subSelect.value) {
                 questionData.stylingCategorySelections = { mainCategory: mainSelect.value, subCategory: subSelect.value, subCategoryQty: subQty ? subQty.value : '1' };
            }

            const notesContainer = document.getElementById(`sub-items-container-fide${q.id}_notes`);
            if (notesContainer) {
                Array.from(notesContainer.childNodes).reverse().forEach(node => {
                    if (node.classList && node.classList.contains('dynamic-input-item')) {
                        const input = node.querySelector('input[type="text"]');
                        if (input.value.trim()) questionData.dynamicInputs.push({ text: input.value.trim(), completed: input.classList.contains('completed') });
                    }
                });
            }
        }
        reportData.questions_status[q.id] = questionData;
    });
    return reportData;
}

export function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');

    let isAuthValid = false;
    if (typeof pb !== 'undefined' && pb && pb.authStore) {
        isAuthValid = pb.authStore.isValid === true;
    }

    const isOnline = state.isPocketBaseConnected === true && isAuthValid;

    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);

    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}

export function returnToMainPage() {
    const emailDraft = document.getElementById('email-draft-container');
    if (emailDraft) emailDraft.remove();
    document.getElementById('dide-upload-card').style.display = 'block';
    document.getElementById('form-content').style.display = 'block';
    document.querySelector('.action-button').style.display = 'block';
}

export function resetForm() { 
    state.setCurrentReportId(null);
    buildForm(); 
}

export function buildForm() {
    const formContainer = document.getElementById('form-content');
    if (!formContainer) return;
    formContainer.innerHTML = state.fideQuestions.filter(q => !q.isArchived).map(q => generateQuestionHtml(q)).join('');
    
    const popContainer = document.getElementById('popCodesContainer');
    if (popContainer) initializePopSystem(popContainer);
    
    document.querySelectorAll('.styling-main-category-select').forEach(select => {
        select.addEventListener('change', handleStylingMainCatChange);
    });
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

    // --- PUAN KONTROLÜ VE MANUEL GİRİŞ MANTIĞI (GÜNCELLENDİ) ---
    const currentMonthIdx = new Date().getMonth() + 1;
    const fideStoreInfo = state.fideData.find(row => String(row['Bayi Kodu']) === String(state.selectedStore.bayiKodu)) || null;
    let manualFideScore = null;

    // Eğer tabloda (Excel'de) cari ay için puan zaten varsa, sormadan onu kullan
    const existingScore = fideStoreInfo?.scores?.[currentMonthIdx];
    if (existingScore !== undefined && existingScore !== null && existingScore !== "") {
        manualFideScore = String(existingScore).replace('.', ','); 
    } else {
        // Puan yoksa manuel sor
        manualFideScore = prompt(`${state.monthNames[currentMonthIdx]} ayı FiDe puanını giriniz (İşleme devam etmek için puan girmek zorunludur):`);

        if (manualFideScore === null || manualFideScore.trim() === "") {
            alert("Puan girilmediği için e-posta taslağı oluşturma işlemi durduruldu.");
            return;
        }

        if (manualFideScore.includes('.')) {
            alert("Hata: Nokta (.) kullanılamaz.\nLütfen ondalık sayıları virgül (,) ile ayırın (Örn: 56,6).");
            return;
        }

        const parsed = parseScore(manualFideScore);
        if (isNaN(parsed)) {
            alert("Hata: Girdiğiniz değer ('" + manualFideScore + "') geçerli bir sayı değildir.");
            return;
        }
    }
    // --- GÜNCELLEME BİTTİ ---

    let emailTemplate = `<p>{YONETMEN_ADI} Bey Merhaba,</p><p>Ziyaret etmiş olduğum {BAYI_BILGISI} bayi karnesi aşağıdadır.</p><p><br></p>{DENETIM_ICERIGI}<p><br></p>{PUAN_TABLOSU}`;
    if (pb && pb.authStore.isValid) {
        try {
            const templateRecord = await pb.collection('ayarlar').getFirstListItem('anahtar="emailTemplate"');
            if (templateRecord?.deger) emailTemplate = templateRecord.deger;
        } catch (e) { console.warn("E-posta şablonu yüklenemedi."); }
    }

    const reportData = getFormDataForSaving();
    await saveFormState(reportData, true);
    window.dispatchEvent(new CustomEvent('reportFinalized'));

    const storeInfo = state.dideData.find(row => String(row['Bayi Kodu']) === String(state.selectedStore.bayiKodu)) || null;
    
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
                if (pleksi) contentHtml += `<b><i>Pleksiyle sergilenmesi gerekenler...:</i></b><ul>${pleksi}</ul>`;
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

    const tableHtml = renderPerformanceTable(storeInfo, fideStoreInfo, manualFideScore);

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
    const sel = document.getElementById('product-selector');
    const qInp = document.getElementById('product-qty');
    const pCode = code || sel.value;
    const pQty = qty || qInp.value;
    if (!pCode || pQty < 1) return;
    const prod = name ? { code: pCode, name } : state.productList.find(p => p.code === pCode);
    if (!prod || document.querySelector(`#selected-products-list .selected-product-item[data-code="${prod.code}"]`)) return;
    const div = document.createElement('div');
    div.className = 'selected-product-item'; 
    div.dataset.code = prod.code; div.dataset.qty = pQty; div.dataset.name = prod.name; 
    div.innerHTML = `<span>${prod.code} ${prod.name} - <b>${pQty} Adet</b></span><button class="delete-item-btn btn-sm"><i class="fas fa-trash"></i></button>`;
    div.querySelector('.delete-item-btn').onclick = () => { div.remove(); debouncedSaveFormState(); };
    document.getElementById('selected-products-list').appendChild(div);
    if (!code) { sel.value = ''; qInp.value = '1'; }
    if (save) debouncedSaveFormState();
}

function toggleCompleted(btn) {
    const inp = btn.parentElement.querySelector('input[type="text"]');
    const comp = inp.classList.toggle('completed');
    inp.readOnly = comp;
    btn.innerHTML = comp ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    btn.classList.toggle('undo', comp);
    debouncedSaveFormState();
}

function toggleQuestionCompleted(btn, id, save = true) {
    const div = document.getElementById(`fide-item-${id}`);
    const comp = div.querySelector('.fide-title-container').classList.toggle('question-completed');
    btn.innerHTML = comp ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    btn.classList.toggle('undo', comp);
    const area = div.querySelector('.input-area');
    const styl = div.querySelector('.styling-mode-toggle');
    if (area && !styl) area.style.display = comp ? 'none' : 'block';
    if (styl) {
        const sCont = div.querySelector('.styling-list-container');
        const vCont = document.getElementById(`standard-view-container-${id}`);
        const tCont = div.querySelector('.mode-toggle-container');
        const nCont = document.getElementById(`sub-items-container-fide${id}_notes`);
        [sCont, vCont, tCont, nCont].forEach(el => el && (el.style.display = comp ? 'none' : (el === sCont && !styl.checked ? 'none' : (el === vCont && styl.checked ? 'none' : 'block'))));
    }
    if (save) debouncedSaveFormState();
}

function toggleQuestionRemoved(btn, id, save = true) {
    const div = document.getElementById(`fide-item-${id}`);
    const rem = div.classList.toggle('question-removed');
    const area = div.querySelector('.input-area');
    const tCont = div.querySelector('.mode-toggle-container');
    const nCont = document.getElementById(`sub-items-container-fide${id}_notes`);
    if (tCont) tCont.style.display = rem ? 'none' : 'flex';
    if (area) area.style.display = rem ? 'none' : 'block';
    if (nCont) nCont.style.display = rem ? 'none' : 'block';
    btn.innerHTML = rem ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-times-circle"></i> Çıkar';
    btn.classList.toggle('btn-danger', !rem);
    btn.classList.toggle('btn-primary', rem);
    div.querySelectorAll('.add-item-btn, .status-btn').forEach(b => b.disabled = rem);
    if (save) debouncedSaveFormState();
}

function addDynamicInput(id, val = '', comp = false, save = true) {
    const cont = document.getElementById(`sub-items-container-${id}`);
    if (!cont) return;
    const div = document.createElement('div');
    div.className = 'dynamic-input-item';
    div.innerHTML = `<input type="text" value="${val}"><button class="status-btn btn-sm"><i class="fas fa-check"></i> Tamamlandı</button><button class="delete-bar btn-danger"><i class="fas fa-trash"></i></button>`;
    const inp = div.querySelector('input');
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addDynamicInput(id); } };
    inp.oninput = () => debouncedSaveFormState();
    div.querySelector('.status-btn').onclick = () => toggleCompleted(div.querySelector('.status-btn'));
    div.querySelector('.delete-bar').onclick = () => initiateDeleteItem(div.querySelector('.delete-bar'));
    if (comp) toggleCompleted(div.querySelector('.status-btn'));
    cont.prepend(div);
    if (!val) inp.focus();
    if (save) debouncedSaveFormState();
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

function checkExpiredPopCodes() {
    const warn = document.getElementById('expiredWarning');
    if (warn) warn.style.display = Array.from(document.querySelectorAll('.pop-checkbox:checked')).some(cb => state.expiredCodes.includes(cb.value)) ? 'block' : 'none';
}

function copySelectedCodes() {
    const codes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(c => !state.expiredCodes.includes(c));
    if (codes.length) navigator.clipboard.writeText(codes.join(', ')).then(() => alert("Kodlar kopyalandı!"));
}

function clearSelectedCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => cb.checked = false);
    checkExpiredPopCodes();
    debouncedSaveFormState();
}

function selectExpiredCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => cb.checked = state.expiredCodes.includes(cb.value));
    checkExpiredPopCodes();
    debouncedSaveFormState();
}

function openEmailDraft() {
    const codes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(c => !state.expiredCodes.includes(c));
    if (!codes.length) return;
    const q = state.fideQuestions.find(f => f.type === 'pop_system') || {};
    
    const toEmails = q.popEmailTo?.join(', ') || '';
    const ccEmails = q.popEmailCc?.join(', ') || '';
    
    let emailWindow = window.open('', '_blank');
    let content = `<b>Kime:</b> ${toEmails}<br>`;
    
    if (ccEmails) {
        content += `<b>Bilgi (CC):</b> ${ccEmails}<br>`;
    }
    
    content += `<br><b>İçerik:</b><br>${codes.join(', ')}`;
    
    emailWindow.document.write(content);
}

function toggleStylingView(cb, id) {
    const s = document.getElementById(`styling-container-${id}`);
    const v = document.getElementById(`standard-view-container-${id}`);
    s.style.display = cb.checked ? 'block' : 'none';
    v.style.display = cb.checked ? 'none' : 'block';
}

function handleStylingMainCatChange(e) {
    const sel = e.target;
    const cont = sel.closest('.styling-list-container');
    const qId = cont.dataset.questionId;
    const q = state.fideQuestions.find(f => String(f.id) === qId);
    const sub = document.getElementById(`styling-sub-container-${qId}`);
    const list = cont.querySelector('.styling-selected-products-list');
    const sSel = sub.querySelector('.styling-sub-category-select');
    sSel.innerHTML = '<option value="">-- Alt Kategori Seçin --</option>';
    list.innerHTML = ''; 
    if (sel.value && q?.stylingData) {
        q.stylingData.find(mc => mc.name === sel.value)?.subCategories.forEach(sc => sSel.add(new Option(sc.name, sc.name)));
        sub.style.display = 'flex'; 
        sSel.onchange = handleStylingSubCatChange;
        sub.querySelector('.sub-category-qty-input').onchange = (ev) => sSel.dispatchEvent(new Event('change'));
    } else { sub.style.display = 'none'; }
    debouncedSaveFormState(); 
}

function handleStylingSubCatChange(e) {
    const sel = e.target;
    const cont = sel.closest('.styling-list-container');
    const qId = cont.dataset.questionId;
    const q = state.fideQuestions.find(f => String(f.id) === qId);
    const main = cont.querySelector('.styling-main-category-select');
    const mult = parseInt(cont.querySelector('.sub-category-qty-input').value) || 1;
    const list = cont.querySelector('.styling-selected-products-list');
    list.innerHTML = ''; 
    if (sel.value && q?.stylingData) {
        q.stylingData.find(m => m.name === main.value)?.subCategories.find(s => s.name === sel.value)?.products.forEach(p => {
            addStylingProductToList(qId, p.code, (parseInt(p.qty) || 1) * mult, p.name, false);
        });
    }
    debouncedSaveFormState(); 
}

function addStylingProductToList(qId, code, qty, name, save = true) {
    const list = document.getElementById(`fide-item-${qId}`).querySelector('.styling-selected-products-list');
    if (list.querySelector(`[data-code="${code}"]`)) return;
    const div = document.createElement('div');
    
    div.className = 'selected-product-item d-flex align-items-center mb-2'; 
    div.style.padding = "8px";
    div.style.borderBottom = "1px solid #eee";
    div.dataset.code = code; div.dataset.qty = qty; div.dataset.name = name;
    
    div.innerHTML = `
        <span style="flex: 1; font-size: 13px;">${code} ${name}</span>
        <div class="d-flex align-items-center" style="gap: 5px; min-width: 100px; justify-content: flex-end;">
            <input type="number" class="qty-edit-input form-control form-control-sm" value="${qty}" style="width: 50px; height: 30px; padding: 2px 5px; text-align: center;">
            <span style="font-size: 13px; font-weight: normal; color: #333;">Adet</span>
        </div>
        <button class="delete-item-btn btn-sm btn-danger ms-2" style="height: 30px; width: 30px; display: flex; align-items: center; justify-content: center;">
            <i class="fas fa-trash" style="margin: 0;"></i>
        </button>
    `;
    
    div.querySelector('.qty-edit-input').onchange = () => debouncedSaveFormState();
    div.querySelector('.delete-item-btn').onclick = () => { div.remove(); debouncedSaveFormState(); };
    list.appendChild(div);
    if (save) debouncedSaveFormState();
}

export function attachUiFunctionsToWindow() {
    window.generateEmail = generateEmail;
    window.returnToMainPage = returnToMainPage;
    window.initiateDeleteItem = initiateDeleteItem;
    window.addProductToList = addProductToList;
    window.toggleQuestionCompleted = toggleQuestionCompleted;
    window.toggleQuestionRemoved = toggleQuestionRemoved;
    window.addDynamicInput = addDynamicInput;
    window.copySelectedCodes = copySelectedCodes;
    window.clearSelectedCodes = clearSelectedCodes;
    window.selectExpiredCodes = selectExpiredCodes;
    window.openEmailDraft = openEmailDraft;
    window.toggleStylingView = toggleStylingView; 
}
