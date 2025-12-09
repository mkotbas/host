// PocketBase bağlantısını global pencere nesnesinden alıyoruz
const pb = window.pb;

// DOM Yüklendiğinde çalışacak ana fonksiyon
document.addEventListener('DOMContentLoaded', () => {
    // Gerekli elementleri seçelim
    const userSelect = document.getElementById('userSelect');
    const deleteButton = document.getElementById('deleteUserBtn');
    const confirmCheckbox = document.getElementById('confirmDelete');
    const logsContainer = document.getElementById('deleteLogs');
    const modal = document.getElementById('deleteModal');
    const openModalBtn = document.getElementById('openDeleteModalBtn');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

    // Eğer bu sayfada bu elementler yoksa hata vermesin diye kontrol
    if (!userSelect || !deleteButton) return;

    // Kullanıcıları Listeleme Fonksiyonu
    async function loadUsers() {
        try {
            const users = await pb.collection('users').getFullList({
                sort: 'name',
            });

            // Select kutusunu temizle
            userSelect.innerHTML = '<option value="">-- Bir kullanıcı seçin --</option>';

            users.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${user.name || user.username} (${user.email})`;
                userSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Kullanıcılar yüklenirken hata:', error);
            alert('Kullanıcı listesi yüklenemedi.');
        }
    }

    // Modal Açma/Kapama İşlemleri
    if (openModalBtn) {
        openModalBtn.addEventListener('click', () => {
            modal.style.display = 'flex';
            loadUsers(); // Modal açılınca listeyi tazele
            resetModal();
        });
    }

    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }
    
    // Modal dışına tıklayınca kapatma
    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Modalı sıfırlama fonksiyonu
    function resetModal() {
        logsContainer.innerHTML = '';
        logsContainer.style.display = 'none';
        confirmCheckbox.checked = false;
        confirmDeleteBtn.disabled = true;
        userSelect.value = "";
    }

    // Checkbox değişince butonu aktif/pasif yap
    confirmCheckbox.addEventListener('change', (e) => {
        confirmDeleteBtn.disabled = !e.target.checked || !userSelect.value;
    });

    userSelect.addEventListener('change', () => {
        confirmDeleteBtn.disabled = !confirmCheckbox.checked || !userSelect.value;
    });

    // Log yazdırma yardımcısı
    function addLog(message, type = 'info') {
        logsContainer.style.display = 'block';
        const logEntry = document.createElement('div');
        logEntry.style.padding = '5px';
        logEntry.style.marginBottom = '2px';
        logEntry.style.fontSize = '14px';
        
        if (type === 'error') {
            logEntry.style.color = '#dc3545';
            logEntry.style.backgroundColor = '#f8d7da';
        } else if (type === 'success') {
            logEntry.style.color = '#198754';
        } else {
            logEntry.style.color = '#555';
        }

        logEntry.textContent = message;
        logsContainer.appendChild(logEntry);
        logsContainer.scrollTop = logsContainer.scrollHeight; // Otomatik aşağı kaydır
    }

    // --- KRİTİK SİLME İŞLEMİ ---
    confirmDeleteBtn.addEventListener('click', async () => {
        const userId = userSelect.value;
        const userName = userSelect.options[userSelect.selectedIndex].text;

        if (!userId) return;

        // Butonları kilitle
        confirmDeleteBtn.disabled = true;
        userSelect.disabled = true;
        logsContainer.innerHTML = ''; // Logları temizle

        addLog(`İşlem başlatılıyor: ${userName}`, 'info');

        try {
            // ADIM 1: Denetim Raporlarını Sil
            addLog("Adım 1/4: Kullanıcıya ait denetim raporları aranıyor...", 'info');
            
            // Kullanıcıya ait raporları bul
            const reports = await pb.collection('denetim_raporlari').getFullList({
                filter: `kullanici = "${userId}"`
            });

            if (reports.length > 0) {
                addLog(`${reports.length} adet rapor bulundu. Siliniyor...`, 'info');
                
                // Tek tek sil (Toplu silme hatasını önlemek için)
                for (const report of reports) {
                    await pb.collection('denetim_raporlari').delete(report.id);
                }
                addLog("Raporlar başarıyla silindi.", 'success');
            } else {
                addLog("Kullanıcıya ait denetim raporu bulunamadı.", 'info');
            }

            // ADIM 2: Geri Alınanlar / Arşiv Tablosunu Temizle (HATA BURADAYDI, GÜNCELLENDİ)
            addLog("Adım 2/4: İlişkili arşiv/geri alma kayıtları kontrol ediliyor...", 'info');
            
            try {
                // Burada 'denetim_geri_alinanlar' tablosunda bu kullanıcıya ait kayıt var mı bakıyoruz.
                // Not: Tablo adı veya alan adı farklıysa burası yine hata verebilir ama
                // en yaygın 'kullanici' ilişkisini deniyoruz.
                const trashRecords = await pb.collection('denetim_geri_alinanlar').getFullList({
                    filter: `kullanici = "${userId}"`
                });

                if (trashRecords.length > 0) {
                    addLog(`${trashRecords.length} adet arşiv/çöp kaydı bulundu. Temizleniyor...`, 'info');
                    for (const trash of trashRecords) {
                        await pb.collection('denetim_geri_alinanlar').delete(trash.id);
                    }
                    addLog("Arşiv kayıtları temizlendi.", 'success');
                } else {
                    addLog("Arşiv tablosunda bu kullanıcıya ait kayıt yok.", 'info');
                }
            } catch (archiveError) {
                console.warn("Arşiv temizleme uyarısı (Önemsiz olabilir):", archiveError);
                addLog("Arşiv tablosu boş veya erişim yok, devam ediliyor...", 'info');
            }

            // ADIM 3: Bayi Atamalarını Kaldır (İlişkiyi kopar)
            addLog(`Adım 3/4: '${userName}' kullanıcısına atanmış bayiler aranıyor...`, 'info');
            
            // Bu kullanıcıya atanmış bayileri bul
            const dealers = await pb.collection('bayi_listesi').getFullList({
                filter: `saha_sorumlusu = "${userId}"`
            });

            if (dealers.length > 0) {
                addLog(`${dealers.length} adet bayi ataması kaldırılıyor...`, 'info');
                
                // Her bayi için güncelleme yap
                for (const dealer of dealers) {
                    // saha_sorumlusu alanını boşalt (null veya "")
                    await pb.collection('bayi_listesi').update(dealer.id, {
                        saha_sorumlusu: null
                    });
                }
                addLog(`${dealers.length} adet bayi ataması başarıyla kaldırıldı.`, 'success');
            } else {
                addLog("Bu kullanıcıya atanmış bayi bulunamadı.", 'info');
            }

            // ADIM 4: Kullanıcıyı Sil
            addLog(`Adım 4/4: '${userName}' kullanıcısı sistemden siliniyor...`, 'info');
            await pb.collection('users').delete(userId);

            addLog("İŞLEM BAŞARILI: Kullanıcı ve tüm verileri temizlendi.", 'success');
            
            // Başarılı olduğunda kısa bir süre sonra modalı kapat ve yenile
            setTimeout(() => {
                alert("Kullanıcı başarıyla silindi!");
                modal.style.display = 'none';
                loadUsers(); // Listeyi yenile
                // Sayfayı yenilemek isterseniz: location.reload();
            }, 1000);

        } catch (err) {
            console.error("Silme işlemi hatası:", err);
            
            // Hata mesajını kullanıcıya göster
            let errorMessage = "Bilinmeyen bir hata oluştu.";
            if (err.data && err.data.message) {
                errorMessage = err.data.message;
            } else if (err.message) {
                errorMessage = err.message;
            }

            addLog(`HATA: ${errorMessage}`, 'error');
            addLog("Lütfen bu ekranın görüntüsünü alıp geliştiriciye iletin.", 'error');
            
            // Butonları tekrar aktif et ki tekrar deneyebilsin
            confirmDeleteBtn.disabled = false;
            userSelect.disabled = false;
        }
    });

    // Sayfa açıldığında listeyi yükle
    loadUsers();
});