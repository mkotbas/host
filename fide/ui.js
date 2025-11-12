import * as state from './state.js';
import { saveFormState } from './api.js';

let pb; // PocketBase instance

// --- DEBOUNCE MEKANİZMASI (YENİ) ---
// Hızlı form değişikliklerinin sunucuya sürekli istek atmasını ('autocancelled' hatası) engeller.
let saveDebounceTimer;
function debouncedSaveFormState() {
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(() => {
        // Sadece giriş yapılmışsa ve bir bayi seçiliyse kaydet
        if (state.isPocketBaseConnected && state.selectedStore) {
            // Bu arka plan kaydı, api.js'te varsayılan olarak 
            // yükleme ekranı göstermemelidir.
            saveFormState(getFormDataForSaving()); 
        }
    }, 800); // Kullanıcı eylemi durduktan sonra 0.8 saniye bekle
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
        questionContentHTML = `<div class="input-area"><b><i>Sipariş verilmesi gerekenler:</i></b><div class="product-adder"><select id="product-selector"><option value="">-- Malzeme Seçin --</option>${productOptions}</select><input type="number" id="product-qty" placeholder="Adet" min="1" value="1"><button class="btn-success btn-sm" onclick="addProductToList()" title="Seçili malzemeyi ve adedini aşağıdaki sipariş listesine ekler."><i class="fas fa-plus"></i> Ekle</button></div><div id="selected-products-list"></div><hr><b class="plexi-header"><i>Pleksiyle sergilenmesi gerekenler veya Yanlış Pleksi malzeme ile kullanılanlar:</i></b><div id="sub-items-container-fide${q.id}_pleksi"></div></div>`;
    
    // --- YENİ GELİŞTİRME (STYLING LİSTESİ) ---
    } else if (q.type === 'styling_list') { 
        questionActionsHTML = `<div class="fide-actions"><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})" title="Bu soruyu 'Tamamlandı' olarak işaretler."><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})" title="Bu soruyu e-posta raporundan tamamen çıkarır. Geri alınabilir."><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
        
        let anaKategoriOptions = '<option value="">-- Ana Kategori Seçin --</option>';
        if (state.stylingData) {
            Object.keys(state.stylingData).forEach(anaKategori => {
                anaKategoriOptions += `<option value="${anaKategori}">${anaKategori}</option>`;
            });
        }

        questionContentHTML = `<div class="input-area">
            <div class="styling-selector-container">
                <select id="styling-ana-kategori-${q.id}" onchange="updateStylingAltKategori(${q.id})">
                    ${anaKategoriOptions}
                </select>
                <select id="styling-alt-kategori-${q.id}" onchange="populateStylingList(${q.id})" disabled>
                    <option value="">-- Önce Ana Kategori Seçin --</option>
                </select>
            </div>
            <hr>
            <b><i>Eksik olan (sipariş verilmesi gereken) malzemeler:</i></b>
            <div id="styling-checklist-container-${q.id}" class="styling-checklist-container">
                </div>
        </div>`;
    // --- YENİ GELİŞTİRME BİTTİ ---

    } else if (q.type === 'pop_system') {
        questionActionsHTML = `<div class="fide-actions"><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})" title="Bu soruyu 'Tamamlandı' olarak işaretler. Geri alınabilir."><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})" title="Bu soruyu e-posta raporundan tamamen çıkarır. Geri alınabilir."><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
        questionContentHTML = `<div class="input-area"><div class="pop-container" id="popCodesContainer"></div><div class="warning-message" id="expiredWarning">Seçiminizde süresi dolmuş kodlar bulunmaktadır.</div><div class="pop-button-container"><button class="btn-success btn-sm" onclick="copySelectedCodes()" title="Seçili olan geçerli POP kodlarını panoya kopyalar.">Kopyala</button><button class="btn-danger btn-sm" onclick="clearSelectedCodes()" title="Tüm POP kodu seçimlerini temizler.">Temizle</button><button class="btn-primary btn-sm" onclick="selectExpiredCodes()" title="Süresi dolmuş olan tüm POP kodlarını otomatik olarak seçer.">Bitenler</button><button class="btn-primary btn-sm" onclick="openEmailDraft()" title="Seçili POP kodları için bir e-posta taslağı penceresi açar.">E-Posta</button></div></div>`;
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
        
        // --- GÜNCELLENDİ (Styling verisi için alanlar eklendi) ---
        const questionData = { 
            removed: isRemoved, 
            completed: isCompleted, 
            dynamicInputs: [], 
            selectedProducts: [], 
            selectedPops: [],
            // YENİ (Styling)
            selectedAnaKategori: null,
            selectedAltKategori: null,
            missingItems: []
        };
        // --- GÜNCELLEME BİTTİ ---

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
        
        // --- YENİ GELİŞTİRME (STYLING LİSTESİ) ---
        // Kaydetme mantığı eklendi
        } else if (q.type === 'styling_list') {
            const anaKategoriSelect = document.getElementById(`styling-ana-kategori-${q.id}`);
            const altKategoriSelect = document.getElementById(`styling-alt-kategori-${q.id}`);
            if (anaKategoriSelect) questionData.selectedAnaKategori = anaKategoriSelect.value;
            if (altKategoriSelect) questionData.selectedAltKategori = altKategoriSelect.value;

            document.querySelectorAll(`#styling-checklist-container-${q.id} .selected-product-item`).forEach(itemEl => {
                questionData.missingItems.push({ 
                    stok: itemEl.dataset.stok, 
                    isim: itemEl.dataset.isim, 
                    adet: itemEl.dataset.adet 
                });
            });
        // --- YENİ GELİŞTİRME BİTTİ ---

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
    document.querySelector('.action-button').style.display = 'block';
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
    // E-posta oluşturmadan önce formun GÜNCEL halini 'true' (yükleme ekranı göstererek) kaydet.
    // Bu, debouncer'ı atlar ve anında kaydeder.
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
        const qData = reportData.questions_status[q.id]; // Kaydedilmiş veriyi al

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
        
        // --- YENİ GELİŞTİRME (STYLING LİSTESİ) ---
        // E-posta taslağı için HTML oluşturma
        } else if (q.type === 'styling_list') {
            if (qData && qData.missingItems && qData.missingItems.length > 0) {
                contentHtml = `<b><i>Sipariş verilmesi gerekenler (${qData.selectedAltKategori}):</i></b><ul>`;
                qData.missingItems.forEach(item => {
                    contentHtml += `<li>${item.stok} ${item.isim} - <b>(Std: ${item.adet})</b></li>`;
                });
                contentHtml += `</ul>`;
            }
        // --- YENİ GELİŞTİRME BİTTİ ---

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
            // --- GÜNCELLENDİ (Styling listesi 'tamamlandı' olsa bile gösterilsin) ---
            if (!isQuestionCompleted || q.type === 'product_list' || q.type === 'styling_list' || (isQuestionCompleted && q.type === 'standard' && contentHtml !== '')) {
                fideReportHtml += contentHtml;
            }
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
    document.querySelector('.action-button').style.display = 'none';

    const draftContainer = document.createElement('div');
    draftContainer.id = 'email-draft-container';
    draftContainer.className = 'card';
    draftContainer.innerHTML = `<h2><a href="#" onclick="event.preventDefault(); returnToMainPage();" style="text-decoration: none; color: inherit;" title="Ana Sayfaya Dön"><i class="fas fa-arrow-left" style="margin-right: 10px;"></i></a><i class="fas fa-envelope-open-text"></i> Kopyalanacak E-posta Taslağı</h2><div id="email-draft-area" contenteditable="true" style="min-height: 500px; border: 1px solid #ccc; padding: 10px; margin-top: 10px; font-family: Aptos, sans-serif; font-size: 11pt;">${finalEmailBody}</div>`;
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
            const qInfo = state.fideQuestions.find(q => String(q.id) === qId);

            if (data.removed) toggleQuestionRemoved(questionItem.querySelector('.remove-btn'), qId, false);
            else if (data.completed) toggleQuestionCompleted(questionItem.querySelector('.status-btn'), qId, false);
            
            if (data.dynamicInputs) {
                data.dynamicInputs.forEach(input => {
                    const containerId = (qInfo && qInfo.type === 'product_list') ? `fide${qId}_pleksi` : `fide${qId}`;
                    addDynamicInput(containerId, input.text, input.completed, false);
                });
            }
            if (data.selectedProducts) data.selectedProducts.forEach(prod => addProductToList(prod.code, prod.qty, false)); 
            
            // --- YENİ GELİŞTİRME (STYLING LİSTESİ) ---
            // Kayıtlı raporu yükleme mantığı
            if (qInfo && qInfo.type === 'styling_list' && data.selectedAnaKategori) {
                const anaKategoriSelect = document.getElementById(`styling-ana-kategori-${qId}`);
                const altKategoriSelect = document.getElementById(`styling-alt-kategori-${qId}`);
                
                // 1. Ana kategoriyi seç
                anaKategoriSelect.value = data.selectedAnaKategori;
                
                // 2. Alt kategori listesini (onchange'i tetiklemeden) doldur
                updateStylingAltKategori(qId, false); // 'false' -> kaydetme
                
                // 3. Alt kategoriyi seç
                altKategoriSelect.value = data.selectedAltKategori;

                // 4. Standart listeyi (onchange'i tetiklemeden) doldur
                // Bu fonksiyon, 'selected-product-item' (tekrar kullanılan class) divlerini oluşturur
                populateStylingList(qId, false); // 'false' -> kaydetme

                // 5. Kayıtlı "missingItems" (eksik) listesine göre
                // standart listeden "mevcut" olanları (kayıtta olmayanları) SİL.
                const missingStoks = data.missingItems.map(item => item.stok);
                const container = document.getElementById(`styling-checklist-container-${qId}`);
                const allItemsInList = container.querySelectorAll('.selected-product-item');
                
                allItemsInList.forEach(itemEl => {
                    if (!missingStoks.includes(itemEl.dataset.stok)) {
                        itemEl.remove(); // Bu listede vardı ama kayıtta yok, demek ki silinmiş.
                    }
                });
            }
            // --- YENİ GELİŞTİRME BİTTİ ---

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
}

// --- HTML Onclick için Window'a Atanacak Fonksiyonlar ---

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
            // --- GÜNCELLENDİ ---
            // Anlık kaydetme yerine debouncer'ı çağır
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
            // --- GÜNCELLENDİ ---
            debouncedSaveFormState(); 
        }, 4000);
        itemEl.dataset.deleteTimer = timerId;
    }
    // --- GÜNCELLENDİ ---
    // Geri alma/silme işlemini anlık kaydetmek için debouncer'ı çağır
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
    
    // --- GÜNCELLENDİ ---
    // 'onclick' kaldırıldı ve 'addEventListener' eklendi.
    newItem.innerHTML = `<span>${product.code} ${product.name} - <span class="product-quantity"><b>${selectedQty} ${unit}</b></span></span><button class="delete-item-btn btn-sm" title="Bu malzemeyi sipariş listesinden siler."><i class="fas fa-trash"></i></button>`;
    
    // Olay dinleyici programatik olarak eklendi
    newItem.querySelector('.delete-item-btn').addEventListener('click', function() {
        this.parentElement.remove(); // 'this' butonu işaret eder, parent'ı 'newItem' div'idir.
        debouncedSaveFormState(); // Debounced fonksiyonu çağır
    });
    // --- GÜNCELLEME BİTTİ ---
    
    listContainer.appendChild(newItem);
    
    if (!productCode) { select.value = ''; qtyInput.value = '1'; }
    
    // --- GÜNCELLENDİ ---
    if (shouldSave) debouncedSaveFormState();
}

function toggleCompleted(button) {
    const input = button.parentElement.querySelector('input[type="text"]');
    const isCompleted = input.classList.toggle('completed');
    input.readOnly = isCompleted;
    button.innerHTML = isCompleted ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    button.classList.toggle('undo', isCompleted);
    // --- GÜNCELLENDİ ---
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
    // --- GÜNCELLENDİ ---
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
    if(actionsContainer) actionsContainer.querySelectorAll('.add-item-btn, .status-btn').forEach(btn => btn.disabled = isRemoved);
    // --- GÜNCELLENDİ ---
    if (shouldSave) debouncedSaveFormState();
}

function addDynamicInput(id, value = '', isCompleted = false, shouldSave = true) {
    const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) return;

    const newItem = document.createElement('div');
    newItem.className = 'dynamic-input-item';
    newItem.innerHTML = `<input type="text" placeholder="Eksikliği yazın..." value="${value}"><button class="status-btn btn-sm" title="Bu eksikliği 'Tamamlandı' olarak işaretler."><i class="fas fa-check"></i> Tamamlandı</button><button class="delete-bar btn-danger" title="Bu satırı silmek için tıklayın."><i class="fas fa-trash"></i></button>`;
    
    const input = newItem.querySelector('input');
    const completeButton = newItem.querySelector('.status-btn');
    const deleteButton = newItem.querySelector('.delete-bar');
    
    input.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); addDynamicInput(id); } });
    
    // --- GÜNCELLENDİ ---
    // 'blur' olayında anlık kaydetme yerine debouncer'ı çağır
    // Bu, "Yeni Eksik Ekle" butonuna basıldığında tıklamanın engellenmesi sorununu çözer.
    input.addEventListener('blur', () => debouncedSaveFormState());
    
    completeButton.onclick = () => toggleCompleted(completeButton);
    deleteButton.onclick = () => initiateDeleteItem(deleteButton);
    
    if(isCompleted) toggleCompleted(completeButton);
    container.prepend(newItem);
    if (value === '') input.focus();
    
    // --- GÜNCELLENDİ ---
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
    // --- GÜNCELLENDİ ---
    debouncedSaveFormState();
}

function selectExpiredCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => { cb.checked = state.expiredCodes.includes(cb.value); });
    checkExpiredPopCodes();
    // --- GÜNCELLENDİ ---
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

// --- YENİ GELİŞTİRME (STYLING İÇİN YARDIMCI FONKSİYONLAR) ---

/**
 * Ana Kategori (HUBLAR, VİTRİNLER vb.) değiştiğinde Alt Kategori listesini doldurur.
 * @param {number} qId - Soru ID'si
 * @param {boolean} shouldSave - Bu değişikliğin debouncer'ı tetikleyip tetiklemeyeceği
 */
function updateStylingAltKategori(qId, shouldSave = true) {
    const anaKategoriSelect = document.getElementById(`styling-ana-kategori-${qId}`);
    const altKategoriSelect = document.getElementById(`styling-alt-kategori-${qId}`);
    const checklistContainer = document.getElementById(`styling-checklist-container-${qId}`);
    
    const anaKategoriVal = anaKategoriSelect.value;
    
    // Alt kategori listesini ve malzeme listesini temizle
    altKategoriSelect.innerHTML = '<option value="">-- Alt Kategori Seçin --</option>';
    checklistContainer.innerHTML = '';
    
    if (anaKategoriVal && state.stylingData[anaKategoriVal]) {
        // Alt kategorileri doldur
        const altKategoriler = state.stylingData[anaKategoriVal];
        Object.keys(altKategoriler).forEach(altKategori => {
            altKategoriSelect.innerHTML += `<option value="${altKategori}">${altKategori}</option>`;
        });
        altKategoriSelect.disabled = false;
    } else {
        altKategoriSelect.disabled = true;
    }

    // Değişiklik oldu (liste temizlendi), formu kaydet
    if (shouldSave) debouncedSaveFormState();
}

/**
 * Alt Kategori değiştiğinde, standart malzeme listesini ekrana basar.
 * Kullanıcı bu listeden "mevcut" olanları siler, "eksik" olanlar kalır.
 * @param {number} qId - Soru ID'si
 * @param {boolean} shouldSave - Bu değişikliğin debouncer'ı tetikleyip tetiklemeyeceği
 */
function populateStylingList(qId, shouldSave = true) {
    const anaKategoriVal = document.getElementById(`styling-ana-kategori-${qId}`).value;
    const altKategoriVal = document.getElementById(`styling-alt-kategori-${qId}`).value;
    const container = document.getElementById(`styling-checklist-container-${qId}`);
    
    container.innerHTML = ''; // Listeyi temizle

    if (anaKategoriVal && altKategoriVal && state.stylingData[anaKategoriVal][altKategoriVal]) {
        const items = state.stylingData[anaKategoriVal][altKategoriVal];
        
        items.forEach(item => {
            const newItem = document.createElement('div');
            // FiDe 13 (product_list) ile aynı class'ı kullanarak stillerin tutarlı olmasını sağlıyoruz
            newItem.className = 'selected-product-item'; 
            newItem.dataset.stok = item.stok;
            newItem.dataset.isim = item.isim;
            newItem.dataset.adet = item.adet;
            
            newItem.innerHTML = `<span>${item.stok} ${item.isim} - <span class="product-quantity"><b>(Std: ${item.adet})</b></span></span><button class="delete-item-btn btn-sm" title="Bu malzeme EKSİK DEĞİLSE (mevcutsa) listeden sil. Kalanlar 'eksik' olarak raporlanacak."><i class="fas fa-trash"></i></button>`;
            
            // Silme butonu (FiDe 13'teki gibi 'addEventListener' kullanıyoruz)
            newItem.querySelector('.delete-item-btn').addEventListener('click', function() {
                this.parentElement.remove(); // Malzemeyi listeden sil
                debouncedSaveFormState(); // Değişikliği kaydet
            });
            
            container.appendChild(newItem);
        });
    }

    // Liste doldu (veya boşaldı), bu yeni durumu kaydet
    if (shouldSave) debouncedSaveFormState();
}
// --- YENİ GELİŞTİRME BİTTİ ---


/**
 * HTML'deki onclick="" özelliklerinin çalışabilmesi için fonksiyonları window nesnesine atar.
 */
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

    // --- YENİ EKLENEN STYLING FONKSİYONLARI ---
    window.updateStylingAltKategori = updateStylingAltKategori;
    window.populateStylingList = populateStylingList;
    // --- YENİ EKLEME BİTTİ ---
}