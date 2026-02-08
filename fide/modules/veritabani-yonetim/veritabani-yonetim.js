/* fide/modules/veritabani-yonetim/veritabani-yonetim.js */

export async function initializeVeritabaniYonetimModule(pb) {
    const wrapper = document.getElementById('db-manager-wrapper');
    if (!wrapper) return;

    loadStats(pb);
    setupEventListeners(pb);
}

/**
 * Yedeklenecek Koleksiyonların Tanımları
 */
const BACKUP_COLLECTIONS = {
    'ayarlar': {
        title: 'Sistem Ayarları',
        desc: 'Soru listesi, e-posta şablonu, hedefler, takvim verileri.',
        icon: 'fa-cogs',
        color: '#6366f1'
    },
    'users': {
        title: 'Kullanıcı Hesapları',
        desc: 'Sistemdeki tüm kullanıcılar ve rol tanımları.',
        icon: 'fa-users',
        color: '#3b82f6'
    },
    'bayiler': {
        title: 'Bayi Listesi',
        desc: 'Tüm bayi bilgileri, yönetmen ve uzman atamaları.',
        icon: 'fa-store',
        color: '#10b981'
    },
    'denetim_raporlari': {
        title: 'Denetim Raporları',
        desc: 'Tamamlanmış ve taslak halindeki tüm denetim formları.',
        icon: 'fa-file-invoice',
        color: '#f59e0b'
    },
    'excel_verileri': {
        title: 'Excel Puan Verileri',
        desc: 'Buluta yüklenmiş DiDe ve FiDe puan tabloları.',
        icon: 'fa-table',
        color: '#8b5cf6'
    },
    'denetim_geri_alinanlar': {
        title: 'Geri Alma Kayıtları',
        desc: 'Denetimi geri alınan bayilerin log kayıtları.',
        icon: 'fa-history',
        color: '#ef4444'
    },
    'user_devices': {
        title: 'Cihaz Kayıtları',
        desc: 'Kullanıcıların giriş yaptığı cihazlar ve kilit durumları.',
        icon: 'fa-mobile-alt',
        color: '#ec4899'
    }
};

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

    // --- GELİŞMİŞ TEMİZLİK & BAKIM FONKSİYONU ---
    document.getElementById('btn-action-clean-maintenance').onclick = async () => {
        showCommonModal('Temizlik & Bakım Analizi', 
            '<div id="cleanup-analysis"><i class="fas fa-spinner fa-spin"></i> Veritabanı taranıyor, lütfen bekleyin...</div>', 
            '<button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button>');

        try {
            const todayStr = new Date().toISOString().split('T')[0];
            const reports = await pb.collection('denetim_raporlari').getFullList({
                sort: '-created',
                fields: 'id,bayi,denetimTamamlanmaTarihi,created'
            });

            let idsToDelete = [];
            const reportGroups = {};

            reports.forEach(r => {
                const dateOnly = r.created.split(' ')[0];
                const groupKey = `${r.bayi}_${dateOnly}`;
                if (!reportGroups[groupKey]) reportGroups[groupKey] = { finished: [], drafts: [] };
                if (r.denetimTamamlanmaTarihi && r.denetimTamamlanmaTarihi !== "") reportGroups[groupKey].finished.push(r);
                else reportGroups[groupKey].drafts.push(r);
            });

            for (const key in reportGroups) {
                const group = reportGroups[key];
                const dateOfGroup = key.split('_')[1];
                if (group.finished.length > 0) {
                    group.finished.sort((a, b) => b.denetimTamamlanmaTarihi.localeCompare(a.denetimTamamlanmaTarihi));
                    for (let i = 1; i < group.finished.length; i++) idsToDelete.push(group.finished[i].id);
                    group.drafts.forEach(d => idsToDelete.push(d.id));
                } else {
                    if (dateOfGroup < todayStr) group.drafts.forEach(d => idsToDelete.push(d.id));
                }
            }

            if (idsToDelete.length === 0) {
                document.getElementById('modal-body').innerHTML = `
                    <div class="db-analysis-info-card">
                        <p><i class="fas fa-check-circle" style="color: green;"></i> Tertemiz! Temizlenecek gereksiz kayıt bulunamadı.</p>
                    </div>`;
            } else {
                document.getElementById('modal-body').innerHTML = `
                    <div class="db-analysis-info-card">
                        <p><strong>${idsToDelete.length}</strong> adet gereksiz kayıt tespit edildi.</p>
                        <ul style="font-size: 12px; margin-top: 10px; text-align: left; padding-left: 20px;">
                            <li>Mükerrer raporlar ve eski boş taslaklar temizlenecek.</li>
                        </ul>
                    </div>`;
                
                document.getElementById('modal-footer').innerHTML += `<button id="modal-btn-execute-cleanup" class="btn-danger btn-sm">Temizliği Başlat</button>`;
                document.getElementById('modal-btn-execute-cleanup').onclick = async () => {
                    const execBtn = document.getElementById('modal-btn-execute-cleanup');
                    execBtn.disabled = true; execBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> İşlem Yapılıyor...';
                    try {
                        for (const id of idsToDelete) await pb.collection('denetim_raporlari').delete(id);
                        alert("Bakım işlemi başarıyla tamamlandı."); location.reload();
                    } catch (err) { alert("Hata: " + err.message); execBtn.disabled = false; }
                };
            }
        } catch (err) { alert("Hata: " + err.message); closeCommonModal(); }
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
                        <div class="card-option-content"><div class="card-option-icon icon-danger"><i class="fas fa-trash-alt"></i></div><div class="card-option-info"><strong>Kalıcı Olarak Sil</strong><small>Her şeyi temizler.</small></div></div>
                    </label>
                    <label class="db-card-option">
                        <input type="radio" name="del-strat" value="transfer">
                        <div class="card-option-content"><div class="card-option-icon icon-primary"><i class="fas fa-file-export"></i></div><div class="card-option-info"><strong>Verileri Aktar</strong><small>Başka birine taşır.</small></div></div>
                    </label>
                </div>
                <div id="modal-transfer-select" style="display:none; margin-top:15px;" class="db-form-group">
                    <label>Hedef Kullanıcı</label>
                    <select id="modal-select-target" class="db-input"><option value="">-- Hedef Seçin --</option>${users.map(u => `<option value="${u.id}">${u.name || u.email}</option>`).join('')}</select>
                </div>
            </div>
        `;
        showCommonModal('Kullanıcı Silme & Veri Yönetimi', bodyHtml, `<button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button><button id="modal-btn-execute" class="btn-danger btn-sm" disabled>İşlemi Onayla</button>`);

        const selectUser = document.getElementById('modal-select-user');
        const executeBtn = document.getElementById('modal-btn-execute');

        selectUser.onchange = async () => {
            const userId = selectUser.value;
            if (!userId) { document.getElementById('modal-strategy-area').style.display = 'none'; executeBtn.disabled = true; return; }
            document.getElementById('modal-analysis-area').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analiz ediliyor...'; document.getElementById('modal-analysis-area').style.display = 'block';
            const reports = await pb.collection('denetim_raporlari').getFullList({ filter: `user="${userId}"` });
            const bayiler = await pb.collection('bayiler').getFullList({ filter: `sorumlu_kullanici="${userId}"` });
            document.getElementById('modal-analysis-area').innerHTML = `<div class="db-analysis-info-card"><p><strong>${reports.length}</strong> Rapor ve <strong>${bayiler.length}</strong> Bayi kaydı bulundu.</p></div>`;
            document.getElementById('modal-strategy-area').style.display = 'block'; executeBtn.disabled = false;
        };

        document.getElementById('modal-body').onclick = (e) => {
            const radio = e.target.closest('.db-card-option')?.querySelector('input');
            if (radio && radio.name === 'del-strat') document.getElementById('modal-transfer-select').style.display = (radio.value === 'transfer') ? 'block' : 'none';
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

    // --- SİSTEMİ TAM YEDEKLE (Full Backup) ---
    document.getElementById('btn-export-settings').onclick = async () => {
        try {
            const bodyHtml = `
                <p class="db-modal-desc">Yedeklemek istediğiniz veri kategorilerini seçin:</p>
                <div class="db-selection-list">
                    ${Object.entries(BACKUP_COLLECTIONS).map(([key, info]) => `
                        <label class="db-card-option-mini">
                            <input type="checkbox" name="backup-collection" value="${key}" checked>
                            <div class="mini-card-content">
                                <div class="mini-card-icon" style="background-color:${info.color}15; color:${info.color}"><i class="fas ${info.icon}"></i></div>
                                <div class="mini-card-info"><strong>${info.title}</strong><small>${info.desc}</small></div>
                            </div>
                        </label>
                    `).join('')}
                </div>
            `;
            const footerHtml = `
                <button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button>
                <button id="modal-btn-export-execute" class="btn-success btn-sm">Yedeği İndir</button>
            `;
            showCommonModal('Tam Sistem Yedeği Oluştur', bodyHtml, footerHtml);

            document.getElementById('modal-btn-export-execute').onclick = async () => {
                const selectedCols = Array.from(document.querySelectorAll('input[name="backup-collection"]:checked')).map(cb => cb.value);
                if (!selectedCols.length) return alert("En az bir kategori seçin.");
                
                const btn = document.getElementById('modal-btn-export-execute');
                btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Veriler Hazırlanıyor...';
                
                try {
                    const backupPayload = {
                        type: 'fide_full_backup',
                        version: '2.0',
                        date: new Date().toISOString(),
                        data: {}
                    };

                    for (const col of selectedCols) {
                        // Tüm veriyi çek (sayfalama olmadan)
                        backupPayload.data[col] = await pb.collection(col).getFullList();
                    }

                    const blob = new Blob([JSON.stringify(backupPayload, null, 2)], { type: 'application/json' });
                    const link = document.createElement('a');
                    link.href = URL.createObjectURL(blob);
                    link.download = `fide_tam_yedek_${new Date().toISOString().slice(0,19).replace(/:/g, '-')}.json`;
                    link.click();
                    closeCommonModal();
                } catch (err) {
                    alert("Yedekleme hatası: " + err.message);
                    btn.disabled = false; btn.innerHTML = 'Yedeği İndir';
                }
            };
        } catch (e) { alert("Hata: " + e.message); }
    };

    // --- YEDEKTEN GERİ YÜKLE (Full Restore) ---
    document.getElementById('input-import-settings').onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        
        reader.onload = async (ev) => {
            try {
                const backup = JSON.parse(ev.target.result);
                const data = backup.data || {};
                const collectionsFound = Object.keys(data).filter(k => BACKUP_COLLECTIONS[k]);

                if (!collectionsFound.length) throw new Error("Geçerli bir yedek dosyası değil veya içerik boş.");

                const bodyHtml = `
                    <p class="db-modal-desc">Geri yüklenecek kategorileri seçin (Mevcut verilerin üzerine yazılır):</p>
                    <div class="db-selection-list">
                        ${collectionsFound.map(key => {
                            const info = BACKUP_COLLECTIONS[key];
                            return `
                            <label class="db-card-option-mini">
                                <input type="checkbox" name="restore-collection" value="${key}" checked>
                                <div class="mini-card-content">
                                    <div class="mini-card-icon" style="background-color:${info.color}15; color:${info.color}"><i class="fas ${info.icon}"></i></div>
                                    <div class="mini-card-info"><strong>${info.title}</strong><small>${data[key].length} kayıt.</small></div>
                                </div>
                            </label>`;
                        }).join('')}
                    </div>
                    <div class="warning-text" style="margin-top:10px; font-size:11px;">
                        <i class="fas fa-exclamation-triangle"></i> Kullanıcılar geri yüklenirken mevcut şifreler korunur. Yeni eklenen kullanıcılar için şifre sıfırlama gerekebilir.
                    </div>
                `;
                
                const footerHtml = `<button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button><button id="btn-res-exec" class="btn-primary btn-sm">Geri Yüklemeyi Başlat</button>`;
                showCommonModal('Yedekten Geri Yükle', bodyHtml, footerHtml);

                document.getElementById('btn-res-exec').onclick = async () => {
                    if (!confirm("DİKKAT: Seçilen veriler sisteme geri yüklenecek ve mevcut kayıtlar güncellenecektir. Onaylıyor musunuz?")) return;
                    
                    const selectedCols = Array.from(document.querySelectorAll('input[name="restore-collection"]:checked')).map(cb => cb.value);
                    const btn = document.getElementById('btn-res-exec');
                    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Yükleniyor...';

                    let errorLog = [];
                    
                    try {
                        // Bağımlılık sırası önemli olabilir, ancak ID'ler korunduğu için genellikle sorun olmaz.
                        // Önce Users ve Bayiler, sonra Raporlar mantıklı olabilir.
                        // Sort order: users -> bayiler -> diğerleri
                        selectedCols.sort((a, b) => {
                            if (a === 'users') return -1;
                            if (b === 'users') return 1;
                            if (a === 'bayiler') return -1;
                            if (b === 'bayiler') return 1;
                            return 0;
                        });

                        for (const col of selectedCols) {
                            const items = data[col];
                            for (const item of items) {
                                // PocketBase sistem alanlarını temizle (id hariç, id'yi korumak istiyoruz)
                                const { id, created, updated, collectionId, collectionName, expand, ...payload } = item;
                                
                                try {
                                    // 1. Güncellemeyi dene
                                    await pb.collection(col).update(id, payload);
                                } catch (updateErr) {
                                    if (updateErr.status === 404) {
                                        // 2. Kayıt yoksa oluştur
                                        try {
                                            // ID'yi manuel set etmek için create'e id'yi de veriyoruz
                                            payload.id = id;
                                            
                                            // Users tablosu için özel durum: Create işleminde password zorunludur.
                                            // Ancak JSON'da şifre yok (hash var ama PB API ile hash set edilemez).
                                            // Bu durumda dummy bir şifre ile oluşturup, yöneticiye not düşeceğiz veya hata yutacağız.
                                            if (col === 'users') {
                                                // Eğer şifre alanı yoksa (ki yedekte olmaz), varsayılan bir şifre ata.
                                                // Admin daha sonra değiştirmeli.
                                                payload.password = "1234567890";
                                                payload.passwordConfirm = "1234567890";
                                            }

                                            await pb.collection(col).create(payload);
                                        } catch (createErr) {
                                            errorLog.push(`${col} / ${id}: ${createErr.message}`);
                                        }
                                    } else {
                                        errorLog.push(`${col} / ${id}: ${updateErr.message}`);
                                    }
                                }
                            }
                        }

                        if (errorLog.length > 0) {
                            console.warn("Bazı kayıtlar yüklenemedi:", errorLog);
                            alert(`İşlem tamamlandı ancak ${errorLog.length} kayıtta sorun oluştu. Konsol loglarını kontrol edin.`);
                        } else {
                            alert("Tüm veriler başarıyla geri yüklendi!");
                        }
                        location.reload();

                    } catch (err) {
                        alert("Kritik Hata: " + err.message);
                        btn.disabled = false; btn.innerHTML = 'Geri Yüklemeyi Başlat';
                    }
                };

            } catch (e) { alert("Geçersiz yedek dosyası! " + e.message); }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    // Diğer Temizlik Butonları
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