// --- Kapsüllenmiş Global Değişkenler ---
let fideQuestions = [], productList = [], stylingData = [], migrationMap = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
let currentManagerView = 'active'; 
let pbInstance = null; 

// --- MODÜL BAŞLATMA FONKSİYONU ---
export async function initializeSoruYoneticisiModule(pb) {
    pbInstance = pb;
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
        if (error.status !== 404) console.error("Buluttan yönlendirme kuralları yüklenemedi:", error);
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
        stylingData = cloudData.stylingData || []; // YENİ: Styling verisini yükle
        questionsLoaded = true;
    } catch (error) {
        if (error.status !== 404) {
            console.error("PocketBase'den soru verisi okunurken hata oluştu:", error);
            alert("Soru listesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.");
        }
    }
    
    if (!questionsLoaded) fideQuestions = fallbackFideQuestions;
}

function setupModuleEventListeners() {
    const listenerKey = 'soruYoneticisiListenersAttached';
    if (document.body.dataset[listenerKey]) return;
    document.body.dataset[listenerKey] = 'true';

    document.getElementById('view-active-btn').addEventListener('click', () => { currentManagerView = 'active'; filterManagerView(); });
    document.getElementById('view-archived-btn').addEventListener('click', () => { currentManagerView = 'archived'; filterManagerView(); });
    document.getElementById('add-new-question-btn').addEventListener('click', addNewQuestionUI);
    document.getElementById('save-questions-btn').addEventListener('click', () => saveQuestions(true));
    document.getElementById('delete-all-archived-btn').addEventListener('click', deleteAllArchivedQuestions);
    document.getElementById('restore-all-archived-btn').addEventListener('click', restoreAllArchivedQuestions);
    
    document.getElementById('unlock-ids-btn').addEventListener('click', () => {
        const dogruSifreHash = 'ZmRlMDAx'; 
        const girilenSifre = prompt("ID alanlarını düzenlemeye açmak için lütfen yönetici şifresini tekrar girin:");
        if (girilenSifre && btoa(girilenSifre) === dogruSifreHash) {
            document.querySelectorAll('.manager-id-input').forEach(input => input.disabled = false);
            const unlockBtn = document.getElementById('unlock-ids-btn');
            unlockBtn.disabled = true;
            unlockBtn.innerHTML = '<i class="fas fa-lock-open"></i> ID Alanları Düzenlenebilir';
            alert('Soru ID alanları artık düzenlenebilir.');
        } else if(girilenSifre) alert('Hatalı şifre!');
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
    document.querySelectorAll('.scenario-btn').forEach(btn => btn.addEventListener('click', (e) => selectScenario(e.currentTarget.dataset.scenario)));
    document.getElementById('apply-id-change-btn').addEventListener('click', applyIdChangeScenario);
    document.getElementById('scenario-delete-id').addEventListener('input', previewQuestionForDelete);
    document.getElementById('apply-delete-question-btn').addEventListener('click', applyDeleteQuestionScenario);
}

async function updateAllReports(updateFunction) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        if (!pbInstance || !pbInstance.authStore.isValid) { alert("Bu işlem için bulut bağlantısı gereklidir."); return false; }
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
        if (updatePromises.length > 0) await Promise.all(updatePromises);
        return true;
    } catch (error) {
        console.error("Toplu rapor güncelleme hatası:", error);
        alert("Kritik Hata: Raporlardaki veriler güncellenemedi.");
        return false;
    } finally { loadingOverlay.style.display = 'none'; }
}

async function applyIdChangeScenario() {
    const oldId = document.getElementById('scenario-old-id').value.trim();
    const newId = document.getElementById('scenario-new-id').value.trim();
    if (!oldId || !newId || oldId === newId) { alert("Lütfen geçerli ve birbirinden farklı ID'ler girin."); return; }

    const questionToMove = fideQuestions.find(q => String(q.id) === String(oldId));
    if (!questionToMove) { alert(`HATA: "${oldId}" ID'li bir soru bulunamadı.`); return; }

    const targetQuestion = fideQuestions.find(q => String(q.id) === String(newId));
    if (!targetQuestion) {
        if (!confirm(`Bu işlem, ${oldId} ID'li soruyu ${newId} olarak güncelleyecek. Devam?`)) return;
        const success = await updateAllReports(sd => { if (sd && sd[oldId]) { sd[newId] = sd[oldId]; delete sd[oldId]; } return sd; });
        if (success) {
            questionToMove.id = parseInt(newId, 10);
            addMigrationMapping(oldId, newId);
            alert("Başarılı! 'Kaydet' butonuna basmayı unutmayın.");
        }
    } else {
        if (!confirm(`"${newId}" ID'si dolu. ID'leri ve cevapları DEĞİŞTİRMEK istiyor musunuz?`)) return;
        const success = await updateAllReports(sd => { if (sd) { [sd[oldId], sd[newId]] = [sd[newId] || null, sd[oldId] || null]; } return sd; });
        if (success) {
            questionToMove.id = parseInt(newId, 10);
            targetQuestion.id = parseInt(oldId, 10);
            delete migrationMap[oldId]; delete migrationMap[newId];
            await saveMigrationMap();
            alert("Başarılı! 'Kaydet' butonuna basmayı unutmayın.");
        }
    }
    renderQuestionManager();
    closeScenarioSystem();
}

async function applyDeleteQuestionScenario() {
    const qid = document.getElementById('scenario-delete-id').value;
    if (!qid) { alert("Soru ID girin."); return; }
    const question = fideQuestions.find(q => String(q.id) === String(qid));
    if (!question) { alert(`HATA: "${qid}" bulunamadı.`); return; }
    if (!confirm(`DİKKAT! ${question.id} sorusu ve TÜM cevapları silinecek. Emin misiniz?`)) return;
    const success = await updateAllReports(sd => { if (sd && sd[qid]) delete sd[qid]; return sd; });
    if (success) {
        fideQuestions = fideQuestions.filter(q => String(q.id) !== String(qid));
        await saveQuestions(false);
        alert("Soru silindi. Sayfa yenileniyor.");
        window.location.reload();
    }
}

async function deleteAllAnswersForQuestion(questionId) {
    if (!confirm(`FiDe ${questionId} sorusuna ait TÜM cevapları silmek istediğinizden emin misiniz?`)) return;
    const success = await updateAllReports(sd => { if (sd && sd[questionId]) delete sd[questionId]; return sd; });
    if (success) alert(`FiDe ${questionId} cevapları silindi.`);
}

async function addMigrationMapping(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;
    migrationMap[oldId] = newId;
    await saveMigrationMap();
}

async function deleteMigrationMapping(oldId) {
    if (confirm(`'${oldId}' yönlendirmesini silmek istiyor musunuz?`)) {
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
        if (error.status === 404) await pbInstance.collection('ayarlar').create({ anahtar: 'migrationMap', deger: migrationMap });
        else console.error("Yönlendirme kaydedilemedi:", error);
    }
}

async function saveQuestions(reloadPage = true) {
    if (!pbInstance || !pbInstance.authStore.isValid) { alert("Kaydetmek için giriş yapın."); return; }
    
    // Product List Verisini Topla
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

    // Styling List Verisi zaten 'stylingData' global değişkeninde tutuluyor (Render sırasında güncelleniyor)

    const newQuestions = [];
    const ids = new Set();
    let hasError = false;
    document.querySelectorAll('#manager-list .manager-item:not(.to-be-deleted)').forEach(item => {
        const id = parseInt(item.querySelector('.manager-id-input').value);
        const title = item.querySelector('.question-title-input').value.trim();
        if (hasError) return;
        if (!id || !title) { hasError = true; return alert(`ID veya Başlık boş olamaz.`); }
        if (ids.has(id)) { hasError = true; return alert(`HATA: ${id} ID'si mükerrer.`); }
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
        newQuestions.push(q);
    });

    if (hasError) return;
    newQuestions.sort((a, b) => a.id - b.id);
    const finalJsonData = { questions: newQuestions, productList: newProductList, stylingData: stylingData };
    
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
        } else console.error("Kaydederken hata oluştu:", error);
    } finally { loadingOverlay.style.display = 'none'; }
}

function openScenarioSystem(){ document.getElementById('scenario-system-overlay').style.display='flex'; document.querySelector('.scenario-selection').style.display='flex'; document.querySelectorAll('.scenario-form').forEach(f=>f.style.display='none'); document.getElementById('scenario-old-id').value=''; document.getElementById('scenario-new-id').value=''; document.getElementById('scenario-delete-id').value=''; previewQuestionForDelete(); }
function closeScenarioSystem(){ document.getElementById('scenario-system-overlay').style.display='none'; }
function selectScenario(s){ document.querySelector('.scenario-selection').style.display='none'; if(s==='id-change'){document.getElementById('scenario-id-change-form').style.display='block';}else if(s==='delete-question'){document.getElementById('scenario-delete-question-form').style.display='block';} }
function previewQuestionForDelete(){ const id=document.getElementById('scenario-delete-id').value; const p=document.getElementById('scenario-delete-preview'); const b=document.getElementById('apply-delete-question-btn'); if(!id){p.innerHTML="Silinecek ID girin.";b.disabled=true;return;} const q=fideQuestions.find(q=>String(q.id)===String(id)); if(q){p.innerHTML=`<b>Silinecek:</b> "${q.title.substring(0,45)}..."`; b.disabled=false;}else{p.innerHTML=`Bulunamadı.`; b.disabled=true;} }
function renderMigrationManagerUI(){ const c=document.getElementById('migration-list-container'); c.innerHTML=''; if(Object.keys(migrationMap).length===0){c.innerHTML='<li class="empty-message">Yönlendirme yok.</li>';}else{for(const o in migrationMap){const n=migrationMap[o]; const li=document.createElement('li');li.innerHTML=`<span class="mapping-text">Eski: <b>${o}</b> <i class="fas fa-long-arrow-alt-right"></i> Yeni: <b>${n}</b></span><button class="btn-danger btn-sm btn-delete-mapping" data-old-id="${o}"><i class="fas fa-trash"></i></button>`; c.appendChild(li); li.querySelector('.btn-delete-mapping').addEventListener('click', (e) => deleteMigrationMapping(e.currentTarget.dataset.oldId));}}}
function formatText(b,c){ const e=b.closest('.manager-item').querySelector('.editable-textarea'); e.focus(); if(c==='link'){ const s=window.getSelection(); if(!s.rangeCount)return; const a=s.anchorNode.closest('a'); if(a){const u=a.getAttribute('href'); const n=prompt("Köprüyü düzenle:",u); if(n===null)return; if(n==="")a.outerHTML=a.innerHTML; else a.href=n;}else{if(s.toString().length===0){alert("Metin seçin.");return;} const u=prompt("URL girin:","https://"); if(u){document.execCommand('createLink',false,u); const n=s.anchorNode.parentNode.closest('a'); if(n)n.target='_blank';}}}else{document.execCommand(c,false,null);} }

function renderQuestionManager(){ 
    const m=document.getElementById('manager-list'); if(!m)return; m.innerHTML=''; 
    fideQuestions.sort((a,b)=>a.id-b.id).forEach(q=>{
        const d=document.createElement('div'); d.className='manager-item'; d.dataset.id=q.id; 
        let s=(q.staticItems||[]).join('<br>'); 
        // Styling list tipi eklendi
        const types=['standard','product_list','pop_system','styling_list']; 
        const o=types.map(t=>`<option value="${t}" ${q.type===t?'selected':''}>${t}</option>`).join(''); 
        const a=q.answerType||'variable'; 
        const an=`<option value="variable" ${a==='variable'?'selected':''}>Değişken</option><option value="fixed" ${a==='fixed'?'selected':''}>Sabit</option>`; 
        const i=q.isArchived?'checked':''; const w=q.wantsStoreEmail?'checked':''; 
        
        d.innerHTML=`<div class="manager-item-grid"><div><label>Soru ID</label><input type="number" class="manager-id-input" value="${q.id}" disabled></div><div><label>Soru Başlığı</label><input type="text" class="question-title-input" value="${q.title}"></div><div><label>Soru Tipi</label><select class="question-type-select">${o}</select></div><div><label>Cevap Tipi</label><select class="answer-type-select">${an}</select></div><div class="manager-grid-switch-group"><div class="archive-switch-container"><label>E-posta Ekle</label><label class="switch"><input type="checkbox" class="wants-email-checkbox" ${w}><span class="slider green"></span></label></div><div class="archive-switch-container"><label>Arşivle</label><label class="switch"><input type="checkbox" class="archive-checkbox" ${i}><span class="slider"></span></label></div></div></div><div><label>Statik Maddeler</label><div class="editor-toolbar"><button data-command="bold"><i class="fas fa-bold"></i></button><button data-command="italic"><i class="fas fa-italic"></i></button><button data-command="underline"><i class="fas fa-underline"></i></button><button data-command="link"><i class="fas fa-link"></i></button></div><div class="editable-textarea" contenteditable="true">${s}</div></div><div class="special-manager-container"></div><div class="manager-item-footer"><button class="btn-warning btn-sm btn-clear-answers" data-qid="${q.id}"><i class="fas fa-eraser"></i>Cevapları Temizle</button></div>`; 
        m.appendChild(d); 
        
        d.querySelector('.question-type-select').addEventListener('change', (e) => toggleSpecialManagerUI(e.currentTarget)); 
        d.querySelector('.archive-checkbox').addEventListener('change', filterManagerView); 
        d.querySelector('.btn-clear-answers').addEventListener('click', (e) => deleteAllAnswersForQuestion(e.currentTarget.dataset.qid)); 
        d.querySelectorAll('.editor-toolbar button').forEach(btn => { btn.addEventListener('click', (e) => formatText(e.currentTarget, e.currentTarget.dataset.command)); }); 
        toggleSpecialManagerUI(d.querySelector('.question-type-select'));
    }); 
    filterManagerView();
}

function toggleSpecialManagerUI(s){ 
    const m=s.closest('.manager-item'); const c=m.querySelector('.special-manager-container'); 
    const q=fideQuestions.find(q=>String(q.id)===m.dataset.id)||{}; c.innerHTML=''; 
    c.className='special-manager-container';
    if(s.value==='product_list'){c.classList.add('product-list-manager');renderProductManagerUI(c);}
    else if(s.value==='pop_system'){c.classList.add('pop-manager-container');renderPopManagerUI(c,q);}
    else if(s.value==='styling_list'){c.classList.add('styling-manager-container');renderStylingManagerUI(c);}
}

// --- YENİ: Styling List Yöneticisi (İç İçe Ağaç Yapısı) ---
function renderStylingManagerUI(container) {
    container.innerHTML = `
        <div class="styling-manager-wrapper">
            <h4><i class="fas fa-sitemap"></i> Styling Listesi Yöneticisi (Ana > Alt > Ürün)</h4>
            <p class="product-manager-info"><i class="fas fa-info-circle"></i> Değişiklikler anlık olarak hafızaya alınır, "Kaydet" butonuna basınca buluta yazılır.</p>
            <div id="styling-tree-root"></div>
            <button class="btn-primary btn-sm" style="margin-top:10px;" id="btn-add-main-cat"><i class="fas fa-folder-plus"></i> Ana Kategori Ekle</button>
        </div>
    `;
    
    const root = container.querySelector('#styling-tree-root');
    const btnAddMain = container.querySelector('#btn-add-main-cat');
    
    function renderTree() {
        root.innerHTML = '';
        stylingData.forEach((mainCat, mIdx) => {
            const mainDiv = document.createElement('div');
            mainDiv.className = 'styling-main-cat';
            mainDiv.innerHTML = `
                <div class="styling-main-cat-header">
                    <i class="fas fa-folder-open"></i>
                    <input type="text" class="form-control" value="${mainCat.name}" placeholder="Ana Kategori Adı (Örn: Vitrinler)" style="flex-grow:1; border:none; padding:5px;">
                    <button class="btn-danger btn-sm btn-del-main"><i class="fas fa-trash"></i></button>
                </div>
                <div class="styling-sub-cat-container"></div>
                <button class="btn-success btn-sm styling-btn-add btn-add-sub" style="margin:0 0 10px 10px;"><i class="fas fa-plus"></i> Alt Kategori Ekle</button>
            `;
            
            // Ana Kategori Adı Güncelleme
            mainDiv.querySelector('input').addEventListener('input', (e) => { stylingData[mIdx].name = e.target.value; });
            // Ana Kategori Silme
            mainDiv.querySelector('.btn-del-main').addEventListener('click', () => { 
                if(confirm('Bu ana kategoriyi ve içindekileri silmek istediğinize emin misiniz?')) {
                    stylingData.splice(mIdx, 1); renderTree(); 
                }
            });
            // Alt Kategori Ekleme
            mainDiv.querySelector('.btn-add-sub').addEventListener('click', () => {
                if(!mainCat.subCats) mainCat.subCats = [];
                mainCat.subCats.push({ id: Date.now().toString(), name: '', products: [] });
                renderTree();
            });

            const subContainer = mainDiv.querySelector('.styling-sub-cat-container');
            (mainCat.subCats || []).forEach((subCat, sIdx) => {
                const subDiv = document.createElement('div');
                subDiv.className = 'styling-sub-cat';
                subDiv.innerHTML = `
                    <div class="styling-sub-cat-header">
                        <i class="fas fa-code-branch"></i>
                        <input type="text" value="${subCat.name}" placeholder="Alt Kategori Adı (Örn: Vitrin Sol)" style="flex-grow:1; border:1px solid #ddd; padding:5px;">
                        <button class="btn-danger btn-sm btn-del-sub"><i class="fas fa-trash"></i></button>
                    </div>
                    <div class="styling-product-list"></div>
                    <button class="btn-primary btn-sm styling-btn-add btn-add-prod"><i class="fas fa-box"></i> Ürün Ekle</button>
                `;
                
                // Alt Kategori Adı Güncelleme
                subDiv.querySelector('input').addEventListener('input', (e) => { stylingData[mIdx].subCats[sIdx].name = e.target.value; });
                // Alt Kategori Silme
                subDiv.querySelector('.btn-del-sub').addEventListener('click', () => {
                    stylingData[mIdx].subCats.splice(sIdx, 1); renderTree();
                });
                // Ürün Ekleme
                subDiv.querySelector('.btn-add-prod').addEventListener('click', () => {
                    if(!subCat.products) subCat.products = [];
                    subCat.products.push({ code: '', name: '' });
                    renderTree();
                });

                const prodList = subDiv.querySelector('.styling-product-list');
                (subCat.products || []).forEach((prod, pIdx) => {
                    const prodRow = document.createElement('div');
                    prodRow.className = 'styling-product-row';
                    prodRow.innerHTML = `
                        <input type="text" placeholder="Kod" value="${prod.code}" class="prod-code full-width">
                        <input type="text" placeholder="Ürün Adı" value="${prod.name}" class="prod-name full-width">
                        <button class="btn-danger btn-sm btn-del-prod"><i class="fas fa-times"></i></button>
                    `;
                    prodRow.querySelector('.prod-code').addEventListener('input', (e) => { stylingData[mIdx].subCats[sIdx].products[pIdx].code = e.target.value; });
                    prodRow.querySelector('.prod-name').addEventListener('input', (e) => { stylingData[mIdx].subCats[sIdx].products[pIdx].name = e.target.value; });
                    prodRow.querySelector('.btn-del-prod').addEventListener('click', () => {
                        stylingData[mIdx].subCats[sIdx].products.splice(pIdx, 1); renderTree();
                    });
                    prodList.appendChild(prodRow);
                });

                subContainer.appendChild(subDiv);
            });
            
            root.appendChild(mainDiv);
        });
    }

    btnAddMain.addEventListener('click', () => {
        stylingData.push({ id: Date.now().toString(), name: '', subCats: [] });
        renderTree();
    });

    renderTree();
}

function renderPopManagerUI(c,d){ const p=(d.popCodes||[]).join(', '); const e=(d.expiredCodes||[]).join(', '); const t=(d.popEmailTo||[]).join(', '); const cc=(d.popEmailCc||[]).join(', '); c.innerHTML=`<p class="pop-manager-info"><i class="fas fa-info-circle"></i> Kodları ve e-posta adreslerini aralarına virgül (,) koyarak girin.</p><div class="pop-manager-grid"><div class="pop-manager-group"><label>Geçerli POP Kodları</label><textarea class="pop-codes-input" rows="5">${p}</textarea></div><div class="pop-manager-group"><label>Süresi Dolmuş POP Kodları</label><textarea class="expired-pop-codes-input" rows="5">${e}</textarea></div><div class="pop-manager-group"><label>POP E-posta Alıcıları (Kime)</label><textarea class="pop-email-to-input" rows="5" placeholder="ornek1@mail.com...">${t}</textarea></div><div class="pop-manager-group"><label>POP E-posta Alıcıları (CC)</label><textarea class="pop-email-cc-input" rows="5" placeholder="ornek2@mail.com...">${cc}</textarea></div></div>`;}
function renderProductManagerUI(c){ const cats=productList.filter(p=>p.type==='header'); let opts='<option value="__end">Ana Liste (Sona Ekle)</option>'; cats.forEach(cat=>{opts+=`<option value="${cat.name}">${cat.name}</option>`;}); c.innerHTML=`<h4><i class="fas fa-boxes"></i> Ürün Listesi Yöneticisi</h4><p class="product-manager-info"><i class="fas fa-info-circle"></i> Bu liste tüm "product_list" tipi sorular için ortaktır.</p><div class="bulk-add-container"><h5><i class="fas fa-paste"></i> Toplu Ürün Ekle</h5><p class="bulk-add-info">Her satıra bir ürün gelecek şekilde yapıştırın. (Örn: 123456 Enerji Etiketi)</p><div class="bulk-add-controls"><select id="bulk-add-category-select">${opts}</select><textarea id="bulk-product-input"></textarea></div><button class="btn-success btn-sm" id="btn-parse-products"><i class="fas fa-plus-circle"></i> Yapıştırılanları Ekle</button></div><button id="toggle-detailed-editor-btn" class="btn-sm"><i class="fas fa-edit"></i> Detaylı Editörü Göster</button><div id="detailed-editor-panel"><div class="product-manager-actions"><button class="btn-primary btn-sm" id="btn-add-category-row"><i class="fas fa-tags"></i> Kategori Ekle</button><button class="btn-success btn-sm" id="btn-add-product-row"><i class="fas fa-box"></i> Ürün Ekle</button></div><div class="product-list-editor"></div></div>`; const e=c.querySelector('.product-list-editor'); c.querySelector('#btn-parse-products').addEventListener('click', parseAndAddProducts); c.querySelector('#toggle-detailed-editor-btn').addEventListener('click', (e_btn) => toggleDetailedEditor(e_btn.currentTarget)); const panel = c.querySelector('#detailed-editor-panel'); panel.querySelector('#btn-add-category-row').addEventListener('click', () => addCategoryRow(e)); panel.querySelector('#btn-add-product-row').addEventListener('click', () => addProductRow(e)); productList.forEach(i=>{if(i.type==='header'){addCategoryRow(e,i);}else{addProductRow(e,i);}}); setupProductManagerDragDrop(e);}
function toggleDetailedEditor(b){ const p=document.getElementById('detailed-editor-panel'); p.classList.toggle('open'); b.innerHTML=p.classList.contains('open')?'<i class="fas fa-eye-slash"></i> Detaylı Editörü Gizle':'<i class="fas fa-edit"></i> Detaylı Editörü Göster';}
function parseAndAddProducts(){ const c=document.querySelector('.product-list-manager'); if(!c)return; const t=c.querySelector('#bulk-product-input'); const e=c.querySelector('.product-list-editor'); const s=c.querySelector('#bulk-add-category-select'); const catName=s.value; const txt=t.value.trim(); if(!txt)return; const lines=txt.split('\n'); let added=0; let target=null; if(catName!=='__end'){const all=Array.from(e.querySelectorAll('.category-manager-row, .product-manager-row')); const idx=all.findIndex(r=>r.dataset.type==='category'&&r.querySelector('input').value===catName); if(idx>-1){target=all[idx]; for(let i=idx+1;i<all.length;i++){if(all[i].dataset.type==='category')break; target=all[i];}}} lines.forEach(l=>{const tl=l.trim(); if(!tl)return; const si=tl.indexOf(' '); if(si>0){const p={code:tl.substring(0,si).trim(),name:tl.substring(si+1).trim()}; if(p.code&&p.name){const nr=addProductRow(e,p,target); target=nr; added++;}}}); if(added>0){alert(`${added} ürün eklendi!`); t.value=''; if(!document.getElementById('detailed-editor-panel').classList.contains('open')){document.getElementById('toggle-detailed-editor-btn').click();}}else{alert("Hiçbir ürün eklenemedi.");}}
function addCategoryRow(c,cat={},t=null){const r=document.createElement('div');r.className='category-manager-row';r.dataset.type='category';r.draggable=true; r.innerHTML=`<i class="fas fa-grip-vertical drag-handle"></i><i class="fas fa-tag category-icon"></i><input type="text" value="${cat.name||''}"><button class="btn-danger btn-sm btn-remove-row"><i class="fas fa-trash"></i></button>`; if(t){c.insertBefore(r,t.nextSibling);}else{c.appendChild(r);} r.querySelector('.btn-remove-row').addEventListener('click', (e) => e.currentTarget.parentElement.remove()); return r;}
function addProductRow(c,p={},t=null){const r=document.createElement('div');r.className='product-manager-row';r.dataset.type='product';r.draggable=true; r.innerHTML=`<i class="fas fa-grip-vertical drag-handle"></i><input class="product-code" value="${p.code||''}"><input class="product-name" value="${p.name||''}"><button class="btn-danger btn-sm btn-remove-row"><i class="fas fa-trash"></i></button>`; if(t){c.insertBefore(r,t.nextSibling);}else{c.appendChild(r);} r.querySelector('.btn-remove-row').addEventListener('click', (e) => e.currentTarget.parentElement.remove()); return r;}
function setupProductManagerDragDrop(c){let d=null;c.addEventListener('dragstart',e=>{d=e.target;setTimeout(()=>e.target.classList.add('dragging'),0);}); c.addEventListener('dragend',e=>{if(d){d.classList.remove('dragging');d=null;}}); c.addEventListener('dragover',e=>{e.preventDefault();const a=getDragAfterElement(c,e.clientY); const curr=document.querySelector('.dragging'); if(curr){if(a==null){c.appendChild(curr);}else{c.insertBefore(curr,a);}}}); function getDragAfterElement(c,y){const draggables=[...c.querySelectorAll('[draggable="true"]:not(.dragging)')]; return draggables.reduce((closest,child)=>{const box=child.getBoundingClientRect(); const offset=y-box.top-box.height/2; if(offset<0&&offset>closest.offset){return {offset:offset,element:child};}else{return closest;}},{offset:Number.NEGATIVE_INFINITY}).element;}}
function filterManagerView(){ const vA=document.getElementById('view-active-btn'); const vC=document.getElementById('view-archived-btn'); const aN=document.getElementById('add-new-question-btn'); const dC=document.getElementById('delete-all-archived-btn'); const rA=document.getElementById('restore-all-archived-btn'); vA.classList.toggle('active',currentManagerView==='active'); vC.classList.toggle('active',currentManagerView==='archived'); aN.style.display=currentManagerView==='active'?'inline-flex':'none'; dC.style.display=currentManagerView==='archived'?'inline-flex':'none'; rA.style.display=currentManagerView==='archived'?'inline-flex':'none'; const i=document.querySelectorAll('#manager-list .manager-item'); let vis=0; i.forEach(item=>{const isA=item.querySelector('.archive-checkbox').checked; const sV=(currentManagerView==='active'&&!isA)||(currentManagerView==='archived'&&isA); item.classList.toggle('hidden-question',!sV); if(sV)vis++;}); if(currentManagerView==='archived'){dC.disabled=vis===0; rA.disabled=vis===0;}}
function addNewQuestionUI(){ if(currentManagerView!=='active'){return;} const m=document.getElementById('manager-list'); const e=Array.from(m.querySelectorAll('.manager-id-input')).map(i=>parseInt(i.value)); const n=e.length>0?Math.max(...e)+1:1; const d=document.createElement('div'); d.className='manager-item'; d.style.backgroundColor='#dcfce7'; d.dataset.id=n; d.innerHTML=`<div class="manager-item-grid"><div><label>Soru ID</label><input type="number" class="manager-id-input" value="${n}"></div><div><label>Soru Başlığı</label><input type="text" class="question-title-input" placeholder="Yeni soru..."></div><div><label>Soru Tipi</label><select class="question-type-select"><option value="standard" selected>standard</option><option value="product_list">product_list</option><option value="pop_system">pop_system</option><option value="styling_list">styling_list</option></select></div><div><label>Cevap Tipi</label><select class="answer-type-select"><option value="variable" selected>Değişken</option><option value="fixed">Sabit</option></select></div><div class="manager-grid-switch-group"><div class="archive-switch-container"><label>E-posta Ekle</label><label class="switch"><input type="checkbox" class="wants-email-checkbox"><span class="slider green"></span></label></div><div class="archive-switch-container"><label>Arşivle</label><label class="switch"><input type="checkbox" class="archive-checkbox"><span class="slider"></span></label></div></div></div><div><label>Statik Maddeler</label><div class="editor-toolbar">...</div><div class="editable-textarea" contenteditable="true"></div></div><div class="special-manager-container"></div><div class="manager-item-footer"><button class="btn-sm btn-cancel-new-question"><i class="fas fa-times"></i> İptal</button></div>`; m.appendChild(d); d.querySelector('.question-type-select').addEventListener('change', (e_select) => toggleSpecialManagerUI(e_select.currentTarget)); d.querySelector('.archive-checkbox').addEventListener('change', filterManagerView); d.querySelector('.btn-cancel-new-question').addEventListener('click', (e_btn) => e_btn.currentTarget.closest('.manager-item').remove()); d.querySelector('input[type="text"]').focus();}
function restoreAllArchivedQuestions(){ const i=document.querySelectorAll('#manager-list .manager-item:not(.hidden-question)'); if(i.length===0)return; if(confirm(`Arşivdeki ${i.length} soruyu geri getirmek ister misiniz?`)){i.forEach(item=>{item.querySelector('.archive-checkbox').checked=false;}); filterManagerView(); alert("Aktifleştirildi. Kaydetmeyi unutmayın.");}}
function deleteAllArchivedQuestions(){ const i=document.querySelectorAll('#manager-list .manager-item:not(.hidden-question)'); if(i.length===0)return; if(confirm(`Arşivdeki ${i.length} soruyu kalıcı silmek istediğinizden emin misiniz?`)){i.forEach(item=>{item.style.opacity='0';setTimeout(()=>{item.classList.add('to-be-deleted');item.style.display='none';},500);}); document.getElementById('delete-all-archived-btn').disabled = true; alert("Silinmek üzere işaretlendi. Kaydetmeyi unutmayın.");}}