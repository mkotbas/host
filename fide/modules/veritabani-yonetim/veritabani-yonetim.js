// --- YÖNETİM PANELİ ANA KODLARI ---
let pbInstance = null;
let allStores = [];
let allUsers = []; // Kullanıcı listesi için
let selectedStoreForDeletion = null;

export async function initializeVeritabaniYonetimModule(pb) {
    pbInstance = pb;
    showLoading(true, "Veritabanı Yönetim modülü yükleniyor...");
    
    try {
        if (pbInstance && pbInstance.authStore.isValid) {
            await loadInitialData();
            setupModuleEventListeners();
            populateTableManagement(); // Tüm tablo mantığı artık bu fonksiyonda
        } else {
            const container = document.getElementById('module-container');
            if(container) container.innerHTML = '<p style="text-align:center;">Bu modülü kullanmak için lütfen sisteme giriş yapın.</p>';
        }
    } catch (error) {
        handleError(error, "Modül başlatılırken bir hata oluştu.");
    } finally {
        showLoading(false);
    }
}

async function loadInitialData() {
    try {
        // Bayi listesi ve kullanıcı listesini aynı anda çek
        const storesPromise = pbInstance.collection('bayiler').getFullList({ sort: 'bayiAdi' });
        const usersPromise = pbInstance.collection('users').getFullList({ sort: 'name' }); // 'name' alanına göre sıralı

        [allStores, allUsers] = await Promise.all([storesPromise, usersPromise]);

    } catch (error) {
        handleError(error, "Bayi veya kullanıcı listesi yüklenemedi.");
        allStores = [];
        allUsers = [];
    }
}

function setupModuleEventListeners() {
    const listenerKey = 'veritabaniYonetimListenersAttached';
    if (document.body.dataset[listenerKey]) return;
    document.body.dataset[listenerKey] = 'true';

    // Grup 1 Dinleyicileri
    document.getElementById('bayi-arama-silme-input').addEventListener('keyup', searchStoreForDeletion);
    document.getElementById('sil-bayi-raporlari-btn').addEventListener('click', deleteBayiRaporlari);
    
    // Grup 2 Eylemleri 'populateTableManagement' içinde dinamik olarak atanıyor.

    // Modal Dinleyicileri
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => showModal(false));
    
    // KALDIRILDI: Gizli dosya yükleme input'u için olay dinleyicisi kaldırıldı.
    // const uploader = document.getElementById('tablo-yukle-input');
    // if (uploader) uploader.addEventListener('change', uploadTableData); 
}


// --- Kullanıcı ve Bayi Silme Fonksiyonları (Modal ve Eylem) ---

/**
 * (Güvenli Senaryo 1)
 * "Kullanıcıyı ve Raporlarını Sil" eylemi için modalı (açılır pencere) açar.
 */
function openUserDeletionModal() {
    let modalBodyHtml = `
        <div class="info-box warning">
            <p><i class="fas fa-exclamation-triangle"></i> <strong>ÖNEMLİ:</strong> Bu işlem, seçilen kullanıcıyı ve o kullanıcının <strong>denetim raporlarını</strong> siler. Kullanıcıya atanmış bayiler <strong>SİLİNMEZ</strong>, "Atanmamış" olarak güncellenir.</p>
        </div>
        <div class="complex-action">
            <label for="modal-kullanici-silme-select">Silinecek Kullanıcıyı Seçin:</label>
            <select id="modal-kullanici-silme-select" class="form-control">
                <option value="">-- Bir kullanıcı seçin --</option>
                ${allUsers.map(user => {
                    if (user.id === pbInstance.authStore.model.id) return '';
                    return `<option value="${user.id}">${user.name || 'İsimsiz'} (${user.email})</option>`;
                }).join('')}
            </select>
            <div class="custom-checkbox" style="margin-top: 15px;">
                <input type="checkbox" id="modal-kullanici-silme-onay">
                <label for="modal-kullanici-silme-onay">Seçilen kullanıcının ve raporlarının silineceğini, bayilerinin "Atanmamış" olacağını anladım ve onaylıyorum.</label>
            </div>
            <div id="modal-kullanici-silme-sonuc" class="results-area" style="margin-top: 10px;"></div>
        </div>
    `;

    const actionButton = document.createElement('button');
    actionButton.id = 'modal-action-btn';
    actionButton.className = 'btn-warning'; 
    actionButton.innerHTML = '<i class="fas fa-user-slash"></i> Silme İşlemini Onayla';
    actionButton.disabled = true;

    showModal(true, 'Kullanıcıyı ve Raporlarını Sil (Güvenli Yol)', modalBodyHtml, actionButton);

    const select = document.getElementById('modal-kullanici-silme-select');
    const check = document.getElementById('modal-kullanici-silme-onay');
    const checkButtonState = () => {
        actionButton.disabled = !(select.value && check.checked);
    };
    
    select.addEventListener('change', checkButtonState);
    check.addEventListener('change', checkButtonState);
    actionButton.addEventListener('click', handleDeleteUserAndData_Modal);
}

/**
 * (Güvenli Senaryo 1)
 * Modal içindeki "Onayla" butonuna basıldığında çalışan ana eylem.
 * (GÜNCELLENDİ: 'user_devices' temizleme adımı eklendi)
 */
async function handleDeleteUserAndData_Modal() {
    const userSelect = document.getElementById('modal-kullanici-silme-select');
    const onayCheck = document.getElementById('modal-kullanici-silme-onay');
    const deleteBtn = document.getElementById('modal-action-btn');
    const resultsDiv = document.getElementById('modal-kullanici-silme-sonuc');

    const userId = userSelect.value;
    if (!userId || !onayCheck.checked) {
        alert("Lütfen bir kullanıcı seçin ve onayı işaretleyin.");
        return;
    }

    const selectedUser = allUsers.find(u => u.id === userId);
    const userName = selectedUser ? (selectedUser.name || selectedUser.email) : 'Bilinmeyen Kullanıcı';

    // Güvenlik teyidi - Bu modal içinde olduğu için aslında gerekmeyebilir ancak ekstra güvenlik katmanı
    if (!confirm(`'${userName}' adlı kullanıcıyı ve raporlarını silmek üzeresiniz. Bayileri 'Atanmamış' olarak güncellenecek. Emin misiniz?`)) {
        return;
    }

    showLoading(true, `'${userName}' için 4 adımlı silme işlemi başlatıldı...`);
    deleteBtn.disabled = true;
    userSelect.disabled = true;
    onayCheck.disabled = true;
    resultsDiv.innerHTML = 'İşlem başlatıldı...';

    try {
        // --- Adım 1: Kullanıcıya ait 'denetim_raporlari'nı sil ---
        resultsDiv.innerHTML = `Adım 1/4: '${userName}' kullanıcısına ait denetim raporları aranıyor...`;
        const reports = await pbInstance.collection('denetim_raporlari').getFullList({ filter: `user = "${userId}"`, fields: 'id' });
        if (reports.length > 0) {
            resultsDiv.innerHTML = `Adım 1/4: ${reports.length} adet denetim raporu siliniyor...`;
            const deletePromises = reports.map(r => pbInstance.collection('denetim_raporlari').delete(r.id));
            await Promise.all(deletePromises);
            resultsDiv.innerHTML = `Adım 1/4: ${reports.length} adet denetim raporu başarıyla silindi.`;
        } else { resultsDiv.innerHTML = `Adım 1/4: Kullanıcıya ait denetim raporu bulunamadı.`; }

        // --- Adım 2: Kullanıcıya atanmış 'bayiler'in 'sorumlu_kullanici' alanını null yap ---
        resultsDiv.innerHTML += `<br>Adım 2/4: '${userName}' kullanıcısına atanmış bayiler aranıyor...`;
        const bayiler = await pbInstance.collection('bayiler').getFullList({ filter: `sorumlu_kullanici = "${userId}"`, fields: 'id' });
        if (bayiler.length > 0) {
            resultsDiv.innerHTML += `<br>Adım 2/4: ${bayiler.length} adet bayi ataması kaldırılıyor...`;
            const updatePromises = bayiler.map(b => pbInstance.collection('bayiler').update(b.id, { 'sorumlu_kullanici': null }));
            await Promise.all(updatePromises);
            resultsDiv.innerHTML += `<br>Adım 2/4: ${bayiler.length} adet bayi ataması başarıyla kaldırıldı.`;
        } else { resultsDiv.innerHTML += `<br>Adım 2/4: Kullanıcıya atanmış bayi bulunamadı.`; }
        
        // --- YENİ ADIM (Adım 3): Kullanıcıya ait 'user_devices' kayıtlarını sil ---
        resultsDiv.innerHTML += `<br>Adım 3/4: '${userName}' kullanıcısına ait cihaz kayıtları aranıyor...`;
        const devices = await pbInstance.collection('user_devices').getFullList({ filter: `user = "${userId}"`, fields: 'id' });
        if (devices.length > 0) {
            resultsDiv.innerHTML += `<br>Adım 3/4: ${devices.length} adet cihaz kaydı siliniyor...`;
            const deleteDevicePromises = devices.map(d => pbInstance.collection('user_devices').delete(d.id));
            await Promise.all(deleteDevicePromises);
            resultsDiv.innerHTML += `<br>Adım 3/4: ${devices.length} adet cihaz kaydı başarıyla silindi.`;
        } else { resultsDiv.innerHTML += `<br>Adım 3/4: Kullanıcıya ait cihaz kaydı bulunamadı.`; }

        // --- Adım 4 (Eski Adım 3): Kullanıcıyı 'users' tablosundan sil ---
        resultsDiv.innerHTML += `<br>Adım 4/4: '${userName}' kullanıcısı sistemden siliniyor...`;
        await pbInstance.collection('users').delete(userId);
        resultsDiv.innerHTML += `<br>Adım 4/4: Kullanıcı başarıyla silindi.`;
        resultsDiv.innerHTML += `<br><br><strong style="color: green;">GÜVENLİ SİLME TAMAMLANDI.</strong>`;
        
        await loadInitialData(); // Verileri yenile
        
        // Modaldaki select'i güncelle
        const newSelectHtml = allUsers.map(user => {
            if (user.id === pbInstance.authStore.model.id || user.id === userId) return '';
            return `<option value="${user.id}">${user.name || 'İsimsiz'} (${user.email})</option>`;
        }).join('');
        userSelect.innerHTML = '<option value="">-- Bir kullanıcı seçin --</option>' + newSelectHtml;

    } catch (error) {
        handleError(error, "Kullanıcı silme işlemi sırasında kritik bir hata oluştu.");
        resultsDiv.innerHTML += `<br><strong style="color: red;">HATA: ${error.message}</strong>`;
    } finally {
        showLoading(false); // Global yükleyiciyi kapat
        // Modal kontrollerini sıfırla
        onayCheck.checked = false;
        userSelect.value = '';
        userSelect.disabled = false;
        onayCheck.disabled = false;
        const checkButtonState = () => { deleteBtn.disabled = !(userSelect.value && onayCheck.checked); };
        checkButtonState(); 
    }
}

/**
 * (Yıkıcı Senaryo 2 - YENİ MODAL)
 * "Atanmamış Bayileri Temizle" eylemi için modalı açar.
 * (GÜNCELLENDİ: HTML yapısı düzeltildi)
 */
function openUnassignedBayiDeletionModal() {
    const unassignedBayiler = allStores.filter(s => !s.sorumlu_kullanici);
    const unassignedCount = unassignedBayiler.length;

    if (unassignedCount === 0) {
        alert("Sistemde 'Atanmamış' bayi bulunamadı. İşlem yapılmasına gerek yok.");
        return;
    }

    // (DÜZELTME) HTML, sıkışmayı önlemek için tek bir <p> etiketi içine alındı ve <br> kullanıldı.
    let modalBodyHtml = `
        <div class="info-box danger">
            <p>
                <i class="fas fa-biohazard"></i> <strong>ÇOK YÜKSEK RİSK!</strong><br>
                Sistemde 'Atanmamış' olarak görünen <strong>${unassignedCount} adet</strong> bayi bulundu.<br>
                Bu işlem, bu bayileri VE bu bayilere ait (başka kullanıcılara ait olsalar bile) TÜM denetim raporlarını kalıcı olarak silecektir. Bu işlem GERİ ALINAMAZ.
            </p>
        </div>
        <div class="complex-action">
            <div class="custom-checkbox" style="margin-top: 15px;">
                <input type="checkbox" id="modal-yikici-silme-onay">
                <label for="modal-yikici-silme-onay">Tüm ${unassignedCount} atanmamış bayinin ve ilişkili tüm raporlarının kalıcı olarak silineceğini anladım ve onaylıyorum.</label>
            </div>
            
            <div id="modal-yikici-silme-sonuc" class="results-area" style="margin-top: 10px; max-height: 500px; overflow-y: auto; background: #f1f1f1; padding: 10px; border-radius: 4px; line-height: 1.4;">
                İşlemi başlatmak için lütfen onay kutusunu işaretleyin ve butona basın.
            </div>
        </div>
    `;

    const actionButton = document.createElement('button');
    actionButton.id = 'modal-action-btn';
    actionButton.className = 'btn-danger'; 
    actionButton.innerHTML = '<i class="fas fa-store-slash"></i> Yıkıcı Temizliği Onayla';
    actionButton.disabled = true;

    showModal(true, 'Atanmamış Bayileri Temizle (Yıkıcı)', modalBodyHtml, actionButton);

    const check = document.getElementById('modal-yikici-silme-onay');
    const checkButtonState = () => {
        actionButton.disabled = !check.checked;
    };
    
    check.addEventListener('change', checkButtonState);
    actionButton.addEventListener('click', handleDeleteUnassignedBayis_Modal);
}


/**
 * (Yıkıcı Senaryo 2 - YENİ LOGIC)
 * Modal içinden tetiklenen "Atanmamış Bayileri Temizle" ana eylemi.
 * Global 'showLoading' yerine ilerlemeyi modal içindeki 'resultsDiv'e yazar.
 */
async function handleDeleteUnassignedBayis_Modal() {
    // Modal elemanlarını al
    const deleteBtn = document.getElementById('modal-action-btn');
    const onayCheck = document.getElementById('modal-yikici-silme-onay');
    const resultsDiv = document.getElementById('modal-yikici-silme-sonuc');

    // Kontrolleri kilitle
    deleteBtn.disabled = true;
    onayCheck.disabled = true;

    // Veriyi tekrar kontrol et
    const unassignedBayiler = allStores.filter(s => !s.sorumlu_kullanici);
    if (unassignedBayiler.length === 0) {
         resultsDiv.innerHTML = "<strong style='color:red;'>Hata:</strong> İşlem başladığında atanmamış bayi bulunamadı. Muhtemelen başka bir sekmede temizlendiler.";
         onayCheck.disabled = false; // Kontrolü aç
         return;
    }
    
    resultsDiv.innerHTML = `Yıkıcı temizlik başlatıldı... ${unassignedBayiler.length} atanmamış bayi işleniyor...`;
    
    let deletedReportsCount = 0;
    let deletedBayilerCount = 0;
    const totalBayiler = unassignedBayiler.length;
    const errorLogs = []; // Hataları topla

    try {
        for (let i = 0; i < totalBayiler; i++) {
            const bayi = unassignedBayiler[i];
            const bayiInfo = `${bayi.bayiAdi || 'İsimsiz'} (${bayi.bayiKodu || 'Kodsuz'})`;
            
            // İlerlemeyi global 'showLoading' yerine modal'a yaz
            resultsDiv.innerHTML = `[${i + 1}/${totalBayiler}] İşleniyor: ${bayiInfo}<br>(Adım 1/2: Raporlar aranıyor...)`;
            resultsDiv.scrollTop = resultsDiv.scrollHeight; // Otomatik olarak en alta kaydır

            let reports;
            try {
                // Adım 1a: Bayiye ait raporları bul
                reports = await pbInstance.collection('denetim_raporlari').getFullList({
                    filter: `bayi = "${bayi.id}"`,
                    fields: 'id'
                });
            } catch (reportFindError) {
                // Raporları ararken hata olursa (örn: 'Something went wrong')
                console.error(`'${bayiInfo}' için raporlar ARANIRKEN hata oluştu, bayi atlanıyor:`, reportFindError);
                errorLogs.push(`'${bayiInfo}' (Rapor ARAMA): ${reportFindError.message}`);
                continue; // Bu bayiyi atla, sonrakine geç
            }

            // Adım 1b: Raporları teker teker sil
            if (reports.length > 0) {
                try {
                    for (let j = 0; j < reports.length; j++) {
                        // İlerlemeyi modal'a yaz
                        resultsDiv.innerHTML = `[${i + 1}/${totalBayiler}] ${bayiInfo}<br>(Adım 1/2: Rapor ${j + 1}/${reports.length} siliniyor...)`;
                        resultsDiv.scrollTop = resultsDiv.scrollHeight; 
                        await pbInstance.collection('denetim_raporlari').delete(reports[j].id);
                    }
                    deletedReportsCount += reports.length;
                } catch (reportDeleteError) {
                    // Raporları silerken bir hata olursa
                    console.error(`'${bayiInfo}' için raporlar SİLİNİRKEN hata oluştu, bayi atlanıyor:`, reportDeleteError);
                    errorLogs.push(`'${bayiInfo}' (Rapor SİLME): ${reportDeleteError.message}`);
                    continue; // Bayiyi silme, sonrakine geç
                }
            }

            // Adım 2: Raporlar silindiyse veya yoksa, bayiyi sil
            resultsDiv.innerHTML = `[${i + 1}/${totalBayiler}] ${bayiInfo}<br>(Adım 2/2: Bayi siliniyor...)`;
            resultsDiv.scrollTop = resultsDiv.scrollHeight;
            try {
                await pbInstance.collection('bayiler').delete(bayi.id);
                deletedBayilerCount++;
            } catch (bayiError) {
                // Bayiyi silerken hata olursa
                console.error(`'${bayiInfo}' silinemedi:`, bayiError);
                errorLogs.push(`'${bayiInfo}' (Bayi SİLME): ${bayiError.message}`);
            }
        } // Ana for döngüsünün sonu

        // --- İşlem Sonu Özet Raporu ---
        let summaryMessage = `<strong style="color:green;">YIKICI TEMİZLİK TAMAMLANDI:</strong><br>- ${deletedReportsCount} adet rapor silindi.<br>- ${deletedBayilerCount} adet bayi silindi.`;
        
        if (errorLogs.length > 0) {
            summaryMessage += `<br><br><strong style="color:red;">${errorLogs.length} ADET HATA ALINDI (ve atlandı):</strong><br>`;
            summaryMessage += errorLogs.slice(0, 5).join('<br>');
            if (errorLogs.length > 5) {
                summaryMessage += `<br>...ve ${errorLogs.length - 5} hata daha. (Detaylar için F12 > Console).`;
            }
        }
        
        resultsDiv.innerHTML = summaryMessage; // alert() yerine modal'a yaz
        resultsDiv.scrollTop = resultsDiv.scrollHeight;

        await loadInitialData(); // Arka planda verileri yenile
        populateTableManagement(); // Tabloyu yenile
        
    } catch (error) {
        // Beklenmedik genel bir hata olursa
        resultsDiv.innerHTML = `<strong style="color:red;">Kritik Hata:</strong> ${error.message}`;
        // Hata mesajını da göster (handleError alert ile gösterir)
        handleError(error, "Atanmamış bayiler temizlenirken kritik bir genel hata oluştu.");
    } finally {
        // İşlem bittiğinde kontrolleri tekrar aç
        onayCheck.checked = false;
        onayCheck.disabled = false;
        deleteBtn.disabled = true; // Onay kaldırıldığı için
    }
}


// --- Mevcut Fonksiyonlar ---

async function deleteCurrentMonthAudits() {
    showLoading(true, "Mevcut ayın raporları kontrol ediliyor...");
    try {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstDayOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        const currentMonthName = monthNames[today.getMonth()];

        const firstDayISO = firstDayOfMonth.toISOString().split('T')[0] + ' 00:00:00';
        const firstDayOfNextMonthISO = firstDayOfNextMonth.toISOString().split('T')[0] + ' 00:00:00';

        const reports = await pbInstance.collection('denetim_raporlari').getFullList({
            filter: `denetimTamamlanmaTarihi >= "${firstDayISO}" && denetimTamamlanmaTarihi < "${firstDayOfNextMonthISO}"`,
            fields: 'id'
        });

        if (reports.length === 0) {
            alert(`Bu ay (${currentMonthName}) silinecek denetim raporu bulunamadı.`);
            return;
        }

        if (!confirm(`DİKKAT! ${currentMonthName} ayına ait ${reports.length} adet denetim raporu kalıcı olarak silinecektir. Bu işlem geri alınamaz. Emin misiniz?`)) {
            return;
        }
        
        showLoading(true, `${reports.length} adet rapor siliniyor...`);

        const deletePromises = reports.map(report => pbInstance.collection('denetim_raporlari').delete(report.id));
        await Promise.all(deletePromises);
        alert(`${currentMonthName} ayına ait ${reports.length} adet rapor başarıyla silindi. Denetim takip sayacı sıfırlandı.`);

    } catch (error) {
        handleError(error, "Bu ayın raporları silinirken hata oluştu.");
    } finally {
        showLoading(false);
    }
}


async function resetTamamlanmaDurumu() {
    if (!confirm("DİKKAT! Bu işlem TÜM raporların 'Tamamlanma Tarihi' bilgisini silecektir. Raporların içeriği silinmez. Bu, tüm bayilerin 'denetlenmemiş' olarak görünmesini sağlar. Emin misiniz?")) return;
    showLoading(true, "Rapor durumları sıfırlanıyor...");
    try {
        const reports = await pbInstance.collection('denetim_raporlari').getFullList({ filter: 'denetimTamamlanmaTarihi != null', fields: 'id' });
        if (reports.length === 0) { alert("Durumu sıfırlanacak rapor bulunamadı."); return; }
        const updatePromises = reports.map(report => pbInstance.collection('denetim_raporlari').update(report.id, { 'denetimTamamlanmaTarihi': null }));
        await Promise.all(updatePromises);
        alert(`${reports.length} adet raporun tamamlanma durumu başarıyla sıfırlandı.`);
    } catch (error) {
        handleError(error, "Tamamlanma durumu sıfırlanırken hata oluştu.");
    } finally {
        showLoading(false);
    }
}

function searchStoreForDeletion(e) {
    const filter = e.target.value.toLowerCase().trim();
    const listDiv = document.getElementById('bayi-arama-sonuc-listesi');
    listDiv.innerHTML = '';
    selectedStoreForDeletion = null;
    document.getElementById('sil-bayi-raporlari-btn').disabled = true;

    if (filter === "") return;
    const filteredStores = allStores.filter(store =>
        (store.bayiAdi && store.bayiAdi.toLowerCase().includes(filter)) ||
        (store.bayiKodu && String(store.bayiKodu).toLowerCase().includes(filter))
    );

    filteredStores.slice(0, 10).forEach(store => {
        const item = document.createElement('div');
        item.className = 'bayi-item';
        item.textContent = `${store.bayiAdi} (${store.bayiKodu})`;
        item.addEventListener('click', () => selectStoreForDeletion(store));
        listDiv.appendChild(item);
    });
}

function selectStoreForDeletion(store) {
    selectedStoreForDeletion = store;
    document.getElementById('bayi-arama-silme-input').value = `${store.bayiAdi} (${store.bayiKodu})`;
    document.getElementById('bayi-arama-sonuc-listesi').innerHTML = '';
    document.getElementById('sil-bayi-raporlari-btn').disabled = false;
}

async function deleteBayiRaporlari() {
    if (!selectedStoreForDeletion) return;
    const confirmation = prompt(`GERİ ALINAMAZ İŞLEM! '${selectedStoreForDeletion.bayiAdi}' adlı bayiye ait TÜM denetim raporlarını kalıcı olarak silmek için 'SİL' yazın.`);
    if (confirmation !== 'SİL') { alert("İşlem iptal edildi."); return; }

    showLoading(true, `'${selectedStoreForDeletion.bayiAdi}' raporları siliniyor...`);
    try {
        const reports = await pbInstance.collection('denetim_raporlari').getFullList({ filter: `bayi = "${selectedStoreForDeletion.id}"`, fields: 'id' });
        if (reports.length === 0) { alert("Bu bayiye ait silinecek rapor bulunamadı."); return; }
        
        // Raporları teker teker sil
        const totalReports = reports.length;
        for (let i = 0; i < totalReports; i++) {
            showLoading(true, `'${selectedStoreForDeletion.bayiAdi}' bayisinin raporları siliniyor... (${i + 1}/${totalReports})`);
            await pbInstance.collection('denetim_raporlari').delete(reports[i].id);
        }
        
        alert(`${totalReports} adet rapor başarıyla silindi.`);
    } catch (error) {
        handleError(error, "Bayi raporları silinirken hata oluştu.");
    } finally {
        selectedStoreForDeletion = null;
        document.getElementById('bayi-arama-silme-input').value = '';
        document.getElementById('sil-bayi-raporlari-btn').disabled = true;
        showLoading(false);
    }
}

/**
 * (GÜNCELLENDİ) Artık eylemler için modal açma fonksiyonlarını (örn: openUserDeletionModal) çağırıyor.
 */
function populateTableManagement() {
    const tables = [
        { name: 'denetim_raporlari', desc: 'Yapılmış tüm denetimlerin cevapları.', impact: 'Silinirse <strong>tüm denetim geçmişi kaybolur.</strong>', allowDelete: true, allowUpload: false }, 
        { name: 'excel_verileri', desc: 'Yüklenen DiDe ve FiDe puanları.', impact: 'Silinirse puan tabloları boş çıkar.', allowDelete: true, allowUpload: false }, 
        { name: 'denetim_geri_alinanlar', desc: 'İptal edilen denetimlerin kaydı.', impact: 'Temizlenmesi sorun teşkil etmez.', allowDelete: true, allowUpload: false } 
    ];

    const actions = [
        { 
            name: 'Kullanıcıyı ve Raporlarını Sil (Güvenli)',
            desc: "Seçilen bir kullanıcının raporlarını siler ve bayilerini 'Atanmamış' yapar.", 
            impact: 'Kullanıcı silinir; bayiler korunur. (Modal açılır)',
            isAction: true,
            action: openUserDeletionModal, // Modal açıcıyı çağır
            btnClass: 'btn-warning', 
            btnIcon: 'fa-user-slash',
            btnTitle: 'Kullanıcıyı Sil...'
        },
        { 
            name: 'Atanmamış Bayileri Temizle (Yıkıcı)',
            desc: "'Atanmamış' durumdaki TÜM bayileri VE bu bayilere ait TÜM raporları (diğer kullanıcılara ait olanlar dahil) kalıcı olarak siler.", 
            impact: '<strong>YÜKSEK RİSK.</strong> Bayi listesi ve raporlar kalıcı olarak silinir.',
            isAction: true,
            action: openUnassignedBayiDeletionModal, // Modal açıcıyı çağır (Eski: handleDeleteUnassignedBayis)
            btnClass: 'btn-danger', 
            btnIcon: 'fa-store-slash',
            btnTitle: 'Atanmamış Bayileri Temizle'
        },
        { 
            name: 'Sadece Bu Ayın Denetimlerini Sil',
            desc: 'Mevcut ay içinde tamamlanmış tüm denetim raporlarını kalıcı olarak siler.', 
            impact: 'İçinde bulunulan ayın denetim sayacı sıfırlanır; geçmiş aylara dokunulmaz.',
            isAction: true,
            action: deleteCurrentMonthAudits,
            btnClass: 'btn-danger', 
            btnIcon: 'fa-calendar-times',
            btnTitle: 'Bu Ayı Sil'
        },
        { 
            name: 'Rapor Tamamlanma Durumları', 
            desc: 'Tüm raporların "Tamamlanma Tarihi" bilgisini sıfırlar.', 
            impact: 'Tüm bayilerin denetim durumu "denetlenmemiş" olarak değişir.',
            isAction: true,
            action: resetTamamlanmaDurumu,
            btnClass: 'btn-warning',
            btnIcon: 'fa-history',
            btnTitle: 'Sıfırla'
        }
    ];

    const tbody = document.querySelector('#tablo-yonetim-tablosu tbody');
    tbody.innerHTML = '';
    
    tables.forEach(table => {
        const row = document.createElement('tr');
        let actionsHtml = '<div class="table-actions">';
        if (table.allowDelete) {
            actionsHtml += `<button class="btn-danger btn-sm" title="Sil"><i class="fas fa-trash"></i></button>`;
        }
        // Yükleme butonu (allowUpload) artık hiç eklenmiyor.
        actionsHtml += '</div>';

        row.innerHTML = `
            <td><strong>${table.name}</strong></td>
            <td>${table.desc}</td>
            <td>${table.impact}</td>
            <td>${actionsHtml}</td>
        `;

        if (table.allowDelete) {
            row.querySelector('.btn-danger').addEventListener('click', () => deleteTable(table.name));
        }
        tbody.appendChild(row);
    });

    actions.forEach(action => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td><strong>${action.name}</strong></td>
            <td>${action.desc}</td>
            <td>${action.impact}</td>
            <td>
                <div class="table-actions">
                    <button class="${action.btnClass} btn-sm" title="${action.btnTitle}"><i class="fas ${action.btnIcon}"></i></button>
                </div>
            </td>
        `;
        row.querySelector('button').addEventListener('click', action.action);
        tbody.appendChild(row);
    });
}

async function deleteTable(collectionName) {
    const confirmation = prompt(`ÇOK TEHLİKELİ İŞLEM! '${collectionName}' tablosundaki TÜM verileri kalıcı olarak silmek için '${collectionName.toUpperCase()}' yazın.`);
    if (confirmation !== collectionName.toUpperCase()) { alert("Onay metni yanlış. İşlem iptal edildi."); return; }
    
    showLoading(true, `'${collectionName}' tablosu siliniyor...`);
    try {
        const records = await pbInstance.collection(collectionName).getFullList({ fields: 'id' });
        if (records.length === 0) { alert(`'${collectionName}' tablosu zaten boş.`); return; }
        
        // Toplu silme yerine teker teker sil (sunucu limitlerini aşmamak için)
        const totalRecords = records.length;
        for(let i=0; i < totalRecords; i++) {
            showLoading(true, `'${collectionName}' tablosu siliniyor... (${i + 1}/${totalRecords})`);
            await pbInstance.collection(collectionName).delete(records[i].id);
        }
        
        alert(`'${collectionName}' tablosundaki ${totalRecords} adet kayıt başarıyla silindi.`);
    } catch (error) {
        handleError(error, `'${collectionName}' silinirken hata oluştu.`);
    } finally {
        showLoading(false);
    }
}

// KALDIRILDI: Bu fonksiyon artık çağrılmadığı için tamamen silindi.
// function uploadTableData(event) { ... } 

// --- Yardımcı Fonksiyonlar ---
function showLoading(show, message = "İşlem yapılıyor...") {
    const overlay = document.getElementById('loading-overlay'); 
    if (overlay) {
        const textElement = overlay.querySelector('p');
        if (textElement) { textElement.textContent = message; }
        overlay.style.display = show ? 'flex' : 'none';
    }
}

function showModal(show, title = '', body = '', actionButton = null) {
    const modal = document.getElementById('modal-container');
    const modalFooter = document.getElementById('modal-footer');
    
    const oldActionButton = document.getElementById('modal-action-btn');
    if (oldActionButton) { oldActionButton.remove(); }
    
    if (modal) {
        if (show) {
            document.getElementById('modal-title').innerHTML = title;
            document.getElementById('modal-body').innerHTML = body;
            if (actionButton) { modalFooter.prepend(actionButton); }
        }
        modal.style.display = show ? 'flex' : 'none';
    }
}

function handleError(error, userMessage) {
    console.error(userMessage, error);
    const errorMessage = (error.message || '').toLowerCase();
    if (errorMessage.includes('relation') || errorMessage.includes('reference') || errorMessage.includes('constraint')) {
        alert(`İşlem Başarısız!\n\n${userMessage}\n\nSebep: Bu tablodaki veriler, başka bir tablo (örneğin 'denetim_raporlari') tarafından kullanılıyor. Veri bütünlüğünü korumak için bu silme işlemi engellendi.\n\NÇözüm: Önce bu tabloya bağlı olan diğer tablodaki verileri silmeniz gerekmektedir.`);
    } else {
        alert(`${userMessage}: ${error.message}`);
    }
}