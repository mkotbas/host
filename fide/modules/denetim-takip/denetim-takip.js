let allStoresMaster = [];
let allReportsMaster = [];
let allGeriAlinanMaster = [];
let allUsers = []; 
let allStores = [];
let auditedStoreCodesCurrentMonth = [];
let auditedStoreCodesCurrentYear = [];
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

    try {
        if (pbInstance && pbInstance.authStore.isValid) {
            currentUserRole = pbInstance.authStore.model.role;
            currentUserId = pbInstance.authStore.model.id;

            setupModuleEventListeners(currentUserRole);
            await loadSettings(); 
            await loadMasterData();

            if (currentUserRole === 'admin') {
                const selector = document.getElementById('admin-user-selector-container');
                if (selector) selector.style.display = 'block';
                await populateUserFilterDropdown();
            }

            applyDataFilterAndRunDashboard('my_data');
        } else {
            const uploadArea = document.getElementById('upload-area');
            if (uploadArea) uploadArea.innerHTML = '<p style="text-align: center; color: var(--danger);">Lütfen sisteme giriş yapın.</p>';
        }
    } catch (error) {
        console.error("Denetim Takip başlatılırken hata oluştu:", error);
    } finally {
        if (loadingOverlay) loadingOverlay.style.display = 'none';
    }
}

async function loadSettings() {
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        globalAylikHedef = record.deger || 0;
    } catch (e) { globalAylikHedef = 0; }
    
    const input = document.getElementById('monthly-target-input');
    if (input) input.value = globalAylikHedef || '';
}

async function loadMasterData() {
    try {
        allStoresMaster = await pbInstance.collection('bayiler').getFullList({ sort: 'bayiAdi' });
        const today = new Date();
        const firstDayOfYear = new Date(today.getFullYear(), 0, 1).toISOString();
        allReportsMaster = await pbInstance.collection('denetim_raporlari').getFullList({
            filter: `denetimTamamlanmaTarihi != null && denetimTamamlanmaTarihi >= "${firstDayOfYear}"`,
            expand: 'bayi',
            sort: '-denetimTamamlanmaTarihi'
        });
        if (currentUserRole === 'admin') {
            allGeriAlinanMaster = await pbInstance.collection('denetim_geri_alinanlar').getFullList({
                filter: `yil_ay ~ "${today.getFullYear()}-"`, expand: 'bayi'
            });
        }
        if (allStoresMaster.length > 0) {
            document.getElementById('upload-area').style.display = 'none';
            document.getElementById('loaded-data-area').style.display = 'block';
        }
    } catch (e) { console.error("Veri yükleme hatası:", e); }
}

async function populateUserFilterDropdown() {
    try {
        allUsers = await pbInstance.collection('users').getFullList({ sort: 'name' });
        const select = document.getElementById('admin-user-filter');
        if (!select) return;
        select.innerHTML = `<option value="my_data">Benim Verilerim</option><option value="global">Genel Bakış</option>`;
        allUsers.forEach(u => { if(u.id !== currentUserId) select.innerHTML += `<option value="${u.id}">${u.name || u.email}</option>`; });
    } catch (e) {}
}

function applyDataFilterAndRunDashboard(viewId) {
    const today = new Date();
    const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

    if (currentUserRole === 'admin') {
        if (viewId === 'global') allStores = [...allStoresMaster];
        else if (viewId === 'my_data') allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === currentUserId);
        else allStores = allStoresMaster.filter(s => s.sorumlu_kullanici === viewId);
    } else {
        allStores = [...allStoresMaster];
    }

    const geriAlinanYil = new Set(allGeriAlinanMaster.map(r => r.expand?.bayi?.bayiKodu).filter(Boolean));
    const geriAlinanAy = new Set(allGeriAlinanMaster.filter(r => r.yil_ay === currentMonthKey).map(r => r.expand?.bayi?.bayiKodu).filter(Boolean));

    let reports = (currentUserRole === 'admin') ? 
        (viewId === 'global' ? allReportsMaster : allReportsMaster.filter(r => (viewId === 'my_data' ? r.user === currentUserId : r.user === viewId))) : 
        [...allReportsMaster];

    const monthlyMap = new Map();
    const yearlySet = new Set();
    reports.forEach(r => {
        const code = r.expand?.bayi?.bayiKodu;
        if (!code) return;
        const d = new Date(r.denetimTamamlanmaTarihi);
        if (!geriAlinanYil.has(code)) yearlySet.add(code);
        if (d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear() && !geriAlinanAy.has(code)) {
            if (!monthlyMap.has(code)) monthlyMap.set(code, { code: code, timestamp: d.getTime() });
        }
    });
    
    auditedStoreCodesCurrentMonth = Array.from(monthlyMap.values());
    auditedStoreCodesCurrentYear = Array.from(yearlySet);
    aylikHedef = globalAylikHedef; 
    runDashboard();
}

function runDashboard() {
    calculateAndDisplayDashboard();
    updateAllFilterOptions(); 
    applyAndRepopulateFilters(); 
}

function setupModuleEventListeners(role) {
    if (document.body.dataset.denetimTakipListenersAttached) return;
    document.body.dataset.denetimTakipListenersAttached = 'true';

    const adminBtn = document.getElementById('open-admin-panel-btn');
    if (role === 'admin') {
        adminBtn.onclick = () => document.getElementById('admin-panel-overlay').style.display = 'flex';
        document.getElementById('close-admin-panel-btn').onclick = () => document.getElementById('admin-panel-overlay').style.display = 'none';
        document.getElementById('save-settings-btn').onclick = saveSettings;
        document.getElementById('admin-user-filter').onchange = (e) => applyDataFilterAndRunDashboard(e.target.value);
    } else if(adminBtn) adminBtn.style.display = 'none';

    document.querySelectorAll('#view-mode-toggle button').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('#view-mode-toggle button').forEach(b => { b.classList.replace('btn-primary', 'btn-light'); b.classList.remove('active'); });
            e.target.classList.replace('btn-light', 'btn-primary'); e.target.classList.add('active');
            currentViewMode = e.target.dataset.mode;
            calculateAndDisplayDashboard(); applyAndRepopulateFilters();
        };
    });

    ['bolge-filter', 'yonetmen-filter', 'sehir-filter', 'ilce-filter'].forEach(id => {
        document.getElementById(id).onchange = applyAndRepopulateFilters;
    });
    document.getElementById('local-city-filter').onchange = (e) => { localCityFilterValue = e.target.value; renderRemainingStores(currentGlobalFilteredStores); };
}

async function saveSettings() {
    const val = parseInt(document.getElementById('monthly-target-input').value);
    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="aylikHedef"');
        await pbInstance.collection('ayarlar').update(record.id, { deger: val });
    } catch (e) { await pbInstance.collection('ayarlar').create({ anahtar: 'aylikHedef', deger: val }); }
    location.reload();
}

function calculateAndDisplayDashboard() {
    const count = allStores.length;
    const isM = currentViewMode === 'monthly';
    const target = isM ? aylikHedef : count;
    const audited = isM ? auditedStoreCodesCurrentMonth.length : auditedStoreCodesCurrentYear.length;
    
    document.getElementById('dashboard-title').innerHTML = `<i class="fas fa-${isM?'calendar-day':'calendar-alt'}"></i> ${isM?'Aylık':'Yıllık'} Performans`;
    document.getElementById('target-label').textContent = isM ? "Aylık Hedef" : "Toplam Bayi";
    document.getElementById('audited-label').textContent = isM ? "Bu Ay Denetlenen" : "Yıl Boyu Denetlenen";
    document.getElementById('remaining-label').textContent = isM ? "Aylık Kalan" : "Yıllık Kalan";
    document.getElementById('audited-list-title').innerHTML = `<i class="fas fa-check-double"></i> ${isM?'Bu Ay':'Bu Yıl'} Denetlenenler`;
    
    document.getElementById('total-stores-count').textContent = target;
    document.getElementById('audited-stores-count').textContent = audited;
    document.getElementById('remaining-stores-count').textContent = Math.max(0, target - audited);
    document.getElementById('work-days-card').style.display = isM ? 'block' : 'none';
    document.getElementById('work-days-count').textContent = getRemainingWorkdays();

    const progress = count > 0 ? (auditedStoreCodesCurrentYear.length / count * 100) : 0;
    document.getElementById('annual-performance-indicator').innerHTML = `
        <div class="annual-header"><span>Yıllık İlerleme</span><b>${auditedStoreCodesCurrentYear.length}/${count}</b></div>
        <div class="progress-bar"><div class="progress-bar-fill" style="width: ${progress}%">${progress.toFixed(0)}%</div></div>`;
    renderAuditedStores();
    document.getElementById('dashboard-content').style.display = 'block';
}

function updateAllFilterOptions() {
    const fMap = { 'bolge-filter': 'bolge', 'yonetmen-filter': 'yonetmen', 'sehir-filter': 'sehir', 'ilce-filter': 'ilce' };
    Object.keys(fMap).forEach(id => {
        const sel = document.getElementById(id);
        const prev = sel.value;
        const other = {};
        Object.keys(fMap).forEach(k => { if(k!==id) other[fMap[k]] = document.getElementById(k).value; });
        const avail = allStores.filter(s => Object.keys(other).every(f => other[f] === 'Tümü' || s[f] === other[f]));
        const vals = [...new Set(avail.map(s => s[fMap[id]]))].filter(Boolean).sort();
        sel.innerHTML = '<option value="Tümü">Tümü</option>';
        vals.forEach(v => sel.innerHTML += `<option value="${v}">${v}</option>`);
        sel.value = vals.includes(prev) ? prev : 'Tümü';
    });
}

function applyAndRepopulateFilters() {
    const s = { b: document.getElementById('bolge-filter').value, y: document.getElementById('yonetmen-filter').value, s: document.getElementById('sehir-filter').value, i: document.getElementById('ilce-filter').value };
    currentGlobalFilteredStores = allStores.filter(st => (s.b === 'Tümü' || st.bolge === s.b) && (s.y === 'Tümü' || st.yonetmen === s.y) && (s.s === 'Tümü' || st.sehir === s.s) && (s.i === 'Tümü' || st.ilce === s.i));
    updateAllFilterOptions(); renderRemainingStores(currentGlobalFilteredStores);
}

function renderRemainingStores(data) {
    const container = document.getElementById('denetlenecek-bayiler-container');
    container.innerHTML = '';
    const audited = (currentViewMode === 'monthly') ? auditedStoreCodesCurrentMonth.map(a => a.code) : auditedStoreCodesCurrentYear;
    const remaining = data.filter(st => !audited.includes(st.bayiKodu));
    
    if (remaining.length === 0) { container.innerHTML = '<p class="empty-list-message">Kayıt yok.</p>'; return; }
    
    const cities = [...new Set(remaining.map(st => st.sehir))].sort();
    const citySel = document.getElementById('local-city-filter');
    citySel.innerHTML = '<option value="Tümü">Tümü</option>';
    cities.forEach(c => citySel.innerHTML += `<option value="${c}">${c}</option>`);
    citySel.value = cities.includes(localCityFilterValue) ? localCityFilterValue : 'Tümü';
    localCityFilterValue = citySel.value;
    
    const show = localCityFilterValue === 'Tümü' ? remaining : remaining.filter(st => st.sehir === localCityFilterValue);
    const byRegion = show.reduce((acc, st) => { const r = st.bolge || 'Bölgesiz'; (acc[r] = acc[r] || []).push(st); return acc; }, {});
    
    Object.keys(byRegion).sort().forEach(r => {
        const total = allStores.filter(st => (st.bolge || 'Bölgesiz') === r).length;
        const aud = allStores.filter(st => (st.bolge || 'Bölgesiz') === r && audited.includes(st.bayiKodu)).length;
        const p = total > 0 ? (aud/total*100) : 0;
        let html = `<div class="region-container"><div class="region-header">${r} (${aud}/${total})</div><div class="progress-bar"><div class="progress-bar-fill" style="width: ${p}%">${p.toFixed(0)}%</div></div><ul class="store-list">`;
        byRegion[r].forEach(st => html += `<li class="store-list-item">${st.bayiAdi} (${st.bayiKodu})</li>`);
        container.innerHTML += html + '</ul></div>';
    });
}

function renderAuditedStores() {
    const container = document.getElementById('denetlenen-bayiler-container');
    const data = (currentViewMode === 'monthly') ? auditedStoreCodesCurrentMonth : auditedStoreCodesCurrentYear.map(c => ({ code: c, timestamp: 0 }));
    if (data.length === 0) { container.innerHTML = '<p class="empty-list-message">Kayıt yok.</p>'; return; }
    const details = data.map(a => ({ ...(allStoresMaster.find(s => s.bayiKodu === a.code) || {bayiAdi: 'Bilinmeyen', bayiKodu: a.code}), timestamp: a.timestamp })).sort((a,b) => b.timestamp - a.timestamp);
    let html = '<ul class="store-list">';
    details.forEach(st => {
        const rev = (currentUserRole === 'admin' && currentViewMode === 'monthly') ? `<button class="btn-warning btn-sm" onclick="revertAudit('${st.bayiKodu}')">Geri Al</button>` : '';
        html += `<li class="store-list-item completed-item"><span>${st.bayiAdi}</span>${rev}</li>`;
    });
    container.innerHTML = html + '</ul>';
}

function getRemainingWorkdays() {
    const t = new Date(); const l = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
    let c = 0; for (let d = t.getDate(); d <= l; d++) { const day = new Date(t.getFullYear(), t.getMonth(), d).getDay(); if (day > 0 && day < 6) c++; }
    return c;
}

window.revertAudit = revertAudit;