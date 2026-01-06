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
 * GÜNCELLENDİ: Modüler Yetki Sistemi (Permissions) entegre edildi.
 * Admin olmayan kullanıcılar için veri izolasyonu ve özellik kısıtlaması.
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
    const pb = pbInstance; // PocketBase bağlantısı
    let allBayiler = []; // Veritabanından çekilen tüm bayilerin tam listesi
    let allUsers = [];   // Veritabanından çekilen tüm kullanıcıların (Denetim Uzmanları) listesi

    // YENİ: Mevcut kullanıcı ve yetkileri
    const currentUser = pb.authStore.model;
    const isClient = currentUser && currentUser.role === 'client';
    const permissions = currentUser?.permissions?.bayi_yoneticisi || {};
    const features = permissions.features || {};

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
    
    const requiredFields = ['bayiKodu'];

    let excelHeaders = []; 
    let excelData = [];    

    // İçe Aktarma (Import) Modal Elementleri
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

    // Toplu Atama (Bulk Assign) Modal Elementleri
    const btnOpenBulkAssignModal = document.getElementById('btn-open-bulk-assign-modal');
    const bulkAssignModal = document.getElementById('bulk-assign-modal');
    const bulkAssignFilterBolge = document.getElementById('bulk-assign-filter-bolge');
    const bulkAssignFilterSehir = document.getElementById('bulk-assign-filter-sehir');
    const bulkAssignFilterYonetmen = document.getElementById('bulk-assign-filter-yonetmen');
    const bulkAssignUserSelect = document.getElementById('bulk-assign-user-select');
    const btnExecuteBulkAssign = document.getElementById('btn-execute-bulk-assign');
    const btnBulkAssignCancel = document.getElementById('btn-bulk-assign-cancel');
    const bulkAssignLoadingOverlay = document.getElementById('bulk-assign-loading-overlay');
    const bulkAssignLoadingText = document.getElementById('bulk-assign-loading-text');


    // --- YENİ: Özellik (Feature) Kısıtlamalarını Uygula ---
    function applyFeatureRestrictions() {
        if (isClient) {
            // 1. CRUD Yetkisi Yoksa (Yeni Ekle)
            if (!features.crud_operations) {
                const btnNew = document.getElementById('btn-yeni-bayi');
                if (btnNew) btnNew.remove(); // Butonu tamamen sil
            }

            // 2. Excel Yetkisi Yoksa (İçe/Dışa Aktar)
            if (!features.excel_import_export) {
                const exportSection = document.querySelector('.export-section'); // Varsa kapsayıcı sınıf
                const btnExport = document.getElementById('btn-export-excel');
                const btnImport = document.getElementById('btn-open-import-modal');
                const btnView = document.getElementById('btn-view-selected'); // Sütun seçimi
                
                if (btnExport) btnExport.closest('.col-md-3')?.remove() || btnExport.remove();
                if (btnImport) btnImport.remove();
                // Raporlama bölümünü tamamen gizle istersen:
                // document.getElementById('report-controls').style.display = 'none';
            }

            // 3. Toplu Atama Yetkisi Yoksa
            if (!features.bulk_assign) {
                if (btnOpenBulkAssignModal) btnOpenBulkAssignModal.remove();
            }
        }
    }

    // --- Ana Veri Yükleme Fonksiyonları ---

    async function loadModuleData() {
        // UI Kısıtlamalarını Uygula
        applyFeatureRestrictions();
        
        showLoading(true);
        try {
            // Kullanıcıları çek (Herkes admin veya client, sorumlu ataması için lazım)
            allUsers = await pb.collection('users').getFullList({ sort: 'name' });
            
            // --- VERİ İZOLASYONU ---
            // Eğer kullanıcı CLIENT ise, sadece sorumlu olduğu bayileri çek.
            // Eğer ADMIN ise, tüm bayileri çek.
            let filterString = '';
            if (isClient) {
                filterString = `sorumlu_kullanici = "${currentUser.id}"`;
            }

            // Bayileri çek
            allBayiler = await pb.collection('bayiler').getFullList({
                sort: '-created',
                expand: 'sorumlu_kullanici',
                filter: filterString // Filtreyi uygula
            });

            // Veriyi işle (Email yerine İsim gösterimi için)
            allBayiler.forEach(bayi => {
                const user = bayi.expand?.sorumlu_kullanici;
                bayi.sorumlu_kullanici_email = user?.name || ''; 
                bayi.sorumlu_kullanici_email_tooltip = user?.email || ''; 
            });

            populateUserDropdown(); 
            populateGlobalUserDropdown(); 
            populateColumnCheckboxes(); 
            setupFilterListeners(); 
            applyAllFilters(); 
            
        } catch (error) {
            console.error('Veri yüklenirken hata oluştu:', error);
            alert('Veriler yüklenirken bir hata oluştu. Erişim yetkiniz kısıtlanmış olabilir.');
        } finally {
            showLoading(false);
        }
    }

    // Bayi tablosunu (HTML) çizen fonksiyon
    function renderBayiTable(bayilerToRender) {
        tableBody.innerHTML = ''; 

        if (bayilerToRender.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">Kayıt bulunamadı.</td></tr>';
            return;
        }

        bayilerToRender.forEach(bayi => {
            const tr = document.createElement('tr');
            
            const uzmanEmail = bayi.sorumlu_kullanici_email || ''; 
            const uzmanEmailTooltip = bayi.sorumlu_kullanici_email_tooltip || ''; 
            
            const bayiAdi = bayi.bayiAdi || '';
            const bayiYonetmeni = bayi.yonetmen || ''; 
            const bayiEmail = bayi.email || '';
            const bolge = bayi.bolge || '';
            const sehir = bayi.sehir || '';
            const ilce = bayi.ilce || '';
            const bayiKodu = bayi.bayiKodu || '';

            // CRUD Butonlarını Yetkiye Göre Oluştur
            let actionsHtml = '';
            if (!isClient || (isClient && features.crud_operations)) {
                actionsHtml = `
                    <button class="btn btn-warning btn-edit" data-id="${bayi.id}" title="Düzenle">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-delete" data-id="${bayi.id}" title="Sil">
                        <i class="fas fa-trash"></i>
                    </button>
                `;
            } else {
                actionsHtml = '<span class="text-muted" style="font-size:0.8em;">Yetki Yok</span>';
            }

            tr.innerHTML = `
                <td title="${bolge}" data-column="bolge">${bolge}</td>
                <td title="${sehir}" data-column="sehir">${sehir}</td>
                <td title="${ilce}" data-column="ilce">${ilce}</td>
                <td title="${bayiKodu}" data-column="bayiKodu"><strong>${bayiKodu}</strong></td>
                <td title="${bayiAdi}" data-column="bayiAdi">${bayiAdi}</td>
                <td title="${bayiYonetmeni}" data-column="yonetmen">${bayiYonetmeni}</td> 
                <td title="${bayiEmail}" data-column="email">${bayiEmail}</td>
                <td title="${uzmanEmailTooltip}" data-column="sorumlu_kullanici_email">${uzmanEmail || '<span style="color: #999;">Atanmamış</span>'}</td>
                <td class="action-buttons" data-column="eylemler">
                    ${actionsHtml}
                </td>
            `;

            // Event listener'ları sadece butonlar varsa ekle
            const btnEdit = tr.querySelector('.btn-edit');
            const btnDelete = tr.querySelector('.btn-delete');
            
            if (btnEdit) btnEdit.addEventListener('click', () => handleEditBayi(bayi.id));
            if (btnDelete) btnDelete.addEventListener('click', () => handleDeleteBayi(bayi.id));

            tableBody.appendChild(tr);
        });
        
        applyColumnVisibility();
    }

    // Ekle/Düzenle modalındaki 'Denetim Uzmanı' <select> listesini doldurur
    function populateUserDropdown() {
        uzmanSelect.innerHTML = '<option value="">Atanmamış</option>'; 
        
        // Eğer kullanıcı Client ise ve CRUD yetkisi varsa bile, başkasına atama yapamaz.
        // Sadece kendini görebilir veya bu alan disable edilir.
        // Biz burada basitçe: Client ise bu alanı disable yapalım.
        if (isClient) {
            uzmanSelect.disabled = true;
            // Kendi adını ekle ve seç
            const option = document.createElement('option');
            option.value = currentUser.id;
            option.textContent = currentUser.name || currentUser.email;
            option.selected = true;
            uzmanSelect.appendChild(option);
            return;
        }

        // Admin ise listeyi doldur
        uzmanSelect.disabled = false;
        allUsers.forEach(user => {
            if (user.role === 'client' || user.role === 'admin') {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.name || user.email;
                uzmanSelect.appendChild(option);
            }
        });
    }

    function populateGlobalUserDropdown() {
        const globalSelect = document.getElementById('import-global-user-select');
        if (!globalSelect) return; 

        globalSelect.innerHTML = '<option value="">İçe Aktarılan Tüm Bayileri Bu Kullanıcıya Ata (Opsiyonel)</option>'; 
        allUsers.forEach(user => {
            if (user.role === 'client' || user.role === 'admin') {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.name || user.email;
                globalSelect.appendChild(option);
            }
        });
    }


    function populateColumnCheckboxes() {
        columnCheckboxesContainer.innerHTML = '';
        fields.forEach(field => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" class="column-check" value="${field.key}"> ${field.label}`;
            columnCheckboxesContainer.appendChild(label);
        });
    }


    // --- CRUD Fonksiyonları ---

    function handleNewBayi() {
        // Ekstra güvenlik: Yetkisiz çağırmayı engelle
        if (isClient && !features.crud_operations) {
            alert("Yetkisiz işlem.");
            return;
        }

        bayiForm.reset(); 
        bayiIdInput.value = ''; 
        modalTitle.textContent = 'Yeni Bayi Ekle'; 
        
        // Client ise sorumlu kullanıcıyı otomatik kendisi yap
        if (isClient) {
            populateUserDropdown(); // Tekrar tetikle ki disable/seçili olsun
        }
        
        modal.style.display = 'flex'; 
    }

    function handleEditBayi(bayiId) {
        if (isClient && !features.crud_operations) return;

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
        
        // Sorumlu kullanıcı ataması
        if (isClient) {
             // Client ise dropdown zaten disable ve kendi seçili
             // Ama veritabanında başka biri atanmışsa? (Normalde olamaz filter var ama)
             // Yine de UI'da kendi görünür.
        } else {
             document.getElementById('sorumlu_kullanici').value = bayi.sorumlu_kullanici || ''; 
        }
        
        modal.style.display = 'flex'; 
    }

    async function handleDeleteBayi(bayiId) {
        if (isClient && !features.crud_operations) return;

        const bayi = allBayiler.find(b => b.id === bayiId);
        const bayiAdi = bayi ? bayi.bayiAdi : 'Bu bayi';

        if (confirm(`'${bayiAdi}' (${bayi.bayiKodu}) adlı bayiyi kalıcı olarak silmek istediğinizden emin misiniz?`)) {
            showLoading(true);
            try {
                await pb.collection('bayiler').delete(bayiId);
                await loadModuleData(); 
            } catch (error) {
                console.error('Bayi silinirken hata:', error);
                alert('Bayi silinirken bir hata oluştu: ' + error.message);
                showLoading(false);
            }
        }
    }

    async function handleFormSubmit(event) {
        event.preventDefault(); 
        
        if (isClient && !features.crud_operations) return;

        showLoading(true);

        const bayiId = bayiIdInput.value; 

        const data = {
            bayiKodu: document.getElementById('bayiKodu').value,
            bayiAdi: document.getElementById('bayiAdi').value,
            bolge: document.getElementById('bolge').value,
            sehir: document.getElementById('sehir').value,
            ilce: document.getElementById('ilce').value,
            yonetmen: document.getElementById('yonetmen').value, 
            email: document.getElementById('email').value,
            // Client ise bu alan disabled olduğu için formdan gelmez, manuel ekle
            sorumlu_kullanici: isClient ? currentUser.id : (document.getElementById('sorumlu_kullanici').value || null)
        };
        
        if (!data.bayiKodu) {
            alert('Bayi Kodu zorunlu bir alandır. Lütfen doldurun.');
            showLoading(false);
            return;
        }

        try {
            if (bayiId) { 
                await pb.collection('bayiler').update(bayiId, data);
            } else { 
                await pb.collection('bayiler').create(data);
            }
            
            modal.style.display = 'none'; 
            await loadModuleData(); 
            
        } catch (error) {
            console.error('Bayi kaydedilirken hata:', error);
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


    // --- Filtreleme ---

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

        renderBayiTable(filteredBayiler);
    }


    // --- Raporlama ---

    function getFilteredDataForExport() {
        const selectedKeys = Array.from(columnCheckboxesContainer.querySelectorAll('.column-check:checked'))
            .map(cb => cb.value);

        const keysToExport = selectedKeys.length > 0 ? selectedKeys : allFieldKeys;
        const selectedHeaders = keysToExport.map(key => fields.find(f => f.key === key).label);

        // Mevcut filtreli veriyi (allBayiler üzerinden değil) kullanmak daha doğru olurdu ama
        // yapı gereği applyAllFilters ile aynı mantığı kullanıyoruz.
        // allBayiler zaten loadModuleData içinde filtrelendiği için GÜVENLİ.
        
        const filterValue = dropdownFilter.value;
        const searchValues = {};
        searchInputs.forEach(input => {
            searchValues[input.dataset.column] = input.value.toLowerCase();
        });
        
        const filteredBayiler = allBayiler.filter(bayi => {
            // ... (Filtre mantığı aynı) ...
            // Kod tekrarını önlemek için applyAllFilters mantığı buraya kopyalandı varsayalım.
            // Kısa yol: applyAllFilters sonucunu global bir değişkende tutmak olabilirdi ama
            // güvenlik için her seferinde hesaplamak daha iyidir.
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

    function applyColumnVisibility() {
        const selectedKeys = Array.from(columnCheckboxesContainer.querySelectorAll('.column-check:checked'))
            .map(cb => cb.value);

        const showAll = selectedKeys.length === 0;

        allFieldKeys.forEach(key => {
            const cells = mainTable.querySelectorAll(`[data-column="${key}"]`);
            if (showAll || selectedKeys.includes(key)) {
                cells.forEach(cell => cell.style.display = 'table-cell');
            } else {
                cells.forEach(cell => cell.style.display = 'none');
            }
        });

        const actionCells = mainTable.querySelectorAll('[data-column="eylemler"]');
        actionCells.forEach(cell => cell.style.display = 'table-cell');
    }

    function handleExportExcel() {
        // Yetki kontrolü
        if (isClient && !features.excel_import_export) {
            alert("Bu işlem için yetkiniz yok.");
            return;
        }

        if (typeof XLSX === 'undefined') {
            alert('Excel dışa aktarma kütüphanesi (XLSX) yüklenemedi. Lütfen tekrar deneyin.');
            return;
        }

        const { headers, data } = getFilteredDataForExport(); 

        if (data.length === 0) {
             alert('Mevcut filtrelere uyan veri bulunamadı.');
            return;
        }
        
        if (headers.length === 0) {
            alert('Lütfen dışa aktarmak için en az bir sütun seçin.');
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


    // --- Excel İçe Aktarma ---
    // (Bu fonksiyonlar aynı kalır, sadece en başta buton yoksa tetiklenmezler)
    // Güvenlik için her birinin başına yetki kontrolü ekleyebiliriz ama 
    // UI'dan butonu sildiğimiz için erişim zaten zor. 
    // Yine de 'openImportModal' içine ekleyelim.

    function openImportModal() {
        if (isClient && !features.excel_import_export) {
            alert("Bu işlem için yetkiniz yok.");
            return;
        }

        excelHeaders = [];
        excelData = [];
        excelFileInput.value = null; 
        mappingContainer.innerHTML = '';
        importResults.innerHTML = '';
        
        const globalSelect = document.getElementById('import-global-user-select');
        if (globalSelect) {
            globalSelect.value = '';
        }

        importStep1.style.display = 'block';
        importStep2.style.display = 'none';
        importStep3.style.display = 'none';

        btnProcessExcel.disabled = true; 
        btnExecuteImport.disabled = true;

        importModal.style.display = 'flex';
    }

    function closeImportModal() {
        importModal.style.display = 'none';
        showImportLoading(false); 
    }

    function showImportLoading(show, text = 'İşlem yürütülüyor...') {
        if (show) {
            importLoadingText.textContent = text;
            importLoadingOverlay.style.display = 'flex';
        } else {
            importLoadingOverlay.style.display = 'none';
        }
    }

    function handleFileSelected(event) {
        if (event.target.files && event.target.files.length > 0) {
            btnProcessExcel.disabled = false; 
        } else {
            btnProcessExcel.disabled = true; 
        }
    }

    async function processExcelFile() {
        const file = excelFileInput.files[0];
        if (!file) {
            alert('Lütfen bir Excel dosyası seçin.');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('Excel kütüphanesi (XLSX) yüklenemedi.');
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

                    const dataAsArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                    if (!dataAsArray || dataAsArray.length < 1) {
                        throw new Error('Excel dosyası boş veya okunamadı.');
                    }
                    excelHeaders = dataAsArray.shift().map(String); 

                    excelData = XLSX.utils.sheet_to_json(worksheet);

                    populateMappingUI(excelHeaders);
                    
                    importStep1.style.display = 'none';
                    importStep2.style.display = 'block';

                } catch (readError) {
                    console.error('Excel okunurken hata:', readError);
                    alert('Excel dosyası işlenirken bir hata oluştu: ' + readError.message);
                } finally {
                    showImportLoading(false);
                }
            };
            reader.readAsArrayBuffer(file);

        } catch (error) {
            showImportLoading(false);
            console.error('Excel İşleme Hatası:', error);
            alert('Excel dosyası işlenirken bir hata oluştu: ' + error.message);
        }
    }

    function populateMappingUI(headers) {
        mappingContainer.innerHTML = ''; 

        const optionsHtml = [
            '<option value="">Eşleştirme / Boş Geç</option>',
            ...dbFieldsForMapping.map(field => `<option value="${field.key}">${field.label}</option>`)
        ].join('');

        headers.forEach(header => {
            const row = document.createElement('div');
            row.className = 'mapping-row';

            row.innerHTML = `
                <label class="excel-column-label">${header} (Excel)</label>
                <i class="fas fa-arrow-right"></i>
                <select class="db-field-select form-control" data-excel-column="${header}">
                    ${optionsHtml}
                </select>
            `;

            mappingContainer.appendChild(row);
        });

        validateMapping();
    }

    function validateMapping() {
        const selects = mappingContainer.querySelectorAll('.db-field-select');
        const mappedFields = new Set(); 
        selects.forEach(select => {
            if (select.value) {
                mappedFields.add(select.value);
            }
        });

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


    async function executeImport() {
        if (btnExecuteImport.disabled) {
            alert('Lütfen devam etmeden önce tüm zorunlu alanları eşleştirin.');
            return;
        }

        showImportLoading(true, 'Veriler işleniyor...');

        const mapping = {};
        mappingContainer.querySelectorAll('.db-field-select').forEach(select => {
            const dbField = select.value;
            const excelHeader = select.dataset.excelColumn;
            if (dbField) {
                mapping[dbField] = excelHeader;
            }
        });

        const userEmailToIdMap = new Map();
        allUsers.forEach(user => userEmailToIdMap.set(user.email.toLowerCase(), user.id));

        const existingBayiMap = new Map();
        allBayiler.forEach(bayi => {
            if (bayi.bayiKodu) {
                existingBayiMap.set(bayi.bayiKodu.trim(), bayi.id);
            }
        });

        const globalUserId = document.getElementById('import-global-user-select').value || null;

        const recordsToCreate = [];
        const recordsToUpdate = [];
        const importErrors = []; 

        excelData.forEach((row, index) => {
            const pbData = {}; 
            let bayiKodu = null;
            let missingRequiredField = false; 

            for (const dbField in mapping) {
                const excelHeader = mapping[dbField];
                let excelValue = row[excelHeader];
                
                excelValue = excelValue !== null && excelValue !== undefined ? String(excelValue).trim() : '';

                if (requiredFields.includes(dbField) && !excelValue) {
                    missingRequiredField = true;
                }

                if (dbField === 'sorumlu_kullanici') {
                    const email = excelValue.toLowerCase();
                    pbData[dbField] = userEmailToIdMap.get(email) || null;
                
                } else if (dbField === 'bayiKodu') {
                    bayiKodu = excelValue;
                    pbData[dbField] = bayiKodu;
                
                } else if (dbField === 'bayiAdi') {
                    const cleanBayiAdi = excelValue.replace(/^(\d{4,}\s+)/, '');
                    pbData[dbField] = cleanBayiAdi;

                } else {
                    pbData[dbField] = excelValue;
                }
            }

            if (missingRequiredField) {
                 importErrors.push(`Satır ${index + 2} (Excel): Zorunlu alan 'Bayi Kodu' boş. Atlandı.`);
                return;
            }

            if (globalUserId) {
                pbData.sorumlu_kullanici = globalUserId;
            }

            const existingId = existingBayiMap.get(bayiKodu);
            if (existingId) {
                recordsToUpdate.push({ id: existingId, data: pbData }); 
            } else {
                if (!pbData.sorumlu_kullanici) {
                     pbData.sorumlu_kullanici = null;
                }
                recordsToCreate.push(pbData); 
            }
        });

        const totalOperations = recordsToCreate.length + recordsToUpdate.length;
        let completedOperations = 0;
        let createdCount = 0;
        let updatedCount = 0;

        for (const data of recordsToCreate) {
            completedOperations++;
            const bayiKodu = data.bayiKodu || 'Bilinmeyen';
            showImportLoading(true, `İşlem ${completedOperations} / ${totalOperations} tamamlanıyor... (Ekleniyor: ${bayiKodu})`);
            try {
                await pb.collection('bayiler').create(data);
                createdCount++;
            } catch (error) {
                importErrors.push(`EKLEME HATASI (bayiKodu: ${bayiKodu}): ${error.message}`);
            }
        }

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

        await loadModuleData();
    }


    // --- Toplu Denetim Uzmanı Atama ---

    function openBulkAssignModal() {
        if (isClient && !features.bulk_assign) {
            alert("Bu işlem için yetkiniz yok.");
            return;
        }

        bulkAssignFilterBolge.innerHTML = '';
        bulkAssignFilterSehir.innerHTML = '';
        bulkAssignFilterYonetmen.innerHTML = '';
        bulkAssignUserSelect.innerHTML = '<option value="">Lütfen bir kullanıcı seçin...</option>';
        
        populateBulkAssignFilters();
        populateBulkAssignUserDropdown();
        
        bulkAssignModal.style.display = 'flex';
    }

    function closeBulkAssignModal() {
        bulkAssignModal.style.display = 'none';
        showBulkAssignLoading(false); 
    }

    function showBulkAssignLoading(show, text = 'İşlem yürütülüyor...') {
        if (show) {
            bulkAssignLoadingText.textContent = text;
            bulkAssignLoadingOverlay.style.display = 'flex';
        } else {
            bulkAssignLoadingOverlay.style.display = 'none';
        }
    }

    function populateBulkAssignFilters() {
        const unassignedBayiler = allBayiler.filter(b => !b.sorumlu_kullanici);

        const bolgeler = [...new Set(unassignedBayiler.map(b => b.bolge).filter(Boolean))].sort();
        const sehirler = [...new Set(unassignedBayiler.map(b => b.sehir).filter(Boolean))].sort();
        const yonetmenler = [...new Set(unassignedBayiler.map(b => b.yonetmen).filter(Boolean))].sort();
        
        if(bolgeler.length > 0) {
            bolgeler.forEach(val => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="${val}"> ${val}`;
                bulkAssignFilterBolge.appendChild(label);
            });
        } else {
            bulkAssignFilterBolge.innerHTML = '<span style="color: #999;">Filtrelenecek bölge yok.</span>';
        }
        
        if(sehirler.length > 0) {
            sehirler.forEach(val => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="${val}"> ${val}`;
                bulkAssignFilterSehir.appendChild(label);
            });
        } else {
            bulkAssignFilterSehir.innerHTML = '<span style="color: #999;">Filtrelenecek şehir yok.</span>';
        }

        const nullYonetmenLabel = document.createElement('label');
        nullYonetmenLabel.innerHTML = `<input type="checkbox" value="[IS_NULL]"> <strong>Yönetmeni Olmayanlar</strong>`;
        bulkAssignFilterYonetmen.appendChild(nullYonetmenLabel);

        if(yonetmenler.length > 0) {
            const hr = document.createElement('hr');
            bulkAssignFilterYonetmen.appendChild(hr);

            yonetmenler.forEach(val => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="${val}"> ${val}`;
                bulkAssignFilterYonetmen.appendChild(label);
            });
        }
    }

    function populateBulkAssignUserDropdown() {
        allUsers.forEach(user => {
            if (user.role === 'client' || user.role === 'admin') {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = user.name || user.email; 
                bulkAssignUserSelect.appendChild(option);
            }
        });
    }
    
    async function executeBulkAssign() {
        if (isClient && !features.bulk_assign) return;

        const selectedBolgeler = Array.from(bulkAssignFilterBolge.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        const selectedSehirler = Array.from(bulkAssignFilterSehir.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        
        const selectedYonetmenValues = Array.from(bulkAssignFilterYonetmen.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
        const filterForNullYonetmen = selectedYonetmenValues.includes('[IS_NULL]');
        const selectedYonetmenler = selectedYonetmenValues.filter(v => v !== '[IS_NULL]');

        const userId = bulkAssignUserSelect.value;

        if (!userId) {
            alert('Lütfen atanacak bir Denetim Uzmanı seçin.');
            return;
        }

        showBulkAssignLoading(true, 'Bayiler filtreleniyor...');
        
        let targetBayiler = allBayiler.filter(b => !b.sorumlu_kullanici); 

        if (selectedBolgeler.length > 0) {
            targetBayiler = targetBayiler.filter(b => selectedBolgeler.includes(b.bolge));
        }
        if (selectedSehirler.length > 0) {
            targetBayiler = targetBayiler.filter(b => selectedSehirler.includes(b.sehir));
        }
        
        if (filterForNullYonetmen || selectedYonetmenler.length > 0) {
            targetBayiler = targetBayiler.filter(b => {
                if (filterForNullYonetmen && !b.yonetmen) {
                    return true;
                }
                if (selectedYonetmenler.includes(b.yonetmen)) {
                    return true;
                }
                return false;
            });
        }

        if (targetBayiler.length === 0) {
            alert('Bu filtrelere uyan atanmamış bayi bulunamadı.');
            showBulkAssignLoading(false);
            return;
        }

        const user = allUsers.find(u => u.id === userId);
        const userName = user ? (user.name || user.email) : 'Seçilen Kullanıcı';
        
        if (!confirm(`${targetBayiler.length} adet atanmamış bayi bulundu.\n\nBu bayileri '${userName}' adlı kullanıcıya atamak istediğinizden emin misiniz?`)) {
            showBulkAssignLoading(false);
            return;
        }

        let successCount = 0;
        let errorCount = 0;
        const errors = [];
        const totalOperations = targetBayiler.length;

        for (const [index, bayi] of targetBayiler.entries()) {
            showBulkAssignLoading(true, `İşlem ${index + 1} / ${totalOperations} tamamlanıyor... (Bayi: ${bayi.bayiKodu})`);
            try {
                await pb.collection('bayiler').update(bayi.id, { sorumlu_kullanici: userId });
                successCount++;
            } catch (error) {
                errorCount++;
                errors.push(`Hata (Bayi Kodu: ${bayi.bayiKodu}): ${error.message}`);
            }
        }

        showBulkAssignLoading(false);
        let resultMessage = `${successCount} bayi başarıyla '${userName}' kullanıcısına atandı.`;
        if (errorCount > 0) {
            resultMessage += `\n\n${errorCount} işlemde hata oluştu.\nDetaylar (Konsolu kontrol edin):\n${errors.join('\n')}`;
            console.error('Toplu atama hataları:', errors);
        }
        alert(resultMessage);

        closeBulkAssignModal();
        await loadModuleData();
    }


    // --- Yardımcı Fonksiyonlar ---

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

    // İçe Aktarma (Import)
    const btnImport = document.getElementById('btn-open-import-modal');
    if (btnImport) btnImport.addEventListener('click', openImportModal);
    
    excelFileInput.addEventListener('change', handleFileSelected);
    document.getElementById('btn-process-excel').addEventListener('click', processExcelFile);
    document.getElementById('btn-execute-import').addEventListener('click', executeImport);
    
    document.getElementById('btn-import-modal-cancel-1').addEventListener('click', closeImportModal);
    document.getElementById('btn-import-modal-cancel-2').addEventListener('click', closeImportModal);
    document.getElementById('btn-import-modal-close').addEventListener('click', closeImportModal);
    
    if (importModal) {
        importModal.addEventListener('click', function(event) {
            if (event.target === event.currentTarget) { 
                closeImportModal();
            }
        });
    }

    if (mappingContainer) {
        mappingContainer.addEventListener('change', (event) => {
            if (event.target && event.target.classList.contains('db-field-select')) {
                validateMapping(); 
            }
        });
    }

    // Toplu Atama (Bulk Assign)
    if (btnOpenBulkAssignModal) {
        btnOpenBulkAssignModal.addEventListener('click', openBulkAssignModal);
    }
    if (btnExecuteBulkAssign) {
        btnExecuteBulkAssign.addEventListener('click', executeBulkAssign);
    }
    if (btnBulkAssignCancel) {
        btnBulkAssignCancel.addEventListener('click', closeBulkAssignModal);
    }
    if (bulkAssignModal) {
        bulkAssignModal.addEventListener('click', function(event) {
            if (event.target === event.currentTarget) { 
                closeBulkAssignModal();
            }
        });
    }
    
    
    // --- Modülü Başlat ---
    loadModuleData(); 
}