/**
 * Kullanıcı Yönetimi Modülü
 * YENİ: Cihaz Yönetimi, Limit Ayarı ve Anlık Ban Sistemi eklendi.
 */
export function initializeKullaniciYoneticisiModule(pbInstance) {
    
    // --- Global Değişkenler ve DOM Elementleri ---
    const pb = pbInstance;
    let allUsersCache = []; // Kullanıcıları hafızada tutmak için
    let clientDeviceLimitRecordId = null; // 'ayarlar' tablosundaki limit kaydının ID'si

    // Ana Görünümler
    const listView = document.getElementById('user-list-view');
    const formView = document.getElementById('user-form-view');
    
    // Global Ayarlar Elemanları (YENİ)
    const clientDeviceLimitInput = document.getElementById('client-device-limit-input');
    const saveDeviceLimitBtn = document.getElementById('save-device-limit-btn');
    const deviceLimitStatus = document.getElementById('device-limit-status');
    
    // Liste Elemanları
    const tableBody = document.getElementById('users-table-body');
    
    // Form Elemanları
    const form = document.getElementById('user-form');
    const formTitle = document.getElementById('user-form-title');
    const userIdInput = document.getElementById('user-id-input');
    const userNameInput = document.getElementById('user-name-input'); 
    const userEmailInput = document.getElementById('user-email-input');
    
    // Parola Elemanları
    const passwordWrapper = document.getElementById('password-fields-wrapper');
    const userPasswordInput = document.getElementById('user-password-input');
    const userPasswordConfirmInput = document.getElementById('user-password-confirm-input');
    
    // Diğer Form Elemanları
    const userRoleSelect = document.getElementById('user-role-select');
    const mobileAccessCheckbox = document.getElementById('user-mobile-access-checkbox');
    
    // Hesap Kilitleme (BAN) Elemanları (YENİ)
    const userBanSection = document.getElementById('user-ban-section');
    const toggleBanUserBtn = document.getElementById('toggle-ban-user-btn');
    
    // Cihaz Listesi Elemanları (YENİ)
    const devicesHr = document.getElementById('devices-hr');
    const devicesTitle = document.getElementById('devices-title');
    const devicesDescription = document.getElementById('devices-description');
    const devicesListLoading = document.getElementById('devices-list-loading');
    const userDevicesTableWrapper = document.getElementById('user-devices-table-wrapper');
    const userDevicesTableBody = document.getElementById('user-devices-table-body');
    
    // Butonlar
    const addNewUserBtn = document.getElementById('add-new-user-btn');
    const saveUserBtn = document.getElementById('save-user-btn');
    const cancelUserFormBtn = document.getElementById('cancel-user-form-btn');

    // --- 1. Ana Veri Yükleme Fonksiyonları ---
    
    /**
     * Tüm kullanıcıları PocketBase'den çeker ve tabloyu doldurur.
     */
    async function loadUsers() {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Kullanıcılar yükleniyor...</td></tr>';
        
        try {
            allUsersCache = await pb.collection('users').getFullList({
                sort: 'name', // İsime göre sırala
            });
            renderUsersTable(allUsersCache);
        } catch (error) {
            console.error('Kullanıcılar yüklenirken hata:', error);
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Kullanıcılar yüklenemedi.</td></tr>';
        }
    }

    /**
     * YENİ: Cihaz limiti ayarını çeker.
     */
    async function loadDeviceLimitSetting() {
        try {
            const record = await pb.collection('ayarlar').getFirstListItem('anahtar="clientDeviceLimit"');
            clientDeviceLimitRecordId = record.id; // Kaydet butonu için ID'yi sakla
            clientDeviceLimitInput.value = parseInt(record.deger) || 1;
        } catch (error) {
            console.error('Cihaz limiti ayarı yüklenemedi:', error);
            deviceLimitStatus.textContent = 'Hata: Cihaz limiti ayarı yüklenemedi.';
            deviceLimitStatus.style.color = 'red';
        }
    }

    /**
     * YENİ: Belirli bir kullanıcının kayıtlı cihazlarını çeker.
     * @param {string} userId - Cihazları yüklenecek kullanıcının ID'si.
     */
    async function loadUserDevices(userId) {
        devicesListLoading.style.display = 'block';
        userDevicesTableWrapper.style.display = 'none';
        userDevicesTableBody.innerHTML = '';

        try {
            const devices = await pb.collection('user_devices').getFullList({
                filter: `user = "${userId}"`,
                sort: '-last_login' // En son giriş yapan üstte
            });
            renderUserDevicesTable(devices);
        } catch (error) {
            console.error('Kullanıcı cihazları yüklenirken hata:', error);
            userDevicesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Cihazlar yüklenemedi.</td></tr>';
        } finally {
            devicesListLoading.style.display = 'none';
            userDevicesTableWrapper.style.display = 'block';
        }
    }

    
    // --- 2. Arayüz (UI) Çizim Fonksiyonları ---

    /**
     * Kullanıcı listesini HTML tablosuna çizer.
     * @param {Array} users - Çizdirilecek kullanıcı dizisi.
     */
    function renderUsersTable(users) {
        tableBody.innerHTML = '';
        if (users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Sistemde kayıtlı kullanıcı bulunamadı.</td></tr>';
            return;
        }

        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.dataset.userId = user.id;

            const userName = user.name || '<span style="color: #999;">İsimsiz</span>';
            const userEmail = user.email;
            
            const roleText = user.role === 'admin' ? 'Yönetici' : 'Standart Kullanıcı';
            const roleClass = user.role === 'admin' ? 'role-admin' : 'role-client';
            
            // YENİ: Ban durumu
            const banStatusText = user.is_banned ? 'Kilitli (Ban)' : 'Aktif';
            const banStatusClass = user.is_banned ? 'status-banned' : 'status-active';

            const mobileAccessText = user.mobile_access ? 'Evet' : 'Hayır';
            const createdDate = new Date(user.created).toLocaleString('tr-TR', { 
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
            });

            tr.innerHTML = `
                <td data-label="İsim"><strong>${userName}</strong></td>
                <td data-label="E-posta">${userEmail}</td>
                <td data-label="Rol"><span class="role-badge ${roleClass}">${roleText}</span></td>
                <td data-label="Durum"><span class="status-badge ${banStatusClass}">${banStatusText}</span></td>
                <td data-label="Mobil Erişim">${mobileAccessText}</td>
                <td data-label="Oluşturulma Tarihi">${createdDate}</td>
                <td class="actions-cell">
                    <button class="btn-warning btn-sm btn-edit" title="Düzenle"><i class="fas fa-edit"></i> Düzenle</button>
                    <button class="btn-danger btn-sm btn-delete" title="Sil"><i class="fas fa-trash"></i> Sil</button>
                </td>
            `;

            tr.querySelector('.btn-edit').addEventListener('click', () => handleEdit(user.id));
            tr.querySelector('.btn-delete').addEventListener('click', () => handleDelete(user.id));

            tableBody.appendChild(tr);
        });
    }

    /**
     * YENİ: Cihaz listesini HTML tablosuna çizer.
     * @param {Array} devices - Çizdirilecek cihaz dizisi.
     */
    function renderUserDevicesTable(devices) {
        userDevicesTableBody.innerHTML = '';
        if (devices.length === 0) {
            userDevicesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;">Bu kullanıcı için kayıtlı cihaz bulunamadı.</td></tr>';
            return;
        }

        devices.forEach(device => {
            const tr = document.createElement('tr');
            tr.dataset.deviceId = device.id;

            const deviceInfo = device.device_info || 'Bilinmeyen Cihaz';
            const lastLogin = new Date(device.last_login).toLocaleString('tr-TR');
            
            const deviceStatusText = device.is_locked ? 'Kilitli' : 'Aktif';
            const deviceStatusClass = device.is_locked ? 'status-banned' : 'status-active';
            
            const lockButtonIcon = device.is_locked ? 'fa-lock-open' : 'fa-lock';
            const lockButtonText = device.is_locked ? 'Kilidi Aç' : 'Kilitle';
            const lockButtonClass = device.is_locked ? 'btn-success' : 'btn-warning';

            tr.innerHTML = `
                <td data-label="Cihaz Bilgisi">${deviceInfo}</td>
                <td data-label="Son Giriş">${lastLogin}</td>
                <td data-label="Durum"><span class="status-badge ${deviceStatusClass}">${deviceStatusText}</span></td>
                <td class="actions-cell" style="min-width: 200px;">
                    <button class="btn-sm ${lockButtonClass} btn-lock-device" title="${lockButtonText}">
                        <i class="fas ${lockButtonIcon}"></i>
                    </button>
                    <button class="btn-danger btn-sm btn-delete-device" title="Cihazı Sil (Sıfırla)">
                        <i class="fas fa-trash"></i> Sil
                    </button>
                </td>
            `;

            // Olay dinleyicileri
            tr.querySelector('.btn-lock-device').addEventListener('click', () => 
                handleToggleLockDevice(device.id, device.is_locked)
            );
            tr.querySelector('.btn-delete-device').addEventListener('click', () => 
                handleDeleteDevice(device.id)
            );

            userDevicesTableBody.appendChild(tr);
        });
    }

    // --- 3. Görünüm (View) Değiştirme Fonksiyonları ---

    /**
     * Form görünümünü açar, liste görünümünü gizler.
     */
    function showFormView() {
        listView.style.display = 'none';
        formView.style.display = 'block';
    }

    /**
     * Liste görünümünü açar, form görünümünü gizler ve formu sıfırlar.
     */
    function showListView() {
        formView.style.display = 'none';
        listView.style.display = 'block';
        form.reset();
        userIdInput.value = '';
        userEmailInput.disabled = false;
    }

    // --- 4. CRUD ve Diğer İşleyici Fonksiyonlar ---
    
    /**
     * "Yeni Kullanıcı Ekle" formunu hazırlar ve gösterir.
     */
    function handleNew() {
        form.reset();
        userIdInput.value = '';
        formTitle.textContent = 'Yeni Kullanıcı Ekle';
        
        passwordWrapper.style.display = 'block'; 
        userPasswordInput.required = true;
        userPasswordConfirmInput.required = true;
        
        userEmailInput.disabled = false; 

        // Yeni kullanıcıda ban/cihaz bölümünü gizle
        userBanSection.style.display = 'none';
        devicesHr.style.display = 'none';
        devicesTitle.style.display = 'none';
        devicesDescription.style.display = 'none';
        devicesListLoading.style.display = 'none';
        userDevicesTableWrapper.style.display = 'none';
        
        showFormView();
    }

    /**
     * "Düzenle" butonuna basıldığında formu doldurur ve gösterir.
     * @param {string} userId - Düzenlenecek kullanıcının ID'si.
     */
    function handleEdit(userId) {
        const user = allUsersCache.find(u => u.id === userId);
        if (!user) return;

        form.reset();
        userIdInput.value = user.id;
        formTitle.textContent = 'Kullanıcıyı Düzenle';

        userNameInput.value = user.name || ''; 
        userEmailInput.value = user.email;
        userEmailInput.disabled = true; // E-posta değiştirilemez
        userRoleSelect.value = user.role;
        mobileAccessCheckbox.checked = user.mobile_access;

        passwordWrapper.style.display = 'none'; 
        userPasswordInput.required = false;
        userPasswordConfirmInput.required = false;
        
        // YENİ: Ban (Kilitleme) bölümünü ayarla
        userBanSection.style.display = 'block';
        updateBanButton(user.is_banned);

        // YENİ: Cihaz listesi bölümünü göster ve yükle
        devicesHr.style.display = 'block';
        devicesTitle.style.display = 'block';
        devicesDescription.style.display = 'block';
        
        // Admin kullanıcısı için cihaz yönetimi gerekmez (her yerden girer)
        if (user.role === 'admin') {
            devicesDescription.textContent = 'Yönetici (Admin) kullanıcıları için cihaz kilidi uygulanmaz.';
            devicesListLoading.style.display = 'none';
            userDevicesTableWrapper.style.display = 'none';
        } else {
            devicesDescription.textContent = 'Kullanıcının giriş yaptığı ve kayıtlı olan cihazları. Buradan tek tek cihazları silebilir (sıfırlayabilir) veya kilitleyebilirsiniz.';
            loadUserDevices(user.id); // Client kullanıcısının cihazlarını yükle
        }
        
        showFormView();
    }

    /**
     * "Sil" butonuna basıldığında kullanıcıyı siler.
     * @param {string} userId - Silinecek kullanıcının ID'si.
     */
    async function handleDelete(userId) {
        const user = allUsersCache.find(u => u.id === userId);
        if (!user) return;

        const userNameForConfirm = user.name || user.email;
        if (!confirm(`'${userNameForConfirm}' adlı kullanıcıyı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
            return;
        }

        try {
            // İlgili cihazları da temizle (opsiyonel ama iyi bir pratik)
            const devices = await pb.collection('user_devices').getFullList({ filter: `user = "${userId}"` });
            for (const device of devices) {
                await pb.collection('user_devices').delete(device.id);
            }
            
            // Kullanıcıyı sil
            await pb.collection('users').delete(userId);
            await loadUsers(); // Tabloyu yenile
        } catch (error) {
            console.error('Kullanıcı silinirken hata:', error);
            alert('Kullanıcı silinirken bir hata oluştu: ' + error.message);
        }
    }

    /**
     * Form "Kaydet" butonuna basıldığında (submit) tetiklenir.
     */
    async function handleFormSubmit(event) {
        event.preventDefault();
        saveUserBtn.disabled = true;
        saveUserBtn.textContent = 'Kaydediliyor...';

        const userId = userIdInput.value;
        
        const data = {
            name: userNameInput.value,
            email: userEmailInput.value,
            role: userRoleSelect.value,
            mobile_access: mobileAccessCheckbox.checked,
        };

        try {
            if (userId) { 
                // --- GÜNCELLEME ---
                await pb.collection('users').update(userId, data);
            } else { 
                // --- YENİ KAYIT ---
                if (!userPasswordInput.value || !userPasswordConfirmInput.value) {
                    throw new Error('Yeni kullanıcı için parola zorunludur.');
                }
                if (userPasswordInput.value !== userPasswordConfirmInput.value) {
                    throw new Error('Parolalar eşleşmiyor.');
                }
                data.password = userPasswordInput.value;
                data.passwordConfirm = userPasswordConfirmInput.value;
                // Yeni kullanıcıda ban durumu varsayılan false (veritabanı ayarı)
                
                await pb.collection('users').create(data);
            }
            
            await loadUsers(); // Tabloyu yenile
            showListView(); // Listeye dön

        } catch (error) {
            console.error('Kullanıcı kaydedilirken hata:', error);
            alert('Hata: ' + (error.message || 'Lütfen tüm zorunlu alanları doldurun.'));
        } finally {
            saveUserBtn.disabled = false;
            saveUserBtn.textContent = 'Kaydet';
        }
    }
    
    /**
     * YENİ: "Limiti Kaydet" butonuna basıldığında tetiklenir.
     */
    async function handleSaveDeviceLimit() {
        if (!clientDeviceLimitRecordId) {
            alert('Ayar IDsi bulunamadı. Sayfayı yenileyin.');
            return;
        }

        let limit = parseInt(clientDeviceLimitInput.value);
        if (isNaN(limit) || limit < 1) {
            limit = 1;
        } else if (limit > 5) { // Kullanıcının istediği maksimum 5 limiti
            limit = 5;
        }
        clientDeviceLimitInput.value = limit;

        saveDeviceLimitBtn.disabled = true;
        deviceLimitStatus.textContent = 'Kaydediliyor...';
        deviceLimitStatus.style.color = '#333';

        try {
            await pb.collection('ayarlar').update(clientDeviceLimitRecordId, {
                'deger': limit.toString()
            });
            deviceLimitStatus.textContent = 'Limit başarıyla güncellendi.';
            deviceLimitStatus.style.color = 'green';
        } catch (error) {
            console.error('Cihaz limiti kaydedilirken hata:', error);
            deviceLimitStatus.textContent = 'Hata: Limit kaydedilemedi.';
            deviceLimitStatus.style.color = 'red';
        } finally {
            saveDeviceLimitBtn.disabled = false;
            setTimeout(() => { deviceLimitStatus.textContent = ''; }, 3000);
        }
    }
    
    /**
     * YENİ: "Hesabı Kilitle / Kilidi Aç" butonuna basıldığında tetiklenir.
     * Bu işlem ANLIKTIR, "Kaydet" butonunu beklemez.
     */
    async function handleToggleBanUser() {
        const userId = userIdInput.value;
        if (!userId) return;

        const user = allUsersCache.find(u => u.id === userId);
        if (!user) return;

        const newBanStatus = !user.is_banned;
        const actionText = newBanStatus ? 'kilitlemek (BAN)' : 'kilidini açmak';
        
        if (!confirm(`Bu kullanıcıyı anlık olarak ${actionText} istediğinizden emin misiniz?`)) {
            return;
        }
        
        toggleBanUserBtn.disabled = true;
        toggleBanUserBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> İşleniyor...';

        try {
            await pb.collection('users').update(userId, { 'is_banned': newBanStatus });
            
            // Lokal önbelleği (cache) güncelle
            user.is_banned = newBanStatus;
            
            // Butonun durumunu güncelle
            updateBanButton(newBanStatus);
            
            // Ana kullanıcı listesini de arka planda yenile (durumun görünmesi için)
            loadUsers();
            
        } catch (error) {
            console.error('Kullanıcı kilitlenirken hata:', error);
            alert('Hata: ' + error.message);
            updateBanButton(user.is_banned); // Hata olursa eski duruma dön
        } finally {
            toggleBanUserBtn.disabled = false;
        }
    }
    
    /**
     * YENİ: Ban butonunun metnini ve rengini günceller.
     * @param {boolean} isBanned - Kullanıcının kilitli olup olmadığı.
     */
    function updateBanButton(isBanned) {
        if (isBanned) {
            toggleBanUserBtn.innerHTML = '<i class="fas fa-lock-open"></i> Bu Kullanıcının Kilidini Aç';
            toggleBanUserBtn.classList.remove('btn-danger');
            toggleBanUserBtn.classList.add('btn-success');
        } else {
            toggleBanUserBtn.innerHTML = '<i class="fas fa-ban"></i> Bu Kullanıcının Hesabını Kilitle (BAN)';
            toggleBanUserBtn.classList.remove('btn-success');
            toggleBanUserBtn.classList.add('btn-danger');
        }
    }
    
    /**
     * YENİ: Bir cihazı siler (sıfırlar).
     * @param {string} deviceId - Silinecek cihazın 'user_devices' tablosundaki ID'si.
     */
    async function handleDeleteDevice(deviceId) {
        if (!confirm("Bu cihaz kaydını silmek istediğinizden emin misiniz? Kullanıcı bu cihazdan tekrar giriş yaparsa, limit dahilindeyse yeni bir kayıt oluşturulur.")) {
            return;
        }
        
        try {
            await pb.collection('user_devices').delete(deviceId);
            // Cihaz listesini yenile
            const userId = userIdInput.value;
            loadUserDevices(userId);
        } catch (error) {
            console.error('Cihaz silinirken hata:', error);
            alert('Hata: Cihaz silinemedi.');
        }
    }
    
    /**
     * YENİ: Bir cihazı kilitler veya kilidini açar.
     * @param {string} deviceId - İşlem yapılacak cihazın ID'si.
     * @param {boolean} currentLockStatus - Cihazın mevcut kilit durumu.
     */
    async function handleToggleLockDevice(deviceId, currentLockStatus) {
        const newLockStatus = !currentLockStatus;
        const actionText = newLockStatus ? 'kilitlemek' : 'kilidini açmak';

        if (!confirm(`Bu cihazı ${actionText} istediğinizden emin misiniz?`)) {
            return;
        }

        try {
            await pb.collection('user_devices').update(deviceId, { 'is_locked': newLockStatus });
            // Cihaz listesini yenile
            const userId = userIdInput.value;
            loadUserDevices(userId);
        } catch (error) {
            console.error('Cihaz kilitlenirken hata:', error);
            alert('Hata: Cihaz durumu güncellenemedi.');
        }
    }

    // --- 5. Olay Dinleyicileri (Event Listeners) ---
    
    function setupEventListeners() {
        if (addNewUserBtn) addNewUserBtn.addEventListener('click', handleNew);
        if (cancelUserFormBtn) cancelUserFormBtn.addEventListener('click', showListView);
        if (form) form.addEventListener('submit', handleFormSubmit);
        
        // YENİ Dinleyiciler
        if (saveDeviceLimitBtn) saveDeviceLimitBtn.addEventListener('click', handleSaveDeviceLimit);
        if (toggleBanUserBtn) toggleBanUserBtn.addEventListener('click', handleToggleBanUser);
        
        // ESKİ Cihaz Sıfırlama Dinleyicisi Kaldırıldı
    }

    // --- 6. Modülü Başlat ---
    setupEventListeners();
    loadUsers(); // Ana kullanıcı listesini yükle
    loadDeviceLimitSetting(); // Global cihaz limit ayarını yükle
}