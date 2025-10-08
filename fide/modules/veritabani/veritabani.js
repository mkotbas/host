// Bu dosya, sadece Veritabanı Modülü'nün işlevselliğini içerir.

/**
 * Modülün ihtiyaç duyduğu bayi listesini buluttan çeker.
 * @returns {Promise<Array>} Bayi listesini içeren bir Array döndürür.
 */
async function getStoreListFromCloud() {
    try {
        const dideRef = database.ref('excelData/dide');
        const dideSnapshot = await dideRef.once('value');
        if (dideSnapshot.exists()) {
            const dideData = dideSnapshot.val().data || [];
            const storeMap = new Map();
            dideData.forEach(row => {
                if (row['Bayi Kodu'] && !storeMap.has(row['Bayi Kodu'])) {
                    storeMap.set(row['Bayi Kodu'], { bayiKodu: row['Bayi Kodu'], bayiAdi: row['Bayi'] });
                }
            });
            return Array.from(storeMap.values());
        }
    } catch (error) {
        console.error("Buluttan bayi listesi alınırken hata oluştu:", error);
    }
    return []; // Hata durumunda veya veri yoksa boş liste döndür
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
    return confirm("ÖNEMLİ UYARI:\n\nBu işlem veritabanında kalıcı değişiklikler yapacaktır. İşleme başlamadan önce 'Raporları Yedekle' butonunu kullanarak verilerinizin tamamını yedeklemeniz şiddetle tavsiye edilir.\n\nYedek aldınız mı veya bu riski kabul ederek devam etmek istiyor musunuz?");
}

async function analyzeOrphanReports() {
    if (!auth.currentUser) return alert("Bu işlem için giriş yapmalısınız.");
    if (!backupReminder()) return;
    showModal(
        '<i class="fas fa-spinner fa-spin"></i> Kalıntı Raporlar Analiz Ediliyor...',
        '<p>Lütfen bekleyin. Ana bayi listesi ile tüm raporlar karşılaştırılıyor...</p>',
        '<button class="btn-secondary" onclick="hideModal()">Kapat</button>'
    );

    try {
        const reportsSnapshot = await database.ref('allFideReports').once('value');
        const storesSnapshot = await database.ref('tumBayilerListesi/stores').once('value');

        if (!reportsSnapshot.exists() || !storesSnapshot.exists()) {
            showModal('<i class="fas fa-info-circle"></i> Analiz Tamamlandı', '<p>Analiz için yeterli veri bulunamadı (Raporlar veya ana bayi listesi boş).</p>', '<button class="btn-primary" onclick="hideModal()">Tamam</button>');
            return;
        }

        const allReports = reportsSnapshot.val();
        const validStoreCodes = new Set(storesSnapshot.val().map(store => String(store.bayiKodu)));
        const orphanReports = [];

        for (const reportKey in allReports) {
            const bayiKodu = reportKey.replace('store_', '');
            if (!validStoreCodes.has(bayiKodu)) {
                const reportData = allReports[reportKey].data;
                orphanReports.push({
                    key: reportKey,
                    bayiKodu: bayiKodu,
                    bayiAdi: reportData.selectedStore ? reportData.selectedStore.bayiAdi : 'Bilinmeyen Bayi'
                });
            }
        }

        if (orphanReports.length === 0) {
            showModal('<i class="fas fa-check-circle"></i> Analiz Sonucu', '<p>Harika! Sistemde hiç kalıntı (orphan) rapor bulunamadı. Veritabanınız temiz.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } else {
            let listHtml = `<div class="maintenance-info"><i class="fas fa-info-circle"></i> Ana bayi listesinde bulunmayan ${orphanReports.length} adet rapora ait kayıt bulundu. Silmek istediklerinizi seçin.</div>`;
            listHtml += '<div class="maintenance-list">';
            orphanReports.forEach(report => {
                listHtml += `
                    <div class="maintenance-list-item">
                        <label>
                            <input type="checkbox" class="orphan-checkbox" value="${report.key}">
                            <div>
                                <p>${report.bayiAdi}</p>
                                <span>Kod: ${report.bayiKodu}</span>
                            </div>
                        </label>
                    </div>`;
            });
            listHtml += '</div>';

            const footerHtml = `
                <button class="btn-secondary" onclick="hideModal()">İptal</button>
                <button class="btn-danger" onclick="deleteSelectedOrphans()"><i class="fas fa-trash"></i> Seçilenleri Kalıcı Olarak Sil</button>
            `;
            showModal('<i class="fas fa-user-slash"></i> Kalıntı Rapor Analizi Sonuçları', listHtml, footerHtml);
        }

    } catch (error) {
        console.error("Kalıntı rapor analizi hatası:", error);
        showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Analiz sırasında bir hata oluştu. Lütfen konsolu kontrol edin.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
    }
}

async function deleteSelectedOrphans() {
    const selectedOrphans = Array.from(document.querySelectorAll('.orphan-checkbox:checked')).map(cb => cb.value);
    if (selectedOrphans.length === 0) {
        return alert("Lütfen silmek için en az bir rapor seçin.");
    }
    if (confirm(`${selectedOrphans.length} adet kalıntı rapor kalıcı olarak silinecektir. Bu işlem geri alınamaz. Emin misiniz?`)) {
        showModal(
            '<i class="fas fa-spinner fa-spin"></i> Siliniyor...',
            `<p>${selectedOrphans.length} adet rapor siliniyor, lütfen bekleyin...</p>`,
            ''
        );
        try {
            const updates = {};
            selectedOrphans.forEach(key => {
                updates[`/allFideReports/${key}`] = null;
            });
            await database.ref().update(updates);
            showModal('<i class="fas fa-check-circle"></i> Başarılı', `<p>${selectedOrphans.length} adet kalıntı rapor başarıyla silindi.</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } catch (error) {
            console.error("Kalıntı rapor silme hatası:", error);
            showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Raporlar silinirken bir hata oluştu. Lütfen konsolu kontrol edin.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        }
    }
}

async function checkDataConsistency() {
    if (!auth.currentUser) return alert("Bu işlem için giriş yapmalısınız.");
    showModal('<i class="fas fa-spinner fa-spin"></i> Tutarlılık Kontrol Ediliyor...', '<p>Lütfen bekleyin. Bayi listeleri karşılaştırılıyor...</p>', '<button class="btn-secondary" onclick="hideModal()">Kapat</button>');
    
    try {
        const storesSnapshot = await database.ref('tumBayilerListesi/stores').once('value');
        const emailsSnapshot = await database.ref('storeEmails').once('value');

        const mainStoreList = storesSnapshot.exists() ? storesSnapshot.val() : [];
        const emailList = emailsSnapshot.exists() ? emailsSnapshot.val() : {};

        const mainStoreCodes = new Set(mainStoreList.map(s => String(s.bayiKodu)));
        const emailStoreCodes = new Set(Object.keys(emailList).map(String));

        const dealersWithoutEmail = mainStoreList.filter(store => !emailStoreCodes.has(String(store.bayiKodu)));
        const emailsWithoutDealer = Object.keys(emailList).filter(code => !mainStoreCodes.has(String(code)));
        
        let bodyHtml = `<div class="maintenance-info"><i class="fas fa-info-circle"></i> Bayi ana listesi ('tumBayilerListesi') ile bayi e-posta listesi ('storeEmails') arasındaki tutarsızlıklar aşağıdadır.</div>`;
        
        bodyHtml += `<div class="consistency-section"><h5><i class="fas fa-at"></i> E-postası Eksik Olan Bayiler (${dealersWithoutEmail.length} adet)</h5><div class="maintenance-list">`;
        if (dealersWithoutEmail.length > 0) {
            dealersWithoutEmail.forEach(store => {
                bodyHtml += `<div class="maintenance-list-item"><p>${store.bayiAdi} <span>(Kod: ${store.bayiKodu})</span></p></div>`;
            });
        } else {
            bodyHtml += `<div class="maintenance-list-item"><span>Tüm bayilerin e-posta adresi girilmiş.</span></div>`;
        }
        bodyHtml += `</div></div>`;
        
        bodyHtml += `<div class="consistency-section"><h5><i class="fas fa-user-times"></i> Ana Listede Olmayan E-posta Kayıtları (${emailsWithoutDealer.length} adet)</h5><div class="maintenance-list">`;
        if (emailsWithoutDealer.length > 0) {
            emailsWithoutDealer.forEach(code => {
                bodyHtml += `<div class="maintenance-list-item"><p>${emailList[code]} <span>(Kod: ${code})</span></p></div>`;
            });
        } else {
            bodyHtml += `<div class="maintenance-list-item"><span>Listede olmayan e-posta kaydı bulunamadı.</span></div>`;
        }
        bodyHtml += `</div></div>`;

        showModal('<i class="fas fa-check-double"></i> Veri Tutarlılığı Raporu', bodyHtml, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');

    } catch (error) {
        console.error("Veri tutarlılığı kontrolü hatası:", error);
        showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Kontrol sırasında bir hata oluştu. Lütfen konsolu kontrol edin.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
    }
}

function openFieldCleaner() {
    if (!auth.currentUser) return alert("Bu işlem için giriş yapmalısınız.");
    const bodyHtml = `
        <div class="maintenance-info"><i class="fas fa-exclamation-triangle"></i> <strong>DİKKAT:</strong> Bu işlem tehlikelidir ve geri alınamaz. Sadece ne yaptığınızdan eminseniz kullanın.</div>
        <div class="field-cleaner-form">
            <label for="field-to-clean">Tüm raporlardan silmek istediğiniz alanın adını yazın:</label>
            <input type="text" id="field-to-clean" placeholder="Örn: isSpecialVisit">
            <small>Bu alan, tüm raporların içindeki 'data' objesinden silinecektir.</small>
        </div>
    `;
    const footerHtml = `
        <button class="btn-secondary" onclick="hideModal()">İptal</button>
        <button class="btn-danger" onclick="cleanObsoleteField()"><i class="fas fa-eraser"></i> Yazılan Alanı Temizle</button>
    `;
    showModal('<i class="fas fa-broom"></i> Gereksiz Alan Temizleyici', bodyHtml, footerHtml);
}

async function cleanObsoleteField() {
    const fieldName = document.getElementById('field-to-clean').value.trim();
    if (!fieldName) {
        return alert("Lütfen silmek istediğiniz alanın adını girin.");
    }
    if (!backupReminder()) return;
    if (confirm(`'${fieldName}' isimli alanı tüm raporlardan kalıcı olarak silmek üzeresiniz.\n\nBU İŞLEM GERİ ALINAMAZ!\n\nDevam etmek istediğinizden kesinlikle emin misiniz?`)) {
        showModal('<i class="fas fa-spinner fa-spin"></i> Temizleniyor...', `<p>'${fieldName}' alanı tüm raporlardan siliniyor. Lütfen bekleyin...</p>`, '');

        try {
            const reportsRef = database.ref('allFideReports');
            const snapshot = await reportsRef.once('value');
            if (!snapshot.exists()) {
                 showModal('<i class="fas fa-info-circle"></i> Bilgi', '<p>Temizlenecek rapor bulunamadı.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
                 return;
            }
            
            const updates = {};
            let fieldsFound = 0;
            snapshot.forEach(childSnapshot => {
                if (childSnapshot.child('data').hasChild(fieldName)) {
                    updates[`/${childSnapshot.key}/data/${fieldName}`] = null;
                    fieldsFound++;
                }
            });

            if (fieldsFound > 0) {
                await reportsRef.update(updates);
                showModal('<i class="fas fa-check-circle"></i> Başarılı', `<p>${fieldsFound} adet raporda bulunan '${fieldName}' alanı başarıyla silindi.</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
            } else {
                showModal('<i class="fas fa-info-circle"></i> Bilgi', `<p>Hiçbir raporda '${fieldName}' alanı bulunamadı. Veritabanı zaten temiz.</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
            }

        } catch (error) {
            console.error("Alan temizleme hatası:", error);
            showModal('<i class="fas fa-exclamation-triangle"></i> Hata', `<p>Temizleme sırasında bir hata oluştu: ${error.message}</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        }
    }
}

async function analyzeCorruptReports() {
    if (!auth.currentUser) return alert("Bu işlem için giriş yapmalısınız.");
    if (!backupReminder()) return;
    showModal(
        '<i class="fas fa-spinner fa-spin"></i> Bozuk Raporlar Taranıyor...',
        '<p>Lütfen bekleyin. Tüm raporların yapısı kontrol ediliyor...</p>',
        '<button class="btn-secondary" onclick="hideModal()">Kapat</button>'
    );

    try {
        const reportsSnapshot = await database.ref('allFideReports').once('value');
        if (!reportsSnapshot.exists()) {
            showModal('<i class="fas fa-info-circle"></i> Analiz Tamamlandı', '<p>Veritabanında analiz edilecek rapor bulunamadı.</p>', '<button class="btn-primary" onclick="hideModal()">Tamam</button>');
            return;
        }
        
        const uniqueStores = await getStoreListFromCloud(); // Bayi listesini buluttan çek
        const allReports = reportsSnapshot.val();
        const corruptReports = [];

        for (const reportKey in allReports) {
            const report = allReports[reportKey];
            if (!report.data || !report.data.questions_status) {
                const bayiKodu = reportKey.replace('store_', '');
                const storeInfo = uniqueStores.find(s => String(s.bayiKodu) === String(bayiKodu));
                const bayiAdi = storeInfo ? storeInfo.bayiAdi : 'Bilinmeyen Bayi';

                corruptReports.push({
                    key: reportKey,
                    bayiKodu: bayiKodu,
                    bayiAdi: bayiAdi
                });
            }
        }

        if (corruptReports.length === 0) {
            showModal('<i class="fas fa-check-circle"></i> Analiz Sonucu', '<p>Harika! Sistemde hiç bozuk ("hayalet") rapor bulunamadı. Veritabanınız temiz.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } else {
            let listHtml = `<div class="maintenance-info"><i class="fas fa-info-circle"></i> Sistemde ${corruptReports.length} adet içi boş veya bozuk yapıda rapor bulundu. Bu raporlar uygulamanın hata vermesine neden olur. Silmek istediklerinizi seçin.</div>`;
            listHtml += '<div class="maintenance-list">';
            corruptReports.forEach(report => {
                listHtml += `
                    <div class="maintenance-list-item">
                        <label>
                            <input type="checkbox" class="corrupt-checkbox" value="${report.key}">
                            <div>
                                <p>${report.bayiAdi}</p>
                                <span>Kod: ${report.bayiKodu}</span>
                            </div>
                        </label>
                    </div>`;
            });
            listHtml += '</div>';

            const footerHtml = `
                <button class="btn-secondary" onclick="hideModal()">İptal</button>
                <button class="btn-danger" onclick="deleteSelectedCorruptReports()"><i class="fas fa-trash"></i> Seçilenleri Kalıcı Olarak Sil</button>
            `;
            showModal('<i class="fas fa-heart-crack"></i> Bozuk Rapor Analizi Sonuçları', listHtml, footerHtml);
        }

    } catch (error) {
        console.error("Bozuk rapor analizi hatası:", error);
        showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Analiz sırasında bir hata oluştu. Lütfen konsolu kontrol edin.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
    }
}

async function deleteSelectedCorruptReports() {
    const selectedCorrupt = Array.from(document.querySelectorAll('.corrupt-checkbox:checked')).map(cb => cb.value);
    if (selectedCorrupt.length === 0) {
        return alert("Lütfen silmek için en az bir rapor seçin.");
    }
    if (confirm(`${selectedCorrupt.length} adet bozuk rapor kalıcı olarak silinecektir. Bu işlem geri alınamaz. Emin misiniz?`)) {
        showModal(
            '<i class="fas fa-spinner fa-spin"></i> Siliniyor...',
            `<p>${selectedCorrupt.length} adet rapor siliniyor, lütfen bekleyin...</p>`,
            ''
        );
        try {
            const updates = {};
            selectedCorrupt.forEach(key => {
                updates[`/allFideReports/${key}`] = null;
            });
            await database.ref().update(updates);
            showModal('<i class="fas fa-check-circle"></i> Başarılı', `<p>${selectedCorrupt.length} adet bozuk rapor başarıyla silindi.</p>`, '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        } catch (error) {
            console.error("Bozuk rapor silme hatası:", error);
            showModal('<i class="fas fa-exclamation-triangle"></i> Hata', '<p>Raporlar silinirken bir hata oluştu. Lütfen konsolu kontrol edin.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');
        }
    }
}


// --- YEDEKLEME VE GERİ YÜKLEME FONKSİYONLARI ---

async function backupAllReports() {
    if (!auth.currentUser || !database) {
        return alert('Yedekleme yapmak için giriş yapmalısınız.');
    }
    try {
        const reportsRef = database.ref();
        const snapshot = await reportsRef.once('value');
        if (!snapshot.exists()) {
            return alert('Yedeklenecek veri bulunamadı.');
        }
        const allData = JSON.stringify(snapshot.val());
        const blob = new Blob([allData], { type: 'application/json;charset=utf-8' });
        const today = new Date().toISOString().slice(0, 10);
        const filename = `fideraporuygulamasi_full_backup_${today}.json`;
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    } catch (error) {
        alert('Yedekleme sırasında bir hata oluştu.');
        console.error("Yedekleme hatası:", error);
    }
}

async function handleRestoreUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!auth.currentUser || !database) {
        return alert('Yedek yüklemek için giriş yapmalısınız.');
    }

    if (confirm("Bu işlem, buluttaki mevcut tüm verilerin üzerine yazılacaktır. Devam etmek istediğinizden emin misiniz?")) {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const restoredData = JSON.parse(e.target.result);
                await database.ref().set(restoredData);
                alert('Yedek başarıyla buluta geri yüklendi! Değişikliklerin yansıması için sayfa yenileniyor.');
                // Sayfayı yenilemek yerine admin panelinde bir bildirim gösterebiliriz.
                showModal('<i class="fas fa-check-circle"></i> Başarılı', '<p>Yedek başarıyla geri yüklendi.</p>', '<button class="btn-primary" onclick="hideModal()">Kapat</button>');

            } catch (error) {
                alert('Geçersiz veya bozuk yedek dosyası! Yükleme başarısız oldu.');
                console.error("Yedek yükleme hatası:", error);
            }
        };
        reader.readAsText(file);
    }
    event.target.value = null; 
}

async function handleMergeUpload(event) {
    const files = event.target.files;
    if (!files || files.length < 2) { alert("Lütfen birleştirmek için en az 2 yedek dosyası seçin."); return; }
    let mergedReports = {};
    let fileReadPromises = [];
    for (const file of files) {
        const promise = new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    const reportData = data.allFideReports ? data.allFideReports : data;
                    resolve(reportData);
                } catch (err) { reject(`'${file.name}' dosyası okunamadı.`); }
            };
            reader.onerror = () => reject(`'${file.name}' dosyası okunurken bir hata oluştu.`);
            reader.readAsText(file);
        });
        fileReadPromises.push(promise);
    }
    try {
        const allBackupData = await Promise.all(fileReadPromises);
        allBackupData.forEach(backupData => {
            for (const storeKey in backupData) {
                if (Object.hasOwnProperty.call(backupData, storeKey)) {
                    const newReport = backupData[storeKey];
                    if (!mergedReports[storeKey] || newReport.timestamp > mergedReports[storeKey].timestamp) {
                        mergedReports[storeKey] = newReport;
                    }
                }
            }
        });
        const finalMergedData = { allFideReports: mergedReports };
        const mergedDataStr = JSON.stringify(finalMergedData, null, 2);
        const blob = new Blob([mergedDataStr], { type: 'application/json;charset=utf-8' });
        const today = new Date().toISOString().slice(0, 10);
        const filename = `birlesik_fide_rapor_yedek_${today}.json`;
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        alert(`Başarılı! ${Object.keys(mergedReports).length} adet güncel raporu içeren birleştirilmiş yedek dosyanız '${filename}' adıyla indirildi.`);
    } catch (error) {
        alert("Birleştirme sırasında bir hata oluştu:\n" + error);
        console.error("Yedek birleştirme hatası:", error);
    } finally {
        event.target.value = null; 
    }
}


/**
 * Bu fonksiyon, modül yüklendiğinde admin.js tarafından çağrılır.
 * Modül içindeki tüm butonlara ve elementlere olay dinleyicilerini atar.
 */
function initializeVeritabaniModule() {
    console.log('Veritabanı Modülü başlatılıyor...');
    
    // Yedekleme ve Geri Yükleme Butonları
    document.getElementById('backup-btn').addEventListener('click', backupAllReports);
    document.getElementById('restore-from-backup-btn').addEventListener('click', () => document.getElementById('restore-file-input').click());
    document.getElementById('merge-backups-btn').addEventListener('click', () => document.getElementById('merge-file-input').click());
    
    // Gizli Dosya Input'ları
    document.getElementById('restore-file-input').addEventListener('change', handleRestoreUpload);
    document.getElementById('merge-file-input').addEventListener('change', handleMergeUpload);

    // Veri Bakım Araçları Butonları
    document.getElementById('analyze-orphan-reports-btn').addEventListener('click', analyzeOrphanReports);
    document.getElementById('check-consistency-btn').addEventListener('click', checkDataConsistency);
    document.getElementById('clean-field-btn').addEventListener('click', openFieldCleaner);
    document.getElementById('analyze-corrupt-reports-btn').addEventListener('click', analyzeCorruptReports);
    
    console.log('Veritabanı Modülü başarıyla başlatıldı.');
}