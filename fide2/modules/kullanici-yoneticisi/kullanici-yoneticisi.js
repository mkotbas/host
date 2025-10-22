// /modules/kullanici-yoneticisi/kullanici-yoneticisi.js

// GÜNCELLENDİ: (function() { ... })() sarmalayıcısı kaldırıldı.

// Modüle özel değişkenler
let pbInstance;

// DOM Elementleri
let userListView, userFormView, usersTableBody, addNewUserBtn, userForm, userFormTitle,
    userIdInput, userEmailInput, userPasswordInput, userPasswordConfirmInput,
    userRoleSelect, userMobileAccessCheckbox, 
    deviceKeyInfo, resetDeviceKeyBtn, 
    saveUserBtn, cancelUserFormBtn;

/**
 * Modülün başlangıç fonksiyonu. admin.js tarafından çağrılır.
 * GÜNCELLENDİ: 'export' anahtar kelimesi eklendi.
 */
export async function initializeKullaniciYoneticisiModule(pb) {
    pbInstance = pb;
    
    // DOM elementlerini değişkene ata
    cacheDOMElements();
    
    // Olay dinleyicilerini kur
    setupEventListeners();
    
    // Başlangıçta kullanıcı listesini göster
    showView('list');
    await fetchAndDisplayUsers();
}

/**
 * Gerekli tüm DOM elementlerini seçip değişkenlere atar.
 */
function cacheDOMElements() {
    userListView = document.getElementById('user-list-view');
    userFormView = document.getElementById('user-form-view');
    usersTableBody = document.getElementById('users-table-body');
    addNewUserBtn = document.getElementById('add-new-user-btn');
    userForm = document.getElementById('user-form');
    userFormTitle = document.getElementById('user-form-title');
    userIdInput = document.getElementById('user-id-input');
    userEmailInput = document.getElementById('user-email-input');
    userPasswordInput = document.getElementById('user-password-input');
    userPasswordConfirmInput = document.getElementById('user-password-confirm-input');
    userRoleSelect = document.getElementById('user-role-select');
    userMobileAccessCheckbox = document.getElementById('user-mobile-access-checkbox');
    
    deviceKeyInfo = document.getElementById('device-key-info');
    resetDeviceKeyBtn = document.getElementById('reset-device-key-btn');
    
    saveUserBtn = document.getElementById('save-user-btn');
    cancelUserFormBtn = document.getElementById('cancel-user-form-btn');
}

/**
 * Modül içindeki butonlar ve formlar için olay dinleyicilerini ayarlar.
 */
function setupEventListeners() {
    addNewUserBtn.addEventListener('click', handleAddNewUser);
    cancelUserFormBtn.addEventListener('click', () => showView('list'));
    userForm.addEventListener('submit', handleFormSubmit);
    
    resetDeviceKeyBtn.addEventListener('click', handleResetDeviceKey);
}

/**
 * Veritabanından tüm kullanıcıları çeker ve tabloya ekler.
 */
async function fetchAndDisplayUsers() {
    usersTableBody.innerHTML = '<tr><td colspan="5">Kullanıcılar yükleniyor...</td></tr>';
    try {
        const users = await pbInstance.collection('users').getFullList({ sort: '-created' });
        usersTableBody.innerHTML = ''; // Tabloyu temizle
        if (users.length === 0) {
            usersTableBody.innerHTML = '<tr><td colspan="5">Sistemde kayıtlı kullanıcı bulunamadı.</td></tr>';
        } else {
            users.forEach(user => renderUserRow(user));
        }
    } catch (error) {
        console.error("Kullanıcılar çekilirken hata:", error);
        usersTableBody.innerHTML = '<tr><td colspan="5" style="color: red;">Kullanıcılar yüklenemedi.</td></tr>';
    }
}

/**
 * Tek bir kullanıcı verisi için tablo satırı oluşturur ve ekler.
 */
function renderUserRow(user) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
        <td>${user.email}</td>
        <td><span class="role-badge role-${user.role}">${user.role || 'client'}</span></td>
        <td>${user.mobile_access ? 'Evet' : 'Hayır'}</td>
        <td>${new Date(user.created).toLocaleString('tr-TR')}</td>
        <td class="actions-cell">
            <button class="btn-primary btn-sm edit-btn" data-id="${user.id}"><i class="fas fa-edit"></i> Düzenle</button>
            <button class="btn-danger btn-sm delete-btn" data-id="${user.id}"><i class="fas fa-trash"></i> Sil</button>
        </td>
    `;
    // Butonlara olay dinleyicilerini ekle
    tr.querySelector('.edit-btn').addEventListener('click', () => handleEditUser(user.id));
    tr.querySelector('.delete-btn').addEventListener('click', () => handleDeleteUser(user.id, user.email));
    
    usersTableBody.appendChild(tr);
}

/**
 * "Yeni Kullanıcı Ekle" butonu tıklandığında formu hazırlar.
 */
function handleAddNewUser() {
    userForm.reset();
    userIdInput.value = '';
    userFormTitle.textContent = 'Yeni Kullanıcı Ekle';

    // Parola alanlarını göster
    userPasswordInput.parentElement.style.display = 'block';
    userPasswordConfirmInput.parentElement.style.display = 'block';
    
    userPasswordInput.placeholder = 'Yeni parola belirleyin';
    userPasswordInput.required = true;
    userPasswordConfirmInput.required = true;

    // Cihaz anahtarı bölümünü gizle
    resetDeviceKeyBtn.style.display = 'none';
    deviceKeyInfo.parentElement.style.display = 'none';
    showView('form');
}

/**
 * "Düzenle" butonu tıklandığında formu doldurur.
 */
async function handleEditUser(userId) {
    try {
        const user = await pbInstance.collection('users').getOne(userId);
        userForm.reset();
        userIdInput.value = user.id;
        userEmailInput.value = user.email;
        userRoleSelect.value = user.role || 'client';
        userMobileAccessCheckbox.checked = user.mobile_access;

        // Parola alanlarını gizle
        userPasswordInput.parentElement.style.display = 'none';
        userPasswordConfirmInput.parentElement.style.display = 'none';

        userPasswordInput.required = false;
        userPasswordConfirmInput.required = false;

        // Cihaz anahtarı bölümünü göster ve doldur
        deviceKeyInfo.parentElement.style.display = 'block';
        resetDeviceKeyBtn.style.display = 'inline-block';
        
        // `device_key` alanını kontrol et
        if (user.device_key) {
            deviceKeyInfo.textContent = 'KİLİTLİ (Anahtar: ' + user.device_key.substring(0, 10) + '...)';
            deviceKeyInfo.style.color = '#495057';
        } else {
            deviceKeyInfo.textContent = 'Henüz bir cihaz kaydedilmemiş.';
            deviceKeyInfo.style.color = '#6c757d';
        }

        userFormTitle.textContent = 'Kullanıcıyı Düzenle';
        showView('form');
    } catch (error) {
        console.error("Kullanıcı bilgisi alınamadı:", error);
        alert("Kullanıcı bilgileri yüklenirken bir hata oluştu.");
    }
}

/**
 * "Kaydet" butonuna basıldığında formu işler (yeni kayıt veya güncelleme).
 */
async function handleFormSubmit(event) {
    event.preventDefault();
    saveUserBtn.disabled = true;
    saveUserBtn.textContent = 'Kaydediliyor...';
    
    const userId = userIdInput.value;
    const data = {
        email: userEmailInput.value,
        role: userRoleSelect.value,
        mobile_access: userMobileAccessCheckbox.checked,
    };

    const password = userPasswordInput.value;
    const passwordConfirm = userPasswordConfirmInput.value;

    try {
        if (userId) { // --- GÜNCELLEME İŞLEMİ ---
            if (password) {
                if (password !== passwordConfirm) {
                    throw new Error("Parolalar eşleşmiyor!");
                }
                data.password = password;
                data.passwordConfirm = passwordConfirm;
            }
            await pbInstance.collection('users').update(userId, data);
            alert("Kullanıcı başarıyla güncellendi.");

        } else { // --- YENİ OLUŞTURMA İŞLEMİ ---
            if (!password || !passwordConfirm) {
                throw new Error("Yeni kullanıcı için parola alanları zorunludur.");
            }
            if (password !== passwordConfirm) {
                throw new Error("Parolalar eşleşmiyor!");
            }
            data.password = password;
            data.passwordConfirm = passwordConfirm;
            data.emailVisibility = true;
            await pbInstance.collection('users').create(data);
            alert("Kullanıcı başarıyla oluşturuldu.");
        }

        showView('list');
        await fetchAndDisplayUsers();
    } catch (error) {
        console.error("Kullanıcı kaydedilirken hata:", error);
        alert(`Bir hata oluştu: ${error.message}`);
    } finally {
        saveUserBtn.disabled = false;
        saveUserBtn.textContent = 'Kaydet';
    }
}

/**
 * "Sil" butonu tıklandığında kullanıcıyı siler.
 */
async function handleDeleteUser(userId, userEmail) {
    if (confirm(`'${userEmail}' kullanıcısını kalıcı olarak silmek istediğinizden emin misiniz?`)) {
        try {
            await pbInstance.collection('users').delete(userId);
            alert("Kullanıcı başarıyla silindi.");
            await fetchAndDisplayUsers();
        } catch (error) {
            console.error("Kullanıcı silinirken hata:", error);
            alert("Kullanıcı silinirken bir hata oluştu.");
        }
    }
}

/**
 * Cihaz anahtarı kilidini sıfırlama fonksiyonu
 */
async function handleResetDeviceKey() {
    const userId = userIdInput.value;
    if (!userId) return;

    if (confirm("Bu kullanıcının cihaz anahtarı kilidini sıfırlamak istediğinizden emin misiniz? Kullanıcı bir sonraki girişinde herhangi bir cihazdan bağlanabilir ve o cihaz yeniden kilitlenir.")) {
        try {
            // `device_key` alanını boş string olarak güncelle
            await pbInstance.collection('users').update(userId, { 'device_key': '' });
            alert("Cihaz anahtarı kilidi başarıyla sıfırlandı.");
            deviceKeyInfo.textContent = 'Cihaz anahtarı sıfırlandı. Kullanıcı bir sonraki girişinde kilitlenecek.';
            deviceKeyInfo.style.color = '#28a745';
        } catch (error) {
            console.error("Cihaz anahtarı sıfırlanırken hata:", error);
            alert("Cihaz anahtarı sıfırlanırken bir hata oluştu.");
        }
    }
}

/**
 * Liste ve form görünümleri arasında geçiş yapar.
 */
function showView(viewName) {
    if (viewName === 'form') {
        userListView.style.display = 'none';
        userFormView.style.display = 'block';
    } else { // 'list'
        userListView.style.display = 'block';
        userFormView.style.display = 'none';
    }
}

// GÜNCELLENDİ: 'window.initialize...' satırı kaldırıldı.