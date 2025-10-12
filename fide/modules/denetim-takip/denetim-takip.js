// --- Global Değişkenler ---
let allStores = [];
let auditedStoreCodesCurrentMonth = [];
let auditedStoreCodesCurrentYear = [];
let geriAlinanKayitlariBuAy = [];
let geriAlinanKayitlariBuYil = [];
let aylikHedef = 0;
const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let pbInstance; // PocketBase nesnesini modül içinde kullanmak için

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeDenetimTakipModule(pb) {
    pbInstance = pb; // Admin.js'den gelen PocketBase nesnesini al
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    if (pbInstance && pbInstance.authStore.isValid) {
        // HATA BURADAYDI: setupModuleEventListeners() fonksiyonunu en başa koymak yerine,
        // tüm veriler yüklendikten sonra çağırmalıyız.
        await loadSettings();
        await loadGeriAlinanBayiler();
        await loadAuditedStoresData();
        await loadStoreList(); // Bu fonksiyon içinde runDashboard() çağrılıyor.
        
        // DOĞRU YER: Tüm yüklemeler bittikten sonra olay dinleyicilerini kuruyoruz.
        setupModuleEventListeners();
    } else {
        document.getElementById('upload-area').innerHTML = '<p style="text-align: center; color: var(--danger);">Denetim takip sistemini kullanmak için lütfen sisteme giriş yapın.</p>';
        document.getElementById('upload-area').style.display = 'block';
    }
    
    loadingOverlay.style.display = 'none';
}

async function loadSettings() {
    if (!pbInstance.authStore.isValid) return;
    try {
        // 'ayarlar' tablosundan 'aylikHedef' anahtarına sahip kaydı çekiyoruz.
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        aylikHedef = record.deger || 0;
    } catch (error) {
        // Kayıt bulunamazsa (404 hatası) veya başka bir hata olursa hedefi 0 yap.
        aylikHedef = 0;
        if (error.status !== 404) {
            console.error("Aylık hedef ayarı yüklenemedi:", error);
        }
    }
    document.getElementById('monthly-target-input').value = aylikHedef > 0 ? aylikHedef : '';
}

async function loadStoreList() {
    if (!pbInstance.authStore.isValid) return;
    try {
        // 'bayiler' tablosundaki tüm kayıtları çekiyoruz.
        allStores = await pbInstance.collection('bayiler').getFullList({
            sort: 'bayiAdi', // Bayi adına göre sıralı getir
        });

        if (allStores.length > 0) {
            document.getElementById('upload-area').style.display = 'none';
            document.getElementById('loaded-data-area').style.display = 'block';
        } else {
            document.getElementById('upload-area').style.display = 'block';
            document.getElementById('loaded-data-area').style.display = 'none';
        }
    } catch (error) {
        console.error("Bayi listesi yüklenemedi:", error);
        allStores = [];
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
    if (!pbInstance.authStore.isValid) return;

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonthKey = `${currentYear}-${today.getMonth()}`;
    
    geriAlinanKayitlariBuAy = [];
    geriAlinanKayitlariBuYil = [];

    try {
        // Bu yıla ait tüm geri alma kayıtlarını çekiyoruz.
        const records = await pbInstance.collection('denetim_geri_alinanlar').getFullList({
            filter: `yil_ay ~ "${currentYear}-"`, // yil_ay alanı "2025-" ile başlayanları getir.
            expand: 'bayi' // İlişkili bayi bilgisini de getir.
        });

        records.forEach(record => {
            geriAlinanKayitlariBuYil.push(record.expand.bayi.bayiKodu);
            if (record.yil_ay === currentMonthKey) {
                geriAlinanKayitlariBuAy.push(record.expand.bayi.bayiKodu);
            }
        });

        // Tekrarları temizle
        geriAlinanKayitlariBuAy = [...new Set(geriAlinanKayitlariBuAy)];
        geriAlinanKayitlariBuYil = [...new Set(geriAlinanKayitlariBuYil)];

    } catch (error) {
        if (error.status !== 404) {
             console.error("Geri alınan bayi bilgisi buluttan okunamadı:", error);
        }
    }
}

async function loadAuditedStoresData() {
    auditedStoreCodesCurrentMonth = [];
    auditedStoreCodesCurrentYear = [];
    if (!pbInstance.authStore.isValid) return;

    try {
        const today = new Date();
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1).toISOString();
        
        // Bu yıla ait tamamlanmış tüm raporları çekiyoruz.
        const records = await pbInstance.collection('denetim_raporlari').getFullList({
            filter: `denetimTamamlanmaTarihi != null && denetimTamamlanmaTarihi >= "${firstDayOfYear}"`,
            expand: 'bayi',
            sort: '-denetimTamamlanmaTarihi' // En yeniden eskiye sırala
        });

        const monthlyAuditsMap = new Map();
        const yearlyCodes = [];

        records.forEach(record => {
            if (!record.expand || !record.expand.bayi) return;

            const storeCode = record.expand.bayi.bayiKodu;
            const reportDate = new Date(record.denetimTamamlanmaTarihi);

            yearlyCodes.push(storeCode);

            if (reportDate.getMonth() === today.getMonth()) {
                // Aynı bayi için birden fazla denetim varsa en yenisini al
                if (!monthlyAuditsMap.has(storeCode)) {
                    monthlyAuditsMap.set(storeCode, { code: storeCode, timestamp: reportDate.getTime() });
                }
            }
        });
        
        auditedStoreCodesCurrentMonth = Array.from(monthlyAuditsMap.values())
            .filter(audit => !geriAlinanKayitlariBuAy.includes(audit.code));
        
        const uniqueYearlyCodes = [...new Set(yearlyCodes)];
        auditedStoreCodesCurrentYear = uniqueYearlyCodes.filter(code => !geriAlinanKayitlariBuYil.includes(code));

    } catch (error) {
        if (error.status !== 404) {
            console.error("Denetlenen bayi verileri okunurken hata oluştu:", error);
        }
    }
}

function setupModuleEventListeners() {
    // Bu fonksiyonun birden çok kez çalışmasını engelleyen kontrol
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
    if (!pbInstance.authStore.isValid) return alert("Bu işlem için giriş yapmalısınız.");
    if (!confirm("Bu işlem, bu yıla ait TÜM denetim verilerini 'geri alınmış' olarak işaretleyecektir. Sayaçlar sıfırlanır. Onaylıyor musunuz?")) {
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        const today = new Date();
        const currentYear = today.getFullYear();
        const firstDayOfYear = new Date(currentYear, 0, 1).toISOString();
        
        // Bu yıl denetlenen tüm raporları al
        const reportsToReset = await pbInstance.collection('denetim_raporlari').getFullList({
            filter: `denetimTamamlanmaTarihi != null && denetimTamamlanmaTarihi >= "${firstDayOfYear}"`,
            fields: 'id, bayi, denetimTamamlanmaTarihi' // Sadece gerekli alanları al
        });

        if (reportsToReset.length === 0) {
            alert("Bu yıl sıfırlanacak denetim kaydı bulunamadı.");
            loadingOverlay.style.display = 'none';
            return;
        }

        // Her bir rapor için bir "geri alma" kaydı oluştur
        for (const report of reportsToReset) {
            const reportDate = new Date(report.denetimTamamlanmaTarihi);
            const reportMonthKey = `${reportDate.getFullYear()}-${reportDate.getMonth()}`;
            
            const data = {
                "yil_ay": reportMonthKey,
                "bayi": report.bayi // Raporun bayi ID'sini kullan
            };
            
            // Aynı ay ve bayi için zaten geri alma kaydı var mı diye kontrol et (opsiyonel ama iyi bir pratik)
            try {
                await pbInstance.collection('denetim_geri_alinanlar').getFirstListItem(`yil_ay="${reportMonthKey}" && bayi="${report.bayi}"`);
            } catch (error) {
                if(error.status === 404) {
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
    if (!pbInstance.authStore.isValid) return alert("Bu işlem için giriş yapmalısınız.");
    const newTarget = parseInt(document.getElementById('monthly-target-input').value);
    if (isNaN(newTarget) || newTarget < 0) {
        alert("Lütfen geçerli bir hedef girin.");
        return;
    }
    const data = { 'deger': newTarget };
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        await pbInstance.collection('ayarlar').update(record.id, data);
    } catch(error) {
        if (error.status === 404) {
            await pbInstance.collection('ayarlar').create({ anahtar: 'aylikHedef', deger: newTarget });
        } else {
            alert("Ayarlar kaydedilirken bir hata oluştu.");
            return;
        }
    }
    
    aylikHedef = newTarget;
    alert("Ayarlar kaydedildi.");
    document.getElementById('admin-panel-overlay').style.display = 'none';
    runDashboard();
}

async function deleteStoreList() {
    if (!pbInstance.authStore.isValid) return alert("Bu işlem için giriş yapmalısınız.");
    const dogruSifreHash = 'ZmRlMDAx';
    const girilenSifre = prompt("DİKKAT! Bu işlem, veritabanındaki TÜM bayi listesini kalıcı olarak siler. Silmek için yönetici şifresini girin:");
    if (!girilenSifre) return;
    if (btoa(girilenSifre) !== dogruSifreHash) {
        alert("Hatalı şifre! İşlem iptal edildi.");
        return;
    }
    if (confirm("Şifre doğru. Veritabanındaki TÜM bayi listesini kalıcı olarak silmek istediğinizden emin misiniz?")) {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.display = 'flex';
        try {
            const records = await pbInstance.collection('bayiler').getFullList({ fields: 'id' });
            for (const record of records) {
                await pbInstance.collection('bayiler').delete(record.id);
            }
            alert("Tüm bayi listesi başarıyla silindi. Sayfa yeniden başlatılıyor.");
            window.location.reload();
        } catch (error) {
            alert("Bayiler silinirken hata oluştu: " + error.message);
            loadingOverlay.style.display = 'none';
        }
    }
}

async function revertAudit(bayiKodu) {
    if (!pbInstance.authStore.isValid) return alert("Bu işlem için giriş yapmalısınız.");
    const store = allStores.find(s => s.bayiKodu === bayiKodu);
    const storeName = store ? store.bayiAdi : bayiKodu;

    if (confirm(`'${storeName}' bayisinin bu ayki denetimini listeden kaldırmak istediğinizden emin misiniz?`)) {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.display = 'flex';
        try {
            if (!store) throw new Error("Bayi verisi bulunamadı.");
            
            const today = new Date();
            const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
            
            const data = {
                "yil_ay": currentMonthKey,
                "bayi": store.id // Bayinin ID'sini ilişki olarak ekliyoruz
            };
            
            // PocketBase'e yeni geri alma kaydını oluştur
            await pbInstance.collection('denetim_geri_alinanlar').create(data);
            
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
    if (!pbInstance.authStore.isValid) return alert("Bu işlem için giriş yapmalısınız.");
    if (dataAsArray.length < 2) return alert('Excel dosyası beklenen formatta değil.');
    
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    const headerRow = dataAsArray[0].map(h => String(h).trim());
    const colIndexes = {
        bolge: headerRow.indexOf('Bölge'), yonetmen: headerRow.indexOf('Bayi Yönetmeni'),
        sehir: headerRow.indexOf('Şehir'), ilce: headerRow.indexOf('İlçe'),
        bayiKodu: headerRow.indexOf('Bayi Kodu'), bayiAdi: headerRow.indexOf('Bayiler') // Excel'deki sütun adını düzelttim
    };

    if (Object.values(colIndexes).some(index => index === -1)) {
        alert('Excel dosyasında gerekli sütunlar (Bölge, Bayi Yönetmeni, Şehir, İlçe, Bayi Kodu, Bayiler) bulunamadı.');
        loadingOverlay.style.display = 'none';
        return;
    }
    
    const dataRows = dataAsArray.slice(1);
    const storesFromExcel = dataRows.map(row => {
        const bayiKodu = String(row[colIndexes.bayiKodu]).trim();
        if (!bayiKodu) return null;
        return {
            bayiKodu,
            bayiAdi: String(row[colIndexes.bayiAdi]).trim(),
            sehir: String(row[colIndexes.sehir]).trim(),
            ilce: String(row[colIndexes.ilce]).trim(),
            bolge: String(row[colIndexes.bolge]).trim(),
            yonetmen: String(row[colIndexes.yonetmen]).trim()
        };
    }).filter(store => store !== null);

    try {
        // Mevcut tüm bayileri tek seferde çekelim
        const existingStores = await pbInstance.collection('bayiler').getFullList();
        const existingStoreMap = new Map(existingStores.map(s => [s.bayiKodu, s.id]));

        for (const store of storesFromExcel) {
            const existingId = existingStoreMap.get(store.bayiKodu);
            if (existingId) {
                // Bayi varsa güncelle
                await pbInstance.collection('bayiler').update(existingId, store);
            } else {
                // Bayi yoksa yeni oluştur
                await pbInstance.collection('bayiler').create(store);
            }
        }
        
        alert("Excel listesi başarıyla işlendi ve veritabanı güncellendi.");
        window.location.reload();
    } catch (error) {
        alert("Excel listesi işlenirken hata oluştu: " + error.message);
        loadingOverlay.style.display = 'none';
    }
}

// --- Arayüz Çizim Fonksiyonları (Render) ---
// Bu kısımdaki fonksiyonlarda büyük değişiklikler yok, sadece veri kaynakları ve isimler güncellendi.

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
            <div class="progress-bar-fill" style="width: ${annualProgress.toFixed(2)}%;">${annualProgress.toFixed(0)}%</div>
        </div>`;

    renderAuditedStores();
    document.getElementById('dashboard-content').style.display = 'block';
}

function populateAllFilters(stores) {
    const filters = { bolge: 'bolge', yonetmen: 'yonetmen', sehir: 'sehir', ilce: 'ilce' };
    Object.keys(filters).forEach(key => {
        const selectElement = document.getElementById(filters[key] + '-filter');
        const uniqueValues = [...new Set(stores.map(store => store[filters[key]]))].sort((a, b) => a.localeCompare(b, 'tr'));
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

    if (selected.bolge !== 'Tümü') {
        filteredStores = filteredStores.filter(s => s.bolge === selected.bolge);
        populateDynamicFilters(filteredStores, ['yonetmen', 'sehir', 'ilce'], selected);
    }
    if (selected.yonetmen !== 'Tümü') {
        filteredStores = filteredStores.filter(s => s.yonetmen === selected.yonetmen);
        populateDynamicFilters(filteredStores, ['bolge', 'sehir', 'ilce'], selected);
    }
    if (selected.sehir !== 'Tümü') {
        filteredStores = filteredStores.filter(s => s.sehir === selected.sehir);
         populateDynamicFilters(filteredStores, ['bolge', 'yonetmen', 'ilce'], selected);
    }
    if (selected.ilce !== 'Tümü') {
        filteredStores = filteredStores.filter(s => s.ilce === selected.ilce);
        populateDynamicFilters(filteredStores, ['bolge', 'yonetmen', 'sehir'], selected);
    }

    renderRemainingStores(filteredStores);
}

function populateDynamicFilters(storesToUse, filtersToUpdate, currentSelection) {
    filtersToUpdate.forEach(key => {
        const selectElement = document.getElementById(key + '-filter');
        const currentValue = selectElement.value; // Mevcut seçimi korumak için
        const uniqueValues = [...new Set(storesToUse.map(store => store[key]))].sort((a, b) => a.localeCompare(b, 'tr'));
        selectElement.innerHTML = '<option value="Tümü">Tümü</option>';
        let valueExists = false;
        uniqueValues.forEach(value => {
            if (value) {
                const option = document.createElement('option');
                option.value = value; option.textContent = value;
                selectElement.appendChild(option);
                if (value === currentValue) valueExists = true;
            }
        });
        if(valueExists) selectElement.value = currentValue;
    });
}

function renderRemainingStores(filteredStores) {
    const container = document.getElementById('denetlenecek-bayiler-container');
    container.innerHTML = '';
    const auditedCodesThisMonth = auditedStoreCodesCurrentMonth.map(audit => audit.code);
    const remainingStores = filteredStores.filter(store => !auditedCodesThisMonth.includes(store.bayiKodu));

    if (remainingStores.length === 0) {
        container.innerHTML = `<p class="empty-list-message">Seçili kriterlere uygun, bu ay denetlenmemiş bayi bulunamadı.</p>`;
    } else {
        const storesByRegion = remainingStores.reduce((acc, store) => {
            const region = store.bolge || 'Bölge Belirtilmemiş';
            if (!acc[region]) acc[region] = [];
            acc[region].push(store);
            return acc;
        }, {});
        const sortedRegions = Object.keys(storesByRegion).sort();
        let regionsHtml = '';
        sortedRegions.forEach(region => {
            const regionStores = storesByRegion[region];
            const totalInRegionFiltered = filteredStores.filter(s => (s.bolge || 'Bölge Belirtilmemiş') === region);
            const auditedInRegionFiltered = totalInRegionFiltered.filter(s => auditedCodesThisMonth.includes(s.bayiKodu));
            const progress = totalInRegionFiltered.length > 0 ? (auditedInRegionFiltered.length / totalInRegionFiltered.length) * 100 : 0;
            let regionHtml = `<div class="region-container"><div class="region-header"><span>${region} (Bu Ay: ${auditedInRegionFiltered.length}/${totalInRegionFiltered.length})</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width: ${progress.toFixed(2)}%;">${progress.toFixed(0)}%</div></div><ul class="store-list">`;
            regionStores.forEach(store => {
                regionHtml += `<li class="store-list-item">${store.bayiAdi} (${store.bayiKodu}) - ${store.sehir}/${store.ilce}</li>`;
            });
            regionHtml += '</ul></div>';
            regionsHtml += regionHtml;
        });
        container.innerHTML = regionsHtml;
    }

    const remainingContainer = document.getElementById('denetlenecek-bayiler-container');
    const auditedContainer = document.getElementById('denetlenen-bayiler-container');
    if (remainingContainer && auditedContainer) {
        const height = remainingContainer.offsetHeight;
        if (height > 0) {
            auditedContainer.style.maxHeight = `${height}px`;
        } else {
            auditedContainer.style.maxHeight = 'none';
        }
    }
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

    const auditedStoresDetails = auditedStoreCodesCurrentMonth
        .map(audit => {
            const storeDetails = allStores.find(store => store.bayiKodu === audit.code);
            if (storeDetails) {
                return { ...storeDetails, timestamp: audit.timestamp };
            }
            return null;
        })
        .filter(store => store !== null)
        .sort((a, b) => b.timestamp - a.timestamp);
    
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