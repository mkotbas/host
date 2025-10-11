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

// --- VERİ YÜKLEME FONKSİYONLARI (ŞİMDİLİK BOŞ, SONRA DOLDURULACAK) ---
// Bu fonksiyonların içindeki Firebase kodlarını sildik. 
// Bir sonraki adımda buraları PocketBase'den veri çekecek şekilde dolduracağız.

async function loadStoreEmails() {
    // TODO: Bu fonksiyon PocketBase'e göre daha sonra güncellenecek.
    console.log("loadStoreEmails fonksiyonu çağrıldı ama henüz PocketBase'e bağlanmadı.");
}

async function loadMigrationMap() {
    // TODO: Bu fonksiyon PocketBase'e göre daha sonra güncellenecek.
    console.log("loadMigrationMap fonksiyonu çağrıldı ama henüz PocketBase'e bağlanmadı.");
}

async function loadMonthlyAuditData() {
    // TODO: Bu fonksiyon PocketBase'e göre daha sonra güncellenecek.
    console.log("loadMonthlyAuditData fonksiyonu çağrıldı ama henüz PocketBase'e bağlanmadı.");
}

async function loadInitialData() {
    // Kullanıcı giriş yapmamışsa hiçbir şey yükleme.
    if (!pb.authStore.isValid) {
        buildForm(fallbackFideQuestions); // Soru yüklenemedi uyarısı ile formu çiz.
        return;
    }
    
    console.log("loadInitialData fonksiyonu çağrıldı. Veri yükleme işlemleri burada yapılacak.");
    // TODO: Soru, ürün listesi, excel verileri gibi tüm veriler buradan yüklenecek.
    // Şimdilik hata mesajı ile formu çiziyoruz.
    document.getElementById('initialization-error').style.display = 'block';
    buildForm(fallbackFideQuestions);
}

async function loadExcelData() {
    // TODO: Bu fonksiyon PocketBase'e göre daha sonra güncellenecek.
    console.log("loadExcelData fonksiyonu çağrıldı ama henüz PocketBase'e bağlanmadı.");
}


// --- ARAYÜZ (UI) FONKSİYONLARI ---

/**
 * Sağ üst köşedeki bağlantı durum göstergesini günceller.
 */
function updateConnectionIndicator() {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    // Kullanıcı hem giriş yapmışsa hem de çevrimiçi ise 'bağlı' kabul ediyoruz.
    const isOnline = pb.authStore.isValid; 
    
    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}

/**
 * Sayfadaki tüm butonlara ve giriş alanlarına tıklama/yazma gibi olayları atar.
 * Sadece bir kere çalışması için bir kontrol mekanizması içerir.
 */
function setupEventListeners() {
    // Bu fonksiyonun tekrar tekrar çalışmasını engellemek için kontrol
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    // --- GİRİŞ VE ÇIKIŞ İŞLEMLERİ ---
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    // Giriş Yap butonuna tıklanınca giriş penceresini aç/kapat.
    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // Tıklamanın diğer elementlere yayılmasını engelle.
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });

    // Çıkış Yap butonuna tıklanınca PocketBase oturumunu sonlandır.
    // Sayfa yenileme YOK. Arayüz otomatik olarak güncellenecek.
    logoutBtn.addEventListener('click', () => {
        pb.authStore.clear(); // PocketBase oturum bilgilerini temizle.
    });

    // Giriş penceresindeki Onayla butonuna tıklanınca.
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
            // PocketBase ile kullanıcı girişi yapmayı dene.
            // Başarılı olursa, authStore.onChange tetikleneceği için arayüz otomatik güncellenir.
            // Bu yüzden burada ek bir şey yapmamıza gerek yok.
            await pb.collection('users').authWithPassword(email, password);
        } catch (error) {
            // Hata olursa kullanıcıya bildir.
            errorDiv.textContent = 'E-posta veya şifre hatalı.';
            console.error('PocketBase giriş hatası:', error);
        }
    });
    
    // --- DİĞER OLAY DİNLEYİCİLERİ (Şimdilik çoğu çalışmayacak) ---
    
    document.getElementById('excel-file-input').addEventListener('change', (e) => handleFileSelect(e, 'dide'));
    document.getElementById('fide-excel-file-input').addEventListener('change', (e) => handleFileSelect(e, 'fide'));
    document.getElementById('new-report-btn').addEventListener('click', startNewReport);
    
    document.getElementById('clear-storage-btn').addEventListener('click', () => {
        alert("Bu özellik henüz PocketBase için ayarlanmadı.");
    });
    document.getElementById('clear-excel-btn').addEventListener('click', () => {
        alert("Bu özellik henüz PocketBase için ayarlanmadı.");
    });
     document.getElementById('clear-fide-excel-btn').addEventListener('click', () => {
        alert("Bu özellik henüz PocketBase için ayarlanmadı.");
    });

    document.getElementById('store-search-input').addEventListener('keyup', (e) => {
        // TODO: Bayi arama özelliği PocketBase'den veri çekilince çalışacak.
    });
    
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


// ======================================================================================
// === BURADAN AŞAĞIDAKİ FONKSİYONLAR GEÇİŞ SÜRECİNDE HENÜZ AKTİF DEĞİLDİR ===
// ======================================================================================

function buildForm(questionsToBuild = []) {
    const formContainer = document.getElementById('form-content');
    formContainer.innerHTML = '';
    let html = '';
    questionsToBuild.forEach(q => {
        if (q.isArchived) { return; }
        html += generateQuestionHtml(q);
    });
    formContainer.innerHTML = html;
    // initializePopSystem gibi fonksiyonlar daha sonra eklenecek.
}

function generateQuestionHtml(q) {
    return `<div class="fide-item" id="fide-item-${q.id}"><p><span class="badge">FiDe ${q.id}</span> ${q.title}</p></div>`;
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
    buildForm(fallbackFideQuestions); 
}

// Diğer yardımcı fonksiyonlar (şimdilik boş veya pasif)
function handleFileSelect(event, type) { alert("Excel yükleme özelliği bir sonraki adımda aktif olacaktır."); }
function saveFormState(isFinalizing = false) { /* TODO: PocketBase'e göre güncellenecek */ }
function loadReportForStore(bayiKodu) { /* TODO: PocketBase'e göre güncellenecek */ }
function getFormDataForSaving() { /* TODO: PocketBase'e göre güncellenecek */ }