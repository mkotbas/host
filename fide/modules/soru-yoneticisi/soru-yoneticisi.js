// --- Global Değişkenler ---
let fideQuestions = [], productList = [], migrationMap = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
let currentManagerView = 'active'; 

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeSoruYoneticisiModule() {
    await loadInitialData();
    setupModuleEventListeners();
    renderQuestionManager();
}

async function loadMigrationMap() {
    const user = auth.currentUser;
    migrationMap = {}; 

    if (user && database) {
        try {
            const migrationRef = database.ref('migrationSettings/map');
            const snapshot = await migrationRef.once('value');
            if (snapshot.exists()) {
                migrationMap = snapshot.val();
            }
        } catch (error) {
            console.error("Buluttan veri taşıma ayarları yüklenemedi:", error);
        }
    }
}

// --- TEŞHİS İÇİN GÜNCELLENEN FONKSİYON ---
async function loadInitialData() {
    await loadMigrationMap();
    let questionsLoaded = false;
    alert("1. Adım: Soru verileri buluttan çekilmeye başlanıyor...");

    if (auth.currentUser && database) {
        try {
            const questionsRef = database.ref('fideQuestionsData');
            const snapshot = await questionsRef.once('value');
            if (snapshot.exists()) {
                const cloudData = snapshot.val();
                if (cloudData && Array.isArray(cloudData.questions)) {
                    fideQuestions = cloudData.questions;
                    productList = cloudData.productList || [];
                    questionsLoaded = true;
                    alert(`2. Adım: Başarılı! Bulutta veri bulundu ve içinde ${fideQuestions.length} adet soru mevcut.`);
                } else {
                    alert("2. Adım: HATA! Bulutta 'fideQuestionsData' bulundu ancak içinde beklenen formatta ('questions' listesi) veri yok.");
                    fideQuestions = [];
                }
            } else {
                 alert("2. Adım: HATA! Bulutta 'fideQuestionsData' yolu bulunamadı. Veritabanı boş veya yol yanlış olabilir.");
                 fideQuestions = [];
            }
        } catch (error) {
            console.error("Firebase'den soru verisi okunurken hata oluştu:", error);
            alert(`2. Adım: KRİTİK HATA! Firebase'den veri okunurken bir hata oluştu: ${error.message}`);
            fideQuestions = [];
        }
    } else {
        alert("Bulut bağlantısı veya kullanıcı girişi olmadığı için soru verileri çekilemedi.");
        fideQuestions = [];
    }
}

// ... (Geri kalan tüm fonksiyonlar bir önceki cevapta olduğu gibi aynı kalacak) ...
// Bu fonksiyonların hepsini tekrar ekliyorum ki eksik bir şey kalmasın.

function setupModuleEventListeners() {
    if (document.body.dataset.soruYoneticisiListenersAttached) return;
    document.body.dataset.soruYoneticisiListenersAttached = 'true';
    document.getElementById('view-active-btn').addEventListener('click', () => { currentManagerView = 'active'; filterManagerView(); });
    document.getElementById('view-archived-btn').addEventListener('click', () => { currentManagerView = 'archived'; filterManagerView(); });
    document.getElementById('add-new-question-btn').addEventListener('click', addNewQuestionUI);
    document.getElementById('save-questions-btn').addEventListener('click', saveQuestions);
    document.getElementById('delete-all-archived-btn').addEventListener('click', deleteAllArchivedQuestions);
    document.getElementById('restore-all-archived-btn').addEventListener('click', restoreAllArchivedQuestions);
    document.getElementById('unlock-ids-btn').addEventListener('click', () => {
        const dogruSifreHash = 'ZmRlMDAx';
        const girilenSifre = prompt("ID alanlarını düzenlemeye açmak için lütfen yönetici şifresini tekrar girin:");
        if (girilenSifre) {
            const girilenSifreHash = btoa(girilenSifre);
            if (girilenSifreHash === dogruSifreHash) {
                document.querySelectorAll('.manager-id-input').forEach(input => { input.disabled = false; });
                const unlockBtn = document.getElementById('unlock-ids-btn');
                unlockBtn.disabled = true;
                unlockBtn.innerHTML = '<i class="fas fa-lock-open"></i> ID Alanları Düzenlenebilir';
                alert('Soru ID alanları artık düzenlenebilir.');
            } else { alert('Hatalı şifre!'); }
        }
    });
    document.getElementById('open-migration-manager-from-scenario-btn').addEventListener('click', () => {
        document.getElementById('scenario-system-overlay').style.display = 'none';
        renderMigrationManagerUI();
        document.getElementById('migration-manager-overlay').style.display = 'flex';
    });
    document.getElementById('close-migration-manager-btn').addEventListener('click', () => { document.getElementById('migration-manager-overlay').style.display = 'none'; });
    document.getElementById('open-scenario-system-btn').addEventListener('click', openScenarioSystem);
    document.getElementById('close-scenario-system-btn').addEventListener('click', closeScenarioSystem);
    document.querySelectorAll('.scenario-btn').forEach(btn => { btn.addEventListener('click', (e) => selectScenario(e.currentTarget.dataset.scenario)); });
    document.getElementById('apply-id-change-btn').addEventListener('click', applyIdChangeScenario);
    document.getElementById('scenario-delete-id').addEventListener('input', previewQuestionForDelete);
    document.getElementById('apply-delete-question-btn').addEventListener('click', applyDeleteQuestionScenario);
}
function openScenarioSystem() {
    document.getElementById('scenario-system-overlay').style.display = 'flex';
    document.querySelector('.scenario-selection').style.display = 'flex';
    document.querySelectorAll('.scenario-form').forEach(form => form.style.display = 'none');
    document.getElementById('scenario-old-id').value = '';
    document.getElementById('scenario-new-id').value = '';
    document.getElementById('scenario-delete-id').value = '';
    previewQuestionForDelete();
}
function closeScenarioSystem() { document.getElementById('scenario-system-overlay').style.display = 'none'; }
function selectScenario(scenario) {
    document.querySelector('.scenario-selection').style.display = 'none';
    if (scenario === 'id-change') { document.getElementById('scenario-id-change-form').style.display = 'block'; } 
    else if (scenario === 'delete-question') { document.getElementById('scenario-delete-question-form').style.display = 'block'; }
}
async function migrateQuestionData(oldId, newId) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        if (!auth.currentUser || !database) { return false; }
        const reportsRef = database.ref('allFideReports');
        const snapshot = await reportsRef.once('value');
        if (snapshot.exists()) {
            let allCloudReports = snapshot.val();
            let updates = {};
            for (const storeKey in allCloudReports) {
                const report = allCloudReports[storeKey]?.data?.questions_status;
                if (report && report[oldId]) {
                    updates[`${storeKey}/data/questions_status/${newId}`] = report[oldId];
                    updates[`${storeKey}/data/questions_status/${oldId}`] = null;
                }
            }
            if (Object.keys(updates).length > 0) await reportsRef.update(updates);
        }
        return true;
    } catch (error) { console.error("Veri taşıma sırasında bir hata oluştu:", error); return false; } 
    finally { loadingOverlay.style.display = 'none'; }
}
async function swapQuestionData(idA, idB) {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    try {
        if (!auth.currentUser || !database) { return false; }
        const reportsRef = database.ref('allFideReports');
        const snapshot = await reportsRef.once('value');
        if (snapshot.exists()) {
            let allCloudReports = snapshot.val();
            let updates = {};
            for (const storeKey in allCloudReports) {
                const report = allCloudReports[storeKey]?.data?.questions_status;
                if (report) {
                    const answerA = report[idA];
                    const answerB = report[idB];
                    updates[`${storeKey}/data/questions_status/${idA}`] = answerB || null;
                    updates[`${storeKey}/data/questions_status/${idB}`] = answerA || null;
                }
            }
            if (Object.keys(updates).length > 0) await reportsRef.update(updates);
        }
        return true;
    } catch (error) { console.error("Veri takas sırasında bir hata oluştu:", error); return false; } 
    finally { loadingOverlay.style.display = 'none'; }
}
async function applyIdChangeScenario() {
    const oldId = document.getElementById('scenario-old-id').value.trim();
    const newId = document.getElementById('scenario-new-id').value.trim();
    if (!oldId || !newId) { alert("Lütfen hem 'Eski Soru ID' hem de 'Yeni Soru ID' alanlarını doldurun."); return; }
    if (oldId === newId) { alert("Eski ve yeni ID aynı olamaz."); return; }
    const questionToMove = fideQuestions.find(q => String(q.id) === String(oldId));
    if (!questionToMove) { alert(`HATA: "${oldId}" ID'li bir soru bulunamadı.`); return; }
    const targetQuestion = fideQuestions.find(q => String(q.id) === String(new