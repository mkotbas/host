/**
 * (Güvenli Senaryo 1 - EN KAPSAMLI VERSİYON)
 * Modal içindeki "Onayla" butonuna basıldığında çalışan ana eylem.
 * Olası tüm tabloları ve olası tüm sütun isimlerini deneyerek temizlik yapar.
 */
async function handleDeleteUserAndData_Modal() {
    const userSelect = document.getElementById('modal-kullanici-silme-select');
    const onayCheck = document.getElementById('modal-kullanici-silme-onay');
    const deleteBtn = document.getElementById('modal-action-btn');
    const resultsDiv = document.getElementById('modal-kullanici-silme-sonuc');

    const userId = userSelect.value;
    if (!userId || !onayCheck.checked) {
        alert("Lütfen bir kullanıcı seçin ve onayı işaretleyin.");
        return;
    }

    const selectedUser = allUsers.find(u => u.id === userId);
    const userName = selectedUser ? (selectedUser.name || selectedUser.email) : 'Bilinmeyen Kullanıcı';

    if (!confirm(`'${userName}' adlı kullanıcıyı ve DERİNLEMESİNE tüm verilerini silmek üzeresiniz. Bu işlem biraz uzun sürebilir. Emin misiniz?`)) {
        return;
    }

    showLoading(true, `'${userName}' için analiz ve temizlik başlatıldı...`);
    deleteBtn.disabled = true;
    userSelect.disabled = true;
    onayCheck.disabled = true;
    resultsDiv.innerHTML = 'Analiz başlatıldı...';

    // --- AKILLI TEMİZLİK FONKSİYONU ---
    // Bu fonksiyon, verilen tabloda, belirtilen Olası Sütun İsimlerinden hangisi varsa onu bulup siler.
    const cleanTableSmart = async (collectionName, potentialFields, label) => {
        let deletedTotal = 0;
        
        // Tablodaki her bir olası alan ismini (user, author, personel vb.) dene
        for (const fieldName of potentialFields) {
            try {
                // Filtreyi dinamik oluştur: örn: 'author = "user_id"'
                const records = await pbInstance.collection(collectionName).getFullList({ 
                    filter: `${fieldName} = "${userId}"`, 
                    fields: 'id' 
                });

                if (records.length > 0) {
                    resultsDiv.innerHTML += `<br>Tespit Edildi: <strong>${label}</strong> tablosunda '<strong>${fieldName}</strong>' alanında ${records.length} kayıt var. Siliniyor...`;
                    
                    // Hepsini sil
                    const deletePromises = records.map(r => pbInstance.collection(collectionName).delete(r.id));
                    await Promise.all(deletePromises);
                    
                    deletedTotal += records.length;
                    resultsDiv.innerHTML += ` <span style="color:green">Temizlendi.</span>`;
                }
            } catch (e) {
                // Hata 400 genellikle "böyle bir sütun yok" demektir, bu yüzden sessizce geçiyoruz.
                // Hata 404 "tablo yok" demektir.
            }
        }
        return deletedTotal;
    };

    try {
        // --- 1. AŞAMA: Olası Tablolar ve Sütunlar Listesi ---
        // Burası problemin çözüm noktasıdır. Olası her ihtimali ekliyoruz.
        const targets = [
            { id: 'denetim_raporlari', name: 'Denetim Raporları', fields: ['user', 'kullanici', 'personel', 'author'] },
            { id: 'denetim_geri_alinanlar', name: 'Geri Alınanlar', fields: ['user', 'original_user'] },
            { id: 'excel_verileri', name: 'Excel Verileri', fields: ['user', 'yukleyen'] },
            { id: 'bildirimler', name: 'Bildirimler', fields: ['user', 'kime', 'gonderen', 'to', 'from'] }, // Hem alıcı hem gönderici olabilir
            { id: 'mesajlar', name: 'Mesajlar/Chat', fields: ['user', 'sender', 'receiver', 'gonderen', 'alici'] },
            { id: 'satis_temsilcileri', name: 'Satış Temsilcileri', fields: ['user', 'bagli_kullanici', 'personel'] },
            { id: 'bolge_yoneticileri', name: 'Bölge Yöneticileri', fields: ['user', 'yonetici'] },
            { id: 'logs', name: 'Log Kayıtları', fields: ['user', 'actor', 'performed_by'] },
            { id: 'comments', name: 'Yorumlar', fields: ['user', 'author'] },
            { id: 'todos', name: 'Yapılacaklar', fields: ['user', 'assigned_to'] },
             // Kendi kendine referans kontrolü (Users tablosunda Gökhan başkasının yöneticisi mi?)
            { id: 'users', name: 'Alt Kullanıcılar (Yönetici Bağı)', fields: ['manager', 'yonetici', 'supervisor', 'parent'] } 
        ];

        resultsDiv.innerHTML += `<br><strong>1. Aşama:</strong> Tüm veritabanı ilişkileri taranıyor...`;

        for (const target of targets) {
            // Eğer hedef tablo 'users' ise silme değil, güncelleme yapmalıyız (Manager alanını boşa düşür)
            if (target.id === 'users') {
                 for (const fieldName of target.fields) {
                    try {
                        const subUsers = await pbInstance.collection('users').getFullList({ 
                            filter: `${fieldName} = "${userId}"`, 
                            fields: 'id' 
                        });
                        if (subUsers.length > 0) {
                            resultsDiv.innerHTML += `<br>Dikkat: Bu kullanıcı <strong>${subUsers.length}</strong> kişinin yöneticisi görünüyor. Bağlantı kesiliyor...`;
                            // Alt kullanıcıların yönetici alanını null yap
                            const updatePromises = subUsers.map(u => pbInstance.collection('users').update(u.id, { [fieldName]: null }));
                            await Promise.all(updatePromises);
                            resultsDiv.innerHTML += ` <span style="color:green">Bağlantı Kesildi.</span>`;
                        }
                    } catch (e) {}
                 }
            } else {
                // Diğer tüm tablolarda direkt silme yap
                await cleanTableSmart(target.id, target.fields, target.name);
            }
        }

        // --- 2. AŞAMA: Bayi İlişkisini Derinlemesine Kes ---
        // Sadece sorumlu_kullanici değil, belki 'yedek_sorumlu' veya 'olusturan' gibi alanlar da vardır.
        resultsDiv.innerHTML += `<br><br><strong>2. Aşama:</strong> Bayi atamaları kontrol ediliyor...`;
        
        // Bayiler tablosundaki olası kullanıcı alanları
        const bayiUserFields = ['sorumlu_kullanici', 'yedek_sorumlu', 'olusturan', 'creator', 'user'];
        let bayiFixedCount = 0;

        for (const field of bayiUserFields) {
            try {
                const bayiler = await pbInstance.collection('bayiler').getFullList({ filter: `${field} = "${userId}"`, fields: 'id' });
                if (bayiler.length > 0) {
                    // Update: İlgili alanı null yap
                    const updatePromises = bayiler.map(b => pbInstance.collection('bayiler').update(b.id, { [field]: null }));
                    await Promise.all(updatePromises);
                    bayiFixedCount += bayiler.length;
                }
            } catch (e) {}
        }

        if (bayiFixedCount > 0) {
            resultsDiv.innerHTML += `<br>-> ${bayiFixedCount} adet bayi ilişkisi (sorumlu/oluşturan vb.) temizlendi.`;
        } else {
            resultsDiv.innerHTML += `<br>-> İlişkili bayi bulunamadı veya zaten temiz.`;
        }
        
        // --- 3. AŞAMA: Kullanıcıyı Sil ---
        resultsDiv.innerHTML += `<br><br><strong>3. Aşama:</strong> '${userName}' sistemden siliniyor...`;
        await pbInstance.collection('users').delete(userId);
        
        resultsDiv.innerHTML += `<br><br><strong style="color: green; font-size: 1.1em;">İŞLEM BAŞARILI! Kullanıcı ve tüm bağları silindi.</strong>`;
        
        await loadInitialData();
        const newSelectHtml = allUsers.map(user => {
            if (user.id === pbInstance.authStore.model.id || user.id === userId) return '';
            return `<option value="${user.id}">${user.name || 'İsimsiz'} (${user.email})</option>`;
        }).join('');
        userSelect.innerHTML = '<option value="">-- Bir kullanıcı seçin --</option>' + newSelectHtml;

    } catch (error) {
        handleError(error, "Kullanıcı silme işlemi başarısız oldu.");
        resultsDiv.innerHTML += `<br><br><strong style="color: red;">KRİTİK HATA DEVAM EDİYOR:</strong> ${error.message}`;
        
        // Kullanıcıya kesin çözüm yolunu göster
        resultsDiv.innerHTML += `
        <br><br><div style="background:#fff3cd; color:#856404; padding:15px; border-radius:5px; border: 1px solid #ffeeba;">
            <strong>MANUEL ÇÖZÜM GEREKİYOR:</strong><br>
            Otomatik temizlik, bildiğimiz tüm tablolara baktı ancak hata devam ediyor. Bu, sistemde kodun bilmediği <strong>ÖZEL BİR TABLO</strong> olduğunu gösterir.<br><br>
            Lütfen şu adımları izleyin:<br>
            1. <strong>PocketBase Yönetim Paneline (Admin UI)</strong> giriş yapın.<br>
            2. Sol menüden <strong>'users' (Kullanıcılar)</strong> koleksiyonunu seçin.<br>
            3. Sağ üstteki <strong>'Settings' (Ayarlar)</strong> butonuna (dişli ikonu) tıklayın.<br>
            4. Açılan pencerede <strong>'Relations' (İlişkiler)</strong> sekmesine tıklayın.<br>
            5. Orada, "users" tablosuna bağlı olan diğer tabloların listesini göreceksiniz (Örn: <em>siparisler</em>, <em>logs</em> vb.).<br>
            6. O listede gördüğünüz tablonun adını bize söyleyin, koda ekleyelim.
        </div>`;

    } finally {
        showLoading(false);
        onayCheck.checked = false;
        userSelect.value = '';
        userSelect.disabled = false;
        onayCheck.disabled = false;
        const checkButtonState = () => { deleteBtn.disabled = !(userSelect.value && onayCheck.checked); };
        checkButtonState(); 
    }
}