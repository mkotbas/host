// --- Modül İçeri Aktarma (Import) ---
import { POCKETBASE_URL } from './db-config.js'; // === YENİ EKLENDİ ===
import * as state from './state.js';
import * as api from './api.js';
import * as excel from './excel.js';
import * as store from './store.js';
import * as ui from './ui.js';

// --- Global Değişkenler ---
let pb; // PocketBase instance

// --- Uygulama Başlangıç Noktası ---
window.onload = initializeApp;

/**
 * Uygulamayı başlatan ana fonksiyon.
 */
async function initializeApp() {
    // === GÜNCELLENDİ: 'pb' artık burada tanımlanıyor ===
    // PocketBase'i db-config.js'den gelen bilgiyle başlat
    pb = new PocketBase(POCKETBASE_URL);

    // Modülleri PocketBase instance ile ilklendir
    api.initApi(pb);
    excel.initExcel(pb);
    ui.initUi(pb);

    // === GÜNCELLENDİ: 'onclick' yerine 'addEventListener' kullanılır ===
    // ui.attachUiFunctionsToWindow(); // Bu satır silindi
    
    // Oturum durumuna göre arayüzü güncelle
    updateAuthUI();
    
    // Giriş yapılmışsa verileri yükle
    if (pb.authStore.isValid) {
        state.setIsPocketBaseConnected(true);
        ui.updateConnectionIndicator();
        
        const dataLoaded = await api.loadInitialData();
        if (dataLoaded) {
            ui.buildForm();
            if(state.dideData.length > 0) {
                 document.getElementById('store-selection-area').style.display = 'block';
                 document.getElementById('clear-excel-btn').style.display = 'inline-flex';
            }
             if(state.fideData.length > 0) {
                 document.getElementById('clear-fide-excel-btn').style.display = 'inline-flex';
            }
        }
        
        api.subscribeToRealtimeChanges();

    } else {
        // Giriş yapılmamışsa...
        state.setIsPocketBaseConnected(false);
        ui.updateConnectionIndicator();
        ui.buildForm(); 
        ui.updateFormInteractivity(false); 
    }

    setupEventListeners();
    if(!state.selectedStore) {
        ui.updateFormInteractivity(false);
    }
}

/**
 * Tüm olay dinleyicilerini (event listeners) kurar.
 */
function setupEventListeners() {
    // Dinleyicilerin tekrar tekrar eklenmesini önle
    if (document.body.dataset.listenersAttached) return;
    document.body.dataset.listenersAttached = 'true';

    // --- Giriş/Çıkış İşlemleri ---
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const loginPopup = document.getElementById('login-popup');
    const loginSubmitBtn = document.getElementById('login-submit-btn');

    loginToggleBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
    });

    logoutBtn.addEventListener('click', () => {
        api.logoutUser();
        window.location.reload();
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

        // api.js'teki loginUser fonksiyonunu çağır
        const result = await api.loginUser(email, password);

        if (result.success) {
            window.location.reload();
        } else {
            errorDiv.textContent = result.message;
        }
    });
    
    // Dışarı tıklayınca popup'ı kapat
    window.addEventListener('click', (event) => {
        if (!loginPopup.contains(event.target) && event.target !== loginToggleBtn) {
            loginPopup.style.display = 'none';
        }
    });

    // --- Uygulama İçi Olay Dinleyicileri ---
    document.getElementById('excel-file-input').addEventListener('change', async (e) => {
       const success = await excel.handleFileSelect(e, 'dide');
       if(success) {
            document.getElementById('store-selection-area').style.display = 'block';
            document.getElementById('clear-excel-btn').style.display = 'inline-flex';
       }
    });
    document.getElementById('fide-excel-file-input').addEventListener('change', async (e) => {
        const success = await excel.handleFileSelect(e, 'fide');
        if(success) {
            document.getElementById('clear-fide-excel-btn').style.display = 'inline-flex';
        }
    });
    
    document.getElementById('new-report-btn').addEventListener('click', ui.startNewReport);
    document.getElementById('clear-excel-btn').addEventListener('click', () => {
        if (confirm("Yüklenmiş olan DiDe Excel verisini buluttan silmek istediğinizden emin misiniz?")) {
            api.clearExcelFromCloud('dide');
        }
    });
    document.getElementById('clear-fide-excel-btn').addEventListener('click', () => {
        if (confirm("Yüklenmiş olan FiDe Excel verisini buluttan silmek istediğinizden emin misiniz?")) {
            api.clearExcelFromCloud('fide');
        }
    });
    document.getElementById('store-search-input').addEventListener('keyup', (e) => {
        state.setSelectedStore(null); 
        state.setCurrentReportId(null);
        ui.updateFormInteractivity(false); 
        const filter = e.target.value.toLowerCase().trim();
        const storeListDiv = document.getElementById('store-list');
        storeListDiv.style.display = 'block';
        if (filter === "") {
            storeListDiv.innerHTML = ''; 
            return;
        }
        const filteredStores = state.allStores.filter(s => 
            (s.bayiAdi && s.bayiAdi.toLowerCase().includes(filter)) || 
            (s.bayiKodu && String(s.bayiKodu).toLowerCase().includes(filter))
        );
        store.displayStores(filteredStores);
    });

    document.getElementById('toggle-backup-manager-btn').addEventListener('click', () => {
        window.open('admin/admin.html', '_blank');
    });

    // === GÜNCELLENDİ: Programatik Olay Dinleyicileri ===
    
    // 'E-POSTA TASLAĞI OLUŞTUR' butonunu 'id' ile bağla
    const emailBtn = document.getElementById('generate-email-btn');
    if (emailBtn) {
        emailBtn.addEventListener('click', ui.generateEmail);
    }
    
    // Formun tamamındaki (dinamik oluşanlar dahil) tüm tıklamaları yakala
    const formContent = document.getElementById('form-content');
    if (formContent) {
        formContent.addEventListener('click', ui.handleFormClick);
    }

    // E-posta taslağındaki 'Geri Dön' butonu için (dinamik oluşur)
    const container = document.querySelector('.container');
    if (container) {
        container.addEventListener('click', ui.handleFormClick);
    }
    // === GÜNCELLEME BİTTİ ===
}


/**
 * Oturum durumuna göre giriş/çıkış butonlarını günceller.
 */
function updateAuthUI() {
    const loginToggleBtn = document.getElementById('login-toggle-btn');
    const logoutBtn = document.getElementById('logout-btn');
    
    if (pb.authStore.isValid) {
        loginToggleBtn.style.display = 'none';
        logoutBtn.style.display = 'inline-flex';
    } else {
        loginToggleBtn.style.display = 'inline-flex';
        logoutBtn.style.display = 'none';
    }
}