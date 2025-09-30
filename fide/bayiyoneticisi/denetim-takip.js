// --- Global Değişkenler ---
let allStores = [];
let auditedStoreCodesCurrentMonth = [];
let auditedStoreCodesCurrentYear = [];
let revertedBayiKodlari = []; // YENİ: Geri alınan bayileri tutacak liste
let aylikHedef = 47; // Varsayılan hedef, sonradan ayarlardan yüklenecek
const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// --- Ana Uygulama Mantığı ---
window.onload = initializeApp;

async function initializeApp() {
    setupEventListeners();
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    
    await loadSettings();
    await loadRevertedList(); // YENİ: Geri alınanlar listesini yükle
    await loadAuditedStoresData();
    await loadStoreList();

    loadingOverlay.style.display = 'none';
}

async function loadSettings() {
    let settings = { aylikHedef: 47 };
    const localSettings = localStorage.getItem('denetimAyarlari');
    if (localSettings) {
        settings = JSON.parse(localSettings);
    }
    if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
        const settingsRef = database.ref('denetimAyarlari');
        const snapshot = await settingsRef.once('value');
        if (snapshot.exists()) {
            settings = snapshot.val();
            localStorage.setItem('denetimAyarlari', JSON.stringify(settings));
        }
    }
    aylikHedef = settings.aylikHedef || 47;
    document.getElementById('monthly-target-input').value = aylikHedef;
}

// YENİ FONKSİYON: Bu ay içinde denetimi geri alınan bayilerin listesini çeker
async function loadRevertedList() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth(); // 0-11 arası
    const path = `denetimTakipGeriAlinanlar/${currentYear}/${currentMonth}`;

    let revertedData = {};
    const localReverted = localStorage.getItem(path);
    if(localReverted) {
        revertedData = JSON.parse(localReverted);
    }

    if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
        const revertedRef = database.ref(path);
        const snapshot = await revertedRef.once('value');
        if(snapshot.exists()){
            revertedData = snapshot.val();
            localStorage.setItem(path, JSON.stringify(revertedData));
        }
    }
    // Veriyi { "12345": true, "67890": true } formatından ["12345", "67890"] formatına çevir
    revertedBayiKodlari = Object.keys(revertedData);
}


async function loadStoreList() {
    let storeData = null;
    const sixMonthsAgo = new Date().getTime() - (180 * 24 * 60 * 60 * 1000);

    const localStoreData = localStorage.getItem('tumBayilerListesi');
    if (localStoreData) {
        storeData = JSON.parse(localStoreData);
    }
    
    if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
        const storeListRef = database.ref('tumBayilerListesi');
        const snapshot = await storeListRef.once('value');
        if (snapshot.exists()) {
            storeData = snapshot.val();
            localStorage.setItem('tumBayilerListesi', JSON.stringify(storeData));
        }
    }

    if (storeData && storeData.timestamp > sixMonthsAgo) {
        allStores = storeData.stores;
        document.getElementById('upload-area').style.display = 'none';
        document.getElementById('loaded-data-area').style.display = 'block';
        runDashboard();
    } else {
        document.getElementById('upload-area').style.display = 'block';
        document.getElementById('loaded-data-area').style.display = 'none';
    }
}

function runDashboard() {
    calculateAndDisplayDashboard();
    populateAllFilters(allStores);
    renderRemainingStores(allStores);
}

// GÜNCELLENDİ: Artık 'revertedBayiKodlari' listesini kullanarak filtreleme yapıyor
async function loadAuditedStoresData() {
    try {
        let allReports = {};
        const localData = localStorage.getItem('allFideReports');
        if (localData) allReports = JSON.parse(localData);

        if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
            const reportsRef = database.ref('allFideReports');
            const snapshot = await reportsRef.once('value');
            if (snapshot.exists()) Object.assign(allReports, snapshot.val());
        }
        
        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const monthlyCodes = [];
        const yearlyCodes = [];

        Object.entries(allReports).forEach(([key, value]) => {
            const storeCode = key.replace('store_', '');
            
            // Geri Alınanlar listesindeyse bu kaydı atla
            if(revertedBayiKodlari.includes(storeCode)) {
                return;
            }

            const reportDate = new Date(value.timestamp);

            if (reportDate.getFullYear() === currentYear) yearlyCodes.push(storeCode);
            if (reportDate.getMonth() === currentMonth && reportDate.getFullYear() === currentYear) monthlyCodes.push(storeCode);
        });

        auditedStoreCodesCurrentMonth = [...new Set(monthlyCodes)];
        auditedStoreCodesCurrentYear = [...new Set(yearlyCodes)];
    } catch (error) {
        console.error("Denetlenen bayi verileri okunurken hata oluştu:", error);
    }
}

function setupEventListeners() {
    document.getElementById('open-admin-panel-btn').addEventListener('click', () => {
        document.getElementById('admin-panel-overlay').style.display = 'flex';
    });
    document.getElementById('close-admin-panel-btn').addEventListener('click', () => {
        document.getElementById('admin-panel-overlay').style.display = 'none';
    });
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    document.getElementById('store-list-excel-input').addEventListener('change', handleStoreExcelUpload);
    
    const deleteExcelBtn = document.getElementById('delete-excel-btn');
    if(deleteExcelBtn) deleteExcelBtn.addEventListener('click', deleteStoreList);
    
    document.getElementById('bolge-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('yonetmen-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('sehir-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('ilce-filter').addEventListener('change', applyAndRepopulateFilters);
}

async function saveSettings() {
    const newTarget = parseInt(document.getElementById('monthly-target-input').value);
    if (!newTarget || newTarget < 1) {
        alert("Lütfen geçerli bir hedef girin.");
        return;
    }
    const settings = { aylikHedef: newTarget };
    localStorage.setItem('denetimAyarlari', JSON.stringify(settings));
    if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
        await database.ref('denetimAyarlari').set(settings);
    }
    aylikHedef = newTarget;
    alert("Ayarlar kaydedildi.");
    document.getElementById('admin-panel-overlay').style.display = 'none';
    runDashboard();
}

async function deleteStoreList() {
    const dogruSifreHash = 'ZmRlMDAx';
    const girilenSifre = prompt("DİKKAT! Bu işlem, yüklenmiş olan Excel bayi listesini hem bilgisayarınızdan hem de buluttan kalıcı olarak siler. Silmek için yönetici şifresini girin:");
    if (!girilenSifre) return;
    if (btoa(girilenSifre) !== dogruSifreHash) {
        alert("Hatalı şifre! İşlem iptal edildi.");
        return;
    }
    if (confirm("Şifre doğru. Excel bayi listesini kalıcı olarak silmek istediğinizden emin misiniz? Bu işlem sonrası yeni bir liste yüklemeniz gerekecektir.")) {
        localStorage.removeItem('tumBayilerListesi');
        if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
            await database.ref('tumBayilerListesi').remove();
        }
        alert("Bayi listesi başarıyla silindi. Sayfa yeniden başlatılıyor.");
        window.location.reload();
    }
}

// GÜNCELLENDİ: Artık ana raporu silmiyor, sadece ayrı bir listeye işaretliyor.
async function revertAudit(bayiKodu) {
    const store = allStores.find(s => s.bayiKodu === bayiKodu);
    const storeName = store ? store.bayiAdi : bayiKodu;

    if (confirm(`'${storeName}' bayisinin bu ayki denetimini geri almak istediğinizden emin misiniz? Ana rapor verisi SİLİNMEYECEK, sadece bu ayki takip listesinden çıkarılacaktır.`)) {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.display = 'flex';

        try {
            const today = new Date();
            const currentYear = today.getFullYear();
            const currentMonth = today.getMonth();
            const path = `denetimTakipGeriAlinanlar/${currentYear}/${currentMonth}`;
            
            // Geri alınanlar listesine bu bayiyi ekle
            revertedBayiKodlari.push(bayiKodu);
            const revertedData = revertedBayiKodlari.reduce((acc, code) => {
                acc[code] = true;
                return acc;
            }, {});

            // 1. Yerel Hafızayı Güncelle
            localStorage.setItem(path, JSON.stringify(revertedData));

            // 2. Bulutu Güncelle
            if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
                await database.ref(path).set(revertedData);
            }
            
            alert("Denetim başarıyla geri alındı. Sayfa güncelleniyor.");
            window.location.reload();

        } catch (error) {
            alert("Denetim geri alınırken bir hata oluştu: " + error.message);
            console.error("Geri alma hatası:", error);
            loadingOverlay.style.display = 'none';
        }
    }
}

function handleStoreExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = async function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
            await processStoreExcelData(dataAsArray);
        } catch (error) {
            alert("Excel dosyası okunurken bir hata oluştu.");
        }
    };
}

async function processStoreExcelData(dataAsArray) {
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
    localStorage.setItem('tumBayilerListesi', JSON.stringify(dataToSave));
    
    const loadingOverlay = document.getElementById('loading-overlay');
    
    try {
        if (typeof auth !== 'undefined' && auth.currentUser && typeof database !== 'undefined') {
            loadingOverlay.style.display = 'flex';
            await database.ref('tumBayilerListesi').set(dataToSave);
        }
        alert("Excel listesi başarıyla yüklendi ve kaydedildi.");
        window.location.reload();
    } catch (error) {
        console.error("Buluta kaydetme hatası:", error);
        alert("Liste yerel olarak kaydedildi ancak buluta kaydedilirken bir hata oluştu: " + error.message);
        window.location.reload();
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
             <h4><i class="fas fa-calendar-alt"></i> ${currentYear} Yıllık Hedef (${totalStores} Bayi)</h4>
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
    if (!allStores || allStores.length === 0) return;
    container.innerHTML = '';
    if (auditedStoreCodesCurrentMonth.length === 0) {
        container.innerHTML = '<p class="empty-list-message">Bu ay henüz denetim yapılmadı.</p>';
        return;
    }
    const auditedStoresDetails = auditedStoreCodesCurrentMonth.map(code => allStores.find(store => store.bayiKodu === code)).filter(store => store !== undefined).sort((a,b) => a.bayiAdi.localeCompare(b.bayiAdi, 'tr'));
    let listHtml = '<ul class="store-list">';
    auditedStoresDetails.forEach(store => {
        listHtml += `<li class="store-list-item completed-item"><span>${store.bayiAdi} (${store.bayiKodu}) - ${store.bolge}</span><button class="btn-warning btn-sm" onclick="revertAudit('${store.bayiKodu}')" title="Bu denetimi geri al"><i class="fas fa-undo"></i> Geri Al</button></li>`;
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