// --- Global Değişkenler ---
let allStores = [];
let auditedStoreCodesCurrentMonth = [];
let auditedStoreCodesCurrentYear = [];
let geriAlinanBayiKodlariBuAy = [];
let geriAlinanBayiKodlariBuYil = [];
let aylikHedef = 47;
const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// --- Ana Uygulama Mantığı ---

document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase !== 'undefined' && typeof firebase.auth === 'function') {
        firebase.auth().onAuthStateChanged(function(user) {
            const loadingOverlay = document.getElementById('loading-overlay');
            const dashboardContent = document.getElementById('dashboard-content');

            if (user) {
                // KULLANICI GİRİŞ YAPMIŞSA:
                if(dashboardContent) dashboardContent.style.display = 'block';
                // GÜNCELLENDİ: Kullanıcı UID'si ile uygulamayı başlat
                initializeApp(user.uid);
            } else {
                // KULLANICI GİRİŞ YAPMAMIŞSA:
                if(loadingOverlay) {
                    loadingOverlay.innerHTML = '<h2><i class="fas fa-sign-in-alt"></i> Lütfen Giriş Yapın</h2><p>Denetim verilerinizi görmek için sisteme giriş yapmalısınız.</p>';
                    loadingOverlay.style.display = 'flex';
                }
                if(dashboardContent) dashboardContent.style.display = 'none';
            }
        });
    } else {
        // Firebase yüklenememişse hata göster.
        const loadingOverlay = document.getElementById('loading-overlay');
        if(loadingOverlay) {
            loadingOverlay.innerHTML = '<h2><i class="fas fa-exclamation-triangle"></i> Bağlantı Hatası</h2><p>Uygulama başlatılamadı. İnternet bağlantınızı kontrol edin.</p>';
            loadingOverlay.style.display = 'flex';
        }
    }
});


async function initializeApp(uid) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.innerHTML = '<div class="loader"></div><p>Veriler Yükleniyor...</p>';
    loadingOverlay.style.display = 'flex';

    // GÜNCELLENDİ: Tüm fonksiyonlara UID parametresi eklendi
    setupEventListeners(uid);
    
    await loadSettings(uid);
    await loadGeriAlinanBayiler(uid);
    await loadAuditedStoresData(uid);
    await loadStoreList(uid); 

    loadingOverlay.style.display = 'none';
}

// GÜNCELLENDİ: Artık kullanıcıya özel yoldan okuma yapıyor
async function loadSettings(uid) {
    let settings = { aylikHedef: 47 };
    const userSettingsPath = `users/${uid}/denetimAyarlari`;
    const localSettingsKey = `denetimAyarlari_${uid}`;

    if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
        try {
            const settingsRef = database.ref(userSettingsPath);
            const snapshot = await settingsRef.once('value');
            if (snapshot.exists()) {
                settings = snapshot.val();
                localStorage.setItem(localSettingsKey, JSON.stringify(settings)); 
            } else {
                const localSettings = localStorage.getItem(localSettingsKey);
                if (localSettings) settings = JSON.parse(localSettings);
            }
        } catch (error) {
            console.error("Ayarlar buluttan okunamadı, yerel veri kullanılıyor:", error);
            const localSettings = localStorage.getItem(localSettingsKey);
            if (localSettings) settings = JSON.parse(localSettings);
        }
    } else {
        const localSettings = localStorage.getItem(localSettingsKey);
        if (localSettings) settings = JSON.parse(localSettings);
    }

    aylikHedef = settings.aylikHedef || 47;
    document.getElementById('monthly-target-input').value = aylikHedef;
}

// GÜNCELLENDİ: Artık kullanıcıya özel yoldan okuma yapıyor
async function loadStoreList(uid) {
    let storeData = null;
    const sixMonthsAgo = new Date().getTime() - (180 * 24 * 60 * 60 * 1000);
    const userStoreListPath = `users/${uid}/tumBayilerListesi`;
    const localStoreListKey = `tumBayilerListesi_${uid}`;

    if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
        try {
            const storeListRef = database.ref(userStoreListPath);
            const snapshot = await storeListRef.once('value');
            if (snapshot.exists()) {
                storeData = snapshot.val();
                localStorage.setItem(localStoreListKey, JSON.stringify(storeData)); 
            } else {
                const localStoreData = localStorage.getItem(localStoreListKey);
                if (localStoreData) storeData = JSON.parse(localStoreData);
            }
        } catch (error) {
            console.error("Bayi listesi buluttan okunamadı, yerel veri kullanılıyor:", error);
            const localStoreData = localStorage.getItem(localStoreListKey);
            if (localStoreData) storeData = JSON.parse(localStoreData);
        }
    } else {
        const localStoreData = localStorage.getItem(localStoreListKey);
        if (localStoreData) storeData = JSON.parse(localStoreData);
    }

    if (storeData && storeData.stores && storeData.timestamp > sixMonthsAgo) {
        allStores = storeData.stores;
        document.getElementById('upload-area').style.display = 'none';
        document.getElementById('loaded-data-area').style.display = 'block';
    } else {
        if (storeData) localStorage.removeItem(localStoreListKey); 
        document.getElementById('upload-area').style.display = 'block';
        document.getElementById('loaded-data-area').style.display = 'none';
    }
    
    runDashboard();
}

function runDashboard() {
    calculateAndDisplayDashboard();
    populateAllFilters(allStores);
    renderRemainingStores(allStores);
}

// GÜNCELLENDİ: Artık kullanıcıya özel yoldan okuma yapıyor
async function loadGeriAlinanBayiler(uid) {
    let geriAlinanlar = {};
    const userGeriAlinanlarPath = `users/${uid}/denetimGeriAlinanlar`;
    const localGeriAlinanlarKey = `denetimGeriAlinanlar_${uid}`;

    if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
        try {
            const ref = database.ref(userGeriAlinanlarPath);
            const snapshot = await ref.once('value');
            if (snapshot.exists()) {
                geriAlinanlar = snapshot.val();
                localStorage.setItem(localGeriAlinanlarKey, JSON.stringify(geriAlinanlar)); 
            } else {
                const localData = localStorage.getItem(localGeriAlinanlarKey);
                if (localData) geriAlinanlar = JSON.parse(localData);
            }
        } catch (error) {
            console.error("Geri alınan bayi bilgisi buluttan okunamadı, yerel veri kullanılıyor:", error);
            const localData = localStorage.getItem(localGeriAlinanlarKey);
            if (localData) geriAlinanlar = JSON.parse(localData);
        }
    } else {
        const localData = localStorage.getItem(localGeriAlinanlarKey);
        if (localData) geriAlinanlar = JSON.parse(localData);
    }
    
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthKey = `${currentYear}-${today.getMonth()}`;

    geriAlinanBayiKodlariBuAy = geriAlinanlar[currentMonthKey] || [];
    
    const yearlyRevertedCodes = [];
    for (const key in geriAlinanlar) {
        if (key.startsWith(String(currentYear))) {
            yearlyRevertedCodes.push(...geriAlinanlar[key]);
        }
    }
    geriAlinanBayiKodlariBuYil = [...new Set(yearlyRevertedCodes)];
}

// GÜNCELLENDİ: Artık kullanıcıya özel yoldan okuma yapıyor
async function loadAuditedStoresData(uid) {
    let allReports = {};
    const userAllFideReportsPath = `users/${uid}/allFideReports`;
    const localAllFideReportsKey = `allFideReports_${uid}`;
    
    if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
        try {
            const reportsRef = database.ref(userAllFideReportsPath);
            const snapshot = await reportsRef.once('value');
            if (snapshot.exists()) {
                allReports = snapshot.val();
                localStorage.setItem(localAllFideReportsKey, JSON.stringify(allReports)); 
            } else {
                const localData = localStorage.getItem(localAllFideReportsKey);
                if (localData) allReports = JSON.parse(localData);
            }
        } catch (error) {
            console.error("Denetlenen bayi verileri buluttan okunamadı, yerel veri kullanılıyor:", error);
            const localData = localStorage.getItem(localAllFideReportsKey);
            if (localData) allReports = JSON.parse(localData);
        }
    } else {
        const localData = localStorage.getItem(localAllFideReportsKey);
        if (localData) allReports = JSON.parse(localData);
    }
    
    try {
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const monthlyCodesFromReports = [];
        const yearlyCodes = [];

        Object.entries(allReports).forEach(([key, value]) => {
            if (value.data && value.data.auditCompletedTimestamp) {
                const reportDate = new Date(value.data.auditCompletedTimestamp);
                const storeCode = key.replace('store_', '');
                
                if (reportDate.getFullYear() === currentYear) {
                    yearlyCodes.push(storeCode);
                    if (reportDate.getMonth() === currentMonth) {
                        monthlyCodesFromReports.push(storeCode);
                    }
                }
            }
        });
        
        const uniqueMonthlyCodes = [...new Set(monthlyCodesFromReports)];
        auditedStoreCodesCurrentMonth = uniqueMonthlyCodes.filter(code => !geriAlinanBayiKodlariBuAy.includes(code));
        
        const uniqueYearlyCodes = [...new Set(yearlyCodes)];
        auditedStoreCodesCurrentYear = uniqueYearlyCodes.filter(code => !geriAlinanBayiKodlariBuYil.includes(code));

    } catch (error) {
        console.error("Denetlenen bayi verileri işlenirken hata oluştu:", error);
    }
}


function setupEventListeners(uid) {
    document.getElementById('open-admin-panel-btn').addEventListener('click', () => {
        document.getElementById('admin-panel-overlay').style.display = 'flex';
    });
    document.getElementById('close-admin-panel-btn').addEventListener('click', () => {
        document.getElementById('admin-panel-overlay').style.display = 'none';
    });
    document.getElementById('save-settings-btn').onclick = () => saveSettings(uid);
    document.getElementById('store-list-excel-input').onchange = (event) => handleStoreExcelUpload(event, uid);
    document.getElementById('delete-excel-btn').onclick = () => deleteStoreList(uid);
    document.getElementById('reset-data-btn').onclick = () => resetProgress(uid);
    
    document.getElementById('bolge-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('yonetmen-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('sehir-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('ilce-filter').addEventListener('change', applyAndRepopulateFilters);
}

// GÜNCELLENDİ: Artık kullanıcıya özel yola yazma ve okuma yapıyor
async function resetProgress(uid) {
    if (!confirm("Bu işlem, bu yıla ait TÜM denetim verilerini sıfırlayacaktır. 'Bu Ay Denetlenenler' ve 'Yıllık Hedef' sayaçları sıfırlanır. Onaylıyor musunuz?")) return;

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        const userAllFideReportsPath = `users/${uid}/allFideReports`;
        const userGeriAlinanlarPath = `users/${uid}/denetimGeriAlinanlar`;
        const localGeriAlinanlarKey = `denetimGeriAlinanlar_${uid}`;

        let allReports = {};
        if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
            const reportsRef = database.ref(userAllFideReportsPath);
            const snapshot = await reportsRef.once('value');
            if (snapshot.exists()) allReports = snapshot.val();
        }
       
        const today = new Date();
        const currentYear = today.getFullYear();
        const yearlyCodesToReset = [];

        Object.entries(allReports).forEach(([key, value]) => {
            if (value.data && value.data.auditCompletedTimestamp) {
                const reportDate = new Date(value.data.auditCompletedTimestamp);
                if (reportDate.getFullYear() === currentYear) {
                    yearlyCodesToReset.push(key.replace('store_', ''));
                }
            }
        });

        const uniqueCodesToReset = [...new Set(yearlyCodesToReset)];

        const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
        
        let geriAlinanlar = {};
        const geriAlinanlarRef = database.ref(userGeriAlinanlarPath);
        const snapshot = await geriAlinanlarRef.once('value');
        if(snapshot.exists()) geriAlinanlar = snapshot.val();
        
        if (!geriAlinanlar[currentMonthKey]) geriAlinanlar[currentMonthKey] = [];

        uniqueCodesToReset.forEach(code => {
            if (!geriAlinanlar[currentMonthKey].includes(code)) {
                geriAlinanlar[currentMonthKey].push(code);
            }
        });

        localStorage.setItem(localGeriAlinanlarKey, JSON.stringify(geriAlinanlar));
        await database.ref(`${userGeriAlinanlarPath}/${currentMonthKey}`).set(geriAlinanlar[currentMonthKey]);
        
        window.location.reload();

    } catch (error) {
        alert("Veriler sıfırlanırken bir hata oluştu: " + error.message);
        loadingOverlay.style.display = 'none';
    }
}

// GÜNCELLENDİ: Artık kullanıcıya özel yola yazma yapıyor
async function saveSettings(uid) {
    const newTarget = parseInt(document.getElementById('monthly-target-input').value);
    if (!newTarget || newTarget < 1) {
        alert("Lütfen geçerli bir hedef girin.");
        return;
    }
    const settings = { aylikHedef: newTarget };
    localStorage.setItem(`denetimAyarlari_${uid}`, JSON.stringify(settings));
    if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
        await database.ref(`users/${uid}/denetimAyarlari`).set(settings);
    }
    aylikHedef = newTarget;
    alert("Ayarlar kaydedildi.");
    document.getElementById('admin-panel-overlay').style.display = 'none';
    runDashboard();
}

// GÜNCELLENDİ: Artık kullanıcıya özel yoldan silme yapıyor
async function deleteStoreList(uid) {
    const dogruSifreHash = 'ZmRlMDAx';
    const girilenSifre = prompt("DİKKAT! Bu işlem, yüklenmiş olan Excel bayi listesini hem bilgisayarınızdan hem de buluttan kalıcı olarak siler. Silmek için yönetici şifresini girin:");
    if (!girilenSifre || btoa(girilenSifre) !== dogruSifreHash) {
        if(girilenSifre) alert("Hatalı şifre! İşlem iptal edildi.");
        return;
    }
    if (confirm("Şifre doğru. Excel bayi listesini kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem sonrası yeni bir liste yüklemeniz gerekecektir.")) {
        localStorage.removeItem(`tumBayilerListesi_${uid}`);
        if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
            await database.ref(`users/${uid}/tumBayilerListesi`).remove();
        }
        alert("Bayi listesi başarıyla silindi. Sayfa yeniden başlatılıyor.");
        window.location.reload();
    }
}

// GÜNCELLENDİ: Artık kullanıcıya özel yola yazma ve okuma yapıyor
async function revertAudit(bayiKodu) {
    const uid = auth.currentUser.uid;
    if (!uid) return alert("İşlem yapılamadı. Lütfen tekrar giriş yapın.");

    const store = allStores.find(s => s.bayiKodu === bayiKodu);
    const storeName = store ? store.bayiAdi : bayiKodu;
    if (confirm(`'${storeName}' bayisinin bu ayki denetimini listeden kaldırmak istediğinizden emin misiniz?`)) {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.display = 'flex';
        try {
            const today = new Date();
            const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
            const userGeriAlinanlarPath = `users/${uid}/denetimGeriAlinanlar`;

            let geriAlinanlar = {};
            const geriAlinanlarRef = database.ref(userGeriAlinanlarPath);
            const snapshot = await geriAlinanlarRef.once('value');
            if(snapshot.exists()) geriAlinanlar = snapshot.val();
            
            if (!geriAlinanlar[currentMonthKey]) geriAlinanlar[currentMonthKey] = [];
            if (!geriAlinanlar[currentMonthKey].includes(bayiKodu)) {
                geriAlinanlar[currentMonthKey].push(bayiKodu);
            }

            localStorage.setItem(`denetimGeriAlinanlar_${uid}`, JSON.stringify(geriAlinanlar));
            await database.ref(`${userGeriAlinanlarPath}/${currentMonthKey}`).set(geriAlinanlar[currentMonthKey]);
            
            window.location.reload();
        } catch (error) {
            alert("Denetim geri alınırken bir hata oluştu: " + error.message);
            loadingOverlay.style.display = 'none';
        }
    }
}

function handleStoreExcelUpload(event, uid) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
            processStoreExcelData(dataAsArray, uid);
        } catch (error) {
            alert("Excel dosyası okunurken bir hata oluştu.");
        }
    };
}

// GÜNCELLENDİ: Artık kullanıcıya özel yola yazma yapıyor
function processStoreExcelData(dataAsArray, uid) {
    if (dataAsArray.length < 2) return alert('Excel dosyası beklenen formatta değil.');
    const headerRow = dataAsArray[0].map(h => String(h).trim());
    const colIndexes = {
        bolge: headerRow.indexOf('Bölge'), yonetmen: headerRow.indexOf('Bayi Yönetmeni'),
        sehir: headerRow.indexOf('Şehir'), ilce: headerRow.indexOf('İlçe'),
        kod: headerRow.indexOf('Bayi Kodu'), ad: headerRow.indexOf('Bayiler')
    };
    if (Object.values(colIndexes).some(index => index === -1)) return alert('Excel dosyasında gerekli sütunlar bulunamadı.');
    
    const dataRows = dataAsArray.slice(1);
    allStores = dataRows.map(row => {
        const bayiKodu = String(row[colIndexes.kod]).trim();
        if (!bayiKodu) return null;
        return {
            bayiKodu: bayiKodu, bayiAdi: String(row[colIndexes.ad]).trim(), sehir: String(row[colIndexes.sehir]).trim(),
            ilce: String(row[colIndexes.ilce]).trim(), bolge: String(row[colIndexes.bolge]).trim(), yonetmen: String(row[colIndexes.yonetmen]).trim()
        };
    }).filter(store => store !== null);

    const dataToSave = { timestamp: new Date().getTime(), stores: allStores };
    localStorage.setItem(`tumBayilerListesi_${uid}`, JSON.stringify(dataToSave));
    if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
        database.ref(`users/${uid}/tumBayilerListesi`).set(dataToSave)
            .then(() => {
                alert("Excel listesi başarıyla yüklendi ve kaydedildi.");
                window.location.reload();
            })
            .catch(error => {
                alert("Veri buluta kaydedilirken bir hata oluştu: " + error.message);
            });
    }
}

function calculateAndDisplayDashboard() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const auditedMonthlyCount = auditedStoreCodesCurrentMonth.length;
    const remainingToTarget = aylikHedef - auditedMonthlyCount;
    const remainingWorkDays = getRemainingWorkdays();
    const totalStores = allStores.length;
    const auditedYearlyCount = auditedStoreCodesCurrentYear.length;
    const annualProgress = totalStores > 0 ? (auditedYearlyCount / totalStores) * 100 : 0;
    
    document.getElementById('dashboard-title').innerHTML = `<i class="fas fa-calendar-day"></i> ${currentYear} ${monthNames[today.getMonth()]} Ayı Performansı`;
    document.getElementById('work-days-count').textContent = remainingWorkDays;
    document.getElementById('total-stores-count').textContent = aylikHedef;
    document.getElementById('audited-stores-count').textContent = auditedMonthlyCount;
    document.getElementById('remaining-stores-count').textContent = remainingToTarget > 0 ? remainingToTarget : 0;
    
    const annualIndicator = document.getElementById('annual-performance-indicator');
    annualIndicator.innerHTML = `
        <div class="annual-header">
             <h4><i class="fas fa-calendar-alt"></i> ${currentYear} Yıllık Hedef</h4>
             <p class="annual-progress-text">${auditedYearlyCount} / ${totalStores}</p>
        </div>
        <div class="progress-bar">
            <div class="progress-bar-fill" style="width: ${annualProgress.toFixed(2)}%; background-color: var(--primary);">${annualProgress.toFixed(0)}%</div>
        </div>
    `;

    renderAuditedStores();
    document.getElementById('dashboard-content').style.display = 'block';
}

function populateAllFilters(stores) {
    if (!stores || stores.length === 0) return;
    const filters = { bolge: document.getElementById('bolge-filter'), yonetmen: document.getElementById('yonetmen-filter'), sehir: document.getElementById('sehir-filter'), ilce: document.getElementById('ilce-filter') };
    Object.keys(filters).forEach(key => {
        const selectElement = filters[key];
        const uniqueValues = [...new Set(stores.map(store => store[key]))].sort((a, b) => a.localeCompare(b, 'tr'));
        selectElement.innerHTML = '<option value="Tümü">Tümü</option>';
        uniqueValues.forEach(value => {
            if (value) {
                const option = document.createElement('option');
                option.value = value; option.textContent = value;
                selectElement.appendChild(option);
            }
        });
    });
}

function applyAndRepopulateFilters() {
    const selected = {
        bolge: document.getElementById('bolge-filter').value, yonetmen: document.getElementById('yonetmen-filter').value,
        sehir: document.getElementById('sehir-filter').value, ilce: document.getElementById('ilce-filter').value
    };
    let filteredStores = [...allStores];
    let currentScope = [...allStores];
    if (selected.bolge !== 'Tümü') filteredStores = filteredStores.filter(s => s.bolge === selected.bolge);
    populateDynamicFilters(currentScope, ['yonetmen', 'sehir', 'ilce'], selected);
    currentScope = [...filteredStores];
    if (selected.yonetmen !== 'Tümü') filteredStores = filteredStores.filter(s => s.yonetmen === selected.yonetmen);
    populateDynamicFilters(currentScope, ['bolge', 'sehir', 'ilce'], selected);
    currentScope = [...filteredStores];
    if (selected.sehir !== 'Tümü') filteredStores = filteredStores.filter(s => s.sehir === selected.sehir);
    populateDynamicFilters(currentScope, ['bolge', 'yonetmen', 'ilce'], selected);
    currentScope = [...filteredStores];
    if (selected.ilce !== 'Tümü') filteredStores = filteredStores.filter(s => s.ilce === selected.ilce);
    populateDynamicFilters(currentScope, ['bolge', 'yonetmen', 'sehir'], selected);
    renderRemainingStores(filteredStores);
}

function populateDynamicFilters(storesToUse, filtersToUpdate, currentSelection) {
    filtersToUpdate.forEach(key => {
        const selectElement = document.getElementById(key + '-filter');
        const uniqueValues = [...new Set(storesToUse.map(store => store[key]))].sort((a, b) => a.localeCompare(b, 'tr'));
        selectElement.innerHTML = '<option value="Tümü">Tümü</option>';
        uniqueValues.forEach(value => {
            if (value) {
                const option = document.createElement('option');
                option.value = value; option.textContent = value;
                selectElement.appendChild(option);
            }
        });
        selectElement.value = currentSelection[key];
    });
}

function renderRemainingStores(filteredStores) {
    const container = document.getElementById('denetlenecek-bayiler-container');
    container.innerHTML = '';
    const remainingStores = filteredStores.filter(store => !auditedStoreCodesCurrentMonth.includes(store.bayiKodu));

    if (remainingStores.length === 0) {
        container.innerHTML = `<p class="empty-list-message">Seçili kriterlere uygun, bu ay denetlenmemiş bayi bulunamadı.</p>`;
        return;
    }
    const storesByRegion = remainingStores.reduce((acc, store) => {
        const region = store.bolge || 'Bölge Belirtilmemiş';
        if (!acc[region]) acc[region] = [];
        acc[region].push(store);
        return acc;
    }, {});
    const sortedRegions = Object.keys(storesByRegion).sort();
    sortedRegions.forEach(region => {
        const regionStores = storesByRegion[region];
        const totalInRegionFiltered = filteredStores.filter(s => (s.bolge || 'Bölge Belirtilmemiş') === region);
        const auditedInRegionFiltered = totalInRegionFiltered.filter(s => auditedStoreCodesCurrentMonth.includes(s.bayiKodu));
        const progress = totalInRegionFiltered.length > 0 ? (auditedInRegionFiltered.length / totalInRegionFiltered.length) * 100 : 0;
        let regionHtml = `<div class="region-container"><div class="region-header"><span>${region} (Bu Ay: ${auditedInRegionFiltered.length}/${totalInRegionFiltered.length})</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width: ${progress.toFixed(2)}%;">${progress.toFixed(0)}%</div></div><ul class="store-list">`;
        regionStores.forEach(store => {
            regionHtml += `<li class="store-list-item">${store.bayiAdi} (${store.bayiKodu}) - ${store.sehir}/${store.ilce}</li>`;
        });
        regionHtml += '</ul></div>';
        container.innerHTML += regionHtml;
    });
}

function renderAuditedStores() {
    const container = document.getElementById('denetlenen-bayiler-container');
    if (!allStores || allStores.length === 0) {
         container.innerHTML = '<p class="empty-list-message">Başlamak için lütfen bir bayi listesi Excel\'i yükleyin.</p>';
        return;
    }
    container.innerHTML = '';
    
    if (auditedStoreCodesCurrentMonth.length === 0) {
        container.innerHTML = '<p class="empty-list-message">Bu ay henüz denetim yapılmadı veya yapılanlar geri alındı.</p>';
        return;
    }

    const auditedStoresDetails = auditedStoreCodesCurrentMonth.map(code => allStores.find(store => store.bayiKodu === code)).filter(store => store !== undefined).sort((a,b) => a.bayiAdi.localeCompare(b.bayiAdi, 'tr'));
    
    let listHtml = '<ul class="store-list">';
    auditedStoresDetails.forEach(store => {
        listHtml += `<li class="store-list-item completed-item"><span>${store.bayiAdi} (${store.bayiKodu}) - ${store.bolge}</span><button class="btn-warning btn-sm" onclick="revertAudit('${store.bayiKodu}')" title="Bu denetimi listeden kaldır"><i class="fas fa-undo"></i> Geri Al</button></li>`;
    });
    listHtml += '</ul>';
    container.innerHTML = listHtml;
}


function getWorkdaysInCurrentMonth() {
    const today = new Date(); const year = today.getFullYear(); const month = today.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let workdays = 0;
    for (let day = 1; day <= daysInMonth; day++) {
        const currentDate = new Date(year, month, day);
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek > 0 && dayOfWeek < 6) workdays++;
    }
    return workdays;
}

function getRemainingWorkdays() {
    const today = new Date(); const year = today.getFullYear(); const month = today.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    let remainingWorkdays = 0;
    if (today.getDate() > lastDayOfMonth) return 0;
    for (let day = today.getDate(); day <= lastDayOfMonth; day++) {
        const currentDate = new Date(year, month, day);
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek > 0 && dayOfWeek < 6) remainingWorkdays++;
    }
    return remainingWorkdays;
}