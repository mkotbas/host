/* fide/modules/denetim-takip/denetim-takip.js */

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

// --- DİNAMİK HEDEF VE DAĞITIM SİSTEMİ ---

function getWorkDaysOfMonth(year, month) {
    const days = [];
    const date = new Date(year, month, 1);
    while(date.getMonth() === month) {
        const dayOfWeek = date.getDay(); 
        if(dayOfWeek !== 0 && dayOfWeek !== 6) days.push(date.getDate());
        date.setDate(date.getDate() + 1);
    }
    return days;
}

function seededShuffle(array, seed) {
    let currentSeed = seed;
    const random = () => {
        const x = Math.sin(currentSeed++) * 10000;
        return x - Math.floor(x);
    };
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

function calculateTodayRequirement() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const day = today.getDate();
    const todayStart = new Date(today.setHours(0,0,0,0)).getTime();

    if (today.getDay() === 0 || today.getDay() === 6 || leaveDataBulut[`${year}-${month}-${day}`]) return 0;

    const allWorkDays = getWorkDaysOfMonth(year, month);
    const activeWorkDays = allWorkDays.filter(d => !leaveDataBulut[`${year}-${month}-${d}`]);
    
    const baseTarget = globalAylikHedef || 47;
    const dailyAverage = baseTarget / allWorkDays.length;
    const monthlyAdjustedTarget = Math.max(0, baseTarget - Math.round(dailyAverage * (allWorkDays.length - activeWorkDays.length)));

    const completedBeforeToday = auditedStoreCodesCurrentMonth.filter(a => a.timestamp < todayStart).length;
    const remainingTargetTotal = Math.max(0, monthlyAdjustedTarget - completedBeforeToday);
    const remainingActiveDays = activeWorkDays.filter(d => d >= day);

    if (remainingActiveDays.length === 0) return 0;

    const basePerDay = Math.floor(remainingTargetTotal / remainingActiveDays.length);
    const extras = remainingTargetTotal % remainingActiveDays.length;

    const seed = year + month + remainingActiveDays.length + remainingTargetTotal;
    const shuffledRemaining = seededShuffle([...remainingActiveDays], seed);
    
    const dayIndex = shuffledRemaining.indexOf(day);
    let todayPlanned = 0;
    if (dayIndex !== -1) {
        todayPlanned = basePerDay + (dayIndex < extras ? 1 : 0);
    }

    const completedToday = auditedStoreCodesCurrentMonth.filter(a => a.timestamp >= todayStart).length;
    return Math.max(0, todayPlanned - completedToday);
}

// --- MODÜL BAŞLATMA VE VERİ YÖNETİMİ ---

export async function initializeDenetimTakipModule(pb) {
    pbInstance = pb;
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
    }
}

async function loadSettings() {
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        globalAylikHedef = record.deger || 0;
    } catch (e) { globalAylikHedef = 0; }
    try {
        const leaveRecord = await pbInstance.collection('ayarlar').getFirstListItem(`anahtar="leaveData_${currentUserId}"`);
        leaveDataBulut = leaveRecord.deger || {};
    } catch (e) { leaveDataBulut = {}; }
}

async function loadMasterData() {
    try {
        allStoresMaster = await pbInstance.collection('bayiler').getFullList({ sort: 'bayiAdi' });
        const firstDay = new Date(new Date().getFullYear(), 0, 1).toISOString();
        allReportsMaster = await pbInstance.collection('denetim_raporlari').getFullList({
            filter: `denetimTamamlanmaTarihi != null && denetimTamamlanmaTarihi >= "${firstDay}"`,
            expand: 'bayi', sort: '-denetimTamamlanmaTarihi'
        });
        allGeriAlinanMaster = await pbInstance.collection('denetim_geri_alinanlar').getFullList({
            filter: `yil_ay ~ "${new Date().getFullYear()}-"`, expand: 'bayi'
        });
    } catch (e) { console.error("Veri hatası:", e); }
}

async function populateUserFilterDropdown() {
    try {
        allUsers = await pbInstance.collection('users').getFullList({ sort: 'name' });
        const sel = document.getElementById('admin-user-filter');
        sel.innerHTML = `<option value="my_data">Benim Verilerim (Admin)</option><option value="global">Genel Bakış</option>`;
        allUsers.filter(u => u.id !== currentUserId).forEach(u => {
            sel.innerHTML += `<option value="${u.id}">${u.name || u.email}</option>`;
        });
    } catch (e) {}
}

function applyDataFilterAndRunDashboard(viewId) {
    const today = new Date();
    const curMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

    if (currentUserRole !== 'admin' || viewId === 'global') allStores = [...allStoresMaster];
    else allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === (viewId === 'my_data' ? currentUserId : viewId));

    const geriAlinanlar = new Set();
    allGeriAlinanMaster.forEach(r => { if(r.expand?.bayi && r.yil_ay === curMonthKey) geriAlinanlar.add(r.expand.bayi.bayiKodu); });

    let filteredReports = (currentUserRole !== 'admin' || viewId === 'global') ? [...allReportsMaster] : allReportsMaster.filter(r => r.user === (viewId === 'my_data' ? currentUserId : viewId));

    const monthlyMap = new Map();
    const yearlyCodes = new Set();
    filteredReports.forEach(r => {
        if (!r.expand?.bayi) return;
        const code = r.expand.bayi.bayiKodu;
        const d = new Date(r.denetimTamamlanmaTarihi);
        yearlyCodes.add(code);
        if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() && !geriAlinanlar.has(code)) {
            if (!monthlyMap.has(code)) monthlyMap.set(code, { code, timestamp: d.getTime() });
        }
    });
    auditedStoreCodesCurrentMonth = Array.from(monthlyMap.values());
    auditedStoreCodesCurrentYear = Array.from(yearlyCodes);
    runDashboard();
}

function runDashboard() {
    calculateAndDisplayDashboard();
    updateAllFilterOptions(); 
    applyAndRepopulateFilters(); 
}

function calculateAndDisplayDashboard() {
    const today = new Date();
    const allWorkDays = getWorkDaysOfMonth(today.getFullYear(), today.getMonth());
    let leaves = 0;
    allWorkDays.forEach(d => { if (leaveDataBulut[`${today.getFullYear()}-${today.getMonth()}-${d}`]) leaves++; });
    
    const base = globalAylikHedef || 47;
    const adjustedTarget = Math.max(0, base - Math.round((base / allWorkDays.length) * leaves));

    const target = currentViewMode === 'monthly' ? adjustedTarget : allStores.length;
    const audited = currentViewMode === 'monthly' ? auditedStoreCodesCurrentMonth.length : auditedStoreCodesCurrentYear.length;

    document.getElementById('dashboard-title').innerHTML = `<i class="fas fa-calendar-day"></i> ${today.getFullYear()} ${monthNames[today.getMonth()]} Performansı`;
    document.getElementById('total-stores-count').textContent = target;
    document.getElementById('audited-stores-count').textContent = audited;
    document.getElementById('remaining-stores-count').textContent = Math.max(0, target - audited);
    document.getElementById('work-days-count').textContent = getRemainingWorkdays();
    
    if (currentViewMode === 'monthly') {
        document.getElementById('work-days-card').style.display = 'block';
        document.getElementById('today-required-card').style.display = 'block';
        document.getElementById('today-required-count').textContent = calculateTodayRequirement();
    } else {
        document.getElementById('work-days-card').style.display = 'none';
        document.getElementById('today-required-card').style.display = 'none';
    }
    renderAuditedStores(); 
    document.getElementById('dashboard-content').style.display = 'block';
}

function setupModuleEventListeners(role) {
    window.addEventListener('calendarDataChanged', async (e) => { await loadSettings(); leaveDataBulut = e.detail; calculateAndDisplayDashboard(); });
    if (role === 'admin') document.getElementById('admin-user-filter').onchange = (e) => applyDataFilterAndRunDashboard(e.target.value);
    document.querySelectorAll('#view-mode-toggle button').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('#view-mode-toggle button').forEach(b => b.classList.remove('active', 'btn-primary'));
            e.target.classList.add('active', 'btn-primary');
            currentViewMode = e.target.dataset.mode;
            calculateAndDisplayDashboard();
        };
    });
    ['bolge-filter', 'yonetmen-filter', 'sehir-filter', 'ilce-filter'].forEach(id => {
        document.getElementById(id).onchange = applyAndRepopulateFilters;
    });
    document.getElementById('local-city-filter').onchange = (e) => { localCityFilterValue = e.target.value; renderRemainingStores(currentGlobalFilteredStores); };
}

function updateAllFilterOptions() {
    const filters = {'bolge-filter': 'bolge', 'yonetmen-filter': 'yonetmen', 'sehir-filter': 'sehir', 'ilce-filter': 'ilce'};
    Object.keys(filters).forEach(id => {
        const sel = document.getElementById(id);
        const prev = sel.value;
        const available = allStores.filter(s => Object.keys(filters).every(fId => {
            const fVal = document.getElementById(fId).value;
            return fId === id || fVal === 'Tümü' || s[filters[fId]] === fVal;
        }));
        const vals = [...new Set(available.map(s => s[filters[id]]))].filter(Boolean).sort((a,b) => a.localeCompare(b, 'tr'));
        sel.innerHTML = '<option value="Tümü">Tümü</option>' + vals.map(v => `<option value="${v}">${v}</option>`).join('');
        sel.value = vals.includes(prev) ? prev : 'Tümü';
    });
}

function applyAndRepopulateFilters() {
    const get = (id) => document.getElementById(id).value;
    const s = { b: get('bolge-filter'), y: get('yonetmen-filter'), h: get('sehir-filter'), i: get('ilce-filter') };
    currentGlobalFilteredStores = allStores.filter(st => (s.b === 'Tümü' || st.bolge === s.b) && (s.y === 'Tümü' || st.yonetmen === s.y) && (s.h === 'Tümü' || st.sehir === s.h) && (s.i === 'Tümü' || st.ilce === s.i));
    updateAllFilterOptions();
    renderRemainingStores(currentGlobalFilteredStores); 
}

function renderRemainingStores(f) {
    const cont = document.getElementById('denetlenecek-bayiler-container');
    const audited = (currentViewMode === 'monthly') ? auditedStoreCodesCurrentMonth.map(a => a.code) : auditedStoreCodesCurrentYear;
    const rem = f.filter(s => !audited.includes(s.bayiKodu));
    cont.innerHTML = rem.length ? '' : '<p class="empty-list-message">Kayıt yok.</p>';
    if (!rem.length) return;
    const cities = [...new Set(rem.map(s => s.sehir))].sort((a,b) => a.localeCompare(b, 'tr'));
    const lSel = document.getElementById('local-city-filter');
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
    const today = new Date();
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    let rem = 0; 
    for (let d = today.getDate(); d <= lastDay; d++) { 
        const date = new Date(today.getFullYear(), today.getMonth(), d);
        if ([1,2,3,4,5].includes(date.getDay()) && !leaveDataBulut[`${today.getFullYear()}-${today.getMonth()}-${d}`]) rem++;
    }
    return rem;
}

window.revertAudit = async (code) => {
    const s = allStoresMaster.find(x => x.bayiKodu === code);
    if (!confirm("Denetim kaydını geri almak istiyor musunuz?")) return;
    try {
        await pbInstance.collection('denetim_geri_alinanlar').create({yil_ay: `${new Date().getFullYear()}-${new Date().getMonth()}`, bayi: s.id});
        await loadMasterData();
        applyDataFilterAndRunDashboard(document.getElementById('admin-user-filter')?.value || 'my_data');
    } catch (e) {}
};