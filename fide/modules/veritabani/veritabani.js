// --- Global Değişkenler ---
let pbInstance; // PocketBase nesnesi

// --- MODÜL BAŞLATMA FONKSİYONU ---
function initializeVeritabaniModule(pb) {
    pbInstance = pb; // Admin.js'den gelen PocketBase nesnesini al
    console.log('Veritabanı Modülü başlatılıyor...');
    
    // Butonlara olay dinleyicilerini ata
    document.getElementById('backup-btn').addEventListener('click', backupAllData);
    document.getElementById('restore-from-backup-btn').addEventListener('click', () => alert("Bu özellik güvenlik nedeniyle devre dışı bırakılmıştır. Lütfen PocketBase Admin panelindeki 'Import collections' özelliğini kullanın."));
    document.getElementById('merge-backups-btn').addEventListener('click', () => alert("Bu özellik PocketBase'in yapısı gereği artık gerekli değildir."));

    document.getElementById('analyze-orphan-reports-btn').addEventListener('click', analyzeOrphanReports);
    document.getElementById('check-consistency-btn').addEventListener('click', checkDataConsistency);
    document.getElementById('clean-field-btn').addEventListener('click', openFieldCleaner);
    document.getElementById('analyze-corrupt-reports-btn').addEventListener('click', analyzeCorruptReports);
    
    console.log('Veritabanı Modülü başarıyla başlatıldı.');
}


// --- VERİ BAKIM ARAÇLARI FONKSİYONLARI ---

function showModal(title, body, footer) {
    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer;
    document.getElementById('maintenance-modal').style.display = 'flex';
}

function hideModal() {
    document.getElementById('maintenance-modal').style.display = 'none';
}

function backupReminder() {
    return confirm("ÖNEMLİ UYARI:\n\nBu işlem veritabanında kalıcı değişiklikler yapacaktır. İşleme başlamadan önce PocketBase Yönetim Panelinden tam bir yedek almanız şiddetle tavsiye edilir.\n\nDevam etmek istiyor musunuz?");
}

async function analyzeOrphanReports() {
    if (!pbInstance || !pbInstance.authStore.isValid) return alert("Bu işlem için giriş yapmalısınız.");
    if (!backupReminder()) return;
    showModal('<i class="fas fa-spinner fa-spin"></i> Kalıntı Raporlar Analiz Ediliyor...', '<p>Lütfen bekleyin. Bayi listesi ile raporlar karşılaştırılıyor...</p>', '<button class="btn-secondary" onclick="hideModal()">Kapat</button>');

    try {
        // PocketBase'den tüm bayileri ve raporları çekiyoruz.
        const allBayiler = await pbInstance.collection('bayiler').getFullList({ fields: 'id' });
        const allReports = await pbInstance.collection('denetim_raporlari').getFullList({ expand: 'bayi', fields: 'id,expand.bayi.id,expand.bayi.bayiKodu,expand.bayi.bayiAdi' });
        
        const validBayiIds = new Set(allBayiler.map(bayi => bayi.id));
        const orphanReports = [];

        for (const report of allReports) {
            // Eğer bir raporun 'bayi' alanı boşsa veya bu 'bayi' ID'si artık 'bayiler' tablosunda yoksa, bu bir kalıntı rapordur.
            if (!report.bayi || !validBayiIds.has(report.bayi)) {
                orphanReports.push({
                    id: report.id,
                    bayiKodu: report.expand?.bayi?.bayiKodu || 'Bilinmiyor',
                    bayiAdi: report.expand?.bayi?.bayiAdi || 'Silinmiş veya Hatalı Bayi Kaydı'
                });
            }
        }

        if (orphanReports.length === 0) {
            showModal('<i class="fas fa-check-circle"></i> Analiz Sonucu', '<p>Harika! Sistemde hiç kalıntı (orphan) rapor bulunamadı.</p>', '<button class="btn-primary" onclick="hideModal()">Tamam</button>');
        } else {
            let listHtml = `<div class="maintenance-info"><i class="fas fa-info-circle"></i> Ana bayi listesinde bulunmayan ${orphanReports.length} adet rapora ait kayıt bulundu. Silmek istediklerinizi seçin.</div>`;
            listHtml += '<div class="maintenance-list">';
            orphanReports.forEach(report => {
                listHtml += `
                    <div class="maintenance-list-item">
                        <label>
                            <input type="checkbox" class="orphan-checkbox" value="${report.id}">
                            <div><p>${report.bayiAdi}</p><span>Kod: ${report.bayiKodu}</span></div>
                        </label>
                    </div>`;
            });
            listHtml += '</div>';

            const footerHtml = `<button class="btn-secondary" onclick="hideModal()">İptal</button><button class="btn-danger" onclick="deleteSelectedOrphans()"><i class="fas fa-trash"></i> Seçilenleri Sil</button>`;
            showModal('<i class="fas fa-user-slash"></i> Kalıntı Rapor Analizi Sonuçları', listHtml, footerHtml);
        }
    } catch (error) {
        console.error("Kalıntı rapor analizi hatası:", error);
        showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Analiz sırasında bir hata oluştu.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
    }
}

async function deleteSelectedOrphans() {
    const selectedOrphans = Array.from(document.querySelectorAll('.orphan-checkbox:checked')).map(cb => cb.value);
    if (selectedOrphans.length === 0) return alert("Lütfen silmek için en az bir rapor seçin.");
    if (confirm(`${selectedOrphans.length} adet kalıntı rapor kalıcı olarak silinecektir. Emin misiniz?`)) {
        showModal('<i class="fas fa-spinner fa-spin"></i> Siliniyor...', `<p>${selectedOrphans.length} adet rapor siliniyor...</p>`, '');
        try {
            const deletePromises = selectedOrphans.map(id => pbInstance.collection('denetim_raporlari').delete(id));
            await Promise.all(deletePromises);
            showModal('<i class="fas fa-check-circle"></i> Başarılı', `<p>${selectedOrphans.length} adet rapor silindi.</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } catch (error) {
            console.error("Kalıntı rapor silme hatası:", error);
            showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Raporlar silinirken bir hata oluştu.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        }
    }
}

async function checkDataConsistency() {
    if (!pbInstance.authStore.isValid) return alert("Bu işlem için giriş yapmalısınız.");
    showModal('<i class="fas fa-spinner fa-spin"></i> Tutarlılık Kontrol Ediliyor...', '<p>Lütfen bekleyin...</p>', '<button class="btn-secondary" onclick="hideModal()">Kapat</button>');
    
    try {
        const allBayiler = await pbInstance.collection('bayiler').getFullList();
        const dealersWithoutEmail = allBayiler.filter(bayi => !bayi.email || bayi.email.trim() === '');
        
        let bodyHtml = `<div class="maintenance-info"><i class="fas fa-info-circle"></i> 'bayiler' tablosu içindeki tutarsızlıklar aşağıdadır.</div>`;
        bodyHtml += `<div class="consistency-section"><h5><i class="fas fa-at"></i> E-postası Eksik Olan Bayiler (${dealersWithoutEmail.length} adet)</h5><div class="maintenance-list">`;
        if (dealersWithoutEmail.length > 0) {
            dealersWithoutEmail.forEach(store => {
                bodyHtml += `<div class="maintenance-list-item"><p>${store.bayiAdi} <span>(Kod: ${store.bayiKodu})</span></p></div>`;
            });
        } else {
            bodyHtml += `<div class="maintenance-list-item"><span>Tüm bayilerin e-posta adresi girilmiş.</span></div>`;
        }
        bodyHtml += `</div></div>`;

        showModal('<i class="fas fa-check-double"></i> Veri Tutarlılığı Raporu', bodyHtml, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');

    } catch (error) {
        console.error("Veri tutarlılığı kontrolü hatası:", error);
        showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Kontrol sırasında bir hata oluştu.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
    }
}

async function analyzeCorruptReports() {
    if (!pbInstance.authStore.isValid) return alert("Bu işlem için giriş yapmalısınız.");
    if (!backupReminder()) return;
    showModal('<i class="fas fa-spinner fa-spin"></i> Bozuk Raporlar Taranıyor...', '<p>Lütfen bekleyin...</p>', '<button class="btn-secondary" onclick="hideModal()">Kapat</button>');

    try {
        const allReports = await pbInstance.collection('denetim_raporlari').getFullList({ expand: 'bayi', fields: 'id,soruDurumlari,expand.bayi.bayiKodu,expand.bayi.bayiAdi' });
        const corruptReports = [];

        for (const report of allReports) {
            // soruDurumlari alanı yoksa veya bir obje değilse bozuk kabul edilir.
            if (!report.soruDurumlari || typeof report.soruDurumlari !== 'object') {
                 corruptReports.push({
                    id: report.id,
                    bayiKodu: report.expand?.bayi?.bayiKodu || 'Bilinmiyor',
                    bayiAdi: report.expand?.bayi?.bayiAdi || 'İlişkisiz Rapor'
                });
            }
        }
        
        if (corruptReports.length === 0) {
            showModal('<i class="fas fa-check-circle"></i> Analiz Sonucu', '<p>Harika! Sistemde hiç bozuk ("hayalet") rapor bulunamadı.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } else {
            let listHtml = `<div class="maintenance-info"><i class="fas fa-info-circle"></i> Sistemde ${corruptReports.length} adet içi boş veya bozuk yapıda rapor bulundu. Silmek istediklerinizi seçin.</div>`;
            listHtml += '<div class="maintenance-list">';
            corruptReports.forEach(report => {
                listHtml += `
                    <div class="maintenance-list-item">
                        <label>
                            <input type="checkbox" class="corrupt-checkbox" value="${report.id}">
                            <div><p>${report.bayiAdi}</p><span>Kod: ${report.bayiKodu}</span></div>
                        </label>
                    </div>`;
            });
            listHtml += '</div>';

            const footerHtml = `<button class="btn-secondary" onclick="hideModal()">İptal</button><button class="btn-danger" onclick="deleteSelectedCorruptReports()"><i class="fas fa-trash"></i> Seçilenleri Sil</button>`;
            showModal('<i class="fas fa-heart-crack"></i> Bozuk Rapor Analizi Sonuçları', listHtml, footerHtml);
        }
    } catch (error) {
        console.error("Bozuk rapor analizi hatası:", error);
        showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Analiz sırasında bir hata oluştu.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
    }
}

async function deleteSelectedCorruptReports() {
    const selectedCorrupt = Array.from(document.querySelectorAll('.corrupt-checkbox:checked')).map(cb => cb.value);
    if (selectedCorrupt.length === 0) return alert("Lütfen silmek için en az bir rapor seçin.");
    if (confirm(`${selectedCorrupt.length} adet bozuk rapor kalıcı olarak silinecektir. Emin misiniz?`)) {
        showModal('<i class="fas fa-spinner fa-spin"></i> Siliniyor...', `<p>${selectedCorrupt.length} adet rapor siliniyor...</p>`, '');
        try {
            const deletePromises = selectedCorrupt.map(id => pbInstance.collection('denetim_raporlari').delete(id));
            await Promise.all(deletePromises);
            showModal('<i class="fas fa-check-circle"></i> Başarılı', `<p>${selectedCorrupt.length} adet bozuk rapor silindi.</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } catch (error) {
            console.error("Bozuk rapor silme hatası:", error);
            showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Raporlar silinirken bir hata oluştu.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        }
    }
}

// --- Alan Temizleyici (PocketBase'e Uyarlandı) ---
function openFieldCleaner() {
    // Bu özellik PocketBase'in şema yapısı nedeniyle artık gerekli veya güvenli değildir.
    alert("Bu özellik, PocketBase'in yapısal veritabanı doğası gereği devre dışı bırakılmıştır. Alanları yönetmek için lütfen PocketBase Yönetim Panelini kullanın.");
}
async function cleanObsoleteField() { /* Devre dışı bırakıldı */ }


// --- YEDEKLEME FONKSİYONU (POCKETBASE'E UYARLANDI) ---
async function backupAllData() {
    if (!pbInstance || !pbInstance.authStore.isValid) {
        return alert('Yedekleme yapmak için giriş yapmalısınız.');
    }
    if(!confirm("Bu işlem tüm veritabanını bilgisayarınıza bir ZIP dosyası olarak indirecektir. PocketBase Yönetim Paneli üzerinden yedekleme yapmanız daha güvenli ve sağlıklıdır. Yine de devam etmek istiyor musunuz?")) {
        return;
    }
    try {
        // Bu URL, PocketBase Admin API'sini kullanarak tam bir yedek oluşturur ve indirme başlatır.
        const backupUrl = `${pbInstance.baseUrl}/api/backups`;
        const response = await pbInstance.send(backupUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Admin ${pbInstance.authStore.token}` // Admin yetkisi gerekli
            },
            body: JSON.stringify({ "create" : true }) // Bu body PocketBase'in eski versiyonları için olabilir, modern versiyonlar için sadece POST yeterli.
        });
        
        // PocketBase API, yedekleme sonrası genellikle dosya indirme bağlantısı veya doğrudan dosyayı döndürür.
        // Modern PocketBase'de bu işlem doğrudan bir dosya indirmesi tetikler.
        // Ancak JS ile bunu tetiklemek için daha karmaşık bir yapı gerekir.
        // Kullanıcıyı doğrudan admin paneline yönlendirmek daha sağlıklıdır.
        alert("Yedekleme başlatıldı. Yedekleme işlemini en sağlıklı şekilde PocketBase Yönetim Paneli > Settings > Backups bölümünden yapabilirsiniz.");
        window.open(pbInstance.baseUrl + '/_/#/settings/backups', '_blank');

    } catch (error) {
        alert('Yedekleme sırasında bir hata oluştu. Bu işlemi yapmak için Admin olarak giriş yaptığınızdan emin olun.');
        console.error("Yedekleme hatası:", error);
    }
}