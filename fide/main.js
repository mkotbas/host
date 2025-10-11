// --- Global Değişkenler (Uygulamanın genelinde kullanılacak hafıza alanları) ---
let dideData = [], fideData = [], uniqueStores = [], selectedStore = null;
let fideQuestions = [], popCodes = [], expiredCodes = [], productList = [];
let migrationMap = {}, storeEmails = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
const monthNames = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let auditedThisMonth = []; 

// --- Ana Uygulama Mantığı ---

// Tarayıcı penceresi tamamen yüklendiğinde 'initializeApp' fonksiyonunu çalıştır.
window.onload = initializeApp;

/**
 * Uygulama ilk açıldığında çalışan ana fonksiyondur.
 * PocketBase'den mevcut kullanıcı durumunu kontrol eder ve arayüzü ayarlar.
 */
function initializeApp() {
    // Sayfadaki butonlar ve diğer elementler için olay dinleyicilerini kur.
    setupEventListeners();
    
    // PocketBase'in authStore'u (kullanıcı bilgilerini tutan bölümü) değiştiğinde
    // (yani kullanıcı giriş veya çıkış yaptığında) handleAuthStateChange fonksiyonunu çalıştır.
    pb.authStore.onChange(() => {
        handleAuthStateChange();
    }, true); // `true` parametresi, sayfa ilk yüklendiğinde de bu fonksiyonun çalışmasını sağlar.
}

/**
 * Kullanıcının giriş durumuna göre arayüzü (Giriş/Çıkış butonları vb.) günceller.
 * Eğer kullanıcı giriş yapmışsa, gerekli verileri yükler.
 */
async function handleAuthStateChange() {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    
    const isLoggedIn = pb.authStore.isValid; // Kullanıcı giriş yapmış ve token'ı geçerli mi?

    if (isLoggedIn) {
        // Eğer kullanıcı giriş yapmışsa:
        loginToggleBtn.style.display = 'none'; // Giriş yap butonunu sakla
        logoutBtn.style.display = 'inline-flex'; // Çıkış yap butonunu göster
        loginPopup.style.display = 'none'; // Giriş penceresini kapat
    } else {
        // Eğer kullanıcı giriş yapmamışsa:
        loginToggleBtn.style.display = 'inline-flex'; // Giriş yap butonunu göster
        logoutBtn.style.display = 'none'; // Çıkış yap butonunu sakla
    }
    
    // Sağ üstteki bağlantı durum göstergesini güncelle.
    updateConnectionIndicator();
    
    // Gerekli başlangıç verilerini yükle (sorular, bayi listesi vb.).
    await loadInitialData(); 
    
    // Formun kullanılabilirliğini ayarla (eğer bayi seçilmemişse pasif yap).
    updateFormInteractivity(selectedStore !== null);
}


/**
 * Uygulamanın ihtiyaç duyduğu temel verileri PocketBase'den yükler.
 * Bayi listesi, sorular ve ürün listesi bu fonksiyonla çekilir.
 */
async function loadInitialData() {
    // Kullanıcı giriş yapmamışsa hiçbir şey yükleme ve formu varsayılan hata ile çiz.
    if (!pb.authStore.isValid) {
        buildForm(fallbackFideQuestions);
        document.getElementById('initialization-error').style.display = 'block';
        return;
    }

    // Yükleme animasyonunu göster
    document.getElementById('loading-overlay').style.display = 'flex';
    
    try {
        // PocketBase'den verileri çekmek için Promise.all kullanıyoruz.
        // Bu sayede tüm veriler aynı anda, paralel olarak isteniyor ve daha hızlı yükleniyor.
        const [bayilerData, sorularData, urunlerData] = await Promise.all([
            pb.collection('bayiler').getFullList({ sort: 'bayi_adi' }), // Bayileri isimlerine göre sıralı al
            pb.collection('sorular').getFullList({ sort: 'soru_id' }),  // Soruları ID'lerine göre sıralı al
            pb.collection('urunler').getFullList()
        ]);

        // 1. Bayi verilerini işle ve arama için hazırla
        uniqueStores = bayilerData.map(bayi => ({
            bayiKodu: bayi.bayi_kodu,
            bayiAdi: bayi.bayi_adi
        }));
        // Bayi arama alanını aktif hale getir
        document.getElementById('store-selection-area').style.display = 'block';

        // 2. Soru verilerini işle
        fideQuestions = sorularData.map(soru => ({
            id: soru.soru_id,
            title: soru.baslik,
            type: soru.cevap_tipi,
            ...soru.detaylar // JSON alanındaki diğer tüm bilgileri soru objesine ekle
        }));

        // 3. Ürün listesi verilerini işle
        productList = urunlerData.map(urun => ({
            code: urun.kod,
            name: urun.ad,
            type: urun.tip
        }));

        console.log("Tüm temel veriler PocketBase'den başarıyla yüklendi.");
        document.getElementById('initialization-error').style.display = 'none'; // Hata mesajını gizle
        buildForm(fideQuestions); // Yüklenen sorularla formu oluştur

    } catch (error) {
        // Eğer veri yüklenirken bir hata olursa, kullanıcıyı bilgilendir.
        console.error("PocketBase'den veri yüklenirken hata oluştu:", error);
        document.getElementById('initialization-error').style.display = 'block';
        buildForm(fallbackFideQuestions); // Hata durumunda varsayılan form
    } finally {
        // Yükleme animasyonunu gizle
        document.getElementById('loading-overlay').style.display = 'none';
    }
}


// --- ARAYÜZ (UI) FONKSİYONLARI ---

/**
 * Sağ üst köşedeki bağlantı durum göstergesini günceller.
 */
function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = pb.authStore.isValid; 
    
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}

/**
 * Sayfadaki tüm butonlara ve giriş alanlarına tıklama/yazma gibi olayları atar.
 */
function setupEventListeners() {
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    // --- GİRİŞ VE ÇIKIŞ İŞLEMLERİ ---
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });

    logoutBtn.addEventListener('click', () => {
        pb.authStore.clear();
        uniqueStores = []; // Hafızadaki bayi listesini temizle
        fideQuestions = []; // Hafızadaki soru listesini temizle
        selectedStore = null; // Seçili bayiyi sıfırla
        document.getElementById('store-search-input').value = ''; // Arama kutusunu temizle
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
            await pb.collection('users').authWithPassword(email, password);
        } catch (error) {
            errorDiv.textContent = 'E-posta veya şifre hatalı.';
            console.error('PocketBase giriş hatası:', error);
        }
    });

    // --- BAYİ ARAMA İŞLEMİ ---
    document.getElementById('store-search-input').addEventListener('keyup', (e) => {
        selectedStore = null; 
        const filter = e.target.value.toLowerCase().trim();
        const storeListDiv = document.getElementById('store-list');
        storeListDiv.style.display = 'block';
        if (filter === "") {
            storeListDiv.innerHTML = ''; 
            return;
        }
        // uniqueStores dizisi artık PocketBase'den gelen bayileri içeriyor.
        const filteredStores = uniqueStores.filter(store => 
            (store.bayiAdi && store.bayiAdi.toLowerCase().includes(filter)) || 
            (store.bayiKodu && String(store.bayiKodu).toLowerCase().includes(filter))
        );
        displayStores(filteredStores); // Filtrelenen bayileri listede göster.
    });
    
    
    // --- DİĞER OLAY DİNLEYİCİLERİ (Şimdilik çoğu çalışmayacak) ---
    document.getElementById('new-report-btn').addEventListener('click', startNewReport);
    
    document.getElementById('clear-storage-btn').addEventListener('click', () => alert("Bu özellik henüz PocketBase için ayarlanmadı."));
    document.getElementById('clear-excel-btn').addEventListener('click', () => alert("Bu özellik henüz PocketBase için ayarlanmadı."));
    document.getElementById('clear-fide-excel-btn').addEventListener('click', () => alert("Bu özellik henüz PocketBase için ayarlanmadı."));
    document.getElementById('excel-file-input').addEventListener('change', (e) => handleFileSelect(e, 'dide'));
    document.getElementById('fide-excel-file-input').addEventListener('change', (e) => handleFileSelect(e, 'fide'));

    window.addEventListener('click', function(event) {
        const authControls = document.getElementById('auth-controls');
        if (authControls && !authControls.contains(event.target)) {
            loginPopup.style.display = 'none';
        }
    });

    document.getElementById('toggle-backup-manager-btn').addEventListener('click', () => {
        window.open(POCKETBASE_URL + '/_/', '_blank');
    });
}

/**
 * Arama sonuçlarında filtrelenen bayileri ekranda gösterir.
 * @param {Array} stores - Gösterilecek bayi nesnelerinin dizisi.
 */
function displayStores(stores) {
    const storeListDiv = document.getElementById('store-list');
    storeListDiv.innerHTML = '';
    stores.slice(0, 10).forEach(store => { // Sadece ilk 10 sonucu gösterelim
        const item = document.createElement('div');
        item.className = 'store-item';
        let displayName = store.bayiAdi;
        if (displayName && displayName.length > 30) displayName = displayName.substring(0, 30) + '...';
        item.textContent = `${displayName} (${store.bayiKodu})`;
        
        item.addEventListener('click', () => {
            selectStore(store);
        });
        storeListDiv.appendChild(item);
    });
}

/**
 * Bayi listesinden bir bayi seçildiğinde çalışır.
 * @param {object} store - Seçilen bayi nesnesi.
 */
function selectStore(store) {
    selectedStore = { bayiKodu: store.bayiKodu, bayiAdi: store.bayiAdi };
    
    const searchInput = document.getElementById('store-search-input');
    searchInput.value = `${store.bayiKodu} - ${store.bayiAdi}`;
    
    document.getElementById('store-list').innerHTML = '';
    document.getElementById('store-list').style.display = 'none';
    
    // TODO: Bu kısım, seçilen bayi için kaydedilmiş raporu yükleyecek.
    // Şimdilik formu sıfırlıyoruz.
    resetForm();
    updateFormInteractivity(true); 
}


// ======================================================================================
// === BURADAN AŞAĞIDAKİ FONKSİYONLAR GEÇİŞ SÜRECİNDE HENÜZ AKTİF DEĞİLDİR ===
// ======================================================================================

function buildForm(questionsToBuild = []) {
    const formContainer = document.getElementById('form-content');
    formContainer.innerHTML = '';
    let html = '';
    questionsToBuild.forEach(q => {
        // isArchived gibi özellikler varsa diye kontrol edelim.
        if (q.isArchived) { return; } 
        html += generateQuestionHtml(q);
    });
    formContainer.innerHTML = html;
    // TODO: POP sistemi gibi özellikler burada tekrar kurulacak.
}

function generateQuestionHtml(q) {
    // Bu fonksiyon artık PocketBase'den gelen soru yapısına göre HTML oluşturacak.
    // Şimdilik basit bir gösterim yapıyoruz. Detaylar sonraki adımda eklenecek.
    let questionContentHTML = `<div class="input-area"><p><i>Bu sorunun detayları bir sonraki adımda yüklenecektir.</i></p></div>`;
    let questionActionsHTML = `<div class="fide-actions"></div>`;
    
    return `
        <div class="fide-item" id="fide-item-${q.id}">
            <div class="fide-title-container">
                <p><span class="badge">FiDe ${q.id}</span> ${q.title}</p>
            </div>
            ${questionContentHTML}
            ${questionActionsHTML}
        </div>`;
}

async function generateEmail() {
    if (!selectedStore) {
        alert('Lütfen denetime başlamadan önce bir bayi seçin!');
        return;
    }
    alert("E-posta oluşturma özelliği bir sonraki adımda aktif olacaktır.");
}

function updateFormInteractivity(enable) {
    const formContent = document.getElementById('form-content');
    if (!formContent) return;
    const allElements = formContent.querySelectorAll('button, input, select');
    allElements.forEach(el => { el.disabled = !enable; });
}

function startNewReport() {
    selectedStore = null;
    document.getElementById('store-search-input').value = '';
    resetForm();
    updateFormInteractivity(false);
}

function resetForm() { 
    document.getElementById('form-content').innerHTML = ''; 
    buildForm(fideQuestions.length > 0 ? fideQuestions : fallbackFideQuestions); 
}

// Pasif kalan diğer yardımcı fonksiyonlar
function handleFileSelect(event, type) { alert("Excel yükleme özelliği bir sonraki adımda aktif olacaktır."); }
function saveFormState(isFinalizing = false) { /* TODO: PocketBase'e göre güncellenecek */ }