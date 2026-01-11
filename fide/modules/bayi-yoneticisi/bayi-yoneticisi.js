// Gerekli kütüphaneleri (ExcelJS) dinamik olarak yüklemek için bir yardımcı fonksiyon
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
 */
export async function initializeBayiYoneticisiModule(pbInstance) {
    
    // Excel kütüphanesini yükle
    try {
        await loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
    } catch (error) {
        console.error('Excel kütüphanesi yüklenemedi:', error);
        alert('Raporlama özelliği için gerekli Excel kütüphanesi yüklenemedi.');
    }

    const pb = pbInstance; 
    let allBayiler = []; 
    let allUsers = [];   

    const container = document.getElementById('bayi-yonetici-container');
    if (!container) return; 

    const mainTable = document.getElementById('bayi-table'); 
    const tableBody = document.getElementById('bayi-table-body');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    const modal = document.getElementById('bayi-modal');
    const modalTitle = document.getElementById('modal-title');
    const bayiForm = document.getElementById('bayi-form');
    const bayiIdInput = document.getElementById('bayi-id');
    const uzmanSelect = document.getElementById('sorumlu_kullanici');
    
    const dropdownFilter = document.getElementById('kontrol-filtresi');
    const searchInputs = document.querySelectorAll('.column-search-input');
    const columnCheckboxesContainer = document.getElementById('column-checkboxes');
    
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

    // Yeni Toplu Atama Alanları
    const bulkAssignTypeSelect = document.getElementById('bulk-assign-type-select');
    const bulkAssignUserContainer = document.getElementById('bulk-assign-user-select-container');
    const bulkAssignTextContainer = document.getElementById('bulk-assign-text-input-container');
    const bulkAssignTextInput = document.getElementById('bulk-assign-text-input');
    const bulkAssignOnlyUnassigned = document.getElementById('bulk-assign-only-unassigned');

    async function loadModuleData() {
        showLoading(true);
        try {
            allUsers = await pb.collection('users').getFullList({ sort: 'name' });
            allBayiler = await pb.collection('bayiler').getFullList({
                sort: '-created',
                expand: 'sorumlu_kullanici' 
            });

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
            console.error('Veri yüklenirken hata:', error);
        } finally {
            showLoading(false);
        }
    }

    function renderBayiTable(bayilerToRender) {
        tableBody.innerHTML = ''; 
        if (bayilerToRender.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 20px;">Bayi bulunamadı.</td></tr>';
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
        const globalSelect = document.getElementById('import-global-user-select');
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

    async function handleFormSubmit(event) {
        event.preventDefault(); 
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
            sorumlu_kullanici: document.getElementById('sorumlu_kullanici').value || null 
        };
        try {
            if (bayiId) await pb.collection('bayiler').update(bayiId, data);
            else await pb.collection('bayiler').create(data);
            modal.style.display = 'none';
            await loadModuleData();
        } catch (error) {
            alert('Hata: ' + error.message);
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
                showLoading(false);
            }
        }
    }

    function setupFilterListeners() {
        dropdownFilter.addEventListener('change', applyAllFilters);
        searchInputs.forEach(input => input.addEventListener('input', applyAllFilters));
    }

    function applyAllFilters() {
        const filterValue = dropdownFilter.value;
        const searchValues = {};
        searchInputs.forEach(input => searchValues[input.dataset.column] = input.value.toLowerCase());

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
        const selectedKeys = Array.from(columnCheckboxesContainer.querySelectorAll('.column-check:checked')).map(cb => cb.value);
        const showAll = selectedKeys.length === 0;
        allFieldKeys.forEach(key => {
            const cells = mainTable.querySelectorAll(`[data-column="${key}"]`);
            cells.forEach(cell => cell.style.display = (showAll || selectedKeys.includes(key)) ? 'table-cell' : 'none');
        });
        mainTable.querySelectorAll('[data-column="eylemler"]').forEach(cell => cell.style.display = 'table-cell');
    }

    // --- TOPLU ATAMA (BULK ASSIGN) ---
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

    // Event Listeners
    document.getElementById('btn-yeni-bayi').addEventListener('click', () => { bayiForm.reset(); bayiIdInput.value = ''; modalTitle.textContent = 'Yeni Bayi Ekle'; modal.style.display = 'flex'; });
    document.getElementById('btn-modal-cancel').addEventListener('click', () => modal.style.display = 'none');
    bayiForm.addEventListener('submit', handleFormSubmit);
    document.getElementById('btn-view-selected').addEventListener('click', applyColumnVisibility);
    document.getElementById('btn-open-bulk-assign-modal').addEventListener('click', openBulkAssignModal);
    btnExecuteBulkAssign.addEventListener('click', executeBulkAssign);
    btnBulkAssignCancel.addEventListener('click', () => bulkAssignModal.style.display = 'none');
    
    bulkAssignTypeSelect.addEventListener('change', () => {
        const isUser = bulkAssignTypeSelect.value === 'sorumlu_kullanici';
        bulkAssignUserContainer.style.display = isUser ? 'block' : 'none';
        bulkAssignTextContainer.style.display = isUser ? 'none' : 'block';
    });

    loadModuleData();
}