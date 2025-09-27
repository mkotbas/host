let storeEmails = {};
let migrationMap = {};

document.addEventListener('DOMContentLoaded', initializeBayiYoneticisi);

async function initializeBayiYoneticisi() {
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
        await loadInitialBayiData();
        setupBayiEventListeners();
        renderEmailList();
    });
}

// --- Veri Yükleme Stratejisi: Önce Yerel, Sonra Bulut ---

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

async function loadInitialBayiData() {
    await loadMigrationMap();
    await loadStoreEmails();
}

// ... Diğer bayi-yoneticisi.js fonksiyonları aynı kalacak ...