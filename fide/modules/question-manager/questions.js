// --- Global Değişkenler ---
let fideQuestions = [], productList = [], migrationMap = {};
const fallbackFideQuestions = [{ id: 0, type: 'standard', title: "HATA: Sorular buluttan yüklenemedi." }];
let currentManagerView = 'active'; 

// --- ANA BAŞLATICI ---
async function initializeQuestionManager() {
    if (typeof auth === 'undefined' || !auth.currentUser) {
        document.getElementById('module-content').innerHTML = '<p style="text-align: center; color: var(--danger-color); padding: 2rem;">Soru yöneticisini kullanmak için lütfen sisteme giriş yapın.</p>';
        return;
    }
    await loadInitialData();
    setupQuestionManagerEventListeners();
    renderQuestionManager();
}

async function loadMigrationMap() {
    migrationMap = {};
    if (database) {
        try {
            const snapshot = await database.ref('migrationSettings/map').once('value');
            if (snapshot.exists()) migrationMap = snapshot.val();
        } catch (error) {
            console.error("Buluttan veri taşıma ayarları yüklenemedi:", error);
        }
    }
}

async function loadInitialData() {
    await loadMigrationMap();
    let questionsLoaded = false;
    if (database) {
        try {
            const snapshot = await database.ref('fideQuestionsData').once('value');
            if (snapshot.exists()) {
                const cloudData = snapshot.val();
                fideQuestions = cloudData.questions || [];
                productList = cloudData.productList || [];
                questionsLoaded = true;
            }
        } catch (error) {
            console.error("Firebase'den soru verisi okunurken hata oluştu:", error);
        }
    }
    if (!questionsLoaded) fideQuestions = fallbackFideQuestions;
}

function setupQuestionManagerEventListeners() {
    const managerElement = document.getElementById('question-manager');
    if (!managerElement || managerElement.dataset.listenersAttached) return;
    managerElement.dataset.listenersAttached = 'true';

    document.getElementById('view-active-btn').addEventListener('click', () => { currentManagerView = 'active'; filterManagerView(); });
    document.getElementById('view-archived-btn').addEventListener('click', () => { currentManagerView = 'archived'; filterManagerView(); });
    document.getElementById('add-new-question-btn').addEventListener('click', addNewQuestionUI);
    document.getElementById('save-questions-btn').addEventListener('click', saveQuestions);
    document.getElementById('delete-all-archived-btn').addEventListener('click', deleteAllArchivedQuestions);
    document.getElementById('restore-all-archived-btn').addEventListener('click', restoreAllArchivedQuestions);
    document.getElementById('unlock-ids-btn').addEventListener('click', () => {
        const dogruSifreHash = 'ZmRlMDAx';
        const girilenSifre = prompt("ID alanlarını düzenlemeye açmak için yönetici şifresini girin:");
        if (girilenSifre && btoa(girilenSifre) === dogruSifreHash) {
            document.querySelectorAll('.manager-id-input').forEach(input => { input.disabled = false; });
            const unlockBtn = document.getElementById('unlock-ids-btn');
            unlockBtn.disabled = true;
            unlockBtn.innerHTML = '<i class="fas fa-lock-open"></i> ID Alanları Açık';
            alert('Soru ID alanları artık düzenlenebilir.');
        } else if(girilenSifre) {
            alert('Hatalı şifre!');
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
    document.querySelectorAll('.scenario-btn').forEach(btn => btn.addEventListener('click', (e) => selectScenario(e.currentTarget.dataset.scenario)));
    document.getElementById('apply-id-change-btn').addEventListener('click', applyIdChangeScenario);
    document.getElementById('scenario-delete-id').addEventListener('input', previewQuestionForDelete);
    document.getElementById('apply-delete-question-btn').addEventListener('click', applyDeleteQuestionScenario);
}


// --- GÜNCELLENEN RENDER FONKSİYONU ---
function renderQuestionManager() {
    const managerList = document.getElementById('manager-list');
    if (!managerList) {
        console.error("Kritik Hata: #manager-list elementi DOM'da bulunamadı.");
        return;
    }

    // Konsola ve Ekrana Bilgi Mesajı Eklendi
    console.log(`renderQuestionManager çağrıldı. Yüklenen soru sayısı: ${fideQuestions.length}`);
    if (fideQuestions.length === 0 || (fideQuestions.length === 1 && fideQuestions[0].id === 0) ) {
        managerList.innerHTML = '<div style="text-align: center; color: var(--warning-color); padding: 2rem; border: 1px dashed var(--border-color); border-radius: 8px;">Veritabanında görüntülenecek soru bulunamadı.<br>Lütfen "Soru Ekle" butonunu kullanarak yeni bir soru ekleyin veya veritabanınızı kontrol edin.</div>';
        filterManagerView();
        return; 
    }

    managerList.innerHTML = '';
    fideQuestions.sort((a, b) => a.id - b.id).forEach(q => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'manager-item';
        itemDiv.dataset.id = q.id;
        let staticItemsHtml = (q.staticItems || []).join('<br>'); 
        const typeOptions = ['standard', 'product_list', 'pop_system'];
        const selectOptionsHTML = typeOptions.map(type => `<option value="${type}" ${q.type === type ? 'selected' : ''}>${type}</option>`).join('');
        const answerType = q.answerType || 'variable';
        const answerTypeOptionsHTML = `<option value="variable" ${answerType === 'variable' ? 'selected' : ''}>Değişken</option><option value="fixed" ${answerType === 'fixed' ? 'selected' : ''}>Sabit</option>`;
        const isArchivedChecked = q.isArchived ? 'checked' : '';
        const wantsStoreEmailChecked = q.wantsStoreEmail ? 'checked' : '';

        itemDiv.innerHTML = `
            <div class="manager-item-grid">
                <div><label>Soru ID</label><input type="number" class="manager-id-input" value="${q.id}" disabled></div>
                <div><label>Soru Başlığı</label><input type="text" class="question-title-input" value="${q.title}"></div>
                <div><label>Soru Tipi</label><select class="question-type-select" onchange="toggleSpecialManagerUI(this)">${selectOptionsHTML}</select></div>
                <div><label>Cevap Tipi</label><select class="answer-type-select">${answerTypeOptionsHTML}</select></div>
                <div class="manager-grid-switch-group">
                    <div class="archive-switch-container"><label>E-posta Ekle</label><label class="switch"><input type="checkbox" class="wants-email-checkbox" ${wantsStoreEmailChecked}><span class="slider green"></span></label></div>
                    <div class="archive-switch-container"><label>Arşivle</label><label class="switch"><input type="checkbox" class="archive-checkbox" ${isArchivedChecked} onchange="filterManagerView()"><span class="slider"></span></label></div>
                </div>
            </div>
            <div>
                <label>Statik Maddeler (product_list / pop_system tipi için kullanılmaz)</label>
                <div class="editor-toolbar"><button onclick="formatText(this, 'bold')" title="Kalın"><i class="fas fa-bold"></i></button><button onclick="formatText(this, 'italic')" title="İtalik"><i class="fas fa-italic"></i></button><button onclick="formatText(this, 'underline')" title="Altı Çizili"><i class="fas fa-underline"></i></button><button onclick="formatText(this, 'link')" title="Köprü"><i class="fas fa-link"></i></button></div>
                <div class="editable-textarea" contenteditable="true">${staticItemsHtml}</div>
            </div>
            <div class="special-manager-container"></div>
            <div class="manager-item-footer"><button class="btn-warning btn-sm" onclick="deleteAllAnswersForQuestion(${q.id})" title="Bu soruya ait TÜM cevapları BÜTÜN bayi raporlarından siler."><i class="fas fa-eraser"></i>Cevapları Temizle</button></div>`;
        managerList.appendChild(itemDiv);
        toggleSpecialManagerUI(itemDiv.querySelector('.question-type-select'));
    });
    filterManagerView(); 
}

// --- Diğer Tüm Fonksiyonlar (Hiçbir değişiklik yapılmadı) ---
// ... (openScenarioSystem, saveQuestions, vb. fonksiyonların tamamı burada yer alır) ...
// ... Bu fonksiyonların tamamını buraya kopyalamak yerine sadece değişen kısmı gösterdim. 
// ... Lütfen dosyanın tamamını yukarıdaki güncellenmiş kodla değiştirin.
// ... (Önceki yanıtlarda bu fonksiyonların tam hali mevcuttur)

// BU KISIMDAN SONRASI ÖNCEKİ YANITLARDAKİ GİBİ AYNI KALACAK
function openScenarioSystem(){ /*...*/ }
function closeScenarioSystem(){ /*...*/ }
// ... ve diğer tüm fonksiyonlar
// ...
// ...
async function saveQuestions(){ /*...*/ }