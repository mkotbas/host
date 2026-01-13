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
let currentViewMode = 'monthly'; 

let globalAylikHedef = 0; 
let aylikHedef = 0; 

const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let pbInstance = null;
let currentUserRole = null;
let currentUserId = null;

export async function initializeDenetimTakipModule(pb) {
    pbInstance = pb;
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    if (pbInstance && pbInstance.authStore.isValid) {
        currentUserRole = pbInstance.authStore.model.role;
        currentUserId = pbInstance.authStore.model.id;

        setupModuleEventListeners(currentUserRole);
        await loadSettings(); 
        await loadMasterData();

        if (currentUserRole === 'admin') {
            const adminSelector = document.getElementById('admin-user-selector-container');
            if (adminSelector) adminSelector.style.display = 'block';
            await populateUserFilterDropdown();
        }

        applyDataFilterAndRunDashboard('my_data');

    } else {
        const uploadArea = document.getElementById('upload-area');
        if (uploadArea) {
            uploadArea.innerHTML = '<p style="text-align: center; color: var(--danger);">Denetim takip sistemini kullanmak için lütfen sisteme giriş yapın.</p>';
            uploadArea.style.display = 'block';
        }
    }

    if (loadingOverlay) loadingOverlay.style.display = 'none';
}

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

    const targetInput = document.getElementById('monthly-target-input');
    if (targetInput) {
        if (currentUserRole === 'admin') {
            targetInput.value = globalAylikHedef > 0 ? globalAylikHedef : '';
        } else {
            targetInput.value = '';
            targetInput.disabled = true;
        }
    }
}

async function loadMasterData() {
    if (!pbInstance.authStore.isValid) return;

    try {
        allStoresMaster = await pbInstance.collection('bayiler').getFullList({ sort: 'bayiAdi' });

        const uploadArea = document.getElementById('upload-area');
        const loadedArea = document.getElementById('loaded-data-area');

        if (allStoresMaster.length > 0) {
            if (uploadArea) uploadArea.style.display = 'none';
            if (loadedArea) loadedArea.style.display = 'block';
        } else {
            if (uploadArea) uploadArea.style.display = 'block';
            if (loadedArea) loadedArea.style.display = 'none';
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
    }
}

async function populateUserFilterDropdown() {
    if (currentUserRole !== 'admin') return;

    try {
        allUsers = await pbInstance.collection('users').getFullList({ sort: 'name' });
        const selectElement = document.getElementById('admin-user-filter');
        if (!selectElement) return;

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
        
        if (!geriAlinanBayiKodlariYil.has(storeCode)) {
            yearlyCodes.add(storeCode);
        }

        if (reportDate.getMonth() === currentMonth && reportDate.getFullYear() === currentYear) {
            if (!monthlyAuditsMap.has(storeCode) && !geriAlinanBayiKodlariAy.has(storeCode)) {
                monthlyAuditsMap.set(storeCode, { code: storeCode, timestamp: reportDate.getTime() });
            }
        }
    });
    
    auditedStoreCodesCurrentMonth = Array.from(monthlyAuditsMap.values());
    auditedStoreCodesCurrentYear = Array.from(yearlyCodes);

    aylikHedef = globalAylikHedef; 

    const localFilter = document.getElementById('local-city-filter');
    if(localFilter) {
        localCityFilterValue = 'Tümü';
        localFilter.value = 'Tümü';
    }

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
        if (adminPanelBtn) adminPanelBtn.addEventListener('click', () => {
            const overlay = document.getElementById('admin-panel-overlay');
            if (overlay) overlay.style.display = 'flex';
        });
        const closeAdminBtn = document.getElementById('close-admin-panel-btn');
        if (closeAdminBtn) closeAdminBtn.addEventListener('click', () => {
            const overlay = document.getElementById('admin-panel-overlay');
            if (overlay) overlay.style.display = 'none';
        });
        const saveSettingsBtn = document.getElementById('save-settings-btn');
        if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', saveSettings);

        const adminUserFilter = document.getElementById('admin-user-filter');
        if (adminUserFilter) adminUserFilter.addEventListener('change', (e) => {
            const selectedViewId = e.target.value;
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            applyDataFilterAndRunDashboard(selectedViewId);
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        });
        
    } else {
        if (adminPanelBtn) adminPanelBtn.style.display = 'none';
    }

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

    const filters = ['bolge-filter', 'yonetmen-filter', 'sehir-filter', 'ilce-filter'];
    filters.forEach(fId => {
        const el = document.getElementById(fId);
        if (el) el.addEventListener('change', applyAndRepopulateFilters);
    });

    const localCityFilter = document.getElementById('local-city-filter');
    if (localCityFilter) localCityFilter.addEventListener('change', (e) => {
        localCityFilterValue = e.target.value;
        renderRemainingStores(currentGlobalFilteredStores); 
    });
}

async function saveSettings() {
    const targetInput = document.getElementById('monthly-target-input');
    if (!pbInstance.authStore.isValid || currentUserRole !== 'admin' || !targetInput) return;

    const newTarget = parseInt(targetInput.value);
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
    const overlay = document.getElementById('admin-panel-overlay');
    if (overlay) overlay.style.display = 'none';
    
    const adminUserFilter = document.getElementById('admin-user-filter');
    const currentView = adminUserFilter ? adminUserFilter.value : 'my_data';
    applyDataFilterAndRunDashboard(currentView);
}

/**
 * GÜNCELLENDİ: Hem bugünkü planı hem de izin günlerine göre revize edilmiş aylık hedefi hesaplar.
 */
function getRevisedTargetInfo(baseTarget, currentAudited) {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const todayDate = today.getDate();
    const leaveData = JSON.parse(localStorage.getItem('bayiPlanlayiciData')) || {};

    const lastDay = new Date(year, month + 1, 0).getDate();
    let allWorkDays = []; 
    let activeWorkDays = []; 

    for (let d = 1; d <= lastDay; d++) {
        const date = new Date(year, month, d);
        const dayOfWeek = date.getDay();
        const key = `${year}-${month}-${d}`;

        if (dayOfWeek > 0 && dayOfWeek < 6) {
            allWorkDays.push(d);
            if (d >= todayDate && !leaveData[key]) {
                activeWorkDays.push(d);
            }
        }
    }

    let leaveInWorkDays = 0;
    allWorkDays.forEach(d => {
        if (leaveData[`${year}-${month}-${d}`]) leaveInWorkDays++;
    });
    
    // Revize Hedef: İzin günlerinin mesaiye oranına göre ana hedeften düşüş yapar
    const dailyAverage = baseTarget / (allWorkDays.length || 1);
    const deduction = Math.round(dailyAverage * leaveInWorkDays);
    const revisedTotalTarget = Math.max(0, baseTarget - deduction);

    // Bugünkü Plan hesabı
    const remainingToVisit = Math.max(0, revisedTotalTarget - currentAudited);
    let todayGoal = 0;
    if (activeWorkDays.length > 0) {
        const todayKey = `${year}-${month}-${todayDate}`;
        if (!(today.getDay() === 0 || today.getDay() === 6 || leaveData[todayKey])) {
            const basePerDay = Math.floor(remainingToVisit / activeWorkDays.length);
            const extras = remainingToVisit % activeWorkDays.length;
            const todayIdxInActive = activeWorkDays.indexOf(todayDate);
            todayGoal = todayIdxInActive < extras ? basePerDay + 1 : basePerDay;
        }
    }

    return { revisedTotalTarget, todayGoal };
}

function calculateAndDisplayDashboard() {
    const today = new Date();
    const totalStoresCount = allStores.length;
    
    let displayTarget, displayAudited, titleIcon, titleText, targetLabel, auditedLabel, listTitle, remainingListTitle;

    if (currentViewMode === 'monthly') {
        displayAudited = auditedStoreCodesCurrentMonth.length;
        
        // ÖNEMLİ GÜNCELLEME: Takvime göre hedefi burada revize ediyoruz
        const baseMonthlyTarget = aylikHedef || 47;
        const targetInfo = getRevisedTargetInfo(baseMonthlyTarget, displayAudited);
        
        displayTarget = targetInfo.revisedTotalTarget; // İzinler düşülmüş gerçek aylık hedef
        const todayGoal = targetInfo.todayGoal; // Bugünkü plan sayınız

        titleIcon = "calendar-day";
        titleText = `${today.getFullYear()} ${monthNames[today.getMonth()]} Ayı Performansı`;
        targetLabel = "Aylık Denetim Hedefi";
        auditedLabel = "Bu Ay Denetlenen";
        listTitle = "Bu Ay Denetlenenler";
        remainingListTitle = "Bu Ay Denetlenecek Bayiler";
        
        const workDaysCard = document.getElementById('work-days-card');
        const dailyGoalCard = document.getElementById('daily-goal-card');
        const dailyGoalCount = document.getElementById('daily-goal-count');

        if (workDaysCard) workDaysCard.style.display = 'block';
        if (dailyGoalCard) dailyGoalCard.style.display = 'block';
        if (dailyGoalCount) dailyGoalCount.textContent = todayGoal;

    } else {
        displayTarget = totalStoresCount;
        displayAudited = auditedStoreCodesCurrentYear.length;
        titleIcon = "calendar-alt";
        titleText = `${today.getFullYear()} Yılı Genel Performans`;
        targetLabel = "Yıllık Toplam Bayi";
        auditedLabel = "Yıl Boyu Denetlenen";
        listTitle = "Bu Yıl Denetlenenler";
        remainingListTitle = "Bu Yıl Denetlenecek Bayiler";

        const workDaysCard = document.getElementById('work-days-card');
        const dailyGoalCard = document.getElementById('daily-goal-card');
        if (workDaysCard) workDaysCard.style.display = 'none';
        if (dailyGoalCard) dailyGoalCard.style.display = 'none';
    }

    // Hedefe kalan rakamı artık revize edilmiş (izinleri düşülmüş) hedef üzerinden hesaplanıyor
    const remainingToTarget = Math.max(0, displayTarget - displayAudited);
    const remainingWorkDays = getRemainingWorkdays();
    
    const dashboardTitle = document.getElementById('dashboard-title');
    if (dashboardTitle) dashboardTitle.innerHTML = `<i class="fas fa-${titleIcon}"></i> ${titleText}`;
    
    const targetLabelEl = document.getElementById('target-label');
    if (targetLabelEl) targetLabelEl.textContent = targetLabel;
    
    const auditedLabelEl = document.getElementById('audited-label');
    if (auditedLabelEl) auditedLabelEl.textContent = auditedLabel;
    
    const auditedListTitle = document.getElementById('audited-list-title');
    if (auditedListTitle) auditedListTitle.innerHTML = `<i class="fas fa-check-double"></i> ${listTitle}`;
    
    const remainingListTitleEl = document.getElementById('remaining-list-title');
    if (remainingListTitleEl) remainingListTitleEl.innerHTML = `<i class="fas fa-list-ul"></i> ${remainingListTitle}`;
    
    const workDaysCount = document.getElementById('work-days-count');
    if (workDaysCount) workDaysCount.textContent = remainingWorkDays;
    
    const totalStoresCountEl = document.getElementById('total-stores-count');
    if (totalStoresCountEl) totalStoresCountEl.textContent = displayTarget;
    
    const auditedStoresCountEl = document.getElementById('audited-stores-count');
    if (auditedStoresCountEl) auditedStoresCountEl.textContent = displayAudited;
    
    const remainingStoresCountEl = document.getElementById('remaining-stores-count');
    if (remainingStoresCountEl) remainingStoresCountEl.textContent = remainingToTarget;
    
    const annualIndicator = document.getElementById('annual-performance-indicator');
    if (annualIndicator) {
        const annualProgress = totalStoresCount > 0 ? (auditedStoreCodesCurrentYear.length / totalStoresCount) * 100 : 0;
        annualIndicator.innerHTML = `
            <div class="annual-header">
                 <h4><i class="fas fa-calendar-alt"></i> Yıllık İlerleme</h4>
                 <p class="annual-progress-text">${auditedStoreCodesCurrentYear.length} / ${totalStoresCount}</p>
            </div>
            <div class="progress-bar">
                <div class="progress-bar-fill" style="width: ${annualProgress.toFixed(2)}%;">${annualProgress.toFixed(0)}%</div>
            </div>`;
    }

    renderAuditedStores(); 
    const dashboardContent = document.getElementById('dashboard-content');
    if (dashboardContent) dashboardContent.style.display = 'block';
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
        if (!currentSelect) return;

        const currentField = filters[currentFilterId];
        const previousValue = currentSelect.value;

        const otherFilters = {};
        Object.keys(filters).forEach(id => {
            const otherEl = document.getElementById(id);
            if (id !== currentFilterId && otherEl) {
                otherFilters[filters[id]] = otherEl.value;
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
        bolge: document.getElementById('bolge-filter')?.value || 'Tümü',
        yonetmen: document.getElementById('yonetmen-filter')?.value || 'Tümü',
        sehir: document.getElementById('sehir-filter')?.value || 'Tümü',
        ilce: document.getElementById('ilce-filter')?.value || 'Tümü'
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
    if (!container) return;
    container.innerHTML = '';
    
    const auditedCodes = (currentViewMode === 'monthly') 
        ? auditedStoreCodesCurrentMonth.map(audit => audit.code)
        : auditedStoreCodesCurrentYear;

    const allRemainingStores = filteredStores.filter(store => !auditedCodes.includes(store.bayiKodu));

    const select = document.getElementById('local-city-filter');
    if (allRemainingStores.length === 0) {
        if(select) select.innerHTML = '<option value="Tümü">Şehir Yok</option>';
        container.innerHTML = `<p class="empty-list-message">Seçili kriterlere uygun denetlenmemiş bayi bulunamadı.</p>`;
        return;
    }

    if (select) {
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
    if (!container) return;
    
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

function getRemainingWorkdays() {
    const today = new Date(); const year = today.getFullYear(); const month = today.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    
    const leaveData = JSON.parse(localStorage.getItem('bayiPlanlayiciData')) || {};

    let remainingWorkdays = 0;
    if (today.getDate() > lastDayOfMonth) return 0;
    
    for (let day = today.getDate(); day <= lastDayOfMonth; day++) {
        const date = new Date(year, month, day);
        const dayOfWeek = date.getDay();
        const key = `${year}-${month}-${day}`;

        if (dayOfWeek > 0 && dayOfWeek < 6 && !leaveData[key]) {
            remainingWorkdays++;
        }
    }
    return remainingWorkdays;
}