// --- Global Değişkenler ---
let pbInstance; // PocketBase nesnesi

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeBayiBilgileriModule(pb) {
    pbInstance = pb; // Admin.js'den gelen PocketBase nesnesini al

    if (pbInstance && pbInstance.authStore.isValid) {
        setupModuleEventListeners();
    } else {
        document.getElementById('store-importer-manager').innerHTML = '<p class="empty-list-message">Bu modülü kullanmak için lütfen sisteme giriş yapın.</p>';
    }
}

function setupModuleEventListeners() {
    if (document.body.dataset.bayiBilgileriListenersAttached) return;
    document.body.dataset.bayiBilgileriListenersAttached = 'true';

    document.getElementById('store-list-excel-input').addEventListener('change', handleStoreExcelUpload);
    document.getElementById('delete-all-stores-btn').addEventListener('click', deleteAllStores);
}

function handleStoreExcelUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsArrayBuffer(file);
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
            processStoreExcelData(dataAsArray);
        } catch (error) {
            alert("Excel dosyası okunurken bir hata oluştu.");
            console.error("Excel okuma hatası:", error);
        } finally {
            event.target.value = null; // Dosya seçimini sıfırla
        }
    };
}

async function processStoreExcelData(dataAsArray) {
    if (!pbInstance || !pbInstance.authStore.isValid) return alert("Bu işlem için giriş yapmalısınız.");
    if (dataAsArray.length < 2) return alert('Excel dosyası beklenen formatta değil (başlık satırı ve en az bir veri satırı gereklidir).');
    
    const loadingOverlay = document.getElementById('loading-overlay');
    loadingOverlay.style.display = 'flex';

    const headerRow = dataAsArray[0].map(h => String(h).trim());
    const colIndexes = {
        bolge: headerRow.indexOf('Bölge'),
        yonetmen: headerRow.indexOf('Bayi Yönetmeni'),
        sehir: headerRow.indexOf('Şehir'),
        ilce: headerRow.indexOf('İlçe'),
        bayiKodu: headerRow.indexOf('Bayi Kodu'),
        bayiAdi: headerRow.indexOf('Bayiler')
    };

    if (Object.values(colIndexes).some(index => index === -1)) {
        alert('Excel dosyasında gerekli sütunlar (Bölge, Bayi Yönetmeni, Şehir, İlçe, Bayi Kodu, Bayiler) bulunamadı.');
        loadingOverlay.style.display = 'none';
        return;
    }
    
    const dataRows = dataAsArray.slice(1);
    const storesFromExcel = dataRows.map(row => {
        const bayiKodu = String(row[colIndexes.bayiKodu]).trim();
        if (!bayiKodu) return null;
        return {
            bayiKodu,
            bayiAdi: String(row[colIndexes.bayiAdi]).trim(),
            sehir: String(row[colIndexes.sehir]).trim(),
            ilce: String(row[colIndexes.ilce]).trim(),
            bolge: String(row[colIndexes.bolge]).trim(),
            yonetmen: String(row[colIndexes.yonetmen]).trim()
        };
    }).filter(store => store !== null && store.bayiAdi);

    try {
        // Mevcut tüm bayileri tek seferde çekip bir haritaya dönüştürelim (daha hızlı erişim için)
        const existingStores = await pbInstance.collection('bayiler').getFullList();
        const existingStoreMap = new Map(existingStores.map(s => [s.bayiKodu, s.id]));

        for (const store of storesFromExcel) {
            const existingId = existingStoreMap.get(store.bayiKodu);
            if (existingId) {
                // Bayi varsa POCKETBASE'de GÜNCELLE
                await pbInstance.collection('bayiler').update(existingId, store);
            } else {
                // Bayi yoksa POCKETBASE'de YENİ OLUŞTUR
                await pbInstance.collection('bayiler').create(store);
            }
        }
        
        alert(`İşlem Tamamlandı!\n\n${storesFromExcel.length} adet bayi bilgisi başarıyla işlendi ve veritabanı güncellendi.`);
        
    } catch (error) {
        alert("Excel listesi işlenirken hata oluştu: " + error.message);
    } finally {
        loadingOverlay.style.display = 'none';
    }
}

async function deleteAllStores() {
    if (!pbInstance || !pbInstance.authStore.isValid) return alert("Bu işlem için giriş yapmalısınız.");

    const dogruSifreHash = 'ZmRlMDAx'; // "fde001" için base64 hash
    const girilenSifre = prompt("DİKKAT! Bu işlem, veritabanındaki TÜM bayi listesini kalıcı olarak siler. Bu işlem geri alınamaz.\n\nDevam etmek için yönetici şifresini girin:");
    
    if (!girilenSifre) return; // Kullanıcı iptal etti

    if (btoa(girilenSifre) !== dogruSifreHash) {
        alert("Hatalı şifre! İşlem iptal edildi.");
        return;
    }

    if (confirm("Şifre doğru. Veritabanındaki TÜM bayi listesini kalıcı olarak silmek istediğinizden son kez emin misiniz?")) {
        const loadingOverlay = document.getElementById('loading-overlay');
        loadingOverlay.style.display = 'flex';
        try {
            const records = await pbInstance.collection('bayiler').getFullList({ fields: 'id' });
            // Tüm silme işlemlerini aynı anda gönder
            const deletePromises = records.map(record => pbInstance.collection('bayiler').delete(record.id));
            await Promise.all(deletePromises);
            
            alert("Tüm bayi listesi başarıyla silindi. Diğer modüllerin güncel durumu görmesi için sayfa yenilenecektir.");
            window.location.reload();
        } catch (error) {
            alert("Bayiler silinirken hata oluştu: " + error.message);
        } finally {
            loadingOverlay.style.display = 'none';
        }
    }
}