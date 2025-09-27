let fideQuestions = [], productList = [], migrationMap = {};
let isEditingIds = false, isViewingArchived = false;

document.addEventListener('DOMContentLoaded', initializeSoruYoneticisi);

async function initializeSoruYoneticisi() {
    await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    auth.onAuthStateChanged(async user => { 
        const loginToggleBtn = document.getElementById('login-toggle-btn');
        const logoutBtn = document.getElementById('logout-btn');
        const loginPopup = document.getElementById('login-popup');
        if (user) {
            loginToggleBtn.style.display = 'none';
            logoutBtn.style.display = 'inline-flex';
            loginPopup.style.display = 'none';
        } else {
            loginToggleBtn.style.display = 'inline-flex';
            logoutBtn.style.display = 'none';
        }
        updateConnectionIndicator();
        await loadInitialSoruData();
        setupSoruEventListeners();
        renderQuestionList();
    });
}

// --- Veri Yükleme Stratejisi: Önce Yerel, Sonra Bulut ---

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

async function loadFideQuestions() {
    let questionsLoaded = false;
    let localDataUsed = false;

    // 1. Önce bulutu dene
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
            fideQuestions = [];
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
}

async function loadInitialSoruData() {
    await loadMigrationMap();
    await loadFideQuestions();
}

// ... Diğer soru-yoneticisi.js fonksiyonları aynı kalacak ...