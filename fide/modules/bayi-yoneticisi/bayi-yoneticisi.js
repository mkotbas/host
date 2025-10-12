// --- Global Değişkenler ---
let allBayiler = []; // Artık sadece e-postaları değil, tüm bayi verilerini tutacağız.
let pbInstance; // PocketBase nesnesi

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeBayiYoneticisiModule(pb) {
    pbInstance = pb; // Admin.js'den gelen PocketBase nesnesini al

    if (pbInstance && pbInstance.authStore.isValid) {
        setupModuleEventListeners();
        await loadBayilerData();
        renderEmailManager();
    } else {
        document.getElementById('email-manager').innerHTML = '<p class="empty-list-message">Bu modülü kullanmak için lütfen sisteme giriş yapın.</p>';
    }
}

// PocketBase'den tüm bayileri çeken fonksiyon
async function loadBayilerData() {
    allBayiler = []; 
    if (!pbInstance || !pbInstance.authStore.isValid) return;

    try {
        // 'bayiler' tablosundaki tüm kayıtları bayi koduna göre sıralayarak getir.
        allBayiler = await pbInstance.collection('bayiler').getFullList({
            sort: '+bayiKodu',
        });
    } catch (error) {
        console.error("Buluttan bayi verileri yüklenemedi:", error);
        alert("Bayi listesi buluttan yüklenemedi. Lütfen internet bağlantınızı kontrol edin.");
    }
}

function setupModuleEventListeners() {
    if (document.body.dataset.bayiYoneticisiListenersAttached) return;
    document.body.dataset.bayiYoneticisiListenersAttached = 'true';

    document.getElementById('bulk-upload-emails-btn').addEventListener('click', () => document.getElementById('email-bulk-upload-input').click());
    document.getElementById('email-bulk-upload-input').addEventListener('change', handleBulkEmailUpload);
    document.getElementById('add-new-email-btn').addEventListener('click', addNewEmailUI);
    document.getElementById('email-search-input').addEventListener('keyup', () => renderEmailManager());
}

function renderEmailManager() {
    const listContainer = document.getElementById('email-manager-list');
    const filterText = document.getElementById('email-search-input').value.toLowerCase();
    listContainer.innerHTML = '';

    const filteredBayiler = allBayiler.filter(bayi => {
        const email = bayi.email || '';
        return bayi.bayiKodu.toLowerCase().includes(filterText) || email.toLowerCase().includes(filterText);
    });
    
    if (filteredBayiler.length === 0 && allBayiler.length > 0) {
         listContainer.innerHTML = '<p class="empty-list-message">Aramanızla eşleşen bayi bulunamadı.</p>';
         return;
    }
    
    if (allBayiler.length === 0) {
        listContainer.innerHTML = '<p class="empty-list-message">Henüz hiç bayi kaydı bulunmuyor.</p>';
        return;
    }

    filteredBayiler.forEach(bayi => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'email-manager-item';
        itemDiv.dataset.id = bayi.id; // PocketBase'in benzersiz ID'sini kullanıyoruz
        itemDiv.innerHTML = `
            <span class="email-manager-code">${bayi.bayiKodu}</span>
            <input type="email" class="email-manager-input" value="${bayi.email || ''}">
            <div class="email-manager-actions">
                <button class="btn-success btn-sm" onclick="saveEmail('${bayi.id}')" title="Değişikliği Kaydet"><i class="fas fa-save"></i></button>
                <button class="btn-danger btn-sm" onclick="clearEmail('${bayi.id}')" title="Bu Bayinin E-postasını Temizle"><i class="fas fa-trash"></i></button>
            </div>
        `;
        listContainer.appendChild(itemDiv);
    });
}

async function saveEmail(id) {
    if (!pbInstance || !pbInstance.authStore.isValid) { alert("Bu işlem için sisteme giriş yapmalısınız."); return; }
    const itemDiv = document.querySelector(`.email-manager-item[data-id="${id}"]`);
    if (!itemDiv) return;
    
    const emailInput = itemDiv.querySelector('.email-manager-input');
    const newEmail = emailInput.value.trim();

    try {
        // PocketBase'de belirtilen ID'li kaydın sadece 'email' alanını güncelle
        await pbInstance.collection('bayiler').update(id, { 'email': newEmail });

        // Arayüzdeki listeyi de anında güncelle
        const bayiInList = allBayiler.find(b => b.id === id);
        if (bayiInList) bayiInList.email = newEmail;
        
        emailInput.style.border = '2px solid var(--success-color, #16a34a)';
        setTimeout(() => { emailInput.style.border = ''; }, 2000);

    } catch (error) {
        alert("E-posta kaydedilirken bir hata oluştu: " + error.message);
        emailInput.style.border = '2px solid var(--danger, #ef4444)';
    }
}

async function clearEmail(id) {
     if (!pbInstance || !pbInstance.authStore.isValid) { alert("Bu işlem için sisteme giriş yapmalısınız."); return; }
     
     const bayi = allBayiler.find(b => b.id === id);
     if (!bayi) return;

     if (confirm(`'${bayi.bayiKodu}' kodlu bayinin e-posta adresini temizlemek istediğinizden emin misiniz? (Bayi kaydı silinmeyecektir.)`)) {
         try {
             // E-posta alanını boş bir string ile güncelliyoruz
             await pbInstance.collection('bayiler').update(id, { 'email': '' });
             bayi.email = ''; // Arayüzdeki listeyi de güncelle
             renderEmailManager(); // Listeyi yeniden çizerek değişikliği göster
         } catch(error) {
             alert("E-posta temizlenirken bir hata oluştu: " + error.message);
         }
     }
}

function addNewEmailUI() {
    const listContainer = document.getElementById('email-manager-list');
    if (document.querySelector('.email-manager-item.new-item')) {
        document.querySelector('.email-manager-item.new-item .email-manager-code-input').focus();
        alert("Önce mevcut yeni kaydı tamamlayın.");
        return;
    }
    const itemDiv = document.createElement('div');
    itemDiv.className = 'email-manager-item new-item';
    itemDiv.dataset.id = 'new-item';

    itemDiv.innerHTML = `
        <input type="text" class="email-manager-code-input" placeholder="Bayi Kodu">
        <input type="email" class="email-manager-input" placeholder="E-posta Adresi">
        <div class="email-manager-actions">
            <button class="btn-success btn-sm" onclick="saveNewBayiEmail()" title="Yeni Kaydı Ekle"><i class="fas fa-check"></i></button>
            <button class="btn-danger btn-sm" onclick="this.closest('.email-manager-item').remove()" title="İptal Et"><i class="fas fa-times"></i></button>
        </div>`;
    listContainer.prepend(itemDiv);
    itemDiv.querySelector('.email-manager-code-input').focus();
}

async function saveNewBayiEmail() {
     const newItemDiv = document.querySelector('.email-manager-item.new-item');
     if (!newItemDiv) return;
     
     const codeInput = newItemDiv.querySelector('.email-manager-code-input');
     const emailInput = newItemDiv.querySelector('.email-manager-input');
     const newCode = codeInput.value.trim();
     const newEmail = emailInput.value.trim();

     if (!newCode || !newEmail) {
         alert("Bayi kodu ve e-posta alanları boş bırakılamaz.");
         return;
     }

    try {
        // Önce bu bayi koduna sahip bir bayi var mı diye kontrol et
        const existingBayi = allBayiler.find(b => b.bayiKodu === newCode);
        
        if (existingBayi) {
            // Bayi varsa, sadece e-postasını güncelle
            await pbInstance.collection('bayiler').update(existingBayi.id, { 'email': newEmail });
        } else {
            // Bayi yoksa, yeni bir bayi kaydı oluştur
            await pbInstance.collection('bayiler').create({ 'bayiKodu': newCode, 'email': newEmail, 'bayiAdi': newCode }); // bayiAdi'na da kodu yazalım, boş kalmasın.
        }
        
        // Listeyi buluttan yeniden yükleyip arayüzü güncelle
        await loadBayilerData();
        renderEmailManager();

    } catch (error) {
        alert("Yeni kayıt oluşturulurken veya güncellenirken bir hata oluştu: " + error.message);
    }
}

function handleBulkEmailUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!pbInstance || !pbInstance.authStore.isValid) { alert("Bu işlem için sisteme giriş yapmalısınız."); return; }

    const reader = new FileReader();
    reader.onload = async function(e) {
        const loadingOverlay = document.getElementById('loading-overlay');
        try {
            const text = e.target.result;
            const lines = text.split('\n');
            const emailsToProcess = new Map();
            let count = 0;
            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const kodu = parts[0];
                    const email = parts[1];
                    if (kodu && email && email.includes('@')) {
                        emailsToProcess.set(kodu, email);
                        count++;
                    }
                }
            });
            
            if (count === 0) {
                alert("Dosya okundu ancak geçerli 'bayikodu e-posta' formatında satır bulunamadı.");
                return;
            }

            if (confirm(`${count} adet e-posta bulundu. Bu işlem, mevcut bayilerin e-postalarını GÜNCELLEYECEK ve listede olmayan bayileri YENİ OLARAK EKLEYECEKTİR. Devam etmek istiyor musunuz?`)) {
                loadingOverlay.style.display = 'flex';
                const updatePromises = [];

                for (const [bayiKodu, email] of emailsToProcess.entries()) {
                    const existingBayi = allBayiler.find(b => b.bayiKodu === bayiKodu);
                    if (existingBayi) {
                        // Bayi varsa ve e-postası farklıysa güncelleme promise'i oluştur
                        if (existingBayi.email !== email) {
                           updatePromises.push(pbInstance.collection('bayiler').update(existingBayi.id, { email }));
                        }
                    } else {
                        // Bayi yoksa oluşturma promise'i oluştur
                        updatePromises.push(pbInstance.collection('bayiler').create({ bayiKodu, email, bayiAdi: bayiKodu }));
                    }
                }
                
                await Promise.all(updatePromises); // Tüm işlemleri aynı anda yap ve bitmesini bekle
                
                alert('Toplu e-posta yüklemesi başarıyla tamamlandı!');
                await loadBayilerData();
                renderEmailManager();
            }

        } catch (error) {
            alert('Dosya okunurken veya işlenirken bir hata oluştu!');
            console.error("Toplu e-posta yükleme hatası:", error);
        } finally {
            loadingOverlay.style.display = 'none';
            event.target.value = null; // Dosya seçimini sıfırla
        }
    };
    reader.readAsText(file);
}