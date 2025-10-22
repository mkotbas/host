/**
 * Kullanıcı Yönetimi Modülü
 * admin.js tarafından çağrılan ana başlatma fonksiyonu.
 * (v2.17) ES6 Modül mimarisine ve 'name' alanı desteğine göre güncellendi.
 */
export function initializeKullaniciYoneticisiModule(pbInstance) {
    
    // --- Global Değişkenler ve DOM Elementleri ---
    const pb = pbInstance;
    let allUsersCache = []; // Kullanıcıları hafızada tutmak için

    // Ana Görünümler
    const listView = document.getElementById('user-list-view');
    const formView = document.getElementById('user-form-view');
    
    // Liste Elemanları
    const tableBody = document.getElementById('users-table-body');
    
    // Form Elemanları
    const form = document.getElementById('user-form');
    const formTitle = document.getElementById('user-form-title');
    const userIdInput = document.getElementById('user-id-input');
    
    // GÜNCELLENDİ: 'name' alanı eklendi
    const userNameInput = document.getElementById('user-name-input'); 
    const userEmailInput = document.getElementById('user-email-input');
    
    // Parola Elemanları (v2.17: Sadece yeni kullanıcıda kullanılır)
    const passwordWrapper = document.getElementById('password-fields-wrapper');
    const userPasswordInput = document.getElementById('user-password-input');
    const userPasswordConfirmInput = document.getElementById('user-password-confirm-input');
    
    // Diğer Form Elemanları
    const userRoleSelect = document.getElementById('user-role-select');
    const mobileAccessCheckbox = document.getElementById('user-mobile-access-checkbox');
    
    // Cihaz Anahtarı Elemanları
    const deviceKeyInfo = document.getElementById('device-key-info');
    const resetDeviceKeyBtn = document.getElementById('reset-device-key-btn');
    
    // Butonlar
    const addNewUserBtn = document.getElementById('add-new-user-btn');
    const saveUserBtn = document.getElementById('save-user-btn');
    const cancelUserFormBtn = document.getElementById('cancel-user-form-btn');

    
    // --- 1. Ana Veri Yükleme Fonksiyonu ---
    
    /**
     * Tüm kullanıcıları PocketBase'den çeker ve tabloyu doldurur.
     */
    async function loadUsers() {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Kullanıcılar yükleniyor...</td></tr>';
        
        try {
            // 'name' alanı artık veritabanından otomatik olarak 'getFullList' ile gelecek.
            allUsersCache = await pb.collection('users').getFullList({
                sort: 'name', // İsime göre sırala
            });
            renderUsersTable(allUsersCache);
        } catch (error) {
            console.error('Kullanıcılar yüklenirken hata:', error);
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: red;">Kullanıcılar yüklenemedi. Lütfen konsolu kontrol edin.</td></tr>';
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
            tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center;">Sistemde kayıtlı kullanıcı bulunamadı.</td></tr>';
            return;
        }

        users.forEach(user => {
            const tr = document.createElement('tr');
            tr.dataset.userId = user.id;

            // GÜNCELLENDİ: 'name' alanı eklendi
            const userName = user.name || '<span style="color: #999;">İsimsiz</span>';
            const userEmail = user.email;
            
            const roleText = user.role === 'admin' ? 'Yönetici' : 'Standart Kullanıcı';
            const roleClass = user.role === 'admin' ? 'role-admin' : 'role-client';
            const mobileAccessText = user.mobile_access ? 'Evet' : 'Hayır';
            const createdDate = new Date(user.created).toLocaleString('tr-TR', { 
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
            });

            tr.innerHTML = `
                <td data-label="İsim"><strong>${userName}</strong></td> <td data-label="E-posta">${userEmail}</td>
                <td data-label="Rol"><span class="role-badge ${roleClass}">${roleText}</span></td>
                <td data-label="Mobil Erişim">${mobileAccessText}</td>
                <td data-label="Oluşturulma Tarihi">${createdDate}</td>
                <td class="actions-cell">
                    <button class="btn-warning btn-sm btn-edit" title="Düzenle"><i class="fas fa-edit"></i> Düzenle</button>
                    <button class="btn-danger btn-sm btn-delete" title="Sil"><i class="fas fa-trash"></i> Sil</button>
                </td>
            `;

            // Oluşturulan butonlara olay dinleyicileri ekle
            tr.querySelector('.btn-edit').addEventListener('click', () => handleEdit(user.id));
            tr.querySelector('.btn-delete').addEventListener('click', () => handleDelete(user.id));

            tableBody.appendChild(tr);
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
        userEmailInput.disabled = false; // E-posta alanını tekrar aç
    }

    
    // --- 4. CRUD (Oluştur, Oku, Güncelle, Sil) İşleyici Fonksiyonları ---
    
    /**
     * "Yeni Kullanıcı Ekle" formunu hazırlar ve gösterir.
     */
    function handleNew() {
        form.reset();
        userIdInput.value = '';
        formTitle.textContent = 'Yeni Kullanıcı Ekle';
        
        // Dokümantasyon v2.17: Parola sadece yeni kullanıcıda atanır.
        passwordWrapper.style.display = 'block'; 
        userPasswordInput.required = true;
        userPasswordConfirmInput.required = true;
        
        resetDeviceKeyBtn.style.display = 'none';
        deviceKeyInfo.textContent = 'Kullanıcı ilk giriş yaptığında cihaz anahtarı atanacaktır.';
        userEmailInput.disabled = false; 
        
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

        // GÜNCELLENDİ: 'name' alanı dolduruldu
        userNameInput.value = user.name || ''; 
        
        userEmailInput.value = user.email;
        userEmailInput.disabled = true; // PocketBase, e-postanın düzenlenmesine izin vermez.
        userRoleSelect.value = user.role;
        mobileAccessCheckbox.checked = user.mobile_access;

        // Dokümantasyon v2.17: Parola değiştirme özelliği kaldırıldı.
        passwordWrapper.style.display = 'none'; 
        userPasswordInput.required = false;
        userPasswordConfirmInput.required = false;
        
        // Cihaz Anahtarı
        if (user.device_key) {
            deviceKeyInfo.textContent = `Kilitli Anahtar: ${user.device_key.substring(0, 15)}...`;
            resetDeviceKeyBtn.style.display = 'inline-block';
        } else {
            deviceKeyInfo.textContent = 'Henüz bir cihaz kaydedilmemiş.';
            resetDeviceKeyBtn.style.display = 'none';
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

        // GÜNCELLENDİ: Silme uyarısında e-posta yerine 'name' kullanıldı
        const userNameForConfirm = user.name || user.email;
        if (!confirm(`'${userNameForConfirm}' adlı kullanıcıyı silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.`)) {
            return;
        }

        try {
            await pb.collection('users').delete(userId);
            await loadUsers(); // Tabloyu yenile
        } catch (error) {
            console.error('Kullanıcı silinirken hata:', error);
            alert('Kullanıcı silinirken bir hata oluştu: ' + error.message);
        }
    }

    /**
     * Form "Kaydet" butonuna basıldığında (submit) tetiklenir.
     * Yeni kullanıcı oluşturur veya mevcut kullanıcıyı günceller.
     */
    async function handleFormSubmit(event) {
        event.preventDefault();
        saveUserBtn.disabled = true;
        saveUserBtn.textContent = 'Kaydediliyor...';

        const userId = userIdInput.value;
        
        // GÜNCELLENDİ: 'name' alanı veriye eklendi
        const data = {
            name: userNameInput.value,
            email: userEmailInput.value,
            role: userRoleSelect.value,
            mobile_access: mobileAccessCheckbox.checked,
            // 'emailVisibility: true' gibi ayarlar varsayılan olarak bırakıldı
        };

        try {
            if (userId) { 
                // --- GÜNCELLEME ---
                // v2.17 gereği parola güncellemesi yapılmaz.
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
     * "Cihaz Anahtarı Kilidini Sıfırla" butonuna basıldığında tetiklenir.
     */
    async function handleResetDeviceKey() {
        const userId = userIdInput.value;
        if (!userId) return;

        if (!confirm("Kullanıcının cihaz kilidini sıfırlamak istediğinizden emin misiniz? Kullanıcı bir sonraki girişinde yeni bir cihaz kaydedebilecektir.")) {
            return;
        }
        
        resetDeviceKeyBtn.disabled = true;
        resetDeviceKeyBtn.textContent = 'Sıfırlanıyor...';

        try {
            // Sadece 'device_key' alanını null olarak güncelle
            await pb.collection('users').update(userId, { 'device_key': null });
            deviceKeyInfo.textContent = 'Cihaz anahtarı sıfırlandı. Değişikliği tamamlamak için "Kaydet" butonuna basın.';
            resetDeviceKeyBtn.style.display = 'none';
        } catch (error) {
            console.error('Cihaz anahtarı sıfırlanırken hata:', error);
            alert('Hata: ' + error.message);
        } finally {
            resetDeviceKeyBtn.disabled = false;
            resetDeviceKeyBtn.textContent = 'Cihaz Anahtarı Kilidini Sıfırla';
        }
    }


    // --- 5. Olay Dinleyicileri (Event Listeners) ---
    
    /**
     * Modül içindeki tüm butonlar için olay dinleyicilerini ayarlar.
     */
    function setupEventListeners() {
        // HTML'den kopyalanan elementlere güvenli atama
        if (addNewUserBtn) addNewUserBtn.addEventListener('click', handleNew);
        if (cancelUserFormBtn) cancelUserFormBtn.addEventListener('click', showListView);
        if (form) form.addEventListener('submit', handleFormSubmit);
        if (resetDeviceKeyBtn) resetDeviceKeyBtn.addEventListener('click', handleResetDeviceKey);
    }

    // --- 6. Modülü Başlat ---
    setupEventListeners();
    loadUsers(); // Modül ilk yüklendiğinde kullanıcıları çek
}