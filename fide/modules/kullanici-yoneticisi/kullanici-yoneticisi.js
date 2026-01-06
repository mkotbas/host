export function initializeKullaniciYoneticisiModule(pbInstance) {

    // --- Global Değişkenler ve DOM Elementleri ---
    const pb = pbInstance;
    let allUsersCache = [];

    // Ana Görünümler
    const listView = document.getElementById('user-list-view');
    const formView = document.getElementById('user-form-view');

    // Liste Elemanları (Ana Ekran)
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
    
    // Güvenlik Dashboard Elemanları
    const securityDashboardWrapper = document.getElementById('security-dashboard-wrapper');
    const banCardContainer = document.getElementById('ban-card-container');
    const banStatusIconWrapper = document.getElementById('ban-status-icon-wrapper');
    const banStatusIcon = document.getElementById('ban-status-icon');
    const banStatusText = document.getElementById('ban-status-text');
    const toggleBanUserBtn = document.getElementById('toggle-ban-user-btn');
    
    const mobileAccessCard = document.getElementById('mobile-access-card');
    const mobileAccessCheckbox = document.getElementById('user-mobile-access-checkbox');

    const deviceLimitCard = document.getElementById('device-limit-card');
    const userDeviceLimitInput = document.getElementById('user-device-limit-input');

    const devicesSectionWrapper = document.getElementById('devices-section-wrapper');
    const devicesListLoading = document.getElementById('devices-list-loading');
    const deviceListContainer = document.getElementById('device-list-container');
    const noDevicesText = document.getElementById('no-devices-text');
    const deviceCountBadge = document.getElementById('device-count-badge');

    // Butonlar
    const addNewUserBtn = document.getElementById('add-new-user-btn');
    const saveUserBtn = document.getElementById('save-user-btn');
    const cancelUserFormBtn = document.getElementById('cancel-user-form-btn');
    const topCancelBtn = document.getElementById('top-cancel-btn');

    // --- RBAC (Yetki) Tanımları ---
    const RBAC_MODULE_DEFS = [
        { id: 'denetim-takip', label: 'Denetim Takip' },
        { id: 'bayi-yoneticisi', label: 'Bayi Yöneticisi' },
        { id: 'eposta-taslagi', label: 'E-posta Taslağı' },
        { id: 'soru-yoneticisi', label: 'Soru Yöneticisi' },
        { id: 'veritabani-yonetim', label: 'Veritabanı Yönetimi' },
        { id: 'kullanici-yoneticisi', label: 'Kullanıcı Yönetimi' }
    ];

    const RBAC_FEATURE_DEFS = [
        { key: 'bayi-yoneticisi.export_excel', label: 'Bayi Yöneticisi: Excel Dışa Aktar (İndir)' },
        { key: 'bayi-yoneticisi.import_excel', label: 'Bayi Yöneticisi: Excel İçe Aktar (Yükle)' },
        { key: 'bayi-yoneticisi.bulk_assign', label: 'Bayi Yöneticisi: Toplu Atama' },
        { key: 'bayi-yoneticisi.crud', label: 'Bayi Yöneticisi: CRUD (Ekle/Sil/Düzenle)' }
    ];

    let rbacSectionEl = null;

    function normalizePermissions(p) {
        const perms = (p && typeof p === 'object') ? JSON.parse(JSON.stringify(p)) : {};
        if (!perms.modules || typeof perms.modules !== 'object') perms.modules = {};
        if (!perms.features || typeof perms.features !== 'object') perms.features = {};
        if (perms.modules['denetim-takip'] !== true) perms.modules['denetim-takip'] = true;
        return perms;
    }

    // --- RBAC UI Oluşturucu (GÜNCELLENDİ: Stil Garantisi) ---
    function buildRbacUIOnce() {
        if (rbacSectionEl) return;
        
        rbacSectionEl = document.createElement('div');
        rbacSectionEl.id = 'user-permissions-section';
        
        // Inline stiller ile CSS yüklenmese bile düzgün görünüm sağla
        rbacSectionEl.className = 'modern-card'; 
        rbacSectionEl.style.backgroundColor = '#ffffff';
        rbacSectionEl.style.border = '1px solid #e5e7eb';
        rbacSectionEl.style.borderRadius = '12px';
        rbacSectionEl.style.padding = '25px';
        rbacSectionEl.style.marginTop = '20px';
        rbacSectionEl.style.marginBottom = '20px';
        rbacSectionEl.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        
        rbacSectionEl.innerHTML = `
            <h4 class="section-divider" style="margin-top:0; border-bottom:1px solid #f3f4f6; padding-bottom:10px; margin-bottom:15px;">
                <span style="background:#fff; color:#374151; padding:0 10px; font-weight:600;">
                    <i class="fas fa-key"></i> Modül & Yetkiler
                </span>
            </h4>
            <p style="margin:0 0 20px 0; color:#4b5563; font-size:0.9em; line-height:1.5;">
                Kullanıcının erişebileceği modülleri ve özel yetkilerini buradan yönetebilirsiniz.
            </p>

            <div id="rbac-modules-box" style="margin-bottom: 25px;">
                <h5 style="margin: 0 0 12px 0; font-size:0.95em; color:#111827; font-weight:700; text-transform:uppercase;">
                    <i class="fas fa-cubes"></i> Modül Erişimi
                </h5>
                <div class="rbac-grid"></div>
            </div>

            <div id="rbac-features-box">
                <h5 style="margin: 0 0 12px 0; font-size:0.95em; color:#111827; font-weight:700; text-transform:uppercase;">
                    <i class="fas fa-tools"></i> Modül İçi Özellikler
                </h5>
                <div class="rbac-grid"></div>
            </div>
        `;

        if (formView) {
            const formActions = form.querySelector('.form-actions');
            if (formActions) {
                form.insertBefore(rbacSectionEl, formActions);
            } else {
                form.appendChild(rbacSectionEl);
            }
        }

        const modulesGrid = rbacSectionEl.querySelector('#rbac-modules-box .rbac-grid');
        const featuresGrid = rbacSectionEl.querySelector('#rbac-features-box .rbac-grid');

        const gridStyle = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px;';
        modulesGrid.style.cssText = gridStyle;
        featuresGrid.style.cssText = gridStyle;

        const labelStyle = 'display: flex; align-items: center; gap: 10px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 10px 15px; cursor: pointer; user-select: none; transition: all 0.2s;';

        RBAC_MODULE_DEFS.forEach(m => {
            const wrap = document.createElement('label');
            wrap.style.cssText = labelStyle;
            
            wrap.innerHTML = `
                <input type="checkbox" class="rbac-module-checkbox" data-module-id="${m.id}" style="transform: scale(1.2); cursor: pointer;">
                <span style="font-size:0.9em; color:#374151; font-weight:500;">${m.label}</span>
            `;
            
            wrap.onmouseenter = () => { wrap.style.borderColor = '#93c5fd'; wrap.style.backgroundColor = '#fff'; };
            wrap.onmouseleave = () => { wrap.style.borderColor = '#e5e7eb'; wrap.style.backgroundColor = '#f9fafb'; };

            modulesGrid.appendChild(wrap);
        });

        RBAC_FEATURE_DEFS.forEach(f => {
            const wrap = document.createElement('label');
            wrap.style.cssText = labelStyle;
            
            wrap.innerHTML = `
                <input type="checkbox" class="rbac-feature-checkbox" data-feature-key="${f.key}" style="transform: scale(1.2); cursor: pointer;">
                <span style="font-size:0.9em; color:#374151; font-weight:500;">${f.label}</span>
            `;

            wrap.onmouseenter = () => { wrap.style.borderColor = '#93c5fd'; wrap.style.backgroundColor = '#fff'; };
            wrap.onmouseleave = () => { wrap.style.borderColor = '#e5e7eb'; wrap.style.backgroundColor = '#f9fafb'; };

            featuresGrid.appendChild(wrap);
        });

        rbacSectionEl.addEventListener('change', (e) => {
            const t = e.target;
            if (!(t instanceof HTMLInputElement)) return;
            if (t.classList.contains('rbac-module-checkbox') && t.dataset.moduleId === 'bayi-yoneticisi') {
                const featureCbs = rbacSectionEl.querySelectorAll('.rbac-feature-checkbox');
                featureCbs.forEach(cb => {
                    cb.disabled = !t.checked;
                    if (!t.checked) {
                        cb.checked = false;
                        cb.parentElement.style.opacity = '0.5';
                        cb.parentElement.style.cursor = 'not-allowed';
                    } else {
                        cb.parentElement.style.opacity = '1';
                        cb.parentElement.style.cursor = 'pointer';
                    }
                });
            }
        });
    }

    function setRbacUIVisible(isVisible) {
        buildRbacUIOnce();
        if (!rbacSectionEl) return;
        rbacSectionEl.style.display = isVisible ? 'block' : 'none';
    }

    function setPermissionsToUI(perms) {
        buildRbacUIOnce();
        const p = normalizePermissions(perms);

        rbacSectionEl.querySelectorAll('.rbac-module-checkbox').forEach(cb => {
            const id = cb.dataset.moduleId;
            cb.checked = p.modules[id] === true;
            if (id === 'denetim-takip') {
                cb.checked = true;
                cb.disabled = true;
            } else {
                cb.disabled = false;
            }
        });

        rbacSectionEl.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
            const key = cb.dataset.featureKey;
            cb.checked = p.features[key] === true;
        });

        const bayiModule = rbacSectionEl.querySelector('.rbac-module-checkbox[data-module-id="bayi-yoneticisi"]');
        const isBayiEnabled = bayiModule ? bayiModule.checked : false;
        rbacSectionEl.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
            cb.disabled = !isBayiEnabled;
            if(!isBayiEnabled) {
                cb.parentElement.style.opacity = '0.5';
                cb.parentElement.style.cursor = 'not-allowed';
            } else {
                cb.parentElement.style.opacity = '1';
                cb.parentElement.style.cursor = 'pointer';
            }
            if (!isBayiEnabled) cb.checked = false;
        });
    }

    function readPermissionsFromUI() {
        buildRbacUIOnce();
        const perms = normalizePermissions({});
        perms.modules = {};
        perms.features = {};

        rbacSectionEl.querySelectorAll('.rbac-module-checkbox').forEach(cb => {
            const id = cb.dataset.moduleId;
            perms.modules[id] = cb.checked === true;
        });
        perms.modules['denetim-takip'] = true;

        rbacSectionEl.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
            const key = cb.dataset.featureKey;
            perms.features[key] = cb.checked === true;
        });

        if (perms.modules['bayi-yoneticisi'] !== true) {
            Object.keys(perms.features).forEach(k => {
                if (k.startsWith('bayi-yoneticisi.')) perms.features[k] = false;
            });
        }
        return perms;
    }

    async function loadUsers() {
        if (!tableBody) return;

        // 1. Yükleniyor Göstergesi
        tableBody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding: 20px; color:#666;">
                    <i class="fas fa-spinner fa-spin"></i> Kullanıcı listesi yükleniyor...
                </td>
            </tr>
        `;

        try {
            allUsersCache = await pb.collection('users').getFullList({ sort: '-created' });
            renderUserTable(allUsersCache);
        } catch (error) {
            console.error("Kullanıcılar yüklenemedi:", error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding: 20px; color:red;">
                        <i class="fas fa-exclamation-triangle"></i> Yükleme Hatası: ${error.message}
                    </td>
                </tr>
            `;
        }
    }

    function renderUserTable(users) {
        if (!tableBody) return;
        tableBody.innerHTML = '';

        if (!users || users.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" style="text-align:center; padding: 20px; color:#999;">
                        Sistemde kayıtlı kullanıcı bulunamadı.
                    </td>
                </tr>
            `;
            return;
        }

        users.forEach(user => {
            const tr = document.createElement('tr');
            const userName = user.name || 'İsimsiz';
            const userEmail = user.email || '-';
            const roleText = user.role === 'admin' ? 'Yönetici' : 'Standart Kullanıcı';
            const roleClass = user.role === 'admin' ? 'role-admin' : 'role-client';
            const banStatusText = user.is_banned ? 'Kilitli' : 'Aktif';
            const banStatusClass = user.is_banned ? 'status-banned' : 'status-active';
            const mobileAccessText = user.mobile_access ? 'Evet' : 'Hayır';
            
            let createdDate = '-';
            try {
                createdDate = new Date(user.created).toLocaleString('tr-TR', {
                    day: '2-digit', month: '2-digit', year: 'numeric'
                });
            } catch(e) {}

            tr.innerHTML = `
                <td data-label="İsim"><strong>${userName}</strong></td>
                <td data-label="E-posta">${userEmail}</td>
                <td data-label="Rol"><span class="role-badge ${roleClass}">${roleText}</span></td>
                <td data-label="Durum"><span class="status-badge ${banStatusClass}">${banStatusText}</span></td>
                <td data-label="Mobil Erişim">${mobileAccessText}</td>
                <td data-label="Oluşturulma Tarihi">${createdDate}</td>
                <td class="actions-cell">
                    <button class="btn-warning btn-sm btn-edit" title="Düzenle"><i class="fas fa-edit"></i></button>
                    <button class="btn-danger btn-sm btn-delete" title="Sil"><i class="fas fa-trash"></i></button>
                </td>
            `;

            tr.querySelector('.btn-edit').addEventListener('click', () => handleEdit(user.id));
            tr.querySelector('.btn-delete').addEventListener('click', () => handleDelete(user.id));
            tableBody.appendChild(tr);
        });
    }

    // --- Cihaz Yönetimi ---
    function renderDevicesList(devices) {
        deviceListContainer.innerHTML = '';
        const count = devices ? devices.length : 0;
        
        if (deviceCountBadge) deviceCountBadge.textContent = `${count} Cihaz`;

        if (!devices || devices.length === 0) {
            noDevicesText.style.display = 'block';
            return;
        }

        noDevicesText.style.display = 'none';

        devices.forEach(device => {
            const div = document.createElement('div');
            div.className = `device-item ${device.is_locked ? 'locked' : ''}`;
            
            div.style.display = "flex";
            div.style.justifyContent = "space-between";
            div.style.alignItems = "center";
            div.style.padding = "10px";
            div.style.borderBottom = "1px solid #eee";

            const deviceInfo = (device.device_info && String(device.device_info).trim() !== '')
                ? device.device_info
                : 'Bilinmeyen Cihaz';

            const lastLoginSource = device.last_login || device.lastLogin || device.created;
            const lastLoginText = lastLoginSource
                ? new Date(lastLoginSource).toLocaleString('tr-TR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })
                : '-';

            const lockIcon = device.is_locked ? 'fa-lock' : 'fa-lock-open';
            const lockTitle = device.is_locked ? 'Kilidi Aç' : 'Kilitle';
            const isMobile = deviceInfo.toLowerCase().includes('mobile') || deviceInfo.toLowerCase().includes('android');
            const deviceIconClass = isMobile ? 'fa-mobile-alt' : 'fa-desktop';

            div.innerHTML = `
                <div class="device-info-left" style="display:flex; align-items:center; gap:10px;">
                    <div class="device-icon"><i class="fas ${deviceIconClass}"></i></div>
                    <div class="device-text">
                        <div class="device-name" style="font-weight:bold; color:#333;">${deviceInfo}</div>
                        <div class="device-meta" style="font-size:0.8em; color:#888;">Son Giriş: ${lastLoginText}</div>
                    </div>
                </div>
                <div class="device-actions" style="display:flex; gap:5px;">
                     <button type="button" class="btn-icon-action lock ${device.is_locked ? 'locked-active' : ''}" title="${lockTitle}" style="padding:5px 10px;">
                        <i class="fas ${lockIcon}"></i>
                    </button>
                    <button type="button" class="btn-icon-action delete" title="Cihazı Sil" style="padding:5px 10px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;

            div.querySelector('.delete').addEventListener('click', () => handleDeleteDevice(device.id));
            div.querySelector('.lock').addEventListener('click', () => handleToggleLockDevice(device.id, device.is_locked));

            deviceListContainer.appendChild(div);
        });
    }

    async function loadUserDevices(userId) {
        try {
            devicesListLoading.style.display = 'block';
            deviceListContainer.style.display = 'none';
            noDevicesText.style.display = 'none';

            const devices = await pb.collection('user_devices').getFullList({
                filter: `user="${userId}"`,
                sort: '-created'
            });

            renderDevicesList(devices);

            devicesListLoading.style.display = 'none';
            deviceListContainer.style.display = 'block';
        } catch (error) {
            devicesListLoading.style.display = 'none';
        }
    }

    function showListView() {
        listView.style.display = 'block';
        formView.style.display = 'none';
    }

    function showFormView() {
        listView.style.display = 'none';
        formView.style.display = 'block';
    }

    function handleNew() {
        form.reset();
        userIdInput.value = '';
        formTitle.textContent = 'Yeni Kullanıcı Ekle';

        userEmailInput.disabled = false;
        passwordWrapper.style.display = 'flex';
        userPasswordInput.required = true;
        userPasswordConfirmInput.required = true;

        userRoleSelect.value = 'client';
        mobileAccessCheckbox.checked = false;

        securityDashboardWrapper.style.display = 'none';

        setRbacUIVisible(true);
        setPermissionsToUI({ modules: { 'denetim-takip': true }, features: {} });

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
        
        passwordWrapper.style.display = 'flex';
        userPasswordInput.required = false;
        userPasswordConfirmInput.required = false;

        securityDashboardWrapper.style.display = 'block';

        updateBanUI(user.is_banned || false);
        mobileAccessCheckbox.checked = user.mobile_access;
        userDeviceLimitInput.value = user.device_limit || 1;

        if (user.role === 'admin') {
            mobileAccessCard.style.display = 'none';
            deviceLimitCard.style.display = 'none';
            devicesSectionWrapper.style.display = 'none';
            setRbacUIVisible(false);
        } else {
            mobileAccessCard.style.display = 'flex';
            deviceLimitCard.style.display = 'flex';
            if (userIdInput.value) {
                devicesSectionWrapper.style.display = 'block';
            }
            setRbacUIVisible(true);
            setPermissionsToUI(user.permissions || {});
            loadUserDevices(user.id);
        }

        showFormView();
    }

    async function handleDelete(userId) {
        if (!confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?')) return;
        try {
            await pb.collection('users').delete(userId);
            await loadUsers();
        } catch (error) {
            alert('Hata: Kullanıcı silinemedi.');
        }
    }

    function updateBanUI(isBanned) {
        if (!banStatusIconWrapper || !banStatusText || !toggleBanUserBtn) return;
        if (isBanned) {
            banStatusIconWrapper.className = 'card-icon-wrapper banned';
            banStatusIcon.className = 'fas fa-ban';
            banStatusText.textContent = 'Kilitli (Ban)';
            banStatusText.className = 'status-text banned';
            toggleBanUserBtn.textContent = 'Kilidi Aç';
            toggleBanUserBtn.className = 'btn-outline-success btn-sm';
        } else {
            banStatusIconWrapper.className = 'card-icon-wrapper active';
            banStatusIcon.className = 'fas fa-check-circle';
            banStatusText.textContent = 'Aktif';
            banStatusText.className = 'status-text active';
            toggleBanUserBtn.textContent = 'Kilitle';
            toggleBanUserBtn.className = 'btn-outline-danger btn-sm';
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
            data.permissions = readPermissionsFromUI();
        }

        try {
            if (userId) {
                if (userPasswordInput.value) {
                     if (userPasswordInput.value !== userPasswordConfirmInput.value) {
                        throw new Error('Parolalar eşleşmiyor.');
                     }
                     data.password = userPasswordInput.value;
                     data.passwordConfirm = userPasswordConfirmInput.value;
                }
                await pb.collection('users').update(userId, data);
                await loadUsers();
                alert('Değişiklikler kaydedildi.');
            } else {
                if (!userPasswordInput.value || !userPasswordConfirmInput.value) {
                    throw new Error('Parola zorunludur.');
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
            alert('Hata: ' + (error.message || 'İşlem başarısız.'));
        } finally {
            saveUserBtn.disabled = false;
            saveUserBtn.textContent = 'Değişiklikleri Kaydet';
        }
    }

    async function handleToggleBanUser() {
        const userId = userIdInput.value;
        if (!userId) return;
        const user = allUsersCache.find(u => u.id === userId);
        if (!user) return;
        const currentBanStatus = user.is_banned || false;
        const newBanStatus = !currentBanStatus;
        if (!confirm(`Bu hesabı ${newBanStatus ? 'kilitlemek' : 'açmak'} istediğinizden emin misiniz?`)) return;
        try {
            await pb.collection('users').update(userId, { is_banned: newBanStatus });
            await loadUsers();
            const updatedUser = allUsersCache.find(u => u.id === userId);
            updateBanUI(updatedUser.is_banned);
        } catch (error) {
            alert('Durum güncellenemedi.');
        }
    }

    async function handleDeleteDevice(deviceId) {
        if (!confirm('Bu cihazı silmek istediğinizden emin misiniz?')) return;
        try {
            await pb.collection('user_devices').delete(deviceId);
            loadUserDevices(userIdInput.value);
        } catch (error) {
            alert('Cihaz silinemedi.');
        }
    }

    async function handleToggleLockDevice(deviceId, currentLockStatus) {
        const newLockStatus = !currentLockStatus;
        try {
            await pb.collection('user_devices').update(deviceId, { 'is_locked': newLockStatus });
            loadUserDevices(userIdInput.value);
        } catch (error) {
            alert('Cihaz durumu güncellenemedi.');
        }
    }

    function handleRoleChange() {
        const isAdmin = userRoleSelect.value === 'admin';
        if (isAdmin) {
            mobileAccessCard.style.display = 'none';
            deviceLimitCard.style.display = 'none';
            devicesSectionWrapper.style.display = 'none';
            setRbacUIVisible(false);
        } else {
            mobileAccessCard.style.display = 'flex';
            deviceLimitCard.style.display = 'flex';
            if (userIdInput.value) devicesSectionWrapper.style.display = 'block';
            setRbacUIVisible(true);
        }
    }

    function setupEventListeners() {
        if (addNewUserBtn) addNewUserBtn.addEventListener('click', handleNew);
        if (cancelUserFormBtn) cancelUserFormBtn.addEventListener('click', showListView);
        if (topCancelBtn) topCancelBtn.addEventListener('click', showListView);
        if (form) form.addEventListener('submit', handleFormSubmit);
        if (toggleBanUserBtn) toggleBanUserBtn.addEventListener('click', handleToggleBanUser);
        if (userRoleSelect) userRoleSelect.addEventListener('change', handleRoleChange);
    }

    setupEventListeners();
    buildRbacUIOnce(); 
    loadUsers();
}