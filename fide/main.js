// --- Global Değişkenler ---
let dideData = [], fideData = [], uniqueStores = [], selectedStore = null;
let fideQuestions = [], popCodes = [], expiredCodes = [], productList = [];
let migrationMap = {}, storeEmails = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular sunucudan yüklenemedi." }];
const monthNames = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let auditedThisMonth = [];

// --- YENİ: PocketBase Yapılandırması ---
const pb = new PocketBase('http://127.0.0.1:8090');
let excelDataRecordId = null; // Yüklü Excel verisinin kaydının ID'sini tutar
let fideExcelDataRecordId = null; 
let tumBayilerRecordId = null; // Bayi listesi kaydının ID'sini tutar

// --- Ana Uygulama Mantığı ---
window.onload = initializeApp;

async function initializeApp() {
    setupEventListeners();

    // PocketBase'in oturum durumunu dinle (Firebase'in onAuthStateChanged yerine)
    pb.authStore.onChange((token, model) => {
        updateAuthUI(model);
        updateConnectionIndicator();
        // Oturum açıldığında veya kapandığında verileri yeniden yükle
        loadInitialData(); 
    }, true); // `true` parametresiyle sayfa yüklenir yüklenmez ilk durumu hemen tetikler
}

function updateAuthUI(user) {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    if (user) { // Kullanıcı giriş yapmışsa
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
        loginPopup.style.display = 'none';
    } else { // Kullanıcı çıkış yapmışsa
        loginToggleBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'none';
    }
}

async function loadInitialData() {
    if (!pb.authStore.isValid) {
        console.log("Verileri yüklemek için lütfen giriş yapın.");
        document.getElementById('form-content').innerHTML = '<p class="empty-list-message">Formu görüntülemek için lütfen sisteme giriş yapın.</p>';
        return;
    }
    
    showLoading(true);
    try {
        await loadFideQuestions();
        await loadStoreEmails();
        await loadExcelData();
        await loadAllStoresFromPocketBase();
        await loadAuditedReports();
        renderForm(); // Formu en başta boş olarak çiz
    } catch (error) {
        console.error("Başlangıç verileri yüklenirken hata:", error);
        alert("Sunucudan başlangıç verileri yüklenirken bir hata oluştu. Lütfen PocketBase'in çalıştığından ve internet bağlantınızdan emin olun.");
    } finally {
        showLoading(false);
    }
}

function setupEventListeners() {
    document.getElementById('excel-file-input').addEventListener('change', (e) => handleExcelUpload(e, 'dide'));
    document.getElementById('fide-excel-file-input').addEventListener('change', (e) => handleExcelUpload(e, 'fide'));
    document.getElementById('store-search-input').addEventListener('input', filterStoreList);
    document.getElementById('new-report-btn').addEventListener('click', resetForm);
    document.getElementById('clear-storage-btn').addEventListener('click', confirmAndClearAllData);
    document.getElementById('clear-excel-btn').addEventListener('click', () => clearExcelData('dide'));
    document.getElementById('clear-fide-excel-btn').addEventListener('click', () => clearExcelData('fide'));

    // Yönetim Paneli butonu (admin.html'e yönlendirir)
    document.getElementById('toggle-backup-manager-btn').addEventListener('click', () => {
        window.location.href = 'admin.html';
    });

    // Giriş/Çıkış Butonları
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginSubmitBtn = document.getElementById('login-submit-btn');
    const loginPopup = document.getElementById('login-popup');

    loginToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });
    
    logoutBtn.addEventListener('click', () => {
        pb.authStore.clear(); // PocketBase'den çıkış yap
    });

    loginSubmitBtn.addEventListener('click', async () => {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';
        
        if (!email || !password) {
            errorDiv.textContent = 'Lütfen tüm alanları doldurun.';
            return;
        }

        try {
            showLoading(true);
            await pb.admins.authWithPassword(email, password);
            // Başarılı giriş sonrası `onChange` tetiklenecek ve `loadInitialData` çalışacak.
        } catch (error) {
            errorDiv.textContent = 'E-posta veya şifre hatalı.';
            console.error('Giriş hatası:', error);
        } finally {
            showLoading(false);
        }
    });
    
    window.addEventListener('click', (event) => {
        if (!document.getElementById('auth-controls').contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });
}

// --- Veri Yükleme Fonksiyonları (PocketBase) ---

async function loadFideQuestions() {
    try {
        const record = await pb.collection('fideQuestionsData').getFirstListItem('');
        fideQuestions = record.sorular || fallbackFideQuestions;
        productList = record.urunListesi || [];
        // POP sistemindeki kodları ayrıştır
        const popSystemQuestion = fideQuestions.find(q => q.type === 'pop_system');
        if (popSystemQuestion) {
            popCodes = popSystemQuestion.popCodes || [];
            expiredCodes = popSystemQuestion.expiredCodes || [];
        }
        document.getElementById('initialization-error').style.display = 'none';
    } catch (e) {
        console.error("FiDe soru listesi yüklenemedi:", e);
        fideQuestions = fallbackFideQuestions;
        productList = [];
        document.getElementById('initialization-error').style.display = 'block';
    }
}

async function loadStoreEmails() {
    try {
        const records = await pb.collection('storeEmails').getFullList();
        storeEmails = records.reduce((acc, record) => {
            acc[record.bayiKodu] = record.eposta;
            return acc;
        }, {});
    } catch (e) {
        console.error("Bayi e-postaları yüklenemedi:", e);
        storeEmails = {};
    }
}

async function loadExcelData() {
    try {
        const records = await pb.collection('excelData').getFullList();
        const dideRecord = records.find(r => r.tip === 'dide');
        const fideRecord = records.find(r => r.tip === 'fide');

        if (dideRecord) {
            dideData = dideRecord.veri || [];
            excelDataRecordId = dideRecord.id;
            document.getElementById('file-name').textContent = dideRecord.dosyaAdi || "DiDe verisi yüklü.";
        } else {
            dideData = [];
            excelDataRecordId = null;
            document.getElementById('file-name').textContent = "Henüz dosya seçilmedi.";
        }

        if (fideRecord) {
            fideData = fideRecord.veri || [];
            fideExcelDataRecordId = fideRecord.id;
            document.getElementById('fide-file-name').textContent = fideRecord.dosyaAdi || "FiDe verisi yüklü.";
        } else {
            fideData = [];
            fideExcelDataRecordId = null;
            document.getElementById('fide-file-name').textContent = "Henüz dosya seçilmedi.";
        }
    } catch (e) {
        console.error("Excel verisi yüklenemedi:", e);
        dideData = [];
        fideData = [];
    }
}

async function loadAllStoresFromPocketBase() {
    try {
        const record = await pb.collection('tumBayilerListesi').getFirstListItem('');
        uniqueStores = record.bayiListesi || [];
        tumBayilerRecordId = record.id;
        renderStoreList(uniqueStores);
    } catch (e) {
        console.error("Tüm bayiler listesi yüklenemedi:", e);
        uniqueStores = [];
        renderStoreList([]);
    }
}

async function loadAuditedReports() {
    try {
        const records = await pb.collection('allFideReports').getFullList();
        const currentMonth = new Date().getMonth() + 1;
        const currentYear = new Date().getFullYear();

        auditedThisMonth = records
            .filter(record => {
                const reportDate = new Date(record.sonGuncelleme);
                return reportDate.getMonth() + 1 === currentMonth && reportDate.getFullYear() === currentYear;
            })
            .map(record => record.bayiKodu);
        
        // Bayi listesini yeniden render ederek denetlenenleri işaretle
        if (uniqueStores.length > 0) {
            renderStoreList(uniqueStores);
        }
    } catch (e) {
        console.error("Denetim raporları yüklenemedi:", e);
        auditedThisMonth = [];
    }
}

// --- Arayüz (UI) Fonksiyonları ---

function renderStoreList(stores) {
    const listElement = document.getElementById('store-list');
    if (stores.length === 0) {
        listElement.innerHTML = '<p class="empty-list-message">Gösterilecek bayi bulunamadı. Lütfen "Bayi Yöneticisi" modülünden bayi listesini yükleyin.</p>';
        return;
    }
    listElement.innerHTML = stores.map(store => `
        <div class="store-item ${auditedThisMonth.includes(store.bayiKodu) ? 'audited' : ''}" onclick="selectStore('${store.bayiKodu}')">
            <span class="store-name">${store.bayiAdi} (${store.bayiKodu})</span>
            <span class="store-region">${store.bolge}</span>
        </div>
    `).join('');
}

function filterStoreList() {
    const searchTerm = document.getElementById('store-search-input').value.toLowerCase();
    const filteredStores = uniqueStores.filter(store =>
        store.bayiAdi.toLowerCase().includes(searchTerm) ||
        store.bayiKodu.toLowerCase().includes(searchTerm)
    );
    renderStoreList(filteredStores);
}

function selectStore(bayiKodu) {
    selectedStore = uniqueStores.find(s => s.bayiKodu === bayiKodu);
    if (selectedStore) {
        document.getElementById('store-search-input').value = `${selectedStore.bayiAdi} (${selectedStore.bayiKodu})`;
        document.getElementById('store-list').innerHTML = '';
        checkExistingReport(bayiKodu);
    }
}

async function checkExistingReport(bayiKodu) {
    showLoading(true);
    try {
        const record = await pb.collection('allFideReports').getFirstListItem(`bayiKodu = "${bayiKodu}"`);
        if (confirm(`'${selectedStore.bayiAdi}' için daha önce kaydedilmiş bir rapor bulundu. Raporu yüklemek istiyor musunuz? 'İptal' derseniz temiz bir form açılacaktır.`)) {
            renderForm(record.raporVerisi);
        } else {
            renderForm();
        }
    } catch (e) {
        // Kayıt bulunamadıysa (404 hatası), temiz form aç
        if (e.status === 404) {
            renderForm();
        } else {
            console.error("Rapor kontrol edilirken hata:", e);
            alert("Mevcut rapor kontrol edilirken bir hata oluştu.");
        }
    } finally {
        showLoading(false);
    }
}


function renderForm(savedReport = null) {
    const formContent = document.getElementById('form-content');
    formContent.innerHTML = fideQuestions
        .map(q => createQuestionHTML(q, savedReport ? savedReport.questions_status[q.id] : null))
        .join('');

    // Kayıtlı rapor varsa, olay dinleyicilerini ekledikten sonra durumu uygula
    if (savedReport) {
        fideQuestions.forEach(q => {
            const status = savedReport.questions_status[q.id];
            if (status) {
                const itemDiv = document.getElementById(`fide-item-${q.id}`);
                if (itemDiv) {
                    if (status.removed) itemDiv.classList.add('question-removed');
                    if (status.completed) {
                        const titleContainer = itemDiv.querySelector('.fide-title-container');
                        if (titleContainer) titleContainer.classList.add('question-completed');
                    }
                    // Diğer alanları doldurma (ürün listesi, pop vb.)
                    if (q.type === 'product_list' && status.selectedProducts) {
                        status.selectedProducts.forEach(p => addProductToList(p.code, p.qty));
                    }
                    if (q.type === 'pop_system' && status.selectedPops) {
                        status.selectedPops.forEach(popId => {
                            const checkbox = document.querySelector(`.pop-checkbox[value="${popId}"]`);
                            if (checkbox) checkbox.checked = true;
                        });
                    }
                }
            }
        });
    }
    
    updateFormInteractivity(true);
}

function resetForm() {
    if (confirm("Mevcut formdaki tüm veriler silinecek ve temiz bir rapor sayfası açılacaktır. Emin misiniz?")) {
        selectedStore = null;
        document.getElementById('store-search-input').value = '';
        renderForm();
    }
}

// --- Excel İşlemleri ---

async function handleExcelUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    const fileNameSpan = type === 'dide' ? document.getElementById('file-name') : document.getElementById('fide-file-name');
    fileNameSpan.textContent = `Okunuyor: ${file.name}`;
    showLoading(true);

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            const processedData = (type === 'dide') ? processDideData(jsonData) : processFideData(jsonData);

            const recordData = {
                tip: type,
                dosyaAdi: file.name,
                veri: processedData,
                yuklenmeTarihi: new Date().toISOString()
            };
            
            // Eğer daha önceden bir kayıt varsa güncelle, yoksa yeni oluştur
            const recordId = (type === 'dide') ? excelDataRecordId : fideExcelDataRecordId;
            if (recordId) {
                await pb.collection('excelData').update(recordId, recordData);
            } else {
                await pb.collection('excelData').create(recordData);
            }

            alert(`${type.toUpperCase()} verisi başarıyla işlendi ve sunucuya kaydedildi.`);
            await loadExcelData(); // Veriyi yeniden yükle ve arayüzü güncelle
        } catch (error) {
            console.error(`${type.toUpperCase()} Excel işleme hatası:`, error);
            alert(`${type.toUpperCase()} dosyası işlenirken bir hata oluştu. Lütfen dosya formatını kontrol edin.`);
            fileNameSpan.textContent = "Hata oluştu, tekrar deneyin.";
        } finally {
            showLoading(false);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function clearExcelData(type) {
    const recordId = (type === 'dide') ? excelDataRecordId : fideExcelDataRecordId;
    if (!recordId) {
        alert(`${type.toUpperCase()} için sunucuda yüklü bir veri bulunmuyor.`);
        return;
    }
    if (confirm(`Sunucuya yüklenmiş olan ${type.toUpperCase()} Excel verisini kalıcı olarak silmek istediğinizden emin misiniz?`)) {
        showLoading(true);
        try {
            await pb.collection('excelData').delete(recordId);
            alert(`${type.toUpperCase()} verisi sunucudan başarıyla silindi.`);
            await loadExcelData(); // Veriyi yeniden yükleyerek arayüzü güncelle
        } catch (error) {
            console.error(`${type.toUpperCase()} verisi silinirken hata:`, error);
            alert("Veri silinirken bir hata oluştu.");
        } finally {
            showLoading(false);
        }
    }
}

// --- Rapor Kaydetme ve E-posta Oluşturma ---

async function generateEmail() {
    if (!selectedStore) {
        alert("Lütfen önce bir bayi seçin.");
        return;
    }

    const reportData = buildReportData();
    showLoading(true);

    try {
        // Raporu PocketBase'e kaydet/güncelle
        let existingRecord;
        try {
            existingRecord = await pb.collection('allFideReports').getFirstListItem(`bayiKodu = "${selectedStore.bayiKodu}"`);
        } catch (e) {
            if (e.status !== 404) throw e; // 404 dışındaki hataları yeniden fırlat
        }
        
        const dataToSave = {
            bayiKodu: selectedStore.bayiKodu,
            raporVerisi: reportData,
            sonGuncelleme: new Date().toISOString()
        };

        if (existingRecord) {
            await pb.collection('allFideReports').update(existingRecord.id, dataToSave);
        } else {
            await pb.collection('allFideReports').create(dataToSave);
        }
        
        // E-posta şablonunu al
        let emailTemplate = "{YONETMEN_ADI} Bey Merhaba,\\nZiyaret etmiş olduğum {BAYI_BILGISI} bayi karnesi ektedir."; // Varsayılan
        try {
             const settingsRecord = await pb.collection('ayarlar').getFirstListItem('');
             if(settingsRecord && settingsRecord.emailSablonu) {
                emailTemplate = settingsRecord.emailSablonu;
             }
        } catch(e) {
            console.warn("E-posta şablonu ayarı bulunamadı, varsayılan kullanılıyor.");
        }

        const emailBody = createEmailBody(reportData, emailTemplate);
        const emailTo = storeEmails[selectedStore.bayiKodu] || '';
        
        // E-posta penceresini aç
        const mailtoLink = `mailto:${emailTo}?subject=${encodeURIComponent(selectedStore.bayiAdi)} FiDe Raporu&body=${encodeURIComponent(emailBody)}`;
        window.location.href = mailtoLink;
        
        alert("Rapor başarıyla sunucuya kaydedildi.");
        await loadAuditedReports(); // Denetim listesini anında güncelle

    } catch (error) {
        console.error("Rapor kaydetme veya e-posta oluşturma hatası:", error);
        alert("Rapor sunucuya kaydedilirken bir hata oluştu!");
    } finally {
        showLoading(false);
    }
}

function buildReportData() {
    // Bu fonksiyonun içeriği büyük ölçüde aynı kalabilir, 
    // çünkü sadece formdaki DOM elemanlarından veri topluyor.
    // Firebase ile doğrudan bir ilgisi yok.
    const reportData = {
        selectedStore,
        auditCompletedTimestamp: Date.now(),
        questions_status: {}
    };

    fideQuestions.forEach(q => {
        const itemDiv = document.getElementById(`fide-item-${q.id}`);
        const isRemoved = itemDiv ? itemDiv.classList.contains('question-removed') : false;
        const titleContainer = itemDiv ? itemDiv.querySelector('.fide-title-container') : null;
        const isCompleted = titleContainer ? titleContainer.classList.contains('question-completed') : false;
        
        if (!itemDiv && q.isArchived) { return; }

        const questionData = { removed: isRemoved, completed: isCompleted, dynamicInputs: [], selectedProducts: [], selectedPops: [] };

        if (itemDiv) {
            if (q.type === 'standard') questionData.dynamicInputs = getDynamicInputsForSaving(`fide${q.id}`);
            else if (q.type === 'product_list') {
                document.querySelectorAll('#selected-products-list .selected-product-item').forEach(item => questionData.selectedProducts.push({ code: item.dataset.code, qty: item.dataset.qty }));
                questionData.dynamicInputs = getDynamicInputsForSaving(`fide${q.id}_pleksi`);
            } else if (q.type === 'pop_system') questionData.selectedPops = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value);
        }
        reportData.questions_status[q.id] = questionData;
    });
    return reportData;
}


// --- Yardımcı Fonksiyonlar ---

function showLoading(show) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
}

function updateConnectionIndicator() {
    const switchDiv = document.getElementById('connection-status-switch');
    const textSpan = document.getElementById('connection-status-text');
    if (pb.authStore.isValid) {
        switchDiv.classList.remove('disconnected');
        switchDiv.classList.add('connected');
        textSpan.textContent = "Bağlandı";
    } else {
        switchDiv.classList.remove('connected');
        switchDiv.classList.add('disconnected');
        textSpan.textContent = "Bağlı Değil";
    }
}

async function confirmAndClearAllData() {
    const confirmation = prompt("BU İŞLEM GERİ ALINAMAZ!\nSunucudaki TÜM raporları, Excel verilerini ve bayi listesini kalıcı olarak silmek istediğinizden emin misiniz? Devam etmek için 'SİL' yazın.");
    if (confirmation === 'SİL') {
        showLoading(true);
        try {
            // Her bir koleksiyondaki tüm kayıtları sil
            const collections = ['allFideReports', 'excelData', 'tumBayilerListesi', 'storeEmails'];
            for (const collectionName of collections) {
                const records = await pb.collection(collectionName).getFullList();
                for (const record of records) {
                    await pb.collection(collectionName).delete(record.id);
                }
            }
            alert("Tüm veriler sunucudan başarıyla silindi. Sayfa yenileniyor.");
            window.location.reload();
        } catch (error) {
            console.error("Tüm veriler silinirken hata:", error);
            alert("Veriler silinirken bir hata oluştu.");
        } finally {
            showLoading(false);
        }
    } else {
        alert("İşlem iptal edildi.");
    }
}


// --- Diğer Fonksiyonlar (createQuestionHTML, createEmailBody vb.) ---
// Bu fonksiyonların çoğu doğrudan DOM manipülasyonu yaptığı ve veritabanı
// ile direkt konuşmadığı için büyük değişikliklere ihtiyaç duymaz.
// Bu fonksiyonlar aşağıda yer almaktadır ve içerikleri aynı kalmıştır.

function createQuestionHTML(q, status) {
    if (q.isArchived) return '';

    const getInputValue = (type, defaultValue = '') => {
        if (!status || !status.dynamicInputs) return defaultValue;
        const input = status.dynamicInputs.find(i => i.type === type);
        return input ? input.value : defaultValue;
    };

    let content = '';
    switch (q.type) {
        case 'standard':
            content = `
                <div class="fide-dynamic-inputs">
                    <input type="text" class="dynamic-input" data-input-type="aciklama" placeholder="Açıklama" value="${getInputValue('aciklama')}">
                    <input type="number" class="dynamic-input" data-input-type="adet" placeholder="Adet" value="${getInputValue('adet')}">
                    <input type="text" class="dynamic-input" data-input-type="puan" placeholder="Puan" value="${getInputValue('puan')}">
                </div>
            `;
            break;
        case 'product_list':
            content = `
                <div class="product-list-container">
                    <div class="product-controls">
                        <select id="product-select">
                            ${productList.map(p => `<option value="${p.code}">${p.name} (${p.code})</option>`).join('')}
                        </select>
                        <input type="number" id="product-qty" placeholder="Adet" min="1" value="1">
                        <button class="btn-secondary btn-sm" onclick="addProductToList()">Ekle</button>
                    </div>
                    <div id="selected-products-list"></div>
                </div>
                <div class="fide-dynamic-inputs" style="margin-top: 10px;">
                     <input type="text" class="dynamic-input" data-input-type="pleksi_aciklama" placeholder="Pleksi Açıklama" value="${getInputValue('pleksi_aciklama', 'Pleksi')}">
                     <input type="number" class="dynamic-input" data-input-type="pleksi_adet" placeholder="Pleksi Adet" value="${getInputValue('pleksi_adet', 1)}">
                </div>
            `;
            break;
        case 'pop_system':
            const allPopCodes = [...new Set([...popCodes, ...expiredCodes])];
            content = `
                <div class="pop-system-container">
                    ${allPopCodes.map(code => `
                        <label class="pop-checkbox-label ${expiredCodes.includes(code) ? 'expired' : ''}">
                            <input type="checkbox" class="pop-checkbox" value="${code}"> ${code}
                        </label>
                    `).join('')}
                </div>
            `;
            break;
    }

    return `
        <div class="card fide-item" id="fide-item-${q.id}">
            <div class="fide-title-container">
                <h3 class="fide-title">${q.id}. ${q.title}</h3>
                <div class="fide-actions">
                    <button class="btn-icon" onclick="toggleQuestionCompleted(${q.id})" title="Tamamlandı olarak işaretle"><i class="fas fa-check"></i></button>
                    <button class="btn-icon" onclick="toggleQuestionRemoved(${q.id})" title="Bu soruyu rapordan çıkar"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="fide-content">${content}</div>
        </div>
    `;
}

function toggleQuestionCompleted(id) {
    const titleContainer = document.querySelector(`#fide-item-${id} .fide-title-container`);
    titleContainer.classList.toggle('question-completed');
}

function toggleQuestionRemoved(id) {
    const itemDiv = document.getElementById(`fide-item-${id}`);
    itemDiv.classList.toggle('question-removed');
}

function addProductToList(productCode, quantity) {
    const listDiv = document.getElementById('selected-products-list');
    const productSelect = document.getElementById('product-select');
    const qtyInput = document.getElementById('product-qty');

    const code = productCode || productSelect.value;
    const qty = quantity || qtyInput.value;
    const productName = productList.find(p => p.code === code)?.name || "Bilinmeyen Ürün";

    if (!code || !qty || parseInt(qty) < 1) {
        alert("Lütfen geçerli bir ürün ve adet girin.");
        return;
    }

    const existingItem = listDiv.querySelector(`.selected-product-item[data-code="${code}"]`);
    if (existingItem) {
        alert("Bu ürün zaten listeye eklenmiş.");
        return;
    }

    const newItem = document.createElement('div');
    newItem.className = 'selected-product-item';
    newItem.dataset.code = code;
    newItem.dataset.qty = qty;
    newItem.innerHTML = `
        <span>${productName} (${code}) - Adet: ${qty}</span>
        <button class="btn-icon btn-danger-icon" onclick="this.parentElement.remove()"><i class="fas fa-trash-alt"></i></button>
    `;
    listDiv.appendChild(newItem);

    // Formu temizle
    qtyInput.value = 1;
}

function getDynamicInputsForSaving(questionId) {
    const parentSelector = questionId.includes('_pleksi') ? 
        `#fide-item-${questionId.split('_')[0]} .fide-dynamic-inputs` :
        `#fide-item-${questionId.replace('fide', '')} .fide-dynamic-inputs`;

    const parentDiv = document.querySelector(parentSelector);
    if (!parentDiv) return [];
    
    const inputs = parentDiv.querySelectorAll('.dynamic-input');
    const values = [];
    inputs.forEach(input => {
        if (input.value.trim() !== '') {
            values.push({
                type: input.dataset.inputType,
                value: input.value
            });
        }
    });
    return values;
}

function processDideData(data) {
    const requiredColumns = ["Bayi Kodu", "Bayi Adı", "DiDe Puanı"];
    if (!requiredColumns.every(col => data[0].hasOwnProperty(col))) {
        throw new Error("Excel dosyasında gerekli sütunlar bulunamadı: " + requiredColumns.join(', '));
    }
    return data.map(row => ({
        bayiKodu: String(row["Bayi Kodu"]),
        bayiAdi: row["Bayi Adı"],
        didePuani: parseFloat(row["DiDe Puanı"])
    }));
}

function processFideData(data) {
     const requiredColumns = ["Bayi Kodu", "FiDe Puanı"];
     if (!requiredColumns.every(col => data[0].hasOwnProperty(col))) {
        throw new Error("Excel dosyasında gerekli sütunlar bulunamadı: " + requiredColumns.join(', '));
    }
    return data.map(row => ({
        bayiKodu: String(row["Bayi Kodu"]),
        fidePuani: parseFloat(row["FiDe Puanı"])
    }));
}


function createEmailBody(reportData, template) {
    let body = template
        .replace('{YONETMEN_ADI}', reportData.selectedStore.yonetmen || 'Yönetmen Bilgisi Yok')
        .replace('{BAYI_BILGISI}', `${reportData.selectedStore.bayiAdi} (${reportData.selectedStore.bayiKodu})`);
    
    body += "\n\n--- DENETİM DETAYLARI ---\n";
    
    // DiDe ve FiDe puanlarını ekle
    const storeDideData = dideData.find(d => d.bayiKodu === reportData.selectedStore.bayiKodu);
    const storeFideData = fideData.find(f => f.bayiKodu === reportData.selectedStore.bayiKodu);
    if (storeDideData) body += `\nDiDe Puanı: ${storeDideData.didePuani}`;
    if (storeFideData) body += `\nFiDe Puanı: ${storeFideData.fidePuani}`;
    if (storeDideData || storeFideData) body += "\n--------------------\n";


    fideQuestions.forEach(q => {
        const status = reportData.questions_status[q.id];
        if (!status || status.removed || q.isArchived) return;

        body += `\n${q.title} - ${status.completed ? 'EVET' : 'HAYIR'}\n`;

        if (q.type === 'standard' && status.dynamicInputs) {
            status.dynamicInputs.forEach(input => {
                body += `  - ${input.type}: ${input.value}\n`;
            });
        }
        if (q.type === 'product_list') {
            if (status.selectedProducts && status.selectedProducts.length > 0) {
                 body += "  - Seçilen Perakende Malzemeleri:\n";
                 status.selectedProducts.forEach(p => {
                    const productName = productList.find(pl => pl.code === p.code)?.name || p.code;
                    body += `    * ${productName}: ${p.qty} adet\n`;
                });
            }
             if (status.dynamicInputs) {
                status.dynamicInputs.forEach(input => {
                    body += `  - ${input.type}: ${input.value}\n`;
                });
            }
        }
        if (q.type === 'pop_system' && status.selectedPops && status.selectedPops.length > 0) {
            body += `  - Seçilen POP'lar: ${status.selectedPops.join(', ')}\n`;
        }
    });

    return body;
}


function updateFormInteractivity(enable) {
    const formContent = document.getElementById('form-content');
    if (!formContent) return;

    const allElements = formContent.querySelectorAll(
        'button, input, select, textarea'
    );
    
    allElements.forEach(el => {
        el.disabled = !enable;
    });
}