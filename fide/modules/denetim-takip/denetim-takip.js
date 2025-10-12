// --- Global Değişkenler ---
// `pb` değişkeni, admin.js tarafından zaten tanımlanmıştır.
let allStores_DT = [];
let auditedReports_DT = [];
let geriAlinanlar_DT = {}; // { '2025-10': ['kod1', 'kod2'] }
let aylikHedef_DT = 0;
let ayarlarRecordId = null; // 'ayarlar' koleksiyonundaki kaydın ID'si

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeDenetimTakipModule() {
    showLoading(true);
    setupModuleEventListeners_DenetimTakip();
    await loadInitialData_DenetimTakip();
    runDashboard();
    showLoading(false);
}

// --- Veri Yükleme ---
async function loadInitialData_DenetimTakip() {
    try {
        // 1. Aylık hedefi 'ayarlar' koleksiyonundan yükle
        try {
            const ayarlarRecord = await pb.collection('ayarlar').getFirstListItem('');
            aylikHedef_DT = ayarlarRecord.aylikHedef || 0;
            ayarlarRecordId = ayarlarRecord.id;
        } catch (e) {
            if (e.status === 404) { // Henüz ayar kaydı yoksa
                console.warn("'ayarlar' kaydı bulunamadı. Varsayılanlar kullanılacak.");
                aylikHedef_DT = 0;
            } else { throw e; }
        }

        // 2. Geri alınan bayileri yükle
        const geriAlinanRecords = await pb.collection('denetimGeriAlinanlar').getFullList();
        geriAlinanlar_DT = geriAlinanRecords.reduce((acc, record) => {
            acc[record.donem] = record.geriAlinanKodlar || [];
            return acc;
        }, {});

        // 3. Tüm denetim raporlarını yükle
        auditedReports_DT = await pb.collection('allFideReports').getFullList({
            fields: 'bayiKodu, sonGuncelleme' // Sadece gerekli alanları çekerek performansı artır
        });

        // 4. Tüm bayiler listesini yükle
        const tumBayilerRecord = await pb.collection('tumBayilerListesi').getFirstListItem('');
        allStores_DT = tumBayilerRecord.bayiListesi || [];

    } catch (error) {
        console.error("Denetim Takip için başlangıç verileri yüklenemedi:", error);
        alert("Veriler yüklenirken bir hata oluştu. Lütfen PocketBase sunucunuzun çalıştığından emin olun.");
    }
}

// --- Olay Dinleyicileri ---
function setupModuleEventListeners_DenetimTakip() {
    if (document.body.dataset.denetimTakipListenersAttached) return;
    document.body.dataset.denetimTakipListenersAttached = 'true';
    document.getElementById('save-settings-btn').addEventListener('click', saveSettings);
}

// --- Ana Dashboard Mantığı ---
function runDashboard() {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    const currentPeriodKey = `${currentYear}-${currentMonth}`;

    const geriAlinanBuAy = geriAlinanlar_DT[currentPeriodKey] || [];

    // Bu ay içinde yapılmış denetimleri filtrele
    const auditedThisMonth = auditedReports_DT.filter(report => {
        const reportDate = new Date(report.sonGuncelleme);
        return reportDate.getFullYear() === currentYear && reportDate.getMonth() + 1 === currentMonth;
    }).map(report => ({
        code: report.bayiKodu,
        timestamp: new Date(report.sonGuncelleme).getTime()
    }));

    // Geri alınanları denetim listesinden çıkar
    const netAuditedThisMonth = auditedThisMonth.filter(audit => !geriAlinanBuAy.includes(audit.code));
    const netAuditedCount = netAuditedThisMonth.length;
    const remainingWorkdays = getRemainingWorkdays();
    const remainingAudits = Math.max(0, aylikHedef_DT - netAuditedCount);
    const dailyTarget = remainingWorkdays > 0 ? (remainingAudits / remainingWorkdays).toFixed(1) : 0;

    // Arayüzü güncelle
    document.getElementById('monthly-goal-input').value = aylikHedef_DT;
    document.getElementById('completed-audits').textContent = netAuditedCount;
    document.getElementById('remaining-audits').textContent = remainingAudits;
    document.getElementById('remaining-workdays').textContent = remainingWorkdays;
    document.getElementById('daily-average-needed').textContent = dailyTarget;

    renderAuditedList(netAuditedThisMonth);
}

// --- Arayüz Render Fonksiyonları ---
function renderAuditedList(auditedStores) {
    const container = document.getElementById('completed-list-container');
    if (!auditedStores || auditedStores.length === 0) {
        container.innerHTML = '<p class="empty-list-message">Bu ay henüz denetim yapılmadı.</p>';
        return;
    }

    const auditedStoresDetails = auditedStores
        .map(audit => {
            const storeDetails = allStores_DT.find(store => store.bayiKodu === audit.code);
            return storeDetails ? { ...storeDetails, timestamp: audit.timestamp } : null;
        })
        .filter(store => store !== null)
        .sort((a, b) => b.timestamp - a.timestamp); // En yeniden en eskiye sırala
    
    let listHtml = '<ul class="store-list">';
    auditedStoresDetails.forEach(store => {
        listHtml += `
            <li class="store-list-item completed-item">
                <span>${store.bayiAdi} (${store.bayiKodu}) - ${store.bolge}</span>
                <button class="btn-warning btn-sm" onclick="revertAudit('${store.bayiKodu}')" title="Bu denetimi listeden kaldır">
                    <i class="fas fa-undo"></i> Geri Al
                </button>
            </li>`;
    });
    listHtml += '</ul>';
    container.innerHTML = listHtml;
}


// --- Veri Kaydetme ve Güncelleme ---
async function saveSettings() {
    const newTarget = parseInt(document.getElementById('monthly-goal-input').value, 10);
    if (isNaN(newTarget) || newTarget < 0) {
        alert("Lütfen geçerli bir sayı girin.");
        return;
    }

    showLoading(true);
    try {
        const dataToSave = { aylikHedef: newTarget };

        if (ayarlarRecordId) {
            // Mevcut ayarlar kaydını güncelle
            await pb.collection('ayarlar').update(ayarlarRecordId, dataToSave);
        } else {
            // 'ayarlar' koleksiyonu boşsa, ilk kaydı oluştur
            const newRecord = await pb.collection('ayarlar').create(dataToSave);
            ayarlarRecordId = newRecord.id;
        }

        aylikHedef_DT = newTarget;
        alert("Aylık hedef başarıyla kaydedildi.");
        runDashboard(); // Yeni hedefe göre paneli yeniden hesapla
    } catch (error) {
        console.error("Aylık hedef kaydedilirken hata:", error);
        alert("Ayarlar kaydedilirken bir hata oluştu.");
    } finally {
        showLoading(false);
    }
}

async function revertAudit(bayiKodu) {
    if (!confirm(`'${bayiKodu}' kodlu bayinin bu ayki denetimini 'yapılmadı' olarak işaretlemek istediğinizden emin misiniz? Bu işlem, denetim raporunu silmez, sadece bu ayki sayaçtan düşürür.`)) {
        return;
    }

    showLoading(true);
    const today = new Date();
    const periodKey = `${today.getFullYear()}-${today.getMonth() + 1}`;

    try {
        let geriAlinanRecord;
        try {
             // O döneme ait kayıt var mı diye kontrol et
            geriAlinanRecord = await pb.collection('denetimGeriAlinanlar').getFirstListItem(`donem = "${periodKey}"`);
        } catch (e) {
            if (e.status !== 404) throw e;
        }

        if (geriAlinanRecord) {
            // Kayıt varsa, listeyi güncelle
            const updatedKodlar = [...new Set([...geriAlinanRecord.geriAlinanKodlar, bayiKodu])];
            await pb.collection('denetimGeriAlinanlar').update(geriAlinanRecord.id, { geriAlinanKodlar: updatedKodlar });
        } else {
            // Kayıt yoksa, yeni kayıt oluştur
            await pb.collection('denetimGeriAlinanlar').create({ donem: periodKey, geriAlinanKodlar: [bayiKodu] });
        }

        alert("Denetim başarıyla geri alındı.");
        
        // Verileri ve arayüzü yenile
        await loadInitialData_DenetimTakip();
        runDashboard();

    } catch (error) {
        console.error("Denetim geri alınırken hata:", error);
        alert("İşlem sırasında bir hata oluştu.");
    } finally {
        showLoading(false);
    }
}

// --- Yardımcı Fonksiyonlar ---
function getRemainingWorkdays() {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
    let remainingWorkdays = 0;

    if (today.getDate() > lastDayOfMonth) return 0;

    for (let day = today.getDate(); day <= lastDayOfMonth; day++) {
        const currentDate = new Date(year, month, day);
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // 0: Pazar, 6: Cumartesi
            remainingWorkdays++;
        }
    }
    return remainingWorkdays;
}