/* fide/modules/veritabani-yonetim/veritabani-yonetim.js */

export async function initializeVeritabaniYonetimModule(pb) {
    const wrapper = document.getElementById('db-manager-wrapper');
    if (!wrapper) return;

    loadStats(pb);
    setupEventListeners(pb);
}

/**
 * Ayar anahtarları için kullanıcı dostu bilgiler
 */
const SETTINGS_INFO = {
    'fideQuestionsData': {
        title: 'FiDe Soru & Ürün Listesi',
        desc: 'Tüm denetim sorularını ve ürün envanter bilgisini içerir.',
        icon: 'fa-clipboard-list',
        color: '#3b82f6'
    },
    'emailTemplate': {
        title: 'E-posta Rapor Şablonu',
        desc: 'Raporların e-posta formatını ve içeriğini belirler.',
        icon: 'fa-envelope-open-text',
        color: '#10b981'
    },
    'aylikHedef': {
        title: 'Global Denetim Hedefi',
        desc: 'Merkezi aylık performans hedefi ayarı.',
        icon: 'fa-bullseye',
        color: '#f59e0b'
    },
    'migrationMap': {
        title: 'ID Yönlendirme Kuralları',
        desc: 'Eski verilerin yeni numaralara aktarılmasını sağlar.',
        icon: 'fa-random',
        color: '#6366f1'
    }
};

function getSettingDetails(key) {
    if (SETTINGS_INFO[key]) return SETTINGS_INFO[key];
    if (key.startsWith('excel_mapping_')) {
        return { title: 'Excel Eşleştirmesi', desc: 'Sütun yapılandırma verisi.', icon: 'fa-map-marked-alt', color: '#8b5cf6' };
    }
    return { title: key, desc: 'Sistem teknik yapılandırma verisi.', icon: 'fa-cog', color: '#64748b' };
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

    // --- GÜNCELLENDİ: GELİŞMİŞ TEMİZLİK & BAKIM FONKSİYONU ---
    document.getElementById('btn-action-clean-maintenance').onclick = async () => {
        // Analiz Aşaması
        showCommonModal('Temizlik & Bakım Analizi', 
            '<div id="cleanup-analysis"><i class="fas fa-spinner fa-spin"></i> Veritabanı taranıyor, lütfen bekleyin...</div>', 
            '<button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button>');

        try {
            const todayStr = new Date().toISOString().split('T')[0];
            
            // Tüm raporları çekiyoruz
            const reports = await pb.collection('denetim_raporlari').getFullList({
                sort: '-created',
                fields: 'id,bayi,denetimTamamlanmaTarihi,created'
            });

            let idsToDelete = [];
            const reportGroups = {}; // Aynı bayi ve aynı gün olanları gruplandırmak için

            // 1. ADIM: Raporları Gruplandır
            reports.forEach(r => {
                const dateOnly = r.created.split(' ')[0];
                const groupKey = `${r.bayi}_${dateOnly}`;
                
                if (!reportGroups[groupKey]) {
                    reportGroups[groupKey] = { finished: [], drafts: [] };
                }
                
                if (r.denetimTamamlanmaTarihi && r.denetimTamamlanmaTarihi !== "") {
                    reportGroups[groupKey].finished.push(r);
                } else {
                    reportGroups[groupKey].drafts.push(r);
                }
            });

            // 2. ADIM: Analiz Et ve Silinecekleri Belirle
            for (const key in reportGroups) {
                const group = reportGroups[key];
                const dateOfGroup = key.split('_')[1];

                if (group.finished.length > 0) {
                    // Eğer bu bayi/gün için tamamlanmış rapor(lar) varsa:
                    
                    // a) En güncelini koru, diğer tamamlanmış mükerrerleri sil listesine ekle
                    group.finished.sort((a, b) => b.denetimTamamlanmaTarihi.localeCompare(a.denetimTamamlanmaTarihi));
                    for (let i = 1; i < group.finished.length; i++) {
                        idsToDelete.push(group.finished[i].id);
                    }
                    
                    // b) Tamamlanmış olanın yanındaki tüm boş taslakları sil
                    group.drafts.forEach(d => idsToDelete.push(d.id));
                } else {
                    // Eğer tamamlanmış rapor YOKSA:
                    // Sadece geçmiş tarihlerde unutulmuş boş taslakları sil
                    if (dateOfGroup < todayStr) {
                        group.drafts.forEach(d => idsToDelete.push(d.id));
                    }
                }
            }

            // UI Güncelleme (Analiz Sonucu)
            if (idsToDelete.length === 0) {
                document.getElementById('modal-body').innerHTML = `
                    <div class="db-analysis-info-card">
                        <p><i class="fas fa-check-circle" style="color: green;"></i> Tertemiz! Temizlenecek gereksiz (mükerrer veya eski taslak) rapor bulunamadı.</p>
                    </div>`;
            } else {
                document.getElementById('modal-body').innerHTML = `
                    <div class="db-analysis-info-card">
                        <p><strong>${idsToDelete.length}</strong> adet gereksiz kayıt tespit edildi.</p>
                        <ul style="font-size: 12px; margin-top: 10px; text-align: left; padding-left: 20px;">
                            <li>Aynı gün girilen mükerrer tamamlanmış raporlar temizlenecek (En günceli kalacak).</li>
                            <li>Tamamlanmış raporların yanındaki boş taslaklar temizlenecek.</li>
                            <li>Eski tarihlerde yarım bırakılmış (boş) raporlar temizlenecek.</li>
                        </ul>
                    </div>`;
                
                document.getElementById('modal-footer').innerHTML += `
                    <button id="modal-btn-execute-cleanup" class="btn-danger btn-sm">Temizliği Başlat</button>`;

                document.getElementById('modal-btn-execute-cleanup').onclick = async () => {
                    const execBtn = document.getElementById('modal-btn-execute-cleanup');
                    execBtn.disabled = true;
                    execBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> İşlem Yapılıyor...';
                    
                    try {
                        for (const id of idsToDelete) {
                            await pb.collection('denetim_raporlari').delete(id);
                        }
                        alert("Bakım işlemi başarıyla tamamlandı. Mükerrer kayıtlar silindi.");
                        location.reload();
                    } catch (err) {
                        alert("Silme sırasında hata oluştu: " + err.message);
                        execBtn.disabled = false;
                    }
                };
            }

        } catch (err) {
            alert("Hata: " + err.message);
            closeCommonModal();
        }
    };

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
            <div id="modal-analysis-area" class="db-stat-card-mini" style="display:none;"></div>
            <div id="modal-strategy-area" style="display:none; margin-top:20px;">
                <label class="db-form-group-label">Bir Veri Stratejisi Seçin</label>
                <div class="db-card-grid">
                    <label class="db-card-option">
                        <input type="radio" name="del-strat" value="delete" checked>
                        <div class="card-option-content">
                            <div class="card-option-icon icon-danger"><i class="fas fa-trash-alt"></i></div>
                            <div class="card-option-info"><strong>Kalıcı Olarak Sil</strong><small>Her şeyi temizler.</small></div>
                        </div>
                    </label>
                    <label class="db-card-option">
                        <input type="radio" name="del-strat" value="transfer">
                        <div class="card-option-content">
                            <div class="card-option-icon icon-primary"><i class="fas fa-file-export"></i></div>
                            <div class="card-option-info"><strong>Verileri Aktar</strong><small>Başka birine taşır.</small></div>
                        </div>
                    </label>
                </div>
                <div id="modal-transfer-select" style="display:none; margin-top:15px;" class="db-form-group">
                    <label>Hedef Kullanıcı</label>
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
            analysisArea.style.display = 'block'; analysisArea.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analiz ediliyor...';
            const reports = await pb.collection('denetim_raporlari').getFullList({ filter: `user="${userId}"` });
            const bayiler = await pb.collection('bayiler').getFullList({ filter: `sorumlu_kullanici="${userId}"` });
            analysisArea.innerHTML = `<div class="db-analysis-info-card"><p><strong>${reports.length}</strong> Rapor ve <strong>${bayiler.length}</strong> Bayi kaydı bulundu.</p></div>`;
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
            if (!confirm("İşlem geri alınamaz. Onaylıyor musunuz?")) return;
            executeBtn.disabled = true; executeBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> İşleniyor...';
            try {
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
                alert("Başarıyla tamamlandı."); location.reload();
            } catch (err) { alert("Hata: " + err.message); executeBtn.disabled = false; }
        };
    };

    // --- SİSTEM AYARLARINI YEDEKLE ---
    document.getElementById('btn-export-settings').onclick = async () => {
        try {
            const settings = await pb.collection('ayarlar').getFullList();
            const reportsResult = await pb.collection('denetim_raporlari').getList(1, 1, { filter: 'denetimTamamlanmaTarihi != ""', fields: 'id' });
            const reportsCount = reportsResult.totalItems;

            const bodyHtml = `
                <p class="db-modal-desc">Yedeklemek istediğiniz verileri seçin:</p>
                <div class="db-modal-section-header">Yapılandırma</div>
                <div class="db-selection-list">
                    ${settings.map(r => {
                        const info = getSettingDetails(r.anahtar);
                        return `
                        <label class="db-card-option-mini">
                            <input type="checkbox" name="backup-item" value="setting:${r.id}" checked>
                            <div class="mini-card-content">
                                <div class="mini-card-icon" style="background-color: ${info.color}15; color: ${info.color}"><i class="fas ${info.icon}"></i></div>
                                <div class="mini-card-info"><strong>${info.title}</strong><small>${info.desc}</small></div>
                            </div>
                        </label>`;
                    }).join('')}
                </div>
                <div class="db-modal-section-header">Veriler</div>
                <div class="db-selection-list">
                    <label class="db-card-option-mini">
                        <input type="checkbox" name="backup-item" value="reports:all" ${reportsCount > 0 ? 'checked' : 'disabled'}>
                        <div class="mini-card-content">
                            <div class="mini-card-icon" style="background-color:#fee2e2; color:#ef4444"><i class="fas fa-file-invoice"></i></div>
                            <div class="mini-card-info"><strong>Tamamlanmış Raporlar</strong><small>Toplam ${reportsCount} adet rapor.</small></div>
                        </div>
                    </label>
                </div>
            `;
            const footerHtml = `
                <button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button>
                <button id="modal-btn-export-execute" class="btn-success btn-sm">Yedeği İndir</button>
            `;
            showCommonModal('Sistem Ayarlarını Yedekle', bodyHtml, footerHtml);

            document.getElementById('modal-btn-export-execute').onclick = async () => {
                const selected = Array.from(document.querySelectorAll('input[name="backup-item"]:checked')).map(cb => cb.value);
                if(!selected.length) return alert("Seçim yapın.");
                const btn = document.getElementById('modal-btn-export-execute');
                btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>...';
                try {
                    const payload = { type: 'fide_backup', version: '1.1', date: new Date().toISOString(), data: { settings: [], reports: [] } };
                    const sIds = selected.filter(v => v.startsWith('setting:')).map(v => v.split(':')[1]);
                    if (sIds.length) payload.data.settings = settings.filter(s => sIds.includes(s.id));
                    if (selected.includes('reports:all')) payload.data.reports = await pb.collection('denetim_raporlari').getFullList({ filter: 'denetimTamamlanmaTarihi != ""' });
                    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                    const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
                    link.download = `fide_yedek_${new Date().toISOString().slice(0,10)}.json`; link.click();
                    closeCommonModal();
                } catch (err) { alert("Yedekleme hatası: " + err.message); btn.disabled = false; }
            };
        } catch (e) { alert("Hata: " + e.message); }
    };

    // --- YEDEKTEN GERİ YÜKLE ---
    document.getElementById('input-import-settings').onchange = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const backup = JSON.parse(ev.target.result);
                let sToRes = Array.isArray(backup) ? backup : (backup.data?.settings || []);
                let rToRes = backup.data?.reports || [];
                const bodyHtml = `
                    <p class="db-modal-desc">Yüklenecek verileri seçin:</p>
                    ${sToRes.length ? `<div class="db-modal-section-header">Ayarlar</div>
                        <div class="db-selection-list">
                            ${sToRes.map((item, idx) => {
                                const info = getSettingDetails(item.anahtar);
                                return `<label class="db-card-option-mini">
                                    <input type="checkbox" name="res-setting" value="${idx}" checked>
                                    <div class="mini-card-content">
                                        <div class="mini-card-icon" style="background-color:${info.color}15; color:${info.color}"><i class="fas ${info.icon}"></i></div>
                                        <div class="mini-card-info"><strong>${info.title}</strong></div>
                                    </div>
                                </label>`;
                            }).join('')}
                        </div>` : ''}
                    ${rToRes.length ? `<div class="db-modal-section-header" style="margin-top:20px;">Kayıtlar</div>
                        <label class="db-card-option-mini">
                            <input type="checkbox" name="res-reports" value="true" checked>
                            <div class="mini-card-content">
                                <div class="mini-card-icon" style="background-color:#fee2e2; color:#ef4444"><i class="fas fa-file-invoice"></i></div>
                                <div class="mini-card-info"><strong>Raporları Geri Yükle</strong><small>${rToRes.length} adet kayıt.</small></div>
                            </div>
                        </label>` : ''}
                `;
                const footerHtml = `<button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button><button id="btn-res-exec" class="btn-primary btn-sm">Yükle</button>`;
                showCommonModal('Yedekten Geri Yükle', bodyHtml, footerHtml);
                document.getElementById('btn-res-exec').onclick = async () => {
                    const sIdx = Array.from(document.querySelectorAll('input[name="res-setting"]:checked')).map(cb => parseInt(cb.value));
                    const resRep = document.querySelector('input[name="res-reports"]')?.checked;
                    if(!confirm("Emin misiniz?")) return;
                    const btn = document.getElementById('btn-res-exec'); btn.disabled = true;
                    try {
                        for (const idx of sIdx) {
                            const item = sToRes[idx];
                            try {
                                const exist = await pb.collection('ayarlar').getFirstListItem(`anahtar="${item.anahtar}"`);
                                await pb.collection('ayarlar').update(exist.id, { deger: item.deger });
                            } catch { await pb.collection('ayarlar').create({ anahtar: item.anahtar, deger: item.deger }); }
                        }
                        if (resRep) {
                            for (const r of rToRes) {
                                try { await pb.collection('denetim_raporlari').getOne(r.id); const {id, created, updated, expand, ...d} = r; await pb.collection('denetim_raporlari').update(id, d); }
                                catch { const {created, updated, expand, ...d} = r; await pb.collection('denetim_raporlari').create(d); }
                            }
                        }
                        alert("Tamamlandı."); location.reload();
                    } catch (err) { alert("Hata: " + err.message); btn.disabled = false; }
                };
            } catch { alert("Geçersiz dosya!"); }
        };
        reader.readAsText(file); e.target.value = ''; 
    };

    // Temizlik Butonları
    document.getElementById('btn-action-reset-mappings').onclick = async () => {
        const list = await pb.collection('ayarlar').getFullList({ filter: 'anahtar ~ "excel_mapping_"' });
        if(!list.length) return alert("Ayar yok.");
        if(confirm(`${list.length} ayar silinecek. Onay?`)) { for(const i of list) await pb.collection('ayarlar').delete(i.id); location.reload(); }
    };
    document.getElementById('btn-clear-excel').onclick = () => { if(confirm("Emin misiniz?")) clearCollection(pb, 'excel_verileri', "Excel"); };
    document.getElementById('btn-clear-reports').onclick = () => { if(confirm("SİL yazın") && prompt("Onay") === "SİL") clearCollection(pb, 'denetim_raporlari', "Raporlar"); };
    document.getElementById('btn-clear-undone').onclick = () => { if(confirm("Temizlensin mi?")) clearCollection(pb, 'denetim_geri_alinanlar', "Log"); };
}

async function clearCollection(pb, col, lbl) {
    const recs = await pb.collection(col).getFullList({ fields: 'id' });
    if (!recs.length) return alert("Boş.");
    for (const r of recs) await pb.collection(col).delete(r.id);
    alert(lbl + " temizlendi."); location.reload();
}