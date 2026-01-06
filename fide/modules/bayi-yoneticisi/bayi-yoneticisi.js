/**
 * Kullanıcı Yönetimi Modülü
 * YENİ: Excel Yetkisi İkiye Bölündü (Import ve Export ayrı ayrı yönetiliyor).
 */
export function initializeKullaniciYoneticisiModule(pbInstance) {
    
    // --- Global Değişkenler ve DOM Elementleri ---
    const pb = pbInstance;
    let allUsersCache = []; 

    // Ana Görünümler
    const listView = document.getElementById('user-list-view');
    const formView = document.getElementById('user-form-view');
    
    const tableBody = document.getElementById('users-table-body');
    
    const form = document.getElementById('user-form');
    const formTitle = document.getElementById('user-form-title');
    const userIdInput = document.getElementById('user-id-input');
    const userNameInput = document.getElementById('user-name-input'); 
    const userEmailInput = document.getElementById('user-email-input');
    
    const passwordWrapper = document.getElementById('password-fields-wrapper');
    const userPasswordInput = document.getElementById('user-password-input');
    const userPasswordConfirmInput = document.getElementById('user-password-confirm-input');
    
    const userRoleSelect = document.getElementById('user-role-select');
    const mobileAccessCheckbox = document.getElementById('user-mobile-access-checkbox');

    const userDeviceLimitSection = document.getElementById('user-device-limit-section');
    const userDeviceLimitInput = document.getElementById('user-device-limit-input');
    
    // YENİ: Yetki Yönetimi Elemanları
    const permissionSection = document.getElementById('permission-management-section');
    
    // Bayi Yöneticisi Yetkileri (GÜNCELLENDİ)
    const permBayiAccess = document.getElementById('perm-bayi-yoneticisi-access');
    const permBayiExport = document.getElementById('perm-bayi-export'); // Yeni
    const permBayiImport = document.getElementById('perm-bayi-import'); // Yeni
    const permBayiAssign = document.getElementById('perm-bayi-assign');
    const permBayiCrud = document.getElementById('perm-bayi-crud');
    
    const permDenetimAccess = document.getElementById('perm-denetim-takip-access');
    const permEmailAccess = document.getElementById('perm-eposta-taslagi-access');

    const userBanSection = document.getElementById('user-ban-section');
    const toggleBanUserBtn = document.getElementById('toggle-ban-user-btn');
    
    const devicesHr = document.getElementById('devices-hr');
    const devicesTitle = document.getElementById('devices-title');
    const devicesDescription = document.getElementById('devices-description');
    const devicesListLoading = document.getElementById('devices-list-loading');
    const userDevicesTableWrapper = document.getElementById('user-devices-table-wrapper');
    const userDevicesTableBody = document.getElementById('user-devices-table-body');
    
    const addNewUserBtn = document.getElementById('add-new-user-btn');
    const saveUserBtn = document.getElementById('save-user-btn');
    const cancelUserFormBtn = document.getElementById('cancel-user-form-btn');

    // --- 1. Ana Veri Yükleme Fonksiyonları ---
    
    async function loadUsers() {
        if (listView.style.display !== 'none') {
             tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center;">Kullanıcılar yükleniyor...</td></tr>';
        }
        
        try {
            allUsersCache = await pb.collection('users').getFullList({
                sort: 'name',
            });
            if (listView.style.display !== 'none') {
                 renderUsersTable(allUsersCache);
            }
        } catch (error) {
            console.error('Kullanıcılar yüklenirken hata:', error);
            if (listView.style.display !== 'none') {
                tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Kullanıcılar yüklenemedi.</td></tr>';
            }
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
        } catch (error) {
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
                    <button type="button" class="btn-sm ${lockButtonClass} btn-lock-device" title="${lockButtonText}">
                        <i class="fas ${lockButtonIcon}"></i>
                    </button>
                    <button type="button" class="btn-danger btn-sm btn-delete-device" title="Cihazı Sil (Sıfırla)">
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
    }

    function showListView() {
        formView.style.display = 'none';
        listView.style.display = 'block';
        form.reset();
        userIdInput.value = '';
        userEmailInput.disabled = false;
        renderUsersTable(allUsersCache);
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

        userBanSection.style.display = 'none';
        devicesHr.style.display = 'none';
        devicesTitle.style.display = 'none';
        devicesDescription.style.display = 'none';
        devicesListLoading.style.display = 'none';
        userDevicesTableWrapper.style.display = 'none';
        
        userDeviceLimitSection.style.display = 'block';
        userDeviceLimitInput.value = 1;

        handleRoleChange(); 
        resetPermissionsUI();

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

        passwordWrapper.style.display = 'none'; 
        userPasswordInput.required = false;
        userPasswordConfirmInput.required = false;
        
        userBanSection.style.display = 'block';
        updateBanButton(user.is_banned || false); 

        handleRoleChange(); 
        if (user.role === 'client') {
            loadPermissionsToUI(user.permissions || {});
        }

        devicesHr.style.display = 'block';
        devicesTitle.style.display = 'block';
        devicesDescription.style.display = 'block';
        
        if (user.role === 'admin') {
            devicesDescription.textContent = 'Yönetici (Admin) kullanıcıları için cihaz kilidi/limiti uygulanmaz.';
            devicesListLoading.style.display = 'none';
            userDevicesTableWrapper.style.display = 'none';
            userDeviceLimitSection.style.display = 'none';
        } else {
            devicesDescription.textContent = 'Kullanıcının giriş yaptığı ve kayıtlı olan cihazları. Buradan tek tek cihazları silebilir (sıfırlayabilir) veya kilitleyebilirsiniz.';
            userDeviceLimitSection.style.display = 'block';
            userDeviceLimitInput.value = user.device_limit || 1; 
            loadUserDevices(user.id);
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
            
            allUsersCache = allUsersCache.filter(u => u.id !== userId);
            renderUsersTable(allUsersCache); 
        } catch (error) {
            console.error('Kullanıcı silinirken hata:', error);
            alert('Kullanıcı silinirken bir hata oluştu: ' + error.message);
        }
    }

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
            device_limit: 1 
        };

        if (data.role === 'client') {
            let limit = parseInt(userDeviceLimitInput.value);
            if (isNaN(limit) || limit < 1) limit = 1;
            if (limit > 5) limit = 5;
            data.device_limit = limit;

            data.permissions = collectPermissionsFromUI();
        }

        try {
            if (userId) { 
                await pb.collection('users').update(userId, data);
                await loadUsers(); 
                alert('Değişiklikler ve yetkiler kaydedildi.');
            } else { 
                if (!userPasswordInput.value || !userPasswordConfirmInput.value) {
                    throw new Error('Yeni kullanıcı için parola zorunludur.');
                }
                if (userPasswordInput.value !== userPasswordConfirmInput.value) {
                    throw new Error('Parolalar eşleşmiyor.');
                }
                data.password = userPasswordInput.value;
                data.passwordConfirm = userPasswordConfirmInput.value;
                
                await pb.collection('users').create(data);
                await loadUsers(); 
                showListView(); 
            }
            
        } catch (error) {
            console.error('Kullanıcı kaydedilirken hata:', error);
            alert('Hata: ' + (error.message || 'Lütfen tüm zorunlu alanları doldurun.'));
        } finally {
            saveUserBtn.disabled = false;
            saveUserBtn.textContent = 'Kaydet';
        }
    }
    
    async function handleToggleBanUser() {
        const userId = userIdInput.value;
        if (!userId) return;

        const user = allUsersCache.find(u => u.id === userId);
        if (!user) return;

        const currentBanStatus = user.is_banned || false;
        const newBanStatus = !currentBanStatus;
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
            const userInCache = allUsersCache.find(u => u.id === userId);
            if(userInCache) userInCache.is_banned = newBanStatus;
            
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
        } catch (error)
        {
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
            permissionSection.style.display = 'none'; 
        } else {
            userDeviceLimitSection.style.display = 'block';
            permissionSection.style.display = 'block'; 
        }
    }

    /**
     * YENİ: UI'daki Checkbox'lardan JSON objesi üretir.
     * Export ve Import ayrı ayrı toplanır.
     */
    function collectPermissionsFromUI() {
        return {
            bayi_yoneticisi: {
                access: permBayiAccess.checked,
                features: {
                    // YENİ: Ayrı ayrı kaydet
                    excel_export: permBayiExport.checked,
                    excel_import: permBayiImport.checked,
                    
                    bulk_assign: permBayiAssign.checked,
                    crud_operations: permBayiCrud.checked
                }
            },
            denetim_takip: {
                access: permDenetimAccess.checked,
                features: {} 
            },
            eposta_taslagi: {
                access: permEmailAccess.checked,
                features: {}
            }
        };
    }

    /**
     * YENİ: Veritabanından gelen JSON objesini UI'daki Checkbox'lara dağıtır.
     */
    function loadPermissionsToUI(perms) {
        const p = perms || {};
        const bayi = p.bayi_yoneticisi || {};
        const denetim = p.denetim_takip || {};
        const email = p.eposta_taslagi || {};

        // Bayi Yöneticisi
        permBayiAccess.checked = !!bayi.access;
        
        // Alt özellikler
        const bayiFeatures = bayi.features || {};
        
        // YENİ: Ayrı ayrı yükle
        permBayiExport.checked = !!bayiFeatures.excel_export;
        permBayiImport.checked = !!bayiFeatures.excel_import;
        
        permBayiAssign.checked = !!bayiFeatures.bulk_assign;
        permBayiCrud.checked = !!bayiFeatures.crud_operations;

        // Denetim Takip
        permDenetimAccess.checked = !!denetim.access;

        // E-posta
        permEmailAccess.checked = !!email.access;
    }

    /**
     * YENİ: Yeni kullanıcı için tüm yetkileri sıfırlar.
     */
    function resetPermissionsUI() {
        permBayiAccess.checked = false;
        
        // YENİ: Ayrı ayrı sıfırla
        permBayiExport.checked = false;
        permBayiImport.checked = false;
        
        permBayiAssign.checked = false;
        permBayiCrud.checked = false;
        permDenetimAccess.checked = true; 
        permEmailAccess.checked = false;
    }

    function setupPermissionUX() {
        const mainChecks = document.querySelectorAll('.perm-main-check');
        mainChecks.forEach(check => {
            check.addEventListener('change', (e) => {
                const targetId = e.target.getAttribute('data-target');
                if (targetId) {
                    const targetDiv = document.getElementById(targetId);
                    if (targetDiv) {
                        const subChecks = targetDiv.querySelectorAll('input[type="checkbox"]');
                        subChecks.forEach(sub => sub.disabled = !e.target.checked);
                        if (!e.target.checked) {
                            targetDiv.style.opacity = '0.5';
                        } else {
                            targetDiv.style.opacity = '1';
                        }
                    }
                }
            });
            check.dispatchEvent(new Event('change'));
        });
    }

    // --- 5. Olay Dinleyicileri (Event Listeners) ---
    
    function setupEventListeners() {
        if (addNewUserBtn) addNewUserBtn.addEventListener('click', handleNew);
        if (cancelUserFormBtn) cancelUserFormBtn.addEventListener('click', showListView);
        if (form) form.addEventListener('submit', handleFormSubmit);
        
        if (toggleBanUserBtn) toggleBanUserBtn.addEventListener('click', handleToggleBanUser);
        
        if (userRoleSelect) userRoleSelect.addEventListener('change', handleRoleChange);

        setupPermissionUX();
    }

    // --- 6. Modülü Başlat ---
    setupEventListeners();
    loadUsers(); 
}