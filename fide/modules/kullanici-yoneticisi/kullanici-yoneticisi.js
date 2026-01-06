/* =======================================================================
   KULLANICI YÖNETİCİSİ MODÜLÜ
   ======================================================================= */

export function initializeKullaniciYoneticisiModule(pb) {
    // --- DOM Elemanları ---
    const usersTableBody = document.getElementById('users-table-body');

    // Form Elemanları
    const form = document.getElementById('user-form');
    const userFormView = document.getElementById('user-form-view');
    const userListView = document.getElementById('user-list-view');
    const formTitle = document.getElementById('user-form-title');
    const userIdInput = document.getElementById('user-id');
    const nameInput = document.getElementById('user-name');
    const emailInput = document.getElementById('user-email');
    const roleSelect = document.getElementById('user-role');
    const passwordInput = document.getElementById('user-password');
    const deviceLimitInput = document.getElementById('user-device-limit');
    const mobileAccessCheckbox = document.getElementById('user-mobile-access');
    const isBannedCheckbox = document.getElementById('user-is-banned');

    // Butonlar
    const addUserBtn = document.getElementById('add-user-btn');
    const saveUserBtn = document.getElementById('save-user-btn');
    const cancelUserFormBtn = document.getElementById('cancel-user-form-btn');

    // Cihaz Tablosu
    const devicesTableBody = document.getElementById('user-devices-table-body');
    const devicesTableWrapper = document.getElementById('user-devices-table-wrapper');

    // --- RBAC (Yetki) Tanımları ---
    // Modül ID'leri admin.js içindeki modules[] ile birebir aynı olmalı.
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

    // RBAC UI elemanı (lazy init)
    let rbacSectionEl = null;

    function normalizePermissions(p) {
        const perms = (p && typeof p === 'object') ? JSON.parse(JSON.stringify(p)) : {};
        if (!perms.modules || typeof perms.modules !== 'object') perms.modules = {};
        if (!perms.features || typeof perms.features !== 'object') perms.features = {};

        // güvenli varsayılan: denetim-takip erişimi açık (client için)
        if (perms.modules['denetim-takip'] !== true) perms.modules['denetim-takip'] = true;

        return perms;
    }

    function buildRbacUIOnce() {
        if (rbacSectionEl) return;

        // Form görünümüne RBAC bölümü ekle (HTML dosyasında yoksa JS ile üret)
        rbacSectionEl = document.createElement('div');
        rbacSectionEl.id = 'user-permissions-section';
        rbacSectionEl.className = 'form-section rbac-section';

        rbacSectionEl.innerHTML = `
            <div class="rbac">
                <div class="rbac-header">
                    <div>
                        <h3 class="rbac-title">Modül &amp; Özellik Yetkileri</h3>
                        <p class="rbac-subtitle">
                            Standart Kullanıcılar (client) için modül erişimi ve modül içi kritik özellik izinleri.
                            Yetkisi olmayan öğeler ilgili kullanıcıda menüde görünmez ve sayfaya erişemez.
                        </p>
                    </div>
                </div>

                <div class="rbac-panels">
                    <div class="rbac-panel">
                        <div class="rbac-panel-title">Modül Erişimi</div>
                        <div class="rbac-module-list" id="rbac-modules-list"></div>
                    </div>

                    <div class="rbac-panel">
                        <div class="rbac-panel-title">Modül İçi Özellik Yetkileri</div>
                        <div class="rbac-feature-groups" id="rbac-feature-groups"></div>
                        <div class="rbac-empty" id="rbac-feature-empty" style="display:none;">
                            Özellik yetkisi bulunan bir modül seçildiğinde burada görünecek.
                        </div>
                    </div>
                </div>
            </div>
        `;

        // RBAC bölümünü form içine yerleştir (kullanıcı formunun sonlarına)
        userFormView.appendChild(rbacSectionEl);

        const modulesListEl = rbacSectionEl.querySelector('#rbac-modules-list');
        const featureGroupsEl = rbacSectionEl.querySelector('#rbac-feature-groups');
        const featureEmptyEl = rbacSectionEl.querySelector('#rbac-feature-empty');

        // Modül kartları (kompakt toggle)
        RBAC_MODULE_DEFS.forEach(m => {
            const item = document.createElement('label');
            item.className = 'rbac-module-item';

            item.innerHTML = `
                <div class="rbac-module-meta">
                    <div class="rbac-module-name">${m.label}</div>
                    <div class="rbac-module-hint">${m.id}</div>
                </div>

                <div class="rbac-module-control">
                    <input type="checkbox" class="rbac-module-checkbox" data-module-id="${m.id}" aria-label="${m.label}">
                    <span class="rbac-switch" aria-hidden="true"></span>
                </div>
            `;

            modulesListEl.appendChild(item);
        });

        // Özellik grupları (modül -> özellikler)
        const featuresByModule = {};
        RBAC_FEATURE_DEFS.forEach(f => {
            const moduleId = String(f.key || '').split('.')[0];
            if (!featuresByModule[moduleId]) featuresByModule[moduleId] = [];
            featuresByModule[moduleId].push(f);
        });

        Object.keys(featuresByModule).forEach(moduleId => {
            const moduleDef = RBAC_MODULE_DEFS.find(m => m.id === moduleId);
            const title = moduleDef ? moduleDef.label : moduleId;

            const group = document.createElement('div');
            group.className = 'rbac-feature-group';
            group.dataset.moduleId = moduleId;

            const featureItems = featuresByModule[moduleId]
                .map(f => {
                    const compactLabel = String(f.label || '').includes(': ')
                        ? String(f.label || '').split(': ').slice(1).join(': ')
                        : String(f.label || '');

                    return `
                        <label class="rbac-feature-item">
                            <input type="checkbox" class="rbac-feature-checkbox" data-feature-key="${f.key}">
                            <span class="rbac-feature-label">${compactLabel}</span>
                        </label>
                    `;
                })
                .join('');

            group.innerHTML = `
                <div class="rbac-feature-group-header">
                    <span class="rbac-feature-group-title">${title}</span>
                    <span class="rbac-feature-group-badge">özellik</span>
                </div>
                <div class="rbac-feature-list">
                    ${featureItems}
                </div>
            `;

            featureGroupsEl.appendChild(group);
        });

        function syncRbacDependencies() {
            // denetim-takip her zaman açık + kilitli
            const denetimCb = rbacSectionEl.querySelector('.rbac-module-checkbox[data-module-id="denetim-takip"]');
            if (denetimCb) {
                denetimCb.checked = true;
                denetimCb.disabled = true;
                denetimCb.closest('.rbac-module-item')?.classList.add('is-locked');
            }

            let anyVisibleGroup = false;

            rbacSectionEl.querySelectorAll('.rbac-feature-group').forEach(group => {
                const moduleId = group.dataset.moduleId;
                const moduleCb = rbacSectionEl.querySelector(`.rbac-module-checkbox[data-module-id="${moduleId}"]`);
                const enabled = moduleCb ? moduleCb.checked === true : false;

                group.style.display = enabled ? 'block' : 'none';
                group.classList.toggle('is-disabled', !enabled);

                group.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
                    cb.disabled = !enabled;
                    if (!enabled) cb.checked = false;
                });

                if (enabled) anyVisibleGroup = true;
            });

            // Eğer hiç görünür özellik grubu yoksa “empty state” göster
            if (featureEmptyEl) featureEmptyEl.style.display = anyVisibleGroup ? 'none' : 'block';
        }

        // İlk render sonrası bağımlılıkları uygula
        syncRbacDependencies();

        // Modül toggles / feature dependencies
        rbacSectionEl.addEventListener('change', (e) => {
            const t = e.target;
            if (!(t instanceof HTMLInputElement)) return;

            if (t.classList.contains('rbac-module-checkbox')) {
                // Modül kapandıysa ilgili tüm feature'ları temizle
                const moduleId = t.dataset.moduleId;
                if (moduleId && t.checked !== true) {
                    rbacSectionEl.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
                        const key = cb.dataset.featureKey || '';
                        if (key.startsWith(moduleId + '.')) cb.checked = false;
                    });
                }
                syncRbacDependencies();
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
            // denetim-takip her zaman açık
            if (id === 'denetim-takip') {
                cb.checked = true;
                cb.disabled = true;
                cb.closest('.rbac-module-item')?.classList.add('is-locked');
            } else {
                cb.disabled = false;
                cb.closest('.rbac-module-item')?.classList.remove('is-locked');
            }
        });

        rbacSectionEl.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
            const key = cb.dataset.featureKey;
            cb.checked = p.features[key] === true;
        });

        // Modül kapalıysa ilgili feature'ları temizle + disable et (genel kural)
        const modulesState = {};
        rbacSectionEl.querySelectorAll('.rbac-module-checkbox').forEach(cb => {
            modulesState[cb.dataset.moduleId] = cb.checked === true;
        });
        modulesState['denetim-takip'] = true;

        rbacSectionEl.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
            const key = cb.dataset.featureKey || '';
            const moduleId = key.split('.')[0];

            const enabled = modulesState[moduleId] === true;
            cb.disabled = !enabled;
            if (!enabled) cb.checked = false;
        });

        // Feature gruplarını görünürlük/empty state ile senkronla
        const featureEmptyEl = rbacSectionEl.querySelector('#rbac-feature-empty');
        let anyVisibleGroup = false;

        rbacSectionEl.querySelectorAll('.rbac-feature-group').forEach(group => {
            const moduleId = group.dataset.moduleId;
            const enabled = modulesState[moduleId] === true;

            group.style.display = enabled ? 'block' : 'none';
            group.classList.toggle('is-disabled', !enabled);

            if (enabled) anyVisibleGroup = true;
        });

        if (featureEmptyEl) featureEmptyEl.style.display = anyVisibleGroup ? 'none' : 'block';
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

        // denetim-takip her zaman açık
        perms.modules['denetim-takip'] = true;

        rbacSectionEl.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
            const key = cb.dataset.featureKey;
            perms.features[key] = cb.checked === true;
        });

        // Modül kapalıysa ilgili alt özellikleri sıfırla (genel kural)
        Object.keys(perms.features).forEach(k => {
            const moduleId = k.split('.')[0];
            if (perms.modules[moduleId] !== true) perms.features[k] = false;
        });

        return perms;
    }

    // --- Yardımcılar / Görünüm Yönetimi ---
    function showListView() {
        userListView.style.display = 'block';
        userFormView.style.display = 'none';
    }

    function showFormView() {
        userListView.style.display = 'none';
        userFormView.style.display = 'block';
    }

    function clearForm() {
        userIdInput.value = '';
        nameInput.value = '';
        emailInput.value = '';
        roleSelect.value = 'client';
        passwordInput.value = '';
        deviceLimitInput.value = '3';
        mobileAccessCheckbox.checked = false;
        isBannedCheckbox.checked = false;

        // RBAC görünümü varsayılan: client formunda göster
        setRbacUIVisible(true);

        // RBAC alanını sıfırla
        setPermissionsToUI({ modules: { 'denetim-takip': true }, features: {} });

        // Cihazlar tablosunu temizle
        devicesTableBody.innerHTML = '';
        devicesTableWrapper.style.display = 'none';
    }

    function fillForm(user) {
        userIdInput.value = user.id;
        nameInput.value = user.name || '';
        emailInput.value = user.email || '';
        roleSelect.value = user.role || 'client';

        // password boş bırakılır (değiştirilmek istenirse girilir)
        passwordInput.value = '';

        // client özel alanlar
        deviceLimitInput.value = (typeof user.device_limit === 'number') ? String(user.device_limit) : '3';
        mobileAccessCheckbox.checked = user.mobile_access === true;

        isBannedCheckbox.checked = user.is_banned === true;

        // RBAC sadece client için anlamlı; admin için gizle
        const isClient = (roleSelect.value === 'client');
        setRbacUIVisible(isClient);

        // Yetkileri yükle
        if (isClient) {
            setPermissionsToUI(user.permissions || {});
        }
    }

    async function renderUsersTable() {
        usersTableBody.innerHTML = `<tr><td colspan="6">Yükleniyor...</td></tr>`;

        let users = [];
        try {
            users = await pb.collection('users').getFullList({
                sort: '-created'
            });
        } catch (err) {
            console.error('Users load error:', err);
            usersTableBody.innerHTML = `<tr><td colspan="6">Kullanıcılar yüklenemedi.</td></tr>`;
            return;
        }

        if (!users || users.length === 0) {
            usersTableBody.innerHTML = `<tr><td colspan="6">Kayıt bulunamadı.</td></tr>`;
            return;
        }

        usersTableBody.innerHTML = '';
        users.forEach(u => {
            const tr = document.createElement('tr');

            tr.innerHTML = `
                <td>${u.name || ''}</td>
                <td>${u.email || ''}</td>
                <td>${u.role || ''}</td>
                <td>${u.is_banned ? '<span class="badge badge-danger">Kilitli</span>' : '<span class="badge badge-success">Açık</span>'}</td>
                <td>${u.mobile_access ? '<span class="badge badge-success">Var</span>' : '<span class="badge badge-gray">Yok</span>'}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-secondary" data-action="edit" data-id="${u.id}">Düzenle</button>
                    <button class="btn btn-sm btn-danger" data-action="delete" data-id="${u.id}">Sil</button>
                </td>
            `;

            usersTableBody.appendChild(tr);
        });
    }

    async function loadUserDevices(userId) {
        devicesTableBody.innerHTML = '';
        devicesTableWrapper.style.display = 'none';

        if (!userId) return;

        let devices = [];
        try {
            devices = await pb.collection('user_devices').getFullList({
                filter: `user="${userId}"`,
                sort: '-last_login'
            });
        } catch (err) {
            console.error('Devices load error:', err);
            return;
        }

        if (!devices || devices.length === 0) {
            return;
        }

        devicesTableWrapper.style.display = 'block';
        devicesTableBody.innerHTML = '';

        devices.forEach(d => {
            const tr = document.createElement('tr');
            const lastLogin = d.last_login ? new Date(d.last_login).toLocaleString('tr-TR') : '-';

            tr.innerHTML = `
                <td>${d.device_info || '-'}</td>
                <td>${lastLogin}</td>
                <td>${d.is_locked ? '<span class="badge badge-danger">Kilitli</span>' : '<span class="badge badge-success">Açık</span>'}</td>
                <td class="actions">
                    <button class="btn btn-sm btn-danger" data-action="toggle-lock" data-id="${d.id}">
                        ${d.is_locked ? 'Kilidi Aç' : 'Kilitle'}
                    </button>
                    <button class="btn btn-sm btn-secondary" data-action="delete-device" data-id="${d.id}">Sil</button>
                </td>
            `;

            devicesTableBody.appendChild(tr);
        });
    }

    async function handleDeleteUser(userId) {
        if (!userId) return;
        const ok = confirm('Kullanıcıyı silmek istediğinize emin misiniz?');
        if (!ok) return;

        try {
            await pb.collection('users').delete(userId);
            await renderUsersTable();
            showListView();
        } catch (err) {
            console.error('Delete user error:', err);
            alert('Kullanıcı silinemedi.');
        }
    }

    async function handleToggleLockDevice(deviceId) {
        if (!deviceId) return;

        try {
            const d = await pb.collection('user_devices').getOne(deviceId);
            await pb.collection('user_devices').update(deviceId, { is_locked: !d.is_locked });

            // cihaz listesini güncelle
            const uid = userIdInput.value;
            await loadUserDevices(uid);
        } catch (err) {
            console.error('Toggle lock device error:', err);
            alert('Cihaz kilidi güncellenemedi.');
        }
    }

    async function handleDeleteDevice(deviceId) {
        if (!deviceId) return;

        const ok = confirm('Cihaz kaydını silmek istediğinize emin misiniz?');
        if (!ok) return;

        try {
            await pb.collection('user_devices').delete(deviceId);

            // cihaz listesini güncelle
            const uid = userIdInput.value;
            await loadUserDevices(uid);
        } catch (err) {
            console.error('Delete device error:', err);
            alert('Cihaz kaydı silinemedi.');
        }
    }

    async function handleSaveUser() {
        const userId = userIdInput.value || null;
        const name = (nameInput.value || '').trim();
        const email = (emailInput.value || '').trim();
        const role = roleSelect.value;
        const password = (passwordInput.value || '').trim();

        const deviceLimit = Number(deviceLimitInput.value || '3');
        const mobileAccess = mobileAccessCheckbox.checked === true;
        const isBanned = isBannedCheckbox.checked === true;

        if (!name || !email || !role) {
            alert('Lütfen zorunlu alanları doldurun.');
            return;
        }

        const data = {
            name,
            email,
            role,
            device_limit: deviceLimit,
            mobile_access: mobileAccess,
            is_banned: isBanned
        };

        if (password) {
            data.password = password;
            data.passwordConfirm = password;
        }

        // RBAC permissions sadece client için
        if (role === 'client') {
            data.permissions = readPermissionsFromUI();
        } else {
            data.permissions = {}; // admin için boş
        }

        try {
            if (userId) {
                await pb.collection('users').update(userId, data);
            } else {
                await pb.collection('users').create(data);
            }

            await renderUsersTable();
            showListView();
        } catch (err) {
            console.error('Save user error:', err);
            alert('Kullanıcı kaydedilemedi.');
        }
    }

    // --- Event Listeners ---
    addUserBtn.addEventListener('click', () => {
        formTitle.textContent = 'Yeni Kullanıcı';
        clearForm();
        showFormView();
    });

    saveUserBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await handleSaveUser();
    });

    cancelUserFormBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showListView();
    });

    usersTableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (!action || !id) return;

        if (action === 'edit') {
            let user = null;
            try {
                user = await pb.collection('users').getOne(id);
            } catch (err) {
                console.error('Get user error:', err);
                alert('Kullanıcı bulunamadı.');
                return;
            }

            formTitle.textContent = 'Kullanıcıyı Düzenle';
            clearForm();
            fillForm(user);
            showFormView();

            await loadUserDevices(id);
        }

        if (action === 'delete') {
            await handleDeleteUser(id);
        }
    });

    devicesTableBody.addEventListener('click', async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        const action = btn.dataset.action;
        const id = btn.dataset.id;

        if (!action || !id) return;

        if (action === 'toggle-lock') {
            await handleToggleLockDevice(id);
        }

        if (action === 'delete-device') {
            await handleDeleteDevice(id);
        }
    });

    roleSelect.addEventListener('change', () => {
        const isClient = (roleSelect.value === 'client');
        setRbacUIVisible(isClient);
    });

    // --- Init ---
    (async () => {
        showListView();
        await renderUsersTable();
    })();
}
