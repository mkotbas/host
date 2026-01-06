// --- Kapsüllenmiş Global Değişkenler ---
// GÜNCELLENDİ: IIFE (function() { ... })() sarmalayıcısı kaldırıldı.

// "Master" listeler: Admin için tüm veriyi, Client için API'nin izin verdiği veriyi tutar
let allStoresMaster = [];
let allReportsMaster = [];
let allGeriAlinanMaster = [];
let allUsers = []; // Admin için kullanıcı listesi

// "View" (Görünüm) listeleri: Master listelerden filtrelenen ve ekranda gösterilen anlık veriler
let allStores = [];
let auditedStoreCodesCurrentMonth = [];
let auditedStoreCodesCurrentYear = [];
let geriAlinanKayitlariBuAy = [];
let geriAlinanKayitlariBuYil = [];

// YENİ EKLENDİ: Local filtreleme için gerekli değişkenler
let currentGlobalFilteredStores = []; // 'Denetlenecek Bayiler' hesaplaması için son kullanılan global filtre sonucu
let localCityFilterValue = 'Tümü';    // Listeye özel şehir filtresinin anlık değeri

let globalAylikHedef = 0; // Ayarlardan gelen global hedef
let aylikHedef = 0; // O anki görünümün (view) hedefi

const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let pbInstance = null;
let currentUserRole = null;
let currentUserId = null;

// --- MODÜL BAŞLATMA FONKSİYONU ---
// GÜNCELLENDİ: 'export' anahtar kelimesi eklendi.
export async function initializeDenetimTakipModule(pb) {
    pbInstance = pb;
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    if (pbInstance && pbInstance.authStore.isValid) {
        currentUserRole = pbInstance.authStore.model.role;
        currentUserId = pbInstance.authStore.model.id;

        setupModuleEventListeners(currentUserRole);
        // ÖNEMLİ: Global hedefi 'loadSettings' ile yüklemeliyiz Kİ
        // 'client' kullanıcıları da 'applyDataFilterAndRunDashboard' içinde bu hedefi kullanabilsin.
        await loadSettings(); 

        // 1. Tüm ana verileri yükle (API rolü neye izin veriyorsa)
        await loadMasterData();

        if (currentUserRole === 'admin') {
            // Admin ise kullanıcı seçme menüsünü göster ve doldur
            document.getElementById('admin-user-selector-container').style.display = 'block';
            await populateUserFilterDropdown();
        }

        // 2. Varsayılan görünüm olarak "Benim Verilerim" filtresini uygula ve dashboard'u çalıştır
        applyDataFilterAndRunDashboard('my_data');

    } else {
        document.getElementById('upload-area').innerHTML = '<p style="text-align: center; color: var(--danger);">Denetim takip sistemini kullanmak için lütfen sisteme giriş yapın.</p>';
        document.getElementById('upload-area').style.display = 'block';
    }

    loadingOverlay.style.display = 'none';
}

/**
 * (GÜNCELLENDİ) Artık 'admin' veya 'client' fark etmeksizin global hedefi okur.
 * Sadece 'admin' ise ayar yapma arayüzünü (input) doldurur/aktif eder.
 */
async function loadSettings() {
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        globalAylikHedef = record.deger || 0;
    } catch (error) {
        globalAylikHedef = 0;
        if (error.status !== 404) {
            console.error("Aylık hedef ayarı yüklenemedi:", error);
        }
    }

    // Arayüz ayarları (sadece admin için)
    if (currentUserRole === 'admin') {
        document.getElementById('monthly-target-input').value = globalAylikHedef > 0 ? globalAylikHedef : '';
    } else {
        const targetInput = document.getElementById('monthly-target-input');
        if (targetInput) {
            targetInput.value = '';
            targetInput.disabled = true;
        }
    }
}

/**
 * Kullanıcının API rolünün izin verdiği tüm verileri MASTER listelere yükler.
 * Admin: Tüm bayiler, tüm raporlar, tüm geri alınanlar.
 * Client: Sadece kendi bayileri, kendi raporları, (geri alınanlar boş gelir).
 */
async function loadMasterData() {
    if (!pbInstance.authStore.isValid) return;

    try {
        // Bayi listesi (Admin: Tümü, Client: Sadece kendi bayileri)
        allStoresMaster = await pbInstance.collection('bayiler').getFullList({ sort: 'bayiAdi' });

        if (allStoresMaster.length > 0) {
            document.getElementById('upload-area').style.display = 'none';
            document.getElementById('loaded-data-area').style.display = 'block';
        } else {
            document.getElementById('upload-area').style.display = 'block';
            document.getElementById('loaded-data-area').style.display = 'none';
        }

        // Denetim Raporları (Admin: Tümü, Client: Sadece kendi raporları)
        const today = new Date();
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1).toISOString();
        allReportsMaster = await pbInstance.collection('denetim_raporlari').getFullList({
            filter: `denetimTamamlanmaTarihi != null && denetimTamamlanmaTarihi >= "${firstDayOfYear}"`,
            expand: 'bayi',
            sort: '-denetimTamamlanmaTarihi'
        });

        // Geri Alınanlar (Admin: Tümü, Client: Boş liste)
        if (currentUserRole === 'admin') {
            allGeriAlinanMaster = await pbInstance.collection('denetim_geri_alinanlar').getFullList({
                filter: `yil_ay ~ "${today.getFullYear()}-"`,
                expand: 'bayi'
            });
        }

    } catch (error) {
        console.error("Ana veriler yüklenirken hata oluştu:", error);
        allStoresMaster = [];
        allReportsMaster = [];
        allGeriAlinanMaster = [];
        document.getElementById('upload-area').style.display = 'block';
        document.getElementById('loaded-data-area').style.display = 'none';
    }
}

/**
 * Sadece Admin için, kullanıcı seçme dropdown menüsünü doldurur.
 */
async function populateUserFilterDropdown() {
    if (currentUserRole !== 'admin') return;

    try {
        // GÜNCELLENDİ: 'email' yerine 'name' (isime) göre sırala
        allUsers = await pbInstance.collection('users').getFullList({ sort: 'name' });
        const selectElement = document.getElementById('admin-user-filter');
        selectElement.innerHTML = ''; // Temizle

        // Sabit seçenekleri ekle
        selectElement.innerHTML += `<option value="my_data" selected>Benim Verilerim (Admin)</option>`;
        selectElement.innerHTML += `<option value="global">Genel Bakış (Tüm Sistem)</option>`;

        // Diğer kullanıcıları ekle
        allUsers.forEach(user => {
            // Adminin kendisini 'Benim Verilerim' dışında tekrar listeleme
            if (user.id !== currentUserId) {
                // GÜNCELLENDİ: 'email' yerine 'name' (isim) göster. Yoksa e-posta göster.
                const displayName = user.name || user.email;
                const roleLabel = user.role === 'admin' ? 'Admin' : 'Client';
                selectElement.innerHTML += `<option value="${user.id}">${displayName} (${roleLabel})</option>`;
            }
        });

    } catch (error) {
        console.error("Kullanıcı listesi doldurulurken hata:", error);
    }
}

/**
 * Seçilen görünüme (viewId) göre MASTER listeleri filtreler ve global 'View' listelerini doldurur.
 * Ardından dashboard'u bu filtrelenmiş verilerle çalıştırır.
 * @param {string} viewId 'global', 'my_data' veya bir kullanıcı ID'si olabilir.
 */
function applyDataFilterAndRunDashboard(viewId) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentMonthKey = `${currentYear}-${currentMonth}`;

    // --- 1. Bayileri Filtrele (allStores) ---
    if (currentUserRole !== 'admin') {
        // Client ise, master liste zaten sadece kendi bayilerini içerir
        allStores = [...allStoresMaster];
    } else {
        // Admin ise, seçime göre filtrele
        if (viewId === 'global') {
            allStores = [...allStoresMaster];
        } else if (viewId === 'my_data') {
            allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === currentUserId);
        } else { // Başka bir kullanıcının ID'si seçildi
            allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === viewId);
        }
    }

    // --- 2. Geri Alınanları İşle (geriAlinanKayitlariBuAy / BuYil) ---
    // (Geri alma işlemi globaldir, admin tüm geri alınanları görür)
    const geriAlinanBayiKodlariYil = new Set();
    const geriAlinanBayiKodlariAy = new Set();
    allGeriAlinanMaster.forEach(record => {
        if (record.expand && record.expand.bayi) {
            const storeCode = record.expand.bayi.bayiKodu;
            geriAlinanBayiKodlariYil.add(storeCode);
            if (record.yil_ay === currentMonthKey) {
                geriAlinanBayiKodlariAy.add(storeCode);
            }
        }
    });
    geriAlinanKayitlariBuYil = Array.from(geriAlinanBayiKodlariYil);
    geriAlinanKayitlariBuAy = Array.from(geriAlinanBayiKodlariAy);


    // --- 3. Denetim Raporlarını Filtrele (filteredReports) ---
    let filteredReports = [];
    if (currentUserRole !== 'admin') {
        // Client ise, master liste zaten sadece kendi raporlarını içerir
        filteredReports = [...allReportsMaster];
    } else {
        // Admin ise, seçime göre filtrele
        if (viewId === 'global') {
            filteredReports = [...allReportsMaster];
        } else if (viewId === 'my_data') {
            filteredReports = allReportsMaster.filter(r => r.user === currentUserId);
        } else { // Başka bir kullanıcının ID'si seçildi
            filteredReports = allReportsMaster.filter(r => r.user === viewId);
        }
    }

    // --- 4. Filtrelenmiş Raporları İşle (auditedStoreCodesCurrentMonth / CurrentYear) ---
    const monthlyAuditsMap = new Map();
    const yearlyCodes = new Set();
    filteredReports.forEach(record => {
        if (!record.expand || !record.expand.bayi) return;
        const storeCode = record.expand.bayi.bayiKodu;
        const reportDate = new Date(record.denetimTamamlanmaTarihi);
        yearlyCodes.add(storeCode);
        if (reportDate.getMonth() === currentMonth && reportDate.getFullYear() === currentYear) {
            if (!monthlyAuditsMap.has(storeCode)) {
                monthlyAuditsMap.set(storeCode, { code: storeCode, timestamp: reportDate.getTime() });
            }
        }
    });
    
    auditedStoreCodesCurrentMonth = Array.from(monthlyAuditsMap.values())
        .filter(audit => !geriAlinanBayiKodlariAy.has(audit.code));
    auditedStoreCodesCurrentYear = Array.from(yearlyCodes)
        .filter(code => !geriAlinanBayiKodlariYil.has(code));

    // --- 5. Aylık Hedefi Ayarla (aylikHedef) ---
    
    // GÜNCELLEME: Hem 'admin' hem de 'client' artık her zaman 'globalAylikHedef'i kullanacak.
    // (globalAylikHedef, loadSettings() fonksiyonunda zaten dolduruldu.)
    aylikHedef = globalAylikHedef; 

    // Sadece admin'e özel buton görünürlüklerini ayarla
    if (currentUserRole === 'admin') {
        // Yıllık sıfırlama butonunun durumunu görünüm seçimine göre ayarla
        if (viewId === 'global') {
            document.getElementById('reset-data-btn').disabled = false; // Yıllık sıfırlama sadece globalde aktif
        } else {
            document.getElementById('reset-data-btn').disabled = true; // Yıllık sıfırlama diğer görünümlerde pasif
        }
    }

    // Global filtre değiştiğinde, local filtreyi sıfırla ki kullanıcı yeni veri setinde şaşırmasın
    localCityFilterValue = 'Tümü'; 
    const localFilter = document.getElementById('local-city-filter');
    if(localFilter) localFilter.value = 'Tümü';

    // --- 6. Dashboard'u Çalıştır ---
    runDashboard();
}

/**
 * Filtrelenmiş ve hazırlanmış global 'View' değişkenlerini kullanarak
 * dashboard'u ve listeleri (yeniden) çizer.
 */
function runDashboard() {
    calculateAndDisplayDashboard();
    populateAllFilters(allStores); // Filtreleri o anki 'allStores' görünümüne göre doldur
    
    // 'ApplyAndRepopulateFilters' fonksiyonu 'currentGlobalFilteredStores' değişkenini günceller
    // ve 'renderRemainingStores'u çağırır. Bu yüzden doğrudan render çağırmak yerine
    // filtre uygulayıcıyı tetikliyoruz. Bu sayede ilk açılışta da (varsayılan "Tümü") filtreler çalışır.
    applyAndRepopulateFilters(); 
}

/**
 * Admin paneli, filtreler ve dropdown menü için olay dinleyicilerini ayarlar.
 */
function setupModuleEventListeners(userRole) {
    if (document.body.dataset.denetimTakipListenersAttached) return;
    document.body.dataset.denetimTakipListenersAttached = 'true';

    const adminPanelBtn = document.getElementById('open-admin-panel-btn');

    if (userRole === 'admin') {
        // Admin paneli (Dişli ikon)
        adminPanelBtn.addEventListener('click', () => {
            document.getElementById('admin-panel-overlay').style.display = 'flex';
        });
        document.getElementById('close-admin-panel-btn').addEventListener('click', () => {
            document.getElementById('admin-panel-overlay').style.display = 'none';
        });
        document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
        document.getElementById('reset-data-btn').addEventListener('click', resetProgress);

        // Admin Kullanıcı Filtresi Dropdown
        document.getElementById('admin-user-filter').addEventListener('change', (e) => {
            const selectedViewId = e.target.value;
            document.getElementById('loading-overlay').style.display = 'flex';
            // Verileri filtrele ve dashboard'u yeniden çalıştır
            applyDataFilterAndRunDashboard(selectedViewId);
            document.getElementById('loading-overlay').style.display = 'none';
        });
        
    } else {
        // Client ise ayar panelini (dişli ikonu) gizle
        if (adminPanelBtn) adminPanelBtn.style.display = 'none';
        // Yıllık sıfırlama butonunu gizle (veya pasif bırak)
        const resetBtn = document.getElementById('reset-data-btn');
        if (resetBtn) resetBtn.style.display = 'none';
    }

    // Ortak Filtreler
    document.getElementById('bolge-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('yonetmen-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('sehir-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('ilce-filter').addEventListener('change', applyAndRepopulateFilters);

    // YENİ EKLENDİ: Local Şehir Filtresi Dinleyicisi
    document.getElementById('local-city-filter').addEventListener('change', (e) => {
        localCityFilterValue = e.target.value;
        // Global filtreler değişmediği için sadece 'currentGlobalFilteredStores' 
        // kullanarak listeyi yeniden çiziyoruz.
        renderRemainingStores(currentGlobalFilteredStores); 
    });
}

async function resetProgress() {
    if (!pbInstance.authStore.isValid || currentUserRole !== 'admin') return alert("Bu işlem için yetkiniz bulunmamaktadır.");
    
    // Ekstra güvenlik: Sadece 'Global' görünümdeyken sıfırlamaya izin ver
    const currentView = document.getElementById('admin-user-filter').value;
    if (currentView !== 'global') {
        return alert("Yıllık sıfırlama işlemi sadece 'Genel Bakış (Tüm Sistem)' görünümündeyken yapılabilir.");
    }

    if (!confirm("Bu işlem, bu yıla ait TÜM denetim verilerini 'geri alınmış' olarak işaretleyecektir. Sayaçlar sıfırlanır. Onaylıyor musunuz?")) return;

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        // allReportsMaster listesi zaten 'bu yıla ait tüm raporları' içeriyor
        if (allReportsMaster.length === 0) {
            alert("Bu yıl sıfırlanacak denetim kaydı bulunamadı.");
            loadingOverlay.style.display = 'none';
            return;
        }

        for (const report of allReportsMaster) {
            if (!report.bayi) continue; // Bayi ilişkisi kopuk raporları atla

            const reportDate = new Date(report.denetimTamamlanmaTarihi);
            const reportMonthKey = `${reportDate.getFullYear()}-${reportDate.getMonth()}`;
            const data = { "yil_ay": reportMonthKey, "bayi": report.bayi };

            // Zaten geri alınmamışsa ekle
            try {
                await pbInstance.collection('denetim_geri_alinanlar').getFirstListItem(`yil_ay="${reportMonthKey}" && bayi="${report.bayi}"`);
            } catch (error) {
                if (error.status === 404) {
                    await pbInstance.collection('denetim_geri_alinanlar').create(data);
                }
            }
        }

        alert("Bu yıla ait tüm denetimler 'geri alındı' olarak işaretlendi. Sayfa yenileniyor.");
        window.location.reload();

    } catch (error) {
        alert("Veriler sıfırlanırken bir hata oluştu: " + error.message);
        loadingOverlay.style.display = 'none';
    }
}

async function saveSettings() {
    if (!pbInstance.authStore.isValid || currentUserRole !== 'admin') return alert("Bu işlem için yetkiniz bulunmamaktadır.");

    const newTarget = parseInt(document.getElementById('monthly-target-input').value);
    if (isNaN(newTarget) || newTarget < 0) return alert("Lütfen geçerli bir hedef girin.");

    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        await pbInstance.collection('ayarlar').update(record.id, { deger: newTarget });
    } catch (error) {
        if (error.status === 404) {
            await pbInstance.collection('ayarlar').create({ anahtar: 'aylikHedef', deger: newTarget });
        } else {
            alert("Ayarlar kaydedilirken bir hata oluştu.");
            return;
        }
    }

    globalAylikHedef = newTarget; // Global hedefi güncelle
    alert("Ayarlar kaydedildi.");
    document.getElementById('admin-panel-overlay').style.display = 'none';
    
    // Değişiklik yaptığımız için, o anki görünümü yeni hedefle güncelle
    const currentView = document.getElementById('admin-user-filter').value || 'my_data';
    applyDataFilterAndRunDashboard(currentView);
}

// GÜNCELLENDİ: 'window.revertAudit' tanımı kaldırıldı, normal modül içi fonksiyona dönüştürüldü.
async function revertAudit(bayiKodu) {
    if (!pbInstance.authStore.isValid || currentUserRole !== 'admin') return alert("Bu işlem için yetkiniz bulunmamaktadır.");

    // Not: 'allStores' o anki filtrelenmiş görünümü içerir.
    // 'Geri Al' butonu admin için her görünümde aktiftir ve global master listeyi kullanmalıdır.
    const store = allStoresMaster.find(s => s.bayiKodu === bayiKodu);
    if (!confirm(`'${store ? store.bayiAdi : bayiKodu}' bayisinin bu ayki denetimini listeden kaldırmak istediğinizden emin misiniz?`)) return;

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        if (!store) throw new Error("Bayi verisi bulunamadı.");
        const today = new Date();
        const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
        await pbInstance.collection('denetim_geri_alinanlar').create({ "yil_ay": currentMonthKey, "bayi": store.id });
        
        // Veriyi yeniden yükle ve dashboard'u o anki görünümle yenile
        await loadMasterData();
        const currentView = document.getElementById('admin-user-filter').value || 'my_data';
        applyDataFilterAndRunDashboard(currentView);

    } catch (error) {
        alert("Denetim geri alınırken bir hata oluştu: " + error.message);
    }
    loadingOverlay.style.display = 'none';
}

/**
 * O anki 'View' değişkenlerine (allStores, aylikHedef, vb.) göre sayaçları doldurur.
 */
function calculateAndDisplayDashboard() {
    const today = new Date();
    // GÜNCELLEME: 'auditedMonthlyCount' artık o anki görünümün (client'ın kendi verileri)
    // denetim sayısını gösterir.
    const auditedMonthlyCount = auditedStoreCodesCurrentMonth.length;
    
    // 'aylikHedef' artık 'applyDataFilterAndRunDashboard' fonksiyonunda hem admin hem de client için
    // 'globalAylikHedef' olarak ayarlandı.
    const remainingToTarget = aylikHedef - auditedMonthlyCount;
    
    const remainingWorkDays = getRemainingWorkdays();
    // 'allStores' artık o anki görünümün (client'ın kendi) bayi listesi
    const totalStores = allStores.length; 
    // 'auditedYearlyCount' de o anki görünümün (client'ın kendi) yıllık denetim sayısı
    const auditedYearlyCount = auditedStoreCodesCurrentYear.length; 
    
    const annualProgress = totalStores > 0 ? (auditedYearlyCount / totalStores) * 100 : 0;
    
    document.getElementById('dashboard-title').innerHTML = `<i class="fas fa-calendar-day"></i> ${today.getFullYear()} ${monthNames[today.getMonth()]} Ayı Performansı`;
    document.getElementById('work-days-count').textContent = remainingWorkDays;
    
    // "Aylık Denetim Hedefi" sayacı (Artık herkes için global hedef)
    document.getElementById('total-stores-count').textContent = aylikHedef; 
    
    document.getElementById('audited-stores-count').textContent = auditedMonthlyCount;
    document.getElementById('remaining-stores-count').textContent = Math.max(0, remainingToTarget);
    
    // Yıllık Hedef (Bu, client'a atanan toplam bayi üzerinden hesaplanır - bu doğru)
    document.getElementById('annual-performance-indicator').innerHTML = `
        <div class="annual-header">
             <h4><i class="fas fa-calendar-alt"></i> ${today.getFullYear()} Yıllık Hedef</h4>
             <p class="annual-progress-text">${auditedYearlyCount} / ${totalStores}</p>
        </div>
        <div class="progress-bar">
            <div class="progress-bar-fill" style="width: ${annualProgress.toFixed(2)}%;">${annualProgress.toFixed(0)}%</div>
        </div>`;

    renderAuditedStores(); // Filtrelenmiş veriye göre denetlenenleri çizer
    document.getElementById('dashboard-content').style.display = 'block';
}

/**
 * O anki 'View' (allStores) listesine göre filtre seçeneklerini (Bölge, Yönetmen vb.) doldurur.
 */
function populateAllFilters(stores) {
    const filters = { bolge: 'bolge', yonetmen: 'yonetmen', sehir: 'sehir', ilce: 'ilce' };
    Object.keys(filters).forEach(key => {
        const select = document.getElementById(filters[key] + '-filter');
        // Filtreler o anki 'stores' görünümüne göre dolar
        const uniqueValues = [...new Set(stores.map(s => s[filters[key]]))].sort((a, b) => a.localeCompare(b, 'tr'));
        select.innerHTML = '<option value="Tümü">Tümü</option>';
        uniqueValues.forEach(value => { if (value) { select.innerHTML += `<option value="${value}">${value}</option>`; } });
    });
}

/**
 * Filtreler değiştiğinde 'Kalan Bayiler' listesini yeniden çizer.
 */
function applyAndRepopulateFilters() {
    const selected = {
        bolge: document.getElementById('bolge-filter').value, yonetmen: document.getElementById('yonetmen-filter').value,
        sehir: document.getElementById('sehir-filter').value, ilce: document.getElementById('ilce-filter').value
    };
    // 'allStores' zaten o anki görünüme (örn: "Benim Verilerim") göre filtrelenmiş durumda
    currentGlobalFilteredStores = allStores.filter(s =>
        (selected.bolge === 'Tümü' || s.bolge === selected.bolge) &&
        (selected.yonetmen === 'Tümü' || s.yonetmen === selected.yonetmen) &&
        (selected.sehir === 'Tümü' || s.sehir === selected.sehir) &&
        (selected.ilce === 'Tümü' || s.ilce === selected.ilce)
    );
    // YENİ EKLENDİ: Local filtreleme için 'currentGlobalFilteredStores'u güncelledik.
    // Listeyi bu filtrelenmiş sete göre çiz.
    renderRemainingStores(currentGlobalFilteredStores); 
}

/**
 * O anki 'View'e göre 'Denetlenecek Bayiler' listesini (Bölge bazlı) çizer.
 * YENİ ÖZELLİK: Local şehir filtresine göre de süzer.
 */
function renderRemainingStores(filteredStores) {
    const container = document.getElementById('denetlenecek-bayiler-container');
    container.innerHTML = '';
    
    // 'auditedStoreCodesCurrentMonth' zaten o anki görünüme göre filtrelenmiş
    const auditedCodesThisMonth = auditedStoreCodesCurrentMonth.map(audit => audit.code);
    
    // 1. Önce henüz denetlenmemiş TÜM bayileri bul (Local filtre öncesi)
    // Bu liste dropdown'ı doldurmak için kullanılacak.
    const allRemainingStores = filteredStores.filter(store => !auditedCodesThisMonth.includes(store.bayiKodu));

    if (allRemainingStores.length === 0) {
        // Dropdown'ı temizle
        const select = document.getElementById('local-city-filter');
        if(select) select.innerHTML = '<option value="Tümü">Şehir Yok</option>';
        container.innerHTML = `<p class="empty-list-message">Seçili kriterlere uygun, bu ay denetlenmemiş bayi bulunamadı.</p>`;
        return;
    }

    // 2. Local Filtre Dropdown'ını Doldur
    // Mevcut seçimi korumaya çalış, eğer listede yoksa 'Tümü' yap.
    const select = document.getElementById('local-city-filter');
    const previousSelection = localCityFilterValue; 
    
    // Kalan bayilerin şehirlerini benzersiz olarak al
    const uniqueCities = [...new Set(allRemainingStores.map(s => s.sehir))].sort((a, b) => a.localeCompare(b, 'tr'));
    
    select.innerHTML = '<option value="Tümü">Tüm Şehirler</option>';
    uniqueCities.forEach(city => {
        if (city) {
            select.innerHTML += `<option value="${city}">${city}</option>`;
        }
    });

    // Eski seçimi geri yükle (Eğer hala geçerliyse)
    if (uniqueCities.includes(previousSelection)) {
        select.value = previousSelection;
    } else {
        select.value = 'Tümü';
        localCityFilterValue = 'Tümü';
    }

    // 3. Listeyi Local Filtreye Göre Süz
    const storesToShow = localCityFilterValue === 'Tümü' 
        ? allRemainingStores 
        : allRemainingStores.filter(s => s.sehir === localCityFilterValue);


    // 4. Ekrana Çiz
    if (storesToShow.length === 0) {
        container.innerHTML = `<p class="empty-list-message">"${localCityFilterValue}" şehrinde denetlenmemiş bayi kalmadı.</p>`;
        return;
    }

    const storesByRegion = storesToShow.reduce((acc, store) => {
        const region = store.bolge || 'Bölge Belirtilmemiş';
        (acc[region] = acc[region] || []).push(store);
        return acc;
    }, {});

    Object.keys(storesByRegion).sort().forEach(region => {
        const regionStores = storesByRegion[region];
        // Bölge bazlı ilerleme hesabı (Burada local filtreyi dikkate almıyoruz, genel ilerlemeyi gösteriyoruz)
        // Ancak bu kafa karıştırıcı olabilir, o yüzden sadece listeyi çizmek daha sade.
        // Yine de mevcut yapıyı koruyarak ilerleme çubuğunu o bölgedeki GENEL duruma göre bırakıyorum.
        const totalInRegion = allStores.filter(s => (s.bolge || 'Bölge Belirtilmemiş') === region).length;
        const auditedInRegion = allStores.filter(s => (s.bolge || 'Bölge Belirtilmemiş') === region && auditedCodesThisMonth.includes(s.bayiKodu)).length;
        const progress = totalInRegion > 0 ? (auditedInRegion / totalInRegion) * 100 : 0;
        
        let regionHtml = `<div class="region-container"><div class="region-header"><span>${region} (Bu Ay: ${auditedInRegion}/${totalInRegion})</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width: ${progress.toFixed(2)}%;">${progress.toFixed(0)}%</div></div><ul class="store-list">`;
        regionStores.forEach(store => {
            regionHtml += `<li class="store-list-item">${store.bayiAdi} (${store.bayiKodu}) - ${store.sehir}/${store.ilce}</li>`;
        });
        regionHtml += '</ul></div>';
        container.innerHTML += regionHtml;
    });
}

/**
 * O anki 'View'e göre 'Bu Ay Denetlenenler' listesini çizer.
 */
function renderAuditedStores() {
    const container = document.getElementById('denetlenen-bayiler-container');
    // 'allStores' o anki görünümün bayi listesi
    if (!allStores || allStores.length === 0) { 
        container.innerHTML = '<p class="empty-list-message">Sistemde bu görünüm için bayi bulunamadı.</p>';
        return;
    }
    // 'auditedStoreCodesCurrentMonth' o anki görünümün denetim listesi
    if (auditedStoreCodesCurrentMonth.length === 0) { 
        container.innerHTML = '<p class="empty-list-message">Bu ay bu görünüm için denetim yapılmadı veya yapılanlar geri alındı.</p>';
        return;
    }
    
    // 'allStores' (o anki görünüm) listesini kullanarak denetlenenlerin detaylarını al
    const auditedStoresDetails = auditedStoreCodesCurrentMonth
        .map(audit => {
            // Güvenli olması için 'allStoresMaster' kullanalım:
            const storeFromMaster = allStoresMaster.find(store => store.bayiKodu === audit.code);
            return { ...(storeFromMaster || {bayiKodu: audit.code, bayiAdi: 'Bilinmeyen Bayi'}), timestamp: audit.timestamp };
        })
        .filter(store => store.bayiKodu) // Detayı bulunamayanları (normalde olmamalı) filtrele
        .sort((a, b) => b.timestamp - a.timestamp);
    
    let listHtml = '<ul class="store-list">';
    auditedStoresDetails.forEach(store => {
        // GÜNCELLENDİ: 'onclick' kaldırıldı, 'data-bayi-kodu' ve 'btn-revert-audit' sınıfı eklendi.
        const revertButtonHtml = currentUserRole === 'admin'
            ? `<button class="btn-warning btn-sm btn-revert-audit" data-bayi-kodu="${store.bayiKodu}" title="Bu denetimi listeden kaldır"><i class="fas fa-undo"></i> Geri Al</button>`
            : ''; // Client ise buton eklenmez

        listHtml += `<li class="store-list-item completed-item"><span>${store.bayiAdi} (${store.bayiKodu}) - ${store.bolge || 'Bölgesiz'}</span>${revertButtonHtml}</li>`;
    });
    container.innerHTML = listHtml + '</ul>';

    // GÜNCELLENDİ: Butonlar DOM'a eklendikten sonra olay dinleyicileri programatik olarak ekleniyor.
    container.querySelectorAll('.btn-revert-audit').forEach(button => {
        button.addEventListener('click', () => {
            const bayiKodu = button.dataset.bayiKodu;
            revertAudit(bayiKodu); // Modül içi fonksiyonu çağır
        });
    });
}

function getRemainingWorkdays() {
    const today = new Date(); const year = today.getFullYear(); const month = today.getMonth();
    // Ayın son gününü al (bir sonraki ayın 0. günü)
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    let remainingWorkdays = 0;
    
    // Eğer ayın son gününü geçtiysek (örn. 31'i olan ayda 32. gün hesaplaması gibi bir durumda) 0 dön
    if (today.getDate() > lastDayOfMonth) return 0;

    for (let day = today.getDate(); day <= lastDayOfMonth; day++) {
        const dayOfWeek = new Date(year, month, day).getDay();
        // 0 (Pazar) ve 6 (Cumartesi) dışındakileri say
        if (dayOfWeek > 0 && dayOfWeek < 6) {
            remainingWorkdays++;
        }
    }
    return remainingWorkdays;
}