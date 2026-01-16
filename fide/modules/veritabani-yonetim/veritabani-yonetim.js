/* fide/modules/veritabani-yonetim/veritabani-yonetim.js */

export async function initializeVeritabaniYonetimModule(pb) {
    const wrapper = document.getElementById('db-manager-wrapper');
    if (!wrapper) return;

    loadStats(pb);
    setupEventListeners(pb);
}

/**
 * Ayar anahtarları için kullanıcı dostu isimler, açıklamalar ve simgeler
 */
const SETTINGS_INFO = {
    'fideQuestionsData': {
        title: 'FiDe Soru & Ürün Listesi',
        desc: 'Tüm denetim sorularını ve sipariş verilebilecek ürünlerin envanter bilgisini içerir.',
        icon: 'fa-clipboard-list',
        color: '#3b82f6'
    },
    'emailTemplate': {
        title: 'E-posta Rapor Şablonu',
        desc: 'Denetim sonunda oluşturulan e-postanın görsel formatını ve yazı içeriğini belirler.',
        icon: 'fa-envelope-open-text',
        color: '#10b981'
    },
    'aylikHedef': {
        title: 'Global Denetim Hedefi',
        desc: 'Sistem genelindeki aylık performans hedefini (örn: 47) belirleyen merkezi ayar.',
        icon: 'fa-bullseye',
        color: '#f59e0b'
    },
    'migrationMap': {
        title: 'ID Yönlendirme Kuralları',
        desc: 'Eski soru verilerinin yeni soru numaralarına otomatik aktarılmasını sağlar.',
        icon: 'fa-random',
        color: '#6366f1'
    }
};

function getSettingDetails(key) {
    if (SETTINGS_INFO[key]) return SETTINGS_INFO[key];
    if (key.startsWith('excel_mapping_')) {
        return { title: 'Excel Eşleştirmesi', desc: 'Dosya yükleme sihirbazında kullanılan sütun yapılandırması.', icon: 'fa-map-marked-alt', color: '#8b5cf6' };
    }
    return { title: key, desc: 'Sistem tarafından kullanılan teknik yapılandırma verisi.', icon: 'fa-cog', color: '#64748b' };
}

/**
 * Ortak Modal Penceresini Gösterir
 */
function showCommonModal(title, bodyHtml, footerHtml) {
    const modal = document.getElementById('db-common-modal');
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = bodyHtml;
    document.getElementById('modal-footer').innerHTML = footerHtml;
    modal.style.display = 'flex';
}

function closeCommonModal() {
    document.getElementById('db-common-modal').style.display = 'none';
}

window.closeCommonModal = closeCommonModal;

/**
 * İstatistikleri Yükler
 */
async function loadStats(pb) {
    try {
        const statsConfig = {
            'bayiler': 'count-bayiler',
            'users': 'count-users',
            'denetim_raporlari': 'count-raporlar',
            'excel_verileri': 'count-excel',
            'user_devices': 'count-cihazlar'
        };
        for (const [collection, elementId] of Object.entries(statsConfig)) {
            const result = await pb.collection(collection).getList(1, 1, { fields: 'id' });
            const el = document.getElementById(elementId);
            if (el) el.textContent = result.totalItems;
        }
    } catch (e) { console.error("İstatistik hatası:", e); }
}

/**
 * Olay Dinleyicileri
 */
function setupEventListeners(pb) {
    document.getElementById('btn-refresh-stats').onclick = () => loadStats(pb);
    document.getElementById('btn-close-modal').onclick = closeCommonModal;

    // --- KULLANICI SİLME & VERİ AKTARIMI ---
    document.getElementById('btn-action-user-delete').onclick = async () => {
        const users = await pb.collection('users').getFullList({ sort: 'name' });
        
        const bodyHtml = `
            <div class="db-form-group">
                <label>İşlem Yapılacak Kullanıcıyı Seçin</label>
                <select id="modal-select-user" class="db-input">
                    <option value="">-- Kullanıcı Seçin --</option>
                    ${users.filter(u => u.id !== pb.authStore.model.id).map(u => `<option value="${u.id}">${u.name || u.email} (${u.role})</option>`).join('')}
                </select>
            </div>
            
            <div id="modal-analysis-area" style="display:none; margin-top:15px;"></div>

            <div id="modal-strategy-area" style="display:none; margin-top:20px;">
                <label style="font-weight:700; font-size:14px; display:block; margin-bottom:12px;">Bir Veri Stratejisi Seçin</label>
                <div class="db-card-grid">
                    <label class="db-card-option">
                        <input type="radio" name="del-strat" value="delete" checked>
                        <div class="card-option-content">
                            <div class="card-option-icon icon-danger"><i class="fas fa-trash-alt"></i></div>
                            <div class="card-option-info">
                                <strong>Kalıcı Olarak Sil</strong>
                                <small>Kullanıcıyı, ona ait tüm raporları ve cihazları tamamen temizler.</small>
                            </div>
                        </div>
                    </label>
                    <label class="db-card-option">
                        <input type="radio" name="del-strat" value="transfer">
                        <div class="card-option-content">
                            <div class="card-option-icon icon-primary"><i class="fas fa-file-export"></i></div>
                            <div class="card-option-info">
                                <strong>Verileri Başkasına Aktar</strong>
                                <small>Kullanıcıyı siler ancak mevcut raporlarını ve bayilerini başka birine taşır.</small>
                            </div>
                        </div>
                    </label>
                </div>

                <div id="modal-transfer-select" style="display:none; margin-top:15px;" class="db-form-group">
                    <label>Verilerin Aktarılacağı Hedef Kullanıcı</label>
                    <select id="modal-select-target" class="db-input">
                        <option value="">-- Hedef Seçin --</option>
                        ${users.map(u => `<option value="${u.id}">${u.name || u.email}</option>`).join('')}
                    </select>
                </div>
            </div>
        `;

        const footerHtml = `
            <button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button>
            <button id="modal-btn-execute" class="btn-danger btn-sm" disabled>İşlemi Onayla</button>
        `;

        showCommonModal('Kullanıcı Silme & Veri Yönetimi', bodyHtml, footerHtml);

        const selectUser = document.getElementById('modal-select-user');
        const analysisArea = document.getElementById('modal-analysis-area');
        const strategyArea = document.getElementById('modal-strategy-area');
        const executeBtn = document.getElementById('modal-btn-execute');

        selectUser.onchange = async () => {
            const userId = selectUser.value;
            if (!userId) { analysisArea.style.display = 'none'; strategyArea.style.display = 'none'; executeBtn.disabled = true; return; }
            
            analysisArea.style.display = 'block';
            analysisArea.innerHTML = '<div class="db-stat-card-mini"><i class="fas fa-spinner fa-spin"></i> Veriler analiz ediliyor...</div>';
            
            const reports = await pb.collection('denetim_raporlari').getFullList({ filter: `user="${userId}"` });
            const bayiler = await pb.collection('bayiler').getFullList({ filter: `sorumlu_kullanici="${userId}"` });
            
            analysisArea.innerHTML = `
                <div class="db-analysis-info-card">
                    <p><strong>${reports.length}</strong> Denetim Raporu ve <strong>${bayiler.length}</strong> Sorumlu Bayi kaydı bulundu.</p>
                </div>
            `;
            strategyArea.style.display = 'block'; executeBtn.disabled = false;
        };

        document.getElementById('modal-body').onclick = (e) => {
            const radio = e.target.closest('.db-card-option')?.querySelector('input');
            if (radio && radio.name === 'del-strat') {
                document.getElementById('modal-transfer-select').style.display = (radio.value === 'transfer') ? 'block' : 'none';
            }
        };

        executeBtn.onclick = async () => {
            const userId = selectUser.value;
            const strategy = document.querySelector('input[name="del-strat"]:checked').value;
            const targetId = document.getElementById('modal-select-target').value;
            if (strategy === 'transfer' && !targetId) return alert("Lütfen hedef kullanıcıyı seçin.");
            if (!confirm("Bu işlem geri alınamaz. Onaylıyor musunuz?")) return;

            executeBtn.disabled = true; executeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> İşleniyor...';
            try {
                // Cihazları temizle
                const devices = await pb.collection('user_devices').getFullList({ filter: `user="${userId}"` });
                for (const d of devices) await pb.collection('user_devices').delete(d.id);

                if (strategy === 'transfer') {
                    const reports = await pb.collection('denetim_raporlari').getFullList({ filter: `user="${userId}"` });
                    for (const r of reports) await pb.collection('denetim_raporlari').update(r.id, { user: targetId });
                    const bayiler = await pb.collection('bayiler').getFullList({ filter: `sorumlu_kullanici="${userId}"` });
                    for (const b of bayiler) await pb.collection('bayiler').update(b.id, { sorumlu_kullanici: targetId });
                } else {
                    const reports = await pb.collection('denetim_raporlari').getFullList({ filter: `user="${userId}"` });
                    for (const r of reports) await pb.collection('denetim_raporlari').delete(r.id);
                    const bayiler = await pb.collection('bayiler').getFullList({ filter: `sorumlu_kullanici="${userId}"` });
                    for (const b of bayiler) await pb.collection('bayiler').update(b.id, { sorumlu_kullanici: null });
                }
                await pb.collection('users').delete(userId);
                alert("İşlem başarıyla tamamlandı."); location.reload();
            } catch (err) { alert("Hata: " + err.message); executeBtn.disabled = false; }
        };
    };

    // --- SİSTEM AYARLARINI YEDEKLE ---
    document.getElementById('btn-export-settings').onclick = async () => {
        try {
            const records = await pb.collection('ayarlar').getFullList();
            const bodyHtml = `
                <p style="font-size:13px; margin-bottom:15px; color:#64748b;">Yedeklemek istediğiniz canlı sistem ayarlarını seçin:</p>
                <div class="db-selection-list">
                    ${records.map(r => {
                        const info = getSettingDetails(r.anahtar);
                        return `
                        <label class="db-card-option-mini">
                            <input type="checkbox" name="backup-item" value="${r.id}" checked>
                            <div class="mini-card-content">
                                <div class="mini-card-icon" style="background-color: ${info.color}15; color: ${info.color}">
                                    <i class="fas ${info.icon}"></i>
                                </div>
                                <div class="mini-card-info">
                                    <strong>${info.title}</strong>
                                    <small>${info.desc}</small>
                                </div>
                            </div>
                        </label>
                    `}).join('')}
                </div>
            `;
            const footerHtml = `
                <button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button>
                <button id="modal-btn-export-execute" class="btn-success btn-sm">Yedeği İndir</button>
            `;
            showCommonModal('Sistem Ayarlarını Yedekle', bodyHtml, footerHtml);

            document.getElementById('modal-btn-export-execute').onclick = () => {
                const selectedIds = Array.from(document.querySelectorAll('input[name="backup-item"]:checked')).map(cb => cb.value);
                if(selectedIds.length === 0) return alert("En az bir ayar seçmelisiniz.");
                const filteredRecords = records.filter(r => selectedIds.includes(r.id));
                const link = document.createElement('a');
                link.href = URL.createObjectURL(new Blob([JSON.stringify(filteredRecords, null, 2)], { type: 'application/json' }));
                link.download = `fide_canli_yedek_${new Date().toISOString().slice(0,10)}.json`;
                link.click();
                closeCommonModal();
            };
        } catch (e) { alert("Hata: " + e.message); }
    };

    // --- YEDEKTEN GERİ YÜKLE ---
    document.getElementById('input-import-settings').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const backupData = JSON.parse(ev.target.result);
                const bodyHtml = `
                    <p style="font-size:13px; margin-bottom:15px; color:#64748b;">Yedek dosyası içerisinden yüklemek istediklerinizi seçin:</p>
                    <div class="db-selection-list">
                        ${backupData.map((item, index) => {
                            const info = getSettingDetails(item.anahtar);
                            return `
                            <label class="db-card-option-mini">
                                <input type="checkbox" name="restore-item" value="${index}" checked>
                                <div class="mini-card-content">
                                    <div class="mini-card-icon" style="background-color: ${info.color}15; color: ${info.color}">
                                        <i class="fas ${info.icon}"></i>
                                    </div>
                                    <div class="mini-card-info">
                                        <strong>${info.title}</strong>
                                        <small>${info.desc}</small>
                                    </div>
                                </div>
                            </label>
                        `}).join('')}
                    </div>
                `;
                const footerHtml = `
                    <button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button>
                    <button id="modal-btn-restore-execute" class="btn-primary btn-sm">Seçilenleri Yükle</button>
                `;
                showCommonModal('Yedekten Geri Yükle', bodyHtml, footerHtml);

                document.getElementById('modal-btn-restore-execute').onclick = async () => {
                    const selectedIdx = Array.from(document.querySelectorAll('input[name="restore-item"]:checked')).map(cb => parseInt(cb.value));
                    if(selectedIdx.length === 0) return alert("En az bir ayar seçmelisiniz.");
                    if(!confirm("Mevcut ayarlar üzerine yazılacaktır. Onaylıyor musunuz?")) return;

                    const executeBtn = document.getElementById('modal-btn-restore-execute');
                    executeBtn.disabled = true; executeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yükleniyor...';

                    try {
                        for (const idx of selectedIdx) {
                            const item = backupData[idx];
                            try {
                                const existing = await pb.collection('ayarlar').getFirstListItem(`anahtar="${item.anahtar}"`);
                                await pb.collection('ayarlar').update(existing.id, { deger: item.deger });
                            } catch (err) {
                                if(err.status === 404) await pb.collection('ayarlar').create({ anahtar: item.anahtar, deger: item.deger });
                            }
                        }
                        alert("Geri yükleme tamamlandı."); location.reload();
                    } catch (err) { alert("Hata: " + err.message); executeBtn.disabled = false; }
                };
            } catch (err) { alert("Geçersiz yedek dosyası!"); }
        };
        reader.readAsText(file);
        e.target.value = ''; 
    };

    // Temizlik Butonları
    document.getElementById('btn-action-reset-mappings').onclick = async () => {
        const mappings = await pb.collection('ayarlar').getFullList({ filter: 'anahtar ~ "excel_mapping_"' });
        if(mappings.length === 0) return alert("Sıfırlanacak ayar bulunamadı.");
        if(confirm(`Toplam ${mappings.length} adet sütun eşleştirmesi silinecektir. Emin misiniz?`)) {
            for(const item of mappings) await pb.collection('ayarlar').delete(item.id);
            alert("Sıfırlandı."); location.reload();
        }
    };
    document.getElementById('btn-clear-excel').onclick = async () => {
        if (confirm("Tüm ham Excel verileri silinecektir?")) await clearCollection(pb, 'excel_verileri', "Excel");
    };
    document.getElementById('btn-clear-reports').onclick = async () => {
        if (confirm("Tüm raporlar silinecektir?") && prompt("SİL yazın") === "SİL") await clearCollection(pb, 'denetim_raporlari', "Raporlar");
    };
    document.getElementById('btn-clear-undone').onclick = async () => {
        if (confirm("Geri alma kayıtları temizlensin mi?")) await clearCollection(pb, 'denetim_geri_alinanlar', "Geri Al Log");
    };
}

async function clearCollection(pb, collection, label) {
    const records = await pb.collection(collection).getFullList({ fields: 'id' });
    if (records.length === 0) return alert("Zaten temiz.");
    for (const r of records) await pb.collection(collection).delete(r.id);
    alert(label + " temizlendi.");
    location.reload();
}