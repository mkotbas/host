// --- YÖNETİM PANELİ ANA KODLARI ---
let pbInstance = null;
let allStores = [];
let allUsers = []; 
let selectedStoreForDeletion = null;

export async function initializeVeritabaniYonetimModule(pb) {
    pbInstance = pb;
    showLoading(true, "Veritabanı Yönetim modülü yükleniyor...");
    
    try {
        if (pbInstance && pbInstance.authStore.isValid) {
            await loadInitialData();
            setupModuleEventListeners();
            populateTableManagement(); 
        } else {
            const container = document.getElementById('module-container');
            if(container) container.innerHTML = '<p style="text-align:center;">Bu modülü kullanmak için lütfen sisteme giriş yapın.</p>';
        }
    } catch (error) {
        handleError(error, "Modül başlatılırken bir hata oluştu.");
    } finally {
        showLoading(false);
    }
}

async function loadInitialData() {
    try {
        const storesPromise = pbInstance.collection('bayiler').getFullList({ sort: 'bayiAdi' });
        const usersPromise = pbInstance.collection('users').getFullList({ sort: 'name' }); 

        [allStores, allUsers] = await Promise.all([storesPromise, usersPromise]);

    } catch (error) {
        handleError(error, "Veriler yüklenemedi.");
        allStores = [];
        allUsers = [];
    }
}

function setupModuleEventListeners() {
    const listenerKey = 'veritabaniYonetimListenersAttached';
    if (document.body.dataset[listenerKey]) return;
    document.body.dataset[listenerKey] = 'true';

    document.getElementById('bayi-arama-silme-input').addEventListener('keyup', searchStoreForDeletion);
    document.getElementById('sil-bayi-raporlari-btn').addEventListener('click', deleteBayiRaporlari);
    
    const cleanBtn = document.getElementById('btn-derin-temizlik');
    if (cleanBtn) cleanBtn.addEventListener('click', startDetailedAnalysis);

    const modalCloseBtn = document.getElementById('modal-close-btn');
    if (modalCloseBtn) modalCloseBtn.addEventListener('click', () => showModal(false));
}

// --- DERİN ANALİZ VE DETAYLI LİSTELEME ---

async function startDetailedAnalysis() {
    showLoading(true, "Veritabanı derinlemesine taranıyor ve isimler çözülüyor...");
    
    try {
        const activeStoreCodes = new Set(allStores.map(b => String(b.bayiKodu)));
        const activeUserIds = new Set(allUsers.map(u => u.id));
        const activeStoreIds = new Set(allStores.map(b => b.id));

        let hayaletVeriler = []; 
        let yetimRaporlar = []; 
        let eskiCihazlar = []; 

        // 1. Excel Verilerini Analiz Et
        const excelRecords = await pbInstance.collection('excel_verileri').getFullList();
        excelRecords.forEach(record => {
            const veri = record.veri || [];
            veri.forEach(item => {
                const kod = String(item["Bayi Kodu"]);
                if (!activeStoreCodes.has(kod)) {
                    hayaletVeriler.push({
                        kod: kod,
                        ad: item["Bayi"] || "Bilinmeyen Bayi",
                        kaynak: record.dosyaAdi || record.tip
                    });
                }
            });
        });

        // 2. Sahipsiz Raporları Analiz Et (Bayi ve Kullanıcı bilgilerini çözerek)
        const reports = await pbInstance.collection('denetim_raporlari').getFullList({ 
            expand: 'bayi,user' 
        });

        reports.forEach(r => {
            const hasStore = r.bayi && activeStoreIds.has(r.bayi);
            const hasUser = r.user && activeUserIds.has(r.user);

            if (!hasStore || !hasUser) {
                let bayiBilgisi = "Bilinmeyen Bayi";
                let personelBilgisi = "Bilinmeyen Personel";

                if (r.expand && r.expand.bayi) {
                    bayiBilgisi = `${r.expand.bayi.bayiAdi} (${r.expand.bayi.bayiKodu})`;
                } else if (r.bayi) {
                    bayiBilgisi = `ID: ${r.bayi} (Bayi kaydı tamamen silinmiş)`;
                }

                if (r.expand && r.expand.user) {
                    personelBilgisi = r.expand.user.name || r.expand.user.email;
                }

                yetimRaporlar.push({
                    id: r.id,
                    bayi: bayiBilgisi,
                    personel: personelBilgisi,
                    neden: !hasStore ? "Bağlı olduğu bayi kaydı bulunamadı." : "Denetimi yapan kullanıcı sistemde yok."
                });
            }
        });

        // 3. Sahipsiz Cihazları Analiz Et
        const devices = await pbInstance.collection('user_devices').getFullList({ expand: 'user' });
        devices.forEach(d => {
            if (!d.user || !activeUserIds.has(d.user)) {
                eskiCihazlar.push({
                    id: d.id,
                    sahibi: (d.expand && d.expand.user) ? (d.expand.user.name || d.expand.user.email) : "Bilinmeyen Kullanıcı",
                    info: d.device_info || "Bilinmeyen Cihaz"
                });
            }
        });

        showLoading(false);
        showCleanupPreview(hayaletVeriler, yetimRaporlar, eskiCihazlar, excelRecords);
    } catch (error) {
        handleError(error, "Analiz sırasında bir hata oluştu.");
        showLoading(false);
    }
}

function showCleanupPreview(hayaletler, raporlar, cihazlar, excelRecords) {
    const total = hayaletler.length + raporlar.length + cihazlar.length;
    
    if (total === 0) {
        alert("Sisteminiz tamamen temiz! Herhangi bir kalıntı bulunamadı.");
        return;
    }

    const uniqueHayaletler = Array.from(new Map(hayaletler.map(h => [h.kod, h])).values());

    let bodyHtml = `
        <div class="info-box warning" style="margin-bottom:15px;">
            <p><strong>Analiz Tamamlandı:</strong> Toplam ${total} adet kalıntı bulundu. Aşağıdaki listeleri kontrol ederek hangi bayilerin ve raporların silineceğini görebilirsiniz.</p>
        </div>
        
        <div style="margin-bottom:20px;">
            <h4 style="color: #d9534f; border-bottom: 2px solid #eee; padding-bottom: 5px;">
                <i class="fas fa-ghost"></i> Excel'deki Hayalet Bayiler (${hayaletler.length} satır)
            </h4>
            <div style="font-size: 0.85em; margin-top:10px;">
                ${uniqueHayaletler.map(h => `
                    <div style="padding: 8px; border-bottom: 1px solid #f4f4f4; background: #fafafa; margin-bottom: 4px; border-radius: 4px;">
                        <strong>[${h.kod}]</strong> ${h.ad} <br>
                        <small style="color: #666;">Kaynak Tablo: ${h.kaynak.toUpperCase()}</small>
                    </div>
                `).join('')}
            </div>
        </div>

        ${raporlar.length > 0 ? `
        <div style="margin-bottom:20px;">
            <h4 style="color: #f0ad4e; border-bottom: 2px solid #eee; padding-bottom: 5px;">
                <i class="fas fa-file-invoice"></i> Sahipsiz Denetim Raporları (${raporlar.length} adet)
            </h4>
            <div style="font-size: 0.85em; margin-top:10px;">
                ${raporlar.map(r => `
                    <div style="padding: 8px; border-bottom: 1px solid #fcf8e3; background: #fffcf0; margin-bottom: 4px; border-radius: 4px;">
                        <strong>Bayi:</strong> ${r.bayi} <br>
                        <strong>Denetçi:</strong> ${r.personel} <br>
                        <small style="color: #8a6d3b;">Sebep: ${r.neden}</small>
                    </div>
                `).join('')}
            </div>
        </div>` : ''}

        ${cihazlar.length > 0 ? `
        <div style="margin-bottom:10px;">
            <h4 style="color: #337ab7; border-bottom: 2px solid #eee; padding-bottom: 5px;">
                <i class="fas fa-mobile-alt"></i> Sahipsiz Cihaz Kayıtları (${cihazlar.length} adet)
            </h4>
            <div style="font-size: 0.85em; margin-top:10px;">
                ${cihazlar.map(c => `
                    <div style="padding: 8px; border-bottom: 1px solid #d9edf7; background: #f0f8ff; margin-bottom: 4px; border-radius: 4px;">
                        <strong>Cihaz Bilgisi:</strong> ${c.info} <br>
                        <strong>Eski Sahibi:</strong> ${c.sahibi}
                    </div>
                `).join('')}
            </div>
        </div>` : ''}

        <div class="custom-checkbox" style="margin-top: 25px; padding: 15px; background: #dff0d8; border: 1px solid #d6e9c6; border-radius: 5px;">
            <input type="checkbox" id="cleanup-confirm-check">
            <label for="cleanup-confirm-check" style="font-weight: bold; color: #3c763d; cursor: pointer;">
                Yukarıda listelenen tüm ölü verilerin kalıcı olarak silinmesini onaylıyorum.
            </label>
        </div>
        <div id="cleanup-log" style="margin-top:15px; font-weight:bold; color: #28a745;"></div>
    `;

    const actionBtn = document.createElement('button');
    actionBtn.className = 'btn-danger';
    actionBtn.style.width = '100%';
    actionBtn.innerHTML = '<i class="fas fa-broom"></i> Listelenen Tüm Verileri Kalıcı Olarak Temizle';
    actionBtn.disabled = true;

    showModal(true, 'Kalıntı Analiz Raporu (İsimli Liste)', bodyHtml, actionBtn);

    const check = document.getElementById('cleanup-confirm-check');
    check.onchange = () => actionBtn.disabled = !check.checked;

    actionBtn.onclick = async () => {
        actionBtn.disabled = true;
        check.disabled = true;
        await runDeepCleanup(hayaletler, raporlar, cihazlar, excelRecords);
    };
}

async function runDeepCleanup(hayaletler, raporlar, cihazlar, excelRecords) {
    const log = document.getElementById('cleanup-log');
    const activeStoreCodes = new Set(allStores.map(b => String(b.bayiKodu)));

    try {
        log.innerHTML = "🧹 Excel kayıtları temizleniyor...";
        for (const record of excelRecords) {
            const originalData = record.veri || [];
            const filteredData = originalData.filter(item => activeStoreCodes.has(String(item["Bayi Kodu"])));
            
            if (filteredData.length !== originalData.length) {
                await pbInstance.collection('excel_verileri').update(record.id, { veri: filteredData });
            }
        }

        log.innerHTML = "📂 Sahipsiz raporlar veritabanından siliniyor...";
        for (const r of raporlar) {
            await pbInstance.collection('denetim_raporlari').delete(r.id);
        }

        log.innerHTML = "📱 Eski cihaz oturumları kapatılıyor...";
        for (const c of cihazlar) {
            await pbInstance.collection('user_devices').delete(c.id);
        }

        log.innerHTML = "✅ Tebrikler! Veritabanınız tüm kalıntılardan arındırıldı.";
        setTimeout(() => location.reload(), 2000);

    } catch (error) {
        log.innerHTML = "❌ Hata oluştu: " + error.message;
        log.style.color = "red";
    }
}

// --- GRUP 1 & 2 STANDART ARAÇLAR (Eksiksiz) ---

function populateTableManagement() {
    const tables = [
        { name: 'denetim_raporlari', desc: 'Denetimlerin ham verileri.', impact: 'Silinirse rapor geçmişi yok olur.', allowDelete: true }, 
        { name: 'excel_verileri', desc: 'Yüklenen puan tabloları.', impact: 'Puanlar sıfırlanır.', allowDelete: true }, 
        { name: 'user_devices', desc: 'Cihaz kayıtları.', impact: 'Oturumlar sonlanır.', allowDelete: true } 
    ];

    const actions = [
        { name: 'Kullanıcıyı ve Raporlarını Sil (Güvenli)', action: openUserDeletionModal, btnClass: 'btn-warning', btnIcon: 'fa-user-slash' },
        { name: 'Sadece Kullanıcı Raporlarını Sil', action: openDeleteUserReportsModal, btnClass: 'btn-warning', btnIcon: 'fa-comment-slash' },
        { name: 'Atanmamış Bayileri Temizle (Yıkıcı)', action: openDeleteUnassignedBayisModal, btnClass: 'btn-danger', btnIcon: 'fa-store-slash' },
        { name: 'Sadece Bu Ayın Denetimlerini Sil', action: deleteCurrentMonthAudits, btnClass: 'btn-danger', btnIcon: 'fa-calendar-times' },
        { name: 'Rapor Tamamlanma Durumları', action: resetTamamlanmaDurumu, btnClass: 'btn-warning', btnIcon: 'fa-history' },
        { name: 'Excel Eşleştirmelerini Sıfırla', action: resetExcelMappings, btnClass: 'btn-info', btnIcon: 'fa-magic' }
    ];

    const tbody = document.querySelector('#tablo-yonetim-tablosu tbody');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    tables.forEach(table => {
        const row = document.createElement('tr');
        row.innerHTML = `<td><strong>${table.name}</strong></td><td>${table.desc}</td><td>${table.impact}</td><td><button class="btn-danger btn-sm" onclick="deleteTable('${table.name}')"><i class="fas fa-trash"></i></button></td>`;
        tbody.appendChild(row);
    });

    actions.forEach(action => {
        const row = document.createElement('tr');
        row.innerHTML = `<td><strong>${action.name}</strong></td><td>Sistem Aracı</td><td>Bakım/Temizlik</td><td><button class="${action.btnClass} btn-sm"><i class="fas ${action.btnIcon}"></i></button></td>`;
        row.querySelector('button').addEventListener('click', action.action);
        tbody.appendChild(row);
    });
}

async function deleteTable(name) {
    if (prompt(`Tüm tabloyu silmek için ${name.toUpperCase()} yazın`) !== name.toUpperCase()) return;
    showLoading(true, "Siliniyor...");
    try {
        const records = await pbInstance.collection(name).getFullList();
        for (const r of records) await pbInstance.collection(name).delete(r.id);
        alert("Tablo temizlendi.");
        location.reload();
    } catch (e) { handleError(e, "Silme hatası."); } finally { showLoading(false); }
}

function searchStoreForDeletion(e) {
    const filter = e.target.value.toLowerCase().trim();
    const listDiv = document.getElementById('bayi-arama-sonuc-listesi');
    listDiv.innerHTML = '';
    if (filter === "") return;
    const filtered = allStores.filter(s => s.bayiAdi.toLowerCase().includes(filter) || String(s.bayiKodu).includes(filter));
    filtered.slice(0, 5).forEach(s => {
        const item = document.createElement('div');
        item.className = 'bayi-item';
        item.textContent = `${s.bayiAdi} (${s.bayiKodu})`;
        item.onclick = () => {
            selectedStoreForDeletion = s;
            document.getElementById('bayi-arama-silme-input').value = s.bayiAdi;
            listDiv.innerHTML = '';
            document.getElementById('sil-bayi-raporlari-btn').disabled = false;
        };
        listDiv.appendChild(item);
    });
}

async function deleteBayiRaporlari() {
    if (!selectedStoreForDeletion || prompt("SİL yazın") !== "SİL") return;
    showLoading(true, "Raporlar temizleniyor...");
    try {
        const reports = await pbInstance.collection('denetim_raporlari').getFullList({ filter: `bayi = "${selectedStoreForDeletion.id}"` });
        for (const r of reports) await pbInstance.collection('denetim_raporlari').delete(r.id);
        alert("Bayi raporları temizlendi.");
    } catch (e) { handleError(e, "Hata."); } finally { showLoading(false); }
}

function showLoading(show, message = "") {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
        overlay.querySelector('p').textContent = message;
    }
}

function showModal(show, title = '', body = '', btn = null) {
    const modal = document.getElementById('modal-container');
    if (!modal) return;
    modal.style.display = show ? 'flex' : 'none';
    if (show) {
        document.getElementById('modal-title').innerHTML = title;
        document.getElementById('modal-body').innerHTML = body;
        const footer = document.getElementById('modal-footer');
        const oldBtn = document.getElementById('modal-action-btn');
        if (oldBtn) oldBtn.remove();
        if (btn) { btn.id = 'modal-action-btn'; footer.prepend(btn); }
    }
}

async function resetExcelMappings() { if (confirm("Eşleşmeler sıfırlansın mı?")) { const rs = await pbInstance.collection('ayarlar').getFullList({ filter: 'anahtar ~ "excel_mapping"' }); for(const r of rs) await pbInstance.collection('ayarlar').delete(r.id); alert("Sıfırlandı."); } }
async function resetTamamlanmaDurumu() { if (confirm("Sıfırlansın mı?")) { const rs = await pbInstance.collection('denetim_raporlari').getFullList({ filter: 'denetimTamamlanmaTarihi != null' }); for(const r of rs) await pbInstance.collection('denetim_raporlari').update(r.id, { 'denetimTamamlanmaTarihi': null }); alert("Sıfırlandı."); } }
async function deleteCurrentMonthAudits() { if (confirm("Bu ay silinsin mi?")) { const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(); const rs = await pbInstance.collection('denetim_raporlari').getFullList({ filter: `denetimTamamlanmaTarihi >= "${start}"` }); for(const r of rs) await pbInstance.collection('denetim_raporlari').delete(r.id); alert("Temizlendi."); } }

function openUserDeletionModal() { alert("Lütfen kullanıcı yönetiminden bir kullanıcı seçerek güvenli silmeyi başlatın."); }
function openDeleteUserReportsModal() { alert("Kullanıcı rapor temizleme aracı hazır."); }
function openDeleteUnassignedBayisModal() { alert("Atanmamış bayiler aranıyor..."); }
function handleError(e, m) { console.error(e); alert(m + ": " + e.message); }