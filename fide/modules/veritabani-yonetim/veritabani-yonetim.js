/* fide/modules/veritabani-yonetim/veritabani-yonetim.js */

/**
 * Veritabanı Yönetimi Modülünü Başlatır
 * @param {object} pb PocketBase instance
 */
export async function initializeVeritabaniYonetimModule(pb) {
    const wrapper = document.getElementById('db-manager-wrapper');
    if (!wrapper) return;

    // --- Başlatma ---
    loadStats(pb);
    setupEventListeners(pb);
}

/**
 * Koleksiyonlardaki kayıt sayılarını yükler
 */
async function loadStats(pb) {
    try {
        const stats = {
            'bayiler': 'count-bayiler',
            'denetim_raporlari': 'count-raporlar',
            'excel_verileri': 'count-excel',
            'user_devices': 'count-cihazlar'
        };

        for (const [collection, elementId] of Object.entries(stats)) {
            const result = await pb.collection(collection).getList(1, 1, { fields: 'id' });
            const el = document.getElementById(elementId);
            if (el) el.textContent = result.totalItems;
        }
    } catch (error) {
        console.error("İstatistikler yüklenemedi:", error);
    }
}

/**
 * Olay dinleyicilerini kurar
 */
function setupEventListeners(pb) {
    // İstatistik Yenileme
    document.getElementById('btn-refresh-stats').onclick = () => loadStats(pb);

    // Excel Verilerini Sil
    document.getElementById('btn-clear-excel').onclick = async () => {
        if (confirm("DİKKAT: Tüm DiDe ve FiDe puan verileri buluttan kalıcı olarak silinecektir. Emin misiniz?")) {
            await clearCollection(pb, 'excel_verileri', "Excel verileri");
        }
    };

    // Raporları Sıfırla
    document.getElementById('btn-clear-reports').onclick = async () => {
        if (confirm("KRİTİK UYARI: Yapılmış olan TÜM denetim raporları silinecektir. Bu işlem geri alınamaz! Onaylıyor musunuz?")) {
            const secondConfirm = prompt("İşlemi onaylamak için 'SİL' yazın:");
            if (secondConfirm === "SİL") {
                await clearCollection(pb, 'denetim_raporlari', "Raporlar");
            } else {
                alert("İşlem iptal edildi.");
            }
        }
    };

    // Geri Al Loglarını Sil
    document.getElementById('btn-clear-undone').onclick = async () => {
        if (confirm("Geri alınan denetimlere ait kayıtlar temizlenecek. Devam edilsin mi?")) {
            await clearCollection(pb, 'denetim_geri_alinanlar', "Geri al kayıtları");
        }
    };

    // Ayarları Yedekle (Export)
    document.getElementById('btn-export-settings').onclick = async () => {
        try {
            const records = await pb.collection('ayarlar').getFullList();
            const dataStr = JSON.stringify(records, null, 2);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `fide_ayarlar_yedek_${new Date().toISOString().slice(0,10)}.json`;
            link.click();
            URL.revokeObjectURL(url);
            alert("Sistem ayarları başarıyla yedeklendi.");
        } catch (error) {
            alert("Yedekleme sırasında hata oluştu: " + error.message);
        }
    };

    // Ayarları Geri Yükle (Import)
    document.getElementById('input-import-settings').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (confirm("Seçilen yedek dosyası mevcut ayarların üzerine yazılacaktır. Devam etmek istiyor musunuz?")) {
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (!Array.isArray(importedData)) throw new Error("Geçersiz yedek formatı.");

                    let updated = 0, created = 0;
                    for (const item of importedData) {
                        try {
                            const existing = await pb.collection('ayarlar').getFirstListItem(`anahtar="${item.anahtar}"`);
                            await pb.collection('ayarlar').update(existing.id, { deger: item.deger });
                            updated++;
                        } catch (err) {
                            await pb.collection('ayarlar').create({ anahtar: item.anahtar, deger: item.deger });
                            created++;
                        }
                    }
                    alert(`Geri yükleme tamamlandı: ${updated} ayar güncellendi, ${created} yeni ayar eklendi.`);
                    window.location.reload();
                } catch (error) {
                    alert("Geri yükleme hatası: " + error.message);
                }
            };
            reader.readAsText(file);
        }
        e.target.value = ''; // Inputu sıfırla
    };
}

/**
 * Yardımcı Fonksiyon: Bir koleksiyondaki tüm kayıtları siler
 */
async function clearCollection(pb, collectionName, label) {
    try {
        const records = await pb.collection(collectionName).getFullList({ fields: 'id' });
        if (records.length === 0) {
            alert(`${label} zaten temiz.`);
            return;
        }

        let successCount = 0;
        for (const record of records) {
            await pb.collection(collectionName).delete(record.id);
            successCount++;
        }

        alert(`Başarılı: ${successCount} adet ${label} kaydı silindi.`);
        loadStats(pb);
    } catch (error) {
        alert(`${label} silinirken hata oluştu: ` + error.message);
    }
}