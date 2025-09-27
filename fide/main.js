// --- Global Değişkenler ---
let dideData = [], fideData = [], uniqueStores = [], selectedStore = null;
let fideQuestions = [], popCodes = [], expiredCodes = [], productList = [], expiredExcelFiles = [];
let migrationMap = {}, storeEmails = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan veya yerel dosyadan yüklenemedi." }];
const monthNames = ["", "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let isFirebaseConnected = false;
let isXlsxLibraryLoaded = false;

// --- Ana Uygulama Mantığı ---
document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    auth.onAuthStateChanged(async user => { 
        const loginToggleBtn = document.getElementById('login-toggle-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const loginPopup = document.getElementById('login-popup');
        const uploadBtn = document.getElementById('upload-backup-to-cloud-btn');
        if (user) {
            loginToggleBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-flex';
            loginPopup.style.display = 'none';
            if (uploadBtn) uploadBtn.disabled = false;
        } else {
            loginToggleBtn.style.display = 'inline-flex';
            logoutBtn.style.display = 'none';
            if (uploadBtn) uploadBtn.disabled = true;
        }
        updateConnectionIndicator();
        await loadInitialData();
        setupEventListeners();
        updateFormInteractivity(selectedStore !== null);
    });
}

// --- Veri Yükleme Stratejisi: Önce Yerel, Sonra Bulut Güncellemesi ---

async function loadStoreEmails() {
    // 1. Önce yerel hafızadan anında yükle
    const storedEmails = localStorage.getItem('fideStoreEmails');
    if (storedEmails) {
        storeEmails = JSON.parse(storedEmails);
    }

    // 2. Arka planda buluttan güncel veriyi çek
    const user = auth.currentUser;
    if (user && database) {
        try {
            const emailsRef = database.ref('storeEmails');
            const snapshot = await emailsRef.once('value');
            if (snapshot.exists()) {
                const cloudEmails = snapshot.val();
                // Sadece veriler farklıysa güncelle ve kaydet
                if (JSON.stringify(storeEmails) !== JSON.stringify(cloudEmails)) {
                    storeEmails = cloudEmails;
                    localStorage.setItem('fideStoreEmails', JSON.stringify(storeEmails));
                }
            }
        } catch (error) {
            console.error("Buluttan bayi e-postaları yüklenemedi:", error);
        }
    }
}

async function loadMigrationMap() {
    // 1. Önce yerel hafızadan anında yükle
    const storedMap = localStorage.getItem('fideMigrationMap');
    if (storedMap) {
        migrationMap = JSON.parse(storedMap);
    }
    
    // 2. Arka planda buluttan güncel veriyi çek
    const user = auth.currentUser;
    if (user && database) {
        try {
            const migrationRef = database.ref('migrationSettings/map');
            const snapshot = await migrationRef.once('value');
            if (snapshot.exists()) {
                const cloudMap = snapshot.val();
                 // Sadece veriler farklıysa güncelle ve kaydet
                if (JSON.stringify(migrationMap) !== JSON.stringify(cloudMap)) {
                    migrationMap = cloudMap;
                    localStorage.setItem('fideMigrationMap', JSON.stringify(migrationMap));
                }
            }
        } catch (error) {
            console.error("Buluttan veri taşıma ayarları yüklenemedi:", error);
        }
    }
}


async function loadInitialData() {
    // Diğer verileri yükle
    await loadMigrationMap();
    await loadStoreEmails();

    let questionsLoaded = false;
    let localDataUsed = false;

    // 1. Önce bulutu dene (çünkü bu en kritik veri)
    if (auth.currentUser && database) {
        try {
            const questionsRef = database.ref('fideQuestionsData');
            const snapshot = await questionsRef.once('value');
            if (snapshot.exists()) {
                const cloudData = snapshot.val();
                fideQuestions = cloudData.questions || [];
                productList = cloudData.productList || [];
                console.log("Sorular ve ürün listesi başarıyla buluttan yüklendi.");
                questionsLoaded = true;
                // Buluttan gelen veriyi yerelde de sakla
                localStorage.setItem('fideQuestionsCache', JSON.stringify(cloudData));
            }
        } catch (error) {
            console.error("Firebase'den soru verisi okunurken hata oluştu:", error);
        }
    }
    
    // 2. Bulut başarısızsa veya kullanıcı giriş yapmamışsa, yerel önbelleği dene
    if (!questionsLoaded) {
        const cachedQuestions = localStorage.getItem('fideQuestionsCache');
        if (cachedQuestions) {
            const localData = JSON.parse(cachedQuestions);
            fideQuestions = localData.questions || [];
            productList = localData.productList || [];
            console.log("Sorular ve ürün listesi yerel önbellekten yüklendi.");
            questionsLoaded = true;
            localDataUsed = true;
        }
    }
    
    // 3. Yerel önbellek de yoksa, fallback dosyayı dene
    if (!questionsLoaded) {
        try {
            const response = await fetch('fide_soru_listesi.json');
            if (response.ok) {
                const fileData = await response.json();
                fideQuestions = fileData.questions || [];
                productList = fileData.productList || [];
                console.log("Sorular ve ürün listesi yerel dosyadan yüklendi.");
                questionsLoaded = true;
                // Dosyadan yüklenen veriyi yerel önbelleğe kaydet
                localStorage.setItem('fideQuestionsCache', JSON.stringify(fileData));
            } else {
                throw new Error('Dosya okunamadı');
            }
        } catch (error) {
            console.error("JSON dosyası okunamadı:", error);
            document.getElementById('initialization-error').style.display = 'block';
            fideQuestions = fallbackFideQuestions;
            productList = [];
        }
    }
    
    // 4. Yerel veri kullanıldıysa, kullanıcı giriş yapmışsa ve bulut bağlantısı varsa, arka planda bulutu güncelle
    if (localDataUsed && auth.currentUser && database) {
        try {
            const questionsRef = database.ref('fideQuestionsData');
            await questionsRef.set({ questions: fideQuestions, productList: productList });
            console.log("Yerel soru verisi buluta senkronize edildi.");
        } catch (error) {
            console.error("Yerel soru verisi buluta senkronize edilemedi:", error);
        }
    }
    
    // 5. Diğer verileri yükle
    await loadExcelData();
    await loadPopCodes();
    await checkExpiredFiles();
    await loadExpiredCodes();
    await loadReports();
    await updateStoreList();
}

// --- Dinamik XLSX Kütüphanesi Yükleme ---

async function loadXlsxLibrary() {
    if (isXlsxLibraryLoaded) return;
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        script.defer = true;
        script.onload = () => {
            isXlsxLibraryLoaded = true;
            resolve();
        };
        script.onerror = () => reject(new Error('XLSX kütüphanesi yüklenemedi'));
        document.head.appendChild(script);
    });
}

// --- Excel İşlemleri (Güncellenmiş) ---

document.getElementById('excel-file-input').addEventListener('change', async function(event) {
    await loadXlsxLibrary(); // Kütüphaneyi ihtiyaç anında yükle
    handleExcelFile(event, 'dide');
});

document.getElementById('fide-excel-file-input').addEventListener('change', async function(event) {
    await loadXlsxLibrary(); // Kütüphaneyi ihtiyaç anında yükle
    handleExcelFile(event, 'fide');
});

async function handleExcelFile(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    showLoadingOverlay();
    try {
        await loadXlsxLibrary(); // Çift kontrol

        const data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const workbook = XLSX.read(e.target.result, { type: 'binary' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    resolve(jsonData);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Dosya okunamadı'));
            reader.readAsBinaryString(file);
        });

        if (type === 'dide') {
            dideData = data;
            localStorage.setItem('fideExcelData', JSON.stringify({ data: dideData, timestamp: Date.now() }));
            document.getElementById('file-name').textContent = file.name;
            console.log("DiDe Excel verisi işlendi ve kaydedildi.");
        } else if (type === 'fide') {
            fideData = data;
            localStorage.setItem('fideFideExcelData', JSON.stringify({ data: fideData, timestamp: Date.now() }));
            document.getElementById('fide-file-name').textContent = file.name;
            console.log("FiDe Excel verisi işlendi ve kaydedildi.");
        }

        await updateStoreList();
        await checkExpiredFiles();
        
        // Buluta yükleme
        const user = auth.currentUser;
        if (user && database) {
            try {
                const key = type === 'dide' ? 'excelData' : 'fideExcelData';
                const ref = database.ref(key);
                await ref.set({ data: data, timestamp: Date.now() });
                console.log(`${type} Excel verisi buluta yüklendi.`);
            } catch (error) {
                console.error(`${type} Excel verisi buluta yüklenemedi:`, error);
            }
        }
    } catch (error) {
        console.error("Excel dosyası işlenirken hata oluştu:", error);
        alert("Excel dosyası işlenirken bir hata oluştu: " + error.message);
    } finally {
        hideLoadingOverlay();
    }
}

// --- Diğer Fonksiyonlar (Aynı Kalıyor) ---

function setupEventListeners() {
    // Mevcut event listener'lar burada kalacak
    // (Kod uzunluğu nedeniyle kısaltıldı, aslında tüm event listener'lar burada)
}

function updateConnectionIndicator() {
    const switchElement = document.getElementById('connection-status-switch');
    const textElement = document.getElementById('connection-status-text');
    const user = auth.currentUser;
    
    if (user && database) {
        switchElement.className = 'connected';
        textElement.textContent = 'Buluta Bağlı';
        isFirebaseConnected = true;
    } else {
        switchElement.className = 'disconnected';
        textElement.textContent = user ? 'Bağlanıyor...' : 'Bağlı Değil';
        isFirebaseConnected = false;
    }
}

function showLoadingOverlay() {
    document.getElementById('loading-overlay').style.display = 'flex';
}

function hideLoadingOverlay() {
    document.getElementById('loading-overlay').style.display = 'none';
}

// ... Diğer fonksiyonlar aynı şekilde kalacak ...