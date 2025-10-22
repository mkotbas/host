// Gerekli kütüphaneleri (ExcelJS) dinamik olarak yüklemek için bir yardımcı fonksiyon
// Bu fonksiyon, 'XLSX' kütüphanesinin (Excel işlemleri için) kullanılabilir olmasını sağlar.
function loadScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) {
            resolve(); // Zaten yüklenmiş
            return;
        }
        const script = document.createElement('script');
        script.src = url;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Bayi Yöneticisi Modülü
 * admin.js tarafından çağrılan ana başlatma fonksiyonu.
 */
export async function initializeBayiYoneticisiModule(pbInstance) {
    
    // Excel kütüphanesini yükle
    try {
        await loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
    } catch (error) {
        console.error('Excel kütüphanesi yüklenemedi:', error);
        alert('Raporlama ve İçe Aktarma özelliği için gerekli Excel kütüphanesi yüklenemedi. Lütfen internet bağlantınızı kontrol edin.');
    }

    // --- Global Değişkenler ve DOM Elementleri ---
    // Sık kullanılacak HTML elementlerini ve verileri burada saklıyoruz.
    const pb = pbInstance; // PocketBase bağlantısı
    let allBayiler = []; // Veritabanından çekilen tüm bayilerin tam listesi
    let allUsers = [];   // Veritabanından çekilen tüm kullanıcıların (Denetim Uzmanları) listesi

    // Ana elementler
    const container = document.getElementById('bayi-yonetici-container');
    if (!container) return; // HTML yüklenmemişse modülü durdur

    const mainTable = document.getElementById('bayi-table'); 
    const tableBody = document.getElementById('bayi-table-body');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    // Modal (Açılır Pencere) elementleri (Ekle/Düzenle)
    const modal = document.getElementById('bayi-modal');
    const modalTitle = document.getElementById('modal-title');
    const bayiForm = document.getElementById('bayi-form');
    const bayiIdInput = document.getElementById('bayi-id');
    const uzmanSelect = document.getElementById('sorumlu_kullanici');
    
    // Arama çubukları ve filtreler
    const dropdownFilter = document.getElementById('kontrol-filtresi');
    const searchInputs = document.querySelectorAll('.column-search-input');
    
    // Raporlama (Dışa Aktarma) elementleri
    const columnCheckboxesContainer = document.getElementById('column-checkboxes');
    
    // Raporlama (Dışa Aktarma) için Sütun Tanımları
    const fields = [
        { key: 'bolge', label: 'Bölge' },
        { key: 'sehir', label: 'Şehir' },
        { key: 'ilce', label: 'İlçe' },
        { key: 'bayiKodu', label: 'Bayi Kodu' },
        { key: 'bayiAdi', label: 'Bayi Adı' },
        { key: 'yonetmen', label: 'Bayi Yönetmeni' }, 
        { key: 'email', label: 'Mail' },
        { key: 'sorumlu_kullanici_email', label: 'Denetim Uzmanı' } 
    ];
    const allFieldKeys = fields.map(f => f.key);


    // --- YENİ: İçe Aktarma (Import) için Global Değişkenler ---
    
    // Eşleştirme için kullanılacak veritabanı alanları (GÜNCELLENDİ)
    //
    const dbFieldsForMapping = [
        { key: 'bayiKodu', label: 'Bayi Kodu (Zorunlu)' },
        { key: 'bayiAdi', label: 'Bayi Adı' },
        { key: 'bolge', label: 'Bölge' },
        { key: 'sehir', label: 'Şehir' },
        { key: 'ilce', label: 'İlçe' },
        { key: 'yonetmen', label: 'Bayi Yönetmeni' }, 
        { key: 'email', label: 'Mail Adresi' },
        { key: 'sorumlu_kullanici', label: 'Denetim Uzmanı (Email ile)' } 
    ];
    
    // YENİ: Zorunlu alanların listesi (GÜNCELLENDİ)
    const requiredFields = ['bayiKodu'];

    let excelHeaders = []; // Yüklenen Excel'in başlıkları (örn: ["Kod", "İsim"])
    let excelData = [];    // Yüklenen Excel'in verisi (örn: [{Kod: "123", İsim: "A Bayi"}])

    // YENİ: İçe Aktarma (Import) Modal Elementleri
    const importModal = document.getElementById('import-modal');
    const importStep1 = document.getElementById('import-step-1');
    const importStep2 = document.getElementById('import-step-2');
    const importStep3 = document.getElementById('import-step-3');
    const excelFileInput = document.getElementById('excel-file-input');
    const btnProcessExcel = document.getElementById('btn-process-excel');
    const mappingContainer = document.getElementById('mapping-container');
    const importWarning = document.getElementById('import-warning');
    const btnExecuteImport = document.getElementById('btn-execute-import');
    const importLoadingOverlay = document.getElementById('import-loading-overlay');
    const importLoadingText = document.getElementById('import-loading-text');
    const importResults = document.getElementById('import-results');


    // --- Ana Veri Yükleme Fonksiyonları ---

    async function loadModuleData() {
        showLoading(true);
        try {
            // Bayi uzmanı (sorumlu_kullanici) ataması için tüm kullanıcıları çek
            allUsers = await pb.collection('users').getFullList({ sort: 'email' });
            
            // Tüm bayileri, sorumlu kullanıcı bilgisiyle (expand) birlikte çek
            allBayiler = await pb.collection('bayiler').getFullList({
                sort: '-created',
                expand: 'sorumlu_kullanici' 
            });

            // Her bayi nesnesine, sorumlu kullanıcının e-postasını kolay erişim için ekle
            allBayiler.forEach(bayi => {
                bayi.sorumlu_kullanici_email = bayi.expand?.sorumlu_kullanici?.email || '';
            });

            populateUserDropdown(); // Ekle/Düzenle modalındaki 'Denetim Uzmanı' listesini doldur
            populateGlobalUserDropdown(); // İçe aktarma modalındaki toplu atama listesini doldur
            populateColumnCheckboxes(); // Raporlama (Dışa Aktar) alanındaki sütun seçimlerini doldur
            setupFilterListeners(); // Arama ve filtreleme dinleyicilerini kur
            applyAllFilters(); // Filtreleri uygula ve tabloyu ilk kez çiz
            
        } catch (error) {
            console.error('Veri yüklenirken hata oluştu:', error);
            alert('Bayi veya kullanıcı verileri yüklenirken bir hata oluştu. Lütfen konsolu kontrol edin.');
        } finally {
            showLoading(false);
        }
    }

    // Bayi tablosunu (HTML) çizen fonksiyon
    function renderBayiTable(bayilerToRender) {
        tableBody.innerHTML = ''; 

        if (bayilerToRender.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">Arama kriterlerine uyan bayi bulunamadı.</td></tr>';
            return;
        }

        bayilerToRender.forEach(bayi => {
            const tr = document.createElement('tr');
            
            const uzmanEmail = bayi.sorumlu_kullanici_email || ''; 
            const bayiAdi = bayi.bayiAdi || '';
            const bayiYonetmeni = bayi.yonetmen || ''; //
            const bayiEmail = bayi.email || '';
            const bolge = bayi.bolge || '';
            const sehir = bayi.sehir || '';
            const ilce = bayi.ilce || '';
            const bayiKodu = bayi.bayiKodu || '';

            tr.innerHTML = `
                <td title="${bolge}" data-column="bolge">${bolge}</td>
                <td title="${sehir}" data-column="sehir">${sehir}</td>
                <td title="${ilce}" data-column="ilce">${ilce}</td>
                <td title="${bayiKodu}" data-column="bayiKodu"><strong>${bayiKodu}</strong></td>
                <td title="${bayiAdi}" data-column="bayiAdi">${bayiAdi}</td>
                <td title="${bayiYonetmeni}" data-column="yonetmen">${bayiYonetmeni}</td> 
                <td title="${bayiEmail}" data-column="email">${bayiEmail}</td>
                <td title="${uzmanEmail}" data-column="sorumlu_kullanici_email">${uzmanEmail || '<span style="color: #999;">Atanmamış</span>'}</td>
                <td class="action-buttons" data-column="eylemler">
                    <button class="btn btn-warning btn-edit" data-id="${bayi.id}" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-delete" data-id="${bayi.id}" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;

            tr.querySelector('.btn-edit').addEventListener('click', () => handleEditBayi(bayi.id));
            tr.querySelector('.btn-delete').addEventListener('click', () => handleDeleteBayi(bayi.id));

            tableBody.appendChild(tr);
        });
        
        // Tablo her yeniden çizildiğinde, mevcut sütun görünürlük ayarını tekrar uygula
        applyColumnVisibility();
    }

    // Ekle/Düzenle modalındaki 'Denetim Uzmanı' <select> listesini doldurur
    function populateUserDropdown() {
        uzmanSelect.innerHTML = '<option value="">Atanmamış</option>'; 
        allUsers.forEach(user => {
            // Sadece admin veya client rolündekileri listele
            if (user.role === 'client' || user.role === 'admin') {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.email;
                uzmanSelect.appendChild(option);
            }
        });
    }

    // İçe aktarma modalındaki 'Toplu Denetim Uzmanı Ataması' <select> listesini doldurur
    function populateGlobalUserDropdown() {
        const globalSelect = document.getElementById('import-global-user-select');
        if (!globalSelect) return; // HTML elementi bulunamazsa dur

        globalSelect.innerHTML = '<option value="">İçe Aktarılan Tüm Bayileri Bu Kullanıcıya Ata (Opsiyonel)</option>'; // Varsayılan seçenek
        allUsers.forEach(user => {
            // Sadece admin veya client rolündekileri listele
            if (user.role === 'client' || user.role === 'admin') {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.email;
                globalSelect.appendChild(option);
            }
        });
    }


    // Raporlama alanındaki sütun checkbox'larını doldurur
    function populateColumnCheckboxes() {
        columnCheckboxesContainer.innerHTML = '';
        fields.forEach(field => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" class="column-check" value="${field.key}"> ${field.label}`;
            columnCheckboxesContainer.appendChild(label);
        });
    }


    // --- CRUD (Ekleme, Okuma, Güncelleme, Silme) Fonksiyonları ---

    function handleNewBayi() {
        bayiForm.reset(); 
        bayiIdInput.value = ''; 
        modalTitle.textContent = 'Yeni Bayi Ekle'; 
        modal.style.display = 'flex'; 
    }

    function handleEditBayi(bayiId) {
        const bayi = allBayiler.find(b => b.id === bayiId);
        if (!bayi) return;

        bayiForm.reset();
        bayiIdInput.value = bayi.id; 
        modalTitle.textContent = 'Bayi Bilgilerini Düzenle';

        document.getElementById('bayiKodu').value = bayi.bayiKodu || '';
        document.getElementById('bayiAdi').value = bayi.bayiAdi || '';
        document.getElementById('bolge').value = bayi.bolge || '';
        document.getElementById('sehir').value = bayi.sehir || '';
        document.getElementById('ilce').value = bayi.ilce || '';
        document.getElementById('yonetmen').value = bayi.yonetmen || ''; 
        document.getElementById('email').value = bayi.email || '';
        document.getElementById('sorumlu_kullanici').value = bayi.sorumlu_kullanici || ''; 
        
        modal.style.display = 'flex'; 
    }

    async function handleDeleteBayi(bayiId) {
        const bayi = allBayiler.find(b => b.id === bayiId);
        const bayiAdi = bayi ? bayi.bayiAdi : 'Bu bayi';

        if (confirm(`'${bayiAdi}' (${bayi.bayiKodu}) adlı bayiyi kalıcı olarak silmek istediğinizden emin misiniz?`)) {
            showLoading(true);
            try {
                await pb.collection('bayiler').delete(bayiId);
                await loadModuleData(); // Tabloyu yenile
            } catch (error) {
                console.error('Bayi silinirken hata:', error);
                alert('Bayi silinirken bir hata oluştu: ' + error.message);
                showLoading(false);
            }
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault(); 
        showLoading(true);

        const bayiId = bayiIdInput.value; 

        // Formdaki verileri topla (schema'ya uygun)
        const data = {
            bayiKodu: document.getElementById('bayiKodu').value,
            bayiAdi: document.getElementById('bayiAdi').value,
            bolge: document.getElementById('bolge').value,
            sehir: document.getElementById('sehir').value,
            ilce: document.getElementById('ilce').value,
            yonetmen: document.getElementById('yonetmen').value, 
            email: document.getElementById('email').value,
            sorumlu_kullanici: document.getElementById('sorumlu_kullanici').value || null 
        };
        
        if (!data.bayiKodu) {
            alert('Bayi Kodu zorunlu bir alandır. Lütfen doldurun.');
            showLoading(false);
            return;
        }

        try {
            if (bayiId) { // ID varsa güncelle
                await pb.collection('bayiler').update(bayiId, data);
            } else { // ID yoksa yeni oluştur
                await pb.collection('bayiler').create(data);
            }
            
            modal.style.display = 'none'; // Modalı kapat
            await loadModuleData(); // Tabloyu yenile
            
        } catch (error) {
            console.error('Bayi kaydedilirken hata:', error);
            // PocketBase'den gelen benzersiz (unique) alan hatasını yakala
            if (error.data?.data?.bayiKodu) {
                alert('Hata: Bu Bayi Kodu zaten başka bir bayi tarafından kullanılıyor. Lütfen farklı bir kod girin.');
            } else {
                alert('Bayi kaydedilirken bir hata oluştu: ' + error.message);
            }
            showLoading(false); 
        }
    }

    function closeModal() {
        modal.style.display = 'none';
    }


    // --- Filtreleme (Arama ve Kontrol Mekanizması) ---

    function setupFilterListeners() {
        dropdownFilter.addEventListener('change', applyAllFilters);
        searchInputs.forEach(input => {
            input.addEventListener('input', applyAllFilters);
        });
    }

    function applyAllFilters() {
        const filterValue = dropdownFilter.value;
        const searchValues = {};
        searchInputs.forEach(input => {
            searchValues[input.dataset.column] = input.value.toLowerCase();
        });

        let filteredBayiler = allBayiler.filter(bayi => {
            
            // Kontrol Mekanizması filtresi
            let passDropdown = true;
            switch (filterValue) {
                case 'no_bolge': passDropdown = !bayi.bolge; break;
                case 'no_sehir': passDropdown = !bayi.sehir; break;
                case 'no_ilce': passDropdown = !bayi.ilce; break;
                case 'no_bayiKodu': passDropdown = !bayi.bayiKodu; break;
                case 'no_bayiAdi': passDropdown = !bayi.bayiAdi; break;
                case 'no_yonetmen': passDropdown = !bayi.yonetmen; break; 
                case 'no_email': passDropdown = !bayi.email; break;
                case 'no_uzman': passDropdown = !bayi.sorumlu_kullanici_email; break;
                default: passDropdown = true;
            }

            if (!passDropdown) return false; 

            // Sütun bazlı arama filtresi
            let passSearch = true;
            for (const key in searchValues) {
                const searchTerm = searchValues[key];
                if (searchTerm === '') continue; 

                const bayiData = (bayi[key] || '').toLowerCase();
                
                if (!bayiData.includes(searchTerm)) {
                    passSearch = false; 
                    break; 
                }
            }

            return passSearch; 
        });

        renderBayiTable(filteredBayiler);
    }


    // --- Raporlama (Görüntüleme ve Excel) Fonksiyonları ---

    // Filtrelenmiş veriyi Excel'e aktarmak için hazırlayan fonksiyon
    function getFilteredDataForExport() {
        const selectedKeys = Array.from(columnCheckboxesContainer.querySelectorAll('.column-check:checked'))
            .map(cb => cb.value);

        const keysToExport = selectedKeys.length > 0 ? selectedKeys : allFieldKeys;
        const selectedHeaders = keysToExport.map(key => fields.find(f => f.key === key).label);

        // Mevcut filtreleri al (applyAllFilters ile aynı mantık)
        const filterValue = dropdownFilter.value;
        const searchValues = {};
        searchInputs.forEach(input => {
            searchValues[input.dataset.column] = input.value.toLowerCase();
        });
        
        const filteredBayiler = allBayiler.filter(bayi => {
            let passDropdown = true;
            switch (filterValue) {
                case 'no_bolge': passDropdown = !bayi.bolge; break;
                case 'no_sehir': passDropdown = !bayi.sehir; break;
                case 'no_ilce': passDropdown = !bayi.ilce; break;
                case 'no_bayiKodu': passDropdown = !bayi.bayiKodu; break;
                case 'no_bayiAdi': passDropdown = !bayi.bayiAdi; break;
                case 'no_yonetmen': passDropdown = !bayi.yonetmen; break; 
                case 'no_email': passDropdown = !bayi.email; break;
                case 'no_uzman': passDropdown = !bayi.sorumlu_kullanici_email; break;
                default: passDropdown = true;
            }
            if (!passDropdown) return false;
            
            let passSearch = true;
            for (const key in searchValues) {
                const searchTerm = searchValues[key];
                if (searchTerm === '') continue; 
                const bayiData = (bayi[key] || '').toLowerCase();
                if (!bayiData.includes(searchTerm)) {
                    passSearch = false; 
                    break;
                }
            }
            return passSearch;
        });

        // Veriyi dışa aktarım formatına (başlık:değer) çevir
        const dataForExport = filteredBayiler.map(bayi => {
            const row = {};
            keysToExport.forEach(key => {
                let value;
                if (key === 'sorumlu_kullanici_email') {
                    value = bayi.sorumlu_kullanici_email || '';
                } else {
                    value = bayi[key] || '';
                }
                const header = fields.find(f => f.key === key).label;
                row[header] = value;
            });
            return row;
        });

        return { headers: selectedHeaders, data: dataForExport };
    }

    // "Seçilenleri Görüntüle" - Ana tablodaki sütunları gizler/gösterir
    function applyColumnVisibility() {
        const selectedKeys = Array.from(columnCheckboxesContainer.querySelectorAll('.column-check:checked'))
            .map(cb => cb.value);

        // Hiçbiri seçili değilse (Resetle/Tümünü Göster durumu)
        const showAll = selectedKeys.length === 0;

        allFieldKeys.forEach(key => {
            const cells = mainTable.querySelectorAll(`[data-column="${key}"]`);
            if (showAll || selectedKeys.includes(key)) {
                cells.forEach(cell => cell.style.display = 'table-cell');
            } else {
                cells.forEach(cell => cell.style.display = 'none');
            }
        });

        // 'Eylemler' sütunu her zaman görünür olmalı
        const actionCells = mainTable.querySelectorAll('[data-column="eylemler"]');
        actionCells.forEach(cell => cell.style.display = 'table-cell');
    }

    // "Seçilenleri Excel'e Aktar"
    function handleExportExcel() {
        if (typeof XLSX === 'undefined') {
            alert('Excel dışa aktarma kütüphanesi (XLSX) yüklenemedi. Lütfen tekrar deneyin.');
            return;
        }

        const { headers, data } = getFilteredDataForExport(); 

        if (data.length === 0) {
             alert('Mevcut filtrelere uyan ve dışa aktarılacak veri bulunamadı.');
            return;
        }
        
        if (headers.length === 0) {
            alert('Lütfen dışa aktarmak için en az bir sütun seçin (veya tüm sütunlar için seçimi temizleyin).');
            return;
        }

        try {
            const ws = XLSX.utils.json_to_sheet(data);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Bayi Listesi'); 
            XLSX.writeFile(wb, 'Bayi_Listesi_Raporu.xlsx');

        } catch (error) {
            console.error('Excel oluşturulurken hata:', error);
            alert('Excel dosyası oluşturulurken bir hata oluştu.');
        }
    }


    // --- YENİ: Excel İçe Aktarma (Import) Fonksiyonları ---

    /**
     * İçe Aktarma Modalını açar ve sıfırlar (Adım 1'i gösterir)
     */
    function openImportModal() {
        // Modal state'ini sıfırla
        excelHeaders = [];
        excelData = [];
        excelFileInput.value = null; // Dosya seçimini temizle
        mappingContainer.innerHTML = '';
        importResults.innerHTML = '';
        
        const globalSelect = document.getElementById('import-global-user-select');
        if (globalSelect) {
            globalSelect.value = '';
        }

        importStep1.style.display = 'block';
        importStep2.style.display = 'none';
        importStep3.style.display = 'none';

        btnProcessExcel.disabled = true; // Dosya seçilene kadar butonu kilitle
        btnExecuteImport.disabled = true;

        importModal.style.display = 'flex';
    }

    /**
     * İçe Aktarma Modalını kapatır
     */
    function closeImportModal() {
        importModal.style.display = 'none';
        showImportLoading(false); // Yüklemeyi durdur
    }

    /**
     * Modal içi yükleme ekranını (spinner) gösterir/gizler
     */
    function showImportLoading(show, text = 'İşlem yürütülüyor...') {
        if (show) {
            importLoadingText.textContent = text;
            importLoadingOverlay.style.display = 'flex';
        } else {
            importLoadingOverlay.style.display = 'none';
        }
    }

    /**
     * Kullanıcı bir dosya seçtiğinde tetiklenir
     */
    function handleFileSelected(event) {
        if (event.target.files && event.target.files.length > 0) {
            btnProcessExcel.disabled = false; // Dosya seçildi, butonu aç
        } else {
            btnProcessExcel.disabled = true; // Dosya seçimi iptal edildi, butonu kilitle
        }
    }

    /**
     * (Adım 1 -> Adım 2) Excel dosyasını işler, başlıkları okur ve eşleştirme ekranını hazırlar.
     */
    async function processExcelFile() {
        const file = excelFileInput.files[0];
        if (!file) {
            alert('Lütfen bir Excel dosyası seçin.');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('Excel kütüphanesi (XLSX) yüklenemedi. Lütfen tekrar deneyin.');
            return;
        }

        showImportLoading(true, 'Excel dosyası okunuyor...');

        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];

                    // 1. Önce başlıkları (ilk satır) almak için array olarak oku
                    const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    if (!dataAsArray || dataAsArray.length < 1) {
                        throw new Error('Excel dosyası boş veya okunamadı.');
                    }
                    // İlk satırı 'excelHeaders' olarak al, tümünü string'e çevir
                    excelHeaders = dataAsArray.shift().map(String); 

                    // 2. Veriyi (başlıkları kullanarak) object array olarak oku
                    excelData = XLSX.utils.sheet_to_json(worksheet);

                    // Eşleştirme UI'ını bu başlıklarla doldur
                    populateMappingUI(excelHeaders);
                    
                    // Adım 1'i gizle, Adım 2'yi göster
                    importStep1.style.display = 'none';
                    importStep2.style.display = 'block';

                } catch (readError) {
                    console.error('Excel okunurken hata:', readError);
                    alert('Excel dosyası işlenirken bir hata oluştu: ' + readError.message);
                } finally {
                    showImportLoading(false);
                }
            };
            reader.onerror = (e) => {
                showImportLoading(false);
                alert('Dosya okunurken bir hata oluştu.');
            };
            reader.readAsArrayBuffer(file);

        } catch (error) {
            showImportLoading(false);
            console.error('Excel İşleme Hatası:', error);
            alert('Excel dosyası işlenirken bir hata oluştu: ' + error.message);
        }
    }

    /**
     * (Adım 2) Excel başlıkları ve DB alanları ile eşleştirme arayüzünü oluşturur.
     * (GÜNCELLENDİ: Akıllı eşleştirme kaldırıldı)
     */
    function populateMappingUI(headers) {
        mappingContainer.innerHTML = ''; // Temizle

        const optionsHtml = [
            '<option value="">Eşleştirme / Boş Geç</option>',
            ...dbFieldsForMapping.map(field => `<option value="${field.key}">${field.label}</option>`)
        ].join('');

        headers.forEach(header => {
            const row = document.createElement('div');
            row.className = 'mapping-row';

            // Akıllı eşleştirme kaldırıldı. 
            // Tüm alanlar varsayılan olarak 'Eşleştirme / Boş Geç' ile gelecek.

            row.innerHTML = `
                <label class="excel-column-label">${header} (Excel)</label>
                <i class="fas fa-arrow-right"></i>
                <select class="db-field-select form-control" data-excel-column="${header}">
                    ${optionsHtml}
                </select>
            `;

            mappingContainer.appendChild(row);
        });

        // Zorunlu alanların eşleştirilip eşleştirilmediğini kontrol et
        validateMapping();
    }

    /**
     * (Adım 2) Eşleştirmeyi doğrular. (GÜNCELLENDİ: Sadece bayiKodu kontrol ediliyor)
     */
    function validateMapping() {
        const selects = mappingContainer.querySelectorAll('.db-field-select');
        const mappedFields = new Set(); // Eşleştirilmiş veritabanı alanlarını saklar
        selects.forEach(select => {
            if (select.value) {
                mappedFields.add(select.value);
            }
        });

        // Zorunlu alanların tamamının 'mappedFields' içinde olup olmadığını kontrol et
        let allRequiredMapped = true;
        for (const field of requiredFields) {
            if (!mappedFields.has(field)) {
                allRequiredMapped = false;
                break;
            }
        }

        if (allRequiredMapped) {
            importWarning.style.display = 'none';
            btnExecuteImport.disabled = false;
        } else {
            importWarning.style.display = 'block';
            btnExecuteImport.disabled = true;
        }
    }


    /**
     * (Adım 2 -> Adım 3) Eşleştirmeyi kullanarak veriyi veritabanına aktarır (Oluşturma/Güncelleme).
     * (GÜNCELLENDİ: Hata mesajı güncellendi)
     */
    async function executeImport() {
        
        // YENİ: Başlamadan önce son bir doğrulama yap
        if (btnExecuteImport.disabled) {
            alert('Lütfen devam etmeden önce tüm zorunlu alanları eşleştirin.');
            return;
        }

        showImportLoading(true, 'Veriler işleniyor ve veritabanına aktarılıyor...');

        // 1. Eşleştirmeyi (mapping) al
        // (örn: { bayiKodu: "BAYİ KODU EXCEL", bayiAdi: "Bayi Adı", ... })
        const mapping = {};
        mappingContainer.querySelectorAll('.db-field-select').forEach(select => {
            const dbField = select.value;
            const excelHeader = select.dataset.excelColumn;
            if (dbField) {
                mapping[dbField] = excelHeader;
            }
        });

        // 2. Denetim Uzmanı (sorumlu_kullanici) e-postalarını ID'ye çevirmek için map hazırla
        const userEmailToIdMap = new Map();
        allUsers.forEach(user => userEmailToIdMap.set(user.email.toLowerCase(), user.id));

        // 3. Mevcut bayileri (bayiKodu: id) map'e al (Güncelleme kontrolü için)
        const existingBayiMap = new Map();
        allBayiler.forEach(bayi => {
            if (bayi.bayiKodu) {
                existingBayiMap.set(bayi.bayiKodu.trim(), bayi.id);
            }
        });

        // 4. Toplu atama kullanıcısını al
        const globalUserId = document.getElementById('import-global-user-select').value || null;

        // 5. Excel verisini gez, Oluşturma (create) ve Güncelleme (update) listeleri hazırla
        const recordsToCreate = [];
        const recordsToUpdate = [];
        const importErrors = []; // Hata mesajları burada toplanacak

        excelData.forEach((row, index) => {
            const pbData = {}; // PocketBase'e gönderilecek son veri
            let bayiKodu = null;
            let missingRequiredField = false; // YENİ: Satır bazlı zorunlu alan kontrolü

            // Eşleştirmeye göre Excel'den veriyi al
            for (const dbField in mapping) {
                const excelHeader = mapping[dbField];
                let excelValue = row[excelHeader];
                
                // Gelen değer null/undefined ise boş string yap
                excelValue = excelValue !== null && excelValue !== undefined ? String(excelValue).trim() : '';

                // YENİ: Zorunlu alanların Excel'de de dolu olup olmadığını kontrol et
                if (requiredFields.includes(dbField) && !excelValue) {
                    missingRequiredField = true;
                }

                if (dbField === 'sorumlu_kullanici') {
                    // Denetim Uzmanını e-postasından bulup ID'sini ata
                    const email = excelValue.toLowerCase();
                    pbData[dbField] = userEmailToIdMap.get(email) || null;
                
                } else if (dbField === 'bayiKodu') {
                    bayiKodu = excelValue;
                    pbData[dbField] = bayiKodu;

                } else {
                    // Diğer tüm alanlar
                    pbData[dbField] = excelValue;
                }
            }

            // Zorunlu eşleştirilmiş alanlardan herhangi biri Excel'de boşsa bu satırı atla
            if (missingRequiredField) {
                 importErrors.push(`Satır ${index + 2} (Excel): Zorunlu alan 'Bayi Kodu' boş. Atlandı.`);
                return;
            }

            // Toplu kullanıcı ataması kontrolü
            if (globalUserId) {
                pbData.sorumlu_kullanici = globalUserId;
            }

            // Mevcut bayi listesinde bu kodu ara (Oluştur veya Güncelle)
            const existingId = existingBayiMap.get(bayiKodu);
            if (existingId) {
                recordsToUpdate.push({ id: existingId, data: pbData }); // Güncelleme listesine ekle
            } else {
                if (!pbData.sorumlu_kullanici) {
                     pbData.sorumlu_kullanici = null;
                }
                recordsToCreate.push(pbData); // Oluşturma listesine ekle
            }
        });

        // 6. Veritabanı işlemlerini gerçekleştir (Sıralı (Sequential) Çalışma)
        const totalOperations = recordsToCreate.length + recordsToUpdate.length;
        let completedOperations = 0;
        let createdCount = 0;
        let updatedCount = 0;

        // Oluşturma işlemleri (Sıralı)
        for (const data of recordsToCreate) {
            completedOperations++;
            const bayiKodu = data.bayiKodu || 'Bilinmeyen';
            showImportLoading(true, `İşlem ${completedOperations} / ${totalOperations} tamamlanıyor... (Ekleniyor: ${bayiKodu})`);
            try {
                await pb.collection('bayiler').create(data);
                createdCount++;
            } catch (error) {
                importErrors.push(`YENİ EKLEME HATASI (bayiKodu: ${bayiKodu}): ${error.message}`);
            }
        }

        // Güncelleme işlemleri (Sıralı)
        for (const item of recordsToUpdate) {
            completedOperations++;
            const bayiKodu = item.data.bayiKodu || 'Bilinmeyen';
            showImportLoading(true, `İşlem ${completedOperations} / ${totalOperations} tamamlanıyor... (Güncelleniyor: ${bayiKodu})`);
            try {
                await pb.collection('bayiler').update(item.id, item.data);
                updatedCount++;
            } catch (error) {
                importErrors.push(`GÜNCELLEME HATASI (bayiKodu: ${bayiKodu}): ${error.message}`);
            }
        }


        // 7. Sonuç ekranını (Adım 3) göster
        importResults.innerHTML = `
            <strong>İçe Aktarma Tamamlandı!</strong>
            <p>${createdCount} bayi başarıyla eklendi.</p>
            <p>${updatedCount} bayi başarıyla güncellendi.</p>
            <p>${importErrors.length} işlemde hata oluştu.</p>
        `;
        if (importErrors.length > 0) {
            importResults.innerHTML += `
                <hr>
                <strong>Hata Detayları:</strong>
                <pre>${importErrors.join('\n')}</pre>
            `;
        }

        showImportLoading(false);
        importStep2.style.display = 'none';
        importStep3.style.display = 'block';

        // 8. Ana tabloyu arka planda yenile
        await loadModuleData();
    }


    // --- Yardımcı Fonksiyonlar ---

    // Ana tablo yükleme spinner'ı
    function showLoading(show) {
        if (loadingSpinner) {
            loadingSpinner.style.display = show ? 'block' : 'none';
        }
    }


    // --- Olay Dinleyicileri (Event Listeners) ---
    
    // Ekle/Düzenle
    document.getElementById('btn-yeni-bayi').addEventListener('click', handleNewBayi);
    document.getElementById('btn-modal-cancel').addEventListener('click', closeModal);
    bayiForm.addEventListener('submit', handleFormSubmit);
    if(modal) {
        modal.addEventListener('click', function(event) {
            if (event.target === modal) {
                closeModal();
            }
        });
    }
    
    // Raporlama (Dışa Aktarma)
    document.getElementById('btn-view-selected').addEventListener('click', applyColumnVisibility); 
    document.getElementById('btn-export-excel').addEventListener('click', handleExportExcel);

    // YENİ: İçe Aktarma (Import)
    document.getElementById('btn-open-import-modal').addEventListener('click', openImportModal);
    excelFileInput.addEventListener('change', handleFileSelected);
    document.getElementById('btn-process-excel').addEventListener('click', processExcelFile);
    document.getElementById('btn-execute-import').addEventListener('click', executeImport);
    
    // İçe aktarma modalı kapatma butonları
    document.getElementById('btn-import-modal-cancel-1').addEventListener('click', closeImportModal);
    document.getElementById('btn-import-modal-cancel-2').addEventListener('click', closeImportModal);
    document.getElementById('btn-import-modal-close').addEventListener('click', closeImportModal);
    
    // İçe aktarma modalı için overlay'e tıklayarak kapatma
    if (importModal) {
        importModal.addEventListener('click', function(event) {
            if (event.target === event.currentTarget) { // Sadece overlay'e tıklanırsa
                closeImportModal();
            }
        });
    }

    // İçe aktarma Adım 2 - Eşleştirme doğrulama (GÜNCELLENDİ)
    if (mappingContainer) {
        // Event delegation kullanarak select değişikliklerini dinle
        mappingContainer.addEventListener('change', (event) => {
            if (event.target && event.target.classList.contains('db-field-select')) {
                validateMapping(); // Her seçim değiştiğinde zorunlu alanları kontrol et
            }
        });
    }
    
    
    // --- Modülü Başlat ---
    loadModuleData(); // Modül ilk yüklendiğinde verileri çek
}