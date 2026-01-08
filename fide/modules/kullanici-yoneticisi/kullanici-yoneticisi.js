/**
 * Kullanıcı Yönetimi Modülü
 * GÜNCELLEME 24.10: Stil senkronizasyonu için başlangıç gecikmesi eklendi.
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
            allUsersCache = await pb.collection('users').getFullList({ sort: 'name' });
            if (listView.style.display !== 'none') { renderUsersTable(allUsersCache); }
        } catch (error) {
            console.error('Hata:', error);
            if (listView.style.display !== 'none') { tableBody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: red;">Yüklenemedi.</td></tr>'; }
        }
    }

    async function loadUserDevices(userId) {
        devicesListLoading.style.display = 'block';
        userDevicesTableWrapper.style.display = 'none';
        try {
            const devices = await pb.collection('user_devices').getFullList({ filter: `user = "${userId}"`, sort: '-last_login' });
            renderUserDevicesTable(devices);
        } catch (error) {
            console.error('Hata:', error);
            userDevicesTableBody.innerHTML = '<tr><td colspan="4">Cihazlar yüklenemedi.</td></tr>';
        } finally {
            devicesListLoading.style.display = 'none';
            userDevicesTableWrapper.style.display = 'block';
        }
    }

    // --- 2. Arayüz (UI) Çizim Fonksiyonları ---
    function renderUsersTable(users) {
        tableBody.innerHTML = '';
        if (users.length === 0) { tableBody.innerHTML = '<tr><td colspan="7">Kayıt bulunamadı.</td></tr>'; return; }
        users.forEach(user => {
            const tr = document.createElement('tr');
            const roleClass = user.role === 'admin' ? 'role-admin' : 'role-client';
            const banStatusClass = user.is_banned ? 'status-banned' : 'status-active';
            tr.innerHTML = `
                <td><strong>${user.name || 'İsimsiz'}</strong></td>
                <td>${user.email}</td>
                <td><span class="role-badge ${roleClass}">${user.role}</span></td>
                <td><span class="status-badge ${banStatusClass}">${user.is_banned ? 'BAN' : 'Aktif'}</span></td>
                <td>${user.mobile_access ? 'Evet' : 'Hayır'}</td>
                <td>${new Date(user.created).toLocaleDateString('tr-TR')}</td>
                <td class="actions-cell">
                    <button class="btn-warning btn-sm btn-edit"><i class="fas fa-edit"></i> Düzenle</button>
                    <button class="btn-danger btn-sm btn-delete"><i class="fas fa-trash"></i> Sil</button>
                </td>
            `;
            tr.querySelector('.btn-edit').addEventListener('click', () => handleEdit(user.id));
            tr.querySelector('.btn-delete').addEventListener('click', () => handleDelete(user.id));
            tableBody.appendChild(tr);
        });
    }

    function renderUserDevicesTable(devices) {
        userDevicesTableBody.innerHTML = '';
        if (devices.length === 0) { userDevicesTableBody.innerHTML = '<tr><td colspan="4">Cihaz yok.</td></tr>'; return; }
        devices.forEach(device => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${device.device_info}</td>
                <td>${new Date(device.last_login).toLocaleString('tr-TR')}</td>
                <td><span class="status-badge ${device.is_locked ? 'status-banned' : 'status-active'}">${device.is_locked ? 'Kilitli' : 'Aktif'}</span></td>
                <td class="actions-cell">
                    <button type="button" class="btn-sm ${device.is_locked ? 'btn-success' : 'btn-warning'} btn-lock-device"><i class="fas ${device.is_locked ? 'fa-lock-open' : 'fa-lock'}"></i></button>
                    <button type="button" class="btn-danger btn-sm btn-delete-device"><i class="fas fa-trash"></i> Sil</button>
                </td>
            `;
            tr.querySelector('.btn-lock-device').addEventListener('click', () => handleToggleLockDevice(device.id, device.is_locked));
            tr.querySelector('.btn-delete-device').addEventListener('click', () => handleDeleteDevice(device.id));
            userDevicesTableBody.appendChild(tr);
        });
    }

    // --- 3. Görünüm Değiştirme ---
    function showFormView() { listView.style.display = 'none'; formView.style.display = 'block'; }
    function showListView() { formView.style.display = 'none'; listView.style.display = 'block'; renderUsersTable(allUsersCache); }

    // --- 4. CRUD Fonksiyonları ---
    function handleNew() {
        form.reset(); userIdInput.value = ''; formTitle.textContent = 'Yeni Kullanıcı Ekle';
        passwordWrapper.style.display = 'block'; userEmailInput.disabled = false;
        userBanSection.style.display = 'none'; devicesHr.style.display = 'none';
        userDeviceLimitSection.style.display = 'block'; userDeviceLimitInput.value = 1;
        showFormView();
    }

    function handleEdit(userId) {
        const user = allUsersCache.find(u => u.id === userId);
        if (!user) return;
        form.reset(); userIdInput.value = user.id; formTitle.textContent = 'Kullanıcıyı Düzenle';
        userNameInput.value = user.name || ''; userEmailInput.value = user.email; userEmailInput.disabled = true;
        userRoleSelect.value = user.role; mobileAccessCheckbox.checked = user.mobile_access;
        passwordWrapper.style.display = 'none'; userBanSection.style.display = 'block';
        updateBanButton(user.is_banned); devicesHr.style.display = 'block';
        if (user.role === 'client') { loadUserDevices(user.id); userDeviceLimitSection.style.display = 'block'; userDeviceLimitInput.value = user.device_limit || 1; }
        else { userDeviceLimitSection.style.display = 'none'; userDevicesTableWrapper.style.display = 'none'; }
        showFormView();
    }

    async function handleDelete(userId) {
        if (!confirm('Emin misiniz?')) return;
        try {
            const devices = await pb.collection('user_devices').getFullList({ filter: `user = "${userId}"` });
            for (const d of devices) { await pb.collection('user_devices').delete(d.id); }
            await pb.collection('users').delete(userId);
            allUsersCache = allUsersCache.filter(u => u.id !== userId);
            renderUsersTable(allUsersCache);
        } catch (e) { alert('Hata oluştu.'); }
    }

    async function handleFormSubmit(event) {
        event.preventDefault();
        saveUserBtn.disabled = true;
        const data = { name: userNameInput.value, email: userEmailInput.value, role: userRoleSelect.value, mobile_access: mobileAccessCheckbox.checked, device_limit: parseInt(userDeviceLimitInput.value) || 1 };
        try {
            if (userIdInput.value) { await pb.collection('users').update(userIdInput.value, data); alert('Kaydedildi.'); }
            else { 
                if (userPasswordInput.value !== userPasswordConfirmInput.value) throw new Error('Parolalar uyuşmuyor.');
                data.password = userPasswordInput.value; data.passwordConfirm = userPasswordConfirmInput.value;
                await pb.collection('users').create(data); showListView();
            }
            await loadUsers();
        } catch (e) { alert(e.message); } finally { saveUserBtn.disabled = false; }
    }

    async function handleToggleBanUser() {
        const user = allUsersCache.find(u => u.id === userIdInput.value);
        if (!confirm('BAN durumu değişecek, emin misiniz?')) return;
        try {
            const newStatus = !user.is_banned;
            await pb.collection('users').update(user.id, { is_banned: newStatus });
            user.is_banned = newStatus;
            updateBanButton(newStatus);
        } catch (e) { alert('Hata.'); }
    }

    function updateBanButton(isBanned) {
        toggleBanUserBtn.innerHTML = isBanned ? '<i class="fas fa-lock-open"></i> Kilidi Aç' : '<i class="fas fa-ban"></i> Hesabı Kilitle (BAN)';
        toggleBanUserBtn.className = isBanned ? 'btn-success ky-danger-btn' : 'btn-danger ky-danger-btn';
    }

    async function handleDeleteDevice(id) { if (confirm('Silinsin mi?')) { await pb.collection('user_devices').delete(id); loadUserDevices(userIdInput.value); } }
    async function handleToggleLockDevice(id, status) { await pb.collection('user_devices').update(id, { is_locked: !status }); loadUserDevices(userIdInput.value); }

    // --- 5. Başlatma ---
    addNewUserBtn.addEventListener('click', handleNew);
    cancelUserFormBtn.addEventListener('click', showListView);
    form.addEventListener('submit', handleFormSubmit);
    toggleBanUserBtn.addEventListener('click', handleToggleBanUser);
    userRoleSelect.addEventListener('change', () => { userDeviceLimitSection.style.display = userRoleSelect.value === 'client' ? 'block' : 'none'; });

    // --- GÜNCELLEME: STİL GECİKMESİ ---
    setTimeout(() => { loadUsers(); }, 50);
}