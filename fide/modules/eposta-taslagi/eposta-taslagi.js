// --- Global Değişkenler ---
let emailTemplate = "";

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeEpostaTaslagiModule() {
    await loadTemplateData();
    setupModuleEventListeners();
}

// --- Veri Yükleme ve Kaydetme ---
async function loadTemplateData() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    
    emailTemplate = "{YONETMEN_ADI} Bey Merhaba,\nZiyaret etmiş olduğum {BAYI_BILGISI} bayi karnesi ektedir."; // Varsayılan

    if (auth.currentUser && database) {
        try {
            const templateRef = database.ref('fideSettings/emailTemplate');
            const snapshot = await templateRef.once('value');
            if (snapshot.exists()) {
                emailTemplate = snapshot.val();
            }
        } catch (error) {
            console.error("E-posta şablonu yüklenemedi:", error);
            alert("E-posta şablonu buluttan yüklenirken bir hata oluştu.");
        }
    }
    
    document.getElementById('email-template-textarea').value = emailTemplate;
    loadingOverlay.style.display = 'none';
}

async function saveTemplateData() {
    if (!auth.currentUser || !database) {
        alert("Bu işlemi yapmak için sisteme giriş yapmalısınız.");
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    
    const newTemplate = document.getElementById('email-template-textarea').value;

    try {
        await database.ref('fideSettings/emailTemplate').set(newTemplate);
        emailTemplate = newTemplate;
        alert("E-posta şablonu başarıyla kaydedildi.");
    } catch (error) {
        console.error("E-posta şablonu kaydedilirken hata:", error);
        alert("Şablon kaydedilirken bir hata oluştu: " + error.message);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

// --- Olay Dinleyicileri ---
function setupModuleEventListeners() {
    if (document.body.dataset.epostaTaslagiListenersAttached) return;
    document.body.dataset.epostaTaslagiListenersAttached = 'true';

    document.getElementById('save-template-btn').addEventListener('click', saveTemplateData);
}