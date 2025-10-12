// --- Global Değişkenler ---
// `pb` değişkeni, bu script'i yükleyen admin.js dosyasında zaten tanımlanmıştır.
let storeEmailRecords = []; // PocketBase'den gelen kayıtları (id dahil) saklar.
let tumBayilerRecordId = null; // Mevcut bayi listesi kaydının ID'sini saklar.

// --- MODÜL BAŞLATMA FONKSİYONU ---
async function initializeBayiYoneticisiModule() {
    // Giriş kontrolü admin.js tarafından yapıldığı için burada tekrar gerekmez.
    showLoading(true);
    setupModuleEventListeners_BayiYoneticisi();
    await loadInitialData_BayiYoneticisi();
    renderEmailManager();
    showLoading(false);
}

// --- Veri Yükleme ---
async function loadInitialData_BayiYoneticisi() {
    try {
        // E-posta listesini yükle
        storeEmailRecords = await pb.collection('storeEmails').getFullList({
            sort: 'bayiKodu', // Bayi koduna göre sıralı getir
        });

        // Tüm bayiler listesi kaydının varlığını kontrol et
        const tumBayilerListesi = await pb.collection('tumBayilerListesi').getFullList();
        if (tumBayilerListesi.length > 0) {
            tumBayilerRecordId = tumBayilerListesi[0].id;
        } else {
            tumBayilerRecordId = null;
        }

    } catch (error) {
        console.error("Bayi Yöneticisi için başlangıç verileri yüklenemedi:", error);
        alert("Veriler yüklenirken bir hata oluştu. Lütfen PocketBase sunucunuzun çalıştığından emin olun.");
    }
}

// --- Arayüz (UI) Fonksiyonları ---
function renderEmailManager() {
    const container = document.getElementById('email-list-container');
    const searchInput = document.getElementById('email-search-input');
    const searchTerm = searchInput.value.toLowerCase();

    const filteredEmails = storeEmailRecords.filter(record =>
        record.bayiKodu.toLowerCase().includes(searchTerm) ||
        record.eposta.toLowerCase().includes(searchTerm)
    );

    let tableHtml = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>Bayi Kodu</th>
                    <th>E-posta Adresi</th>
                    <th>İşlemler</th>
                </tr>
            </thead>
            <tbody>
    `;

    if (filteredEmails.length > 0) {
        filteredEmails.forEach(record => {
            tableHtml += `
                <tr data-record-id="${record.id}">
                    <td data-label="Bayi Kodu">${record.bayiKodu}</td>
                    <td data-label="E-posta Adresi">${record.eposta}</td>
                    <td data-label="İşlemler">
                        <button class="btn-icon btn-warning-icon" onclick="editEmail('${record.id}')" title="Düzenle"><i class="fas fa-edit"></i></button>
                        <button class="btn-icon btn-danger-icon" onclick="deleteEmail('${record.id}')" title="Sil"><i class="fas fa-trash-alt"></i></button>
                    </td>
                </tr>
            `;
        });
    } else {
        tableHtml += `<tr><td colspan="3">Gösterilecek e-posta bulunamadı.</td></tr>`;
    }

    tableHtml += '</tbody></table>';
    container.innerHTML = tableHtml;
}


// --- Olay Dinleyicileri (Event Listeners) ---
function setupModuleEventListeners_BayiYoneticisi() {
    // Tekrar tekrar eklenmesini önlemek için kontrol
    if (document.body.dataset.bayiYoneticisiListenersAttached) return;
    document.body.dataset.bayiYoneticisiListenersAttached = 'true';

    // Arama kutusu
    document.getElementById('email-search-input').addEventListener('input', renderEmailManager);

    // Yeni e-posta ekleme butonu
    document.getElementById('add-email-btn').addEventListener('click', addOrUpdateEmail);
    
    // Toplu e-posta yükleme
    document.getElementById('bulk-upload-input').addEventListener('change', handleBulkEmailUpload);

    // Bayi listesi yükleme
    document.getElementById('store-list-upload-input').addEventListener('change', handleStoreListUpload);
}


// --- CRUD (Ekleme, Güncelleme, Silme) İşlemleri ---
async function addOrUpdateEmail() {
    const koduInput = document.getElementById('bayi-kodu-input');
    const emailInput = document.getElementById('email-input-field');
    const recordId = koduInput.dataset.editingId; // Güncelleme için ID'yi al

    const bayiKodu = koduInput.value.trim();
    const eposta = emailInput.value.trim();

    if (!bayiKodu || !eposta) {
        alert("Bayi Kodu ve E-posta alanları boş bırakılamaz.");
        return;
    }

    showLoading(true);
    try {
        const data = { bayiKodu, eposta };

        if (recordId) {
            // Güncelleme
            await pb.collection('storeEmails').update(recordId, data);
            alert("E-posta başarıyla güncellendi.");
        } else {
            // Yeni Ekleme
            // Aynı bayi koduna sahip başka bir kayıt var mı diye kontrol et
            const existing = storeEmailRecords.find(r => r.bayiKodu === bayiKodu);
            if(existing) {
                alert(`HATA: '${bayiKodu}' bayi koduna ait bir e-posta zaten mevcut. Lütfen listeyi kontrol edin.`);
                showLoading(false);
                return;
            }
            await pb.collection('storeEmails').create(data);
            alert("Yeni e-posta başarıyla eklendi.");
        }

        // Formu temizle ve listeyi yenile
        koduInput.value = '';
        emailInput.value = '';
        koduInput.dataset.editingId = '';
        document.getElementById('add-email-btn').textContent = 'Ekle';
        
        await loadInitialData_BayiYoneticisi();
        renderEmailManager();

    } catch (error) {
        console.error("E-posta ekleme/güncelleme hatası:", error);
        alert("İşlem sırasında bir hata oluştu.");
    } finally {
        showLoading(false);
    }
}

function editEmail(recordId) {
    const record = storeEmailRecords.find(r => r.id === recordId);
    if (record) {
        const koduInput = document.getElementById('bayi-kodu-input');
        const emailInput = document.getElementById('email-input-field');
        
        koduInput.value = record.bayiKodu;
        emailInput.value = record.eposta;
        koduInput.dataset.editingId = record.id; // ID'yi sakla
        
        document.getElementById('add-email-btn').textContent = 'Güncelle';
        koduInput.focus();
    }
}

async function deleteEmail(recordId) {
    const record = storeEmailRecords.find(r => r.id === recordId);
    if (record && confirm(`'${record.bayiKodu}' kodlu bayiye ait e-postayı silmek istediğinizden emin misiniz?`)) {
        showLoading(true);
        try {
            await pb.collection('storeEmails').delete(recordId);
            alert("E-posta başarıyla silindi.");
            await loadInitialData_BayiYoneticisi();
            renderEmailManager();
        } catch (error) {
            console.error("E-posta silme hatası:", error);
            alert("Silme işlemi sırasında bir hata oluştu.");
        } finally {
            showLoading(false);
        }
    }
}

// --- Toplu Yükleme İşlemleri ---
async function handleStoreListUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading(true);
    const reader = new FileReader();
    
    reader.onload = async (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }); // Boş hücreler için varsayılan değer

            const requiredColumns = ["Bayi Kodu", "Bayi Adı", "Bölge", "Şehir", "İlçe", "Yönetmen"];
            if (!jsonData.length || !requiredColumns.every(col => jsonData[0].hasOwnProperty(col))) {
                throw new Error("Excel dosyasında gerekli sütunlar bulunamadı: " + requiredColumns.join(', '));
            }
            
            const storeList = jsonData.map(row => ({
                bayiKodu: String(row["Bayi Kodu"]).trim(),
                bayiAdi: String(row["Bayi Adı"]).trim(),
                bolge: String(row["Bölge"]).trim(),
                sehir: String(row["Şehir"]).trim(),
                ilce: String(row["İlçe"]).trim(),
                yonetmen: String(row["Yönetmen"]).trim()
            }));

            const dataToSave = {
                bayiListesi: storeList,
                sonGuncelleme: new Date().toISOString()
            };

            if (tumBayilerRecordId) {
                await pb.collection('tumBayilerListesi').update(tumBayilerRecordId, dataToSave);
            } else {
                const newRecord = await pb.collection('tumBayilerListesi').create(dataToSave);
                tumBayilerRecordId = newRecord.id;
            }
            alert(`Tüm bayiler listesi başarıyla güncellendi. ${storeList.length} bayi yüklendi.`);

        } catch (error) {
            alert(`Excel dosyası işlenirken bir hata oluştu: ${error.message}`);
            console.error("Bayi listesi yükleme hatası:", error);
        } finally {
            showLoading(false);
            event.target.value = ''; // Input'u temizle
        }
    };
    reader.readAsArrayBuffer(file);
}

async function handleBulkEmailUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!confirm("Bu işlem sunucudaki MEVCUT TÜM e-posta listesini silecek ve bu dosyayı yükleyecektir. Emin misiniz?")) {
        event.target.value = '';
        return;
    }

    showLoading(true);
    const reader = new FileReader();

    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            const lines = text.split('\n');
            const newEmails = [];

            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    const kodu = parts[0];
                    const email = parts[1];
                    if (kodu && email && email.includes('@')) {
                        newEmails.push({ bayiKodu: kodu, eposta: email });
                    }
                }
            });

            if (newEmails.length === 0) {
                throw new Error("Dosya okundu ancak geçerli 'bayikodu e-posta' formatında satır bulunamadı.");
            }

            // 1. MEVCUT TÜM E-POSTALARI SİL
            for (const record of storeEmailRecords) {
                await pb.collection('storeEmails').delete(record.id);
            }

            // 2. YENİ E-POSTALARI EKLE
            for (const emailData of newEmails) {
                await pb.collection('storeEmails').create(emailData);
            }

            alert(`Toplu e-posta yüklemesi tamamlandı. ${newEmails.length} kayıt başarıyla sunucuya yüklendi.`);
            await loadInitialData_BayiYoneticisi();
            renderEmailManager();

        } catch (error) {
            alert(`Toplu yükleme sırasında bir hata oluştu: ${error.message}`);
            console.error("Toplu e-posta yükleme hatası:", error);
        } finally {
            showLoading(false);
            event.target.value = ''; // Input'u temizle
        }
    };
    reader.readAsText(file);
}

// showLoading fonksiyonu admin.js'de zaten var, tekrar tanımlamaya gerek yok.