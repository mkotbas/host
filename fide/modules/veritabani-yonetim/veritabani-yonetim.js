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
 * (DÜZELTİLDİ: Rapor silme mantığı düzeltildi, 'geri alınan' ile ilgili hatalı varsayım kaldırıldı)
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
        // (DÜZELTME: 'denetim_geri_alinanlar' tablosu raporlara değil, bayilere bağlı.
        // Bu nedenle raporları silerken ekstra bir işlem gerekmez.)
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
        // Hata raporlamasını 'handleError' fonksiyonuna devret
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
 * (Yıkıcı Senaryo 2)
 * "Atanmamış Bayileri Temizle" eylemini çalıştırır.
 * (DÜZELTİLDİ: Artık 3 aşamalı silme yapıyor: 1. geri_alinanlar, 2. raporlar, 3. bayi)
 */
async function handleDeleteUnassignedBayis() {
    const unassignedBayiler = allStores.filter(s => !s.sorumlu_kullanici);
    if (unassignedBayiler.length === 0) {
        alert("Sistemde 'Atanmamış' bayi bulunamadı. İşlem yapılmasına gerek yok.");
        return;
    }
    if (!confirm(`ÇOK YÜKSEK RİSK!\n\nSistemde 'Atanmamış' olarak görünen ${unassignedBayiler.length} adet bayi bulundu.\n\nBu işlem, bu bayileri VE bu bayilere ait TÜM denetim raporlarını VE TÜM 'geri alınan' kayıtlarını kalıcı olarak silecektir.\n\nBu işlem GERİ ALINAMAZ.\n\nEmin misiniz?`)) { return; }

    showLoading(true, `Yıkıcı temizlik başlatıldı... ${unassignedBayiler.length} atanmamış bayi işleniyor...`);
    
    let totalReportsDeleted = 0;
    let totalBayisDeleted = 0;
    let totalGeriAlinanDeleted = 0;
    const totalBayiCount = unassignedBayiler.length;

    try {
        // Her bayiyi döngüde tek tek işle
        for (let i = 0; i < totalBayiCount; i++) {
            const bayi = unassignedBayiler[i];
            const bayiName = bayi.bayiAdi || bayi.bayiKodu;
            const currentCount = i + 1;
            
            // --- SİLME AŞAMA 1: 'denetim_geri_alinanlar' ---
            // Bu bayiye bağlı 'geri alınan' kayıtları bul (Alan adı: 'bayi')
            showLoading(true, `(${currentCount}/${totalBayiCount}) '${bayiName}' için 'Geri Alınan' kayıtlar (Adım 1/3) aranıyor...`);
            const geriAlinanRecords = await pbInstance.collection('denetim_geri_alinanlar').getFullList({
                filter: `bayi = "${bayi.id}"`,
                fields: 'id'
            });
            
            if (geriAlinanRecords.length > 0) {
                showLoading(true, `(${currentCount}/${totalBayiCount}) ${geriAlinanRecords.length} adet 'Geri Alınan' kayıt (Adım 1/3) siliniyor...`);
                const deleteGeriAlinanPromises = geriAlinanRecords.map(r => pbInstance.collection('denetim_geri_alinanlar').delete(r.id));
                await Promise.all(deleteGeriAlinanPromises);
                totalGeriAlinanDeleted += geriAlinanRecords.length;
            }

            // --- SİLME AŞAMA 2: 'denetim_raporlari' ---
            // Bu bayiye bağlı 'rapor' kayıtlarını bul (Alan adı: 'bayi')
            showLoading(true, `(${currentCount}/${totalBayiCount}) '${bayiName}' için 'Rapor' kayıtları (Adım 2/3) aranıyor...`);
            const reports = await pbInstance.collection('denetim_raporlari').getFullList({ 
                filter: `bayi = "${bayi.id}"`, 
                fields: 'id' 
            });
            
            if (reports.length > 0) {
                showLoading(true, `(${currentCount}/${totalBayiCount}) ${reports.length} adet 'Rapor' (Adım 2/3) siliniyor...`);
                const deleteReportPromises = reports.map(r => pbInstance.collection('denetim_raporlari').delete(r.id));
                await Promise.all(deleteReportPromises);
                totalReportsDeleted += reports.length;
            }
            
            // --- SİLME AŞAMA 3: 'bayiler' (Bayinin kendisi) ---
            // Artık güvenli: Bayiye bağlı hiçbir kayıt kalmadı.
            showLoading(true, `(${currentCount}/${totalBayiCount}) '${bayiName}' bayisi (Adım 3/3) siliniyor...`);
            await pbInstance.collection('bayiler').delete(bayi.id);
            totalBayisDeleted++;
        } // end for (bayi loop)

        alert(`YIKICI TEMİZLİK TAMAMLANDI:\n\n- ${totalGeriAlinanDeleted} adet 'geri alınan' kayıt silindi.\n- ${totalReportsDeleted} adet ilişkili denetim raporu silindi.\n- ${totalBayisDeleted} adet atanmamış bayi silindi.`);
        await loadInitialData(); // Verileri yenile
        
    } catch (error) {
        // Hata durumunda ilerlemeyi bildir
        handleError(error, `Atanmamış bayiler temizlenirken kritik bir hata oluştu.\n\nİşlem durduruldu.\nToplam ${totalBayisDeleted} bayi, ${totalReportsDeleted} rapor ve ${totalGeriAlinanDeleted} 'geri alınan' kayıt şimdiye kadar silindi.\n\Hata Mesajı: ${error.message}\n\nİşlemi tekrar başlatarak kalanları temizleyebilirsiniz.`);
    } finally {
        showLoading(false);
    }
}


// --- Mevcut Fonksiyonlar ---

/**
 * (DÜZELTİLDİ: 'geri alınan' ile ilgili hatalı varsayım kaldırıldı)
 */
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

        // DÜZELTME: Raporları silmek için 'geri alınan' kayıtları silmeye gerek YOKTUR.
        // 'geri alınan' kayıtlar bayilere bağlıdır, raporlara değil.
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

/**
 * (DÜZELTİLDİ: 'geri alınan' ile ilgili hatalı varsayım kaldırıldı)
 * (DÜZELTİLDİ: catch (error { -> catch (error) {  YAZIM HATASI DÜZELTİLDİ)
 */
async function deleteBayiRaporlari() {
    if (!selectedStoreForDeletion) return;
    const confirmation = prompt(`GERİ ALINAMAZ İŞLEM! '${selectedStoreForDeletion.bayiAdi}' adlı bayiye ait TÜM denetim raporlarını kalıcı olarak silmek için 'SİL' yazın.`);
    if (confirmation !== 'SİL') { alert("İşlem iptal edildi."); return; }

    showLoading(true, `'${selectedStoreForDeletion.bayiAdi}' raporları siliniyor...`);
    try {
        const reports = await pbInstance.collection('denetim_raporlari').getFullList({ filter: `bayi = "${selectedStoreForDeletion.id}"`, fields: 'id' });
        if (reports.length === 0) { alert("Bu bayiye ait silinecek rapor bulunamadı."); return; }
        
        // DÜZELTME: Raporları silmek için 'geri alınan' kayıtları silmeye gerek YOKTUR.
        const deletePromises = reports.map(report => pbInstance.collection('denetim_raporlari').delete(report.id));
        await Promise.all(deletePromises);
        alert(`${reports.length} adet rapor başarıyla silindi.`);
    } catch (error) { // <-- HATA BURADAYDI, DÜZELTİLDİ
        handleError(error, "Bayi raporları silinirken hata oluştu.");
    } finally {
        selectedStoreForDeletion = null;
        document.getElementById('bayi-arama-silme-input').value = '';
        document.getElementById('sil-bayi-raporlari-btn').disabled = true;
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
            name: 'Atanmamış Bayileri Temizle (Yıkıcı)',
            desc: "'Atanmamış' durumdaki TÜM bayileri VE bu bayilere ait TÜM raporları (diğer kullanıcılara ait olanlar dahil) kalıcı olarak siler.", 
            impact: '<strong>YÜKSEK RİSK.</strong> Bayi listesi ve raporlar kalıcı olarak silinir.',
            isAction: true,
            action: handleDeleteUnassignedBayis,
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

/**
 * (DÜZELTİLDİ: 'geri alınan' ile ilgili hatalı varsayım kaldırıldı ve 'bayiler' için güvenlik eklendi)
 */
async function deleteTable(collectionName) {
    const confirmation = prompt(`ÇOK TEHLİKELİ İŞLEM! '${collectionName}' tablosundaki TÜM verileri kalıcı olarak silmek için '${collectionName.toUpperCase()}' yazın.`);
    if (confirmation !== collectionName.toUpperCase()) { alert("Onay metni yanlış. İşlem iptal edildi."); return; }
    
    showLoading(true, `'${collectionName}' tablosu siliniyor...`);
    try {
        const records = await pbInstance.collection(collectionName).getFullList({ fields: 'id' });
        if (records.length === 0) { alert(`'${collectionName}' tablosu zaten boş.`); return; }
        
        // GÜVENLİK: 'bayiler' tablosu buradan silinemez.
        if (collectionName === 'bayiler') {
            alert("TEHLİKELİ İŞLEM ENGELLEDİ!\n\n'bayiler' tablosunu buradan toplu silemezsiniz.\n\nBu işlem, 'denetim_raporlari' ve 'denetim_geri_alinanlar' tablolarıyla olan ilişkileri bozacaktır.\n\nBayileri silmek için 'Atanmamış Bayileri Temizle' özelliğini kullanın.");
            return;
        }

        // GÜVENLİK: 'denetim_raporlari' silinirken, 'denetim_geri_alinanlar' da silinmelidir.
        // DÜZELTME: Bu mantık yanlıştı. 'denetim_geri_alinanlar' bayilere bağlı, raporlara değil.
        // Bu nedenle 'denetim_raporlari' silinirken ekstra bir işlem gerekmez.

        // GÜVENLİK: 'users' tablosu buradan silinemez.
        if (collectionName === 'users') {
             alert("TEHLİKELİ İŞLEM ENGELLEDİ!\n\n'users' tablosunu buradan toplu silemezsiniz. Lütfen 'Kullanıcı Yönetimi' modülünü kullanın.");
            return;
        }

        showLoading(true, `'${collectionName}' tablosundaki ${records.length} kayıt siliniyor...`);
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

/**
 * (DÜZELTİLDİ: Hata mesajı artık daha genel ve açıklayıcı)
 */
function handleError(error, userMessage) {
    console.error(userMessage, error);
    const errorMessage = (error.message || '').toLowerCase();
    
    // Veritabanı ilişki/bütünlük hatası
    if (errorMessage.includes('relation') || errorMessage.includes('reference') || errorMessage.includes('constraint')) {
        alert(`İşlem Başarısız!\n\n${userMessage}\n\nSebep: Silinmeye çalışılan bir kayıt (örn: bayi), başka bir tablodaki (örn: denetim_geri_alinanlar) bir veri tarafından 'gerekli' olarak kullanılıyor.\nVeri bütünlüğünü korumak için bu silme işlemi engellendi.\n\nÇözüm: Önce bu kayda bağlı olan diğer verilerin (örn: 'geri alınan' kayıtlar) silinmesi gerekmektedir.`);
    } else {
        alert(`${userMessage}: ${error.message || error}`);
    }
}