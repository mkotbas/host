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
}


// --- Kullanıcı ve Bayi Silme Fonksiyonları (Modal ve Eylem) ---

/**
 * (Güvenli Senaryo 1)
 * "Kullanıcıyı ve Raporlarını Sil" eylemi için modalı (açılır pencere) açar.
 */
function openUserDeletionModal() {
    let modalBodyHtml = `
        <div class="info-box warning">
            <div class="info-box-icon">
                <i class="fas fa-exclamation-triangle"></i>
                <strong>ÖNEMLİ</strong>
            </div>
            <div class="info-box-content">
                <p>Bu işlem, seçilen kullanıcıyı ve o kullanıcının <strong>denetim raporlarını</strong> siler. Kullanıcıya atanmış bayiler <strong>SİLİNMEZ</strong>, "Atanmamış" olarak güncellenir.</p>
            </div>
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

    if (!confirm(`'${userName}' adlı kullanıcıyı ve raporlarını silmek üzeresiniz. Bayileri 'Atanmamış' olarak güncellenecek. Emin misiniz?`)) {
        return;
    }

    showLoading(true, `'${userName}' için 3 adımlı silme işlemi başlatıldı...`);
    deleteBtn.disabled = true;
    userSelect.disabled = true;
    onayCheck.disabled = true;
    resultsDiv.innerHTML = 'İşlem başlatıldı...';

    try {
        // --- Adım 1: Kullanıcıya ait 'denetim_raporlari'nı sil ---
        resultsDiv.innerHTML = `Adım 1/3: '${userName}' kullanıcısına ait denetim raporları aranıyor...`;
        const reports = await pbInstance.collection('denetim_raporlari').getFullList({ filter: `user = "${userId}"`, fields: 'id' });
        if (reports.length > 0) {
            resultsDiv.innerHTML = `Adım 1/3: ${reports.length} adet denetim raporu siliniyor...`;
            const deletePromises = reports.map(r => pbInstance.collection('denetim_raporlari').delete(r.id));
            await Promise.all(deletePromises);
            resultsDiv.innerHTML = `Adım 1/3: ${reports.length} adet denetim raporu başarıyla silindi.`;
        } else { resultsDiv.innerHTML = `Adım 1/3: Kullanıcıya ait denetim raporu bulunamadı.`; }

        // --- Adım 2: Kullanıcıya atanmış 'bayiler'in 'sorumlu_kullanici' alanını null yap ---
        resultsDiv.innerHTML += `<br>Adım 2/3: '${userName}' kullanıcısına atanmış bayiler aranıyor...`;
        const bayiler = await pbInstance.collection('bayiler').getFullList({ filter: `sorumlu_kullanici = "${userId}"`, fields: 'id' });
        if (bayiler.length > 0) {
            resultsDiv.innerHTML += `<br>Adım 2/3: ${bayiler.length} adet bayi ataması kaldırılıyor...`;
            const updatePromises = bayiler.map(b => pbInstance.collection('bayiler').update(b.id, { 'sorumlu_kullanici': null }));
            await Promise.all(updatePromises);
            resultsDiv.innerHTML += `<br>Adım 2/3: ${bayiler.length} adet bayi ataması başarıyla kaldırıldı.`;
        } else { resultsDiv.innerHTML += `<br>Adım 2/3: Kullanıcıya atanmış bayi bulunamadı.`; }
        
        // --- Adım 3: Kullanıcıyı 'users' tablosundan sil ---
        resultsDiv.innerHTML += `<br>Adım 3/3: '${userName}' kullanıcısı sistemden siliniyor...`;
        await pbInstance.collection('users').delete(userId);
        resultsDiv.innerHTML += `<br>Adım 3/3: Kullanıcı başarıyla silindi.`;
        resultsDiv.innerHTML += `<br><br><strong style="color: green;">GÜVENLİ SİLME TAMAMLANDI.</strong>`;
        
        await loadInitialData();
        const newSelectHtml = allUsers.map(user => {
            if (user.id === pbInstance.authStore.model.id || user.id === userId) return '';
            return `<option value="${user.id}">${user.name || 'İsimsiz'} (${user.email})</option>`;
        }).join('');
        userSelect.innerHTML = '<option value="">-- Bir kullanıcı seçin --</option>' + newSelectHtml;

    } catch (error) {
        handleError(error, "Kullanıcı silme işlemi sırasında kritik bir hata oluştu.");
        resultsDiv.innerHTML += `<br><strong style="color: red;">HATA: ${error.message}</strong>`;
    } finally {
        showLoading(false);
        onayCheck.checked = false;
        userSelect.value = '';
        userSelect.disabled = false;
        onayCheck.disabled = false;
        const checkButtonState = () => { deleteBtn.disabled = !(userSelect.value && onayCheck.checked); };
        checkButtonState(); 
    }
}

/**
 * (YENİ GÜVENLİ SENARYO)
 * "Sadece Kullanıcı Raporlarını Sil" eylemi için modalı (açılır pencere) açar.
 */
function openDeleteUserReportsModal() {
    let modalBodyHtml = `
        <div class="info-box info">
            <div class="info-box-icon">
                <i class="fas fa-info-circle"></i>
                <strong>BİLGİ</strong>
            </div>
            <div class="info-box-content">
                 <p>Bu işlem, sadece seçilen kullanıcının <strong>denetim raporlarını</strong> siler. Kullanıcının hesabı veya bayi atamaları <strong>SİLİNMEZ</strong>.</p>
            </div>
        </div>
        <div class="complex-action">
            <label for="modal-kullanici-rapor-silme-select">Raporları Silinecek Kullanıcıyı Seçin:</label>
            <select id="modal-kullanici-rapor-silme-select" class="form-control">
                <option value="">-- Bir kullanıcı seçin --</option>
                ${allUsers.map(user => {
                    return `<option value="${user.id}">${user.name || 'İsimsiz'} (${user.email})</option>`;
                }).join('')}
            </select>
            <div class="custom-checkbox" style="margin-top: 15px;">
                <input type="checkbox" id="modal-kullanici-rapor-silme-onay">
                <label for="modal-kullanici-rapor-silme-onay">Seçilen kullanıcının sadece raporlarının silineceğini, hesabının SİLİNMEYECEĞİNİ anladım ve onaylıyorum.</label>
            </div>
            <div id="modal-kullanici-rapor-silme-sonuc" class="results-area" style="margin-top: 10px;"></div>
        </div>
    `;

    const actionButton = document.createElement('button');
    actionButton.id = 'modal-action-btn';
    actionButton.className = 'btn-warning'; 
    actionButton.innerHTML = '<i class="fas fa-comment-slash"></i> Sadece Raporları Sil';
    actionButton.disabled = true;

    showModal(true, 'Kullanıcıyı Korumadan Sadece Raporları Sil', modalBodyHtml, actionButton);

    const select = document.getElementById('modal-kullanici-rapor-silme-select');
    const check = document.getElementById('modal-kullanici-rapor-silme-onay');
    const checkButtonState = () => {
        actionButton.disabled = !(select.value && check.checked);
    };
    
    select.addEventListener('change', checkButtonState);
    check.addEventListener('change', checkButtonState);
    actionButton.addEventListener('click', handleDeleteUserReports_Modal);
}

/**
 * (YENİ GÜVENLİ SENARYO)
 * "Sadece Raporları Sil" modalı içindeki "Onayla" butonuna basıldığında çalışan ana eylem.
 */
async function handleDeleteUserReports_Modal() {
    const userSelect = document.getElementById('modal-kullanici-rapor-silme-select');
    const onayCheck = document.getElementById('modal-kullanici-rapor-silme-onay');
    const deleteBtn = document.getElementById('modal-action-btn');
    const resultsDiv = document.getElementById('modal-kullanici-rapor-silme-sonuc');

    const userId = userSelect.value;
    if (!userId || !onayCheck.checked) {
        alert("Lütfen bir kullanıcı seçin ve onayı işaretleyin.");
        return;
    }

    const selectedUser = allUsers.find(u => u.id === userId);
    const userName = selectedUser ? (selectedUser.name || selectedUser.email) : 'Bilinmeyen Kullanıcı';

    if (!confirm(`'${userName}' adlı kullanıcının TÜM raporlarını silmek üzeresiniz. Kullanıcının hesabı SİLİNMEYECEK. Emin misiniz?`)) {
        return;
    }

    showLoading(true, `'${userName}' için rapor silme işlemi başlatıldı...`);
    deleteBtn.disabled = true;
    userSelect.disabled = true;
    onayCheck.disabled = true;
    resultsDiv.innerHTML = 'İşlem başlatıldı...';

    try {
        // --- Adım 1: Kullanıcıya ait 'denetim_raporlari'nı sil ---
        resultsDiv.innerHTML = `Adım 1/1: '${userName}' kullanıcısına ait denetim raporları aranıyor...`;
        const reports = await pbInstance.collection('denetim_raporlari').getFullList({ filter: `user = "${userId}"`, fields: 'id' });
        
        if (reports.length > 0) {
            resultsDiv.innerHTML = `Adım 1/1: ${reports.length} adet denetim raporu siliniyor...`;
            const deletePromises = reports.map(r => pbInstance.collection('denetim_raporlari').delete(r.id));
            await Promise.all(deletePromises);
            resultsDiv.innerHTML = `Adım 1/1: ${reports.length} adet denetim raporu başarıyla silindi.`;
        } else {
            resultsDiv.innerHTML = `Adım 1/1: Kullanıcıya ait denetim raporu bulunamadı.`;
        }

        resultsDiv.innerHTML += `<br><br><strong style="color: green;">RAPOR SİLME TAMAMLANDI.</strong>`;
    } catch (error) {
        handleError(error, "Kullanıcı raporlarını silme işlemi sırasında kritik bir hata oluştu.");
        resultsDiv.innerHTML += `<br><strong style="color: red;">HATA: ${error.message}</strong>`;
    } finally {
        showLoading(false);
        onayCheck.checked = false;
        userSelect.value = '';
        userSelect.disabled = false;
        onayCheck.disabled = false;
        const checkButtonState = () => { deleteBtn.disabled = !(userSelect.value && onayCheck.checked); };
        checkButtonState(); 
    }
}


/**
 * (Yıkıcı Senaryo 2)
 * "Atanmamış Bayileri Temizle" eylemi için modalı (açılır pencere) açar.
 */
function openDeleteUnassignedBayisModal() {
    const unassignedBayiler = allStores.filter(s => !s.sorumlu_kullanici);
    const unassignedCount = unassignedBayiler.length;

    if (unassignedCount === 0) {
        alert("Sistemde 'Atanmamış' bayi bulunamadı. İşlem yapılmasına gerek yok.");
        return;
    }

    let modalBodyHtml = `
        <div class="info-box danger">
            <div class="info-box-icon">
                <i class="fas fa-skull-crossbones"></i>
                <strong>YÜKSEK RİSKLİ İŞLEM!</strong>
            </div>
            <div class="info-box-content">
                <p>Sistemde 'Atanmamış' olarak görünen <strong>${unassignedCount} adet bayi</strong> bulundu.</p>
                <p>Bu işlem, bu bayileri VE bu bayilere ait TÜM denetim raporlarını (diğer kullanıcılara ait olsalar bile) kalıcı olarak silecektir. Bu işlem geri alınamaz.</p>
            </div>
        </div>
        <div class="complex-action">
            <div class="custom-checkbox" style="margin-top: 15px;">
                <input type="checkbox" id="modal-atanmamis-silme-onay">
                <label for="modal-atanmamis-silme-onay">${unassignedCount} bayinin ve tüm raporlarının silineceğini anladım ve onaylıyorum.</label>
            </div>
            <div id="modal-atanmamis-silme-sonuc" class="results-area" style="display: none; margin-top: 10px;"></div>
        </div>
    `;

    const actionButton = document.createElement('button');
    actionButton.id = 'modal-action-btn';
    actionButton.className = 'btn-danger'; 
    actionButton.innerHTML = `<i class="fas fa-store-slash"></i> ${unassignedCount} Bayiyi ve Raporlarını Sil`;
    actionButton.disabled = true;

    showModal(true, 'Atanmamış Bayileri Temizle (Yıkıcı)', modalBodyHtml, actionButton);

    const check = document.getElementById('modal-atanmamis-silme-onay');
    const checkButtonState = () => {
        actionButton.disabled = !check.checked;
    };
    
    check.addEventListener('change', checkButtonState);
    actionButton.addEventListener('click', () => handleDeleteUnassignedBayis_Modal(unassignedBayiler)); 
}


/**
 * (Yıkıcı Senaryo 2)
 * "Atanmamış Bayileri Temizle" eylemini modal onayı ile çalıştırır.
 */
async function handleDeleteUnassignedBayis_Modal(unassignedBayiler) {
    const deleteBtn = document.getElementById('modal-action-btn');
    const resultsDiv = document.getElementById('modal-atanmamis-silme-sonuc');
    const onayCheck = document.getElementById('modal-atanmamis-silme-onay');

    if (!onayCheck || !onayCheck.checked) {
        alert("Lütfen onayı işaretleyin.");
        return;
    }

    showLoading(true, `Yıkıcı temizlik başlatıldı... ${unassignedBayiler.length} atanmamış bayi işleniyor...`);
    
    if(deleteBtn) deleteBtn.disabled = true;
    if(onayCheck) onayCheck.disabled = true;
    if(resultsDiv) {
        resultsDiv.style.display = 'block';
        resultsDiv.innerHTML = 'İşlem başlatıldı...';
    }

    let totalReportsDeleted = 0;
    let totalBayisDeleted = 0;
    const totalBayiCount = unassignedBayiler.length;
    let hasError = false;

    try {
        for (let i = 0; i < totalBayiCount; i++) {
            const bayi = unassignedBayiler[i];
            const bayiName = bayi.bayiAdi || bayi.bayiKodu;
            const currentCount = i + 1;
            const progressPrefix = `(${currentCount}/${totalBayiCount})`;

            const progressMsg1 = `${progressPrefix} '${bayiName}' için raporlar aranıyor...`;
            showLoading(true, progressMsg1);
            if(resultsDiv) resultsDiv.innerHTML = progressMsg1;

            const reports = await pbInstance.collection('denetim_raporlari').getFullList({ 
                filter: `bayi = "${bayi.id}"`, 
                fields: 'id' 
            });

            if (reports.length > 0) {
                const progressMsg2 = `${progressPrefix} ${reports.length} adet rapor siliniyor...`;
                showLoading(true, progressMsg2);
                if(resultsDiv) resultsDiv.innerHTML = progressMsg2;

                const deleteReportPromises = reports.map(r => pbInstance.collection('denetim_raporlari').delete(r.id));
                await Promise.all(deleteReportPromises);
                totalReportsDeleted += reports.length;
            }

            const progressMsg3 = `${progressPrefix} '${bayiName}' bayisi siliniyor...`;
            showLoading(true, progressMsg3);
            if(resultsDiv) resultsDiv.innerHTML = progressMsg3;

            await pbInstance.collection('bayiler').delete(bayi.id);
            totalBayisDeleted++;
        }

        if(resultsDiv) {
            resultsDiv.innerHTML = `<br><strong style="color: green;">YIKICI TEMİZLİK TAMAMLANDI:</strong><br>
                                    - ${totalReportsDeleted} adet ilişkili denetim raporu silindi.<br>
                                    - ${totalBayisDeleted} adet atanmamış bayi silindi.`;
        }
        
        await loadInitialData();
        
    } catch (error) {
        hasError = true;
        console.error("handleDeleteUnassignedBayis_Modal Hata:", error);
        
        if(resultsDiv) {
            resultsDiv.innerHTML += `<br><br><strong style="color: red;">KRİTİK HATA:</strong><br>
                                     İşlem durduruldu.<br>
                                     Toplam <strong>${totalBayisDeleted} bayi</strong> ve <strong>${totalReportsDeleted} rapor</strong> şimdiye kadar silindi.<br>
                                     Hata: ${error.message}`;
        }
    } finally {
        showLoading(false);
        if (hasError) {
            if(deleteBtn) deleteBtn.disabled = false;
            if(onayCheck) {
                onayCheck.disabled = false;
                onayCheck.checked = false;
            }
            if(deleteBtn) deleteBtn.disabled = true;
        } else {
            if(deleteBtn) {
                deleteBtn.innerHTML = '<i class="fas fa-check"></i> Tamamlandı';
                deleteBtn.disabled = true;
            }
        }
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
        alert(`${reports.length} adet raporun tamamlanma durumu sıfırlandı.`);
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
        const deletePromises = reports.map(report => pbInstance.collection('denetim_raporlari').delete(report.id));
        await Promise.all(deletePromises);
        alert(`${reports.length} adet rapor başarıyla silindi.`);
    } catch (error) {
        handleError(error, "Bayi raporları silinirken hata oluştu.");
    } finally {
        selectedStoreForDeletion = null;
        document.getElementById('bayi-arama-silme-input').value = '';
        document.getElementById('sil-bayi-raporlari-btn').disabled = true;
        showLoading(false);
    }
}

// --- YENİ EKLENEN: Excel Ayarlarını Sıfırlama Fonksiyonu ---
async function resetExcelMappings() {
    if (!confirm("Excel sütun eşleştirme ayarları (sihirbaz tercihleri) sıfırlanacak.\n\nBir sonraki dosya yüklemenizde sihirbaz tekrar açılacak.\n\nOnaylıyor musunuz?")) return;

    showLoading(true, "Ayarlar sıfırlanıyor...");
    try {
        // Hem DiDe hem FiDe ayarlarını bulup siliyoruz
        const keysToDelete = ['excel_mapping_dide', 'excel_mapping_fide'];
        let deletedCount = 0;

        for (const key of keysToDelete) {
            try {
                const record = await pbInstance.collection('ayarlar').getFirstListItem(`anahtar="${key}"`);
                await pbInstance.collection('ayarlar').delete(record.id);
                deletedCount++;
            } catch (e) {
                // Kayıt yoksa hata vermeden devam et
            }
        }

        if (deletedCount > 0) {
            alert("Eşleştirme ayarları başarıyla silindi.");
        } else {
            alert("Silinecek kayıtlı bir ayar bulunamadı.");
        }

    } catch (error) {
        handleError(error, "Ayarlar silinirken bir hata oluştu.");
    } finally {
        showLoading(false);
    }
}

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
            action: openUserDeletionModal,
            btnClass: 'btn-warning', 
            btnIcon: 'fa-user-slash',
            btnTitle: 'Kullanıcıyı Sil...'
        },
        { 
            name: 'Sadece Kullanıcı Raporlarını Sil',
            desc: "Seçilen bir kullanıcının TÜM denetim raporlarını siler. Kullanıcı hesabı SİLİNMEZ.", 
            impact: 'Kullanıcı kalır, rapor geçmişi silinir. (Modal açılır)',
            isAction: true,
            action: openDeleteUserReportsModal,
            btnClass: 'btn-warning', 
            btnIcon: 'fa-comment-slash',
            btnTitle: 'Sadece Raporları Sil...'
        },
        { 
            name: 'Atanmamış Bayileri Temizle (Yıkıcı)',
            desc: "'Atanmamış' durumdaki TÜM bayileri VE bu bayilere ait TÜM raporları (diğer kullanıcılara ait olanlar dahil) kalıcı olarak siler.", 
            impact: '<strong>YÜKSEK RİSK.</strong> Bayi listesi ve raporlar kalıcı olarak silinir.',
            isAction: true,
            action: openDeleteUnassignedBayisModal,
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
        },
        // --- YENİ EKLENEN EYLEM ---
        { 
            name: 'Excel Eşleştirmelerini Sıfırla', 
            desc: 'Sihirbaz ile kaydedilen Excel sütun/satır ayarlarını siler.', 
            impact: 'Bir sonraki dosya yüklemenizde <strong>Sihirbaz tekrar açılır.</strong>',
            isAction: true,
            action: resetExcelMappings,
            btnClass: 'btn-info', // Mavi buton (Bilgi/Ayar)
            btnIcon: 'fa-magic', // Sihirbaz değneği ikonu
            btnTitle: 'Ayarları Sıfırla'
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
        
        const deletePromises = records.map(r => pbInstance.collection(collectionName).delete(r.id));
        await Promise.all(deletePromises);
        alert(`'${collectionName}' tablosundaki ${records.length} adet kayıt başarıyla silindi.`);
    } catch (error) {
        handleError(error, `'${collectionName}' silinirken hata oluştu.`);
    } finally {
        showLoading(false);
    }
}

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
        alert(`İşlem Başarısız!\n\n${userMessage}\n\nSebep: Bu tablodaki veriler, başka bir tablo (örneğin 'denetim_raporlari') tarafından kullanılıyor. Veri bütünlüğünü korumak için bu silme işlemi engellendi.\n\nÇözüm: Önce bu tabloya bağlı olan diğer tablodaki verileri silmeniz gerekmektedir.`);
    } else {
        alert(`${userMessage}: ${error.message || error}`);
    }
}