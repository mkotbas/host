// fide/modules/denetim-takip/denetim-takip.js

let allStoresMaster = [];
let allReportsMaster = [];
let allGeriAlinanMaster = [];
let allUsers = []; 

let allStores = [];
let auditedStoreCodesCurrentMonth = [];
let auditedStoreCodesCurrentYear = [];
let leaveDataBulut = {};

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
        document.getElementById('upload-area').innerHTML = '<p style="text-align: center; color: var(--danger);">Giriş yapın.</p>';
        document.getElementById('upload-area').style.display = 'block';
    }

    loadingOverlay.style.display = 'none';
}

async function loadSettings() {
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        globalAylikHedef = record.deger || 0;
    } catch (error) { globalAylikHedef = 0; }

    try {
        const settingsKey = `leaveData_${currentUserId}`;
        const leaveRecord = await pbInstance.collection('ayarlar').getFirstListItem(`anahtar="${settingsKey}"`);
        leaveDataBulut = leaveRecord.deger || {};
    } catch (error) { leaveDataBulut = {}; }
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
        allGeriAlinanMaster = await pbInstance.collection('denetim_geri_alinanlar').getFullList({
            filter: `yil_ay ~ "${today.getFullYear()}-"`,
            expand: 'bayi'
        });
    } catch (error) { console.error("Veri hatası:", error); }
}

async function populateUserFilterDropdown() {
    if (currentUserRole !== 'admin') return;
    try {
        allUsers = await pbInstance.collection('users').getFullList({ sort: 'name' });
        const selectElement = document.getElementById('admin-user-filter');
        selectElement.innerHTML = `<option value="my_data" selected>Benim Verilerim (Admin)</option><option value="global">Genel Bakış (Tüm Sistem)</option>`;
        allUsers.forEach(user => {
            if (user.id !== currentUserId) {
                selectElement.innerHTML += `<option value="${user.id}">${user.name || user.email}</option>`;
            }
        });
    } catch (error) { }
}

function applyDataFilterAndRunDashboard(viewId) {
    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const currentMonthKey = `${currentYear}-${currentMonth}`;

    if (currentUserRole !== 'admin') allStores = [...allStoresMaster];
    else {
        if (viewId === 'global') allStores = [...allStoresMaster];
        else if (viewId === 'my_data') allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === currentUserId);
        else allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === viewId);
    }

    const geriAlinanBayiKodlariAy = new Set();
    allGeriAlinanMaster.forEach(record => {
        if (record.expand?.bayi && record.yil_ay === currentMonthKey) geriAlinanBayiKodlariAy.add(record.expand.bayi.bayiKodu);
    });

    let filteredReports = (currentUserRole !== 'admin' || viewId === 'global') ? [...allReportsMaster] : (viewId === 'my_data' ? allReportsMaster.filter(r => r.user === currentUserId) : allReportsMaster.filter(r => r.user === viewId));

    const monthlyAuditsMap = new Map();
    const yearlyCodes = new Set();
    filteredReports.forEach(record => {
        if (!record.expand?.bayi) return;
        const storeCode = record.expand.bayi.bayiKodu;
        const reportDate = new Date(record.denetimTamamlanmaTarihi);
        yearlyCodes.add(storeCode);
        if (reportDate.getMonth() === currentMonth && reportDate.getFullYear() === currentYear && !geriAlinanBayiKodlariAy.has(storeCode)) {
            if (!monthlyAuditsMap.has(storeCode)) monthlyAuditsMap.set(storeCode, { code: storeCode, timestamp: reportDate.getTime() });
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

function calculateAndDisplayDashboard() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    
    const allWorkDays = getWorkDaysOfMonth(year, month);
    let currentMonthLeaves = 0;
    allWorkDays.forEach(d => { if (leaveDataBulut[`${year}-${month}-${d}`]) currentMonthLeaves++; });
    
    const baseTarget = globalAylikHedef || 47;
    const dailyAverage = baseTarget / allWorkDays.length;
    const adjustedTarget = Math.max(0, baseTarget - Math.round(dailyAverage * currentMonthLeaves));

    let displayTarget, displayAudited;
    if (currentViewMode === 'monthly') {
        displayTarget = adjustedTarget;
        displayAudited = auditedStoreCodesCurrentMonth.length;
        document.getElementById('work-days-card').style.display = 'block';
        document.getElementById('today-required-card').style.display = 'block';
        document.getElementById('today-required-count').textContent = calculateTodayRequirement(allWorkDays, year, month);
    } else {
        displayTarget = allStores.length;
        displayAudited = auditedStoreCodesCurrentYear.length;
        document.getElementById('work-days-card').style.display = 'none';
        document.getElementById('today-required-card').style.display = 'none';
    }

    document.getElementById('dashboard-title').innerHTML = `<i class="fas fa-${currentViewMode === 'monthly' ? 'calendar-day' : 'calendar-alt'}"></i> ${year} ${monthNames[month]} Performansı`;
    document.getElementById('total-stores-count').textContent = displayTarget;
    document.getElementById('audited-stores-count').textContent = displayAudited;
    document.getElementById('remaining-stores-count').textContent = Math.max(0, displayTarget - displayAudited);
    document.getElementById('work-days-count').textContent = getRemainingWorkdays();
    
    renderAuditedStores(); 
    document.getElementById('dashboard-content').style.display = 'block';
}

function calculateTodayRequirement(allWorkDays, year, month) {
    const today = new Date();
    const day = today.getDate();
    if (today.getDay() === 0 || today.getDay() === 6 || leaveDataBulut[`${year}-${month}-${day}`]) return 0;

    const activeWorkDays = [];
    allWorkDays.forEach(d => { if (!leaveDataBulut[`${year}-${month}-${d}`]) activeWorkDays.push(d); });

    const baseTarget = globalAylikHedef || 47;
    const currentTarget = Math.max(0, baseTarget - Math.round((baseTarget / allWorkDays.length) * (allWorkDays.length - activeWorkDays.length)));
    const basePerDay = Math.floor(currentTarget / activeWorkDays.length);
    const extras = currentTarget % activeWorkDays.length;

    const monthSeed = year + month + (currentTarget * 100);
    const shuffled = seededShuffle([...activeWorkDays], monthSeed);
    
    const dayIdx = shuffled.indexOf(day);
    if (dayIdx === -1) return 0;
    
    const planned = basePerDay + (dayIdx < extras ? 1 : 0);
    const completedToday = auditedStoreCodesCurrentMonth.filter(a => new Date(a.timestamp).getDate() === day).length;
    return Math.max(0, planned - completedToday);
}

function seededShuffle(array, seed) {
    let currentSeed = seed;
    const random = () => { const x = Math.sin(currentSeed++) * 10000; return x - Math.floor(x); };
    for (let i = array.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [array[i], array[j]] = [array[j], array[i]]; }
    return array;
}

function getWorkDaysOfMonth(year, month) {
    const days = []; const date = new Date(year, month, 1);
    while(date.getMonth() === month) { if(date.getDay() !== 0 && date.getDay() !== 6) days.push(date.getDate()); date.setDate(date.getDate() + 1); }
    return days;
}

function setupModuleEventListeners(userRole) {
    if (document.body.dataset.denetimTakipListenersAttached) return;
    document.body.dataset.denetimTakipListenersAttached = 'true';

    if (userRole === 'admin') {
        document.getElementById('admin-user-filter').onchange = (e) => applyDataFilterAndRunDashboard(e.target.value);
    }

    const modeButtons = document.querySelectorAll('#view-mode-toggle button');
    modeButtons.forEach(btn => {
        btn.onclick = (e) => {
            modeButtons.forEach(b => { b.classList.remove('btn-primary', 'active'); b.classList.add('btn-light'); });
            e.target.classList.replace('btn-light', 'btn-primary');
            e.target.classList.add('active');
            currentViewMode = e.target.dataset.mode;
            calculateAndDisplayDashboard();
        };
    });

    ['bolge-filter', 'yonetmen-filter', 'sehir-filter', 'ilce-filter'].forEach(id => {
        document.getElementById(id).onchange = applyAndRepopulateFilters;
    });

    document.getElementById('local-city-filter').onchange = (e) => {
        localCityFilterValue = e.target.value;
        renderRemainingStores(currentGlobalFilteredStores); 
    };
}

function updateAllFilterOptions() {
    const filters = {'bolge-filter': 'bolge', 'yonetmen-filter': 'yonetmen', 'sehir-filter': 'sehir', 'ilce-filter': 'ilce'};
    Object.keys(filters).forEach(id => {
        const sel = document.getElementById(id);
        const field = filters[id];
        const prev = sel.value;
        const available = allStores.filter(s => Object.keys(filters).every(fId => fId === id || document.getElementById(fId).value === 'Tümü' || s[filters[fId]] === document.getElementById(fId).value));
        const vals = [...new Set(available.map(s => s[field]))].filter(Boolean).sort((a,b) => a.localeCompare(b, 'tr'));
        sel.innerHTML = '<option value="Tümü">Tümü</option>' + vals.map(v => `<option value="${v}">${v}</option>`).join('');
        sel.value = vals.includes(prev) ? prev : 'Tümü';
    });
}

function applyAndRepopulateFilters() {
    const sel = { bolge: document.getElementById('bolge-filter').value, yonetmen: document.getElementById('yonetmen-filter').value, sehir: document.getElementById('sehir-filter').value, ilce: document.getElementById('ilce-filter').value };
    currentGlobalFilteredStores = allStores.filter(s => (sel.bolge === 'Tümü' || s.bolge === sel.bolge) && (sel.yonetmen === 'Tümü' || s.yonetmen === sel.yonetmen) && (sel.sehir === 'Tümü' || s.sehir === sel.sehir) && (sel.ilce === 'Tümü' || s.ilce === sel.ilce));
    updateAllFilterOptions();
    renderRemainingStores(currentGlobalFilteredStores); 
}

function renderRemainingStores(filtered) {
    const cont = document.getElementById('denetlenecek-bayiler-container');
    const audited = (currentViewMode === 'monthly') ? auditedStoreCodesCurrentMonth.map(a => a.code) : auditedStoreCodesCurrentYear;
    const rem = filtered.filter(s => !audited.includes(s.bayiKodu));
    cont.innerHTML = rem.length ? '' : '<p class="empty-list-message">Kayıt yok.</p>';
    if (!rem.length) return;

    const lSel = document.getElementById('local-city-filter');
    const cities = [...new Set(rem.map(s => s.sehir))].sort((a,b) => a.localeCompare(b, 'tr'));
    lSel.innerHTML = '<option value="Tümü">Tüm Şehirler</option>' + cities.map(c => `<option value="${c}">${c}</option>`).join('');
    lSel.value = cities.includes(localCityFilterValue) ? localCityFilterValue : 'Tümü';

    const show = localCityFilterValue === 'Tümü' ? rem : rem.filter(s => s.sehir === localCityFilterValue);
    const byReg = show.reduce((acc, s) => { const r = s.bolge || 'Bölgesiz'; (acc[r] = acc[r] || []).push(s); return acc; }, {});

    Object.keys(byReg).sort().forEach(r => {
        const total = allStores.filter(s => (s.bolge || 'Bölgesiz') === r).length;
        const done = allStores.filter(s => (s.bolge || 'Bölgesiz') === r && audited.includes(s.bayiKodu)).length;
        const prog = total > 0 ? (done / total * 100) : 0;
        cont.innerHTML += `<div class="region-container"><div class="region-header"><span>${r} (${done}/${total})</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width: ${prog}%;">${prog.toFixed(0)}%</div></div><ul class="store-list">${byReg[r].map(s => `<li class="store-list-item">${s.bayiAdi} (${s.bayiKodu}) - ${s.sehir}/${s.ilce}</li>`).join('')}</ul></div>`;
    });
}

function renderAuditedStores() {
    const cont = document.getElementById('denetlenen-bayiler-container');
    const data = (currentViewMode === 'monthly') ? auditedStoreCodesCurrentMonth : auditedStoreCodesCurrentYear.map(c => ({code: c, timestamp: 0}));
    if (!data.length) { cont.innerHTML = '<p class="empty-list-message">Kayıt yok.</p>'; return; }
    const details = data.map(a => ({...(allStoresMaster.find(s => s.bayiKodu === a.code) || {bayiAdi: 'Bilinmeyen'}), timestamp: a.timestamp})).sort((a,b) => b.timestamp - a.timestamp);
    cont.innerHTML = '<ul class="store-list">' + details.map(s => `<li class="store-list-item completed-item"><span>${s.bayiAdi} (${s.bayiKodu})</span>${(currentUserRole === 'admin' && currentViewMode === 'monthly') ? `<button class="btn-warning btn-sm" onclick="revertAudit('${s.bayiKodu}')"><i class="fas fa-undo"></i> Geri Al</button>` : ''}</li>`).join('') + '</ul>';
}

function getRemainingWorkdays() {
    const today = new Date(); const last = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    let rem = 0; for (let d = today.getDate(); d <= last; d++) { if ([1,2,3,4,5].includes(new Date(today.getFullYear(), today.getMonth(), d).getDay())) rem++; }
    return rem;
}

window.revertAudit = async (code) => {
    const s = allStoresMaster.find(x => x.bayiKodu === code);
    if (!confirm("Geri almak istiyor musunuz?")) return;
    try {
        await pbInstance.collection('denetim_geri_alinanlar').create({yil_ay: `${new Date().getFullYear()}-${new Date().getMonth()}`, bayi: s.id});
        await loadMasterData();
        applyDataFilterAndRunDashboard(document.getElementById('admin-user-filter').value || 'my_data');
    } catch (e) { }
};