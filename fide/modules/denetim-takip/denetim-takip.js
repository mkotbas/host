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
            console.error("Aylık hedef ayarı yüklenemedi:", error);
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
        yearlyCodes.add(storeCode);
        if (reportDate.getMonth() === currentMonth && reportDate.getFullYear() === currentYear) {
            if (!monthlyAuditsMap.has(storeCode)) {
                monthlyAuditsMap.set(storeCode, { code: storeCode, timestamp: reportDate.getTime() });
            }
        }
    });
    
    auditedStoreCodesCurrentMonth = Array.from(monthlyAuditsMap.values())
        .filter(audit => !geriAlinanBayiKodlariAy.has(audit.code));
    auditedStoreCodesCurrentYear = Array.from(yearlyCodes)
        .filter(code => !geriAlinanBayiKodlariYil.has(code));

    aylikHedef = globalAylikHedef; 

    if (currentUserRole === 'admin') {
        if (viewId === 'global') {
            document.getElementById('reset-data-btn').disabled = false; 
        } else {
            document.getElementById('reset-data-btn').disabled = true; 
        }
    }

    localCityFilterValue = 'Tümü'; 
    const localFilter = document.getElementById('local-city-filter');
    if(localFilter) localFilter.value = 'Tümü';

    runDashboard();
}

function runDashboard() {
    calculateAndDisplayDashboard();
    // İlk yüklemede tüm filtreleri mevcut görünümdeki verilere göre doldur
    populateAllFilters(allStores); 
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
        document.getElementById('reset-data-btn').addEventListener('click', resetProgress);

        document.getElementById('admin-user-filter').addEventListener('change', (e) => {
            const selectedViewId = e.target.value;
            document.getElementById('loading-overlay').style.display = 'flex';
            applyDataFilterAndRunDashboard(selectedViewId);
            document.getElementById('loading-overlay').style.display = 'none';
        });
        
    } else {
        if (adminPanelBtn) adminPanelBtn.style.display = 'none';
        const resetBtn = document.getElementById('reset-data-btn');
        if (resetBtn) resetBtn.style.display = 'none';
    }

    // Filtre Değişim Dinleyicileri
    document.getElementById('bolge-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('yonetmen-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('sehir-filter').addEventListener('change', applyAndRepopulateFilters);
    document.getElementById('ilce-filter').addEventListener('change', applyAndRepopulateFilters);

    document.getElementById('local-city-filter').addEventListener('change', (e) => {
        localCityFilterValue = e.target.value;
        renderRemainingStores(currentGlobalFilteredStores); 
    });
}

async function resetProgress() {
    if (!pbInstance.authStore.isValid || currentUserRole !== 'admin') return alert("Bu işlem için yetkiniz bulunmamaktadır.");
    
    const currentView = document.getElementById('admin-user-filter').value;
    if (currentView !== 'global') {
        return alert("Yıllık sıfırlama işlemi sadece 'Genel Bakış (Tüm Sistem)' görünümündeyken yapılabilir.");
    }

    if (!confirm("Bu işlem, bu yıla ait TÜM denetim verilerini 'geri alınmış' olarak işaretleyecektir. Sayaçlar sıfırlanır. Onaylıyor musunuz?")) return;

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    try {
        if (allReportsMaster.length === 0) {
            alert("Bu yıl sıfırlanacak denetim kaydı bulunamadı.");
            loadingOverlay.style.display = 'none';
            return;
        }

        for (const report of allReportsMaster) {
            if (!report.bayi) continue; 

            const reportDate = new Date(report.denetimTamamlanmaTarihi);
            const reportMonthKey = `${reportDate.getFullYear()}-${reportDate.getMonth()}`;
            const data = { "yil_ay": reportMonthKey, "bayi": report.bayi };

            try {
                await pbInstance.collection('denetim_geri_alinanlar').getFirstListItem(`yil_ay="${reportMonthKey}" && bayi="${report.bayi}"`);
            } catch (error) {
                if (error.status === 404) {
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
    document.getElementById('remaining-stores-count').textContent = Math.max(0, remainingToTarget);
    
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
        const select = document.getElementById(filters[key] + '-filter');
        const uniqueValues = [...new Set(stores.map(s => s[filters[key]]))]
            .filter(v => v)
            .sort((a, b) => a.localeCompare(b, 'tr'));
        
        select.innerHTML = '<option value="Tümü">Tümü</option>';
        uniqueValues.forEach(value => { select.innerHTML += `<option value="${value}">${value}</option>`; });
    });
}

// --- HİYERARŞİK FİLTRELEME MANTIĞI ---
function applyAndRepopulateFilters(event) {
    const filterIds = ['bolge-filter', 'yonetmen-filter', 'sehir-filter', 'ilce-filter'];
    const changedId = event ? event.target.id : null;

    // Eğer üst seviye bir filtre değiştiyse, altındaki tüm filtreleri 'Tümü' yap (Hiyerarşik Sıfırlama)
    if (changedId) {
        const changedIndex = filterIds.indexOf(changedId);
        for (let i = changedIndex + 1; i < filterIds.length; i++) {
            document.getElementById(filterIds[i]).value = 'Tümü';
        }
    }

    const selected = {
        bolge: document.getElementById('bolge-filter').value,
        yonetmen: document.getElementById('yonetmen-filter').value,
        sehir: document.getElementById('sehir-filter').value,
        ilce: document.getElementById('ilce-filter').value
    };

    // Alt seviye dropdown seçeneklerini mevcut seçimlere göre daralt (Cascading)
    updateFilterOptions(selected);

    // Listeyi son filtrelenmiş haline göre süz
    currentGlobalFilteredStores = allStores.filter(s =>
        (selected.bolge === 'Tümü' || s.bolge === selected.bolge) &&
        (selected.yonetmen === 'Tümü' || s.yonetmen === selected.yonetmen) &&
        (selected.sehir === 'Tümü' || s.sehir === selected.sehir) &&
        (selected.ilce === 'Tümü' || s.ilce === selected.ilce)
    );
    
    renderRemainingStores(currentGlobalFilteredStores); 
}

function updateFilterOptions(selected) {
    // 1. Yönetmen listesi Bölge'ye bağlıdır
    const managersForRegion = selected.bolge === 'Tümü' ? allStores : allStores.filter(s => s.bolge === selected.bolge);
    populateSingleFilter('yonetmen-filter', managersForRegion, 'yonetmen', selected.yonetmen);

    // 2. Şehir listesi Bölge + Yönetmen'e bağlıdır
    const citiesForSelection = allStores.filter(s => 
        (selected.bolge === 'Tümü' || s.bolge === selected.bolge) &&
        (selected.yonetmen === 'Tümü' || s.yonetmen === selected.yonetmen)
    );
    populateSingleFilter('sehir-filter', citiesForSelection, 'sehir', selected.sehir);

    // 3. İlçe listesi Bölge + Yönetmen + Şehir'e bağlıdır
    const districtsForSelection = allStores.filter(s => 
        (selected.bolge === 'Tümü' || s.bolge === selected.bolge) &&
        (selected.yonetmen === 'Tümü' || s.yonetmen === selected.yonetmen) &&
        (selected.sehir === 'Tümü' || s.sehir === selected.sehir)
    );
    populateSingleFilter('ilce-filter', districtsForSelection, 'ilce', selected.ilce);
}

function populateSingleFilter(elementId, stores, key, currentValue) {
    const select = document.getElementById(elementId);
    const uniqueValues = [...new Set(stores.map(s => s[key]))]
        .filter(v => v)
        .sort((a, b) => a.localeCompare(b, 'tr'));

    const previousValue = select.value;
    select.innerHTML = '<option value="Tümü">Tümü</option>';
    uniqueValues.forEach(val => {
        const isSelected = val === currentValue ? 'selected' : '';
        select.innerHTML += `<option value="${val}" ${isSelected}>${val}</option>`;
    });

    // Eğer önceki seçili değer hala listede varsa onu koru, yoksa 'Tümü'ne çek
    if (uniqueValues.includes(previousValue)) {
        select.value = previousValue;
    } else if (currentValue !== 'Tümü' && uniqueValues.includes(currentValue)) {
        select.value = currentValue;
    } else {
        select.value = 'Tümü';
    }
}

function renderRemainingStores(filteredStores) {
    const container = document.getElementById('denetlenecek-bayiler-container');
    container.innerHTML = '';
    
    const auditedCodesThisMonth = auditedStoreCodesCurrentMonth.map(audit => audit.code);
    const allRemainingStores = filteredStores.filter(store => !auditedCodesThisMonth.includes(store.bayiKodu));

    if (allRemainingStores.length === 0) {
        const select = document.getElementById('local-city-filter');
        if(select) select.innerHTML = '<option value="Tümü">Şehir Yok</option>';
        container.innerHTML = `<p class="empty-list-message">Seçili kriterlere uygun, bu ay denetlenmemiş bayi bulunamadı.</p>`;
        return;
    }

    const select = document.getElementById('local-city-filter');
    const previousSelection = localCityFilterValue; 
    const uniqueCities = [...new Set(allRemainingStores.map(s => s.sehir))].sort((a, b) => a.localeCompare(b, 'tr'));
    
    select.innerHTML = '<option value="Tümü">Tüm Şehirler</option>';
    uniqueCities.forEach(city => { if (city) { select.innerHTML += `<option value="${city}">${city}</option>`; } });

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
        const auditedInRegion = allStores.filter(s => (s.bolge || 'Bölge Belirtilmemiş') === region && auditedCodesThisMonth.includes(s.bayiKodu)).length;
        const progress = totalInRegion > 0 ? (auditedInRegion / totalInRegion) * 100 : 0;
        
        let regionHtml = `<div class="region-container"><div class="region-header"><span>${region} (Bu Ay: ${auditedInRegion}/${totalInRegion})</span></div><div class="progress-bar"><div class="progress-bar-fill" style="width: ${progress.toFixed(2)}%;">${progress.toFixed(0)}%</div></div><ul class="store-list">`;
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
        container.innerHTML = '<p class="empty-list-message">Sistemde bu görünüm için bayi bulunamadı.</p>';
        return;
    }
    if (auditedStoreCodesCurrentMonth.length === 0) { 
        container.innerHTML = '<p class="empty-list-message">Bu ay bu görünüm için denetim yapılmadı veya yapılanlar geri alındı.</p>';
        return;
    }
    
    const auditedStoresDetails = auditedStoreCodesCurrentMonth
        .map(audit => {
            const storeFromMaster = allStoresMaster.find(store => store.bayiKodu === audit.code);
            return { ...(storeFromMaster || {bayiKodu: audit.code, bayiAdi: 'Bilinmeyen Bayi'}), timestamp: audit.timestamp };
        })
        .filter(store => store.bayiKodu) 
        .sort((a, b) => b.timestamp - a.timestamp);
    
    let listHtml = '<ul class="store-list">';
    auditedStoresDetails.forEach(store => {
        const revertButtonHtml = currentUserRole === 'admin'
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
    let remainingWorkdays = 0;
    
    if (today.getDate() > lastDayOfMonth) return 0;

    for (let day = today.getDate(); day <= lastDayOfMonth; day++) {
        const dayOfWeek = new Date(year, month, day).getDay();
        if (dayOfWeek > 0 && dayOfWeek < 6) {
            remainingWorkdays++;
        }
    }
    return remainingWorkdays;
}