// --- Bayi Yönetimi Departmanı (Modülü) ---

// Modül içinde kullanılacak lokal değişken
let storeEmails = {};

/**
 * Bayi e-posta verilerini Firebase'den yükler.
 * @param {object} auth Firebase auth nesnesi.
 * @param {object} database Firebase database nesnesi.
 */
export async function loadBayiManagerData(auth, database) {
    storeEmails = {}; // Her yüklemede sıfırla
    if (auth.currentUser && database) {
        try {
            const emailsRef = database.ref('storeEmails');
            const snapshot = await emailsRef.once('value');
            if (snapshot.exists()) {
                storeEmails = snapshot.val();
            }
        } catch (error) {
            console.error("Buluttan bayi e-postaları yüklenemedi:", error);
            alert("E-posta listesi buluttan yüklenemedi.");
        }
    }
}

/**
 * Yüklenen e-posta verilerini ve arama filtresini kullanarak arayüzü oluşturur.
 */
export function renderBayiManager() {
    const listContainer = document.getElementById('email-manager-list');
    const searchInput = document.getElementById('email-search-input');
    if (!listContainer || !searchInput) return;

    const filterText = searchInput.value.toLowerCase();
    listContainer.innerHTML = '';

    const filteredEntries = Object.entries(storeEmails).filter(([kodu, email]) => {
        return kodu.toLowerCase().includes(filterText) || email.toLowerCase().includes(filterText);
    });
    
    if(filteredEntries.length === 0 && Object.keys(storeEmails).length > 0) {
         listContainer.innerHTML = '<p class="empty-list-message">Aramanızla eşleşen bayi e-postası bulunamadı.</p>';
         return;
    }
    
    if(Object.keys(storeEmails).length === 0) {
        listContainer.innerHTML = '<p class="empty-list-message">Henüz hiç bayi e-postası eklenmedi.</p>';
        return;
    }

    filteredEntries.sort((a, b) => a[0].localeCompare(b[0])).forEach(([kodu, email]) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'email-manager-item';
        itemDiv.dataset.kodu = kodu;
        itemDiv.innerHTML = `
            <span class="email-manager-code">${kodu}</span>
            <input type="email" class="email-manager-input" value="${email}">
            <div class="email-manager-actions">
                <button class="btn-success btn-sm" data-action="save-email" data-kodu="${kodu}" title="Değişikliği Kaydet"><i class="fas fa-save"></i></button>
                <button class="btn-danger btn-sm" data-action="delete-email" data-kodu="${kodu}" title="Bu Kaydı Sil"><i class="fas fa-trash"></i></button>
            </div>
        `;
        listContainer.appendChild(itemDiv);
    });
}

/**
 * Arayüze yeni bir e-posta ekleme satırı ekler.
 */
export function addNewEmailUI() {
    const listContainer = document.getElementById('email-manager-list');
    if (document.querySelector('.email-manager-item.new-item')) {
        document.querySelector('.email-manager-item.new-item .email-manager-code-input').focus();
        return;
    }
    const itemDiv = document.createElement('div');
    itemDiv.className = 'email-manager-item new-item';
    itemDiv.dataset.kodu = 'new_item';

    itemDiv.innerHTML = `
        <input type="text" class="email-manager-code-input" placeholder="Bayi Kodu">
        <input type="email" class="email-manager-input" placeholder="E-posta Adresi">
        <div class="email-manager-actions">
            <button class="btn-success btn-sm" data-action="save-new-email" title="Yeni Kaydı Ekle"><i class="fas fa-check"></i></button>
            <button class="btn-danger btn-sm" data-action="cancel-new-email" title="İptal Et"><i class="fas fa-times"></i></button>
        </div>`;
    listContainer.prepend(itemDiv);
    itemDiv.querySelector('.email-manager-code-input').focus();
}

/**
 * Seçilen .txt dosyasını işleyerek toplu e-posta yüklemesi yapar.
 * @param {Event} event Dosya seçme olayı.
 * @param {object} auth Firebase auth nesnesi.
 * @param {object} database Firebase database nesnesi.
 */
export function handleBulkEmailUpload(event, auth, database) {
    const file = event.target.files[0];
    if (!file) return;
    if (!auth.currentUser || !database) { alert("Bu işlem için sisteme giriş yapmalısınız."); return; }

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const text = e.target.result;
            const lines = text.split('\n');
            const newEmailData = {};
            let count = 0;
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const kodu = parts[0];
                    const email = parts[1];
                    if (kodu && email && email.includes('@')) {
                        newEmailData[kodu] = email;
                        count++;
                    }
                }
            });
            
            if(count === 0) {
                alert("Dosya okundu ancak geçerli 'bayikodu e-posta' formatında satır bulunamadı.");
                return;
            }

            if (confirm(`${count} adet e-posta bulundu. Bu işlem buluttaki mevcut tüm bayi e-posta listesinin üzerine yazılacaktır. Devam etmek istiyor musunuz?`)) {
                await database.ref('storeEmails').set(newEmailData);
                storeEmails = newEmailData;
                alert('Toplu e-posta yüklemesi başarıyla tamamlandı!');
                renderBayiManager();
            }

        } catch (error) {
            alert('Dosya okunurken veya işlenirken bir hata oluştu!');
            console.error("Toplu e-posta yükleme hatası:", error);
        }
    };
    reader.readAsText(file);
    event.target.value = null;
}

/**
 * Bayi Yöneticisi paneli içindeki tüm tıklama olaylarını yönetir.
 * @param {Event} event Tıklama olayı.
 * @param {object} auth Firebase auth nesnesi.
 * @param {object} database Firebase database nesnesi.
 */
export async function handleBayiManagerClick(event, auth, database) {
    const target = event.target.closest('button[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    const itemDiv = target.closest('.email-manager-item');

    switch(action) {
        case 'save-email':
            await saveEmail(itemDiv, auth, database);
            break;
        case 'delete-email':
            await deleteEmail(itemDiv.dataset.kodu, auth, database);
            break;
        case 'save-new-email':
            await saveNewEmail(itemDiv, auth, database);
            break;
        case 'cancel-new-email':
            itemDiv.remove();
            break;
    }
}

// --- Modül İçi Yardımcı Fonksiyonlar (Export edilmeyenler) ---

async function saveEmail(itemDiv, auth, database) {
    if (!auth.currentUser || !database) { alert("Bu işlem için sisteme giriş yapmalısınız."); return; }
    
    const kodu = itemDiv.dataset.kodu;
    const emailInput = itemDiv.querySelector('.email-manager-input');
    const newEmail = emailInput.value.trim();
    if (!newEmail) { alert("E-posta alanı boş bırakılamaz."); return; }
    
    try {
        await database.ref(`storeEmails/${kodu}`).set(newEmail);
        storeEmails[kodu] = newEmail;
        
        emailInput.style.border = '2px solid var(--success)';
        setTimeout(() => { emailInput.style.border = '1px solid var(--border)'; }, 2000);

    } catch (error) {
        alert("E-posta kaydedilirken bir hata oluştu: " + error.message);
    }
}

async function deleteEmail(kodu, auth, database) {
     if (!auth.currentUser || !database) { alert("Bu işlem için sisteme giriş yapmalısınız."); return; }
     if (confirm(`'${kodu}' kodlu bayiye ait e-postayı silmek istediğinizden emin misiniz?`)) {
         try {
             await database.ref(`storeEmails/${kodu}`).remove();
             delete storeEmails[kodu];
             document.querySelector(`.email-manager-item[data-kodu="${kodu}"]`).remove();
         } catch(error) {
             alert("E-posta silinirken bir hata oluştu: " + error.message);
         }
     }
}

async function saveNewEmail(newItemDiv, auth, database) {
     const codeInput = newItemDiv.querySelector('.email-manager-code-input');
     const emailInput = newItemDiv.querySelector('.email-manager-input');
     const newCode = codeInput.value.trim();
     const newEmail = emailInput.value.trim();

     if (!newCode || !newEmail) {
         alert("Bayi kodu ve e-posta alanları boş bırakılamaz.");
         return;
     }
    if (storeEmails[newCode]) {
        alert("Bu bayi kodu zaten mevcut. Lütfen listeden güncelleyin.");
        return;
    }
    
    newItemDiv.dataset.kodu = newCode;
    await saveEmail(newItemDiv, auth, database);
    renderBayiManager(); // Listeyi yeniden çizerek yeni eklenen öğeyi normal formata çevirir
}