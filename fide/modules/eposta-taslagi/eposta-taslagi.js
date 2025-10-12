// --- Global Değişkenler ---
let emailTemplate = "";
let pbInstance; // PocketBase nesnesi

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeEpostaTaslagiModule(pb) {
    pbInstance = pb; // Admin.js'den gelen PocketBase nesnesini al
    setupModuleEventListeners();
    await loadTemplateData();
}

// --- Veri Yükleme ve Kaydetme (PocketBase'e Uyarlandı) ---
async function loadTemplateData() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    
    // Varsayılan şablon, eğer veritabanında kayıt bulunamazsa kullanılır.
    const defaultTemplate = "{YONETMEN_ADI} Bey Merhaba,\nZiyaret etmiş olduğum {BAYI_BILGISI} bayi karnesi ektedir.";

    if (pbInstance && pbInstance.authStore.isValid) {
        try {
            // 'ayarlar' tablosundan anahtarı 'emailTemplate' olan kaydı bul.
            const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="emailTemplate"');
            emailTemplate = record.deger || defaultTemplate;
        } catch (error) {
            // Kayıt bulunamazsa (404 hatası) varsayılanı kullan.
            if (error.status === 404) {
                console.log("E-posta şablonu kaydı bulunamadı, varsayılan kullanılıyor.");
                emailTemplate = defaultTemplate;
            } else {
                console.error("E-posta şablonu yüklenemedi:", error);
                alert("E-posta şablonu buluttan yüklenirken bir hata oluştu.");
                emailTemplate = defaultTemplate;
            }
        }
    } else {
        emailTemplate = defaultTemplate;
    }
    
    document.getElementById('email-template-textarea').value = emailTemplate;
    loadingOverlay.style.display = 'none';
}

async function saveTemplateData() {
    if (!pbInstance || !pbInstance.authStore.isValid) {
        alert("Bu işlemi yapmak için sisteme giriş yapmalısınız.");
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    
    const newTemplate = document.getElementById('email-template-textarea').value;
    const data = { 'deger': newTemplate };

    try {
        // Önce kaydın var olup olmadığını kontrol et.
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="emailTemplate"');
        // Kayıt varsa güncelle.
        await pbInstance.collection('ayarlar').update(record.id, data);
        alert("E-posta şablonu başarıyla güncellendi.");

    } catch (error) {
        if (error.status === 404) {
            // Kayıt yoksa (404 hatası), yeni bir tane oluştur.
            try {
                await pbInstance.collection('ayarlar').create({ anahtar: 'emailTemplate', ...data });
                alert("E-posta şablonu başarıyla kaydedildi.");
            } catch (createError) {
                console.error("E-posta şablonu oluşturulurken hata:", createError);
                alert("Şablon kaydedilirken bir hata oluştu: " + createError.message);
            }
        } else {
            console.error("E-posta şablonu kaydedilirken hata:", error);
            alert("Şablon kaydedilirken bir hata oluştu: " + error.message);
        }
    } finally {
        emailTemplate = newTemplate; // Global değişkeni de güncelle
        loadingOverlay.style.display = 'none';
    }
}

// --- Olay Dinleyicileri (Değişiklik Yok) ---
function setupModuleEventListeners() {
    if (document.body.dataset.epostaTaslagiListenersAttached) return;
    document.body.dataset.epostaTaslagiListenersAttached = 'true';

    document.getElementById('save-template-btn').addEventListener('click', saveTemplateData);
}