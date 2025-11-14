// GÜNCELLENDİ: (function() { ... })() sarmalayıcısı kaldırıldı.

// --- Kapsüllenmiş Global Değişkenler ---
let fideQuestions = [], productList = [], migrationMap = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
let currentManagerView = 'active'; 
let pbInstance = null; 
let parsedExcelData = null; // YENİ: Yüklenen Excel verisini tutar

// --- YENİ: Dinamik Stil Ekleme Fonksiyonu ---
/**
 * Yeni arayüz (Sütun Eşleştirme) için stilleri <head> içine enjekte eder.
 * Bu sayede CSS dosyasıyla uğraşmak gerekmez.
 */
function injectManagerStyles() {
    const styleId = 'soru-yoneticisi-dynamic-styles';
    if (document.getElementById(styleId)) return; // Zaten eklenmişse tekrar ekleme

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        .styling-mapping-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 12px;
            background: #fff;
            padding: 15px;
            border-radius: 4px;
            border: 1px solid #e2e8f0;
            margin-top: 10px;
        }
        .mapping-row {
            display: grid;
            grid-template-columns: 180px 1fr; /* Etiket | Select */
            gap: 10px;
            align-items: center;
        }
        .mapping-row label {
            font-weight: 600;
            font-size: 13px;
            text-align: right;
            color: #333;
        }
        /* Select ve Input stillerini eşitle */
        .mapping-row select, .mapping-row input[type="text"] {
            width: 100%;
            padding: 8px;
            border: 1px solid #ccc;
            border-radius: 4px;
            font-size: 13px;
        }
        .mapping-row small {
            grid-column: 2; /* Select/Input'un altına */
            font-size: 11px;
            color: #666;
            margin-top: -5px;
        }
        /* Gizli file input */
        .bulk-styling-input-file {
            width: 0.1px;
            height: 0.1px;
            opacity: 0;
            overflow: hidden;
            position: absolute;
            z-index: -1;
        }
        /* File input için sahte buton */
        .btn-file-label {
            cursor: pointer;
            display: inline-flex !important; /* Buton gibi görünmesi için */
        }
    `;
    document.head.appendChild(style);
}

// --- MODÜL BAŞLATMA FONKSİYONU ---
export async function initializeSoruYoneticisiModule(pb) {
    pbInstance = pb; // Admin.js'den gelen PocketBase nesnesini al
    injectManagerStyles(); // YENİ: Stilleri enjekte et
    await loadInitialData();
    setupModuleEventListeners();
    renderQuestionManager();
}

async function loadMigrationMap() {
    migrationMap = {}; 
    if (!pbInstance || !pbInstance.authStore.isValid) return;

    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="migrationMap"');
        migrationMap = record.deger || {};
    } catch (error) {
        if (error.status !== 404) {
            console.error("Buluttan yönlendirme kuralları yüklenemedi:", error);
        }
    }
}

async function loadInitialData() {
    await loadMigrationMap();
    let questionsLoaded = false;
    if (!pbInstance || !pbInstance.authStore.isValid) {
         console.error("Soru Yöneticisi: Yükleme işlemi durduruldu çünkü giriş geçerli değil.");
         fideQuestions = fallbackFideQuestions;
         return;
    }

    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="fideQuestionsData"');
        const cloudData = record.deger;
        fideQuestions = cloudData.questions || [];
        productList = cloudData.productList || [];
        questionsLoaded = true;
    } catch (error) {
        if (error.status !== 404) {
            console.error("PocketBase'den soru verisi okunurken hata oluştu:", error);
            alert("Soru listesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.");
        }
    }
    
    if (!questionsLoaded) {
        fideQuestions = fallbackFideQuestions;
    }
}

function setupModuleEventListeners() {
    const listenerKey = 'soruYoneticisiListenersAttached';
    if (document.body.dataset[listenerKey]) return;
    document.body.dataset[listenerKey] = 'true';

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
        const dogruSifreHash = 'ZmRlMDAx'; // "fde001"
        const girilenSifre = prompt("ID alanlarını düzenlemeye açmak için lütfen yönetici şifresini tekrar girin:");
        if (girilenSifre) {
            const girilenSifreHash = btoa(girilenSifre);
            if (girilenSifreHash === dogruSifreHash) {
                const idInputs = document.querySelectorAll('.manager-id-input');
                idInputs.forEach(input => { input.disabled = false; });
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

async function updateAllReports(updateFunction) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        if (!pbInstance || !pbInstance.authStore.isValid) {
            alert("Bu işlem için bulut bağlantısı gereklidir.");
            return false;
        }

        const allReports = await pbInstance.collection('denetim_raporlari').getFullList({ fields: 'id,soruDurumlari' });
        const updatePromises = [];
        for (const report of allReports) {
            let soruDurumlari = report.soruDurumlari;
            const originalSoruDurumlariString = JSON.stringify(soruDurumlari);
            soruDurumlari = updateFunction(soruDurumlari);
            if (JSON.stringify(soruDurumlari) !== originalSoruDurumlariString) {
                updatePromises.push(pbInstance.collection('denetim_raporlari').update(report.id, { soruDurumlari }));
            }
        }
        if (updatePromises.length > 0) {
            await Promise.all(updatePromises);
        }
        return true;
    } catch (error) {
        console.error("Toplu rapor güncelleme sırasında bir hata oluştu:", error);
        alert("Kritik Hata: Raporlardaki veriler güncellenemedi.");
        return false;
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function applyIdChangeScenario() {
    const oldId = document.getElementById('scenario-old-id').value.trim();
    const newId = document.getElementById('scenario-new-id').value.trim();
    if (!oldId || !newId || oldId === newId) { alert("Lütfen geçerli ve birbirinden farklı ID'ler girin."); return; }

    const questionToMove = fideQuestions.find(q => String(q.id) === String(oldId));
    if (!questionToMove) { alert(`HATA: "${oldId}" ID'li bir soru bulunamadı.`); return; }

    const targetQuestion = fideQuestions.find(q => String(q.id) === String(newId));
    if (!targetQuestion) {
        if (!confirm(`Bu işlem, ${oldId} ID'li soruyu ${newId} olarak güncelleyecek ve TÜM cevapları kalıcı olarak yeni ID'ye taşıacaktır. Devam etmek istiyor musunuz?`)) return;
        const success = await updateAllReports(sd => { if (sd && sd[oldId]) { sd[newId] = sd[oldId]; delete sd[oldId]; } return sd; });
        if (success) {
            questionToMove.id = parseInt(newId, 10);
            addMigrationMapping(oldId, newId);
            alert("Başarılı! Değişiklikleri kalıcı yapmak için 'Kaydet' butonuna basmayı unutmayın.");
        }
    } else {
        if (!confirm(`"${newId}" ID'si zaten başka bir soru tarafından kullanılıyor. İki sorunun ID'lerini ve TÜM cevaplarını birbiriyle DEĞİŞTİRMEK istediğinizden emin misiniz?`)) return;
        const success = await updateAllReports(sd => { if (sd) { [sd[oldId], sd[newId]] = [sd[newId] || null, sd[oldId] || null]; } return sd; });
        if (success) {
            questionToMove.id = parseInt(newId, 10);
            targetQuestion.id = parseInt(oldId, 10);
            delete migrationMap[oldId]; delete migrationMap[newId];
            await saveMigrationMap();
            alert("Başarılı! Değişiklikleri kalıcı yapmak için 'Kaydet' butonuna basmayı unutmayın.");
        }
    }
    renderQuestionManager();
    closeScenarioSystem();
}

async function applyDeleteQuestionScenario() {
    const qid = document.getElementById('scenario-delete-id').value;
    if (!qid) { alert("Lütfen silinecek soru ID'sini girin."); return; }
    const question = fideQuestions.find(q => String(q.id) === String(qid));
    if (!question) { alert(`HATA: "${qid}" ID'li bir soru bulunamadı.`); return; }
    if (!confirm(`DİKKAT! BU İŞLEM GERİ ALINAMAZ!\n\nID: ${question.id} - Soru: "${question.title}"\n\nBu soruyu ve TÜM bayi raporlarındaki cevaplarını kalıcı olarak silmek istediğinizden emin misiniz?`)) return;
    const success = await updateAllReports(sd => { if (sd && sd[qid]) { delete sd[qid]; } return sd; });
    if (success) {
        fideQuestions = fideQuestions.filter(q => String(q.id) !== String(qid));
        await saveQuestions(false);
        alert("Soru ve ilişkili tüm cevaplar kalıcı olarak silindi. Sayfa yenileniyor.");
        window.location.reload();
    }
}

async function deleteAllAnswersForQuestion(questionId) {
    const qTitleEl = document.querySelector(`.manager-item[data-id="${questionId}"] .question-title-input`);
    const qTitle = qTitleEl ? qTitleEl.value : 'Bilinmeyen Soru';
    if (!confirm(`FiDe ${questionId} ("${qTitle}") sorusuna ait TÜM cevapları BÜTÜN raporlardan kalıcı olarak silmek istediğinizden emin misiniz?`)) return;
    const success = await updateAllReports(sd => { if (sd && sd[questionId]) { delete sd[questionId]; } return sd; });
    if (success) { alert(`FiDe ${questionId} sorusuna ait tüm cevaplar silindi.`); }
}

async function addMigrationMapping(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;
    migrationMap[oldId] = newId;
    await saveMigrationMap();
}

async function deleteMigrationMapping(oldId) {
    if (confirm(`'${oldId}' ID'li yönlendirmeyi silmek istediğinizden emin misiniz?`)) {
        delete migrationMap[oldId];
        await saveMigrationMap();
        renderMigrationManagerUI();
    }
}

async function saveMigrationMap() {
    if (!pbInstance || !pbInstance.authStore.isValid) return;
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="migrationMap"');
        await pbInstance.collection('ayarlar').update(record.id, { deger: migrationMap });
    } catch (error) {
        if (error.status === 404) {
            await pbInstance.collection('ayarlar').create({ anahtar: 'migrationMap', deger: migrationMap });
        } else { console.error("Yönlendirme kuralları kaydedilemedi:", error); }
    }
}

async function saveQuestions(reloadPage = true) {
    if (!pbInstance || !pbInstance.authStore.isValid) { alert("Kaydetmek için giriş yapın."); return; }
    
    const newProductList = [];
    const activeProductManager = document.querySelector('.product-list-manager');
    if (activeProductManager && activeProductManager.offsetParent !== null) {
        activeProductManager.querySelectorAll('.category-manager-row, .product-manager-row').forEach(row => {
            const type = row.dataset.type;
            const nameInput = row.querySelector('input');
            if (type === 'category' && nameInput.value.trim()) newProductList.push({ type: 'header', name: nameInput.value.trim() });
            else if (type === 'product') {
                const code = row.querySelector('.product-code').value.trim();
                const name = row.querySelector('.product-name').value.trim();
                if (code && name) newProductList.push({ code, name });
            }
        });
    } else { Object.assign(newProductList, productList); }

    const newQuestions = [];
    const ids = new Set();
    let hasError = false;
    document.querySelectorAll('#manager-list .manager-item:not(.to-be-deleted)').forEach(item => {
        const id = parseInt(item.querySelector('.manager-id-input').value);
        const title = item.querySelector('.question-title-input').value.trim();
        if (hasError) return;

        const originalQuestion = fideQuestions.find(fq => fq.id === id) || {};

        if (!id || !title) { hasError = true; return alert(`ID veya Başlık boş olamaz.`); }
        if (ids.has(id)) { hasError = true; return alert(`HATA: ${id} ID'si mükerrer kullanılmış.`); }
        ids.add(id);

        const q = {
            id, title, isArchived: item.querySelector('.archive-checkbox').checked,
            type: item.querySelector('.question-type-select').value,
            answerType: item.querySelector('.answer-type-select').value,
            wantsStoreEmail: item.querySelector('.wants-email-checkbox').checked,
            staticItems: item.querySelector('.editable-textarea').innerHTML.split(/<br\s*\/?>/gi).map(s => s.trim()).filter(Boolean)
        };
        if (q.type === 'pop_system') {
            q.popCodes = (item.querySelector('.pop-codes-input')?.value || '').split(',').map(c => c.trim()).filter(Boolean);
            q.expiredCodes = (item.querySelector('.expired-pop-codes-input')?.value || '').split(',').map(c => c.trim()).filter(Boolean);
            q.popEmailTo = (item.querySelector('.pop-email-to-input')?.value || '').split(',').map(e => e.trim()).filter(Boolean);
            q.popEmailCc = (item.querySelector('.pop-email-cc-input')?.value || '').split(',').map(e => e.trim()).filter(Boolean);
        }
        else if (q.type === 'styling_list') {
            q.stylingData = [];
            item.querySelectorAll('.styling-list-editor-container > .main-category-row').forEach(mainRow => {
                const mainCategoryName = mainRow.querySelector('.main-category-input').value.trim();
                if (!mainCategoryName) return;

                const mainCat = {
                    name: mainCategoryName,
                    subCategories: []
                };

                mainRow.querySelectorAll('.sub-category-container > .sub-category-row').forEach(subRow => {
                    const subCategoryName = subRow.querySelector('.sub-category-input').value.trim();
                    if (!subCategoryName) return;

                    const subCat = {
                        name: subCategoryName,
                        products: []
                    };

                    subRow.querySelectorAll('.product-container-styling > .product-row-styling').forEach(productRow => {
                        const productCode = productRow.querySelector('.product-code-styling').value.trim();
                        const productName = productRow.querySelector('.product-name-styling').value.trim();
                        const productQty = productRow.querySelector('.product-qty-styling').value.trim();
                        
                        if (productCode && productName) {
                            subCat.products.push({ code: productCode, name: productName, qty: productQty || '1' });
                        }
                    });
                    
                    if(subCat.products.length > 0) {
                         mainCat.subCategories.push(subCat);
                    }
                });

                if(mainCat.subCategories.length > 0) {
                    q.stylingData.push(mainCat);
                }
            });
        }
        else if (originalQuestion.type === 'styling_list' && originalQuestion.stylingData) {
            q.stylingData = originalQuestion.stylingData;
        }
        
        newQuestions.push(q);
    });

    if (hasError) return;
    newQuestions.sort((a, b) => a.id - b.id);
    const finalJsonData = { questions: newQuestions, productList: newProductList };
    
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="fideQuestionsData"');
        await pbInstance.collection('ayarlar').update(record.id, { deger: finalJsonData });
        if (reloadPage) { alert("Değişiklikler kaydedildi. Sayfa yenileniyor."); window.location.reload(); }
    } catch (error) {
        if (error.status === 404) {
            await pbInstance.collection('ayarlar').create({ anahtar: 'fideQuestionsData', deger: finalJsonData });
            if (reloadPage) { alert("Değişiklikler kaydedildi. Sayfa yenileniyor."); window.location.reload(); }
        } else { console.error("Kaydederken hata oluştu:", error); }
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

function openScenarioSystem(){ document.getElementById('scenario-system-overlay').style.display='flex'; document.querySelector('.scenario-selection').style.display='flex'; document.querySelectorAll('.scenario-form').forEach(f=>f.style.display='none'); document.getElementById('scenario-old-id').value=''; document.getElementById('scenario-new-id').value=''; document.getElementById('scenario-delete-id').value=''; previewQuestionForDelete(); }
function closeScenarioSystem(){ document.getElementById('scenario-system-overlay').style.display='none'; }
function selectScenario(s){ document.querySelector('.scenario-selection').style.display='none'; if(s==='id-change'){document.getElementById('scenario-id-change-form').style.display='block';}else if(s==='delete-question'){document.getElementById('scenario-delete-question-form').style.display='block';} }
function previewQuestionForDelete(){ const id=document.getElementById('scenario-delete-id').value; const p=document.getElementById('scenario-delete-preview'); const b=document.getElementById('apply-delete-question-btn'); if(!id){p.innerHTML="Lütfen silmek istediğiniz sorunun ID'sini girin.";b.disabled=true;return;} const q=fideQuestions.find(q=>String(q.id)===String(id)); if(q){p.innerHTML=`<b>Silinecek Soru:</b> "${q.title.substring(0,45)}..."`; b.disabled=false;}else{p.innerHTML=`"${id}" ID'li soru bulunamadı.`; b.disabled=true;} }
function renderMigrationManagerUI(){ const c=document.getElementById('migration-list-container'); c.innerHTML=''; if(Object.keys(migrationMap).length===0){c.innerHTML='<li class="empty-message">Henüz yönlendirme eklenmemiş.</li>';}else{for(const o in migrationMap){const n=migrationMap[o]; const li=document.createElement('li');li.innerHTML=`<span class="mapping-text">Eski ID: <b>${o}</b> <i class="fas fa-long-arrow-alt-right"></i> Yeni ID: <b>${n}</b></span><button class="btn-danger btn-sm btn-delete-mapping" data-old-id="${o}" title="Bu yönlendirmeyi sil."><i class="fas fa-trash"></i></button>`; c.appendChild(li); li.querySelector('.btn-delete-mapping').addEventListener('click', (e) => deleteMigrationMapping(e.currentTarget.dataset.oldId));}}}
function formatText(b,c){ const e=b.closest('.manager-item').querySelector('.editable-textarea'); e.focus(); if(c==='link'){ const s=window.getSelection(); if(!s.rangeCount)return; const a=s.anchorNode; const l=a.nodeType===3?a.parentNode.closest('a'):a.closest('a'); if(l){const u=l.getAttribute('href'); const n=prompt("Köprüyü düzenle:",u); if(n===null)return; if(n==="")l.outerHTML=l.innerHTML; else l.href=n;}else{if(s.toString().length===0){alert("Lütfen metin seçin.");return;} const u=prompt("URL girin:","https://"); if(u){document.execCommand('createLink',false,u); const n=s.anchorNode.parentNode.closest('a'); if(n)n.target='_blank';}}}else{document.execCommand(c,false,null);} }
function renderQuestionManager(){ const m=document.getElementById('manager-list'); if(!m)return; m.innerHTML=''; fideQuestions.sort((a,b)=>a.id-b.id).forEach(q=>{const d=document.createElement('div'); d.className='manager-item'; d.dataset.id=q.id; let s=(q.staticItems||[]).join('<br>'); 
    const t=['standard','product_list','pop_system', 'styling_list']; 
    const o=t.map(t=>`<option value="${t}" ${q.type===t?'selected':''}>${t}</option>`).join(''); const a=q.answerType||'variable'; const an=`<option value="variable" ${a==='variable'?'selected':''}>Değişken</option><option value="fixed" ${a==='fixed'?'selected':''}>Sabit</option>`; const i=q.isArchived?'checked':''; const w=q.wantsStoreEmail?'checked':''; d.innerHTML=`<div class="manager-item-grid"><div><label>Soru ID</label><input type="number" class="manager-id-input" value="${q.id}" disabled></div><div><label>Soru Başlığı</label><input type="text" class="question-title-input" value="${q.title}"></div><div><label>Soru Tipi</label><select class="question-type-select">${o}</select></div><div><label>Cevap Tipi</label><select class="answer-type-select">${an}</select></div><div class="manager-grid-switch-group"><div class="archive-switch-container"><label>E-posta Ekle</label><label class="switch"><input type="checkbox" class="wants-email-checkbox" ${w}><span class="slider green"></span></label></div><div class="archive-switch-container"><label>Arşivle</label><label class="switch"><input type="checkbox" class="archive-checkbox" ${i}><span class="slider"></span></label></div></div></div><div><label>Statik Maddeler</label><div class="editor-toolbar"><button data-command="bold"><i class="fas fa-bold"></i></button><button data-command="italic"><i class="fas fa-italic"></i></button><button data-command="underline"><i class="fas fa-underline"></i></button><button data-command="link"><i class="fas fa-link"></i></button></div><div class="editable-textarea" contenteditable="true">${s}</div></div><div class="special-manager-container"></div><div class="manager-item-footer"><button class="btn-warning btn-sm btn-clear-answers" data-qid="${q.id}"><i class="fas fa-eraser"></i>Cevapları Temizle</button></div>`; m.appendChild(d); d.querySelector('.question-type-select').addEventListener('change', (e) => toggleSpecialManagerUI(e.currentTarget)); d.querySelector('.archive-checkbox').addEventListener('change', filterManagerView); d.querySelector('.btn-clear-answers').addEventListener('click', (e) => deleteAllAnswersForQuestion(e.currentTarget.dataset.qid)); d.querySelectorAll('.editor-toolbar button').forEach(btn => { btn.addEventListener('click', (e) => formatText(e.currentTarget, e.currentTarget.dataset.command)); }); toggleSpecialManagerUI(d.querySelector('.question-type-select'));}); filterManagerView();}
function toggleSpecialManagerUI(s){ const m=s.closest('.manager-item'); const c=m.querySelector('.special-manager-container'); const q=fideQuestions.find(q=>String(q.id)===m.dataset.id)||{}; c.innerHTML=''; if(s.value==='product_list'){c.classList.add('product-list-manager');renderProductManagerUI(c);}else if(s.value==='pop_system'){c.classList.add('pop-manager-container');renderPopManagerUI(c,q);}
    else if(s.value==='styling_list'){c.classList.add('styling-list-manager-container');renderStylingListManagerUI(c,q);}
else{c.className='special-manager-container';}}
function renderPopManagerUI(c,d){ const p=(d.popCodes||[]).join(', '); const e=(d.expiredCodes||[]).join(', '); const t=(d.popEmailTo||[]).join(', '); const cc=(d.popEmailCc||[]).join(', '); c.innerHTML=`<p class="pop-manager-info"><i class="fas fa-info-circle"></i> Kodları ve e-posta adreslerini aralarına virgül (,) koyarak girin.</p><div class="pop-manager-grid"><div class="pop-manager-group"><label>Geçerli POP Kodları</label><textarea class="pop-codes-input" rows="5">${p}</textarea></div><div class="pop-manager-group"><label>Süresi Dolmuş POP Kodları</label><textarea class="expired-pop-codes-input" rows="5">${e}</textarea></div><div class="pop-manager-group"><label>POP E-posta Alıcıları (Kime)</label><textarea class="pop-email-to-input" rows="5" placeholder="ornek1@mail.com...">${t}</textarea></div><div class="pop-manager-group"><label>POP E-posta Alıcıları (CC)</label><textarea class="pop-email-cc-input" rows="5" placeholder="ornek2@mail.com...">${cc}</textarea></div></div>`;}

// --- GÜNCELLENDİ: STYLING LIST YÖNETİMİ VE EXCEL YÜKLEME FONKSİYONLARI ---

/**
 * Styling Listesi Yöneticisi'nin ana arayüzünü oluşturur.
 * (EXCEL YÜKLEME SİHİRBAZI)
 */
function renderStylingListManagerUI(container, questionData) {
    // Benzersiz ID oluştur (birden fazla soru yöneticisi aynı anda açık olabilir diye)
    const fileInputId = `styling-file-input-${container.closest('.manager-item').dataset.id}`;

    container.innerHTML = `
        <h4><i class="fas fa-sitemap"></i> Styling Listesi Yöneticisi</h4>
        <p class="product-manager-info">
            <i class="fas fa-info-circle"></i> 3 katmanlı hiyerarşik yapıyı yönetin veya Excel'den toplu veri yükleyin.
        </p>
        
        <div class="bulk-add-container" style="background: #f0f9ff; border: 1px dashed #007bff; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
            <h5><i class="fas fa-file-excel"></i> Akıllı Toplu Yükleme Sihirbazı (Excel)</h5>
            
            <p class="bulk-add-info" style="font-size: 13px; color: #333; margin-bottom: 10px;">
                <b>1. Adım:</b> Ürünleri içeren Excel dosyasını seçin (.xlsx, .xls).<br>
                <small><i>Dosyanın ilk satırı 'Stant Çeşidi', 'Stok Kodu' gibi başlıkları içermelidir.</i></small>
            </p>
            
            <input type="file" class="bulk-styling-input-file" id="${fileInputId}" accept=".xlsx, .xls">
            <label for="${fileInputId}" class="btn-primary btn-sm btn-file-label">
                <i class="fas fa-file-excel"></i> Excel Dosyası Seç...
            </label>
            <span class="file-name-display" style="margin-left: 10px; font-style: italic; color: #333;"></span>

            <div class="styling-mapping-container" style="display: none; margin-top: 20px; border-top: 2px solid #007bff; padding-top: 15px;">
                <p class="bulk-add-info" style="font-size: 13px; color: #333; font-weight:bold;"><b>2. Adım:</b> Algılanan sütunları doğru alanlarla eşleştirin.</p>
                
                <div class="styling-mapping-grid">
                    <div class="mapping-row">
                        <label>Ana Kategori (Manuel)</label>
                        <input type="text" class="bulk-main-cat-name" placeholder="Tüm ürünler için Ana Kategori (Örn: Vitrin)">
                        <small><i>(VEYA aşağıdaki açılır menüden bir sütun seçin)</i></small>
                    </div>
                    
                    <div class="mapping-row"><label>Ana Kategori Sütunu</label><select class="mapper-select" data-map="mainCategory"><option value="-1">-- Sütun Kullanma (Manuel Gir) --</option></select></div>
                    <div class="mapping-row"><label>Alt Kategori Sütunu</label><select class="mapper-select" data-map="subCategory"><option value="-1">-- Gerekli Alan --</option></select></div>
                    <div class="mapping-row"><label>Stok Kodu Sütunu</label><select class="mapper-select" data-map="code"><option value="-1">-- Gerekli Alan --</option></select></div>
                    <div class="mapping-row"><label>Malzeme İsmi Sütunu</label><select class="mapper-select" data-map="name"><option value="-1">-- Gerekli Alan --</option></select></div>
                    <div class="mapping-row"><label>Adet Sütunu</label><select class="mapper-select" data-map="qty"><option value="-1">-- Gerekli Alan --</option></select></div>
                </div>
                
                <button class="btn-success btn-sm btn-parse-styling" style="margin-top:20px;"><i class="fas fa-magic"></i> Verileri İşle ve Hiyerarşiye Ekle</button>
            </div>
        </div>
        
        <div class="product-manager-actions">
             <button class="btn-primary btn-sm btn-add-main-category">
                <i class="fas fa-plus"></i> Ana Kategori Ekle (Manuel)
            </button>
        </div>
        <div class="styling-list-editor-container"></div>
    `;

    const editor = container.querySelector('.styling-list-editor-container');
    
    // Kayıtlı veriyi yükle
    if (questionData.stylingData && Array.isArray(questionData.stylingData)) {
        questionData.stylingData.forEach(mainCat => {
            addMainCategoryRow(editor, mainCat);
        });
    }

    // Manuel Ekleme Butonu
    container.querySelector('.btn-add-main-category').addEventListener('click', () => {
        addMainCategoryRow(editor, {});
    });

    // "Dosya Seç" inputu
    container.querySelector('.bulk-styling-input-file').addEventListener('change', (e) => {
        handleStylingExcelUpload(e, container);
    });

    // "İşle ve Ekle" butonu
    container.querySelector('.btn-parse-styling').addEventListener('click', () => {
        parseStylingBulkData(container);
    });
}

/**
 * YENİ: Excel dosyasını okur, analiz eder ve `parsedExcelData`'ya kaydeder.
 */
function handleStylingExcelUpload(event, container) {
    const file = event.target.files[0];
    const fileNameDisplay = container.querySelector('.file-name-display');
    if (!file) {
        fileNameDisplay.textContent = '';
        return;
    }

    // Dosya adını ekranda göster
    fileNameDisplay.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = e.target.result;
            // XLSX kütüphanesini (globale yüklendiğini varsayarak) kullan
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            
            // { header: 1 } -> veriyi [["Başlık1", "Başlık2"], ["Veri1", "Veri2"]] formatında array-of-arrays olarak verir.
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

            if (!jsonData || jsonData.length < 2) { // En az 1 başlık + 1 veri satırı olmalı
                alert("Hata: Excel dosyası boş veya geçersiz bir formatta.");
                fileNameDisplay.textContent = "Hata oluştu!";
                return;
            }
            
            parsedExcelData = jsonData; // Veriyi modül değişkenine kaydet
            analyzeExcelData(container, parsedExcelData); // Analiz fonksiyonunu çağır
        
        } catch (error) {
            console.error("Excel okuma hatası:", error);
            alert("Excel dosyası okunurken bir hata oluştu. Dosya şifreli veya bozuk olabilir.");
            fileNameDisplay.textContent = "Hata oluştu!";
        }
    };
    reader.onerror = () => {
        alert("Dosya okunurken bir hata oluştu.");
        fileNameDisplay.textContent = "Hata oluştu!";
    };
    reader.readAsArrayBuffer(file);
}


/**
 * YENİ: Okunan Excel verisinin ilk satırını (başlıklar) analiz eder ve eşleştirme UI'ını doldurur.
 */
function analyzeExcelData(container, data) {
    const headers = data[0]; // İlk satır başlık satırıdır
    
    if (!headers || headers.length < 2) return alert("Sütun başlıkları algılanamadı.");

    const mappingContainer = container.querySelector('.styling-mapping-container');
    const selects = mappingContainer.querySelectorAll('.mapper-select');
    
    selects.forEach(select => {
        // Eski seçenekleri temizle (ilk seçenek hariç)
        while (select.options.length > 1) {
            select.remove(1);
        }
        
        let bestGuessIndex = -1;
        const mapKey = select.dataset.map.toLowerCase();

        headers.forEach((header, index) => {
            if (!header) header = `Sütun ${index + 1}`; // Boş başlıklar için
            const option = new Option(header, index); // Değer (value) olarak sütun index'ini (0, 1, 2...) kullan
            select.add(option);
            
            // Otomatik eşleştirme (tahmin)
            const headerLower = String(header).toLowerCase();
            if (mapKey === 'maincategory' && (headerLower.includes('ana kat') || headerLower.includes('ana_kat'))) bestGuessIndex = index;
            if (mapKey === 'subcategory' && (headerLower.includes('alt kat') || headerLower.includes('stant çeşidi') || headerLower.includes('stand çeşit'))) bestGuessIndex = index;
            if (mapKey === 'code' && (headerLower.includes('stok') || headerLower.includes('kod'))) bestGuessIndex = index;
            if (mapKey === 'name' && (headerLower.includes('isim') || headerLower.includes('malzeme'))) bestGuessIndex = index;
            if (mapKey === 'qty' && (headerLower.includes('adet') || headerLower.includes('qty') || headerLower.includes('miktar'))) bestGuessIndex = index;
        });
        
        select.value = bestGuessIndex; // Tahmini seç
    });
    
    mappingContainer.style.display = 'block'; // Eşleştirme alanını göster
}


/**
 * YENİ: Styling Toplu Veri Ayrıştırma Fonksiyonu
 * Kullanıcının eşleştirmelerine ve `parsedExcelData`'ya göre veriyi işler.
 */
function parseStylingBulkData(container) {
    if (!parsedExcelData) return alert("Hata: Önce bir Excel dosyası yükleyip analiz etmelisiniz.");
    
    const editor = container.querySelector('.styling-list-editor-container');
    
    // 1. Eşleştirmeleri al (değerler artık sütun index'leri)
    const getIndex = (key) => parseInt(container.querySelector(`.mapper-select[data-map="${key}"]`).value, 10);
    const mainCatIndex = getIndex('mainCategory');
    const subCatIndex = getIndex('subCategory');
    const codeIndex = getIndex('code');
    const nameIndex = getIndex('name');
    const qtyIndex = getIndex('qty');
    
    let manualMainCatName = container.querySelector('.bulk-main-cat-name').value.trim();

    // 2. Eşleştirmeleri doğrula
    if (subCatIndex === -1 || codeIndex === -1 || nameIndex === -1 || qtyIndex === -1) {
        return alert("Hata: Lütfen Alt Kategori, Stok Kodu, Malzeme İsmi ve Adet için sütunları eşleştirin.");
    }
    if (mainCatIndex === -1 && !manualMainCatName) {
        return alert("Hata: Lütfen manuel bir 'Ana Kategori Adı' girin VEYA bir 'Ana Kategori Sütunu' seçin.");
    }

    // 3. Veriyi İşle
    const lines = parsedExcelData; // Veri zaten array-of-arrays
    let addedCount = 0;
    
    // Veri yapısı: { "Ana Kat": { "Alt Kat": [ {code, name, qty}, ... ] } }
    const groupedData = {};
    let lastSubCategory = "Tanımsız Alt Kategori";
    let lastMainCategory = manualMainCatName || "Tanımsız Ana Kategori";

    // İlk satırı (başlık) atla
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i]; // Satır zaten bir array
        if (!cols) continue;
        
        // 4. Eşleşen index'lere göre veriyi çek
        const maxIndex = Math.max(mainCatIndex, subCatIndex, codeIndex, nameIndex, qtyIndex);
        if (cols.length <= maxIndex) continue; // Satırda yeterli sütun yoksa atla

        if (mainCatIndex !== -1) {
            const mainCatRaw = cols[mainCatIndex] ? String(cols[mainCatIndex]).trim() : "";
            if (mainCatRaw !== "") lastMainCategory = mainCatRaw; // "Fill Down"
        }
        
        const subCatRaw = cols[subCatIndex] ? String(cols[subCatIndex]).trim() : "";
        if (subCatRaw !== "") lastSubCategory = subCatRaw; // "Fill Down"
        
        const code = cols[codeIndex] ? String(cols[codeIndex]).trim() : "";
        const name = cols[nameIndex] ? String(cols[nameIndex]).trim() : "";
        const qty = (qtyIndex !== -1 && cols[qtyIndex]) ? String(cols[qtyIndex]).trim() : "1";
        
        if (!code || !name) continue; // Kod veya İsim yoksa atla

        // 5. Hiyerarşik yapıyı kur
        if (!groupedData[lastMainCategory]) {
            groupedData[lastMainCategory] = {};
        }
        if (!groupedData[lastMainCategory][lastSubCategory]) {
            groupedData[lastMainCategory][lastSubCategory] = [];
        }
        
        groupedData[lastMainCategory][lastSubCategory].push({ code, name, qty });
        addedCount++;
    }

    if (addedCount === 0) return alert("Hiçbir geçerli ürün bulunamadı. Lütfen veriyi ve eşleştirmeleri kontrol edin.");

    // 6. UI'ya Ekle
    Object.keys(groupedData).forEach(mainName => {
        const subCategoriesArray = Object.keys(groupedData[mainName]).map(subName => {
            return {
                name: subName,
                products: groupedData[mainName][subName]
            };
        });
        
        const mainCatObj = {
            name: mainName,
            subCategories: subCategoriesArray
        };
        
        // UI'ya satır olarak ekle
        addMainCategoryRow(editor, mainCatObj);
    });

    alert(`${addedCount} adet ürün başarıyla hiyerarşiye eklendi!`);
    
    // Sihirbazı sıfırla
    parsedExcelData = null; 
    container.querySelector('.bulk-styling-input-file').value = null;
    container.querySelector('.file-name-display').textContent = '';
    container.querySelector('.styling-mapping-container').style.display = 'none'; 
}


/**
 * Ana Kategori satırı ekler.
 */
function addMainCategoryRow(container, mainCatData) {
    const row = document.createElement('div');
    row.className = 'main-category-row'; 

    row.innerHTML = `
        <div class="category-header category-manager-row">
            <i class="fas fa-grip-vertical drag-handle"></i>
            <i class="fas fa-layer-group category-icon"></i>
            <input type="text" class="main-category-input" placeholder="Ana Kategori Adı (Örn: Vitrinler)" value="${mainCatData.name || ''}">
            <button class="btn-success btn-sm btn-add-sub-category" title="Alt Kategori Ekle"><i class="fas fa-plus"></i> Alt Kategori</button>
            <button class="btn-danger btn-sm btn-remove-row" title="Ana Kategoriyi Sil"><i class="fas fa-trash"></i></button>
        </div>
        <div class="sub-category-container"></div>
    `;
    container.appendChild(row);

    const subCategoryContainer = row.querySelector('.sub-category-container');
    
    if (mainCatData.subCategories && Array.isArray(mainCatData.subCategories)) {
        mainCatData.subCategories.forEach(subCat => {
            addSubCategoryRow(subCategoryContainer, subCat);
        });
    }

    row.querySelector('.btn-add-sub-category').addEventListener('click', () => {
        addSubCategoryRow(subCategoryContainer, {});
    });
    row.querySelector('.btn-remove-row').addEventListener('click', () => {
        if (confirm('Bu ana kategoriyi ve içindeki tüm alt kategorileri/ürünleri silmek istediğinizden emin misiniz?')) {
            row.remove();
        }
    });
}

/**
 * Alt Kategori satırı ekler.
 */
function addSubCategoryRow(container, subCatData) {
    const row = document.createElement('div');
    row.className = 'sub-category-row'; 

    row.innerHTML = `
        <div class="category-header category-manager-row">
            <i class="fas fa-grip-vertical drag-handle"></i>
            <i class="fas fa-folder-open category-icon"></i>
            <input type="text" class="sub-category-input" placeholder="Alt Kategori Adı (Örn: Vitrin Sol)" value="${subCatData.name || ''}">
            <button class="btn-primary btn-sm btn-add-product-styling" title="Ürün Ekle"><i class="fas fa-plus"></i> Ürün</button>
            <button class="btn-danger btn-sm btn-remove-row" title="Alt Kategoriyi Sil"><i class="fas fa-trash"></i></button>
        </div>
        <div class="product-container-styling"></div>
    `;
    container.appendChild(row);

    const productContainer = row.querySelector('.product-container-styling');

    if (subCatData.products && Array.isArray(subCatData.products)) {
        subCatData.products.forEach(product => {
            addProductRowStyling(productContainer, product);
        });
    }

    row.querySelector('.btn-add-product-styling').addEventListener('click', () => {
        addProductRowStyling(productContainer, {});
    });
    row.querySelector('.btn-remove-row').addEventListener('click', () => {
        if (confirm('Bu alt kategoriyi ve içindeki tüm ürünleri silmek istediğinizden emin misiniz?')) {
            row.remove();
        }
    });
}

/**
 * Styling ürünü satırı ekler.
 */
function addProductRowStyling(container, productData) {
    const row = document.createElement('div');
    row.className = 'product-row-styling product-manager-row';
    
    row.innerHTML = `
        <i class="fas fa-grip-vertical drag-handle"></i>
        <input type="text" class="product-code-styling" placeholder="Ürün Kodu" value="${productData.code || ''}">
        <input type="text" class="product-name-styling" placeholder="Ürün Adı" value="${productData.name || ''}">
        <input type="number" class="product-qty-styling" placeholder="Adet" value="${productData.qty || '1'}">
        <button class="btn-danger btn-sm btn-remove-row" title="Ürünü Sil"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(row);

    row.querySelector('.btn-remove-row').addEventListener('click', () => {
        row.remove();
    });
}

// --- Diğer Fonksiyonlar (Değişmedi) ---

function renderProductManagerUI(c){ const cats=productList.filter(p=>p.type==='header'); let opts='<option value="__end">Ana Liste (Sona Ekle)</option>'; cats.forEach(cat=>{opts+=`<option value="${cat.name}">${cat.name}</option>`;}); c.innerHTML=`<h4><i class="fas fa-boxes"></i> Ürün Listesi Yöneticisi</h4><p class="product-manager-info"><i class="fas fa-info-circle"></i> Bu liste tüm "product_list" tipi sorular için ortaktır.</p><div class="bulk-add-container"><h5><i class="fas fa-paste"></i> Toplu Ürün Ekle</h5><p class="bulk-add-info">Her satıra bir ürün gelecek şekilde yapıştırın. (Örn: 123456 Enerji Etiketi)</p><div class="bulk-add-controls"><select id="bulk-add-category-select">${opts}</select><textarea id="bulk-product-input"></textarea></div><button class="btn-success btn-sm" id="btn-parse-products"><i class="fas fa-plus-circle"></i> Yapıştırılanları Ekle</button></div><button id="toggle-detailed-editor-btn" class="btn-sm"><i class="fas fa-edit"></i> Detaylı Editörü Göster</button><div id="detailed-editor-panel"><div class="product-manager-actions"><button class="btn-primary btn-sm" id="btn-add-category-row"><i class="fas fa-tags"></i> Kategori Ekle</button><button class="btn-success btn-sm" id="btn-add-product-row"><i class="fas fa-box"></i> Ürün Ekle</button></div><div class="product-list-editor"></div></div>`; const e=c.querySelector('.product-list-editor'); c.querySelector('#btn-parse-products').addEventListener('click', parseAndAddProducts); c.querySelector('#toggle-detailed-editor-btn').addEventListener('click', (e_btn) => toggleDetailedEditor(e_btn.currentTarget)); const panel = c.querySelector('#detailed-editor-panel'); panel.querySelector('#btn-add-category-row').addEventListener('click', () => addCategoryRow(e)); panel.querySelector('#btn-add-product-row').addEventListener('click', () => addProductRow(e)); productList.forEach(i=>{if(i.type==='header'){addCategoryRow(e,i);}else{addProductRow(e,i);}}); setupProductManagerDragDrop(e);}
function toggleDetailedEditor(b){ const p=document.getElementById('detailed-editor-panel'); p.classList.toggle('open'); b.innerHTML=p.classList.contains('open')?'<i class="fas fa-eye-slash"></i> Detaylı Editörü Gizle':'<i class="fas fa-edit"></i> Detaylı Editörü Göster';}
function parseAndAddProducts(){ const c=document.querySelector('.product-list-manager'); if(!c)return; const t=c.querySelector('#bulk-product-input'); const e=c.querySelector('.product-list-editor'); const s=c.querySelector('#bulk-add-category-select'); const catName=s.value; const txt=t.value.trim(); if(!txt)return; const lines=txt.split('\n'); let added=0; let target=null; if(catName!=='__end'){const all=Array.from(e.querySelectorAll('.category-manager-row, .product-manager-row')); const idx=all.findIndex(r=>r.dataset.type==='category'&&r.querySelector('input').value===catName); if(idx>-1){target=all[idx]; for(let i=idx+1;i<all.length;i++){if(all[i].dataset.type==='category')break; target=all[i];}}} lines.forEach(l=>{const tl=l.trim(); if(!tl)return; const si=tl.indexOf(' '); if(si>0){const p={code:tl.substring(0,si).trim(),name:tl.substring(si+1).trim()}; if(p.code&&p.name){const nr=addProductRow(e,p,target); target=nr; added++;}}}); if(added>0){alert(`${added} ürün eklendi!`); t.value=''; if(!document.getElementById('detailed-editor-panel').classList.contains('open')){document.getElementById('toggle-detailed-editor-btn').click();}}else{alert("Hiçbir ürün eklenemedi.");}}
function addCategoryRow(c,cat={},t=null){const r=document.createElement('div');r.className='category-manager-row';r.dataset.type='category';r.draggable=true; r.innerHTML=`<i class="fas fa-grip-vertical drag-handle"></i><i class="fas fa-tag category-icon"></i><input type="text" value="${cat.name||''}"><button class="btn-danger btn-sm btn-remove-row"><i class="fas fa-trash"></i></button>`; if(t){c.insertBefore(r,t.nextSibling);}else{c.appendChild(r);} r.querySelector('.btn-remove-row').addEventListener('click', (e) => e.currentTarget.parentElement.remove()); return r;}
function addProductRow(c,p={},t=null){const r=document.createElement('div');r.className='product-manager-row';r.dataset.type='product';r.draggable=true; r.innerHTML=`<i class="fas fa-grip-vertical drag-handle"></i><input class="product-code" value="${p.code||''}"><input class="product-name" value="${p.name||''}"><button class="btn-danger btn-sm btn-remove-row"><i class="fas fa-trash"></i></button>`; if(t){c.insertBefore(r,t.nextSibling);}else{c.appendChild(r);} r.querySelector('.btn-remove-row').addEventListener('click', (e) => e.currentTarget.parentElement.remove()); return r;}
function setupProductManagerDragDrop(c){let d=null;c.addEventListener('dragstart',e=>{d=e.target;setTimeout(()=>e.target.classList.add('dragging'),0);}); c.addEventListener('dragend',e=>{if(d){d.classList.remove('dragging');d=null;}}); c.addEventListener('dragover',e=>{e.preventDefault();const a=getDragAfterElement(c,e.clientY); const curr=document.querySelector('.dragging'); if(curr){if(a==null){c.appendChild(curr);}else{c.insertBefore(curr,a);}}}); function getDragAfterElement(c,y){const draggables=[...c.querySelectorAll('[draggable="true"]:not(.dragging)')]; return draggables.reduce((closest,child)=>{const box=child.getBoundingClientRect(); const offset=y-box.top-box.height/2; if(offset<0&&offset>closest.offset){return {offset:offset,element:child};}else{return closest;}},{offset:Number.NEGATIVE_INFINITY}).element;}}
function filterManagerView(){ const vA=document.getElementById('view-active-btn'); const vC=document.getElementById('view-archived-btn'); const aN=document.getElementById('add-new-question-btn'); const dC=document.getElementById('delete-all-archived-btn'); const rA=document.getElementById('restore-all-archived-btn'); vA.classList.toggle('active',currentManagerView==='active'); vC.classList.toggle('active',currentManagerView==='archived'); aN.style.display=currentManagerView==='active'?'inline-flex':'none'; dC.style.display=currentManagerView==='archived'?'inline-flex':'none'; rA.style.display=currentManagerView==='archived'?'inline-flex':'none'; const i=document.querySelectorAll('#manager-list .manager-item'); let vis=0; i.forEach(item=>{const isA=item.querySelector('.archive-checkbox').checked; const sV=(currentManagerView==='active'&&!isA)||(currentManagerView==='archived'&&isA); item.classList.toggle('hidden-question',!sV); if(sV)vis++;}); if(currentManagerView==='archived'){dC.disabled=vis===0; rA.disabled=vis===0;}}
function addNewQuestionUI(){ if(currentManagerView!=='active'){return;} const m=document.getElementById('manager-list'); const e=Array.from(m.querySelectorAll('.manager-id-input')).map(i=>parseInt(i.value)); const n=e.length>0?Math.max(...e)+1:1; const d=document.createElement('div'); d.className='manager-item'; d.style.backgroundColor='#dcfce7'; d.dataset.id=n; d.innerHTML=`<div class="manager-item-grid"><div><label>Soru ID</label><input type="number" class="manager-id-input" value="${n}"></div><div><label>Soru Başlığı</label><input type="text" class="question-title-input" placeholder="Yeni soru..."></div><div><label>Soru Tipi</label><select class="question-type-select"><option value="standard" selected>standard</option><option value="product_list">product_list</option><option value="pop_system">pop_system</option><option value="styling_list">styling_list</option></select></div><div><label>Cevap Tipi</label><select class="answer-type-select"><option value="variable" selected>Değişken</option><option value="fixed">Sabit</option></select></div><div class="manager-grid-switch-group"><div class="archive-switch-container"><label>E-posta Ekle</label><label class="switch"><input type="checkbox" class="wants-email-checkbox"><span class="slider green"></span></label></div><div class="archive-switch-container"><label>Arşivle</label><label class="switch"><input type="checkbox" class="archive-checkbox"><span class="slider"></span></label></div></div></div><div><label>Statik Maddeler</label><div class="editor-toolbar">...</div><div class="editable-textarea" contenteditable="true"></div></div><div class="special-manager-container"></div><div class="manager-item-footer"><button class="btn-sm btn-cancel-new-question"><i class="fas fa-times"></i> İptal</button></div>`; m.appendChild(d); d.querySelector('.question-type-select').addEventListener('change', (e_select) => toggleSpecialManagerUI(e_select.currentTarget)); d.querySelector('.archive-checkbox').addEventListener('change', filterManagerView); d.querySelector('.btn-cancel-new-question').addEventListener('click', (e_btn) => e_btn.currentTarget.closest('.manager-item').remove()); d.querySelector('input[type="text"]').focus();}
function restoreAllArchivedQuestions(){ const i=document.querySelectorAll('#manager-list .manager-item:not(.hidden-question)'); if(i.length===0)return; if(confirm(`Arşivdeki ${i.length} sorunun tümünü aktif hale getirmek ister misiniz?`)){i.forEach(item=>{item.querySelector('.archive-checkbox').checked=false;}); filterManagerView(); alert("Arşivdeki sorular aktifleştirildi. Kaydetmeyi unutmayın.");}}
function deleteAllArchivedQuestions(){ const i=document.querySelectorAll('#manager-list .manager-item:not(.hidden-question)'); if(i.length===0)return; if(confirm(`Arşivdeki ${i.length} sorunun tümünü kalıcı olarak silmek istediğinizden emin misiniz?`)){i.forEach(item=>{item.style.opacity='0';setTimeout(()=>{item.classList.add('to-be-deleted');item.style.display='none';},500);}); document.getElementById('delete-all-archived-btn').disabled = true; alert("Arşivdeki sorular silinmek üzere işaretlendi. Kaydetmeyi unutmayın.");}}