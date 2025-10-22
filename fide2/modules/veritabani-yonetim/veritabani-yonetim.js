// GÜNCELLENDİ: (function() { ... })() sarmalayıcısı kaldırıldı.

// --- YÖNETİM PANELİ ANA KODLARI ---
let pbInstance = null;
let allStores = [];
let selectedStoreForDeletion = null;

// GÜNCELLENDİ: 'export' anahtar kelimesi eklendi.
export async function initializeVeritabaniYonetimModule(pb) {
    pbInstance = pb;
    showLoading(true, "Veritabanı Yönetim modülü yükleniyor...");
    
    try {
        if (pbInstance && pbInstance.authStore.isValid) {
            await loadInitialData();
            setupModuleEventListeners();
            populateTableManagement();
        } else {
            const container = document.getElementById('module-container');
            if(container) container.innerHTML = '<p style="text-align:center;">Bu modülü kullanmak için lütfen sisteme giriş yapın.</p>';
        }
    } catch (error) {
        handleError(error, "Modül başlatılırken bir hata oluştu.");
    } finally {
        showLoading(false);
    }
}

async function loadInitialData() {
    try {
        allStores = await pbInstance.collection('bayiler').getFullList({ sort: 'bayiAdi' });
    } catch (error) {
        handleError(error, "Bayi listesi yüklenemedi.");
        allStores = [];
    }
}

function setupModuleEventListeners() {
    // GÜNCELLENDİ: Olay dinleyicilerinin tekrar eklenmesini önlemek için anahtar kullanıldı.
    const listenerKey = 'veritabaniYonetimListenersAttached';
    if (document.body.dataset[listenerKey]) return;
    document.body.dataset[listenerKey] = 'true';

    document.getElementById('bayi-arama-silme-input').addEventListener('keyup', searchStoreForDeletion);
    document.getElementById('sil-bayi-raporlari-btn').addEventListener('click', deleteBayiRaporlari);
    document.getElementById('indir-rapor-btn').addEventListener('click', downloadReport);
    document.getElementById('listele-eksik-bilgi-btn').addEventListener('click', listEksikBilgiler);
    
    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => showModal(false));
    
    // GÜNCELLENDİ: 'tablo-yukle-input' dinleyicisi de setup içine alındı.
    const uploader = document.getElementById('tablo-yukle-input');
    if (uploader) uploader.addEventListener('change', uploadTableData);
}

// --- YENİ EKLENEN FONKSİYON ---
async function deleteCurrentMonthAudits() {
    showLoading(true, "Mevcut ayın raporları kontrol ediliyor...");
    try {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstDayOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
        const monthNames = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
        const currentMonthName = monthNames[today.getMonth()];

        // PocketBase için tarihleri doğru formatta string'e çevir
        const firstDayISO = firstDayOfMonth.toISOString().split('T')[0] + ' 00:00:00';
        const firstDayOfNextMonthISO = firstDayOfNextMonth.toISOString().split('T')[0] + ' 00:00:00';

        const reports = await pbInstance.collection('denetim_raporlari').getFullList({
            filter: `denetimTamamlanmaTarihi >= "${firstDayISO}" && denetimTamamlanmaTarihi < "${firstDayOfNextMonthISO}"`,
            fields: 'id'
        });

        if (reports.length === 0) {
            alert(`Bu ay (${currentMonthName}) silinecek denetim raporu bulunamadı.`);
            return;
        }

        if (!confirm(`DİKKAT! ${currentMonthName} ayına ait ${reports.length} adet denetim raporu kalıcı olarak silinecektir. Bu işlem geri alınamaz. Emin misiniz?`)) {
            return;
        }
        
        showLoading(true, `${reports.length} adet rapor siliniyor...`);

        const deletePromises = reports.map(report => pbInstance.collection('denetim_raporlari').delete(report.id));
        await Promise.all(deletePromises);
        alert(`${currentMonthName} ayına ait ${reports.length} adet rapor başarıyla silindi. Denetim takip sayacı sıfırlandı.`);

    } catch (error) {
        handleError(error, "Bu ayın raporları silinirken hata oluştu.");
    } finally {
        showLoading(false);
    }
}


async function resetTamamlanmaDurumu() {
    if (!confirm("DİKKAT! Bu işlem TÜM raporların 'Tamamlanma Tarihi' bilgisini silecektir. Raporların içeriği silinmez. Bu, tüm bayilerin 'denetlenmemiş' olarak görünmesini sağlar. Emin misiniz?")) return;
    showLoading(true, "Rapor durumları sıfırlanıyor...");
    try {
        const reports = await pbInstance.collection('denetim_raporlari').getFullList({ filter: 'denetimTamamlanmaTarihi != null', fields: 'id' });
        if (reports.length === 0) { alert("Durumu sıfırlanacak rapor bulunamadı."); return; }
        const updatePromises = reports.map(report => pbInstance.collection('denetim_raporlari').update(report.id, { 'denetimTamamlanmaTarihi': null }));
        await Promise.all(updatePromises);
        alert(`${reports.length} adet raporun tamamlanma durumu başarıyla sıfırlandı.`);
    } catch (error) {
        handleError(error, "Tamamlanma durumu sıfırlanırken hata oluştu.");
    } finally {
        showLoading(false);
    }
}

function searchStoreForDeletion(e) {
    const filter = e.target.value.toLowerCase().trim();
    const listDiv = document.getElementById('bayi-arama-sonuc-listesi');
    listDiv.innerHTML = '';
    selectedStoreForDeletion = null;
    document.getElementById('sil-bayi-raporlari-btn').disabled = true;

    if (filter === "") return;
    const filteredStores = allStores.filter(store =>
        (store.bayiAdi && store.bayiAdi.toLowerCase().includes(filter)) ||
        (store.bayiKodu && String(store.bayiKodu).toLowerCase().includes(filter))
    );

    filteredStores.slice(0, 10).forEach(store => {
        const item = document.createElement('div');
        item.className = 'bayi-item';
        item.textContent = `${store.bayiAdi} (${store.bayiKodu})`;
        // GÜNCELLENDİ: onclick, addEventListener olarak değiştirildi
        item.addEventListener('click', () => selectStoreForDeletion(store));
        listDiv.appendChild(item);
    });
}

function selectStoreForDeletion(store) {
    selectedStoreForDeletion = store;
    document.getElementById('bayi-arama-silme-input').value = `${store.bayiAdi} (${store.bayiKodu})`;
    document.getElementById('bayi-arama-sonuc-listesi').innerHTML = '';
    document.getElementById('sil-bayi-raporlari-btn').disabled = false;
}

async function deleteBayiRaporlari() {
    if (!selectedStoreForDeletion) return;
    const confirmation = prompt(`GERİ ALINAMAZ İŞLEM! '${selectedStoreForDeletion.bayiAdi}' adlı bayiye ait TÜM denetim raporlarını kalıcı olarak silmek için 'SİL' yazın.`);
    if (confirmation !== 'SİL') { alert("İşlem iptal edildi."); return; }

    showLoading(true, `'${selectedStoreForDeletion.bayiAdi}' raporları siliniyor...`);
    try {
        const reports = await pbInstance.collection('denetim_raporlari').getFullList({ filter: `bayi = "${selectedStoreForDeletion.id}"`, fields: 'id' });
        if (reports.length === 0) { alert("Bu bayiye ait silinecek rapor bulunamadı."); return; }
        const deletePromises = reports.map(report => pbInstance.collection('denetim_raporlari').delete(report.id));
        await Promise.all(deletePromises);
        alert(`${reports.length} adet rapor başarıyla silindi.`);
    } catch (error) {
        handleError(error, "Bayi raporları silinirken hata oluştu.");
    } finally {
        selectedStoreForDeletion = null;
        document.getElementById('bayi-arama-silme-input').value = '';
        document.getElementById('sil-bayi-raporlari-btn').disabled = true;
        showLoading(false);
    }
}

function downloadReport() {
    const options = document.querySelectorAll('#export-options input:checked');
    if (options.length === 0) { alert("Lütfen indirmek için en az bir bilgi türü seçin."); return; }
    
    let headersSet = new Set();
    options.forEach(opt => {
        switch(opt.value) {
            case 'bayiAdi': headersSet.add('Bayi Adı'); break;
            case 'kod+isim': headersSet.add('Bayi Kodu').add('Bayi Adı'); break;
            case 'kod+mail': headersSet.add('Bayi Kodu').add('Mail Adresi'); break;
            case 'il+isim': headersSet.add('İl').add('Bayi Adı'); break;
            case 'il+kod+isim': headersSet.add('İl').add('Bayi Kodu').add('Bayi Adı'); break;
        }
    });
    const headers = Array.from(headersSet);
    const data = [headers];

    allStores.forEach(store => {
        const row = headers.map(header => {
            if (header === 'İl') return store.sehir || '';
            if (header === 'Bayi Kodu') return store.bayiKodu || '';
            if (header === 'Bayi Adı') return store.bayiAdi || '';
            if (header === 'Mail Adresi') return store.email || '';
            return '';
        });
        data.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bayi Listesi");
    XLSX.writeFile(wb, "Bayi_Bilgi_Raporu.xlsx");
}

function listEksikBilgiler() {
    const options = document.querySelectorAll('#quality-check-options input:checked');
    const resultsDiv = document.getElementById('eksik-bilgi-sonuc');
    resultsDiv.innerHTML = '';
    if (options.length === 0) { alert("Lütfen kontrol etmek için en az bir kriter seçin."); return; }

    let resultsHtml = '';
    options.forEach(opt => {
        const checkType = opt.value;
        let missing = [];
        let title = '';
        if (checkType === 'email') { title = 'E-posta Adresi Olmayanlar'; missing = allStores.filter(s => !s.email || s.email.trim() === ''); }
        else if (checkType === 'yonetmen') { title = 'Bayi Yönetmeni Atanmamışlar'; missing = allStores.filter(s => !s.yonetmen || s.yonetmen.trim() === ''); }
        else if (checkType === 'bolge') { title = 'Bölge Bilgisi Olmayanlar'; missing = allStores.filter(s => !s.bolge || s.bolge.trim() === ''); }

        resultsHtml += `<h4>${title} (${missing.length} adet)</h4>`;
        if (missing.length > 0) {
            resultsHtml += `<ul>${missing.map(s => `<li>${s.bayiAdi} (${s.bayiKodu})</li>`).join('')}</ul>`;
        } else { resultsHtml += '<p>Bu kritere uyan eksik bilgili bayi bulunamadı.</p>'; }
    });
    resultsDiv.innerHTML = resultsHtml;
}

function populateTableManagement() {
    const tables = [
        { name: 'users', desc: 'Sisteme giriş yapan kullanıcılar.', impact: 'Silinirse <strong>kimse giriş yapamaz.</strong>' },
        { name: 'bayiler', desc: 'Tüm bayilerin ana listesi.', impact: 'Silinirse <strong>hiçbir bayi görünmez.</strong>' },
        { name: 'denetim_raporlari', desc: 'Yapılmış tüm denetimlerin cevapları.', impact: 'Silinirse <strong>tüm denetim geçmişi kaybolur.</strong>' },
        { name: 'excel_verileri', desc: 'Yüklenen DiDe ve FiDe puanları.', impact: 'Silinirse puan tabloları boş çıkar.' },
        { name: 'ayarlar', desc: 'Tüm denetim soruları ve sistem ayarları.', impact: 'Silinirse <strong>denetim formu boşalır.</strong>' },
        { name: 'denetim_geri_alinanlar', desc: 'İptal edilen denetimlerin kaydı.', impact: 'Temizlenmesi sorun teşkil etmez.' },
        // YENİ EYLEM BURAYA EKLENDİ
        { 
            name: 'Sadece Bu Ayın Denetimlerini Sil',
            desc: 'Mevcut ay içinde tamamlanmış tüm denetim raporlarını kalıcı olarak siler.', 
            impact: 'İçinde bulunulan ayın denetim sayacı sıfırlanır, geçmiş aylara dokunulmaz.',
            isAction: true,
            action: deleteCurrentMonthAudits,
            btnClass: 'btn-danger', // Tehlikeli bir işlem olduğu için kırmızı
            btnIcon: 'fa-calendar-times', // Takvim ve çarpı ikonu
            btnTitle: 'Bu Ayı Sil'
        },
        { 
            name: 'Rapor Tamamlanma Durumları', 
            desc: 'Tüm raporların "Tamamlanma Tarihi" bilgisini sıfırlar.', 
            impact: 'Tüm bayilerin denetim durumu "denetlenmemiş" olarak değişir.',
            isAction: true,
            action: resetTamamlanmaDurumu,
            btnClass: 'btn-warning',
            btnIcon: 'fa-history',
            btnTitle: 'Sıfırla'
        }
    ];
    const tbody = document.querySelector('#tablo-yonetim-tablosu tbody');
    tbody.innerHTML = '';
    tables.forEach(table => {
        const row = document.createElement('tr');

        if (table.isAction) {
            row.innerHTML = `
                <td><strong>${table.name}</strong></td>
                <td>${table.desc}</td>
                <td>${table.impact}</td>
                <td>
                    <div class="table-actions">
                        <button class="${table.btnClass} btn-sm" title="${table.btnTitle}"><i class="fas ${table.btnIcon}"></i></button>
                    </div>
                </td>
            `;
            // GÜNCELLENDİ: onclick, addEventListener olarak değiştirildi
            row.querySelector('button').addEventListener('click', table.action);
        } else {
            row.innerHTML = `
                <td><strong>${table.name}</strong></td>
                <td>${table.desc}</td>
                <td>${table.impact}</td>
                <td>
                    <div class="table-actions">
                        <button class="btn-danger btn-sm" title="Sil"><i class="fas fa-trash"></i></button>
                        <button class="btn-success btn-sm" title="Yükle"><i class="fas fa-upload"></i></button>
                    </div>
                </td>
            `;
            // GÜNCELLENDİ: onclick, addEventListener olarak değiştirildi
            row.querySelector('.btn-danger').addEventListener('click', () => deleteTable(table.name));
            row.querySelector('.btn-success').addEventListener('click', () => {
                const uploader = document.getElementById('tablo-yukle-input');
                uploader.dataset.collection = table.name;
                uploader.click();
            });
        }
        tbody.appendChild(row);
    });
    // GÜNCELLENDİ: Bu dinleyici 'setupModuleEventListeners' içine taşındı
    // document.getElementById('tablo-yukle-input').addEventListener('change', uploadTableData);
}

async function deleteTable(collectionName) {
    const confirmation = prompt(`ÇOK TEHLİKELİ İŞLEM! '${collectionName}' tablosundaki TÜM verileri kalıcı olarak silmek için '${collectionName.toUpperCase()}' yazın.`);
    if (confirmation !== collectionName.toUpperCase()) { alert("Onay metni yanlış. İşlem iptal edildi."); return; }
    
    showLoading(true, `'${collectionName}' tablosu siliniyor...`);
    try {
        const records = await pbInstance.collection(collectionName).getFullList({ fields: 'id' });
        if (records.length === 0) { alert(`'${collectionName}' tablosu zaten boş.`); return; }
        
        const deletePromises = records.map(r => pbInstance.collection(collectionName).delete(r.id));
        await Promise.all(deletePromises);
        alert(`'${collectionName}' tablosundaki ${records.length} adet kayıt başarıyla silindi.`);
    } catch (error) {
        handleError(error, `'${collectionName}' silinirken hata oluştu.`);
    } finally {
        showLoading(false);
    }
}

function uploadTableData(event) {
    const file = event.target.files[0];
    const collectionName = event.target.dataset.collection;
    if (!file || !collectionName) return;

    if (!confirm(`'${collectionName}' tablosuna '${file.name}' dosyasındaki veriler eklenecektir. Bu işlem mevcut verileri SİLMEZ, üzerine ekleme yapar. Devam etmek istiyor musunuz?`)) {
        event.target.value = null; return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!Array.isArray(data)) throw new Error("JSON dosyası bir dizi (array) içermelidir.");
            
            showLoading(true, `'${collectionName}' tablosuna ${data.length} kayıt yükleniyor...`);
            for (const item of data) {
                ['id', 'collectionId', 'collectionName', 'created', 'updated', 'expand'].forEach(key => delete item[key]);
                await pbInstance.collection(collectionName).create(item);
            }
            alert(`'${collectionName}' tablosuna ${data.length} adet kayıt başarıyla yüklendi.`);
        } catch (error) {
            handleError(error, "Tablo yüklenirken hata oluştu.");
        } finally {
            showLoading(false);
            event.target.value = null;
        }
    };
    reader.readAsText(file);
}

// --- Yardımcı Fonksiyonlar ---
function showLoading(show, message = "İşlem yapılıyor...") {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.querySelector('p').textContent = message;
        overlay.style.display = show ? 'flex' : 'none';
    }
}

function showModal(show, title = '', body = '') {
    const modal = document.getElementById('modal-container');
    if (modal) {
        if (show) {
            document.getElementById('modal-title').innerHTML = title;
            document.getElementById('modal-body').innerHTML = body;
        }
        modal.style.display = show ? 'flex' : 'none';
    }
}

function handleError(error, userMessage) {
    console.error(userMessage, error);
    
    const errorMessage = (error.message || '').toLowerCase();
    if (errorMessage.includes('relation') || errorMessage.includes('reference')) {
        alert(`İşlem Başarısız!\n\n${userMessage}\n\nSebep: Bu tablodaki veriler, başka bir tablo (örneğin 'denetim_raporlari') tarafından kullanılıyor. Veri bütünlüğünü korumak için bu silme işlemi engellendi.\n\nÇözüm: Önce bu tabloya bağlı olan diğer tablodaki verileri silmeniz gerekmektedir.`);
    } else {
        alert(`${userMessage}: ${error.message}`);
    }
}

// GÜNCELLENDİ: 'window.initialize...' satırı kaldırıldı.