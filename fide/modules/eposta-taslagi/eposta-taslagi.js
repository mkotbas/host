// --- Global Değişkenler ---
// `pb` değişkeni, admin.js tarafından zaten tanımlanmıştır.
let ayarlarRecordId_ET = null; // 'ayarlar' koleksiyonundaki kaydın ID'si
const varsayilanSablon = "{YONETMEN_ADI} Bey Merhaba,\nZiyaret etmiş olduğum {BAYI_BILGISI} bayi karnesi ektedir.";

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeEpostaTaslagiModule() {
    showLoading(true);
    setupModuleEventListeners_EpostaTaslagi();
    await loadTemplateData();
    showLoading(false);
}

// --- Veri Yükleme ve Kaydetme ---
async function loadTemplateData() {
    const textarea = document.getElementById('email-template-textarea');
    try {
        const ayarlarRecord = await pb.collection('ayarlar').getFirstListItem('');
        textarea.value = ayarlarRecord.emailSablonu || varsayilanSablon;
        ayarlarRecordId_ET = ayarlarRecord.id;
    } catch (error) {
        if (error.status === 404) {
            console.warn("'ayarlar' kaydı bulunamadı. Varsayılan şablon kullanılacak.");
            textarea.value = varsayilanSablon;
            ayarlarRecordId_ET = null; // Henüz kayıt yok
        } else {
            console.error("E-posta şablonu yüklenemedi:", error);
            alert("E-posta şablonu sunucudan yüklenirken bir hata oluştu.");
            textarea.value = "Şablon yüklenirken bir hata oluştu.";
        }
    }
}

async function saveTemplateData() {
    const newTemplate = document.getElementById('email-template-textarea').value;
    showLoading(true);

    try {
        const dataToSave = { emailSablonu: newTemplate };

        if (ayarlarRecordId_ET) {
            // Mevcut ayarlar kaydını güncelle
            await pb.collection('ayarlar').update(ayarlarRecordId_ET, dataToSave);
        } else {
            // 'ayarlar' koleksiyonu boşsa, ilk kaydı oluştur
            const newRecord = await pb.collection('ayarlar').create(dataToSave);
            ayarlarRecordId_ET = newRecord.id;
        }
        alert("E-posta şablonu başarıyla kaydedildi.");
    } catch (error) {
        console.error("E-posta şablonu kaydedilirken hata:", error);
        alert("Şablon kaydedilirken bir hata oluştu: " + error.message);
    } finally {
        showLoading(false);
    }
}

// --- Olay Dinleyicileri ---
function setupModuleEventListeners_EpostaTaslagi() {
    if (document.body.dataset.epostaTaslagiListenersAttached) return;
    document.body.dataset.epostaTaslagiListenersAttached = 'true';
    
    document.getElementById('save-template-btn').addEventListener('click', saveTemplateData);
}