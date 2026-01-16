/* fide/modules/veritabani-yonetim/veritabani-yonetim.js */

/**
 * Veritabanı Yönetimi Modülünü Başlatır
 * @param {object} pb PocketBase instance
 */
export async function initializeVeritabaniYonetimModule(pb) {
    const wrapper = document.getElementById('db-manager-wrapper');
    if (!wrapper) return;

    // Verileri yükle ve olayları ata
    loadStats(pb);
    setupEventListeners(pb);
}

/**
 * PocketBase'den güncel kayıt sayılarını çeker ve kartlara yazar
 */
async function loadStats(pb) {
    try {
        // İstatistiklerin çekileceği tablolar ve HTML'deki karşılık gelen ID'ler
        const statsConfig = {
            'bayiler': 'count-bayiler',
            'users': 'count-users', // Yeni eklenen kullanıcı istatistiği
            'denetim_raporlari': 'count-raporlar',
            'excel_verileri': 'count-excel',
            'user_devices': 'count-cihazlar'
        };

        for (const [collection, elementId] of Object.entries(statsConfig)) {
            // Veritabanından ilgili tablodaki toplam kayıt sayısını alıyoruz
            const result = await pb.collection(collection).getList(1, 1, { fields: 'id' });
            const el = document.getElementById(elementId);
            if (el) el.textContent = result.totalItems;
        }
    } catch (error) {
        console.error("İstatistikler güncellenemedi:", error);
    }
}

/**
 * Tüm temizleme ve yedekleme işlemlerinin olay dinleyicileri
 */
function setupEventListeners(pb) {
    // Yenileme Butonu
    document.getElementById('btn-refresh-stats').onclick = () => loadStats(pb);

    // Excel Verilerini Sil
    document.getElementById('btn-clear-excel').onclick = async () => {
        if (confirm("DİKKAT: Tüm ham Excel verileri silinecektir. Onaylıyor musunuz?")) {
            await clearCollection(pb, 'excel_verileri', "Excel verileri");
        }
    };

    // Raporları Sıfırla
    document.getElementById('btn-clear-reports').onclick = async () => {
        if (confirm("KRİTİK UYARI: TÜM denetim raporları kalıcı olarak silinecektir!")) {
            const pin = prompt("Silme işlemini onaylamak için 'SİL' yazın:");
            if (pin === "SİL") {
                await clearCollection(pb, 'denetim_raporlari', "Raporlar");
            }
        }
    };

    // Geri Al Loglarını Sil
    document.getElementById('btn-clear-undone').onclick = async () => {
        if (confirm("Denetim geri alma geçmişi temizlenecek. Devam edilsin mi?")) {
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
            alert("Sistem yedek dosyası oluşturuldu.");
        } catch (error) {
            alert("Hata: " + error.message);
        }
    };

    // Ayarları Geri Yükle (Import)
    document.getElementById('input-import-settings').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file || !confirm("Bu dosya mevcut tüm sistem ayarlarının üzerine yazılacaktır. Emin misiniz?")) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const importedData = JSON.parse(event.target.result);
                for (const item of importedData) {
                    try {
                        const existing = await pb.collection('ayarlar').getFirstListItem(`anahtar="${item.anahtar}"`);
                        await pb.collection('ayarlar').update(existing.id, { deger: item.deger });
                    } catch (err) {
                        await pb.collection('ayarlar').create({ anahtar: item.anahtar, deger: item.deger });
                    }
                }
                alert("Yapılandırma yüklendi. Sayfa yenileniyor.");
                window.location.reload();
            } catch (error) {
                alert("Geri yükleme başarısız.");
            }
        };
        reader.readAsText(file);
    };
}

/**
 * Bir koleksiyondaki verileri temizleyen yardımcı fonksiyon
 */
async function clearCollection(pb, collectionName, label) {
    try {
        const records = await pb.collection(collectionName).getFullList({ fields: 'id' });
        if (records.length === 0) return alert(`${label} zaten temiz.`);

        for (const record of records) {
            await pb.collection(collectionName).delete(record.id);
        }
        alert(`Başarılı: ${label} temizlendi.`);
        loadStats(pb);
    } catch (error) {
        alert("Hata: " + error.message);
    }
}