// --- Global Değişkenler ---
let dideData = [], fideData = [], allStores = [], selectedStore = null;
let fideQuestions = [], popCodes = [], expiredCodes = [], productList = [];
let storeEmails = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular veritabanından yüklenemedi." }];
const monthNames = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let isPocketBaseConnected = false;
let auditedThisMonth = [];
// Bu değişken, seçili bayinin raporunun PocketBase'deki ID'sini tutacak. Güncelleme için gereklidir.
let currentReportId = null;

// --- Ana Uygulama Mantığı ---
window.onload = initializeApp;

async function initializeApp() {
    // PocketBase, sayfa yenilendiğinde giriş bilgilerini otomatik olarak hatırlar.
    // Kullanıcının giriş yapmış olup olmadığını kontrol edelim.
    const loggedIn = pb.authStore.isValid;

    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');

    if (loggedIn) {
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
        loginPopup.style.display = 'none';
    } else {
        loginToggleBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'none';
    }
    
    // PocketBase sunucusuna ulaşıp ulaşamadığımızı test edelim.
    try {
        const health = await pb.health.check();
        isPocketBaseConnected = health.code === 200;
    } catch (error) {
        isPocketBaseConnected = false;
    }
    
    updateConnectionIndicator();
    await loadInitialData();
    setupEventListeners();
    updateFormInteractivity(selectedStore !== null);
}

async function loadInitialData() {
    // Giriş yapılmadıysa veri yüklemeye çalışma.
    if (!pb.authStore.isValid) {
        buildForm(); // Boş formu yine de çiz
        return;
    }

    // Gösterge paneli aktif ediliyor
    showLoadingOverlay('Başlangıç verileri yükleniyor...');

    let questionsLoaded = false;
    try {
        // Promise.all ile tüm verileri aynı anda çekmeye çalışalım. Bu daha hızlıdır.
        const [
            questionsRecords,
            productsRecords,
            dideExcelRecords,
            fideExcelRecords,
            bayilerRecords
        ] = await Promise.all([
            pb.collection('sorular').getFullList({ sort: 'soru_id' }),
            pb.collection('urunler').getFullList({ sort: 'created' }),
            pb.collection('excel_dide').getFullList({ expand: 'bayi' }), // expand ile ilişkili bayi bilgisini de çekeriz.
            pb.collection('excel_fide').getFullList({ expand: 'bayi' }),
            pb.collection('bayiler').getFullList({ sort: 'bayiAdi' })
        ]);

        // 1. Soruları ve Ürünleri işle
        if (questionsRecords && questionsRecords.length > 0) {
            fideQuestions = questionsRecords.map(rec => ({ id: rec.soru_id, ...rec.soru_data }));
            const popSystemQuestion = fideQuestions.find(q => q.type === 'pop_system');
            if (popSystemQuestion) {
                popCodes = popSystemQuestion.popCodes || [];
                expiredCodes = popSystemQuestion.expiredCodes || [];
            }
            questionsLoaded = true;
        }
        if (productsRecords && productsRecords.length > 0) {
            productList = productsRecords.map(rec => ({ code: rec.urun_kodu, name: rec.urun_adi, type: rec.tip }));
        }

        // 2. Bayi listesini işle
        allStores = bayilerRecords.map(rec => ({ id: rec.id, bayiKodu: rec.bayiKodu, bayiAdi: rec.bayiAdi, email: rec.email }));
        storeEmails = Object.fromEntries(allStores.map(store => [store.bayiKodu, store.email]));
        document.getElementById('store-selection-area').style.display = 'block';

        // 3. Excel verilerini işle
        if (dideExcelRecords && dideExcelRecords.length > 0) {
            dideData = dideExcelRecords.map(rec => ({
                'Bayi Kodu': rec.expand.bayi.bayiKodu,
                'Bayi': rec.expand.bayi.bayiAdi,
                'Bayi Yönetmeni': rec.expand.bayi.yonetmen,
                'scores': rec.puanlar
            }));
            const firstDideFile = dideExcelRecords.find(rec => rec.dosya_adi);
            if(firstDideFile) document.getElementById('file-name').textContent = `Veritabanından yüklendi: ${firstDideFile.dosya_adi}`;
        }
        if (fideExcelRecords && fideExcelRecords.length > 0) {
            fideData = fideExcelRecords.map(rec => ({
                'Bayi Kodu': rec.expand.bayi.bayiKodu,
                'scores': rec.puanlar
            }));
             const firstFideFile = fideExcelRecords.find(rec => rec.dosya_adi);
            if(firstFideFile) document.getElementById('fide-file-name').textContent = `Veritabanından yüklendi: ${firstFideFile.dosya_adi}`;
        }

        // 4. Aylık denetim verisini yükle
        await loadMonthlyAuditData();

        console.log("Tüm başlangıç verileri PocketBase'den başarıyla yüklendi.");

    } catch (error) {
        console.error("PocketBase'den başlangıç verileri okunurken hata oluştu:", error);
        document.getElementById('initialization-error').style.display = 'block';
    }
    
    if (!questionsLoaded) {
        fideQuestions = fallbackFideQuestions;
        document.getElementById('initialization-error').style.display = 'block';
    }

    buildForm();
    hideLoadingOverlay();
}


async function loadMonthlyAuditData() {
    auditedThisMonth = [];
    if (!pb.authStore.isValid) return;

    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

    try {
        // Bu ay içinde tamamlanmış ve geri alınmamış raporları filtrele
        const records = await pb.collection('raporlar').getFullList({
            filter: `denetim_tarihi >= "${firstDayOfMonth}" && geri_alindi = false`,
            expand: 'bayi'
        });

        auditedThisMonth = records.map(rec => rec.expand.bayi.bayiKodu);

    } catch (error) {
        console.error("Bu ay denetlenen bayi verileri yüklenirken hata oluştu:", error);
    }
}


function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = isPocketBaseConnected && pb.authStore.isValid;
    
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Sunucuya Bağlı' : 'Bağlı Değil';
}

function returnToMainPage() {
    const emailDraft = document.getElementById('email-draft-container');
    if (emailDraft) emailDraft.remove();
    document.getElementById('dide-upload-card').style.display = 'block';
    document.getElementById('form-content').style.display = 'block';
    document.querySelector('.action-button').style.display = 'block';
}

function setupEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    document.getElementById('excel-file-input').addEventListener('change', (e) => handleFileSelect(e, 'dide'));
    document.getElementById('fide-excel-file-input').addEventListener('change', (e) => handleFileSelect(e, 'fide'));
    document.getElementById('new-report-btn').addEventListener('click', startNewReport);
    
    document.getElementById('store-search-input').addEventListener('keyup', (e) => {
        selectedStore = null; 
        currentReportId = null;
        const filter = e.target.value.toLowerCase().trim();
        const storeListDiv = document.getElementById('store-list');
        storeListDiv.style.display = 'block';
        if (filter === "") {
            storeListDiv.innerHTML = ''; 
            return;
        }
        const filteredStores = allStores.filter(store => 
            (store.bayiAdi && store.bayiAdi.toLowerCase().includes(filter)) || 
            (store.bayiKodu && String(store.bayiKodu).toLowerCase().includes(filter))
        );
        displayStores(filteredStores);
    });
    
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });
    logoutBtn.addEventListener('click', () => { 
        pb.authStore.clear(); // PocketBase'de çıkış yapma
        window.location.reload(); 
    });
    loginSubmitBtn.addEventListener('click', async () => {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';
        if (!email || !password) { errorDiv.textContent = 'Lütfen tüm alanları doldurun.'; return; }
        
        try {
            // PocketBase'de kullanıcı girişi denemesi
            await pb.collection('users').authWithPassword(email, password);
            loginPopup.style.display = 'none'; 
            window.location.reload();
        } catch (error) {
            errorDiv.textContent = 'E-posta veya şifre hatalı.';
            console.error('PocketBase giriş hatası:', error);
        }
    });

    window.addEventListener('click', function(event) {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });

    document.getElementById('toggle-backup-manager-btn').addEventListener('click', () => {
        // PocketBase admin paneli yeni sekmede açılır
        window.open('http://127.0.0.1:8090/_/', '_blank');
    });
}

async function saveFormState(isFinalizing = false) {
    if (!document.getElementById('form-content').innerHTML || !selectedStore || !pb.authStore.isValid) return;

    const reportData = getFormDataForSaving();
    const bayiKodu = String(selectedStore.bayiKodu);

    // Raporu kaydetmek/güncellemek için PocketBase'e göndereceğimiz veri yapısı
    const dataToSave = {
        bayi: selectedStore.id, // İlişkili bayinin ID'si
        rapor_data: reportData,
        geri_alindi: false
    };

    if (isFinalizing) {
        const isAlreadyAudited = auditedThisMonth.includes(bayiKodu);
        // Sadece bu ay daha önce denetlenmemişse denetim tarihini ekle
        if (!isAlreadyAudited) {
            dataToSave.denetim_tarihi = new Date().toISOString();
        }
    }
    
    showLoadingOverlay('Rapor kaydediliyor...');
    try {
        if (currentReportId) {
            // Rapor daha önce kaydedilmiş, şimdi güncelliyoruz.
            await pb.collection('raporlar').update(currentReportId, dataToSave);
            console.log("Rapor güncellendi:", currentReportId);
        } else {
            // Bu bayi için yeni bir rapor oluşturuyoruz.
            const newRecord = await pb.collection('raporlar').create(dataToSave);
            currentReportId = newRecord.id; // Yeni raporun ID'sini alıp saklıyoruz.
            console.log("Yeni rapor kaydedildi:", currentReportId);
        }
    } catch (error) {
        console.error("PocketBase'e yazma hatası:", error);
        alert("Rapor kaydedilirken bir hata oluştu!");
    }
    hideLoadingOverlay();
}

async function loadReportForStore(bayiId) {
    if (!pb.authStore.isValid) {
        resetForm();
        return;
    }
    showLoadingOverlay('Rapor yükleniyor...');
    try {
        // PocketBase'de belirli bir bayiye ait en son raporu bulalım
        const record = await pb.collection('raporlar').getFirstListItem(`bayi = "${bayiId}"`, {
            sort: '-created', // En yeniye göre sırala
        });
        
        currentReportId = record.id; // Bulunan raporun ID'sini sakla
        loadReport(record.rapor_data); // Raporun içeriğini forma yükle
        
    } catch (error) {
        // 'getFirstListItem' hata fırlatırsa, bu genellikle kayıt bulunamadığı anlamına gelir.
        if (error.status === 404) {
            console.log("Bu bayi için kaydedilmiş bir rapor bulunamadı. Temiz form açılıyor.");
            currentReportId = null; // Rapor ID'sini sıfırla
            resetForm();
        } else {
            console.error("PocketBase'den okuma hatası:", error);
            resetForm();
        }
    }
    hideLoadingOverlay();
}


function getUnitForProduct(productName) {
    const upperCaseName = productName.toUpperCase();
    if (upperCaseName.includes('TSHIRT') || upperCaseName.includes('HIRKA')) { return 'Adet'; }
    return 'Paket';
}
function resetForm() { 
    currentReportId = null; // Yeni rapor için ID'yi sıfırla
    document.getElementById('form-content').innerHTML = ''; 
    buildForm(); 
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
        productList.forEach(p => {
            if (p.type === 'header') {
                if (currentOptgroup) productOptions += `</optgroup>`;
                productOptions += `<optgroup label="${p.name}">`;
                currentOptgroup = true;
            } else {
                productOptions += `<option value="${p.code}">${p.code} - ${p.name}</option>`;
            }
        });
        if (currentOptgroup) productOptions += `</optgroup>`;
        questionContentHTML = `<div class="input-area"><b><i>Sipariş verilmesi gerekenler:</i></b><div class="product-adder"><select id="product-selector"><option value="">-- Malzeme Seçin --</option>${productOptions}</select><input type="number" id="product-qty" placeholder="Adet" min="1" value="1"><button class="btn-success btn-sm" onclick="addProductToList()" title="Seçili malzemeyi ve adedini aşağıdaki sipariş listesine ekler."><i class="fas fa-plus"></i> Ekle</button></div><div id="selected-products-list"></div><hr><b><i>Pleksiyle sergilenmesi gerekenler veya Yanlış Pleksi malzeme ile kullanılanlar:</i></b><div id="sub-items-container-fide${q.id}_pleksi"></div></div>`;
    } else if (q.type === 'pop_system') {
        questionActionsHTML = `<div class="fide-actions"><button class="status-btn btn-sm" onclick="toggleQuestionCompleted(this, ${q.id})" title="Bu soruyu 'Tamamlandı' olarak işaretler. Geri alınabilir."><i class="fas fa-check"></i> Tamamlandı</button><button class="remove-btn btn-danger btn-sm" onclick="toggleQuestionRemoved(this, ${q.id})" title="Bu soruyu e-posta raporundan tamamen çıkarır. Geri alınabilir."><i class="fas fa-times-circle"></i> Çıkar</button></div>`;
        questionContentHTML = `<div class="input-area"><div class="pop-container" id="popCodesContainer"></div><div class="warning-message" id="expiredWarning">Seçiminizde süresi dolmuş kodlar bulunmaktadır.</div><div class="pop-button-container"><button class="btn-success btn-sm" onclick="copySelectedCodes()" title="Seçili olan geçerli POP kodlarını panoya kopyalar.">Kopyala</button><button class="btn-danger btn-sm" onclick="clearSelectedCodes()" title="Tüm POP kodu seçimlerini temizler.">Temizle</button><button class="btn-primary btn-sm" onclick="selectExpiredCodes()" title="Süresi dolmuş olan tüm POP kodlarını otomatik olarak seçer.">Bitenler</button><button class="btn-primary btn-sm" onclick="openEmailDraft()" title="Seçili POP kodları için bir e-posta taslağı penceresi açar.">E-Posta</button></div></div>`;
    }
    return `<div class="fide-item ${isArchivedClass}" id="fide-item-${q.id}"><div class="fide-title-container"><p><span class="badge">FiDe ${q.id}</span> ${q.title}</p></div>${questionContentHTML}${questionActionsHTML}</div>`;
}

function buildForm() {
    const formContainer = document.getElementById('form-content');
    formContainer.innerHTML = '';
    let html = '';
    fideQuestions.forEach(q => {
        if (q.isArchived) { return; }
        html += generateQuestionHtml(q);
    });
    formContainer.innerHTML = html;
    if (document.getElementById('popCodesContainer')) initializePopSystem();
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
        const timerId = setTimeout(() => { itemEl.remove(); saveFormState(); }, 4000);
        itemEl.dataset.deleteTimer = timerId;
    }
    saveFormState();
}

function addProductToList(productCode, quantity) {
    const select = document.getElementById('product-selector');
    const qtyInput = document.getElementById('product-qty');
    const selectedProductCode = productCode || select.value;
    const selectedQty = quantity || qtyInput.value;
    if (!selectedProductCode || !selectedQty || selectedQty < 1) return alert('Lütfen malzeme ve geçerli bir miktar girin.');
    
    const product = productList.find(p => p.code === selectedProductCode);
    if (!product) { console.error("Ürün bulunamadı: ", selectedProductCode); return; }

    const listContainer = document.getElementById('selected-products-list');
    if (document.querySelector(`.selected-product-item[data-code="${product.code}"]`)) return alert('Bu ürün zaten listede.');
    
    const unit = getUnitForProduct(product.name);
    const newItem = document.createElement('div');
    newItem.className = 'selected-product-item';
    newItem.dataset.code = product.code;
    newItem.dataset.qty = selectedQty;
    newItem.innerHTML = `<span>${product.code} ${product.name} - <b>${selectedQty} ${unit}</b></span><button class="delete-item-btn btn-sm" title="Bu malzemeyi sipariş listesinden siler." onclick="this.parentElement.remove(); saveFormState();"><i class="fas fa-trash"></i></button>`;
    listContainer.appendChild(newItem);
    
    if (!productCode) { select.value = ''; qtyInput.value = '1'; }
    saveFormState();
}

function toggleCompleted(button) {
    const input = button.parentElement.querySelector('input[type="text"]');
    const isCompleted = input.classList.toggle('completed');
    input.readOnly = isCompleted;
    button.innerHTML = isCompleted ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    button.classList.toggle('undo', isCompleted);
    saveFormState();
}
function toggleQuestionCompleted(button, id) {
    const itemDiv = document.getElementById(`fide-item-${id}`);
    const titleContainer = itemDiv.querySelector('.fide-title-container');
    const isQuestionCompleted = titleContainer.classList.toggle('question-completed');
    button.innerHTML = isQuestionCompleted ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    button.classList.toggle('undo', isQuestionCompleted);
    const inputArea = itemDiv.querySelector('.input-area');
    if (inputArea) inputArea.style.display = isQuestionCompleted ? 'none' : 'block';
    saveFormState();
}
function toggleQuestionRemoved(button, id) {
    const itemDiv = document.getElementById(`fide-item-${id}`);
    const inputArea = itemDiv.querySelector('.input-area');
    const actionsContainer = button.closest('.fide-actions');
    const addItemBtn = actionsContainer.querySelector('.add-item-btn');
    const completeBtn = actionsContainer.querySelector('.status-btn');
    const isRemoved = itemDiv.classList.toggle('question-removed');
    if (isRemoved) {
        if (inputArea) inputArea.style.display = 'none';
        button.innerHTML = '<i class="fas fa-undo"></i> Geri Al';
        button.classList.remove('btn-danger');
        button.classList.add('btn-primary');
        if (addItemBtn) addItemBtn.disabled = true;
        if (completeBtn) completeBtn.disabled = true;
    } else {
        if (inputArea) inputArea.style.display = 'block';
        button.innerHTML = '<i class="fas fa-times-circle"></i> Çıkar';
        button.classList.remove('btn-primary');
        button.classList.add('btn-danger');
        if (addItemBtn) addItemBtn.disabled = false;
        if (completeBtn) completeBtn.disabled = false;
    }
    saveFormState();
}
function addDynamicInput(id, value = '', isCompleted = false) {
    const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) {
        console.warn(`Dinamik girdi eklenemedi: '${id}' ID'li konteyner bulunamadı.`);
        return;
    }
    const newItem = document.createElement('div');
    newItem.className = 'dynamic-input-item';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Eksikliği yazın...';
    input.value = value;
    input.addEventListener('keydown', function(event) { if (event.key === 'Enter') { event.preventDefault(); addDynamicInput(id); } });
    input.addEventListener('blur', saveFormState);
    const completeButton = document.createElement('button');
    completeButton.className = 'status-btn btn-sm';
    completeButton.innerHTML = '<i class="fas fa-check"></i> Tamamlandı';
    completeButton.onclick = () => toggleCompleted(completeButton);
    completeButton.title = "Bu eksikliği 'Tamamlandı' olarak işaretler. Geri alınabilir.";
    const deleteButton = document.createElement('button');
    deleteButton.className = 'delete-bar btn-danger';
    deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
    deleteButton.onclick = function() { initiateDeleteItem(this); };
    deleteButton.title = "Bu satırı silmek için tıklayın. 4 saniye içinde geri alınabilir.";
    newItem.appendChild(input);
    newItem.appendChild(completeButton);
    newItem.appendChild(deleteButton);
    if(isCompleted) toggleCompleted(completeButton);
    container.prepend(newItem);
    if (value === '') input.focus();
    saveFormState();
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
function getDynamicInputsForSaving(id) {
     const container = document.getElementById(`sub-items-container-${id}`);
    if (!container) return [];
    const dynamicItems = [];
    Array.from(container.childNodes).reverse().forEach(node => {
        if (node.classList && node.classList.contains('dynamic-input-item')) {
            const input = node.querySelector('input[type="text"]');
            const text = input.value.trim();
            if (text) dynamicItems.push({ text: text, completed: input.classList.contains('completed') });
        }
    });
    return dynamicItems;
}
function initializePopSystem() {
    const popCodesContainer = document.getElementById('popCodesContainer');
    if (!popCodesContainer) return;
    popCodesContainer.innerHTML = '';
    popCodes.forEach(code => {
        const label = document.createElement('label');
        label.className = 'checkbox-label';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = code;
        checkbox.className = 'pop-checkbox';
        checkbox.addEventListener('change', () => {
            checkExpiredPopCodes();
            saveFormState();
        });
        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(code));
        popCodesContainer.appendChild(label);
    });
}
function checkExpiredPopCodes() {
    const warningMessage = document.getElementById('expiredWarning');
    if (!warningMessage) return;
    const hasExpired = Array.from(document.querySelectorAll('.pop-checkbox:checked')).some(cb => expiredCodes.includes(cb.value));
    warningMessage.style.display = hasExpired ? 'block' : 'none';
}
function copySelectedCodes() {
    const nonExpiredCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(code => !expiredCodes.includes(code));
    if (nonExpiredCodes.length === 0) return alert("Kopyalamak için geçerli kod seçin.");
    navigator.clipboard.writeText(nonExpiredCodes.join(', ')).then(() => alert("Seçilen geçerli kodlar kopyalandı!"));
}
function clearSelectedCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => cb.checked = false);
    checkExpiredPopCodes();
    saveFormState();
}
function selectExpiredCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => { cb.checked = expiredCodes.includes(cb.value); });
    checkExpiredPopCodes();
    saveFormState();
}
function openEmailDraft() {
    const selectedCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value);
    const nonExpiredCodes = selectedCodes.filter(code => !expiredCodes.includes(code));
    if (nonExpiredCodes.length === 0) { alert("E-Posta göndermek için geçerli (süresi dolmamış) kod seçin."); return; }
    
    const popQuestion = fideQuestions.find(q => q.type === 'pop_system') || {};
    const emailTo = (popQuestion.popEmailTo || []).join(',');
    const emailCc = (popQuestion.popEmailCc || []).join(',');

    const kodSatiri = nonExpiredCodes.join(', ');
    const emailHTML = `
        <!DOCTYPE html><html lang="tr"><head><meta charset="UTF-8"><title>E-Posta Taslağı</title>
        <style>body { font-family: Arial; padding: 20px; background-color: #fff; } .block { margin-bottom: 15px; } .label { font-weight: bold; color: #555; display: inline-block; margin-bottom: 8px; }</style>
        </head><body>
        <div class="block"><span class="label">Kime:</span> ${emailTo || ''}</div>
        <div class="block"><span class="label">CC:</span> ${emailCc || ''}</div>
        <div class="block"><span class="label">Konu:</span> (Boş)</div>
        <div class="block"><span class="label">İçerik:</span><div style="margin-top: 10px;">${kodSatiri}</div></div>
        </body></html>`;
    const emailWindow = window.open('', '_blank');
    emailWindow.document.write(emailHTML);
    emailWindow.document.close();
}
// Excel işleme fonksiyonları PocketBase'e göre güncellendi
async function handleFileSelect(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    showLoadingOverlay(`${type.toUpperCase()} Excel dosyası işleniyor...`);
    const fileNameSpan = type === 'dide' ? document.getElementById('file-name') : document.getElementById('fide-file-name');
    fileNameSpan.textContent = `Yüklü dosya: ${file.name}`;
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

            if (type === 'dide') {
                await processDideExcelData(dataAsArray, file.name);
            } else {
                await processFideExcelData(dataAsArray, file.name);
            }
            // Başarılı işlem sonrası sayfayı yenileyerek tüm verilerin güncel gelmesini sağla
            window.location.reload();
        } catch (error) {
            alert("Excel dosyası okunurken bir hata oluştu.");
            console.error("Excel okuma hatası:", error);
        } finally {
            hideLoadingOverlay();
        }
    };
}

async function processDideExcelData(dataAsArray, filename = '') {
    // ... Excel okuma mantığı aynı ...
    let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim() === 'Bayi Kodu'));
    if (headerRowIndex === -1) return alert('DiDe Excel dosyasında "Bayi Kodu" içeren bir başlık satırı bulunamadı.');
    const headerRow = dataAsArray[headerRowIndex].map(h => typeof h === 'string' ? h.trim() : h);
    const dataRows = dataAsArray.slice(headerRowIndex + 1);
    const bayiKoduIndex = headerRow.indexOf('Bayi Kodu');
    const bayiIndex = headerRow.indexOf('Bayi');
    const bayiYonetmeniIndex = headerRow.indexOf('Bayi Yönetmeni');
    
    for (const row of dataRows) {
        const bayiKodu = row[bayiKoduIndex];
        if (!bayiKodu) continue;

        const scores = {};
        headerRow.forEach((header, index) => {
            const monthNumber = parseInt(header);
            if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
                if(row[index] !== null && row[index] !== undefined) scores[monthNumber] = row[index];
            }
        });

        try {
            // Bayinin 'bayiler' tablosunda olup olmadığını kontrol et
            let bayiRecord = allStores.find(s => s.bayiKodu == bayiKodu);
            if (!bayiRecord) { continue; } // Bayi ana listede yoksa atla

            // DiDe puanlarını güncelle veya oluştur
            const data = {
                bayi: bayiRecord.id,
                puanlar: scores,
                dosya_adi: filename
            };

            // Bu bayiye ait bir DiDe puan kaydı var mı diye bak
            const existing = await pb.collection('excel_dide').getFirstListItem(`bayi.bayiKodu = "${bayiKodu}"`).catch(() => null);
            if (existing) {
                await pb.collection('excel_dide').update(existing.id, data);
            } else {
                await pb.collection('excel_dide').create(data);
            }
        } catch(e) {
            console.error(`Bayi ${bayiKodu} için DiDe verisi işlenirken hata:`, e);
        }
    }
    alert('DiDe puan dosyası başarıyla işlendi ve veritabanına kaydedildi.');
}

async function processFideExcelData(dataAsArray, filename = '') {
    // ... Excel okuma mantığı aynı ...
    const currentYear = new Date().getFullYear();
    let yearRowIndex = dataAsArray.findIndex(row => row.some(cell => String(cell).trim() == currentYear));
    if (yearRowIndex === -1) return alert(`FiDe Excel dosyasında '${currentYear}' yılını içeren bir satır bulunamadı.`);
    const filledYearRow = dataAsArray[yearRowIndex].reduce((acc, cell) => { acc.push(cell || acc[acc.length - 1] || null); return acc; }, []);
    const monthRow = dataAsArray[yearRowIndex + 1];
    let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim() === 'Bayi Kodu'));
    if (headerRowIndex === -1) return alert('FiDe Excel dosyasında "Bayi Kodu" içeren bir başlık satırı bulunamadı.');
    const headerRow = dataAsArray[headerRowIndex];
    const dataRows = dataAsArray.slice(headerRowIndex + 1);
    const bayiKoduIndex = headerRow.indexOf('Bayi Kodu');

    for (const row of dataRows) {
        const bayiKodu = row[bayiKoduIndex];
        if (!bayiKodu) continue;

        const scores = {};
        for (let i = 0; i < filledYearRow.length; i++) {
            if (filledYearRow[i] == currentYear) {
                const monthNumber = parseInt(monthRow[i]);
                if (!isNaN(monthNumber) && row[i] !== "") scores[monthNumber] = row[i];
            }
        }
        
        try {
            let bayiRecord = allStores.find(s => s.bayiKodu == bayiKodu);
            if (!bayiRecord) { continue; }

            const data = {
                bayi: bayiRecord.id,
                puanlar: scores,
                dosya_adi: filename
            };

            const existing = await pb.collection('excel_fide').getFirstListItem(`bayi.bayiKodu = "${bayiKodu}"`).catch(() => null);
            if (existing) {
                await pb.collection('excel_fide').update(existing.id, data);
            } else {
                await pb.collection('excel_fide').create(data);
            }
        } catch(e) {
            console.error(`Bayi ${bayiKodu} için FiDe verisi işlenirken hata:`, e);
        }
    }
     alert('FiDe puan dosyası başarıyla işlendi ve veritabanına kaydedildi.');
}

function displayStores(stores) {
    const storeListDiv = document.getElementById('store-list');
    storeListDiv.innerHTML = '';
    stores.forEach(store => {
        const item = document.createElement('div');
        item.className = 'store-item';
        let displayName = store.bayiAdi;
        if (displayName && displayName.length > 30) displayName = displayName.substring(0, 30) + '...';
        item.textContent = `${displayName} (${store.bayiKodu})`;
        item.dataset.bayiId = store.id; // PocketBase ID'sini saklayalım
        item.addEventListener('click', () => selectStore(store));
        storeListDiv.appendChild(item);
    });
}
function selectStore(store, loadSavedData = true) {
    if (auditedThisMonth.includes(String(store.bayiKodu))) {
        const proceed = confirm(`UYARI: Bu bayi (${store.bayiAdi} - ${store.bayiKodu}) bu ay içinde zaten denetlenmiş.\n\nDevam etmek istiyor musunuz?`);
        if (!proceed) return; 
    }

    document.querySelectorAll('.store-item').forEach(i => i.classList.remove('selected'));
    const storeItem = document.querySelector(`.store-item[data-bayi-id="${store.id}"]`);
    if (storeItem) storeItem.classList.add('selected');
    
    selectedStore = { id: store.id, bayiKodu: store.bayiKodu, bayiAdi: store.bayiAdi };
    
    const searchInput = document.getElementById('store-search-input');
    let shortBayiAdi = store.bayiAdi.length > 20 ? store.bayiAdi.substring(0, 20) + '...' : store.bayiAdi;
    searchInput.value = `${store.bayiKodu} - ${shortBayiAdi}`;
    
    document.getElementById('store-list').innerHTML = '';
    document.getElementById('store-list').style.display = 'none';
    
    if (loadSavedData) {
        loadReportForStore(store.id);
    } else {
        resetForm();
    }
    updateFormInteractivity(true); 
}

async function generateEmail() {
    if (!selectedStore) {
        alert('Lütfen denetime başlamadan önce bir bayi seçin!');
        return;
    }

    let emailTemplate = "Ziyaret etmiş olduğum {BAYI_BILGISI} bayi karnesi ektedir."; // Varsayılan
    try {
        const record = await pb.collection('genel_ayarlar').getFirstListItem('ayar_adi = "emailSablonu"');
        emailTemplate = record.ayar_degeri.template;
    } catch (error) {
        console.warn("E-posta şablonu veritabanından yüklenemedi, varsayılan kullanılıyor.", error);
    }
    
    await saveFormState(true);

    const storeInfo = dideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    const fideStoreInfo = fideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    if (!storeInfo) {
        alert("Seçilen bayi için DiDe verisi bulunamadı.");
        return;
    }
    
    const storeEmail = storeEmails[selectedStore.bayiKodu] || null;
    const storeEmailTag = storeEmail ? ` <a href="mailto:${storeEmail}" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@${storeEmail}</a>` : '';

    const bayiYonetmeniFullName = storeInfo['Bayi Yönetmeni'] || '';
    const yonetmenFirstName = bayiYonetmeniFullName.split(' ')[0];
    const shortBayiAdi = selectedStore.bayiAdi.length > 20 ? selectedStore.bayiAdi.substring(0, 20) + '...' : selectedStore.bayiAdi;
    
    let greetingHtml = emailTemplate
        .replace(/{YONETMEN_ADI}/g, yonetmenFirstName || 'Yetkili')
        .replace(/{BAYI_BILGISI}/g, `${selectedStore.bayiKodu} ${shortBayiAdi}`);
    
    greetingHtml = greetingHtml.split('\n').map(p => `<p>${p.trim()}</p>`).join('');

    let fideReportHtml = "";
    fideQuestions.forEach(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        if (!itemDiv || itemDiv.classList.contains('question-removed')) return;
        const titleContainer = itemDiv.querySelector('.fide-title-container');
        const isQuestionCompleted = titleContainer ? titleContainer.classList.contains('question-completed') : false;
        let contentHtml = '';
        if (q.type === 'standard') {
            const allItems = getCombinedInputs(`fide${q.id}`);
            const hasDynamicItems = allItems.some(item => item.type === 'dynamic');
            let itemsForEmail = [];

            if (hasDynamicItems) {
                itemsForEmail = allItems.filter(item => item.type === 'dynamic' || (item.type === 'static' && item.text.includes('<a href')));
            } else {
                itemsForEmail = allItems.filter(item => item.type === 'static');
            }
            
            if (itemsForEmail.length > 0) {
                itemsForEmail.sort((a, b) => {
                    const aIsLink = a.text.includes('<a href');
                    const bIsLink = b.text.includes('<a href');
                    if (aIsLink && !bIsLink) return 1;
                    if (!aIsLink && bIsLink) return -1;
                    return 0;
                });

                contentHtml = `<ul>${itemsForEmail.map(item => {
                    if (item.completed) return `<li>${item.text} <span style="background-color:#dcfce7; color:#166534; font-weight:bold; padding: 1px 6px; border-radius: 4px;">Tamamlandı</span></li>`;
                    return `<li>${item.text}</li>`;
                }).join('')}</ul>`;
            }
        } else if (q.type === 'product_list') {
            const productItemsHtml = Array.from(document.querySelectorAll('#selected-products-list .selected-product-item')).map(item => {
                const product = productList.find(p => p.code === item.dataset.code);
                if(product) { const unit = getUnitForProduct(product.name); return `<li>${product.code} ${product.name}: ${item.dataset.qty} ${unit}</li>`; }
            }).filter(Boolean);
            const pleksiItemsHtml = getCombinedInputs(`fide${q.id}_pleksi`).filter(item => !item.completed).map(item => `<li>${item.text}</li>`);
            if (productItemsHtml.length > 0) contentHtml += `<b><i>Sipariş verilmesi gerekenler:</i></b><ul>${productItemsHtml.join('')}</ul>`;
            if (pleksiItemsHtml.length > 0) contentHtml += `<b><i>Pleksiyle sergilenmesi gerekenler veya Yanlış Pleksi malzeme ile kullanılanlar:</i></b><ul>${pleksiItemsHtml.join('')}</ul>`;
        } else if (q.type === 'pop_system') {
            const nonExpiredCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(code => !expiredCodes.includes(code));
            if (nonExpiredCodes.length > 0) contentHtml = `<ul><li>${nonExpiredCodes.join(', ')}</li></ul>`;
        }
        if (contentHtml !== '' || isQuestionCompleted) {
            const completedSpan = isQuestionCompleted ? ` <span style="background-color:#dcfce7; color:#166534; font-weight:bold; padding: 1px 6px; border-radius: 4px;">Tamamlandı</span>` : "";
            
            let emailTag = '';
            if (q.wantsStoreEmail && q.type !== 'pop_system') {
                emailTag = storeEmailTag;
            } else if (q.type === 'pop_system' && q.popEmailTo && q.popEmailTo.length > 0) {
                const popEmails = q.popEmailTo.join(', ');
                const mailtoLink = `mailto:${q.popEmailTo.join(',')}`;
                emailTag = ` <a href="${mailtoLink}" style="background-color:#e0f2f7; color:#005f73; font-weight:bold; padding: 1px 6px; border-radius: 4px; text-decoration:none;">@${popEmails}</a>`;
            }

            fideReportHtml += `<p><b>FiDe ${q.id}. ${q.title}</b>${completedSpan}${emailTag}</p>`;
            if (!isQuestionCompleted || q.type === 'product_list' || (isQuestionCompleted && q.type === 'standard' && contentHtml !== '')) fideReportHtml += contentHtml;
        }
    });
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    let monthHeaders = '';
    for (let m = 1; m <= currentMonth; m++) monthHeaders += `<th style="border: 1px solid #dddddd; text-align: center; padding: 6px; background-color: #f2f2f2; font-weight: bold; white-space: nowrap;">${monthNames[m] || m}</th>`;
    let dideScores = '';
    for (let m = 1; m <= currentMonth; m++) dideScores += `<td style="border: 1px solid #dddddd; text-align: center; padding: 6px; white-space: nowrap;">${storeInfo.scores[m] || '-'}</td>`;
    let fideScores = '';
    for (let m = 1; m <= currentMonth; m++) {
         const score = (fideStoreInfo && fideStoreInfo.scores && fideStoreInfo.scores[m] !== undefined) ? fideStoreInfo.scores[m] : '-';
         fideScores += `<td style="border: 1px solid #dddddd; text-align: center; padding: 6px; white-space: nowrap;">${score}</td>`;
    }
    const tableHtml = `<div style="overflow-x: auto; -webkit-overflow-scrolling: touch;"><table style="border-collapse: collapse; margin-top: 10px; font-size: 10pt; border: 1px solid #dddddd;"><thead><tr><th style="border: 1px solid #dddddd; text-align: center; padding: 6px; background-color: #f2f2f2; font-weight: bold; white-space: nowrap;">${currentYear}</th>${monthHeaders}</tr></thead><tbody><tr><td style="border: 1px solid #dddddd; text-align: left; padding: 6px; font-weight: bold; white-space: nowrap;">DiDe</td>${dideScores}</tr><tr><td style="border: 1px solid #dddddd; text-align: left; padding: 6px; font-weight: bold; white-space: nowrap;">FiDe</td>${fideScores}</tr></tbody></table></div>`;
    const finalEmailBody = `${greetingHtml}${fideReportHtml}<p>&nbsp;</p>${tableHtml}`;
    
    document.getElementById('dide-upload-card').style.display = 'none';
    document.getElementById('form-content').style.display = 'none';
    document.querySelector('.action-button').style.display = 'none';

    const existingDraft = document.getElementById('email-draft-container');
    if (existingDraft) existingDraft.remove();
    const draftContainer = document.createElement('div');
    draftContainer.id = 'email-draft-container';
    draftContainer.className = 'card';
    draftContainer.innerHTML = `
        <h2>
            <a href="#" onclick="event.preventDefault(); returnToMainPage();" style="text-decoration: none; color: inherit; cursor: pointer;" title="Ana Sayfaya Dön">
                 <i class="fas fa-arrow-left" style="margin-right: 10px; font-size: 16px;"></i>
            </a>
            <i class="fas fa-envelope-open-text"></i> Kopyalanacak E-posta Taslağı
        </h2>
        <p>Aşağıdaki metni kopyalayıp e-posta olarak gönderebilirsiniz.</p>
        <div id="email-draft-area" contenteditable="true" style="width: 100%; min-height: 500px; border: 1px solid #ccc; padding: 10px; margin-top: 10px; font-family: Aptos, sans-serif; font-size: 11pt;">${finalEmailBody}</div>`;
    document.querySelector('.container').appendChild(draftContainer);
}

function loadReport(reportData) {
    if (!reportData || !reportData.questions_status) {
        console.warn("Rapor verisi bulunamadı veya 'questions_status' alanı eksik. Form sıfırlanıyor.");
        resetForm();
        updateFormInteractivity(true); 
        return; 
    }

    try {
        resetForm(); 

        if (reportData.selectedStore) {
            const storeData = allStores.find(s => s.bayiKodu == reportData.selectedStore.bayiKodu);
            if(storeData) {
                selectStore(storeData, false); // selectStore'u tekrar çağır ama bu sefer veri yüklemesin
            }
        }
        
        const formContainer = document.getElementById('form-content');

        for (const qId in reportData.questions_status) {
            let questionItem = document.getElementById(`fide-item-${qId}`);
            if (!questionItem) continue;

            const data = reportData.questions_status[qId];
            const completeButton = questionItem.querySelector('.fide-actions .status-btn');
            const removeButton = questionItem.querySelector('.fide-actions .remove-btn');
            if (data.removed && removeButton) toggleQuestionRemoved(removeButton, qId);
            else if (data.completed && completeButton) toggleQuestionCompleted(completeButton, qId);
            
            const questionInfo = fideQuestions.find(q => String(q.id) === qId);
            if (data.dynamicInputs) {
                data.dynamicInputs.forEach(input => {
                    const containerId = (questionInfo && questionInfo.type === 'product_list') ? `fide${qId}_pleksi` : `fide${qId}`;
                    addDynamicInput(containerId, input.text, input.completed);
                });
            }
            
            if (data.selectedProducts) data.selectedProducts.forEach(prod => addProductToList(prod.code, prod.qty)); 
            
            if (data.selectedPops) {
                data.selectedPops.forEach(popCode => { const cb = document.querySelector(`.pop-checkbox[value="${popCode}"]`); if(cb) cb.checked = true; });
                checkExpiredPopCodes();
            }
        }
        updateFormInteractivity(true);
    } catch (error) { alert('Geçersiz rapor verisi!'); console.error("Rapor yükleme hatası:", error); }
}

function startNewReport() {
    selectedStore = null;
    currentReportId = null;
    document.getElementById('store-search-input').value = '';
    resetForm();
    updateFormInteractivity(false);
}
function getFormDataForSaving() {
    let reportData = { selectedStore: selectedStore, questions_status: {} };
     fideQuestions.forEach(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        const isRemoved = itemDiv ? itemDiv.classList.contains('question-removed') : false;
        const titleContainer = itemDiv ? itemDiv.querySelector('.fide-title-container') : null;
        const isCompleted = titleContainer ? titleContainer.classList.contains('question-completed') : false;
        
        if (!itemDiv && q.isArchived) { return; }

        const questionData = { removed: isRemoved, completed: isCompleted, dynamicInputs: [], selectedProducts: [], selectedPops: [] };

        if (itemDiv) {
            if (q.type === 'standard') {
                questionData.dynamicInputs = getDynamicInputsForSaving(`fide${q.id}`);
            } else if (q.type === 'product_list') {
                const productItems = itemDiv.querySelectorAll('#selected-products-list .selected-product-item');
                if (productItems.length > 0) {
                     productItems.forEach(item => questionData.selectedProducts.push({ code: item.dataset.code, qty: item.dataset.qty }));
                }
                questionData.dynamicInputs = getDynamicInputsForSaving(`fide${q.id}_pleksi`);
            } else if (q.type === 'pop_system') {
                const popItems = itemDiv.querySelectorAll('.pop-checkbox:checked');
                 if(popItems.length > 0) {
                    questionData.selectedPops = Array.from(popItems).map(cb => cb.value);
                }
            }
        }
        reportData.questions_status[q.id] = questionData;
    });
    return reportData;
}

function updateFormInteractivity(enable) {
    const formContent = document.getElementById('form-content');
    if (!formContent) return;
    const allElements = formContent.querySelectorAll('button, input, select');
    allElements.forEach(el => { el.disabled = !enable; });
}

function showLoadingOverlay(message = 'İşlem yapılıyor, lütfen bekleyin...') {
    const overlay = document.getElementById('loading-overlay');
    overlay.querySelector('p').textContent = message;
    overlay.style.display = 'flex';
}

function hideLoadingOverlay() {
    document.getElementById('loading-overlay').style.display = 'none';
}