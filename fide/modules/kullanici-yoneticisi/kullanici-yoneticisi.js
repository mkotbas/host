/**
 * Kullanıcı Yönetimi Modülü
 * YENİ: Global cihaz limiti kaldırıldı, BİREYSEL cihaz limiti eklendi.
 * GÜNCELLEME 2.28: Kaydetme sonrası listeye dönme iptal edildi, formda kalınması sağlandı.
 * GÜNCELLEME 2.29: Cihaz listesi (Sil/Kilitle) butonlarının formu submit etmesi engellendi (type="button" eklendi).
 * GÜNCELLEME (SİZİN İSTEĞİNİZ): 'is_banned' (Hesap Kilitleme) özelliği tekrar aktifleştirildi.
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

    // YENİ: Bireysel Cihaz Limiti Elemanları
    const userDeviceLimitSection = document.getElementById('user-device-limit-section');
    const userDeviceLimitInput = document.getElementById('user-device-limit-input');

    // Hesap Kilitleme (BAN) Elemanları
    const userBanSection = document.getElementById('user-ban-section');
    const toggleBanUserBtn = document.getElementById('toggle-ban-user-btn');

    // Cihaz Listesi Elemanları
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

    let rbacSectionEl = null;

    function normalizePermissions(p) {
        const perms = (p && typeof p === 'object') ? JSON.parse(JSON.stringify(p)) : {};
        if (!perms.modules || typeof perms.modules !== 'object') perms.modules = {};
        if (!perms.features || typeof perms.features !== 'object') perms.features = {};

        // güvenli varsayılan: denetim-takip erişimi açık (client için)
        if (perms.modules['denetim-takip'] !== true) {
            perms.modules['denetim-takip'] = true;
        }
        return perms;
    }

    function buildRbacUIOnce() {
        if (rbacSectionEl) return;

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

        if (formView) {
            formView.appendChild(rbacSectionEl);
        }

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

        // Özellikleri modül bazında grupla
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

            const featureItems = featuresByModule[moduleId].map(f => {
                const compactLabel = String(f.label || '').includes(': ')
                    ? String(f.label || '').split(': ').slice(1).join(': ')
                    : String(f.label || '');
                return `
                    <label class="rbac-feature-item">
                        <input type="checkbox" class="rbac-feature-checkbox" data-feature-key="${f.key}">
                        <span class="rbac-feature-label">${compactLabel}</span>
                    </label>
                `;
            }).join('');

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

        function syncDependencies() {
            // denetim-takip her zaman açık + kilitli
            const denetimCb = rbacSectionEl.querySelector('.rbac-module-checkbox[data-module-id="denetim-takip"]');
            if (denetimCb) {
                denetimCb.checked = true;
                denetimCb.disabled = true;
                denetimCb.closest('.rbac-module-item')?.classList.add('is-locked');
            }

            const moduleState = {};
            rbacSectionEl.querySelectorAll('.rbac-module-checkbox').forEach(cb => {
                moduleState[cb.dataset.moduleId] = cb.checked === true;
            });
            moduleState['denetim-takip'] = true;

            let anyVisibleGroup = false;

            rbacSectionEl.querySelectorAll('.rbac-feature-group').forEach(group => {
                const moduleId = group.dataset.moduleId;
                const enabled = moduleState[moduleId] === true;

                group.style.display = enabled ? 'block' : 'none';
                group.classList.toggle('is-disabled', !enabled);

                group.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
                    cb.disabled = !enabled;
                    if (!enabled) cb.checked = false;
                });

                if (enabled) anyVisibleGroup = true;
            });

            if (featureEmptyEl) featureEmptyEl.style.display = anyVisibleGroup ? 'none' : 'block';
        }

        syncDependencies();

        rbacSectionEl.addEventListener('change', (e) => {
            const t = e.target;
            if (!(t instanceof HTMLInputElement)) return;

            if (t.classList.contains('rbac-module-checkbox')) {
                // Modül kapandıysa ilgili alt özellikleri temizle
                const moduleId = t.dataset.moduleId;
                if (moduleId && t.checked !== true) {
                    rbacSectionEl.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
                        const key = cb.dataset.featureKey || '';
                        if (key.startsWith(moduleId + '.')) cb.checked = false;
                    });
                }
                syncDependencies();
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

        // modüller
        rbacSectionEl.querySelectorAll('.rbac-module-checkbox').forEach(cb => {
            const id = cb.dataset.moduleId;
            cb.checked = p.modules[id] === true;

            if (id === 'denetim-takip') {
                cb.checked = true;
                cb.disabled = true;
                cb.closest('.rbac-module-item')?.classList.add('is-locked');
            } else {
                cb.disabled = false;
                cb.closest('.rbac-module-item')?.classList.remove('is-locked');
            }
        });

        // özellikler
        rbacSectionEl.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
            const key = cb.dataset.featureKey;
            cb.checked = p.features[key] === true;
        });

        // modül kapalıysa alt özellikleri sıfırla + disable
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

        // grupları görünür/gizle + empty state
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

        // modül kapalıysa ilgili alt özellikleri sıfırla
        Object.keys(perms.features).forEach(k => {
            const moduleId = k.split('.')[0];
            if (perms.modules[moduleId] !== true) perms.features[k] = false;
        });

        return perms;
    }

    // --- 1. Ana Veri Yükleme Fonksiyonları ---

    /**
     * Tüm kullanıcıları PocketBase'den çeker ve tabloyu doldurur.
     */
    async function loadUsers() {
        try {
            allUsersCache = await pb.collection('users').getFullList({
                sort: '-created'
            });
            renderUserTable(allUsersCache);
        } catch (error) {
            console.error("Kullanıcılar yüklenemedi:", error);
            alert("Kullanıcılar yüklenirken bir hata oluştu.");
        }
    }

    /**
     * Kullanıcı listesini tabloya basar.
     */
    function renderUserTable(users) {
        if (!tableBody) return;
        tableBody.innerHTML = '';

        users.forEach(user => {
            const tr = document.createElement('tr');

            const userName = user.name || 'İsimsiz';
            const userEmail = user.email || '-';
            const roleText = user.role === 'admin' ? 'Yönetici' : 'Standart Kullanıcı';
            const roleClass = user.role === 'admin' ? 'role-admin' : 'role-client';

            // DÜZELTME: is_banned alanı artık veritabanından (varsayılan olarak) okunuyor.
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
     * Cihaz listesini HTML tablosuna çizer.
     * FIX: device_info + last_login alanlarını kullanır (admin UI kolonlarıyla uyumlu).
     * GÜNCELLEME 2.29: Butonlara type="button" eklendi.
     */
    function renderDevicesTable(devices) {
        userDevicesTableBody.innerHTML = '';

        if (!devices || devices.length === 0) {
            userDevicesTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">Kayıtlı cihaz bulunmuyor.</td></tr>`;
            return;
        }

        devices.forEach(device => {
            const tr = document.createElement('tr');

            const deviceInfo = (device.device_info && String(device.device_info).trim() !== '')
                ? device.device_info
                : 'Bilinmeyen Cihaz';

            const lastLoginSource = device.last_login || device.lastLogin || device.created;
            const lastLoginText = lastLoginSource
                ? new Date(lastLoginSource).toLocaleString('tr-TR', {
                    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                })
                : '-';

            const isLocked = device.is_locked === true;
            const statusText = isLocked ? 'Kilitli' : 'Açık';
            const statusClass = isLocked ? 'status-badge status-banned' : 'status-badge status-active';

            tr.innerHTML = `
                <td>${deviceInfo}</td>
                <td>${lastLoginText}</td>
                <td><span class="${statusClass}">${statusText}</span></td>
                <td class="actions-cell">
                    <button type="button" class="btn-warning btn-sm btn-lock" title="Kilitle/Kilidi Aç">
                        <i class="fas fa-lock"></i> ${isLocked ? 'Kilidi Aç' : 'Kilitle'}
                    </button>
                    <button type="button" class="btn-danger btn-sm btn-device-delete" title="Sil">
                        <i class="fas fa-trash"></i> Sil
                    </button>
                </td>
            `;

            tr.querySelector('.btn-lock').addEventListener('click', (e) => {
                e.preventDefault();
                handleToggleDeviceLock(device.id, device.is_locked === true);
            });

            tr.querySelector('.btn-device-delete').addEventListener('click', (e) => {
                e.preventDefault();
                handleDeleteDevice(device.id);
            });

            userDevicesTableBody.appendChild(tr);
        });
    }

    // --- 2. CRUD İşlemleri ---

    async function handleEdit(userId) {
        try {
            const user = await pb.collection('users').getOne(userId);

            // Görünüm
            listView.style.display = 'none';
            formView.style.display = 'block';
            formTitle.textContent = 'Kullanıcıyı Düzenle';

            // Form alanlarını doldur
            userIdInput.value = user.id;
            userNameInput.value = user.name || '';
            userEmailInput.value = user.email || '';
            userRoleSelect.value = user.role || 'client';

            // Parola alanlarını düzenlemede boş bırak
            userPasswordInput.value = '';
            userPasswordConfirmInput.value = '';

            // Admin ise parola alanlarını göster (isterse değiştirsin); client için de gösteriyoruz (sizdeki istek)
            if (passwordWrapper) passwordWrapper.style.display = 'block';

            // Mobil erişim
            mobileAccessCheckbox.checked = user.mobile_access === true;

            // Cihaz limiti sadece client için göster
            const isClient = (userRoleSelect.value === 'client');
            if (userDeviceLimitSection) userDeviceLimitSection.style.display = isClient ? 'block' : 'none';
            if (userDeviceLimitInput) userDeviceLimitInput.value = String(user.device_limit ?? 1);

            // BAN alanı sadece client için göster
            if (userBanSection) userBanSection.style.display = isClient ? 'block' : 'none';

            // BAN buton metni
            if (toggleBanUserBtn) {
                if (user.is_banned) {
                    toggleBanUserBtn.innerHTML = `<i class="fas fa-unlock"></i> Bu Kullanıcının Hesap Kilidini Aç (UNBAN)`;
                    toggleBanUserBtn.classList.remove('btn-danger');
                    toggleBanUserBtn.classList.add('btn-success');
                } else {
                    toggleBanUserBtn.innerHTML = `<i class="fas fa-ban"></i> Bu Kullanıcının Hesabını Kilitle (BAN)`;
                    toggleBanUserBtn.classList.remove('btn-success');
                    toggleBanUserBtn.classList.add('btn-danger');
                }
            }

            // RBAC sadece client için
            setRbacUIVisible(isClient);
            if (isClient) setPermissionsToUI(user.permissions || {});

            // Cihazlar bölümü sadece client için
            if (devicesHr) devicesHr.style.display = isClient ? 'block' : 'none';
            if (devicesTitle) devicesTitle.style.display = isClient ? 'block' : 'none';
            if (devicesDescription) devicesDescription.style.display = isClient ? 'block' : 'none';

            if (isClient) {
                if (devicesListLoading) devicesListLoading.style.display = 'block';
                if (userDevicesTableWrapper) userDevicesTableWrapper.style.display = 'none';

                const devices = await pb.collection('user_devices').getFullList({
                    filter: `user="${user.id}"`,
                    sort: '-last_login'
                });

                if (devicesListLoading) devicesListLoading.style.display = 'none';
                if (userDevicesTableWrapper) userDevicesTableWrapper.style.display = 'block';
                renderDevicesTable(devices);
            } else {
                if (devicesListLoading) devicesListLoading.style.display = 'none';
                if (userDevicesTableWrapper) userDevicesTableWrapper.style.display = 'none';
            }

        } catch (error) {
            console.error("Kullanıcı düzenleme ekranı açılamadı:", error);
            alert("Kullanıcı bilgileri alınırken bir hata oluştu.");
        }
    }

    async function handleDelete(userId) {
        if (!confirm("Bu kullanıcıyı silmek istediğinizden emin misiniz?")) return;
        try {
            await pb.collection('users').delete(userId);
            await loadUsers();
        } catch (error) {
            console.error("Kullanıcı silinemedi:", error);
            alert("Kullanıcı silinirken bir hata oluştu.");
        }
    }

    async function handleToggleDeviceLock(deviceId, isLocked) {
        try {
            await pb.collection('user_devices').update(deviceId, { is_locked: !isLocked });

            // Ekrandaki kullanıcı ID'si ile cihaz listesini yenile
            const userId = userIdInput.value;
            const devices = await pb.collection('user_devices').getFullList({
                filter: `user="${userId}"`,
                sort: '-last_login'
            });
            renderDevicesTable(devices);
        } catch (error) {
            console.error("Cihaz kilidi değiştirilemedi:", error);
            alert("Cihaz kilidi güncellenirken bir hata oluştu.");
        }
    }

    async function handleDeleteDevice(deviceId) {
        if (!confirm("Bu cihaz kaydını silmek istediğinizden emin misiniz?")) return;
        try {
            await pb.collection('user_devices').delete(deviceId);

            const userId = userIdInput.value;
            const devices = await pb.collection('user_devices').getFullList({
                filter: `user="${userId}"`,
                sort: '-last_login'
            });
            renderDevicesTable(devices);
        } catch (error) {
            console.error("Cihaz silinemedi:", error);
            alert("Cihaz silinirken bir hata oluştu.");
        }
    }

    async function handleSaveUser(event) {
        event.preventDefault();

        const userId = userIdInput.value;
        const name = userNameInput.value.trim();
        const email = userEmailInput.value.trim();
        const role = userRoleSelect.value;

        if (!name || !email) {
            alert("İsim ve e-posta alanları zorunludur.");
            return;
        }

        // parola kontrolü
        const password = userPasswordInput.value.trim();
        const passwordConfirm = userPasswordConfirmInput.value.trim();

        if (password || passwordConfirm) {
            if (password !== passwordConfirm) {
                alert("Parolalar eşleşmiyor.");
                return;
            }
            if (password.length < 6) {
                alert("Parola en az 6 karakter olmalıdır.");
                return;
            }
        }

        // client alanları
        const mobile_access = mobileAccessCheckbox.checked === true;

        // cihaz limiti sadece client
        let device_limit = 1;
        if (role === 'client') {
            const raw = Number(userDeviceLimitInput.value || 1);
            device_limit = Number.isFinite(raw) ? raw : 1;
            if (device_limit < 1) device_limit = 1;
            if (device_limit > 5) device_limit = 5;
        }

        const data = {
            name,
            email,
            role,
            mobile_access
        };

        if (role === 'client') {
            data.device_limit = device_limit;
            data.permissions = readPermissionsFromUI();
        } else {
            data.permissions = {};
        }

        // parola sadece doluysa set et
        if (password) {
            data.password = password;
            data.passwordConfirm = passwordConfirm;
        }

        try {
            if (userId) {
                await pb.collection('users').update(userId, data);
            } else {
                await pb.collection('users').create(data);
            }

            alert("Kullanıcı kaydedildi.");
            await loadUsers();

            // sizdeki kural: kaydet sonrası formda kal
            // (mevcut davranış korunuyor)
        } catch (error) {
            console.error("Kullanıcı kaydedilemedi:", error);
            alert("Kullanıcı kaydedilirken bir hata oluştu.");
        }
    }

    async function handleToggleBan() {
        const userId = userIdInput.value;
        if (!userId) return;

        try {
            const user = await pb.collection('users').getOne(userId);
            const newBanState = !(user.is_banned === true);

            await pb.collection('users').update(userId, { is_banned: newBanState });

            if (toggleBanUserBtn) {
                if (newBanState) {
                    toggleBanUserBtn.innerHTML = `<i class="fas fa-unlock"></i> Bu Kullanıcının Hesap Kilidini Aç (UNBAN)`;
                    toggleBanUserBtn.classList.remove('btn-danger');
                    toggleBanUserBtn.classList.add('btn-success');
                } else {
                    toggleBanUserBtn.innerHTML = `<i class="fas fa-ban"></i> Bu Kullanıcının Hesabını Kilitle (BAN)`;
                    toggleBanUserBtn.classList.remove('btn-success');
                    toggleBanUserBtn.classList.add('btn-danger');
                }
            }

            alert(newBanState ? "Kullanıcı kilitlendi (BAN)." : "Kullanıcı kilidi açıldı (UNBAN).");
            await loadUsers();
        } catch (error) {
            console.error("Ban işlemi başarısız:", error);
            alert("Ban işlemi sırasında bir hata oluştu.");
        }
    }

    function resetFormToNewUser() {
        formTitle.textContent = 'Yeni Kullanıcı Ekle';
        userIdInput.value = '';
        userNameInput.value = '';
        userEmailInput.value = '';
        userRoleSelect.value = 'client';

        if (passwordWrapper) passwordWrapper.style.display = 'block';
        userPasswordInput.value = '';
        userPasswordConfirmInput.value = '';

        mobileAccessCheckbox.checked = false;

        // client default gösterimler
        if (userDeviceLimitSection) userDeviceLimitSection.style.display = 'block';
        if (userDeviceLimitInput) userDeviceLimitInput.value = '1';

        if (userBanSection) userBanSection.style.display = 'block';
        if (toggleBanUserBtn) {
            toggleBanUserBtn.innerHTML = `<i class="fas fa-ban"></i> Bu Kullanıcının Hesabını Kilitle (BAN)`;
            toggleBanUserBtn.classList.remove('btn-success');
            toggleBanUserBtn.classList.add('btn-danger');
        }

        // cihazlar kısmı kapalı (yeni kullanıcıda cihaz yok)
        if (devicesHr) devicesHr.style.display = 'none';
        if (devicesTitle) devicesTitle.style.display = 'none';
        if (devicesDescription) devicesDescription.style.display = 'none';
        if (devicesListLoading) devicesListLoading.style.display = 'none';
        if (userDevicesTableWrapper) userDevicesTableWrapper.style.display = 'none';

        // RBAC görünür + varsayılan
        setRbacUIVisible(true);
        setPermissionsToUI({ modules: { 'denetim-takip': true }, features: {} });
    }

    function goToListView() {
        formView.style.display = 'none';
        listView.style.display = 'block';
    }

    function goToFormViewNewUser() {
        listView.style.display = 'none';
        formView.style.display = 'block';
        resetFormToNewUser();
    }

    // --- Event Listeners ---
    if (addNewUserBtn) {
        addNewUserBtn.addEventListener('click', () => goToFormViewNewUser());
    }

    if (cancelUserFormBtn) {
        cancelUserFormBtn.addEventListener('click', () => goToListView());
    }

    if (saveUserBtn && form) {
        form.addEventListener('submit', handleSaveUser);
    }

    if (toggleBanUserBtn) {
        toggleBanUserBtn.addEventListener('click', handleToggleBan);
    }

    if (userRoleSelect) {
        userRoleSelect.addEventListener('change', () => {
            const isClient = userRoleSelect.value === 'client';

            if (userDeviceLimitSection) userDeviceLimitSection.style.display = isClient ? 'block' : 'none';
            if (userBanSection) userBanSection.style.display = isClient ? 'block' : 'none';

            if (devicesHr) devicesHr.style.display = isClient ? 'block' : 'none';
            if (devicesTitle) devicesTitle.style.display = isClient ? 'block' : 'none';
            if (devicesDescription) devicesDescription.style.display = isClient ? 'block' : 'none';

            // RBAC sadece client
            setRbacUIVisible(isClient);
        });
    }

    // --- Init ---
    loadUsers();
}
