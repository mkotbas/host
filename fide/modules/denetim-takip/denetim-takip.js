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
let currentPeriod = 'aylik'; // 'aylik' veya 'yillik'

let globalAylikHedef = 0;
let aylikHedef = 0;

const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
let pbInstance = null;
let currentUserRole = null;
let currentUserId = null;

// --- YARDIMCI GÜVENLİK FONKSİYONLARI (Kural 16 - Safe Access) ---
function safeSetText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
}

function safeAddListener(id, event, callback) {
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, callback);
}

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
            const selectorContainer = document.getElementById('admin-user-selector-container');
            if (selectorContainer) selectorContainer.style.display = 'block';
            await populateUserFilterDropdown();
        }

        // --- STİL GÜVENLİĞİ İÇİN GECİKMELİ BAŞLATMA ---
        // Tarayıcının CSS dosyasını işlemesine zaman tanımak için 50ms bekletiyoruz.
        setTimeout(() => {
            applyDataFilterAndRunDashboard('my_data');
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        }, 50);

    } else {
        const uploadArea = document.getElementById('upload-area');
        if (uploadArea) {
            uploadArea.innerHTML = '<p style="text-align: center; color: var(--danger);">Denetim takip sistemini kullanmak için lütfen sisteme giriş yapın.</p>';
            uploadArea.style.display = 'block';
        }
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

async function loadSettings() {
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        globalAylikHedef = record.deger || 0;
    } catch (error) {
        globalAylikHedef = 0;
    }

    if (currentUserRole === 'admin') {
        const targetInput = document.getElementById('monthly-target-input');
        if (targetInput) targetInput.value = globalAylikHedef > 0 ? globalAylikHedef : '';
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
        console.error("Veri yükleme hatası:", error);
    }
}

async function populateUserFilterDropdown() {
    if (currentUserRole !== 'admin') return;
    try {
        allUsers = await pbInstance.collection('users').getFullList({ sort: 'name' });
        const selectElement = document.getElementById('admin-user-filter');
        if (!selectElement) return;
        
        selectElement.innerHTML = `<option value="my_data" selected>Benim Verilerim (Admin)</option>`;
        selectElement.innerHTML += `<option value="global">Genel Bakış (Tüm Sistem)</option>`;

        allUsers.forEach(user => {
            if (user.id !== currentUserId) {
                const displayName = user.name || user.email;
                const roleLabel = user.role === 'admin' ? 'Admin' : 'Client';
                selectElement.innerHTML += `<option value="${user.id}">${displayName} (${roleLabel})</option>`;
            }
        });
    } catch (e) {}
}

function applyDataFilterAndRunDashboard(viewId) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentMonthKey = `${currentYear}-${currentMonth}`;

    if (currentUserRole !== 'admin') {
        allStores = [...allStoresMaster];
    } else {
        if (viewId === 'global') allStores = [...allStoresMaster];
        else if (viewId === 'my_data') allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === currentUserId);
        else allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === viewId);
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

    let filteredReports = (currentUserRole !== 'admin') ? [...allReportsMaster] : 
        (viewId === 'global' ? [...allReportsMaster] : 
        (viewId === 'my_data' ? allReportsMaster.filter(r => r.user === currentUserId) : 
        allReportsMaster.filter(r => r.user === viewId)));

    const monthlyAuditsMap = new Map();
    const yearlyCodesMap = new Map();
    filteredReports.forEach(record => {
        if (!record.expand || !record.expand.bayi) return;
        const storeCode = record.expand.bayi.bayiKodu;
        const reportDate = new Date(record.denetimTamamlanmaTarihi);
        
        if (!yearlyCodesMap.has(storeCode)) yearlyCodesMap.set(storeCode, { code: storeCode, timestamp: reportDate.getTime() });
        if (reportDate.getMonth() === currentMonth && reportDate.getFullYear() === currentYear) {
            if (!monthlyAuditsMap.has(storeCode)) monthlyAuditsMap.set(storeCode, { code: storeCode, timestamp: reportDate.getTime() });
        }
    });
    
    auditedStoreCodesCurrentMonth = Array.from(monthlyAuditsMap.values()).filter(a => !geriAlinanBayiKodlariAy.has(a.code));
    auditedStoreCodesCurrentYear = Array.from(yearlyCodesMap.values()).filter(a => !geriAlinanBayiKodlariYil.has(a.code));
    aylikHedef = globalAylikHedef; 

    const resetBtn = document.getElementById('reset-data-btn');
    if (resetBtn && currentUserRole === 'admin') resetBtn.disabled = (viewId !== 'global');

    localCityFilterValue = 'Tümü'; 
    const localFilter = document.getElementById('local-city-filter');
    if(localFilter) localFilter.value = 'Tümü';

    runDashboard();
}

function runDashboard() {
    updateUILabels();
    populateAllFilters(allStores); 
    applyAndRepopulateFilters(); 
}

function updateUILabels() {
    const isYearly = currentPeriod === 'yillik';
    const currentMonthName = monthNames[new Date().getMonth()];
    
    safeSetText('stat-completed-label', isYearly ? "Bu Yıl Denetlenen" : "Bu Ay Denetlenen");
    safeSetText('list-remaining-label', isYearly ? "Bu Yıl Denetlenecek Bayiler" : "Denetlenecek Bayiler");
    safeSetText('list-completed-label', isYearly ? "Bu Yıl Denetlenenler" : `${currentMonthName} Ayı Denetlenenler`);
}

function setupModuleEventListeners(userRole) {
    if (document.body.dataset.denetimTakipListenersAttached) return;
    document.body.dataset.denetimTakipListenersAttached = 'true';

    if (userRole === 'admin') {
        safeAddListener('open-admin-panel-btn', 'click', () => {
            const overlay = document.getElementById('admin-panel-overlay');
            if (overlay) overlay.style.display = 'flex';
        });
        safeAddListener('close-admin-panel-btn', 'click', () => {
            const overlay = document.getElementById('admin-panel-overlay');
            if (overlay) overlay.style.display = 'none';
        });
        safeAddListener('save-settings-btn', 'click', saveSettings);
        safeAddListener('reset-data-btn', 'click', resetProgress);
        safeAddListener('admin-user-filter', 'change', (e) => {
            const loadingOverlay = document.getElementById('loading-overlay');
            if (loadingOverlay) loadingOverlay.style.display = 'flex';
            applyDataFilterAndRunDashboard(e.target.value);
            if (loadingOverlay) loadingOverlay.style.display = 'none';
        });
    } else {
        const adminBtn = document.getElementById('open-admin-panel-btn');
        if (adminBtn) adminBtn.style.display = 'none';
        const resetBtn = document.getElementById('reset-data-btn');
        if (resetBtn) resetBtn.style.display = 'none';
    }

    safeAddListener('period-filter', 'change', (e) => {
        currentPeriod = e.target.value;
        runDashboard();
    });

    safeAddListener('bolge-filter', 'change', () => { updateDropdowns('bolge'); applyAndRepopulateFilters(); });
    safeAddListener('yonetmen-filter', 'change', () => { updateDropdowns('yonetmen'); applyAndRepopulateFilters(); });
    safeAddListener('sehir-filter', 'change', () => { updateDropdowns('sehir'); applyAndRepopulateFilters(); });
    safeAddListener('ilce-filter', 'change', applyAndRepopulateFilters);

    safeAddListener('local-city-filter', 'change', (e) => {
        localCityFilterValue = e.target.value;
        renderRemainingStores(currentGlobalFilteredStores); 
    });
}

function updateDropdowns(changedFilter) {
    const filters = { bolge: 'bolge-filter', yonetmen: 'yonetmen-filter', sehir: 'sehir-filter', ilce: 'ilce-filter' };
    const values = {
        bolge: document.getElementById(filters.bolge)?.value || 'Tümü',
        yonetmen: document.getElementById(filters.yonetmen)?.value || 'Tümü',
        sehir: document.getElementById(filters.sehir)?.value || 'Tümü',
        ilce: document.getElementById(filters.ilce)?.value || 'Tümü'
    };

    const filteredPool = allStores.filter(s => 
        (values.bolge === 'Tümü' || s.bolge === values.bolge) &&
        (values.yonetmen === 'Tümü' || s.yonetmen === values.yonetmen) &&
        (values.sehir === 'Tümü' || s.sehir === values.sehir)
    );

    if (changedFilter === 'bolge') {
        repopulateSelect('yonetmen-filter', filteredPool, 'yonetmen');
        repopulateSelect('sehir-filter', filteredPool, 'sehir');
        repopulateSelect('ilce-filter', filteredPool, 'ilce');
    } 
    else if (changedFilter === 'yonetmen') {
        repopulateSelect('sehir-filter', filteredPool, 'sehir');
        repopulateSelect('ilce-filter', filteredPool, 'ilce');
    }
    else if (changedFilter === 'sehir') {
        repopulateSelect('ilce-filter', filteredPool, 'ilce');
    }
}

function repopulateSelect(elementId, dataPool, fieldName) {
    const select = document.getElementById(elementId);
    if (!select) return;
    const currentVal = select.value;
    const uniqueValues = [...new Set(dataPool.map(s => s[fieldName]))].sort((a, b) => a.localeCompare(b, 'tr'));
    
    select.innerHTML = '<option value="Tümü">Tümü</option>';
    uniqueValues.forEach(v => { if (v) select.innerHTML += `<option value="${v}">${v}</option>`; });
    
    if (uniqueValues.includes(currentVal)) select.value = currentVal;
    else select.value = 'Tümü';
}

async function resetProgress() {
    if (currentUserRole !== 'admin') return;
    const currentView = document.getElementById('admin-user-filter')?.value;
    if (currentView !== 'global') return alert("Yıllık sıfırlama sadece 'Genel Bakış' görünümünde yapılabilir.");
    if (!confirm("Tüm denetim verileri geri alınacak. Onaylıyor musunuz?")) return;

    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';

    try {
        for (const report of allReportsMaster) {
            if (!report.bayi) continue;
            const rDate = new Date(report.denetimTamamlanmaTarihi);
            const mKey = `${rDate.getFullYear()}-${rDate.getMonth()}`;
            try {
                await pbInstance.collection('denetim_geri_alinanlar').getFirstListItem(`yil_ay="${mKey}" && bayi="${report.bayi}"`);
            } catch (e) {
                await pbInstance.collection('denetim_geri_alinanlar').create({ "yil_ay": mKey, "bayi": report.bayi });
            }
        }
        window.location.reload();
    } catch (e) {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

async function saveSettings() {
    const val = parseInt(document.getElementById('monthly-target-input')?.value);
    if (isNaN(val) || val < 0) return alert("Geçerli bir hedef girin.");
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        await pbInstance.collection('ayarlar').update(record.id, { deger: val });
    } catch (e) {
        await pbInstance.collection('ayarlar').create({ anahtar: 'aylikHedef', deger: val });
    }
    globalAylikHedef = val;
    alert("Ayarlar kaydedildi.");
    const overlay = document.getElementById('admin-panel-overlay');
    if (overlay) overlay.style.display = 'none';
    applyDataFilterAndRunDashboard(document.getElementById('admin-user-filter')?.value || 'my_data');
}

async function revertAudit(bayiKodu) {
    if (currentUserRole !== 'admin') return;
    const store = allStoresMaster.find(s => s.bayiKodu === bayiKodu);
    if (!confirm(`'${store?.bayiAdi || bayiKodu}' denetimini geri almak istediğinize emin misiniz?`)) return;

    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) loadingOverlay.style.display = 'flex';
    try {
        const today = new Date();
        const mKey = `${today.getFullYear()}-${today.getMonth()}`;
        await pbInstance.collection('denetim_geri_alinanlar').create({ "yil_ay": mKey, "bayi": store.id });
        await loadMasterData();
        applyDataFilterAndRunDashboard(document.getElementById('admin-user-filter')?.value || 'my_data');
    } catch (e) {}
    if (loadingOverlay) loadingOverlay.style.display = 'none';
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

    const filteredStoreCodes = new Set(currentGlobalFilteredStores.map(s => s.bayiKodu));

    const filteredAuditsMonth = auditedStoreCodesCurrentMonth.filter(a => filteredStoreCodes.has(a.code));
    const filteredAuditsYear = auditedStoreCodesCurrentYear.filter(a => filteredStoreCodes.has(a.code));

    calculateAndDisplayDashboard(filteredAuditsMonth, filteredAuditsYear);
    renderRemainingStores(currentGlobalFilteredStores); 
    renderAuditedStores(filteredAuditsMonth, filteredAuditsYear);
}

function calculateAndDisplayDashboard(filteredMonth, filteredYear) {
    const today = new Date();
    const isYearly = currentPeriod === 'yillik';
    
    const activeAuditsMonth = filteredMonth || auditedStoreCodesCurrentMonth;
    const activeAuditsYear = filteredYear || auditedStoreCodesCurrentYear;
    
    const auditedCount = isYearly ? activeAuditsYear.length : activeAuditsMonth.length;
    
    safeSetText('work-days-count', getRemainingWorkdays());
    safeSetText('total-stores-count', aylikHedef); 
    safeSetText('audited-stores-count', auditedCount);
    safeSetText('remaining-stores-count', Math.max(0, aylikHedef - auditedCount));
    
    const totalStores = currentGlobalFilteredStores.length || allStores.length; 
    const annualProgress = totalStores > 0 ? (activeAuditsYear.length / totalStores) * 100 : 0;
    
    const dashboardTitle = document.getElementById('dashboard-title');
    if (dashboardTitle) dashboardTitle.innerHTML = `<i class="fas fa-calendar-day"></i> ${today.getFullYear()} ${monthNames[today.getMonth()]} Ayı Performansı`;
    
    const annualIndicator = document.getElementById('annual-performance-indicator');
    if (annualIndicator) {
        annualIndicator.innerHTML = `
            <div class="annual-header">
                 <h4><i class="fas fa-calendar-alt"></i> ${today.getFullYear()} Yıllık Hedef</h4>
                 <p class="annual-progress-text">${activeAuditsYear.length} / ${totalStores}</p>
            </div>
            <div class="progress-bar">
                <div class="progress-bar-fill" style="width: ${annualProgress.toFixed(2)}%;">${annualProgress.toFixed(0)}%</div>
            </div>`;
    }

    const content = document.getElementById('dashboard-content');
    if (content) content.style.display = 'block';
}

function populateAllFilters(stores) {
    const filters = { bolge: 'bolge-filter', yonetmen: 'yonetmen-filter', sehir: 'sehir-filter', ilce: 'ilce-filter' };
    Object.keys(filters).forEach(key => {
        const select = document.getElementById(filters[key]);
        if (!select) return;
        const fieldName = key;
        const uniqueValues = [...new Set(stores.map(s => s[fieldName]))].sort((a, b) => a.localeCompare(b, 'tr'));
        select.innerHTML = '<option value="Tümü">Tümü</option>';
        uniqueValues.forEach(value => { if (value) select.innerHTML += `<option value="${value}">${value}</option>`; });
    });
}

function renderRemainingStores(filteredStores) {
    const container = document.getElementById('denetlenecek-bayiler-container');
    if (!container) return;
    container.innerHTML = '';
    
    const isYearly = currentPeriod === 'yillik';
    const auditedCodes = isYearly ? auditedStoreCodesCurrentYear.map(a => a.code) : auditedStoreCodesCurrentMonth.map(a => a.code);
    const allRemainingStores = filteredStores.filter(store => !auditedCodes.includes(store.bayiKodu));

    const select = document.getElementById('local-city-filter');
    if (allRemainingStores.length === 0) {
        if(select) select.innerHTML = '<option value="Tümü">Şehir Yok</option>';
        container.innerHTML = `<p class="empty-list-message">Denetlenmemiş bayi bulunamadı.</p>`;
        return;
    }

    const uniqueCities = [...new Set(allRemainingStores.map(s => s.sehir))].sort((a, b) => a.localeCompare(b, 'tr'));
    if (select) {
        select.innerHTML = '<option value="Tümü">Tüm Şehirler</option>';
        uniqueCities.forEach(c => select.innerHTML += `<option value="${c}">${c}</option>`);
        select.value = uniqueCities.includes(localCityFilterValue) ? localCityFilterValue : 'Tümü';
    }

    const storesToShow = localCityFilterValue === 'Tümü' ? allRemainingStores : allRemainingStores.filter(s => s.sehir === localCityFilterValue);
    const storesByRegion = storesToShow.reduce((acc, s) => {
        const r = s.bolge || 'Bölge Belirtilmemiş';
        (acc[r] = acc[r] || []).push(s);
        return acc;
    }, {});

    Object.keys(storesByRegion).sort().forEach(r => {
        const rStores = storesByRegion[r];
        const tReg = allStores.filter(s => (s.bolge || 'Bölge Belirtilmemiş') === r).length;
        const aReg = allStores.filter(s => (s.bolge || 'Bölge Belirtilmemiş') === r && auditedCodes.includes(s.bayiKodu)).length;
        const prog = tReg > 0 ? (aReg / tReg) * 100 : 0;
        
        container.innerHTML += `<div class="region-container"><div class="region-header"><span>${r} (${isYearly ? "Yıllık" : "Aylık"}: ${aReg}/${tReg})</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width: ${prog.toFixed(2)}%;">${prog.toFixed(0)}%</div></div><ul class="store-list">` + 
            rStores.map(s => `<li class="store-list-item">${s.bayiAdi} (${s.bayiKodu}) - ${s.sehir}/${s.ilce}</li>`).join('') + '</ul></div>';
    });
}

function renderAuditedStores(filteredMonth, filteredYear) {
    const container = document.getElementById('denetlenen-bayiler-container');
    if (!container) return;
    const isYearly = currentPeriod === 'yillik';
    const activeAudits = isYearly ? (filteredYear || auditedStoreCodesCurrentYear) : (filteredMonth || auditedStoreCodesCurrentMonth);

    if (activeAudits.length === 0) {
        container.innerHTML = `<p class="empty-list-message">Denetim kaydı bulunamadı.</p>`;
        return;
    }
    
    container.innerHTML = '<ul class="store-list">' + activeAudits.map(a => {
        const s = allStoresMaster.find(sm => sm.bayiKodu === a.code) || {bayiKodu: a.code, bayiAdi: 'Bilinmeyen'};
        const btn = (currentUserRole === 'admin') ? `<button class="btn-warning btn-sm btn-revert-audit" data-bayi-kodu="${s.bayiKodu}"><i class="fas fa-undo"></i> Geri Al</button>` : '';
        return `<li class="store-list-item completed-item"><span>${s.bayiAdi} (${s.bayiKodu})</span>${btn}</li>`;
    }).join('') + '</ul>';

    container.querySelectorAll('.btn-revert-audit').forEach(b => b.addEventListener('click', () => revertAudit(b.dataset.bayiKodu)));
}

function getRemainingWorkdays() {
    const today = new Date(); const year = today.getFullYear(); const month = today.getMonth();
    const lastDay = new Date(year, month + 1, 0).getDate();
    let count = 0;
    for (let d = today.getDate(); d <= lastDay; d++) {
        const dow = new Date(year, month, d).getDay();
        if (dow > 0 && dow < 6) count++;
    }
    return count;
}