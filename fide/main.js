// --- Modül İçeri Aktarma (Import) ---
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
    // PocketBase'i db-config.js'den gelen bilgiyle başlat
    pb = new PocketBase(POCKETBASE_URL);

    // Modülleri PocketBase instance ile ilklendir
    api.initApi(pb);
    excel.initExcel(pb);
    ui.initUi(pb);

    // HTML'deki onclick="" özelliklerinin çalışması için UI fonksiyonlarını window'a ata
    ui.attachUiFunctionsToWindow();

    // Oturum durumuna göre arayüzü güncelle
    updateAuthUI();
    
    // Giriş yapılmışsa verileri yükle
    if (pb.authStore.isValid) {
        state.setIsPocketBaseConnected(true);
        ui.updateConnectionIndicator();
        
        // Gerekli verileri yükle ve formu çiz
        const dataLoaded = await api.loadInitialData();
        if (dataLoaded) {
            ui.buildForm();
            // Yükleme sonrası UI güncellemeleri
            if(state.dideData.length > 0) {
                 document.getElementById('store-selection-area').style.display = 'block';
                 document.getElementById('clear-excel-btn').style.display = 'inline-flex';
            }
             if(state.fideData.length > 0) {
                 document.getElementById('clear-fide-excel-btn').style.display = 'inline-flex';
            }
        }
        
        // YENİ EKLENDİ: Anlık ban (kilitleme) sistemini dinlemeyi başlat
        subscribeToUserChanges();

    } else {
        // Giriş yapılmamışsa, formu varsayılan sorularla ve interaktif olmayan modda çiz
        state.setIsPocketBaseConnected(false);
        ui.updateConnectionIndicator();
        ui.buildForm(); 
        ui.updateFormInteractivity(false); 
    }

    setupEventListeners();
    // Bayi seçili değilse formu kilitle
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

    // === GİRİŞ BUTONU MANTIĞI (Önceki adımda güncellenmişti, değişiklik yok) ===
    loginSubmitBtn.addEventListener('click', async () => {
        const email = document.getElementById('email-input').value;
        const password = document.getElementById('password-input').value;
        const errorDiv = document.getElementById('login-error');
        errorDiv.textContent = ''; // Önceki hataları temizle

        if (!email || !password) {
            errorDiv.textContent = 'Lütfen tüm alanları doldurun.';
            return;
        }

        // api.js'teki güncellenmiş loginUser fonksiyonunu çağır
        const result = await api.loginUser(email, password);

        if (result.success) {
            // Giriş başarılıysa sayfayı yenile
            window.location.reload();
        } else {
            // Başarısızsa, api.js'ten gelen detaylı hata mesajını göster
            errorDiv.textContent = result.message;
        }
    });
    // === GÜNCELLEME BİTTİ ===
    
    // Dışarı tıklayınca popup'ı kapat
    window.addEventListener('click', (event) => {
        if (!loginPopup.contains(event.target) && event.target !== loginToggleBtn) {
            loginPopup.style.display = 'none';
        }
    });

    // --- Uygulama İçi Olay Dinleyicileri (Değişiklik yok) ---
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
        ui.updateFormInteractivity(false); // Arama yaparken formu kilitle
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
}

/**
 * YENİ FONKSİYON: Anlık ban sistemini dinler.
 * Kullanıcının 'users' tablosundaki kendi kaydını dinler.
 * Eğer 'is_banned' true olursa, kullanıcıyı anında atar.
 */
function subscribeToUserChanges() {
    if (!pb || !pb.authStore.isValid) {
        return; // Giriş yapılmamışsa dinleme
    }

    const userId = pb.authStore.model.id;

    try {
        // 'users' tablosundaki SADECE bu kullanıcının ID'sini dinle
        pb.collection('users').subscribe(userId, function(e) {
            // console.log('Kullanıcı kaydı güncellendi:', e.record);
            
            // Kilitlenme (ban) durumu kontrolü
            if (e.record && e.record.is_banned === true) {
                console.warn('Kullanıcı kilitlendi (is_banned=true). Oturum sonlandırılıyor.');
                
                // Kullanıcıyı bilgilendir
                alert("Hesabınız bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor.");
                
                // Oturumu kapat
                api.logoutUser();
                
                // Sayfayı yenileyerek giriş ekranına at
                window.location.reload();
            }
        });
    } catch (error) {
        console.error('Kullanıcı dinlemesi (subscribe) başlatılamadı:', error);
    }
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