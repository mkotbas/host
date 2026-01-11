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
let currentViewMode = 'monthly'; // Varsayılan mod

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
        if (error.status !== 404) console.error("Aylık hedef ayarı yüklenemedi:", error);
    }

    if (currentUserRole === 'admin') {
        document.getElementById('monthly-target-input').value = globalAylikHedef > 0 ? globalAylikHedef : '';
    } else {
        const targetInput = document.getElementById('monthly-target-input');
        if (targetInput) targetInput.disabled = true;
    }
}

async function loadMasterData() {
    if (!pbInstance.authStore.isValid) return;

    try {
        allStoresMaster = await pbInstance.collection('bayiler').getFullList({ sort: 'bayiAdi' });

        if (allStoresMaster.length > 0) {
            document.getElementById('upload-area').style.display = 'none';
            document.getElementById('loaded-data-area').style.display = 'block';
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
    }
}

async function populateUserFilterDropdown() {
    if (currentUserRole !== 'admin') return;
    try {
        allUsers = await pbInstance.collection('users').getFullList({ sort: 'name' });
        const selectElement = document.getElementById('admin-user-filter');
        selectElement.innerHTML = `<option value="my_data" selected>Benim Verilerim (Admin)</option><option value="global">Genel Bakış (Tüm Sistem)</option>`;
        allUsers.forEach(user => {
            if (user.id !== currentUserId) {
                const displayName = user.name || user.email;
                selectElement.innerHTML += `<option value="${user.id}">${displayName} (${user.role === 'admin' ? 'Admin' : 'Client'})</option>`;
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

    if (currentUserRole === 'admin') {
        if (viewId === 'global') allStores = [...allStoresMaster];
        else if (viewId === 'my_data') allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === currentUserId);
        else allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === viewId);
    } else {
        allStores = [...allStoresMaster];
    }

    const geriAlinanBayiKodlariYil = new Set();
    const geriAlinanBayiKodlariAy = new Set();
    allGeriAlinanMaster.forEach(record => {
        if (record.expand && record.expand.bayi) {
            const storeCode = record.expand.bayi.bayiKodu;
            geriAlinanBayiKodlariYil.add(storeCode);
            if (record.yil_ay === currentMonthKey) geriAlinanBayiKodlariAy.add(storeCode);
        }
    });

    let filteredReports = (currentUserRole === 'admin') ? 
        (viewId === 'global' ? allReportsMaster : (viewId === 'my_data' ? allReportsMaster.filter(r => r.user === currentUserId) : allReportsMaster.filter(r => r.user === viewId))) : 
        [...allReportsMaster];

    const monthlyAuditsMap = new Map();
    const yearlyCodes = new Set();
    filteredReports.forEach(record => {
        if (!record.expand || !record.expand.bayi) return;
        const storeCode = record.expand.bayi.bayiKodu;
        const reportDate = new Date(record.denetimTamamlanmaTarihi);
        if (!geriAlinanBayiKodlariYil.has(storeCode)) yearlyCodes.add(storeCode);
        if (reportDate.getMonth() === currentMonth && reportDate.getFullYear() === currentYear) {
            if (!monthlyAuditsMap.has(storeCode) && !geriAlinanBayiKodlariAy.has(storeCode)) {
                monthlyAuditsMap.set(storeCode, { code: storeCode, timestamp: reportDate.getTime() });
            }
        }
    });
    
    auditedStoreCodesCurrentMonth = Array.from(monthlyAuditsMap.values());
    auditedStoreCodesCurrentYear = Array.from(yearlyCodes);
    aylikHedef = globalAylikHedef; 
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

    if (userRole === 'admin') {
        document.getElementById('open-admin-panel-btn').addEventListener('click', () => {
            document.getElementById('admin-panel-overlay').style.display = 'flex';
        });
        document.getElementById('close-admin-panel-btn').addEventListener('click', () => {
            document.getElementById('admin-panel-overlay').style.display = 'none';
        });
        document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
        document.getElementById('admin-user-filter').addEventListener('change', (e) => {
            applyDataFilterAndRunDashboard(e.target.value);
        });
    } else {
        const btn = document.getElementById('open-admin-panel-btn');
        if (btn) btn.style.display = 'none';
    }

    // Görünüm Modu Değiştirici
    const modeButtons = document.querySelectorAll('#view-mode-toggle button');
    modeButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            modeButtons.forEach(b => { b.classList.remove('btn-primary', 'active'); b.classList.add('btn-light'); });
            e.target.classList.remove('btn-light'); e.target.classList.add('btn-primary', 'active');
            currentViewMode = e.target.dataset.mode;
            calculateAndDisplayDashboard();
            applyAndRepopulateFilters();
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
    const newTarget = parseInt(document.getElementById('monthly-target-input').value);
    if (isNaN(newTarget) || newTarget < 0) return alert("Geçerli bir hedef girin.");
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        await pbInstance.collection('ayarlar').update(record.id, { deger: newTarget });
        globalAylikHedef = newTarget; alert("Ayarlar kaydedildi.");
        document.getElementById('admin-panel-overlay').style.display = 'none';
        applyDataFilterAndRunDashboard(document.getElementById('admin-user-filter').value || 'my_data');
    } catch (error) {
        if (error.status === 404) {
            await pbInstance.collection('ayarlar').create({ anahtar: 'aylikHedef', deger: newTarget });
            globalAylikHedef = newTarget; alert("Ayarlar kaydedildi.");
            document.getElementById('admin-panel-overlay').style.display = 'none';
        }
    }
}

async function revertAudit(bayiKodu) {
    if (currentUserRole !== 'admin') return;
    const store = allStoresMaster.find(s => s.bayiKodu === bayiKodu);
    if (!confirm(`'${store ? store.bayiAdi : bayiKodu}' denetimini listeden kaldırmak istediğinizden emin misiniz?`)) return;
    try {
        const today = new Date();
        const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
        await pbInstance.collection('denetim_geri_alinanlar').create({ "yil_ay": currentMonthKey, "bayi": store.id });
        await loadMasterData();
        applyDataFilterAndRunDashboard(document.getElementById('admin-user-filter').value || 'my_data');
    } catch (error) { alert("Hata oluştu: " + error.message); }
}

function calculateAndDisplayDashboard() {
    const today = new Date();
    const totalStoresCount = allStores.length;
    let displayTarget, displayAudited, titleIcon, titleText, targetLabel, auditedLabel, remainingLabel, listTitle;

    if (currentViewMode === 'monthly') {
        displayTarget = aylikHedef; displayAudited = auditedStoreCodesCurrentMonth.length;
        titleIcon = "calendar-day"; titleText = `${today.getFullYear()} ${monthNames[today.getMonth()]} Ayı Performansı`;
        targetLabel = "Aylık Denetim Hedefi"; auditedLabel = "Bu Ay Denetlenen"; remainingLabel = "Aylık Hedefe Kalan"; listTitle = "Bu Ay Denetlenenler";
        document.getElementById('work-days-card').style.display = 'block';
    } else {
        displayTarget = totalStoresCount; displayAudited = auditedStoreCodesCurrentYear.length;
        titleIcon = "calendar-alt"; titleText = `${today.getFullYear()} Yılı Genel Performans`;
        targetLabel = "Yıllık Toplam Bayi"; auditedLabel = "Yıl Boyu Denetlenen"; remainingLabel = "Yıllık Hedefe Kalan"; listTitle = "Bu Yıl Denetlenenler";
        document.getElementById('work-days-card').style.display = 'none';
    }

    const remainingToTarget = Math.max(0, displayTarget - displayAudited);
    document.getElementById('dashboard-title').innerHTML = `<i class="fas fa-${titleIcon}"></i> ${titleText}`;
    document.getElementById('target-label').textContent = targetLabel;
    document.getElementById('audited-label').textContent = auditedLabel;
    document.getElementById('remaining-label').textContent = remainingLabel;
    document.getElementById('audited-list-title').innerHTML = `<i class="fas fa-check-double"></i> ${listTitle}`;
    document.getElementById('work-days-count').textContent = getRemainingWorkdays();
    document.getElementById('total-stores-count').textContent = displayTarget;
    document.getElementById('audited-stores-count').textContent = displayAudited;
    document.getElementById('remaining-stores-count').textContent = remainingToTarget;
    
    const annualProgress = totalStoresCount > 0 ? (auditedStoreCodesCurrentYear.length / totalStoresCount) * 100 : 0;
    document.getElementById('annual-performance-indicator').innerHTML = `
        <div class="annual-header"><h4><i class="fas fa-calendar-alt"></i> Yıllık İlerleme</h4><p class="annual-progress-text">${auditedStoreCodesCurrentYear.length} / ${totalStoresCount}</p></div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width: ${annualProgress.toFixed(2)}%;">${annualProgress.toFixed(0)}%</div></div>`;
    renderAuditedStores(); 
    document.getElementById('dashboard-content').style.display = 'block';
}

function updateAllFilterOptions() {
    const filters = { 'bolge-filter': 'bolge', 'yonetmen-filter': 'yonetmen', 'sehir-filter': 'sehir', 'ilce-filter': 'ilce' };
    Object.keys(filters).forEach(currentFilterId => {
        const currentSelect = document.getElementById(currentFilterId);
        const currentField = filters[currentFilterId];
        const previousValue = currentSelect.value;
        const otherFilters = {};
        Object.keys(filters).forEach(id => { if (id !== currentFilterId) otherFilters[filters[id]] = document.getElementById(id).value; });
        const availableStores = allStores.filter(s => Object.keys(otherFilters).every(field => otherFilters[field] === 'Tümü' || s[field] === otherFilters[field]));
        const uniqueValues = [...new Set(availableStores.map(s => s[currentField]))].filter(Boolean).sort((a, b) => a.localeCompare(b, 'tr'));
        currentSelect.innerHTML = '<option value="Tümü">Tümü</option>';
        uniqueValues.forEach(val => currentSelect.innerHTML += `<option value="${val}">${val}</option>`);
        currentSelect.value = uniqueValues.includes(previousValue) ? previousValue : 'Tümü';
    });
}

function applyAndRepopulateFilters() {
    const selected = { bolge: document.getElementById('bolge-filter').value, yonetmen: document.getElementById('yonetmen-filter').value, sehir: document.getElementById('sehir-filter').value, ilce: document.getElementById('ilce-filter').value };
    currentGlobalFilteredStores = allStores.filter(s => (selected.bolge === 'Tümü' || s.bolge === selected.bolge) && (selected.yonetmen === 'Tümü' || s.yonetmen === selected.yonetmen) && (selected.sehir === 'Tümü' || s.sehir === selected.sehir) && (selected.ilce === 'Tümü' || s.ilce === selected.ilce));
    updateAllFilterOptions();
    renderRemainingStores(currentGlobalFilteredStores); 
}

function renderRemainingStores(filteredStores) {
    const container = document.getElementById('denetlenecek-bayiler-container');
    container.innerHTML = '';
    const auditedCodes = (currentViewMode === 'monthly') ? auditedStoreCodesCurrentMonth.map(audit => audit.code) : auditedStoreCodesCurrentYear;
    const allRemainingStores = filteredStores.filter(store => !auditedCodes.includes(store.bayiKodu));
    if (allRemainingStores.length === 0) {
        document.getElementById('local-city-filter').innerHTML = '<option value="Tümü">Şehir Yok</option>';
        container.innerHTML = `<p class="empty-list-message">Denetlenmemiş bayi bulunamadı.</p>`; return;
    }
    const uniqueCities = [...new Set(allRemainingStores.map(s => s.sehir))].sort((a, b) => a.localeCompare(b, 'tr'));
    const select = document.getElementById('local-city-filter');
    select.innerHTML = '<option value="Tümü">Tüm Şehirler</option>';
    uniqueCities.forEach(city => { if (city) select.innerHTML += `<option value="${city}">${city}</option>`; });
    select.value = uniqueCities.includes(localCityFilterValue) ? localCityFilterValue : 'Tümü';
    localCityFilterValue = select.value;
    const storesToShow = localCityFilterValue === 'Tümü' ? allRemainingStores : allRemainingStores.filter(s => s.sehir === localCityFilterValue);
    const periodText = currentViewMode === 'monthly' ? "Ay" : "Yıl";
    const storesByRegion = storesToShow.reduce((acc, store) => { const region = store.bolge || 'Bölgesiz'; (acc[region] = acc[region] || []).push(store); return acc; }, {});
    Object.keys(storesByRegion).sort().forEach(region => {
        const regionStores = storesByRegion[region];
        const total = allStores.filter(s => (s.bolge || 'Bölgesiz') === region).length;
        const audited = allStores.filter(s => (s.bolge || 'Bölgesiz') === region && auditedCodes.includes(s.bayiKodu)).length;
        let regionHtml = `<div class="region-container"><div class="region-header"><span>${region} (${periodText}: ${audited}/${total})</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width: ${(audited/total*100).toFixed(2)}%;">${(audited/total*100).toFixed(0)}%</div></div><ul class="store-list">`;
        regionStores.forEach(store => regionHtml += `<li class="store-list-item">${store.bayiAdi} (${store.bayiKodu}) - ${store.sehir}/${store.ilce}</li>`);
        container.innerHTML += regionHtml + '</ul></div>';
    });
}

function renderAuditedStores() {
    const container = document.getElementById('denetlenen-bayiler-container');
    const currentAuditedData = (currentViewMode === 'monthly') ? auditedStoreCodesCurrentMonth : auditedStoreCodesCurrentYear.map(code => ({ code: code, timestamp: 0 }));
    if (currentAuditedData.length === 0) { container.innerHTML = '<p class="empty-list-message">Kayıt bulunamadı.</p>'; return; }
    const details = currentAuditedData.map(audit => { const s = allStoresMaster.find(store => store.bayiKodu === audit.code); return { ...(s || {bayiKodu: audit.code, bayiAdi: 'Bilinmeyen'}), timestamp: audit.timestamp }; }).sort((a, b) => b.timestamp - a.timestamp);
    let listHtml = '<ul class="store-list">';
    details.forEach(store => {
        const revBtn = (currentUserRole === 'admin' && currentViewMode === 'monthly') ? `<button class="btn-warning btn-sm btn-revert-audit" data-bayi-kodu="${store.bayiKodu}"><i class="fas fa-undo"></i> Geri Al</button>` : '';
        listHtml += `<li class="store-list-item completed-item"><span>${store.bayiAdi} (${store.bayiKodu})</span>${revBtn}</li>`;
    });
    container.innerHTML = listHtml + '</ul>';
    container.querySelectorAll('.btn-revert-audit').forEach(b => b.addEventListener('click', () => revertAudit(b.dataset.bayiKodu)));
}

function getRemainingWorkdays() {
    const today = new Date(); const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    let count = 0;
    for (let d = today.getDate(); d <= last; d++) { const day = new Date(today.getFullYear(), today.getMonth(), d).getDay(); if (day > 0 && day < 6) count++; }
    return count;
}