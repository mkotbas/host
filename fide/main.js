// --- Global Değişkenler ---
let dideData = [], fideData = [], uniqueStores = [], selectedStore = null;
let fideQuestions = [], popCodes = [], expiredCodes = [], productList = [];
let migrationMap = {}, storeEmails = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
const monthNames = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let isPocketBaseConnected = false;
let auditedThisMonth = []; 

// --- Ana Uygulama Mantığı ---
window.onload = initializeApp;

async function initializeApp() {
    // DÜZELTME: Butonların çalışması için olay dinleyicilerini en başta kuruyoruz.
    setupEventListeners();

    // PocketBase'de oturumun kalıcı olması SDK tarafından otomatik yönetilir.
    // Auth durumunu kontrol edip arayüzü güncelleyelim.
    const userLoggedIn = pb.authStore.isValid;
    
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    
    if (userLoggedIn) {
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
        loginPopup.style.display = 'none';
    } else {
        loginToggleBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'none';
    }

    await checkPocketBaseConnection();
    await loadInitialData();
    updateFormInteractivity(selectedStore !== null);
}

// YENİ FONKSİYON: PocketBase bağlantısını test eder
async function checkPocketBaseConnection() {
    try {
        const health = await pb.health.check();
        isPocketBaseConnected = health.code === 200;
    } catch (error) {
        isPocketBaseConnected = false;
        console.error("PocketBase bağlantı hatası:", error);
    }
    updateConnectionIndicator();
}


async function loadStoreEmails() {
    storeEmails = {}; 
    if (!pb.authStore.isValid) return;

    try {
        // PocketBase'de 'bayiler' collection'ından tüm kayıtları çekiyoruz.
        const records = await pb.collection('bayiler').getFullList({
            fields: 'bayi_kodu, email', // Sadece ihtiyacımız olan alanları çekiyoruz
        });
        
        records.forEach(bayi => {
            if (bayi.bayi_kodu && bayi.email) {
                storeEmails[bayi.bayi_kodu] = bayi.email;
            }
        });
    } catch (error) {
        console.error("Buluttan bayi e-postaları yüklenemedi:", error);
    }
}


async function loadMigrationMap() {
    migrationMap = {}; 
    if (!pb.authStore.isValid) return;

    try {
        // 'ayarlar' collection'ından 'migrationMap' anahtarlı kaydı arıyoruz.
        const record = await pb.collection('ayarlar').getFirstListItem('anahtar = "migrationMap"');
        migrationMap = record.deger || {};
    } catch (error) {
        // Kayıt bulunamazsa hata vermemesi için kontrol ekliyoruz.
        if (error.status !== 404) {
            console.error("Buluttan veri taşıma ayarları yüklenemedi:", error);
        }
    }
}

async function loadMonthlyAuditData() {
    auditedThisMonth = [];
    if (!pb.authStore.isValid) return;

    try {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();

        // Bu ay tamamlanmış raporları filtreleyerek çekiyoruz
        const reports = await pb.collection('raporlar').getFullList({
            filter: `denetim_tamamlandi_tarihi >= "${firstDayOfMonth}"`,
            expand: 'bayi', // İlişkili bayi bilgisini de getir
            fields: 'expand.bayi.bayi_kodu',
        });
        
        const monthlyCodesFromReports = reports.map(r => r.expand.bayi.bayi_kodu);
        
        // PocketBase'de `denetimGeriAlinanlar` verisi `ayarlar` collection'ında tutulabilir.
        let geriAlinanBayiKodlariBuAy = [];
        try {
            const currentMonthKey = `geriAlinanlar_${today.getFullYear()}-${today.getMonth()}`;
            const geriAlinanlarRecord = await pb.collection('ayarlar').getFirstListItem(`anahtar = "${currentMonthKey}"`);
            geriAlinanBayiKodlariBuAy = geriAlinanlarRecord.deger || [];
        } catch (err) {
            if (err.status !== 404) console.error("Geri alınanlar verisi okunurken hata:", err);
        }

        const uniqueMonthlyCodes = [...new Set(monthlyCodesFromReports)];
        auditedThisMonth = uniqueMonthlyCodes.filter(code => !geriAlinanBayiKodlariBuAy.includes(code));

    } catch (error) {
        console.error("Bu ay denetlenen bayi verileri yüklenirken hata oluştu:", error);
    }
}


async function loadInitialData() {
    if (!pb.authStore.isValid) {
        buildForm();
        return;
    }
    
    await loadMigrationMap();
    await loadStoreEmails();
    await loadMonthlyAuditData(); 
    let questionsLoaded = false;

    try {
        // Soruları ve ürün listesini 'ayarlar' collection'ından çekiyoruz
        const fideQuestionsRecord = await pb.collection('ayarlar').getFirstListItem('anahtar = "fideSorulari"');
        const productListRecord = await pb.collection('ayarlar').getFirstListItem('anahtar = "urunListesi"');
        
        if (fideQuestionsRecord && fideQuestionsRecord.deger) {
            fideQuestions = fideQuestionsRecord.deger || [];
            questionsLoaded = true;
        }
        if (productListRecord && productListRecord.deger) {
            productList = productListRecord.deger || [];
        }
        console.log("Sorular ve ürün listesi başarıyla buluttan yüklendi.");

    } catch (error) {
        if(error.status !== 404) {
             console.error("PocketBase'den ayar verisi okunurken hata oluştu:", error);
        }
    }
    
    if (!questionsLoaded) {
        fideQuestions = fallbackFideQuestions;
        document.getElementById('initialization-error').style.display = 'block';
    }

    const popSystemQuestion = fideQuestions.find(q => q.type === 'pop_system');
    if (popSystemQuestion) {
        popCodes = popSystemQuestion.popCodes || [];
        expiredCodes = popSystemQuestion.expiredCodes || [];
    }

    // Bağlantı kontrolü düzenli aralıklarla yapılabilir
    setInterval(checkPocketBaseConnection, 30000); // 30 saniyede bir kontrol et

    await loadExcelData();
    buildForm();
}


async function loadExcelData() {
    if (!pb.authStore.isValid) return;

    try {
        // Dide verisini çek
        const dideRecord = await pb.collection('excel_verileri').getFirstListItem('tip = "dide"');
        if (dideRecord.dosya_adi) { document.getElementById('file-name').textContent = `Buluttan yüklendi: ${dideRecord.dosya_adi}`; }
        populateDideState(dideRecord.veri);

    } catch (error) {
        if(error.status !== 404) console.error("Buluttan DiDe Excel verisi yüklenirken hata oluştu:", error);
    }
    
    try {
        // Fide verisini çek
        const fideRecord = await pb.collection('excel_verileri').getFirstListItem('tip = "fide"');
        if (fideRecord.dosya_adi) { document.getElementById('fide-file-name').textContent = `Buluttan yüklendi: ${fideRecord.dosya_adi}`; }
        populateFideState(fideRecord.veri);
    } catch(error){
        if(error.status !== 404) console.error("Buluttan FiDe Excel verisi yüklenirken hata oluştu:", error);
    }
}


function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = isPocketBaseConnected && pb.authStore.isValid;
    
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
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
    
    document.getElementById('clear-storage-btn').addEventListener('click', async () => {
        const dogruSifreHash = 'ZmRlMDAx'; // "fde001"
        const girilenSifre = prompt("Bu işlem geri alınamaz. Buluttaki TÜM uygulama verilerini kalıcı olarak silmek için lütfen şifreyi girin:");

        if (girilenSifre) { 
            const girilenSifreHash = btoa(girilenSifre);
            if (girilenSifreHash === dogruSifreHash) {
                if (confirm("Şifre doğru. Emin misiniz? Kaydedilmiş TÜM bayi raporları, yüklenmiş Excel dosyaları ve diğer ayarlar dahil olmak üzere bulutta saklanan BÜTÜN uygulama verileri kalıcı olarak silinecektir.")) {
                    if(pb.authStore.isValid){
                        try {
                            // Tüm collection'lardaki kayıtları silmek için döngü
                            const collectionsToDelete = ['raporlar', 'excel_verileri', 'ayarlar']; // 'bayiler' hariç
                            for (const collectionName of collectionsToDelete) {
                                const records = await pb.collection(collectionName).getFullList({ fields: 'id' });
                                for (const record of records) {
                                    await pb.collection(collectionName).delete(record.id);
                                }
                            }
                            alert("Tüm bulut verileri başarıyla temizlendi. Sayfa yenileniyor.");
                            window.location.reload();
                        } catch (error) {
                            alert("Veriler silinirken bir hata oluştu: " + error.message);
                        }
                    } else {
                        alert("Bu işlem için giriş yapmış olmalısınız.");
                    }
                }
            } else {
                alert("Hatalı şifre! Silme işlemi iptal edildi.");
            }
        }
    });

    document.getElementById('clear-excel-btn').addEventListener('click', async () => {
        if (confirm("Yüklenmiş olan DiDe Excel verisini buluttan silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
            if(pb.authStore.isValid) {
                try {
                    const record = await pb.collection('excel_verileri').getFirstListItem('tip = "dide"');
                    await pb.collection('excel_verileri').delete(record.id);
                    alert("DiDe Excel verisi buluttan temizlendi. Sayfa yenileniyor.");
                    window.location.reload();
                } catch (error) {
                     if(error.status !== 404) alert("DiDe verisi silinirken hata: " + error.message);
                     else { // Eğer zaten silinmişse veya hiç yoksa
                        alert("Silinecek DiDe verisi bulunamadı. Sayfa yenileniyor.");
                        window.location.reload();
                     }
                }
            } else {
                alert("Bu işlem için giriş yapmış olmalısınız.");
            }
        }
    });

     document.getElementById('clear-fide-excel-btn').addEventListener('click', async () => {
        if (confirm("Yüklenmiş olan FiDe Excel verisini buluttan silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
            if(pb.authStore.isValid) {
                try {
                    const record = await pb.collection('excel_verileri').getFirstListItem('tip = "fide"');
                    await pb.collection('excel_verileri').delete(record.id);
                    alert("FiDe Excel verisi buluttan temizlendi. Sayfa yenileniyor.");
                    window.location.reload();
                } catch (error) {
                    if(error.status !== 404) alert("FiDe verisi silinirken hata: " + error.message);
                     else {
                        alert("Silinecek FiDe verisi bulunamadı. Sayfa yenileniyor.");
                        window.location.reload();
                     }
                }
            } else {
                alert("Bu işlem için giriş yapmış olmalısınız.");
            }
        }
    });
    
    document.getElementById('store-search-input').addEventListener('keyup', (e) => {
        selectedStore = null; 
        const filter = e.target.value.toLowerCase().trim();
        const storeListDiv = document.getElementById('store-list');
        storeListDiv.style.display = 'block';
        if (filter === "") {
            storeListDiv.innerHTML = ''; 
            return;
        }
        const filteredStores = uniqueStores.filter(store => 
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
        pb.authStore.clear(); // PocketBase oturumunu kapat
        window.location.reload(); 
    });

    loginSubmitBtn.addEventListener('click', async () => {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = '';
        if (!email || !password) { errorDiv.textContent = 'Lütfen tüm alanları doldurun.'; return; }
        
        try {
            // PocketBase kullanıcı girişi
            await pb.collection('users').authWithPassword(email, password);
            loginPopup.style.display = 'none'; 
            window.location.reload();
        } catch (error) {
            errorDiv.textContent = 'E-posta veya şifre hatalı.';
        }
    });

    window.addEventListener('click', function(event) {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });

    document.getElementById('toggle-backup-manager-btn').addEventListener('click', () => {
        window.open('admin/admin.html', '_blank');
    });
}


async function saveFormState(isFinalizing = false) {
    if (!document.getElementById('form-content').innerHTML || !selectedStore || !pb.authStore.isValid) return;

    const reportData = getFormDataForSaving();
    const bayiKodu = String(selectedStore.bayiKodu);

    try {
        // İlişkili bayinin ID'sini bul
        const bayiRecord = await pb.collection('bayiler').getFirstListItem(`bayi_kodu = "${bayiKodu}"`);

        // Bu bayiye ait mevcut bir rapor var mı diye kontrol et
        let existingReport = null;
        try {
            existingReport = await pb.collection('raporlar').getFirstListItem(`bayi = "${bayiRecord.id}"`);
        } catch (error) {
            if (error.status !== 404) throw error; // 404 dışındaki hataları yeniden fırlat
        }

        if (existingReport && existingReport.denetim_tamamlandi_tarihi) {
            reportData.auditCompletedTimestamp = existingReport.denetim_tamamlandi_tarihi;
        }

        if (isFinalizing) {
            if (!auditedThisMonth.includes(bayiKodu)) {
                 reportData.auditCompletedTimestamp = new Date().toISOString(); // ISO formatında kaydet
                 await removeStoreCodeFromRevertedList(bayiKodu);
            }
        }

        const dataToSave = {
            bayi: bayiRecord.id,
            denetci: pb.authStore.model.id,
            rapor_verisi: reportData, // Tüm rapor JSON'ı
            denetim_tamamlandi_tarihi: reportData.auditCompletedTimestamp || null,
        };

        if (existingReport) {
            // Rapor varsa güncelle
            await pb.collection('raporlar').update(existingReport.id, dataToSave);
        } else {
            // Rapor yoksa yeni oluştur
            await pb.collection('raporlar').create(dataToSave);
        }
    } catch (error) {
        console.error("PocketBase yazma hatası:", error);
    }
}


async function removeStoreCodeFromRevertedList(bayiKodu) {
    if (!pb.authStore.isValid) return;

    const today = new Date();
    const currentMonthKey = `geriAlinanlar_${today.getFullYear()}-${today.getMonth()}`;
    
    try {
        let record = null;
        try {
            record = await pb.collection('ayarlar').getFirstListItem(`anahtar = "${currentMonthKey}"`);
        } catch (err) {
            if (err.status !== 404) throw err;
        }

        if (record && record.deger) {
            const index = record.deger.indexOf(bayiKodu);
            if (index > -1) {
                record.deger.splice(index, 1);
                await pb.collection('ayarlar').update(record.id, { deger: record.deger });
                console.log(`Bayi ${bayiKodu} geri alınanlar listesinden başarıyla çıkarıldı.`);
            }
        }
    } catch (error) {
        console.error("Geri alınanlar listesi güncellenirken hata oluştu:", error);
    }
}


async function loadReportForStore(bayiKodu) {
    if (!pb.authStore.isValid) {
        resetForm();
        return;
    }

    try {
        // Bayi ID'sini bul, sonra o ID ile raporu ara
        const bayiRecord = await pb.collection('bayiler').getFirstListItem(`bayi_kodu = "${bayiKodu}"`);
        const reportRecord = await pb.collection('raporlar').getFirstListItem(`bayi = "${bayiRecord.id}"`);
        
        loadReport(reportRecord.rapor_verisi); // Raporun içindeki JSON verisini yükle
    } catch (error) {
        if (error.status === 404) {
            console.log("Bu bayi için kaydedilmiş rapor bulunamadı. Temiz form başlatılıyor.");
            resetForm();
        } else {
            console.error("PocketBase'den okuma hatası:", error);
            resetForm();
        }
    }
}

// Bu fonksiyon aynı kalıyor
function getUnitForProduct(productName) {
    const upperCaseName = productName.toUpperCase();
    if (upperCaseName.includes('TSHIRT') || upperCaseName.includes('HIRKA')) { return 'Adet'; }
    return 'Paket';
}
// Bu fonksiyon aynı kalıyor
function resetForm() { document.getElementById('form-content').innerHTML = ''; buildForm(); }

// Bu fonksiyon aynı kalıyor
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

// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
function toggleCompleted(button) {
    const input = button.parentElement.querySelector('input[type="text"]');
    const isCompleted = input.classList.toggle('completed');
    input.readOnly = isCompleted;
    button.innerHTML = isCompleted ? '<i class="fas fa-undo"></i> Geri Al' : '<i class="fas fa-check"></i> Tamamlandı';
    button.classList.toggle('undo', isCompleted);
    saveFormState();
}
// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
function checkExpiredPopCodes() {
    const warningMessage = document.getElementById('expiredWarning');
    if (!warningMessage) return;
    const hasExpired = Array.from(document.querySelectorAll('.pop-checkbox:checked')).some(cb => expiredCodes.includes(cb.value));
    warningMessage.style.display = hasExpired ? 'block' : 'none';
}
// Bu fonksiyon aynı kalıyor
function copySelectedCodes() {
    const nonExpiredCodes = Array.from(document.querySelectorAll('.pop-checkbox:checked')).map(cb => cb.value).filter(code => !expiredCodes.includes(code));
    if (nonExpiredCodes.length === 0) return alert("Kopyalamak için geçerli kod seçin.");
    navigator.clipboard.writeText(nonExpiredCodes.join(', ')).then(() => alert("Seçilen geçerli kodlar kopyalandı!"));
}
// Bu fonksiyon aynı kalıyor
function clearSelectedCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => cb.checked = false);
    checkExpiredPopCodes();
    saveFormState();
}
// Bu fonksiyon aynı kalıyor
function selectExpiredCodes() {
    document.querySelectorAll('.pop-checkbox').forEach(cb => { cb.checked = expiredCodes.includes(cb.value); });
    checkExpiredPopCodes();
    saveFormState();
}
// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
function handleFileSelect(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    const filename = file.name;
    const fileNameSpan = type === 'dide' ? document.getElementById('file-name') : document.getElementById('fide-file-name');
    fileNameSpan.textContent = `Yüklü dosya: ${filename}`;
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
            if (type === 'dide') { processDideExcelData(dataAsArray, true, filename); } else { processFideExcelData(dataAsArray, true, filename); }
        } catch (error) { alert("Excel dosyası okunurken bir hata oluştu."); console.error("Excel okuma hatası:", error); }
    };
}


async function processDideExcelData(dataAsArray, saveToCloud = false, filename = '') {
    // ... Excel işleme mantığı aynı kalır ...
    if (dataAsArray.length < 2) return alert('DiDe Excel dosyası beklenen formatta değil (en az 2 satır gerekli).');
    let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim() === 'Bayi Kodu'));
    if (headerRowIndex === -1) return alert('DiDe Excel dosyasında "Bayi Kodu" içeren bir başlık satırı bulunamadı.');
    const headerRow = dataAsArray[headerRowIndex].map(h => typeof h === 'string' ? h.trim() : h);
    const dataRows = dataAsArray.slice(headerRowIndex + 1);
    const bayiKoduIndex = headerRow.indexOf('Bayi Kodu');
    const bayiIndex = headerRow.indexOf('Bayi');
    const bayiYonetmeniIndex = headerRow.indexOf('Bayi Yönetmeni');
    if ([bayiKoduIndex, bayiIndex, bayiYonetmeniIndex].includes(-1)) return alert('DiDe Excel dosyasında "Bayi Kodu", "Bayi" veya "Bayi Yönetmeni" sütunlarından biri bulunamadı.');
    const processedData = dataRows.map(row => {
        if (!row[bayiKoduIndex]) return null;
        const scores = {};
        headerRow.forEach((header, index) => {
            const monthNumber = parseInt(header);
            if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
                if(row[index] !== null && row[index] !== undefined) scores[monthNumber] = row[index];
            }
        });
        return { 'Bayi Kodu': row[bayiKoduIndex], 'Bayi': row[bayiIndex], 'Bayi Yönetmeni': row[bayiYonetmeniIndex], 'scores': scores };
    }).filter(d => d);
    
    if (saveToCloud && pb.authStore.isValid) {
        const dataToSave = {
            tip: 'dide',
            dosya_adi: filename,
            veri: processedData,
            yukleyen: pb.authStore.model.id,
        };
        try {
            // Önce mevcut dide verisini bulup sil, sonra yenisini ekle (update or create)
            const oldRecord = await pb.collection('excel_verileri').getFirstListItem('tip = "dide"');
            await pb.collection('excel_verileri').update(oldRecord.id, dataToSave);
        } catch (error) {
            if (error.status === 404) { // Kayıt yoksa yeni oluştur
                await pb.collection('excel_verileri').create(dataToSave);
            } else {
                console.error("DiDe verisi kaydedilirken hata:", error);
            }
        }
        alert('DiDe puan dosyası başarıyla işlendi ve buluta kaydedildi.');
    }
    populateDideState(processedData);
}


async function processFideExcelData(dataAsArray, saveToCloud = false, filename = '') {
    // ... Excel işleme mantığı aynı kalır ...
     if (dataAsArray.length < 3) return alert('FiDe Excel dosyası beklenen formatta değil (en az 3 satır gerekli).');
    const currentYear = new Date().getFullYear();
    let yearRowIndex = -1;
    for(let i = 0; i < dataAsArray.length; i++) {
        if(dataAsArray[i].some(cell => String(cell).trim() == currentYear)) {
            yearRowIndex = i;
            break;
        }
    }
    if (yearRowIndex === -1) return alert(`FiDe Excel dosyasında '${currentYear}' yılını içeren bir satır bulunamadı.`);
    const yearRow = dataAsArray[yearRowIndex];
    const filledYearRow = [];
    let lastKnownYear = null;
    for (const cell of yearRow) {
        if (cell !== null && cell !== undefined && String(cell).trim() !== "") { lastKnownYear = String(cell).trim(); }
        filledYearRow.push(lastKnownYear);
    }
    let monthRowIndex = yearRowIndex + 1;
    if (monthRowIndex >= dataAsArray.length) return alert('FiDe Excel dosyasında ay bilgileri (yıl satırının altında) bulunamadı.');
    const monthRow = dataAsArray[monthRowIndex];
    let headerRowIndex = dataAsArray.findIndex(row => row.some(cell => typeof cell === 'string' && cell.trim() === 'Bayi Kodu'));
    if (headerRowIndex === -1) return alert('FiDe Excel dosyasında "Bayi Kodu" içeren bir başlık satırı bulunamadı.');
    const headerRow = dataAsArray[headerRowIndex].map(h => typeof h === 'string' ? h.trim() : h);
    const dataRows = dataAsArray.slice(headerRowIndex + 1);
    const bayiKoduIndex = headerRow.indexOf('Bayi Kodu');
    if (bayiKoduIndex === -1) return alert('FiDe Excel dosyasında "Bayi Kodu" sütunu bulunamadı.');
    const processedData = dataRows.map(row => {
        if (!row[bayiKoduIndex]) return null;
        const scores = {};
        for (let i = 0; i < filledYearRow.length; i++) {
            if (filledYearRow[i] == currentYear) {
                const monthNumber = parseInt(monthRow[i]);
                if (!isNaN(monthNumber) && monthNumber >= 1 && monthNumber <= 12) {
                    if(row[i] !== null && row[i] !== undefined && row[i] !== "") scores[monthNumber] = row[i];
                }
            }
        }
        return { 'Bayi Kodu': row[bayiKoduIndex], 'scores': scores };
    }).filter(d => d);

    if (saveToCloud && pb.authStore.isValid) {
         const dataToSave = {
            tip: 'fide',
            dosya_adi: filename,
            veri: processedData,
            yukleyen: pb.authStore.model.id,
        };
        try {
            const oldRecord = await pb.collection('excel_verileri').getFirstListItem('tip = "fide"');
            await pb.collection('excel_verileri').update(oldRecord.id, dataToSave);
        } catch (error) {
            if (error.status === 404) {
                await pb.collection('excel_verileri').create(dataToSave);
            } else {
                console.error("FiDe verisi kaydedilirken hata:", error);
            }
        }
        alert('FiDe puan dosyası başarıyla işlendi ve buluta kaydedildi.');
    }
    populateFideState(processedData);
}
// Bu fonksiyon aynı kalıyor
function populateDideState(data) {
    dideData = data;
    const storeMap = new Map();
    dideData.forEach(row => { 
        if (row['Bayi Kodu'] && !storeMap.has(row['Bayi Kodu'])) {
            storeMap.set(row['Bayi Kodu'], { bayiKodu: row['Bayi Kodu'], bayiAdi: row['Bayi'] });
        }
    });
    uniqueStores = Array.from(storeMap.values()).sort((a, b) => a.bayiAdi.localeCompare(b.bayiAdi));
    document.getElementById('store-list').innerHTML = '';
    document.getElementById('store-selection-area').style.display = 'block';
    document.getElementById('clear-storage-btn').style.display = 'inline-flex';
    document.getElementById('clear-excel-btn').style.display = 'inline-flex';
}
// Bu fonksiyon aynı kalıyor
function populateFideState(data) {
    fideData = data;
    document.getElementById('clear-fide-excel-btn').style.display = 'inline-flex';
}
// Bu fonksiyon aynı kalıyor
function displayStores(stores) {
    const storeListDiv = document.getElementById('store-list');
    storeListDiv.innerHTML = '';
    stores.forEach(store => {
        const item = document.createElement('div');
        item.className = 'store-item';
        let displayName = store.bayiAdi;
        if (displayName && displayName.length > 20) displayName = displayName.substring(0, 20) + '...';
        item.textContent = `${displayName} (${store.bayiKodu})`;
        item.dataset.bayiKodu = store.bayiKodu;
        item.dataset.bayiAdi = store.bayiAdi;
        item.addEventListener('click', () => {
            selectStore(store);
        });
        storeListDiv.appendChild(item);
    });
}
// Bu fonksiyon aynı kalıyor
function selectStore(store, loadSavedData = true) {
    if (auditedThisMonth.includes(String(store.bayiKodu))) {
        const proceed = confirm(
            `UYARI: Bu bayi (${store.bayiAdi} - ${store.bayiKodu}) bu ay içinde zaten denetlenmiş.\n\n` +
            `Rapora devam edebilirsiniz ancak bu işlem aylık denetim sayınızı ARTTIRMAYACAKTIR.\n\n` +
            `Yine de devam etmek istiyor musunuz?`
        );
        if (!proceed) {
            return; 
        }
    }

    document.querySelectorAll('.store-item').forEach(i => i.classList.remove('selected'));
    const storeItem = document.querySelector(`.store-item[data-bayi-kodu="${store.bayiKodu}"]`);
    if (storeItem) storeItem.classList.add('selected');
    
    selectedStore = { bayiKodu: store.bayiKodu, bayiAdi: store.bayiAdi };
    
    const searchInput = document.getElementById('store-search-input');
    let shortBayiAdi = store.bayiAdi.length > 20 ? store.bayiAdi.substring(0, 20) + '...' : store.bayiAdi;
    searchInput.value = `${store.bayiKodu} - ${shortBayiAdi}`;
    
    document.getElementById('store-list').innerHTML = '';
    document.getElementById('store-list').style.display = 'none';
    
    if (loadSavedData) {
        loadReportForStore(store.bayiKodu);
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

    let emailTemplate = null;
    if (pb.authStore.isValid) {
        try {
            // e-posta şablonunu 'ayarlar' collection'ından çek
            const record = await pb.collection('ayarlar').getFirstListItem('anahtar = "emailSablonu"');
            if (record && record.deger) {
                emailTemplate = record.deger;
            }
        } catch (error) {
            if(error.status !== 404) console.error("E-posta şablonu buluttan yüklenemedi.", error);
        }
    }

    if (!emailTemplate) {
        alert("HATA: E-posta şablonu buluttan yüklenemedi.\n\nLütfen internet bağlantınızı kontrol edin veya Yönetim Panelinden şablonu kaydedin.");
        return;
    }

    await saveFormState(true);

    const storeInfo = dideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    const fideStoreInfo = fideData.find(row => String(row['Bayi Kodu']) === String(selectedStore.bayiKodu));
    if (!storeInfo) {
        alert("Seçilen bayi için DiDe verisi bulunamadı. Lütfen DiDe Excel dosyasını yükleyin.");
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

    // Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
function loadReport(reportData) {
    if (!reportData || !reportData.questions_status) {
        console.warn("Rapor verisi bulunamadı veya 'questions_status' alanı eksik. Form sıfırlanıyor. Gelen Veri:", reportData);
        resetForm();
        updateFormInteractivity(true); 
        return; 
    }

    try {
        for (const oldId in migrationMap) {
            if (reportData.questions_status[oldId]) {
                const newId = migrationMap[oldId];
                if (!reportData.questions_status[newId]) {
                    reportData.questions_status[newId] = reportData.questions_status[oldId];
                    delete reportData.questions_status[oldId];
                }
            }
        }
        
        resetForm(); 

        if (reportData.selectedStore) {
            const storeData = uniqueStores.find(s => s.bayiKodu == reportData.selectedStore.bayiKodu);
            if(storeData) {
                selectedStore = { bayiKodu: storeData.bayiKodu, bayiAdi: storeData.bayiAdi };
                const searchInput = document.getElementById('store-search-input');
                let shortBayiAdi = storeData.bayiAdi.length > 20 ? storeData.bayiAdi.substring(0, 20) + '...' : storeData.bayiAdi;
                searchInput.value = `${storeData.bayiKodu} - ${shortBayiAdi}`;
            }
        }
        
        const formContainer = document.getElementById('form-content');

        for (const qId in reportData.questions_status) {
            let questionItem = document.getElementById(`fide-item-${qId}`);

            if (!questionItem) {
                const archivedQuestion = fideQuestions.find(q => String(q.id) === String(qId));
                if (archivedQuestion && archivedQuestion.isArchived) {
                    const questionHtml = generateQuestionHtml(archivedQuestion);
                    formContainer.insertAdjacentHTML('beforeend', questionHtml);
                    questionItem = document.getElementById(`fide-item-${qId}`);
                }
            }
            
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
// Bu fonksiyon aynı kalıyor
function startNewReport() {
    selectedStore = null;
    document.getElementById('store-search-input').value = '';
    resetForm();
    updateFormInteractivity(false);
}
// Bu fonksiyon aynı kalıyor
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
// Bu fonksiyon aynı kalıyor
function updateFormInteractivity(enable) {
    const formContent = document.getElementById('form-content');
    if (!formContent) return;

    const allElements = formContent.querySelectorAll(
        'button, input, select'
    );
    
    allElements.forEach(el => {
        el.disabled = !enable;
    });
}