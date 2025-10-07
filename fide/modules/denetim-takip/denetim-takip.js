// --- Global Değişkenler ---
let allStores = [];
let auditedStoreCodesCurrentMonth = [];
let auditedStoreCodesCurrentYear = [];
let geriAlinanBayiKodlariBuAy = [];
let geriAlinanBayiKodlariBuYil = [];
let aylikHedef = 47;
const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeDenetimTakipModule() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    if (auth.currentUser) {
        setupModuleEventListeners();
        await loadSettings();
        await loadGeriAlinanBayiler();
        await loadAuditedStoresData();
        await loadStoreList(); // Bu fonksiyon içinde runDashboard() çağrılıyor.
    } else {
        console.log("Verileri yüklemek için lütfen giriş yapın.");
        document.getElementById('upload-area').innerHTML = '<p style="text-align: center; color: var(--danger);">Denetim takip sistemini kullanmak için lütfen sisteme giriş yapın.</p>';
        document.getElementById('upload-area').style.display = 'block';
    }
    
    loadingOverlay.style.display = 'none';
}

async function loadSettings() {
    aylikHedef = 47; // Varsayılan
    if (auth.currentUser && database) {
        try {
            const settingsRef = database.ref('denetimAyarlari');
            const snapshot = await settingsRef.once('value');
            if (snapshot.exists()) {
                const settings = snapshot.val();
                aylikHedef = settings.aylikHedef || 47;
            }
        } catch (error) {
            console.error("Ayarlar yüklenemedi:", error);
        }
    }
    document.getElementById('monthly-target-input').value = aylikHedef;
}

async function loadStoreList() {
    let storeData = null;
    const sixMonthsAgo = new Date().getTime() - (180 * 24 * 60 * 60 * 1000);
    
    if (auth.currentUser && database) {
        try {
            const storeListRef = database.ref('tumBayilerListesi');
            const snapshot = await storeListRef.once('value');
            if (snapshot.exists()) {
                storeData = snapshot.val();
            }
        } catch (error) {
            console.error("Bayi listesi yüklenemedi:", error);
        }
    }

    if (storeData && storeData.timestamp > sixMonthsAgo) {
        allStores = storeData.stores;
        document.getElementById('upload-area').style.display = 'none';
        document.getElementById('loaded-data-area').style.display = 'block';
    } else {
        allStores = []; // Eski veri varsa temizle
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

async function loadGeriAlinanBayiler() {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthKey = `${currentYear}-${today.getMonth()}`;
    let geriAlinanlar = {};

    if (auth.currentUser && database) {
        try {
            const ref = database.ref('denetimGeriAlinanlar');
            const snapshot = await ref.once('value');
            if (snapshot.exists()) {
                geriAlinanlar = snapshot.val();
            }
        } catch (error) {
            console.error("Geri alınan bayi bilgisi buluttan okunamadı:", error);
        }
    }

    geriAlinanBayiKodlariBuAy = geriAlinanlar[currentMonthKey] || [];
    
    const yearlyRevertedCodes = [];
    for (const key in geriAlinanlar) {
        if (key.startsWith(currentYear)) {
            yearlyRevertedCodes.push(...geriAlinanlar[key]);
        }
    }
    geriAlinanBayiKodlariBuYil = [...new Set(yearlyRevertedCodes)];
}

async function loadAuditedStoresData() {
    auditedStoreCodesCurrentMonth = [];
    auditedStoreCodesCurrentYear = [];
    if (!auth.currentUser || !database) return;

    try {
        let allReports = {};
        const reportsRef = database.ref('allFideReports');
        const snapshot = await reportsRef.once('value');
        if (snapshot.exists()) {
            allReports = snapshot.val();
        }
        
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
        console.error("Denetlenen bayi verileri okunurken hata oluştu:", error);
    }
}

function setupModuleEventListeners() {
    if (document.body.dataset.denetimTakipListenersAttached) return;
    document.body.dataset.denetimTakipListenersAttached = 'true';

    document.getElementById('open-admin-panel-btn').addEventListener('click', () => {
        document.getElementById('admin-panel-overlay').style.display = 'flex';
    });
    document.getElementById('close-admin-panel-btn').addEventListener('click', () => {
        document.getElementById('admin-panel-overlay').style.display = 'none';
    });
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
    document.getElementById('store-list-excel-input').addEventListener('change', handleStoreExcelUpload);
    document.getElementById('delete-excel-btn').addEventListener('click', deleteStoreList);
    document.getElementById('reset-data-btn').addEventListener('click', resetProgress); 

    document.getElementById('bolge-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('yonetmen-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('sehir-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('ilce-filter').addEventListener('change', applyAndRepopulateFilters);
}

async function resetProgress() {
    if (!auth.currentUser || !database) return alert("Bu işlem için giriş yapmalısınız.");
    if (!confirm("Bu işlem, bu yıla ait TÜM denetim verilerini sıfırlayacaktır. 'Bu Ay Denetlenenler' ve 'Yıllık Hedef' sayaçları sıfırlanır. Onaylıyor musunuz?")) {
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        let allReports = {};
        const reportsRef = database.ref('allFideReports');
        const snapshot = await reportsRef.once('value');
        if (snapshot.exists()) {
            allReports = snapshot.val();
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
        if (uniqueCodesToReset.length === 0) {
            alert("Bu yıl sıfırlanacak denetim kaydı bulunamadı.");
            loadingOverlay.style.display = 'none';
            return;
        }

        const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
        
        const geriAlinanlarRef = database.ref('denetimGeriAlinanlar');
        const geriAlinanlarSnapshot = await geriAlinanlarRef.once('value');
        let geriAlinanlar = geriAlinanlarSnapshot.exists() ? geriAlinanlarSnapshot.val() : {};

        if (!geriAlinanlar[currentMonthKey]) {
            geriAlinanlar[currentMonthKey] = [];
        }

        uniqueCodesToReset.forEach(code => {
            if (!geriAlinanlar[currentMonthKey].includes(code)) {
                geriAlinanlar[currentMonthKey].push(code);
            }
        });
        
        await database.ref('denetimGeriAlinanlar').set(geriAlinanlar);
        
        window.location.reload();

    } catch (error) {
        alert("Veriler sıfırlanırken bir hata oluştu: " + error.message);
        loadingOverlay.style.display = 'none';
    }
}


async function saveSettings() {
    if (!auth.currentUser || !database) return alert("Bu işlem için giriş yapmalısınız.");
    const newTarget = parseInt(document.getElementById('monthly-target-input').value);
    if (!newTarget || newTarget < 1) {
        alert("Lütfen geçerli bir hedef girin.");
        return;
    }
    const settings = { aylikHedef: newTarget };
    await database.ref('denetimAyarlari').set(settings);
    aylikHedef = newTarget;
    alert("Ayarlar kaydedildi.");
    document.getElementById('admin-panel-overlay').style.display = 'none';
    runDashboard();
}

async function deleteStoreList() {
    if (!auth.currentUser || !database) return alert("Bu işlem için giriş yapmalısınız.");
    const dogruSifreHash = 'ZmRlMDAx';
    const girilenSifre = prompt("DİKKAT! Bu işlem, yüklenmiş olan Excel bayi listesini buluttan kalıcı olarak siler. Silmek için yönetici şifresini girin:");
    if (!girilenSifre) return;
    if (btoa(girilenSifre) !== dogruSifreHash) {
        alert("Hatalı şifre! İşlem iptal edildi.");
        return;
    }
    if (confirm("Şifre doğru. Excel bayi listesini buluttan kalıcı olarak silmek istediğinizden emin misiniz?")) {
        await database.ref('tumBayilerListesi').remove();
        alert("Bayi listesi başarıyla silindi. Sayfa yeniden başlatılıyor.");
        window.location.reload();
    }
}

async function revertAudit(bayiKodu) {
    if (!auth.currentUser || !database) return alert("Bu işlem için giriş yapmalısınız.");
    const store = allStores.find(s => s.bayiKodu === bayiKodu);
    const storeName = store ? store.bayiAdi : bayiKodu;
    if (confirm(`'${storeName}' bayisinin bu ayki denetimini listeden kaldırmak istediğinizden emin misiniz?`)) {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.display = 'flex';
        try {
            const today = new Date();
            const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
            
            const geriAlinanlarRef = database.ref('denetimGeriAlinanlar');
            const snapshot = await geriAlinanlarRef.once('value');
            let geriAlinanlar = snapshot.exists() ? snapshot.val() : {};

            if (!geriAlinanlar[currentMonthKey]) {
                geriAlinanlar[currentMonthKey] = [];
            }
            if (!geriAlinanlar[currentMonthKey].includes(bayiKodu)) {
                geriAlinanlar[currentMonthKey].push(bayiKodu);
            }

            await geriAlinanlarRef.set(geriAlinanlar);
            
            window.location.reload();
        } catch (error) {
            alert("Denetim geri alınırken bir hata oluştu: " + error.message);
            loadingOverlay.style.display = 'none';
        }
    }
}

function handleStoreExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
            processStoreExcelData(dataAsArray);
        } catch (error) {
            alert("Excel dosyası okunurken bir hata oluştu.");
        }
    };
}

async function processStoreExcelData(dataAsArray) {
    if (!auth.currentUser || !database) return alert("Bu işlem için giriş yapmalısınız.");
    if (dataAsArray.length < 2) return alert('Excel dosyası beklenen formatta değil.');
    const headerRow = dataAsArray[0].map(h => String(h).trim());
    const colIndexes = {
        bolge: headerRow.indexOf('Bölge'), yonetmen: headerRow.indexOf('Bayi Yönetmeni'),
        sehir: headerRow.indexOf('Şehir'), ilce: headerRow.indexOf('İlçe'),
        kod: headerRow.indexOf('Bayi Kodu'), ad: headerRow.indexOf('Bayiler')
    };
    if (Object.values(colIndexes).some(index => index === -1)) return alert('Excel dosyasında gerekli sütunlar bulunamadı.');
    
    const dataRows = dataAsArray.slice(1);
    const newAllStores = dataRows.map(row => {
        const bayiKodu = String(row[colIndexes.kod]).trim();
        if (!bayiKodu) return null;
        return {
            bayiKodu: bayiKodu, bayiAdi: String(row[colIndexes.ad]).trim(), sehir: String(row[colIndexes.sehir]).trim(),
            ilce: String(row[colIndexes.ilce]).trim(), bolge: String(row[colIndexes.bolge]).trim(), yonetmen: String(row[colIndexes.yonetmen]).trim()
        };
    }).filter(store => store !== null);

    const dataToSave = { timestamp: new Date().getTime(), stores: newAllStores };
    try {
        await database.ref('tumBayilerListesi').set(dataToSave);
        alert("Excel listesi başarıyla yüklendi ve buluta kaydedildi.");
        window.location.reload();
    } catch (error) {
        alert("Excel listesi buluta kaydedilirken hata oluştu: " + error.message);
    }
}

function calculateAndDisplayDashboard() {
    const today = new Date();
    const auditedMonthlyCount = auditedStoreCodesCurrentMonth.length;
    const remainingToTarget = aylikHedef - auditedMonthlyCount;
    const remainingWorkDays = getRemainingWorkdays();
    const totalStores = allStores.length;
    const auditedYearlyCount = auditedStoreCodesCurrentYear.length;
    const annualProgress = totalStores > 0 ? (auditedYearlyCount / totalStores) * 100 : 0;
    
    document.getElementById('dashboard-title').innerHTML = `<i class="fas fa-calendar-day"></i> ${today.getFullYear()} ${monthNames[today.getMonth()]} Ayı Performansı`;
    document.getElementById('work-days-count').textContent = remainingWorkDays;
    document.getElementById('total-stores-count').textContent = aylikHedef;
    document.getElementById('audited-stores-count').textContent = auditedMonthlyCount;
    document.getElementById('remaining-stores-count').textContent = remainingToTarget > 0 ? remainingToTarget : 0;
    
    document.getElementById('annual-performance-indicator').innerHTML = `
        <div class="annual-header">
             <h4><i class="fas fa-calendar-alt"></i> ${today.getFullYear()} Yıllık Hedef</h4>
             <p class="annual-progress-text">${auditedYearlyCount} / ${totalStores}</p>
        </div>
        <div class="progress-bar">
            <div class="progress-bar-fill" style="width: ${annualProgress.toFixed(2)}%; background-color: var(--primary);">${annualProgress.toFixed(0)}%</div>
        </div>`;

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