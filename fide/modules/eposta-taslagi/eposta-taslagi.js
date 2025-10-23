// GÜNCELLEME: (function() { ... })() sarmalayıcısı kaldırıldı.

// --- Global Değişkenler ---
let pbInstance; // PocketBase nesnesi
let quill; // Quill editör nesnesi

// --- MODÜL BAŞLATMA FONKSİYONU ---
// GÜNCELLEME: 'export' anahtar kelimesi eklendi.
export async function initializeEpostaTaslagiModule(pb) {
    pbInstance = pb; // Admin.js'den gelen PocketBase nesnesini al
    initializeQuillEditor();
    setupModuleEventListeners();
    await loadTemplateData();
}

// --- Quill Editörünü Başlatma ---
function initializeQuillEditor() {
    // Editör için araç çubuğu seçenekleri
    const toolbarOptions = [
        [{ 'header': [1, 2, 3, false] }],
        ['bold', 'italic', 'underline'],
        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
        [{ 'align': [] }],
        ['clean'] // Biçimlendirmeyi temizle butonu
    ];

    // Eğer editör zaten oluşturulmuşsa tekrar oluşturma, sadece içeriğini temizle
    if (quill) {
        quill.root.innerHTML = '';
    } else {
        quill = new Quill('#editor-container', {
            modules: {
                toolbar: toolbarOptions
            },
            theme: 'snow' // 'Snow' teması standart ve temiz bir görünüm sağlar
        });
    }
}


// --- Veri Yükleme ve Kaydetme (PocketBase'e Uyarlandı) ---
async function loadTemplateData() {
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    
    // Varsayılan şablon, eğer veritabanında kayıt bulunamazsa kullanılır.
    const defaultTemplate = `
        <p>{YONETMEN_ADI} Bey Merhaba,</p>
        <p>Ziyaret etmiş olduğum {BAYI_BILGISI} bayi karnesi aşağıdadır.</p>
        <p><br></p>
        {DENETIM_ICERIGI}
        <p><br></p>
        {PUAN_TABLOSU}
    `;

    let emailTemplate = defaultTemplate;

    if (pbInstance && pbInstance.authStore.isValid) {
        try {
            const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="emailTemplate"');
            emailTemplate = record.deger || defaultTemplate;
        } catch (error) {
            if (error.status === 404) {
                console.log("E-posta şablonu kaydı bulunamadı, varsayılan kullanılıyor.");
            } else {
                console.error("E-posta şablonu yüklenemedi:", error);
                alert("E-posta şablonu buluttan yüklenirken bir hata oluştu.");
            }
        }
    }
    
    // Editörün içeriğini HTML olarak ayarla
    quill.root.innerHTML = emailTemplate;
    loadingOverlay.style.display = 'none';
}

async function saveTemplateData() {
    if (!pbInstance || !pbInstance.authStore.isValid) {
        alert("Bu işlemi yapmak için sisteme giriş yapmalısınız.");
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    
    // Editörün içeriğini HTML olarak al
    const newTemplate = quill.root.innerHTML;
    const data = { 'deger': newTemplate };

    try {
        const record = await pbInstance.collection('ayarlar').getFirstListItem('anahtar="emailTemplate"');
        await pbInstance.collection('ayarlar').update(record.id, data);
        alert("E-posta şablonu başarıyla güncellendi.");

    } catch (error) {
        if (error.status === 404) {
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
        loadingOverlay.style.display = 'none';
    }
}

// --- Olay Dinleyicileri ---
function setupModuleEventListeners() {
    const saveBtn = document.getElementById('save-template-btn');
    // Olay dinleyicisinin birden fazla kez eklenmesini önle
    if (!saveBtn.dataset.listenerAttached) {
         saveBtn.addEventListener('click', saveTemplateData);
         saveBtn.dataset.listenerAttached = 'true';
    }
}

// GÜNCELLEME: 'window.initializeEpostaTaslagiModule = ...' satırı kaldırıldı.
// Artık fonksiyon doğrudan 'export' ediliyor.