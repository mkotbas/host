import { state, saveState } from './state.js';
import { saveFormState } from './api.js';
import { debounce } from './utils.js';

const debouncedSaveFormState = debounce(() => {
    saveFormState(false);
}, 800);

// Styling Ürünleri İçin E-posta İçeriği Oluşturucu
export function generateEmailContentForStyling(qId) {
    const ans = state.answers[qId];
    if (!ans || !ans.selectedMainCat || !ans.products || ans.products.length === 0) return '';
    
    // İsimleri bul
    const mainCat = (state.stylingData || []).find(m => m.id === ans.selectedMainCat);
    const subCat = mainCat ? (mainCat.subCats || []).find(s => s.id === ans.selectedSubCat) : null;
    
    const mainName = mainCat ? mainCat.name : 'Bilinmeyen Kategori';
    const subName = subCat ? subCat.name : 'Bilinmeyen Alt Kategori';
    
    let html = `<p><strong>${mainName} - ${subName} Alanı Eksikleri:</strong></p><ul>`;
    ans.products.forEach(p => {
        html += `<li>${p.code} - ${p.name} (Adet: ${p.qty})</li>`;
    });
    html += '</ul>';
    return html;
}

// --- Yardımcı: Alt Kategori Render Etme ---
function renderSubCategories(mainId, selectEl, data) {
    selectEl.innerHTML = '<option value="">Lütfen Alt Alan Seçiniz...</option>';
    selectEl.disabled = true;
    
    const mainCat = data.find(d => d.id === mainId);
    if (mainCat && mainCat.subCats && mainCat.subCats.length > 0) {
        selectEl.disabled = false;
        mainCat.subCats.forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub.id;
            opt.textContent = sub.name;
            selectEl.appendChild(opt);
        });
    }
}

// --- Yardımcı: Styling Ürünlerini Listeleme ---
function renderStylingProducts(mainId, subId, container, data, qId) {
    container.innerHTML = '';
    const mainCat = data.find(d => d.id === mainId);
    if (!mainCat) return;
    const subCat = (mainCat.subCats || []).find(s => s.id === subId);
    if (!subCat || !subCat.products || subCat.products.length === 0) {
        container.innerHTML = '<p style="color:var(--secondary); font-style:italic;">Bu kategori için tanımlı ürün listesi bulunamadı.</p>';
        return;
    }

    // Mevcut kayıtlı cevapları al
    const currentAns = state.answers[qId] || {};
    const savedProducts = currentAns.products || [];

    const table = document.createElement('div');
    table.style.display = 'grid';
    table.style.gap = '10px';

    subCat.products.forEach(prod => {
        const row = document.createElement('div');
        row.className = 'selected-product-item';
        row.style.display = 'grid';
        row.style.gridTemplateColumns = '1fr 2fr auto';
        row.style.gap = '10px';
        
        // Daha önce seçilmiş mi?
        const saved = savedProducts.find(p => p.code === prod.code);
        const isChecked = !!saved;
        const qty = saved ? saved.qty : 1;

        const checkDiv = document.createElement('div');
        checkDiv.style.display = 'flex';
        checkDiv.style.alignItems = 'center';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isChecked;
        checkbox.style.marginRight = '10px';
        checkbox.style.transform = 'scale(1.2)';
        
        checkDiv.appendChild(checkbox);
        checkDiv.appendChild(document.createTextNode(prod.code));

        const nameSpan = document.createElement('span');
        nameSpan.textContent = prod.name;
        nameSpan.style.display = 'flex';
        nameSpan.style.alignItems = 'center';

        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.min = '1';
        qtyInput.value = qty;
        qtyInput.style.width = '60px';
        qtyInput.style.padding = '5px';
        qtyInput.style.border = '1px solid #ddd';
        qtyInput.style.borderRadius = '4px';
        qtyInput.disabled = !isChecked;

        // Checkbox Değişimi
        checkbox.addEventListener('change', () => {
            qtyInput.disabled = !checkbox.checked;
            updateStylingAnswer(qId, prod, checkbox.checked, qtyInput.value);
        });

        // Adet Değişimi
        qtyInput.addEventListener('input', () => {
            if (checkbox.checked) {
                updateStylingAnswer(qId, prod, true, qtyInput.value);
            }
        });

        row.appendChild(checkDiv);
        row.appendChild(nameSpan);
        row.appendChild(qtyInput);
        table.appendChild(row);
    });
    container.appendChild(table);
}

function updateStylingAnswer(qId, prod, isSelected, qty) {
    const ans = state.answers[qId] || { selectedMainCat: '', selectedSubCat: '', products: [] };
    let products = ans.products || [];
    
    if (isSelected) {
        const idx = products.findIndex(p => p.code === prod.code);
        if (idx > -1) {
            products[idx].qty = parseInt(qty);
        } else {
            products.push({ code: prod.code, name: prod.name, qty: parseInt(qty) });
        }
    } else {
        products = products.filter(p => p.code !== prod.code);
    }
    
    state.answers[qId] = { ...ans, products: products };
    saveState();
    debouncedSaveFormState();
}

// --- MEVCUT RENDER FORM FONKSİYONU (GÜNCELLENDİ) ---
export function renderForm() {
    const container = document.getElementById('form-content');
    container.innerHTML = '';

    if (state.fideQuestions.length === 0) {
        container.innerHTML = '<p class="empty-list-message">Görüntülenecek soru bulunmamaktadır.</p>';
        return;
    }

    const activeQuestions = state.fideQuestions.filter(q => !q.isArchived);

    activeQuestions.forEach(q => {
        const item = document.createElement('div');
        item.className = 'fide-item';
        item.dataset.id = q.id;

        if (state.completedQuestions[q.id]) item.classList.add('question-completed');
        
        const titleContainer = document.createElement('div');
        titleContainer.className = 'fide-title-container';
        if (state.completedQuestions[q.id]) titleContainer.classList.add('question-completed');
        
        const titleText = document.createElement('p');
        titleText.innerHTML = `<span class="badge">FiDe ${q.id}</span> ${q.title}`;
        titleContainer.appendChild(titleText);

        if (state.completedQuestions[q.id]) {
            const checkIcon = document.createElement('i');
            checkIcon.className = 'fas fa-check-circle';
            checkIcon.style.color = 'var(--success)';
            checkIcon.style.fontSize = '1.2em';
            titleContainer.appendChild(checkIcon);
        }

        item.appendChild(titleContainer);

        // --- STYLING LIST (YENİ) ---
        if (q.type === 'styling_list') {
            const mainCatSelect = document.createElement('select');
            mainCatSelect.className = 'styling-main-select';
            mainCatSelect.innerHTML = '<option value="">Lütfen Bir Ana Alan Seçin...</option>';
            
            const stylingData = state.stylingData || []; 
            stylingData.forEach(mainCat => {
                const opt = document.createElement('option');
                opt.value = mainCat.id;
                opt.textContent = mainCat.name;
                mainCatSelect.appendChild(opt);
            });

            const savedMainVal = state.answers[q.id]?.selectedMainCat || '';
            mainCatSelect.value = savedMainVal;

            const subCatContainer = document.createElement('div');
            subCatContainer.className = 'styling-sub-select-container';
            subCatContainer.style.marginTop = '10px';
            
            const subCatSelect = document.createElement('select');
            subCatSelect.className = 'styling-sub-select';
            subCatSelect.disabled = !savedMainVal;
            subCatSelect.innerHTML = '<option value="">Önce Ana Alan Seçiniz...</option>';

            const productListContainer = document.createElement('div');
            productListContainer.className = 'styling-product-display-area';
            productListContainer.style.marginTop = '15px';

            // Ana Kategori Değişimi
            mainCatSelect.addEventListener('change', (e) => {
                const selectedMainId = e.target.value;
                state.answers[q.id] = { ...state.answers[q.id], selectedMainCat: selectedMainId, selectedSubCat: '', products: [] }; 
                saveState();
                renderSubCategories(selectedMainId, subCatSelect, stylingData);
                productListContainer.innerHTML = ''; 
                debouncedSaveFormState();
            });

            // Alt Kategori Değişimi
            subCatSelect.addEventListener('change', (e) => {
                const selectedMainId = mainCatSelect.value;
                const selectedSubId = e.target.value;
                state.answers[q.id] = { ...state.answers[q.id], selectedSubCat: selectedSubId }; 
                saveState();
                renderStylingProducts(selectedMainId, selectedSubId, productListContainer, stylingData, q.id);
                debouncedSaveFormState();
            });

            // Kayıtlı veriyi geri yükleme
            if (savedMainVal) {
                renderSubCategories(savedMainVal, subCatSelect, stylingData);
                subCatSelect.value = state.answers[q.id]?.selectedSubCat || '';
                if (subCatSelect.value) {
                    renderStylingProducts(savedMainVal, subCatSelect.value, productListContainer, stylingData, q.id);
                }
            }

            subCatContainer.appendChild(subCatSelect);
            item.appendChild(mainCatSelect);
            item.appendChild(subCatContainer);
            item.appendChild(productListContainer);
        } 
        // --- PRODUCT LIST ---
        else if (q.type === 'product_list') {
            const adderDiv = document.createElement('div');
            adderDiv.className = 'product-adder';
            const select = document.createElement('select');
            select.innerHTML = '<option value="">Ürün Seçin...</option>';
            let currentOptGroup = null;
            (state.productList || []).forEach(p => {
                if (p.type === 'header') {
                    currentOptGroup = document.createElement('optgroup');
                    currentOptGroup.label = p.name;
                    select.appendChild(currentOptGroup);
                } else {
                    const option = document.createElement('option');
                    option.value = p.code;
                    option.textContent = `${p.code} - ${p.name}`;
                    if (currentOptGroup) currentOptGroup.appendChild(option);
                    else select.appendChild(option);
                }
            });

            const qtyInput = document.createElement('input');
            qtyInput.type = 'number'; qtyInput.min = '1'; qtyInput.value = '1'; qtyInput.placeholder = 'Adet';
            const addBtn = document.createElement('button');
            addBtn.className = 'add-item-btn btn-sm';
            addBtn.innerHTML = '<i class="fas fa-plus"></i> Ekle';
            
            const productListContainer = document.createElement('div');
            productListContainer.id = `products-${q.id}`;
            
            const renderSelectedProducts = () => {
                productListContainer.innerHTML = '';
                const saved = state.answers[q.id]?.products || [];
                saved.forEach(p => {
                    const row = document.createElement('div');
                    row.className = 'selected-product-item';
                    row.innerHTML = `<span>${p.code} - ${p.name}</span><span class="product-quantity">x${p.qty}</span><button class="btn-danger btn-sm delete-item-btn"><i class="fas fa-trash"></i></button>`;
                    row.querySelector('.delete-item-btn').addEventListener('click', () => {
                        const current = state.answers[q.id].products.filter(x => x.code !== p.code);
                        state.answers[q.id].products = current;
                        saveState(); debouncedSaveFormState(); renderSelectedProducts();
                    });
                    productListContainer.appendChild(row);
                });
            };

            addBtn.onclick = () => {
                const code = select.value; const qty = qtyInput.value;
                if (!code || !qty) return;
                const product = state.productList.find(p => p.code === code);
                if (!product) return;
                const currentProducts = state.answers[q.id]?.products || [];
                const existingIndex = currentProducts.findIndex(p => p.code === code);
                if (existingIndex > -1) currentProducts[existingIndex].qty = parseInt(currentProducts[existingIndex].qty) + parseInt(qty);
                else currentProducts.push({ code: product.code, name: product.name, qty: parseInt(qty) });
                state.answers[q.id] = { ...state.answers[q.id], products: currentProducts };
                saveState(); renderSelectedProducts(); debouncedSaveFormState();
                select.value = ''; qtyInput.value = '1';
            };

            adderDiv.appendChild(select); adderDiv.appendChild(qtyInput); adderDiv.appendChild(addBtn);
            item.appendChild(adderDiv); item.appendChild(productListContainer);
            renderSelectedProducts();
        } 
        // --- POP SYSTEM ---
        else if (q.type === 'pop_system') {
             const popContainer = document.createElement('div'); popContainer.className = 'pop-container';
             if (q.popCodes && q.popCodes.length > 0) {
                 const vH = document.createElement('p'); vH.innerHTML = '<strong><i class="fas fa-check-circle"></i> Mevcut POP Malzemeleri</strong>'; vH.style.color = 'var(--success)'; popContainer.appendChild(vH);
                 q.popCodes.forEach(code => {
                     const l = document.createElement('label'); l.className = 'checkbox-label';
                     const c = document.createElement('input'); c.type = 'checkbox'; c.className = 'pop-checkbox'; c.value = code;
                     const saved = state.answers[q.id]?.pop_requests || [];
                     if (saved.includes(code)) c.checked = true;
                     c.addEventListener('change', () => {
                         const curr = state.answers[q.id]?.pop_requests || [];
                         if (c.checked) curr.push(code); else { const idx = curr.indexOf(code); if (idx > -1) curr.splice(idx, 1); }
                         state.answers[q.id] = { ...state.answers[q.id], pop_requests: curr };
                         saveState(); debouncedSaveFormState();
                     });
                     l.appendChild(c); l.appendChild(document.createTextNode(code)); popContainer.appendChild(l);
                 });
             }
             // Eski kodlar...
             if (q.expiredCodes && q.expiredCodes.length > 0) {
                const eH = document.createElement('p'); eH.innerHTML = '<strong><i class="fas fa-exclamation-circle"></i> Eski Kodlar</strong>'; eH.style.color = 'var(--danger)'; eH.style.marginTop = '15px'; popContainer.appendChild(eH);
                 q.expiredCodes.forEach(code => {
                     const l = document.createElement('label'); l.className = 'checkbox-label'; l.style.backgroundColor = '#fff5f5';
                     const c = document.createElement('input'); c.type = 'checkbox'; c.className = 'pop-checkbox'; c.value = code;
                     const saved = state.answers[q.id]?.pop_requests || [];
                     if (saved.includes(code)) c.checked = true;
                     c.addEventListener('change', () => {
                         const curr = state.answers[q.id]?.pop_requests || [];
                         if (c.checked) curr.push(code); else { const idx = curr.indexOf(code); if (idx > -1) curr.splice(idx, 1); }
                         state.answers[q.id] = { ...state.answers[q.id], pop_requests: curr };
                         saveState(); debouncedSaveFormState();
                     });
                     l.appendChild(c); l.appendChild(document.createTextNode(code)); popContainer.appendChild(l);
                 });
             }
             item.appendChild(popContainer);
        }
        // --- STANDARD ---
        else {
            // Statik maddeler ve inputlar (Eski yapı korunuyor)
            (q.staticItems || []).forEach(staticText => {
                const sDiv = document.createElement('div'); sDiv.className = 'static-item';
                sDiv.innerHTML = `<div class="content">${staticText}</div><div class="delete-bar" title="Maddeyi Sil (Sadece bu rapor için)"><i class="fas fa-trash"></i></div>`;
                sDiv.querySelector('.delete-bar').addEventListener('click', (e) => {
                   const p = e.currentTarget.parentElement; p.classList.toggle('is-deleting');
                   // Silinme durumunu kaydetmek gerekebilir ama şimdilik görsel bırakıldı
                });
                item.appendChild(sDiv);
            });
            
            const inputContainer = document.createElement('div'); inputContainer.className = 'dynamic-input-container';
            const savedInputs = state.answers[q.id]?.inputs || [];
            const renderInputs = () => {
                inputContainer.innerHTML = '';
                savedInputs.forEach((val, idx) => {
                    const dDiv = document.createElement('div'); dDiv.className = 'dynamic-input-item';
                    const inp = document.createElement('input'); inp.type = 'text'; inp.value = val.text; 
                    if(val.completed) inp.classList.add('completed');
                    inp.addEventListener('input', (e) => { savedInputs[idx].text = e.target.value; state.answers[q.id].inputs = savedInputs; saveState(); debouncedSaveFormState(); });
                    
                    const okBtn = document.createElement('button'); okBtn.className = 'status-btn btn-sm'; okBtn.innerHTML = '<i class="fas fa-check"></i>';
                    okBtn.onclick = () => { savedInputs[idx].completed = !savedInputs[idx].completed; renderInputs(); state.answers[q.id].inputs = savedInputs; saveState(); debouncedSaveFormState(); };
                    
                    const delDiv = document.createElement('div'); delDiv.className = 'delete-bar'; delDiv.innerHTML = '<i class="fas fa-trash"></i>';
                    delDiv.onclick = () => { savedInputs.splice(idx, 1); renderInputs(); state.answers[q.id].inputs = savedInputs; saveState(); debouncedSaveFormState(); };
                    
                    dDiv.appendChild(inp); dDiv.appendChild(okBtn); dDiv.appendChild(delDiv); inputContainer.appendChild(dDiv);
                });
            };
            renderInputs();
            
            const addBtn = document.createElement('button'); addBtn.className = 'add-item-btn btn-sm'; addBtn.innerHTML = '<i class="fas fa-plus"></i> Eksiklik Ekle';
            addBtn.style.marginTop = '10px';
            addBtn.onclick = () => { savedInputs.push({ text: '', completed: false }); renderInputs(); state.answers[q.id] = { inputs: savedInputs }; saveState(); debouncedSaveFormState(); };
            
            item.appendChild(inputContainer); item.appendChild(addBtn);
        }

        // Soru Tamamlandı Butonu
        const toggleCompleteBtn = document.createElement('button');
        toggleCompleteBtn.className = state.completedQuestions[q.id] ? 'status-btn undo btn-sm' : 'status-btn btn-sm';
        toggleCompleteBtn.innerHTML = state.completedQuestions[q.id] ? '<i class="fas fa-undo"></i> Tamamlanmadı' : '<i class="fas fa-check"></i> Tamamlandı İşaretle';
        toggleCompleteBtn.style.marginTop = '15px';
        toggleCompleteBtn.onclick = () => {
            state.completedQuestions[q.id] = !state.completedQuestions[q.id];
            saveState(); debouncedSaveFormState(); renderForm();
        };
        
        const actionDiv = document.createElement('div'); actionDiv.className = 'fide-actions';
        actionDiv.appendChild(toggleCompleteBtn);
        item.appendChild(actionDiv);

        container.appendChild(item);
    });
}

// --- E-POSTA OLUŞTURMA (GÜNCELLENDİ) ---
export function generateEmail() {
    let emailBody = `
    <p>Merhaba,</p>
    <p>Aşağıda detayları belirtilen mağaza denetim raporunu bilgilerinize sunarım.</p>
    <p><strong>Bayi:</strong> ${state.selectedStore ? state.selectedStore.bayiAdi : 'Seçilmedi'} (${state.selectedStore ? state.selectedStore.bayiKodu : ''})</p>
    <p><strong>Tarih:</strong> ${new Date().toLocaleDateString('tr-TR')}</p>
    <hr>
    `;

    // DiDe ve FiDe Puanları
    if (state.selectedStore) {
        const dideScore = state.dideData.find(d => d.bayiKodu == state.selectedStore.bayiKodu)?.puan || 'Girilmedi';
        const fideScore = state.fideData.find(d => d.bayiKodu == state.selectedStore.bayiKodu)?.puan || 'Girilmedi';
        emailBody += `<p><strong>DiDe Puanı:</strong> ${dideScore}</p><p><strong>FiDe Puanı:</strong> ${fideScore}</p><hr>`;
    }

    // Soruların Cevaplarını E-postaya Ekle
    state.fideQuestions.forEach(q => {
        if (q.isArchived || !q.wantsStoreEmail) return;
        
        const ans = state.answers[q.id];
        let hasContent = false;
        let questionContent = '';

        // Styling List İçeriği
        if (q.type === 'styling_list' && ans && ans.products && ans.products.length > 0) {
            questionContent = generateEmailContentForStyling(q.id);
            hasContent = true;
        }
        // Product List İçeriği
        else if (q.type === 'product_list' && ans && ans.products && ans.products.length > 0) {
            questionContent = '<ul>' + ans.products.map(p => `<li>${p.code} - ${p.name} (Adet: ${p.qty})</li>`).join('') + '</ul>';
            hasContent = true;
        }
        // Standart İçerik
        else if (ans && ans.inputs && ans.inputs.length > 0) {
            const activeInputs = ans.inputs.filter(i => !i.completed && i.text.trim() !== '');
            if (activeInputs.length > 0) {
                questionContent = '<ul>' + activeInputs.map(i => `<li>${i.text}</li>`).join('') + '</ul>';
                hasContent = true;
            }
        }

        if (hasContent) {
            emailBody += `<p><strong>FiDe ${q.id} - ${q.title}:</strong></p>${questionContent}<br>`;
        }
    });

    emailBody += `<p>İyi çalışmalar dilerim.</p>`;

    // E-posta taslağını göster (Popup veya Yeni Pencere yerine mevcut alana yazabiliriz ama şimdilik alert/log)
    // Gerçek uygulamada burada "createEmailDraft" gibi bir fonksiyon çağrılır.
    console.log("E-posta Taslağı:", emailBody);
    alert("E-posta taslağı konsola yazıldı (Geliştirme Modu). Gerçek e-posta modülü entegre edilmeli.");
}