/* fide/modules/veritabani-yonetim/veritabani-yonetim.js */

export async function initializeVeritabaniYonetimModule(pb) {
    const wrapper = document.getElementById('db-manager-wrapper');
    if (!wrapper) return;

    loadStats(pb);
    setupEventListeners(pb);
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

/**
 * Modal Penceresini Kapatır
 */
function closeCommonModal() {
    document.getElementById('db-common-modal').style.display = 'none';
}

window.closeCommonModal = closeCommonModal; // HTML içinden erişim için

/**
 * Veritabanı Kayıt Sayılarını Yükler
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

    // --- KULLANICI SİLME ÖZELLİĞİ ---
    document.getElementById('btn-action-user-delete').onclick = async () => {
        const users = await pb.collection('users').getFullList({ sort: 'name' });
        
        const bodyHtml = `
            <div class="db-form-group">
                <label>Silinecek Kullanıcıyı Seçin</label>
                <select id="modal-select-user" class="db-input">
                    <option value="">-- Kullanıcı Seçin --</option>
                    ${users.filter(u => u.id !== pb.authStore.model.id).map(u => `<option value="${u.id}">${u.name || u.email} (${u.role})</option>`).join('')}
                </select>
            </div>
            <div id="modal-analysis-area" class="db-analysis-box" style="display:none;"></div>
            <div id="modal-strategy-area" style="display:none;">
                <label style="font-weight:700; font-size:14px; display:block; margin-bottom:10px;">Veri Yönetim Tercihi</label>
                <label class="db-radio-option">
                    <input type="radio" name="del-strat" value="delete" checked>
                    <span>Kullanıcıyı ve tüm raporlarını kalıcı olarak sil.</span>
                </label>
                <label class="db-radio-option">
                    <input type="radio" name="del-strat" value="transfer">
                    <span>Kullanıcıyı sil, raporlarını başka birine aktar.</span>
                </label>
                <div id="modal-transfer-select" style="display:none; margin-top:15px;">
                    <label style="font-size:13px; font-weight:700;">Hedef Kullanıcıyı Seçin</label>
                    <select id="modal-select-target" class="db-input" style="margin-top:5px;">
                        <option value="">-- Aktarılacak Kişiyi Seçin --</option>
                        ${users.map(u => `<option value="${u.id}">${u.name || u.email}</option>`).join('')}
                    </select>
                </div>
            </div>
        `;

        const footerHtml = `
            <button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button>
            <button id="modal-btn-execute" class="btn-danger btn-sm" disabled>Kullanıcıyı Sil</button>
        `;

        showCommonModal('Kullanıcı Silme & Veri Aktarımı', bodyHtml, footerHtml);

        const selectUser = document.getElementById('modal-select-user');
        const analysisArea = document.getElementById('modal-analysis-area');
        const strategyArea = document.getElementById('modal-strategy-area');
        const executeBtn = document.getElementById('modal-btn-execute');

        selectUser.onchange = async () => {
            const userId = selectUser.value;
            if (!userId) { analysisArea.style.display = 'none'; strategyArea.style.display = 'none'; executeBtn.disabled = true; return; }
            analysisArea.style.display = 'block';
            analysisArea.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Analiz ediliyor...';
            const reports = await pb.collection('denetim_raporlari').getFullList({ filter: `user="${userId}"` });
            const bayiler = await pb.collection('bayiler').getFullList({ filter: `sorumlu_kullanici="${userId}"` });
            const devices = await pb.collection('user_devices').getFullList({ filter: `user="${userId}"` });
            analysisArea.innerHTML = `<h5>Veri Analizi</h5><ul><li>${reports.length} rapor bulundu.</li><li>${bayiler.length} sorumlu bayi bulundu.</li><li>${devices.length} cihaz bulundu.</li></ul>`;
            strategyArea.style.display = 'block'; executeBtn.disabled = false;
        };

        document.body.addEventListener('change', (e) => {
            if (e.target.name === 'del-strat') {
                const tSelect = document.getElementById('modal-transfer-select');
                if(tSelect) tSelect.style.display = (e.target.value === 'transfer') ? 'block' : 'none';
            }
        });

        executeBtn.onclick = async () => {
            const userId = selectUser.value;
            const strategy = document.querySelector('input[name="del-strat"]:checked').value;
            const targetId = document.getElementById('modal-select-target').value;
            if (strategy === 'transfer' && !targetId) return alert("Hedef kullanıcıyı seçin.");
            if (!confirm("Onaylıyor musunuz?")) return;
            executeBtn.disabled = true;
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

    // --- EXCEL EŞLEŞTİRMELERİNİ SIFIRLA ---
    document.getElementById('btn-action-reset-mappings').onclick = async () => {
        try {
            const mappings = await pb.collection('ayarlar').getFullList({ filter: 'anahtar ~ "excel_mapping_"' });
            
            const bodyHtml = `
                <div class="db-analysis-box">
                    <h5>Analiz Sonucu</h5>
                    <p>Sistemde toplam <strong>${mappings.length}</strong> adet Excel sütun eşleştirmesi bulundu.</p>
                    <p style="margin-top:10px; font-size:12px; color:#64748b;">Bu işlem; Excel yüklerken yaptığınız başlık eşleştirmelerini (Bayi Kodu, Puan vb.) sıfırlayacaktır. Diğer sistem ayarları korunacaktır.</p>
                </div>
            `;
            
            const footerHtml = `
                <button class="btn-secondary btn-sm" onclick="closeCommonModal()">Vazgeç</button>
                <button id="modal-btn-reset-execute" class="btn-danger btn-sm" ${mappings.length === 0 ? 'disabled' : ''}>Tümünü Sıfırla</button>
            `;
            
            showCommonModal('Excel Eşleştirmelerini Sıfırla', bodyHtml, footerHtml);
            
            document.getElementById('modal-btn-reset-execute').onclick = async () => {
                if(!confirm("Tüm eşleştirmeler silinecektir. Onaylıyor musunuz?")) return;
                const btn = document.getElementById('modal-btn-reset-execute');
                btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sıfırlanıyor...';
                try {
                    for(const item of mappings) { await pb.collection('ayarlar').delete(item.id); }
                    alert("Excel eşleştirmeleri başarıyla sıfırlandı.");
                    location.reload();
                } catch(e) { alert("Hata: " + e.message); btn.disabled = false; }
            };
        } catch (e) { alert("Analiz hatası: " + e.message); }
    };

    // --- DİĞER TEMİZLİK FONKSİYONLARI ---
    document.getElementById('btn-clear-excel').onclick = async () => {
        if (confirm("Tüm ham Excel verileri silinecektir?")) await clearCollection(pb, 'excel_verileri', "Excel");
    };
    document.getElementById('btn-clear-reports').onclick = async () => {
        if (confirm("Tüm raporlar silinecektir?") && prompt("SİL yazın") === "SİL") await clearCollection(pb, 'denetim_raporlari', "Raporlar");
    };
    document.getElementById('btn-clear-undone').onclick = async () => {
        if (confirm("Geri alma kayıtları temizlensin mi?")) await clearCollection(pb, 'denetim_geri_alinanlar', "Geri Al Log");
    };

    // Yedekleme İşlemleri
    document.getElementById('btn-export-settings').onclick = async () => {
        const records = await pb.collection('ayarlar').getFullList();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
        link.download = `fide_yedek_${new Date().toISOString().slice(0,10)}.json`;
        link.click();
    };
}

async function clearCollection(pb, collection, label) {
    const records = await pb.collection(collection).getFullList({ fields: 'id' });
    if (records.length === 0) return alert("Zaten temiz.");
    for (const r of records) await pb.collection(collection).delete(r.id);
    alert(label + " temizlendi.");
    location.reload();
}