/**
 * Kullanıcı Yönetimi Modülü
 * YENİ: v2.27 - Sekmeli (Tab) Arayüz mantığı eklendi.
 * Bireysel cihaz limiti ve anlık ban sistemi.
 */
export function initializeKullaniciYoneticisiModule(pbInstance) {
    
    // --- Global Değişkenler ve DOM Elementleri ---
    const pb = pbInstance;
    let allUsersCache = []; 

    // Ana Görünümler
    const listView = document.getElementById('user-list-view');
    const formView = document.getElementById('user-form-view');
    
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

    // Bireysel Cihaz Limiti Elemanları
    const userDeviceLimitSection = document.getElementById('user-device-limit-section');
    const userDeviceLimitInput = document.getElementById('user-device-limit-input');
    
    // Hesap Kilitleme (BAN) Elemanları
    const userBanSection = document.getElementById('user-ban-section');
    const toggleBanUserBtn = document.getElementById('toggle-ban-user-btn');
    
    // Cihaz Listesi Elemanları
    const devicesHr = document.getElementById('devices-hr'); // Artık kullanılmıyor ama ID durabilir
    const devicesTitle = document.getElementById('devices-title'); // Artık kullanılmıyor ama ID durabilir
    const devicesDescription = document.getElementById('devices-description');
    const devicesListLoading = document.getElementById('devices-list-loading');
    const userDevicesTableWrapper = document.getElementById('user-devices-table-wrapper');
    const userDevicesTableBody = document.getElementById('user-devices-table-body');

    // Sekme Elemanları (YENİ v2.27)
    const tabLinks = formView.querySelectorAll('.ky-tab-link');
    const tabPanes = formView.querySelectorAll('.ky-tab-pane');
    const devicesTabLink = formView.querySelector('a[data-tab="tab-cihazlar"]');
    
    // Butonlar
    const addNewUserBtn = document.getElementById('add-new-user-btn');
    const saveUserBtn = document.getElementById('save-user-btn');
    const cancelUserFormBtn = document.getElementById('cancel-user-form-btn');

    // --- 0. YENİ Sekme (Tab) Arayüzü Mantığı ---
    function setupTabNavigation() {
        tabLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const targetTabId = link.dataset.tab;

                // Tüm linklerden 'active' classını kaldır
                tabLinks.forEach(l => l.classList.remove('active'));
                // Tıklanan linke 'active' classını ekle
                link.classList.add('active');

                // Tüm panelleri gizle
                tabPanes.forEach(pane => {
                    if (pane.id === targetTabId) {
                        pane.classList.add('active'); // Hedef paneli göster
                    } else {
                        pane.classList.remove('active'); // Diğerlerini gizle
                    }
                });
            });
        });
    }

    // Varsayılan sekmeyi (ilk sekmeyi) göster
    function resetToDefaultTab() {
        tabLinks.forEach((link, index) => {
            if (index === 0) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
        tabPanes.forEach((pane, index) => {
            if (index === 0) {
                pane.classList.add('active');
            } else {
                pane.classList.remove('active');
            }
        });
    }

    // --- 1. Ana Veri Yükleme Fonksiyonları ---
    
    async function loadUsers() {
        tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Kullanıcılar yükleniyor...</td></tr>';
        
        try {
            allUsersCache = await pb.collection('users').getFullList({
                sort: 'name',
            });
            renderUsersTable(allUsersCache);
        } catch (error) {
            console.error('Kullanıcılar yüklenirken hata:', error);
            tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Kullanıcılar yüklenemedi.</td></tr>';
        }
    }

    async function loadUserDevices(userId) {
        devicesListLoading.style.display = 'block';
        userDevicesTableWrapper.style.display = 'none';
        userDevicesTableBody.innerHTML = '';

        try {
            const devices = await pb.collection('user_devices').getFullList({
                filter: `user = "${userId}"`,
                sort: '-last_login'
            });
            renderUserDevicesTable(devices);
        } catch (error)
        {
            console.error('Kullanıcı cihazları yüklenirken hata:', error);
            userDevicesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: red;">Cihazlar yüklenemedi.</td></tr>';
        } finally {
            devicesListLoading.style.display = 'none';
            userDevicesTableWrapper.style.display = 'block';
        }
    }

    
    // --- 2. Arayüz (UI) Çizim Fonksiyonları ---

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

    function renderUserDevicesTable(devices) {
        userDevicesTableBody.innerHTML = '';
        if (devices.length === 0) {
            userDevicesTableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #555;">Bu kullanıcı için kayıtlı cihaz bulunamadı.</td></tr>';
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
                <td class="actions-cell">
                    <button class="btn-sm ${lockButtonClass} btn-lock-device" title="${lockButtonText}">
                        <i class="fas ${lockButtonIcon}"></i>
                    </button>
                    <button class="btn-danger btn-sm btn-delete-device" title="Cihazı Sil (Sıfırla)">
                        <i class="fas fa-trash"></i> Sil
                    </button>
                </td>
            `;

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

    function showFormView() {
        listView.style.display = 'none';
        formView.style.display = 'block';
        resetToDefaultTab(); // Formu açarken her zaman ilk sekmeyi göster
    }

    function showListView() {
        formView.style.display = 'none';
        listView.style.display = 'block';
        form.reset();
        userIdInput.value = '';
        userEmailInput.disabled = false;
    }

    // --- 4. CRUD ve Diğer İşleyici Fonksiyonlar ---
    
    function handleNew() {
        form.reset();
        userIdInput.value = '';
        formTitle.textContent = 'Yeni Kullanıcı Ekle';
        
        passwordWrapper.style.display = 'block'; 
        userPasswordInput.required = true;
        userPasswordConfirmInput.required = true;
        
        userEmailInput.disabled = false; 

        // Ban bölümünü gizle
        userBanSection.style.display = 'none';
        
        // Cihazlar sekmesini gizle (yeni kullanıcıda cihaz olmaz)
        devicesTabLink.style.display = 'none';
        
        // Rol 'client' olarak varsayılan seçili olduğu için cihaz limitini göster
        userDeviceLimitSection.style.display = 'block';
        userDeviceLimitInput.value = 1; // Varsayılan

        showFormView();
    }

    function handleEdit(userId) {
        const user = allUsersCache.find(u => u.id === userId);
        if (!user) return;

        form.reset();
        userIdInput.value = user.id;
        formTitle.textContent = 'Kullanıcıyı Düzenle';

        userNameInput.value = user.name || ''; 
        userEmailInput.value = user.email;
        userEmailInput.disabled = true;
        userRoleSelect.value = user.role;
        mobileAccessCheckbox.checked = user.mobile_access;

        // Düzenleme modunda parola alanları gizli ve zorunlu değil
        passwordWrapper.style.display = 'none'; 
        userPasswordInput.required = false;
        userPasswordConfirmInput.required = false;
        // Parolaları temizle (tarayıcı dolgusu kalmasın)
        userPasswordInput.value = '';
        userPasswordConfirmInput.value = '';
        
        // Ban bölümünü ayarla
        userBanSection.style.display = 'block';
        updateBanButton(user.is_banned);
        
        // Cihazlar sekmesini göster
        devicesTabLink.style.display = 'block';
        
        if (user.role === 'admin') {
            // Admin ise: Cihaz yönetimi ve limiti gerekmez
            devicesDescription.textContent = 'Yönetici (Admin) kullanıcıları için cihaz kilidi/limiti uygulanmaz.';
            devicesListLoading.style.display = 'none';
            userDevicesTableWrapper.style.display = 'none';
            userDeviceLimitSection.style.display = 'none'; // Bireysel limiti gizle
        } else {
            // Client ise: Cihaz yönetimi ve limiti göster
            devicesDescription.textContent = 'Kullanıcının giriş yaptığı ve kayıtlı olan cihazları. Buradan tek tek cihazları silebilir (sıfırlayabilir) veya kilitleyebilirsiniz.';
            userDeviceLimitSection.style.display = 'block'; // Bireysel limiti göster
            userDeviceLimitInput.value = user.device_limit || 1; 
            loadUserDevices(user.id); // Cihazları yükle
        }
        
        showFormView();
    }

    async function handleDelete(userId) {
        const user = allUsersCache.find(u => u.id === userId);
        if (!user) return;

        const userNameForConfirm = user.name || user.email;
        if (!confirm(`'${userNameForConfirm}' adlı kullanıcıyı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
            return;
        }

        try {
            const devices = await pb.collection('user_devices').getFullList({ filter: `user = "${userId}"` });
            for (const device of devices) {
                await pb.collection('user_devices').delete(device.id);
            }
            await pb.collection('users').delete(userId);
            await loadUsers();
        } catch (error) {
            console.error('Kullanıcı silinirken hata:', error);
            alert('Kullanıcı silinirken bir hata oluştu: ' + error.message);
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        saveUserBtn.disabled = true;
        saveUserBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Kaydediliyor...';

        const userId = userIdInput.value;
        
        const data = {
            name: userNameInput.value,
            email: userEmailInput.value,
            role: userRoleSelect.value,
            mobile_access: mobileAccessCheckbox.checked,
            device_limit: 1 
        };

        if (data.role === 'client') {
            let limit = parseInt(userDeviceLimitInput.value);
            if (isNaN(limit) || limit < 1) limit = 1;
            if (limit > 5) limit = 5; 
            data.device_limit = limit;
        }
        
        // Parola GÜNCELLENİYOR MU? (Sadece yeni kayıtta veya parola girildiyse)
        const newPassword = userPasswordInput.value;
        const confirmPassword = userPasswordConfirmInput.value;

        if (!userId) { 
            // --- YENİ KAYIT ---
            if (!newPassword || !confirmPassword) {
                throw new Error('Yeni kullanıcı için parola zorunludur.');
            }
            if (newPassword !== confirmPassword) {
                throw new Error('Parolalar eşleşmiyor.');
            }
            data.password = newPassword;
            data.passwordConfirm = confirmPassword;
        } else if (userId && newPassword) {
            // --- GÜNCELLEME VE PAROLA DEĞİŞİKLİĞİ ---
             if (newPassword !== confirmPassword) {
                throw new Error('Parolalar eşleşmiyor.');
            }
            data.password = newPassword;
            data.passwordConfirm = confirmPassword;
        }

        try {
            if (userId) { 
                await pb.collection('users').update(userId, data);
            } else { 
                await pb.collection('users').create(data);
            }
            
            await loadUsers(); 
            showListView(); 

        } catch (error) {
            console.error('Kullanıcı kaydedilirken hata:', error);
            alert('Hata: ' + (error.message || 'Lütfen tüm zorunlu alanları doldurun.'));
        } finally {
            saveUserBtn.disabled = false;
            saveUserBtn.innerHTML = '<i class="fas fa-save"></i> Kaydet';
        }
    }
    
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
            user.is_banned = newBanStatus;
            updateBanButton(newBanStatus);
            loadUsers();
        } catch (error) {
            console.error('Kullanıcı kilitlenirken hata:', error);
            alert('Hata: ' + error.message);
            updateBanButton(user.is_banned); 
        } finally {
            toggleBanUserBtn.disabled = false;
        }
    }
    
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
    
    async function handleDeleteDevice(deviceId) {
        if (!confirm("Bu cihaz kaydını silmek istediğinizden emin misiniz?")) {
            return;
        }
        try {
            await pb.collection('user_devices').delete(deviceId);
            loadUserDevices(userIdInput.value);
        } catch (error) {
            console.error('Cihaz silinirken hata:', error);
            alert('Hata: Cihaz silinemedi.');
        }
    }
    
    async function handleToggleLockDevice(deviceId, currentLockStatus) {
        const newLockStatus = !currentLockStatus;
        const actionText = newLockStatus ? 'kilitlemek' : 'kilidini açmak';

        if (!confirm(`Bu cihazı ${actionText} istediğinizden emin misiniz?`)) {
            return;
        }
        try {
            await pb.collection('user_devices').update(deviceId, { 'is_locked': newLockStatus });
            loadUserDevices(userIdInput.value);
        } catch (error) {
            console.error('Cihaz kilitlenirken hata:', error);
            alert('Hata: Cihaz durumu güncellenemedi.');
        }
    }

    function handleRoleChange() {
        if (userRoleSelect.value === 'admin') {
            userDeviceLimitSection.style.display = 'none';
            devicesTabLink.style.display = 'none'; // Admin ise Cihazlar sekmesini de gizle
        } else {
            userDeviceLimitSection.style.display = 'block';
            devicesTabLink.style.display = 'block';
        }
    }

    // --- 5. Olay Dinleyicileri (Event Listeners) ---
    
    function setupEventListeners() {
        if (addNewUserBtn) addNewUserBtn.addEventListener('click', handleNew);
        if (cancelUserFormBtn) cancelUserFormBtn.addEventListener('click', showListView);
        if (form) form.addEventListener('submit', handleFormSubmit);
        
        if (toggleBanUserBtn) toggleBanUserBtn.addEventListener('click', handleToggleBanUser);
        if (userRoleSelect) userRoleSelect.addEventListener('change', handleRoleChange);

        // YENİ: Sekme navigasyonunu ayarla
        setupTabNavigation();
    }

    // --- 6. Modülü Başlat ---
    setupEventListeners();
    loadUsers(); // Ana kullanıcı listesini yükle
}