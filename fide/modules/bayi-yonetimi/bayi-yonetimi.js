// --- Global Değişkenler ---
let pbInstance;
let parsedExcelData = [];

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeBayiYonetimiModule(pb) {
    pbInstance = pb; // Admin.js'den gelen PocketBase nesnesini al
    if (pbInstance && pbInstance.authStore.isValid) {
        setupEventListeners();
    } else {
        document.getElementById('bayi-manager-module').innerHTML = '<p style="text-align: center; color: var(--danger);">Bu modülü kullanmak için lütfen sisteme giriş yapın.</p>';
    }
}

// --- OLAY DİNLEYİCİLERİ KURULUMU ---
function setupEventListeners() {
    const fileInput = document.getElementById('bayi-excel-input');
    const uploadBtn = document.getElementById('upload-bayi-btn');
    const deleteAllBtn = document.getElementById('delete-all-bayiler-btn');

    if(fileInput) {
        fileInput.addEventListener('change', handleFileSelect);
    }
    if(uploadBtn) {
        uploadBtn.addEventListener('click', uploadDataToPocketBase);
    }
    if(deleteAllBtn) {
        deleteAllBtn.addEventListener('click', deleteAllBayiler);
    }
}

// --- EXCEL DOSYASI SEÇİLDİĞİNDE ÇALIŞIR ---
function handleFileSelect(event) {
    const file = event.target.files[0];
    const fileNameDisplay = document.getElementById('file-name-display');
    const uploadBtn = document.getElementById('upload-bayi-btn');
    const statusDiv = document.getElementById('upload-status');

    if (!file) {
        fileNameDisplay.textContent = 'Henüz dosya seçilmedi.';
        uploadBtn.disabled = true;
        parsedExcelData = [];
        return;
    }

    fileNameDisplay.textContent = `Seçilen Dosya: ${file.name}`;
    statusDiv.style.display = 'none';
    statusDiv.textContent = '';

    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            parsedExcelData = XLSX.utils.sheet_to_json(worksheet);
            
            if (parsedExcelData.length > 0) {
                uploadBtn.disabled = false;
                statusDiv.textContent = `${parsedExcelData.length} adet bayi kaydı dosyada bulundu. Yüklemeye hazır.`;
                statusDiv.className = 'status-message success';
                statusDiv.style.display = 'block';
            } else {
                throw new Error("Excel dosyasında okunacak veri bulunamadı.");
            }
        } catch (error) {
            statusDiv.textContent = `Hata: ${error.message}`;
            statusDiv.className = 'status-message error';
            statusDiv.style.display = 'block';
            uploadBtn.disabled = true;
            parsedExcelData = [];
        }
    };
    reader.onerror = function() {
        statusDiv.textContent = 'Hata: Dosya okunurken bir problem oluştu.';
        statusDiv.className = 'status-message error';
        statusDiv.style.display = 'block';
        uploadBtn.disabled = true;
    };
}

// --- VERİLERİ POCKETBASE'E YÜKLEME FONKSİYONU ---
async function uploadDataToPocketBase() {
    if (parsedExcelData.length === 0) {
        alert("Yüklenecek veri bulunamadı. Lütfen önce bir Excel dosyası seçin.");
        return;
    }
    if (!confirm(`${parsedExcelData.length} bayilik veri seti veritabanına yüklenecektir. Bu işlem mevcut bayileri günceller, olmayanları ekler. Devam etmek istiyor musunuz?`)) {
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    const statusDiv = document.getElementById('upload-status');
    loadingOverlay.style.display = 'flex';
    statusDiv.textContent = 'İşlem başlatılıyor, lütfen bekleyin...';
    statusDiv.style.display = 'block';

    let createdCount = 0;
    let updatedCount = 0;

    try {
        // Mevcut tüm bayileri tek seferde çekip bir harita (map) oluşturalım.
        // Bu, her satır için veritabanına sorgu atmamızı engeller ve işlemi hızlandırır.
        const existingBayiler = await pbInstance.collection('bayiler').getFullList();
        const bayilerMap = new Map(existingBayiler.map(bayi => [String(bayi.bayiKodu), bayi.id]));

        for (const row of parsedExcelData) {
            const bayiKodu = String(row['Bayi Kodu']).trim();
            if (!bayiKodu) continue; // Bayi Kodu yoksa bu satırı atla

            // İsteğinizdeki eşleştirmelere göre veri nesnesini hazırlıyoruz
            const dataToSave = {
                'bolge': row['Bölge'],
                'yonetmen': row['Bayi Yönetmeni'],
                'sehir': row['Şehir'],
                'bayiKodu': bayiKodu,
                'bayiAdi': row['Bayiler']
            };

            const existingId = bayilerMap.get(bayiKodu);
            if (existingId) {
                // Bayi zaten var, güncelle
                await pbInstance.collection('bayiler').update(existingId, dataToSave);
                updatedCount++;
            } else {
                // Bayi yok, yeni oluştur
                await pbInstance.collection('bayiler').create(dataToSave);
                createdCount++;
            }
        }

        statusDiv.textContent = `İşlem başarıyla tamamlandı! ${createdCount} yeni bayi eklendi, ${updatedCount} bayi güncellendi.`;
        statusDiv.className = 'status-message success';
        document.getElementById('upload-bayi-btn').disabled = true;
        document.getElementById('bayi-excel-input').value = ''; // Dosya inputunu sıfırla
        document.getElementById('file-name-display').textContent = 'Henüz dosya seçilmedi.';


    } catch (error) {
        statusDiv.textContent = `Yükleme sırasında bir hata oluştu: ${error.message}`;
        statusDiv.className = 'status-message error';
    } finally {
        loadingOverlay.style.display = 'none';
        parsedExcelData = [];
    }
}

// --- TÜM BAYİLERİ SİLME FONKSİYONU ---
async function deleteAllBayiler() {
    const confirmationText = "TÜM BAYİLERİ SİL";
    const userInput = prompt(`DİKKAT! Bu işlem geri alınamaz. Veritabanındaki TÜM bayileri kalıcı olarak silmek istediğinizden eminseniz, lütfen "${confirmationText}" yazarak onaylayın.`);

    if (userInput !== confirmationText) {
        alert("Onay metni yanlış girildiği için işlem iptal edildi.");
        return;
    }

    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';
    
    try {
        const records = await pbInstance.collection('bayiler').getFullList({ fields: 'id' });
        
        // Tüm silme işlemlerini aynı anda göndererek hızlandırıyoruz.
        const deletePromises = records.map(record => pbInstance.collection('bayiler').delete(record.id));
        await Promise.all(deletePromises);

        alert(`${records.length} adet bayi kaydı başarıyla silindi.`);
        window.location.reload(); // Sayfayı yenileyerek durumu göster

    } catch (error) {
        alert(`Bayiler silinirken bir hata oluştu: ${error.message}`);
        loadingOverlay.style.display = 'none';
    }
}