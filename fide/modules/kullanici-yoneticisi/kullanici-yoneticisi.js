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

        // Form görünümüne RBAC bölümü ekle (HTML dosyasında yoksa JS ile üret)
        rbacSectionEl = document.createElement('div');
        rbacSectionEl.id = 'user-permissions-section';
        rbacSectionEl.className = 'form-section';
        rbacSectionEl.innerHTML = `
            <h3 style="margin-top: 0;">Modül & Özellik Yetkileri</h3>
            <p style="margin-top: 6px; opacity: .85;">
                Standart Kullanıcılar (client) için modül erişimi ve modül içi kritik özellik izinleri.
                Yetkisi olmayan öğeler ilgili kullanıcıda menüde görünmez ve sayfaya erişemez.
            </p>

            <div id="rbac-modules-box" style="margin-top: 12px;">
                <h4 style="margin: 12px 0 6px 0;">Modül Erişimi</h4>
                <div class="rbac-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px;"></div>
            </div>

            <div id="rbac-features-box" style="margin-top: 14px;">
                <h4 style="margin: 12px 0 6px 0;">Modül İçi Özellik Yetkileri</h4>
                <div class="rbac-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px;"></div>
            </div>
        `;

        if (formView) {
            formView.appendChild(rbacSectionEl);
        }

        const modulesGrid = rbacSectionEl.querySelector('#rbac-modules-box .rbac-grid');
        const featuresGrid = rbacSectionEl.querySelector('#rbac-features-box .rbac-grid');

        RBAC_MODULE_DEFS.forEach(m => {
            const wrap = document.createElement('label');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.gap = '8px';
            wrap.style.padding = '10px 12px';
            wrap.style.border = '1px solid rgba(0,0,0,.1)';
            wrap.style.borderRadius = '10px';

            wrap.innerHTML = `
                <input type="checkbox" class="rbac-module-checkbox" data-module-id="${m.id}">
                <span>${m.label}</span>
            `;
            modulesGrid.appendChild(wrap);
        });

        RBAC_FEATURE_DEFS.forEach(f => {
            const wrap = document.createElement('label');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            wrap.style.gap = '8px';
            wrap.style.padding = '10px 12px';
            wrap.style.border = '1px solid rgba(0,0,0,.1)';
            wrap.style.borderRadius = '10px';

            wrap.innerHTML = `
                <input type="checkbox" class="rbac-feature-checkbox" data-feature-key="${f.key}">
                <span>${f.label}</span>
            `;
            featuresGrid.appendChild(wrap);
        });

        // Modül kapalıysa alt özellikleri otomatik kapat (Bayi Yöneticisi)
        rbacSectionEl.addEventListener('change', (e) => {
            const t = e.target;
            if (!(t instanceof HTMLInputElement)) return;

            if (t.classList.contains('rbac-module-checkbox') && t.dataset.moduleId === 'bayi-yoneticisi') {
                const featureCbs = rbacSectionEl.querySelectorAll('.rbac-feature-checkbox');
                featureCbs.forEach(cb => {
                    cb.disabled = !t.checked;
                    if (!t.checked) cb.checked = false;
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
            // denetim-takip her zaman açık
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

        // denetim-takip her zaman açık
        perms.modules['denetim-takip'] = true;

        rbacSectionEl.querySelectorAll('.rbac-feature-checkbox').forEach(cb => {
            const key = cb.dataset.featureKey;
            perms.features[key] = cb.checked === true;
        });

        // bayi-yoneticisi kapalıysa alt özellikleri sıfırla
        if (perms.modules['bayi-yoneticisi'] !== true) {
            Object.keys(perms.features).forEach(k => {
                if (k.startsWith('bayi-yoneticisi.')) perms.features[k] = false;
            });
        }

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
            const lockText = device.is_locked ? 'Kilitli' : 'Açık';
            const lockClass = device.is_locked ? 'status-banned' : 'status-active';
            const createdDate = new Date(device.created).toLocaleString('tr-TR', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });

            tr.innerHTML = `
                <td data-label="Cihaz ID">${device.device_id || '-'}</td>
                <td data-label="Durum"><span class="status-badge ${lockClass}">${lockText}</span></td>
                <td data-label="Kayıt Tarihi">${createdDate}</td>
                <td class="actions-cell">
                    <button type="button" class="btn-danger btn-sm btn-device-delete"><i class="fas fa-trash"></i> Sil</button>
                    <button type="button" class="btn-warning btn-sm btn-device-lock"><i class="fas fa-lock"></i> ${device.is_locked ? 'Kilidi Aç' : 'Kilitle'}</button>
                </td>
            `;

            tr.querySelector('.btn-device-delete').addEventListener('click', () => handleDeleteDevice(device.id));
            tr.querySelector('.btn-device-lock').addEventListener('click', () => handleToggleLockDevice(device.id, device.is_locked));

            userDevicesTableBody.appendChild(tr);
        });
    }

    /**
     * Kullanıcının cihazlarını yükler.
     */
    async function loadUserDevices(userId) {
        try {
            devicesListLoading.style.display = 'block';
            userDevicesTableWrapper.style.display = 'none';

            const devices = await pb.collection('user_devices').getFullList({
                filter: `user="${userId}"`,
                sort: '-created'
            });

            renderDevicesTable(devices);

            devicesListLoading.style.display = 'none';
            userDevicesTableWrapper.style.display = 'block';
        } catch (error) {
            console.error("Cihazlar yüklenemedi:", error);
            devicesListLoading.style.display = 'none';
            userDevicesTableWrapper.style.display = 'none';
        }
    }

    // --- 2. Görünüm Yönetimi ---

    function showListView() {
        listView.style.display = 'block';
        formView.style.display = 'none';
    }

    function showFormView() {
        listView.style.display = 'none';
        formView.style.display = 'block';
    }

    // --- 3. CRUD İşlemleri ---

    /**
     * Yeni kullanıcı oluşturma formunu açar.
     */
    function handleNew() {
        form.reset();
        userIdInput.value = '';
        formTitle.textContent = 'Yeni Kullanıcı Ekle';

        userEmailInput.disabled = false;

        // Yeni kayıtta parola alanlarını göster
        passwordWrapper.style.display = 'block';
        userPasswordInput.required = true;
        userPasswordConfirmInput.required = true;

        // Rol varsayılanı: client
        userRoleSelect.value = 'client';
        mobileAccessCheckbox.checked = false;

        // Ban ve cihaz listesi bölümlerini gizle
        userBanSection.style.display = 'none';
        devicesHr.style.display = 'none';
        devicesTitle.style.display = 'none';
        devicesDescription.style.display = 'none';
        devicesListLoading.style.display = 'none';
        userDevicesTableWrapper.style.display = 'none';

        // YENİ: Rol 'client' olarak varsayılan seçili olduğu için cihaz limitini göster
        userDeviceLimitSection.style.display = 'block';
        userDeviceLimitInput.value = 1; // Varsayılan

        // RBAC varsayılanları
        setRbacUIVisible(true);
        setPermissionsToUI({ modules: { 'denetim-takip': true }, features: {} });

        showFormView();
    }

    /**
     * "Düzenle" butonuna basıldığında formu doldurur ve gösterir.
     * DÜZELTME: 'is_banned' bölümü aktifleştirildi.
     */
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

        // RBAC: client için izinleri yükle
        if (user.role === 'client') {
            setRbacUIVisible(true);
            setPermissionsToUI(user.permissions || {});
        } else {
            setRbacUIVisible(false);
        }

        passwordWrapper.style.display = 'none';
        userPasswordInput.required = false;
        userPasswordConfirmInput.required = false;

        // Ban bölümünü ayarla ve GÖSTER
        userBanSection.style.display = 'block';
        updateBanButton(user.is_banned || false);

        // Cihaz listesi bölümünü göster
        devicesHr.style.display = 'block';
        devicesTitle.style.display = 'block';
        devicesDescription.style.display = 'block';

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

            // Cihazları yükle
            loadUserDevices(user.id);
        }

        showFormView();
    }

    /**
     * Kullanıcıyı siler.
     */
    async function handleDelete(userId) {
        if (!confirm('Bu kullanıcıyı silmek istediğinizden emin misiniz?')) {
            return;
        }
        try {
            await pb.collection('users').delete(userId);
            await loadUsers();
        } catch (error) {
            console.error('Kullanıcı silinirken hata:', error);
            alert('Hata: Kullanıcı silinemedi.');
        }
    }

    // --- 4. Form & Yardımcı İşlevler ---

    /**
     * Ban butonunun metnini/durumunu ayarlar.
     */
    function updateBanButton(isBanned) {
        if (!toggleBanUserBtn) return;
        toggleBanUserBtn.textContent = isBanned ? 'Hesap Kilidini Aç' : 'Hesabı Kilitle';
        toggleBanUserBtn.classList.toggle('btn-danger', !isBanned);
        toggleBanUserBtn.classList.toggle('btn-success', isBanned);
    }

    /**
     * Form submit
     * GÜNCELLEME 2.28: Artık güncelleme sonrası formda kalıyor. (Değişiklik yok)
     */
    async function handleFormSubmit(event) {
        event.preventDefault();
        saveUserBtn.disabled = true;
        saveUserBtn.textContent = 'Kaydediliyor.';

        const userId = userIdInput.value;

        // YENİ: Bireysel cihaz limiti veriye eklendi
        const data = {
            name: userNameInput.value,
            email: userEmailInput.value,
            role: userRoleSelect.value,
            mobile_access: mobileAccessCheckbox.checked,
            device_limit: 1 // Varsayılan (eğer admin ise)
        };

        // Eğer rol client ise, bireysel limiti al
        if (data.role === 'client') {
            let limit = parseInt(userDeviceLimitInput.value);
            if (isNaN(limit) || limit < 1) limit = 1;
            if (limit > 5) limit = 5; // Veritabanı kuralına ek olarak JS'de de kontrol edelim
            data.device_limit = limit;
        }

        // RBAC: Sadece client için permissions kaydet
        if (data.role === 'client') {
            data.permissions = readPermissionsFromUI();
        }

        try {
            if (userId) {
                // --- GÜNCELLEME (GÜNCELLEME 2.28) ---
                await pb.collection('users').update(userId, data);

                // Arka plandaki veriyi (cache) güncelle
                await loadUsers();

                // Başarı mesajı ver ve formda kal
                alert('Değişiklikler kaydedildi.');

            } else {
                // --- YENİ KAYIT (DAVRANIŞ DEĞİŞMEDİ) ---
                if (!userPasswordInput.value || !userPasswordConfirmInput.value) {
                    throw new Error('Yeni kullanıcı için parola zorunludur.');
                }
                if (userPasswordInput.value !== userPasswordConfirmInput.value) {
                    throw new Error('Parolalar eşleşmiyor.');
                }
                data.password = userPasswordInput.value;
                data.passwordConfirm = userPasswordConfirmInput.value;

                await pb.collection('users').create(data);

                // Arka plandaki veriyi (cache) güncelle
                await loadUsers();
                // Yeni kayıtta listeye dön
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

    /**
     * "Hesabı Kilitle / Kilidi Aç" butonu
     * DÜZELTME: Hata mesajı basitleştirildi.
     */
    async function handleToggleBanUser() {
        const userId = userIdInput.value;
        if (!userId) return;

        const user = allUsersCache.find(u => u.id === userId);
        if (!user) return;

        const currentBanStatus = user.is_banned || false;
        const newBanStatus = !currentBanStatus;
        const actionText = newBanStatus ? 'kilitlemek' : 'kilidi açmak';

        if (!confirm(`Bu hesabı ${actionText} istediğinizden emin misiniz?`)) {
            return;
        }

        try {
            await pb.collection('users').update(userId, { is_banned: newBanStatus });
            await loadUsers();

            // Cache içinden güncel kullanıcıyı bulup butonu güncelle
            const updated = allUsersCache.find(u => u.id === userId);
            updateBanButton(updated?.is_banned || false);

        } catch (error) {
            console.error('Ban durumu güncellenirken hata:', error);
            alert('Hata: Hesap durumu güncellenemedi.');
        }
    }

    /**
     * Cihazı siler
     */
    async function handleDeleteDevice(deviceId) {
        if (!confirm('Bu cihazı silmek istediğinizden emin misiniz?')) {
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

    /**
     * Cihazı kilitler
     */
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

    /**
     * Kullanıcı rolü değiştikçe cihaz limiti alanını ve RBAC alanını göster/gizle.
     */
    function handleRoleChange() {
        const isAdmin = userRoleSelect.value === 'admin';
        if (isAdmin) {
            userDeviceLimitSection.style.display = 'none';
            setRbacUIVisible(false);
        } else {
            userDeviceLimitSection.style.display = 'block';
            setRbacUIVisible(true);
        }
    }

    // --- 5. Olay Dinleyicileri (Event Listeners) ---

    function setupEventListeners() {
        if (addNewUserBtn) addNewUserBtn.addEventListener('click', handleNew);
        if (cancelUserFormBtn) cancelUserFormBtn.addEventListener('click', showListView);
        if (form) form.addEventListener('submit', handleFormSubmit);

        if (toggleBanUserBtn) toggleBanUserBtn.addEventListener('click', handleToggleBanUser);

        if (userRoleSelect) userRoleSelect.addEventListener('change', handleRoleChange);
    }

    // --- 6. Modülü Başlat ---
    setupEventListeners();

    // RBAC UI'yi hazırla (varsayılan: client görünür)
    buildRbacUIOnce();
    setRbacUIVisible(true);
    setPermissionsToUI({ modules: { 'denetim-takip': true }, features: {} });

    loadUsers(); // Ana kullanıcı listesini yükle
}
