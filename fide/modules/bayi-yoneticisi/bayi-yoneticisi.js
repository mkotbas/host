// Gerekli kütüphaneleri (ExcelJS) dinamik olarak yüklemek için yardımcı fonksiyon
function loadScript(url) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${url}"]`)) {
            resolve();
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
 */
export async function initializeBayiYoneticisiModule(pbInstance) {
    
    // Excel kütüphanesini arka planda yükle
    loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js').catch(() => {
        console.warn('Excel kütüphanesi yüklenemedi, raporlama çalışmayabilir.');
    });

    const pb = pbInstance; 
    let allBayiler = []; 
    let allUsers = [];   
    let importedExcelData = null; // Excel verilerini tutacak değişken

    const container = document.getElementById('bayi-yonetici-container');
    if (!container) return; 

    // --- DOM Element Seçicileri ---
    const tableBody = container.querySelector('#bayi-table-body');
    const loadingSpinner = container.querySelector('#loading-spinner');
    
    // Düzenleme/Ekleme Modalı
    const modal = container.querySelector('#bayi-modal');
    const modalTitle = container.querySelector('#modal-title');
    const bayiForm = container.querySelector('#bayi-form');
    const bayiIdInput = container.querySelector('#bayi-id');
    const uzmanSelect = container.querySelector('#sorumlu_kullanici');
    
    // Filtreler
    const dropdownFilter = container.querySelector('#kontrol-filtresi');
    const searchInputs = container.querySelectorAll('.column-search-input');
    const columnCheckboxesContainer = container.querySelector('#column-checkboxes');
    
    // Excel Import Modalı Elementleri
    const btnOpenImportModal = container.querySelector('#btn-open-import-modal');
    const importModal = container.querySelector('#import-modal');
    const importExcelInput = container.querySelector('#excel-file-input');
    const btnProcessExcel = container.querySelector('#btn-process-excel');
    const mappingContainer = container.querySelector('#mapping-container');
    const importWarning = container.querySelector('#import-warning');
    const btnExecuteImport = container.querySelector('#btn-execute-import');
    const importGlobalUserSelect = container.querySelector('#import-global-user-select');
    const importResultsArea = container.querySelector('#import-results');
    const importLoadingOverlay = container.querySelector('#import-loading-overlay');
    const importLoadingText = container.querySelector('#import-loading-text');
    
    // Import Modal Adım Elementleri
    const importStep1 = container.querySelector('#import-step-1');
    const importStep2 = container.querySelector('#import-step-2');
    const importStep3 = container.querySelector('#import-step-3');
    const btnImportCancel1 = container.querySelector('#btn-import-modal-cancel-1');
    const btnImportCancel2 = container.querySelector('#btn-import-modal-cancel-2');
    const btnImportClose = container.querySelector('#btn-import-modal-close');

    // Toplu Atama Modalı Elementleri
    const btnOpenBulkAssignModal = container.querySelector('#btn-open-bulk-assign-modal');
    const bulkAssignModal = container.querySelector('#bulk-assign-modal');
    const bulkAssignFilterBolge = container.querySelector('#bulk-assign-filter-bolge');
    const bulkAssignFilterSehir = container.querySelector('#bulk-assign-filter-sehir');
    const bulkAssignFilterYonetmen = container.querySelector('#bulk-assign-filter-yonetmen');
    const bulkAssignUserSelect = container.querySelector('#bulk-assign-user-select');
    const btnExecuteBulkAssign = container.querySelector('#btn-execute-bulk-assign');
    const btnBulkAssignCancel = container.querySelector('#btn-bulk-assign-cancel');
    const bulkAssignLoadingOverlay = container.querySelector('#bulk-assign-loading-overlay');
    const bulkAssignLoadingText = container.querySelector('#bulk-assign-loading-text');
    const bulkAssignTypeSelect = container.querySelector('#bulk-assign-type-select');
    const bulkAssignUserContainer = container.querySelector('#bulk-assign-user-select-container');
    const bulkAssignTextContainer = container.querySelector('#bulk-assign-text-input-container');
    const bulkAssignTextInput = container.querySelector('#bulk-assign-text-input');
    const bulkAssignOnlyUnassigned = container.querySelector('#bulk-assign-only-unassigned');

    // Veritabanı Alan Tanımları
    const dbFields = [
        { key: 'bayiKodu', label: 'Bayi Kodu (Zorunlu)', required: true },
        { key: 'bayiAdi', label: 'Bayi Adı', required: false },
        { key: 'bolge', label: 'Bölge', required: false },
        { key: 'sehir', label: 'Şehir', required: false },
        { key: 'ilce', label: 'İlçe', required: false },
        { key: 'yonetmen', label: 'Bayi Yönetmeni', required: false },
        { key: 'email', label: 'Mail Adresi', required: false }
    ];

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

    // --- VERİ YÜKLEME ---
    async function loadModuleData() {
        showLoading(true);
        try {
            try {
                allUsers = await pb.collection('users').getFullList({ sort: 'name' });
            } catch (e) { console.error("Kullanıcı listesi alınamadı:", e); }

            allBayiler = await pb.collection('bayiler').getFullList({
                sort: '-created',
                expand: 'sorumlu_kullanici' 
            });

            allBayiler.forEach(bayi => {
                const user = bayi.expand?.sorumlu_kullanici;
                bayi.sorumlu_kullanici_email = user ? (user.name || user.email) : ''; 
                bayi.sorumlu_kullanici_email_tooltip = user?.email || ''; 
            });

            populateUserDropdown(); 
            populateColumnCheckboxes(); 
            setupFilterListeners(); 
            applyAllFilters(); 
            
        } catch (error) {
            console.error('Veri yüklenirken hata:', error);
        } finally {
            showLoading(false);
        }
    }

    // --- TABLO İŞLEMLERİ ---
    function renderBayiTable(bayilerToRender) {
        if (!tableBody) return;
        tableBody.innerHTML = ''; 
        
        if (bayilerToRender.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">Görüntülenecek bayi bulunamadı.</td></tr>';
            return;
        }

        bayilerToRender.forEach(bayi => {
            const tr = document.createElement('tr');
            const uzmanEmail = bayi.sorumlu_kullanici_email || ''; 
            const uzmanEmailTooltip = bayi.sorumlu_kullanici_email_tooltip || ''; 
            
            tr.innerHTML = `
                <td data-column="bolge">${bayi.bolge || ''}</td>
                <td data-column="sehir">${bayi.sehir || ''}</td>
                <td data-column="ilce">${bayi.ilce || ''}</td>
                <td data-column="bayiKodu"><strong>${bayi.bayiKodu || ''}</strong></td>
                <td data-column="bayiAdi">${bayi.bayiAdi || ''}</td>
                <td data-column="yonetmen">${bayi.yonetmen || ''}</td> 
                <td data-column="email">${bayi.email || ''}</td>
                <td title="${uzmanEmailTooltip}" data-column="sorumlu_kullanici_email">${uzmanEmail || '<span style="color: #999;">Atanmamış</span>'}</td>
                <td class="action-buttons" data-column="eylemler">
                    <button class="btn btn-warning btn-edit" data-id="${bayi.id}" title="Düzenle"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger btn-delete" data-id="${bayi.id}" title="Sil"><i class="fas fa-trash"></i></button>
                </td>
            `;

            tr.querySelector('.btn-edit').addEventListener('click', () => handleEditBayi(bayi.id));
            tr.querySelector('.btn-delete').addEventListener('click', () => handleDeleteBayi(bayi.id));
            tableBody.appendChild(tr);
        });
        applyColumnVisibility();
    }

    function populateUserDropdown() {
        if (!uzmanSelect) return;
        uzmanSelect.innerHTML = '<option value="">Atanmamış</option>'; 
        
        // Import modalındaki global select'i de doldur
        if (importGlobalUserSelect) {
            importGlobalUserSelect.innerHTML = '<option value="">İçe Aktarılan Tüm Bayileri Bu Kullanıcıya Ata (Opsiyonel)</option>';
        }

        allUsers.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            option.textContent = user.name || user.email;
            uzmanSelect.appendChild(option);

            if (importGlobalUserSelect) {
                const opt2 = option.cloneNode(true);
                importGlobalUserSelect.appendChild(opt2);
            }
        });
    }

    function populateColumnCheckboxes() {
        if (!columnCheckboxesContainer) return;
        columnCheckboxesContainer.innerHTML = '';
        fields.forEach(field => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" class="column-check" value="${field.key}"> ${field.label}`;
            columnCheckboxesContainer.appendChild(label);
        });
    }

    // --- TEKİL BAYİ İŞLEMLERİ (CRUD) ---
    function handleEditBayi(bayiId) {
        const bayi = allBayiler.find(b => b.id === bayiId);
        if (!bayi) return;
        bayiForm.reset();
        bayiIdInput.value = bayi.id; 
        container.querySelector('#bayiKodu').value = bayi.bayiKodu || '';
        container.querySelector('#bayiAdi').value = bayi.bayiAdi || '';
        container.querySelector('#bolge').value = bayi.bolge || '';
        container.querySelector('#sehir').value = bayi.sehir || '';
        container.querySelector('#ilce').value = bayi.ilce || '';
        container.querySelector('#yonetmen').value = bayi.yonetmen || ''; 
        container.querySelector('#email').value = bayi.email || '';
        container.querySelector('#sorumlu_kullanici').value = bayi.sorumlu_kullanici || ''; 
        modal.style.display = 'flex'; 
    }

    async function handleFormSubmit(event) {
        event.preventDefault(); 
        showLoading(true);
        const bayiId = bayiIdInput.value; 
        const data = {
            bayiKodu: container.querySelector('#bayiKodu').value,
            bayiAdi: container.querySelector('#bayiAdi').value,
            bolge: container.querySelector('#bolge').value,
            sehir: container.querySelector('#sehir').value,
            ilce: container.querySelector('#ilce').value,
            yonetmen: container.querySelector('#yonetmen').value, 
            email: container.querySelector('#email').value,
            sorumlu_kullanici: container.querySelector('#sorumlu_kullanici').value || null 
        };
        try {
            if (bayiId) await pb.collection('bayiler').update(bayiId, data);
            else await pb.collection('bayiler').create(data);
            modal.style.display = 'none';
            await loadModuleData();
        } catch (error) {
            alert('Hata: ' + error.message);
        } finally {
            showLoading(false); 
        }
    }

    async function handleDeleteBayi(bayiId) {
        if (confirm('Bayiyi silmek istediğinizden emin misiniz?')) {
            showLoading(true);
            try {
                await pb.collection('bayiler').delete(bayiId);
                await loadModuleData();
            } catch (error) {
                alert('Hata: ' + error.message);
            } finally {
                showLoading(false);
            }
        }
    }

    // --- FİLTRELEME İŞLEMLERİ ---
    function setupFilterListeners() {
        if (dropdownFilter) dropdownFilter.addEventListener('change', applyAllFilters);
        searchInputs.forEach(input => input.addEventListener('input', applyAllFilters));
    }

    function applyAllFilters() {
        const filterValue = dropdownFilter ? dropdownFilter.value : 'all';
        const searchValues = {};
        searchInputs.forEach(input => {
            if (input.dataset.column) {
                searchValues[input.dataset.column] = input.value.toLowerCase();
            }
        });

        let filteredBayiler = allBayiler.filter(bayi => {
            let passDropdown = true;
            const isEmpty = (val) => !val || val.toString().trim() === '';

            switch (filterValue) {
                case 'no_bolge': passDropdown = isEmpty(bayi.bolge); break;
                case 'no_sehir': passDropdown = isEmpty(bayi.sehir); break;
                case 'no_ilce': passDropdown = isEmpty(bayi.ilce); break;
                case 'no_bayiKodu': passDropdown = isEmpty(bayi.bayiKodu); break;
                case 'no_bayiAdi': passDropdown = isEmpty(bayi.bayiAdi); break;
                case 'no_yonetmen': passDropdown = isEmpty(bayi.yonetmen); break; 
                case 'no_email': passDropdown = isEmpty(bayi.email); break;
                case 'no_uzman': passDropdown = isEmpty(bayi.sorumlu_kullanici_email); break;
                default: passDropdown = true;
            }

            if (!passDropdown) return false; 

            for (const key in searchValues) {
                const term = searchValues[key];
                if (term && !(bayi[key] || '').toLowerCase().includes(term)) return false;
            }
            return true; 
        });
        renderBayiTable(filteredBayiler);
    }

    function applyColumnVisibility() {
        if (!columnCheckboxesContainer) return;
        const selectedKeys = Array.from(columnCheckboxesContainer.querySelectorAll('.column-check:checked')).map(cb => cb.value);
        const showAll = selectedKeys.length === 0;
        allFieldKeys.forEach(key => {
            const cells = container.querySelectorAll(`[data-column="${key}"]`);
            cells.forEach(cell => cell.style.display = (showAll || selectedKeys.includes(key)) ? 'table-cell' : 'none');
        });
        container.querySelectorAll('[data-column="eylemler"]').forEach(cell => cell.style.display = 'table-cell');
    }

    // --- EXCEL IMPORT İŞLEMLERİ ---
    function openImportModal() {
        if (importModal) {
            importModal.style.display = 'flex';
            // Modalı sıfırla
            importStep1.style.display = 'block';
            importStep2.style.display = 'none';
            importStep3.style.display = 'none';
            importExcelInput.value = '';
            btnProcessExcel.disabled = true;
            mappingContainer.innerHTML = '';
            importedExcelData = null;
        }
    }

    // Dosya seçilince Process butonunu aktif et
    if (importExcelInput) {
        importExcelInput.addEventListener('change', (e) => {
            btnProcessExcel.disabled = !e.target.files.length;
        });
    }

    // Dosyayı oku ve Eşleştirme Ekranına Geç
    if (btnProcessExcel) {
        btnProcessExcel.addEventListener('click', () => {
            const file = importExcelInput.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                
                // Başlık satırını (1. satır) al
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                if (jsonData.length < 2) {
                    alert('Excel dosyası boş veya başlık satırı yok.');
                    return;
                }

                importedExcelData = jsonData; // Tüm veriyi sakla
                renderMappingUI(jsonData[0]); // İlk satır (başlıklar) ile UI oluştur
                
                // Arayüz geçişi
                importStep1.style.display = 'none';
                importStep2.style.display = 'block';
            };
            reader.readAsArrayBuffer(file);
        });
    }

    function renderMappingUI(headers) {
        mappingContainer.innerHTML = '';
        
        dbFields.forEach(field => {
            const row = document.createElement('div');
            row.className = 'mapping-row';
            
            // Otomatik Eşleştirme Mantığı (Tahmin)
            let selectedIndex = -1;
            const fieldLabelLower = field.label.toLowerCase();
            const fieldKeyLower = field.key.toLowerCase();

            headers.forEach((header, index) => {
                const headerLower = String(header).toLowerCase();
                if (headerLower.includes(fieldLabelLower) || headerLower.includes(fieldKeyLower)) {
                    selectedIndex = index;
                }
                // Özel durumlar
                if (field.key === 'bayiKodu' && (headerLower.includes('kod') || headerLower.includes('bayi no'))) selectedIndex = index;
                if (field.key === 'bayiAdi' && (headerLower.includes('ünvan') || headerLower.includes('ad'))) selectedIndex = index;
                if (field.key === 'yonetmen' && (headerLower.includes('sorumlu') || headerLower.includes('yönetmen'))) selectedIndex = index;
            });

            // Select Options Oluşturma
            let optionsHtml = `<option value="-1">-- Sütun Seçin --</option>`;
            headers.forEach((header, index) => {
                optionsHtml += `<option value="${index}" ${index === selectedIndex ? 'selected' : ''}>${header}</option>`;
            });

            row.innerHTML = `
                <label class="excel-column-label">${field.label} ${field.required ? '<span style="color:red">*</span>' : ''}</label>
                <i class="fas fa-arrow-right"></i>
                <select class="form-control db-field-select" data-key="${field.key}">
                    ${optionsHtml}
                </select>
            `;
            mappingContainer.appendChild(row);
        });

        // Bayi Kodu seçimi değiştikçe uyarıyı kontrol et
        const codeSelect = mappingContainer.querySelector(`select[data-key="bayiKodu"]`);
        codeSelect.addEventListener('change', checkImportValidity);
        checkImportValidity(); // İlk kontrol
    }

    function checkImportValidity() {
        const codeSelect = mappingContainer.querySelector(`select[data-key="bayiKodu"]`);
        const isValid = codeSelect && codeSelect.value !== "-1";
        
        if (importWarning) importWarning.style.display = isValid ? 'none' : 'block';
        if (btnExecuteImport) btnExecuteImport.disabled = !isValid;
    }

    // İçe Aktarımı Başlat
    if (btnExecuteImport) {
        btnExecuteImport.addEventListener('click', async () => {
            const mappings = {};
            const selects = mappingContainer.querySelectorAll('.db-field-select');
            selects.forEach(select => {
                mappings[select.dataset.key] = parseInt(select.value);
            });

            const globalUserId = importGlobalUserSelect.value;
            const dataRows = importedExcelData.slice(1); // Başlığı atla
            
            importLoadingOverlay.style.display = 'flex';
            importLoadingText.textContent = `0 / ${dataRows.length} kayıt işleniyor...`;

            let successCount = 0;
            let updateCount = 0;
            let errorCount = 0;
            let errors = [];

            // Tüm mevcut bayileri hafızada bir Map'e al (Performans için)
            const existingBayiMap = new Map();
            allBayiler.forEach(b => existingBayiMap.set(String(b.bayiKodu).trim(), b));

            // Chunk'lar halinde işlem yap (UI donmaması için)
            const chunkSize = 50; 
            for (let i = 0; i < dataRows.length; i += chunkSize) {
                const chunk = dataRows.slice(i, i + chunkSize);
                
                await Promise.all(chunk.map(async (row) => {
                    const bayiKoduIndex = mappings['bayiKodu'];
                    const bayiKoduVal = row[bayiKoduIndex];

                    if (!bayiKoduVal) {
                        errorCount++;
                        return; // Bayi kodu yoksa atla
                    }

                    const bayiData = {
                        bayiKodu: String(bayiKoduVal).trim(),
                        bayiAdi: mappings['bayiAdi'] > -1 ? String(row[mappings['bayiAdi']] || '') : '',
                        bolge: mappings['bolge'] > -1 ? String(row[mappings['bolge']] || '') : '',
                        sehir: mappings['sehir'] > -1 ? String(row[mappings['sehir']] || '') : '',
                        ilce: mappings['ilce'] > -1 ? String(row[mappings['ilce']] || '') : '',
                        yonetmen: mappings['yonetmen'] > -1 ? String(row[mappings['yonetmen']] || '') : '',
                        email: mappings['email'] > -1 ? String(row[mappings['email']] || '') : ''
                    };

                    // Global kullanıcı ataması varsa ekle
                    if (globalUserId) {
                        bayiData.sorumlu_kullanici = globalUserId;
                    }

                    try {
                        const existing = existingBayiMap.get(bayiData.bayiKodu);
                        if (existing) {
                            // Güncelle
                            await pb.collection('bayiler').update(existing.id, bayiData);
                            updateCount++;
                        } else {
                            // Yeni oluştur
                            await pb.collection('bayiler').create(bayiData);
                            successCount++;
                        }
                    } catch (err) {
                        errorCount++;
                        errors.push(`${bayiData.bayiKodu}: ${err.message}`);
                    }
                }));

                // İlerlemeyi güncelle
                importLoadingText.textContent = `${Math.min(i + chunkSize, dataRows.length)} / ${dataRows.length} kayıt işlendi...`;
            }

            importLoadingOverlay.style.display = 'none';
            
            // Sonuçları Göster
            importResultsArea.innerHTML = `
                İşlem Tamamlandı!
                -----------------
                Yeni Eklenen: ${successCount}
                Güncellenen: ${updateCount}
                Hatalı/Atlanan: ${errorCount}
                
                ${errors.length > 0 ? '\nHata Detayları:\n' + errors.slice(0, 10).join('\n') + (errors.length > 10 ? '\n...' : '') : ''}
            `;
            
            importStep2.style.display = 'none';
            importStep3.style.display = 'block';
            await loadModuleData(); // Tabloyu yenile
        });
    }

    // Modal Kapatma İşlemleri
    const closeImportModalFn = () => { if(importModal) importModal.style.display = 'none'; };
    if (btnImportCancel1) btnImportCancel1.addEventListener('click', closeImportModalFn);
    if (btnImportCancel2) btnImportCancel2.addEventListener('click', closeImportModalFn);
    if (btnImportClose) btnImportClose.addEventListener('click', closeImportModalFn);


    // --- TOPLU ATAMA İŞLEMLERİ (GÜNCELLENMİŞ) ---
    function openBulkAssignModal() {
        bulkAssignFilterBolge.innerHTML = '';
        bulkAssignFilterSehir.innerHTML = '';
        bulkAssignFilterYonetmen.innerHTML = '';
        bulkAssignTextInput.value = '';
        bulkAssignTypeSelect.value = 'sorumlu_kullanici';

        // Mevcut Yönetmenleri Topla (Datalist için)
        const uniqueYonetmenler = [...new Set(allBayiler.map(b => b.yonetmen).filter(Boolean))].sort();
        
        // Datalist Oluştur (Yönetmen Önerileri İçin)
        let datalist = document.getElementById('manager-list');
        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = 'manager-list';
            document.body.appendChild(datalist);
        }
        datalist.innerHTML = '';
        uniqueYonetmenler.forEach(yon => {
            const opt = document.createElement('option');
            opt.value = yon;
            datalist.appendChild(opt);
        });
        
        // Input'a datalist bağla
        bulkAssignTextInput.setAttribute('list', 'manager-list');

        // Dinamik Filtre Yenileme Fonksiyonu
        function refreshBulkFilters() {
            const selBolge = Array.from(bulkAssignFilterBolge.querySelectorAll('input:checked')).map(c => c.value);
            const selSehir = Array.from(bulkAssignFilterSehir.querySelectorAll('input:checked')).map(c => c.value);
            const selYon = Array.from(bulkAssignFilterYonetmen.querySelectorAll('input:checked')).map(c => c.value);

            // Şehir listesini Bölge seçimine göre süz
            let cityPool = allBayiler;
            if (selBolge.length > 0) cityPool = cityPool.filter(b => selBolge.includes(b.bolge));
            const availableCities = [...new Set(cityPool.map(b => b.sehir).filter(Boolean))].sort();
            renderCheckboxList(bulkAssignFilterSehir, availableCities, selSehir, refreshBulkFilters);

            // Yönetmen listesini Bölge ve Şehir seçimine göre süz
            let yonPool = cityPool;
            if (selSehir.length > 0) yonPool = yonPool.filter(b => selSehir.includes(b.sehir));
            const availableYons = [...new Set(yonPool.map(b => b.yonetmen).filter(Boolean))].sort();
            renderCheckboxList(bulkAssignFilterYonetmen, availableYons, selYon, refreshBulkFilters);
            
            // AKILLI ÖZELLİK: Eğer bir yönetmen seçildiyse, "Sadece Atanmamışları" kutucuğunu otomatik kaldır.
            // Çünkü kullanıcı muhtemelen bir "Değişiklik/Transfer" yapmak istiyordur.
            if (selYon.length > 0) {
                bulkAssignOnlyUnassigned.checked = false;
            }
        }

        // Checkbox listesi oluşturma yardımcı fonksiyonu
        function renderCheckboxList(containerEl, list, selectedValues, onChange) {
            containerEl.innerHTML = '';
            list.forEach(val => {
                const label = document.createElement('label');
                const isChecked = selectedValues.includes(val);
                label.innerHTML = `<input type="checkbox" value="${val}" ${isChecked ? 'checked' : ''}> ${val}`;
                label.querySelector('input').onchange = onChange;
                containerEl.appendChild(label);
            });
        }

        // Ana Bölgeleri Oluştur
        const allBolgeler = [...new Set(allBayiler.map(b => b.bolge).filter(Boolean))].sort();
        renderCheckboxList(bulkAssignFilterBolge, allBolgeler, [], refreshBulkFilters);
        
        // İlk yüklemede diğerlerini tetikle
        refreshBulkFilters();

        // Kullanıcı seçim listesi
        bulkAssignUserSelect.innerHTML = '<option value="">Seçiniz...</option>';
        allUsers.forEach(u => {
            const o = document.createElement('option'); 
            o.value = u.id; 
            o.textContent = u.name || u.email;
            bulkAssignUserSelect.appendChild(o);
        });

        bulkAssignUserContainer.style.display = 'block';
        bulkAssignTextContainer.style.display = 'none';
        bulkAssignModal.style.display = 'flex';
    }

    async function executeBulkAssign() {
        const type = bulkAssignTypeSelect.value;
        const val = type === 'sorumlu_kullanici' ? bulkAssignUserSelect.value : bulkAssignTextInput.value.trim();
        
        if (!val && type === 'yonetmen') return alert('Lütfen atanacak değeri yazın.');
        if (type === 'sorumlu_kullanici' && !val) return alert('Lütfen bir kullanıcı seçin.');

        const selBolge = Array.from(bulkAssignFilterBolge.querySelectorAll('input:checked')).map(c => c.value);
        const selSehir = Array.from(bulkAssignFilterSehir.querySelectorAll('input:checked')).map(c => c.value);
        const selYon = Array.from(bulkAssignFilterYonetmen.querySelectorAll('input:checked')).map(c => c.value);

        let targets = allBayiler;
        // Filtreleri Uygula (İl, Bölge, Eski Yönetmen vb.)
        if (selBolge.length > 0) targets = targets.filter(b => selBolge.includes(b.bolge));
        if (selSehir.length > 0) targets = targets.filter(b => selSehir.includes(b.sehir));
        if (selYon.length > 0) targets = targets.filter(b => selYon.includes(b.yonetmen));

        // Eğer "Sadece Atanmamış" işaretliyse, dolu olanları atla
        if (bulkAssignOnlyUnassigned.checked) {
            targets = targets.filter(b => !b[type]);
        }

        if (targets.length === 0) return alert('Kriterlere uyan bayi bulunamadı.');
        if (!confirm(`${targets.length} bayi güncellenecek. Bu işlem, seçili kriterlere uyan bayilerin verisini değiştirecektir. Onaylıyor musunuz?`)) return;

        showBulkAssignLoading(true, 'Güncelleniyor...');
        
        // Chunk'lı güncelleme
        const chunkSize = 20;
        for (let i = 0; i < targets.length; i += chunkSize) {
            const chunk = targets.slice(i, i + chunkSize);
            await Promise.all(chunk.map(async (b) => {
                const data = {}; data[type] = val;
                try { await pb.collection('bayiler').update(b.id, data); } catch (e) { console.error(e); }
            }));
            bulkAssignLoadingText.textContent = `${Math.min(i + chunkSize, targets.length)} / ${targets.length} güncellendi...`;
        }

        showBulkAssignLoading(false);
        bulkAssignModal.style.display = 'none';
        await loadModuleData();
        alert('Toplu güncelleme tamamlandı.');
    }

    function showBulkAssignLoading(s, t) {
        bulkAssignLoadingText.textContent = t;
        bulkAssignLoadingOverlay.style.display = s ? 'flex' : 'none';
    }

    function showLoading(show) {
        if (loadingSpinner) loadingSpinner.style.display = show ? 'block' : 'none';
    }

    // --- OLAY DİNLEYİCİLERİ ---
    container.querySelector('#btn-yeni-bayi').addEventListener('click', () => { 
        bayiForm.reset(); bayiIdInput.value = ''; modalTitle.textContent = 'Yeni Bayi Ekle'; modal.style.display = 'flex'; 
    });
    container.querySelector('#btn-modal-cancel').addEventListener('click', () => modal.style.display = 'none');
    bayiForm.addEventListener('submit', handleFormSubmit);
    container.querySelector('#btn-view-selected').addEventListener('click', applyColumnVisibility);
    
    // Excel Export
    container.querySelector('#btn-export-excel').addEventListener('click', () => {
        // Mevcut görünür tabloyu Excel'e aktar
        const table = document.getElementById('bayi-table');
        const wb = XLSX.utils.table_to_book(table, {sheet: "Bayiler"});
        XLSX.writeFile(wb, "Bayi_Listesi.xlsx");
    });

    // Import Modal Açma (EKSİK OLAN KISIM EKLENDİ)
    if (btnOpenImportModal) {
        btnOpenImportModal.addEventListener('click', openImportModal);
    }

    // Toplu Atama Listenerları
    btnOpenBulkAssignModal.addEventListener('click', openBulkAssignModal);
    btnExecuteBulkAssign.addEventListener('click', executeBulkAssign);
    btnBulkAssignCancel.addEventListener('click', () => bulkAssignModal.style.display = 'none');
    
    bulkAssignTypeSelect.addEventListener('change', () => {
        const isUser = bulkAssignTypeSelect.value === 'sorumlu_kullanici';
        bulkAssignUserContainer.style.display = isUser ? 'block' : 'none';
        bulkAssignTextContainer.style.display = isUser ? 'none' : 'block';
    });

    // Başlangıç Yüklemesi
    loadModuleData();
}