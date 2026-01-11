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
    
    // Excel kütüphanesini arka planda yükle, açılışı engellemesin
    loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js').catch(() => {
        console.warn('Excel kütüphanesi yüklenemedi, raporlama çalışmayabilir.');
    });

    const pb = pbInstance; 
    let allBayiler = []; 
    let allUsers = [];   

    const container = document.getElementById('bayi-yonetici-container');
    if (!container) return; 

    const mainTable = container.querySelector('#bayi-table'); 
    const tableBody = container.querySelector('#bayi-table-body');
    const loadingSpinner = container.querySelector('#loading-spinner');
    
    const modal = container.querySelector('#bayi-modal');
    const modalTitle = container.querySelector('#modal-title');
    const bayiForm = container.querySelector('#bayi-form');
    const bayiIdInput = container.querySelector('#bayi-id');
    const uzmanSelect = container.querySelector('#sorumlu_kullanici');
    
    const dropdownFilter = container.querySelector('#kontrol-filtresi');
    const searchInputs = container.querySelectorAll('.column-search-input');
    const columnCheckboxesContainer = container.querySelector('#column-checkboxes');
    
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

    const importModal = container.querySelector('#import-modal');
    const importStep1 = container.querySelector('#import-step-1');
    const importStep2 = container.querySelector('#import-step-2');
    const importStep3 = container.querySelector('#import-step-3');
    const excelFileInput = container.querySelector('#excel-file-input');
    const btnProcessExcel = container.querySelector('#btn-process-excel');
    const mappingContainer = container.querySelector('#mapping-container');
    const importWarning = container.querySelector('#import-warning');
    const btnExecuteImport = container.querySelector('#btn-execute-import');
    const importLoadingOverlay = container.querySelector('#import-loading-overlay');
    const importLoadingText = container.querySelector('#import-loading-text');
    const importResults = container.querySelector('#import-results');

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

    async function loadModuleData() {
        showLoading(true);
        try {
            // Kullanıcıları çek
            try {
                allUsers = await pb.collection('users').getFullList({ sort: 'name' });
            } catch (e) { console.error("Kullanıcı listesi alınamadı:", e); }

            // Bayileri çek
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
            populateGlobalUserDropdown(); 
            populateColumnCheckboxes(); 
            setupFilterListeners(); 
            applyAllFilters(); 
            
        } catch (error) {
            console.error('Veri yüklenirken hata:', error);
            alert('Bayi listesi yüklenirken bir sorun oluştu. Lütfen sayfayı yenileyin.');
        } finally {
            showLoading(false);
        }
    }

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
        const globalSelect = container.querySelector('#import-global-user-select');
        if (!globalSelect) return;
        globalSelect.innerHTML = '<option value="">Tüm Bayileri Bu Kullanıcıya Ata (Opsiyonel)</option>';
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
        if (!columnCheckboxesContainer) return;
        columnCheckboxesContainer.innerHTML = '';
        fields.forEach(field => {
            const label = document.createElement('label');
            label.innerHTML = `<input type="checkbox" class="column-check" value="${field.key}"> ${field.label}`;
            columnCheckboxesContainer.appendChild(label);
        });
    }

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
            switch (filterValue) {
                case 'no_bolge': passDropdown = !bayi.bolge; break;
                case 'no_sehir': passDropdown = !bayi.sehir; break;
                case 'no_ilce': passDropdown = !bayi.ilce; break;
                case 'no_yonetmen': passDropdown = !bayi.yonetmen; break; 
                case 'no_uzman': passDropdown = !bayi.sorumlu_kullanici_email; break;
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
        if (!columnCheckboxesContainer || !mainTable) return;
        const selectedKeys = Array.from(columnCheckboxesContainer.querySelectorAll('.column-check:checked')).map(cb => cb.value);
        const showAll = selectedKeys.length === 0;
        allFieldKeys.forEach(key => {
            const cells = mainTable.querySelectorAll(`[data-column="${key}"]`);
            cells.forEach(cell => cell.style.display = (showAll || selectedKeys.includes(key)) ? 'table-cell' : 'none');
        });
        mainTable.querySelectorAll('[data-column="eylemler"]').forEach(cell => cell.style.display = 'table-cell');
    }

    function openBulkAssignModal() {
        bulkAssignFilterBolge.innerHTML = '';
        bulkAssignFilterSehir.innerHTML = '';
        bulkAssignFilterYonetmen.innerHTML = '';
        bulkAssignTextInput.value = '';
        bulkAssignTypeSelect.value = 'sorumlu_kullanici';
        
        const getUniqueList = (key) => [...new Set(allBayiler.map(b => b[key]).filter(Boolean))].sort();
        
        const buildChecks = (list, container) => {
            list.forEach(val => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="${val}"> ${val}`;
                container.appendChild(label);
            });
        };

        buildChecks(getUniqueList('bolge'), bulkAssignFilterBolge);
        buildChecks(getUniqueList('sehir'), bulkAssignFilterSehir);
        buildChecks(getUniqueList('yonetmen'), bulkAssignFilterYonetmen);

        bulkAssignUserSelect.innerHTML = '<option value="">Seçiniz...</option>';
        allUsers.forEach(u => {
            if (u.role === 'client' || u.role === 'admin') {
                const o = document.createElement('option'); o.value = u.id; o.textContent = u.name || u.email;
                bulkAssignUserSelect.appendChild(o);
            }
        });

        bulkAssignUserContainer.style.display = 'block';
        bulkAssignTextContainer.style.display = 'none';
        bulkAssignModal.style.display = 'flex';
    }

    async function executeBulkAssign() {
        const type = bulkAssignTypeSelect.value;
        const val = type === 'sorumlu_kullanici' ? bulkAssignUserSelect.value : bulkAssignTextInput.value.trim();
        
        if (!val) return alert('Lütfen atanacak değeri seçin veya yazın.');

        const selBolge = Array.from(bulkAssignFilterBolge.querySelectorAll('input:checked')).map(c => c.value);
        const selSehir = Array.from(bulkAssignFilterSehir.querySelectorAll('input:checked')).map(c => c.value);
        const selYon = Array.from(bulkAssignFilterYonetmen.querySelectorAll('input:checked')).map(c => c.value);

        let targets = allBayiler;
        if (selBolge.length > 0) targets = targets.filter(b => selBolge.includes(b.bolge));
        if (selSehir.length > 0) targets = targets.filter(b => selSehir.includes(b.sehir));
        if (selYon.length > 0) targets = targets.filter(b => selYon.includes(b.yonetmen));

        if (bulkAssignOnlyUnassigned.checked) {
            targets = targets.filter(b => !b[type]);
        }

        if (targets.length === 0) return alert('Kriterlere uyan bayi bulunamadı.');
        if (!confirm(`${targets.length} bayi güncellenecek. Onaylıyor musunuz?`)) return;

        showBulkAssignLoading(true, 'Güncelleniyor...');
        for (const b of targets) {
            const data = {}; data[type] = val;
            try { await pb.collection('bayiler').update(b.id, data); } catch (e) {}
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

    // Olay Dinleyicileri
    container.querySelector('#btn-yeni-bayi').addEventListener('click', () => { 
        bayiForm.reset(); bayiIdInput.value = ''; modalTitle.textContent = 'Yeni Bayi Ekle'; modal.style.display = 'flex'; 
    });
    container.querySelector('#btn-modal-cancel').addEventListener('click', () => modal.style.display = 'none');
    bayiForm.addEventListener('submit', handleFormSubmit);
    container.querySelector('#btn-view-selected').addEventListener('click', applyColumnVisibility);
    btnOpenBulkAssignModal.addEventListener('click', openBulkAssignModal);
    btnExecuteBulkAssign.addEventListener('click', executeBulkAssign);
    btnBulkAssignCancel.addEventListener('click', () => bulkAssignModal.style.display = 'none');
    
    bulkAssignTypeSelect.addEventListener('change', () => {
        const isUser = bulkAssignTypeSelect.value === 'sorumlu_kullanici';
        bulkAssignUserContainer.style.display = isUser ? 'block' : 'none';
        bulkAssignTextContainer.style.display = isUser ? 'none' : 'block';
    });

    // Verileri yükle
    loadModuleData();
}