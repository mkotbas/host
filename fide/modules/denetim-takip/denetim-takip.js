// --- Kapsüllenmiş Global Değişkenler ---
let allStoresMaster = [];
let allReportsMaster = [];
let allGeriAlinanMaster = [];
let allUsers = []; 

let allStores = [];
let auditedStoreCodesCurrentMonth = [];
let auditedStoreCodesCurrentYear = [];
let geriAlinanKayitlariBuAy = [];
let geriAlinanKayitlariBuYil = [];

let currentGlobalFilteredStores = []; 
let localCityFilterValue = 'Tümü';    
let currentViewMode = 'monthly'; // YENİ: Varsayılan görünüm modu

let globalAylikHedef = 0; 
let aylikHedef = 0; 

const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let pbInstance = null;
let currentUserRole = null;
let currentUserId = null;

export async function initializeDenetimTakipModule(pb) {
    pbInstance = pb;
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    if (pbInstance && pbInstance.authStore.isValid) {
        currentUserRole = pbInstance.authStore.model.role;
        currentUserId = pbInstance.authStore.model.id;

        setupModuleEventListeners(currentUserRole);
        await loadSettings(); 
        await loadMasterData();

        if (currentUserRole === 'admin') {
            document.getElementById('admin-user-selector-container').style.display = 'block';
            await populateUserFilterDropdown();
        }

        applyDataFilterAndRunDashboard('my_data');

    } else {
        document.getElementById('upload-area').innerHTML = '<p style="text-align: center; color: var(--danger);">Denetim takip sistemini kullanmak için lütfen sisteme giriş yapın.</p>';
        document.getElementById('upload-area').style.display = 'block';
    }

    loadingOverlay.style.display = 'none';
}

async function loadSettings() {
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        globalAylikHedef = record.deger || 0;
    } catch (error) {
        globalAylikHedef = 0;
        if (error.status !== 404) {
            console.error("Aylık hedef ayarı yüklenebedi:", error);
        }
    }

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

async function loadMasterData() {
    if (!pbInstance.authStore.isValid) return;

    try {
        allStoresMaster = await pbInstance.collection('bayiler').getFullList({ sort: 'bayiAdi' });

        if (allStoresMaster.length > 0) {
            document.getElementById('upload-area').style.display = 'none';
            document.getElementById('loaded-data-area').style.display = 'block';
        } else {
            document.getElementById('upload-area').style.display = 'block';
            document.getElementById('loaded-data-area').style.display = 'none';
        }

        const today = new Date();
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1).toISOString();
        allReportsMaster = await pbInstance.collection('denetim_raporlari').getFullList({
            filter: `denetimTamamlanmaTarihi != null && denetimTamamlanmaTarihi >= "${firstDayOfYear}"`,
            expand: 'bayi',
            sort: '-denetimTamamlanmaTarihi'
        });

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

async function populateUserFilterDropdown() {
    if (currentUserRole !== 'admin') return;

    try {
        allUsers = await pbInstance.collection('users').getFullList({ sort: 'name' });
        const selectElement = document.getElementById('admin-user-filter');
        selectElement.innerHTML = ''; 

        selectElement.innerHTML += `<option value="my_data" selected>Benim Verilerim (Admin)</option>`;
        selectElement.innerHTML += `<option value="global">Genel Bakış (Tüm Sistem)</option>`;

        allUsers.forEach(user => {
            if (user.id !== currentUserId) {
                const displayName = user.name || user.email;
                const roleLabel = user.role === 'admin' ? 'Admin' : 'Client';
                selectElement.innerHTML += `<option value="${user.id}">${displayName} (${roleLabel})</option>`;
            }
        });

    } catch (error) {
        console.error("Kullanıcı listesi doldurulurken hata:", error);
    }
}

function applyDataFilterAndRunDashboard(viewId) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentMonthKey = `${currentYear}-${currentMonth}`;

    if (currentUserRole !== 'admin') {
        allStores = [...allStoresMaster];
    } else {
        if (viewId === 'global') {
            allStores = [...allStoresMaster];
        } else if (viewId === 'my_data') {
            allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === currentUserId);
        } else { 
            allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === viewId);
        }
    }

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

    let filteredReports = [];
    if (currentUserRole !== 'admin') {
        filteredReports = [...allReportsMaster];
    } else {
        if (viewId === 'global') {
            filteredReports = [...allReportsMaster];
        } else if (viewId === 'my_data') {
            filteredReports = allReportsMaster.filter(r => r.user === currentUserId);
        } else { 
            filteredReports = allReportsMaster.filter(r => r.user === viewId);
        }
    }

    const monthlyAuditsMap = new Map();
    const yearlyCodes = new Set();
    filteredReports.forEach(record => {
        if (!record.expand || !record.expand.bayi) return;
        const storeCode = record.expand.bayi.bayiKodu;
        const reportDate = new Date(record.denetimTamamlanmaTarihi);
        
        // Yıllık verileri topla (Geri alınanlar hariç)
        if (!geriAlinanBayiKodlariYil.has(storeCode)) {
            yearlyCodes.add(storeCode);
        }

        // Aylık verileri topla
        if (reportDate.getMonth() === currentMonth && reportDate.getFullYear() === currentYear) {
            if (!monthlyAuditsMap.has(storeCode) && !geriAlinanBayiKodlariAy.has(storeCode)) {
                monthlyAuditsMap.set(storeCode, { code: storeCode, timestamp: reportDate.getTime() });
            }
        }
    });
    
    auditedStoreCodesCurrentMonth = Array.from(monthlyAuditsMap.values());
    auditedStoreCodesCurrentYear = Array.from(yearlyCodes);

    aylikHedef = globalAylikHedef; 

    localCityFilterValue = 'Tümü'; 
    const localFilter = document.getElementById('local-city-filter');
    if(localFilter) localFilter.value = 'Tümü';

    runDashboard();
}

function runDashboard() {
    calculateAndDisplayDashboard();
    updateAllFilterOptions(); 
    applyAndRepopulateFilters(); 
}

function setupModuleEventListeners(userRole) {
    if (document.body.dataset.denetimTakipListenersAttached) return;
    document.body.dataset.denetimTakipListenersAttached = 'true';

    const adminPanelBtn = document.getElementById('open-admin-panel-btn');

    if (userRole === 'admin') {
        adminPanelBtn.addEventListener('click', () => {
            document.getElementById('admin-panel-overlay').style.display = 'flex';
        });
        document.getElementById('close-admin-panel-btn').addEventListener('click', () => {
            document.getElementById('admin-panel-overlay').style.display = 'none';
        });
        document.getElementById('save-settings-btn').addEventListener('click', saveSettings);

        document.getElementById('admin-user-filter').addEventListener('change', (e) => {
            const selectedViewId = e.target.value;
            document.getElementById('loading-overlay').style.display = 'flex';
            applyDataFilterAndRunDashboard(selectedViewId);
            document.getElementById('loading-overlay').style.display = 'none';
        });
        
    } else {
        if (adminPanelBtn) adminPanelBtn.style.display = 'none';
    }

    // YENİ: Aylık/Yıllık Mod Değiştirici
    const modeButtons = document.querySelectorAll('#view-mode-toggle button');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            modeButtons.forEach(b => {
                b.classList.remove('btn-primary', 'active');
                b.classList.add('btn-light');
            });
            e.target.classList.remove('btn-light');
            e.target.classList.add('btn-primary', 'active');
            
            currentViewMode = e.target.dataset.mode;
            calculateAndDisplayDashboard();
            renderAuditedStores();
        });
    });

    document.getElementById('bolge-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('yonetmen-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('sehir-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('ilce-filter').addEventListener('change', applyAndRepopulateFilters);

    document.getElementById('local-city-filter').addEventListener('change', (e) => {
        localCityFilterValue = e.target.value;
        renderRemainingStores(currentGlobalFilteredStores); 
    });
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

    globalAylikHedef = newTarget; 
    alert("Ayarlar kaydedildi.");
    document.getElementById('admin-panel-overlay').style.display = 'none';
    
    const currentView = document.getElementById('admin-user-filter').value || 'my_data';
    applyDataFilterAndRunDashboard(currentView);
}

async function revertAudit(bayiKodu) {
    if (!pbInstance.authStore.isValid || currentUserRole !== 'admin') return alert("Bu işlem için yetkiniz bulunmamaktadır.");

    const store = allStoresMaster.find(s => s.bayiKodu === bayiKodu);
    if (!confirm(`'${store ? store.bayiAdi : bayiKodu}' bayisinin bu ayki denetimini listeden kaldırmak istediğinizden emin misiniz?`)) return;

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        if (!store) throw new Error("Bayi verisi bulunamadı.");
        const today = new Date();
        const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
        await pbInstance.collection('denetim_geri_alinanlar').create({ "yil_ay": currentMonthKey, "bayi": store.id });
        
        await loadMasterData();
        const currentView = document.getElementById('admin-user-filter').value || 'my_data';
        applyDataFilterAndRunDashboard(currentView);

    } catch (error) {
        alert("Denetim geri alınırken bir hata oluştu: " + error.message);
    }
    loadingOverlay.style.display = 'none';
}

/**
 * YENİ FONKSİYON: Çalışma takvimi mantığına göre bugünkü hedefi hesaplar.
 * İzinli günleri düşer ve kalan işi kalan günlere adil dağıtır.
 */
function calculateTodayGoal(totalTarget, currentAudited) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const todayDate = today.getDate();

    // Takvim dosyasındaki izin verilerini çek
    const leaveData = JSON.parse(localStorage.getItem('bayiPlanlayiciData')) || {};

    const lastDay = new Date(year, month + 1, 0).getDate();
    let allWorkDays = []; // Ayın başından sonuna tüm Pzt-Cum günleri
    let activeWorkDays = []; // Bugünden itibaren izinli olunmayan Pzt-Cum günleri

    for (let d = 1; d <= lastDay; d++) {
        const date = new Date(year, month, d);
        const dayOfWeek = date.getDay();
        const key = `${year}-${month}-${d}`;

        // Sadece Hafta İçi (Pzt-Cum)
        if (dayOfWeek > 0 && dayOfWeek < 6) {
            allWorkDays.push(d);
            // Bugün dahil ve sonrası, ayrıca izinli değilse "aktif iş günüdür"
            if (d >= todayDate && !leaveData[key]) {
                activeWorkDays.push(d);
            }
        }
    }

    // 1. Hedef Revizesi: İzinli gün sayısı kadar ana hedeften (47) düşüş yap (Takvim kuralı)
    let leaveInWorkDays = 0;
    allWorkDays.forEach(d => {
        if (leaveData[`${year}-${month}-${d}`]) leaveInWorkDays++;
    });
    
    const baseTarget = 47;
    const dailyAverage = baseTarget / (allWorkDays.length || 1);
    const deduction = Math.round(dailyAverage * leaveInWorkDays);
    const revisedTarget = Math.max(0, baseTarget - deduction);

    // 2. Kalan işi aktif günlere dağıt
    const remainingToVisit = Math.max(0, revisedTarget - currentAudited);
    
    if (activeWorkDays.length === 0) return 0;
    
    // Eğer bugün haftasonuysa veya izinliyse hedef 0'dır
    const todayKey = `${year}-${month}-${todayDate}`;
    if (today.getDay() === 0 || today.getDay() === 6 || leaveData[todayKey]) {
        return 0;
    }

    // Dağıtım Algoritması (Takvimle aynı: Base + Extras)
    const basePerDay = Math.floor(remainingToVisit / activeWorkDays.length);
    const extras = remainingToVisit % activeWorkDays.length;

    // Eğer bugün aktif günlerin ilk "extras" kadarının içindeyse +1 görev alır
    const todayIdxInActive = activeWorkDays.indexOf(todayDate);
    return todayIdxInActive < extras ? basePerDay + 1 : basePerDay;
}

function calculateAndDisplayDashboard() {
    const today = new Date();
    const totalStoresCount = allStores.length;
    
    let displayTarget, displayAudited, titleIcon, titleText, targetLabel, auditedLabel, listTitle, remainingListTitle;

    if (currentViewMode === 'monthly') {
        displayTarget = aylikHedef;
        displayAudited = auditedStoreCodesCurrentMonth.length;
        titleIcon = "calendar-day";
        titleText = `${today.getFullYear()} ${monthNames[today.getMonth()]} Ayı Performansı`;
        targetLabel = "Aylık Denetim Hedefi";
        auditedLabel = "Bu Ay Denetlenen";
        listTitle = "Bu Ay Denetlenenler";
        remainingListTitle = "Bu Ay Denetlenecek Bayiler";
        document.getElementById('work-days-card').style.display = 'block';
        document.getElementById('daily-goal-card').style.display = 'block';
    } else {
        displayTarget = totalStoresCount;
        displayAudited = auditedStoreCodesCurrentYear.length;
        titleIcon = "calendar-alt";
        titleText = `${today.getFullYear()} Yılı Genel Performans`;
        targetLabel = "Yıllık Toplam Bayi";
        auditedLabel = "Yıl Boyu Denetlenen";
        listTitle = "Bu Yıl Denetlenenler";
        remainingListTitle = "Bu Yıl Denetlenecek Bayiler";
        document.getElementById('work-days-card').style.display = 'none';
        document.getElementById('daily-goal-card').style.display = 'none';
    }

    const remainingToTarget = Math.max(0, displayTarget - displayAudited);
    const remainingWorkDays = getRemainingWorkdays();
    
    // YENİ: Bugünün dinamik hedefini hesapla
    const todayGoal = (currentViewMode === 'monthly') ? calculateTodayGoal(displayTarget, displayAudited) : 0;
    document.getElementById('daily-goal-count').textContent = todayGoal;

    document.getElementById('dashboard-title').innerHTML = `<i class="fas fa-${titleIcon}"></i> ${titleText}`;
    document.getElementById('target-label').textContent = targetLabel;
    document.getElementById('audited-label').textContent = auditedLabel;
    document.getElementById('audited-list-title').innerHTML = `<i class="fas fa-check-double"></i> ${listTitle}`;
    document.getElementById('remaining-list-title').innerHTML = `<i class="fas fa-list-ul"></i> ${remainingListTitle}`;
    
    document.getElementById('work-days-count').textContent = remainingWorkDays;
    document.getElementById('total-stores-count').textContent = displayTarget;
    document.getElementById('audited-stores-count').textContent = displayAudited;
    document.getElementById('remaining-stores-count').textContent = remainingToTarget;
    
    const annualProgress = totalStoresCount > 0 ? (auditedStoreCodesCurrentYear.length / totalStoresCount) * 100 : 0;
    document.getElementById('annual-performance-indicator').innerHTML = `
        <div class="annual-header">
             <h4><i class="fas fa-calendar-alt"></i> Yıllık İlerleme</h4>
             <p class="annual-progress-text">${auditedStoreCodesCurrentYear.length} / ${totalStoresCount}</p>
        </div>
        <div class="progress-bar">
            <div class="progress-bar-fill" style="width: ${annualProgress.toFixed(2)}%;">${annualProgress.toFixed(0)}%</div>
        </div>`;

    renderAuditedStores(); 
    document.getElementById('dashboard-content').style.display = 'block';
}

function updateAllFilterOptions() {
    const filters = {
        'bolge-filter': 'bolge',
        'yonetmen-filter': 'yonetmen',
        'sehir-filter': 'sehir',
        'ilce-filter': 'ilce'
    };

    Object.keys(filters).forEach(currentFilterId => {
        const currentSelect = document.getElementById(currentFilterId);
        const currentField = filters[currentFilterId];
        const previousValue = currentSelect.value;

        const otherFilters = {};
        Object.keys(filters).forEach(id => {
            if (id !== currentFilterId) {
                otherFilters[filters[id]] = document.getElementById(id).value;
            }
        });

        const availableStores = allStores.filter(s => {
            return Object.keys(otherFilters).every(field => {
                return otherFilters[field] === 'Tümü' || s[field] === otherFilters[field];
            });
        });

        const uniqueValues = [...new Set(availableStores.map(s => s[currentField]))]
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'tr'));

        currentSelect.innerHTML = '<option value="Tümü">Tümü</option>';
        uniqueValues.forEach(val => {
            currentSelect.innerHTML += `<option value="${val}">${val}</option>`;
        });

        if (uniqueValues.includes(previousValue)) {
            currentSelect.value = previousValue;
        } else {
            currentSelect.value = 'Tümü';
        }
    });
}

function applyAndRepopulateFilters() {
    const selected = {
        bolge: document.getElementById('bolge-filter').value,
        yonetmen: document.getElementById('yonetmen-filter').value,
        sehir: document.getElementById('sehir-filter').value,
        ilce: document.getElementById('ilce-filter').value
    };

    currentGlobalFilteredStores = allStores.filter(s =>
        (selected.bolge === 'Tümü' || s.bolge === selected.bolge) &&
        (selected.yonetmen === 'Tümü' || s.yonetmen === selected.yonetmen) &&
        (selected.sehir === 'Tümü' || s.sehir === selected.sehir) &&
        (selected.ilce === 'Tümü' || s.ilce === selected.ilce)
    );

    updateAllFilterOptions();
    renderRemainingStores(currentGlobalFilteredStores); 
}

function renderRemainingStores(filteredStores) {
    const container = document.getElementById('denetlenecek-bayiler-container');
    container.innerHTML = '';
    
    // Seçili periyoda göre "denetlenenler" listesini baz al
    const auditedCodes = (currentViewMode === 'monthly') 
        ? auditedStoreCodesCurrentMonth.map(audit => audit.code)
        : auditedStoreCodesCurrentYear;

    const allRemainingStores = filteredStores.filter(store => !auditedCodes.includes(store.bayiKodu));

    if (allRemainingStores.length === 0) {
        const select = document.getElementById('local-city-filter');
        if(select) select.innerHTML = '<option value="Tümü">Şehir Yok</option>';
        container.innerHTML = `<p class="empty-list-message">Seçili kriterlere uygun denetlenmemiş bayi bulunamadı.</p>`;
        return;
    }

    const select = document.getElementById('local-city-filter');
    const previousSelection = localCityFilterValue; 
    const uniqueCities = [...new Set(allRemainingStores.map(s => s.sehir))].sort((a, b) => a.localeCompare(b, 'tr'));
    
    select.innerHTML = '<option value="Tümü">Tüm Şehirler</option>';
    uniqueCities.forEach(city => {
        if (city) select.innerHTML += `<option value="${city}">${city}</option>`;
    });

    if (uniqueCities.includes(previousSelection)) {
        select.value = previousSelection;
    } else {
        select.value = 'Tümü';
        localCityFilterValue = 'Tümü';
    }

    const storesToShow = localCityFilterValue === 'Tümü' 
        ? allRemainingStores 
        : allRemainingStores.filter(s => s.sehir === localCityFilterValue);

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
        const totalInRegion = allStores.filter(s => (s.bolge || 'Bölge Belirtilmemiş') === region).length;
        const auditedInRegion = allStores.filter(s => (s.bolge || 'Bölge Belirtilmemiş') === region && auditedCodes.includes(s.bayiKodu)).length;
        const progress = totalInRegion > 0 ? (auditedInRegion / totalInRegion) * 100 : 0;
        
        let regionHtml = `<div class="region-container"><div class="region-header"><span>${region} (${auditedInRegion}/${totalInRegion})</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width: ${progress.toFixed(2)}%;">${progress.toFixed(0)}%</div></div><ul class="store-list">`;
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
        container.innerHTML = '<p class="empty-list-message">Sistemde bayi bulunamadı.</p>';
        return;
    }

    const currentAuditedData = (currentViewMode === 'monthly') 
        ? auditedStoreCodesCurrentMonth 
        : auditedStoreCodesCurrentYear.map(code => ({ code: code, timestamp: 0 }));

    if (currentAuditedData.length === 0) { 
        container.innerHTML = '<p class="empty-list-message">Bu dönem için denetim kaydı bulunamadı.</p>';
        return;
    }
    
    const auditedStoresDetails = currentAuditedData
        .map(audit => {
            const storeFromMaster = allStoresMaster.find(store => store.bayiKodu === audit.code);
            return { ...(storeFromMaster || {bayiKodu: audit.code, bayiAdi: 'Bilinmeyen Bayi'}), timestamp: audit.timestamp };
        })
        .filter(store => store.bayiKodu) 
        .sort((a, b) => b.timestamp - a.timestamp);
    
    let listHtml = '<ul class="store-list">';
    auditedStoresDetails.forEach(store => {
        // Geri alma butonu sadece Aylık modda ve Admin ise gözüksün (Yıllık modda karmaşıklığı önlemek için)
        const revertButtonHtml = (currentUserRole === 'admin' && currentViewMode === 'monthly')
            ? `<button class="btn-warning btn-sm btn-revert-audit" data-bayi-kodu="${store.bayiKodu}" title="Bu denetimi listeden kaldır"><i class="fas fa-undo"></i> Geri Al</button>`
            : ''; 

        listHtml += `<li class="store-list-item completed-item"><span>${store.bayiAdi} (${store.bayiKodu}) - ${store.bolge || 'Bölgesiz'}</span>${revertButtonHtml}</li>`;
    });
    container.innerHTML = listHtml + '</ul>';

    container.querySelectorAll('.btn-revert-audit').forEach(button => {
        button.addEventListener('click', () => {
            const bayiKodu = button.dataset.bayiKodu;
            revertAudit(bayiKodu); 
        });
    });
}

/**
 * GÜNCELLENDİ: Artık çalışma takvimindeki izin günlerini de hesaba katıyor.
 */
function getRemainingWorkdays() {
    const today = new Date(); const year = today.getFullYear(); const month = today.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    
    // Takvim izin verilerini al
    const leaveData = JSON.parse(localStorage.getItem('bayiPlanlayiciData')) || {};

    let remainingWorkdays = 0;
    if (today.getDate() > lastDayOfMonth) return 0;
    
    for (let day = today.getDate(); day <= lastDayOfMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        const key = `${year}-${month}-${day}`;

        // Hafta içi mi (Pzt-Cum) VE İzinli DEĞİL mi?
        if (dayOfWeek > 0 && dayOfWeek < 6 && !leaveData[key]) {
            remainingWorkdays++;
        }
    }
    return remainingWorkdays;
}