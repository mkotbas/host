// --- Global Değişkenler ---
// `pb` değişkeni, admin.js tarafından zaten tanımlanmıştır.
let fideQuestions_SY = [], productList_SY = [], migrationMap_SY = {};
let fideQuestionsRecordId = null; // fideQuestionsData koleksiyonundaki kaydın ID'si
let ayarlarRecordId_SY = null; // ayarlar koleksiyonundaki kaydın ID'si
let currentManagerView = 'active';

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeSoruYoneticisiModule() {
    showLoading(true);
    await loadInitialData_SoruYoneticisi();
    setupModuleEventListeners_SoruYoneticisi();
    renderQuestionManager();
    showLoading(false);
}

// --- Veri Yükleme ---
async function loadInitialData_SoruYoneticisi() {
    try {
        // 1. Soruları ve Ürün Listesini Yükle
        try {
            const fideDataRecord = await pb.collection('fideQuestionsData').getFirstListItem('');
            fideQuestions_SY = fideDataRecord.sorular || [];
            productList_SY = fideDataRecord.urunListesi || [];
            fideQuestionsRecordId = fideDataRecord.id;
        } catch (e) {
            if (e.status === 404) { // Koleksiyon boşsa
                console.warn("'fideQuestionsData' kaydı bulunamadı. Boş bir yapıyla başlanıyor.");
                fideQuestions_SY = []; productList_SY = [];
            } else { throw e; }
        }

        // 2. Yönlendirme (Migration) Haritasını Yükle
        try {
            const ayarlarRecord = await pb.collection('ayarlar').getFirstListItem('');
            migrationMap_SY = ayarlarRecord.migrationMap || {};
            ayarlarRecordId_SY = ayarlarRecord.id;
        } catch (e) {
            if (e.status === 404) {
                console.warn("'ayarlar' kaydı bulunamadı.");
                migrationMap_SY = {};
            } else { throw e; }
        }

    } catch (error) {
        console.error("Soru Yöneticisi için başlangıç verileri yüklenemedi:", error);
        alert("Veriler yüklenirken bir hata oluştu. Lütfen PocketBase sunucunuzun çalıştığından emin olun.");
    }
}

// --- Olay Dinleyicileri ---
function setupModuleEventListeners_SoruYoneticisi() {
    if (document.body.dataset.soruYoneticisiListenersAttached) return;
    document.body.dataset.soruYoneticisiListenersAttached = 'true';

    document.getElementById('view-active-btn').addEventListener('click', () => switchView('active'));
    document.getElementById('view-archived-btn').addEventListener('click', () => switchView('archived'));
    document.getElementById('add-new-question-btn').addEventListener('click', addNewQuestion);
    document.getElementById('save-all-changes-btn').addEventListener('click', saveAllChanges);
    document.getElementById('open-product-manager-btn').addEventListener('click', openProductManager);
    document.getElementById('close-product-manager-btn').addEventListener('click', closeProductManager);
    document.getElementById('add-product-btn').addEventListener('click', addProduct);
}

// --- Arayüz (UI) Render Fonksiyonları ---
function renderQuestionManager() {
    const container = document.getElementById('question-list-container');
    const questionsToRender = fideQuestions_SY.filter(q => currentManagerView === 'active' ? !q.isArchived : q.isArchived);
    
    if (questionsToRender.length === 0) {
        container.innerHTML = `<p class="empty-list-message">Bu görünümde gösterilecek soru bulunmuyor.</p>`;
        return;
    }

    container.innerHTML = questionsToRender.map(q => createQuestionItemHTML(q)).join('');
}

function switchView(view) {
    currentManagerView = view;
    document.getElementById('view-active-btn').classList.toggle('active', view === 'active');
    document.getElementById('view-archived-btn').classList.toggle('active', view === 'archived');
    renderQuestionManager();
}

function openProductManager() {
    renderProductList();
    document.getElementById('product-manager-overlay').style.display = 'flex';
}

function closeProductManager() {
    document.getElementById('product-manager-overlay').style.display = 'none';
}

function renderProductList() {
    const listContainer = document.getElementById('product-list');
    if (productList_SY.length === 0) {
        listContainer.innerHTML = '<p>Henüz ürün eklenmemiş.</p>';
        return;
    }
    listContainer.innerHTML = productList_SY.map((p, index) => `
        <div class="product-item" data-index="${index}">
            <span>${p.name} (${p.code})</span>
            <button class="btn-icon btn-danger-icon" onclick="removeProduct(${index})"><i class="fas fa-trash-alt"></i></button>
        </div>
    `).join('');
}


// --- CRUD (Ekleme, Silme, Güncelleme) ---
function addNewQuestion() {
    const newId = fideQuestions_SY.length > 0 ? Math.max(...fideQuestions_SY.map(q => q.id)) + 1 : 1;
    const newQuestion = {
        id: newId,
        title: "Yeni Soru",
        type: "standard",
        isArchived: false
    };
    fideQuestions_SY.push(newQuestion);
    renderQuestionManager();
    // Yeni eklenen soruya scroll yap
    document.getElementById(`question-item-${newId}`).scrollIntoView({ behavior: 'smooth' });
}

function addProduct() {
    const nameInput = document.getElementById('product-name-input');
    const codeInput = document.getElementById('product-code-input');
    
    const name = nameInput.value.trim();
    const code = codeInput.value.trim();

    if (!name || !code) {
        alert("Ürün Adı ve Kodu boş bırakılamaz.");
        return;
    }
    if (productList_SY.some(p => p.code === code)) {
        alert("Bu koda sahip bir ürün zaten mevcut.");
        return;
    }

    productList_SY.push({ name, code });
    renderProductList();
    nameInput.value = '';
    codeInput.value = '';
    nameInput.focus();
}

function removeProduct(index) {
    if (confirm(`'${productList_SY[index].name}' ürününü silmek istediğinizden emin misiniz?`)) {
        productList_SY.splice(index, 1);
        renderProductList();
    }
}

// --- Ana Kaydetme Fonksiyonu ---
async function saveAllChanges() {
    if (!confirm("Tüm değişiklikleri sunucuya kaydetmek istediğinizden emin misiniz? Bu işlem geri alınamaz.")) {
        return;
    }
    showLoading(true);

    // 1. Arayüzden güncel soru verilerini topla
    const newQuestions = [];
    document.querySelectorAll('.question-item').forEach(item => {
        const id = parseInt(item.dataset.id, 10);
        const currentQuestion = fideQuestions_SY.find(q => q.id === id) || {};
        
        const newQuestion = {
            ...currentQuestion,
            id: id,
            title: item.querySelector('.question-title-input').value,
            type: item.querySelector('.question-type-select').value,
            isArchived: item.querySelector('.archive-btn').dataset.archived === 'true'
        };

        if (newQuestion.type === 'pop_system') {
            newQuestion.popCodes = item.querySelector('.pop-codes-input').value.split(',').map(c => c.trim()).filter(Boolean);
            newQuestion.expiredCodes = item.querySelector('.expired-pop-codes-input').value.split(',').map(c => c.trim()).filter(Boolean);
        }

        newQuestions.push(newQuestion);
    });

    // 2. Güncel verileri oluştur
    const finalQuestionData = {
        sorular: newQuestions.sort((a, b) => a.id - b.id),
        urunListesi: productList_SY
    };

    // 3. Verileri PocketBase'e kaydet
    try {
        if (fideQuestionsRecordId) {
            await pb.collection('fideQuestionsData').update(fideQuestionsRecordId, finalQuestionData);
        } else {
            const newRecord = await pb.collection('fideQuestionsData').create(finalQuestionData);
            fideQuestionsRecordId = newRecord.id;
        }

        // Migration map'i ayrı olarak kaydet
        if (ayarlarRecordId_SY) {
            await pb.collection('ayarlar').update(ayarlarRecordId_SY, { migrationMap: migrationMap_SY });
        } else {
            // Eğer ayar kaydı yoksa ve migration map doluysa yeni kayıt oluştur
            if (Object.keys(migrationMap_SY).length > 0) {
               const newAyarRecord = await pb.collection('ayarlar').create({ migrationMap: migrationMap_SY });
               ayarlarRecordId_SY = newAyarRecord.id;
            }
        }

        alert("Tüm değişiklikler başarıyla sunucuya kaydedildi.");
        await loadInitialData_SoruYoneticisi(); // Veriyi yeniden yükle
        renderQuestionManager(); // Arayüzü tazele

    } catch (error) {
        console.error("Değişiklikler kaydedilirken hata:", error);
        alert("Değişiklikler kaydedilirken bir hata oluştu: " + error.message);
    } finally {
        showLoading(false);
    }
}


// --- HTML Oluşturma Fonksiyonları (Yardımcı) ---
function createQuestionItemHTML(q) {
    const isArchived = q.isArchived || false;
    let typeSpecificContent = '';
    if (q.type === 'pop_system') {
        typeSpecificContent = `
            <div class="type-specific-content">
                <input type="text" class="pop-codes-input" placeholder="Aktif POP Kodları (virgülle ayırın)" value="${(q.popCodes || []).join(', ')}">
                <input type="text" class="expired-pop-codes-input" placeholder="Süresi Dolmuş POP'lar (virgülle ayırın)" value="${(q.expiredCodes || []).join(', ')}">
            </div>
        `;
    }

    return `
        <div class="question-item" id="question-item-${q.id}" data-id="${q.id}">
            <div class="question-header">
                <span class="question-id">ID: ${q.id}</span>
                <input type="text" class="question-title-input" value="${q.title}">
                <select class="question-type-select">
                    <option value="standard" ${q.type === 'standard' ? 'selected' : ''}>Standart</option>
                    <option value="product_list" ${q.type === 'product_list' ? 'selected' : ''}>Perakende Malzemeleri</option>
                    <option value="pop_system" ${q.type === 'pop_system' ? 'selected' : ''}>POP Sistemi</option>
                </select>
                <button class="btn-icon archive-btn" data-archived="${isArchived}" onclick="toggleArchiveStatus(${q.id}, this)" title="${isArchived ? 'Arşivden Çıkar' : 'Arşivle'}">
                    <i class="fas ${isArchived ? 'fa-box-open' : 'fa-archive'}"></i>
                </button>
            </div>
            ${typeSpecificContent}
        </div>
    `;
}

function toggleArchiveStatus(id, buttonElement) {
    const question = fideQuestions_SY.find(q => q.id === id);
    if (question) {
        question.isArchived = !question.isArchived;
        // Butonun durumunu ve ikonunu anında değiştir, kaydetme işlemi ana butonda yapılacak
        buttonElement.dataset.archived = question.isArchived;
        buttonElement.title = question.isArchived ? 'Arşivden Çıkar' : 'Arşivle';
        buttonElement.querySelector('i').className = `fas ${question.isArchived ? 'fa-box-open' : 'fa-archive'}`;
        // Görünümden kaldır
        setTimeout(() => renderQuestionManager(), 200);
    }
}