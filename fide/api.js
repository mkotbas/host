// 'showLockoutOverlay' fonksiyonunu utils.js'den içeri aktar
import { showLoadingOverlay, hideLoadingOverlay, showLockoutOverlay } from './utils.js';
import * as state from './state.js';

let pb; // PocketBase instance

/**
 * Cihazın mobil olup olmadığını User Agent üzerinden kontrol eder.
 * @returns {boolean}
 */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * Kullanıcının cihaz bilgilerini (Tarayıcı ve OS)
 * admin panelinde gösterilecek basit bir metne dönüştürür.
 * @returns {string} Örn: "Chrome on Windows"
 */
function getDeviceDescription() {
    const ua = navigator.userAgent;
    let os = "Unknown OS";
    let browser = "Unknown Browser";

    if (/Windows/.test(ua)) os = "Windows";
    else if (/Macintosh/.test(ua)) os = "MacOS";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Linux/.test(ua)) os = "Linux";

    if (/Edg/.test(ua)) browser = "Edge";
    else if (/Chrome/.test(ua) && !/Edg/.test(ua)) browser = "Chrome";
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
    else if (/Firefox/.test(ua)) browser = "Firefox";
    
    return `${browser} on ${os}`;
}

/**
 * PROFESYONEL PARMAK İZİ SİSTEMİ (Browser Fingerprinting)
 * Cihazın donanım ve yazılım özelliklerinden benzersiz bir ID üretir.
 * @returns {Promise<string>}
 */
async function getDeviceFingerprint() {
    const components = [
        navigator.userAgent,
        navigator.language,
        screen.colorDepth,
        screen.width + "x" + screen.height,
        new Date().getTimezoneOffset(),
        navigator.hardwareConcurrency || "unknown",
        navigator.platform,
        // Canvas Fingerprinting: Tarayıcının grafik işleme karakteristiği
        (function() {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            ctx.textBaseline = "top";
            ctx.font = "14px 'Arial'";
            ctx.textBaseline = "alphabetic";
            ctx.fillStyle = "#f60";
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = "#069";
            ctx.fillText("FideSecurity_123!@#", 2, 15);
            ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
            ctx.fillText("FideSecurity_123!@#", 4, 17);
            return canvas.toDataURL();
        })()
    ];

    const fingerprintString = components.join('###');
    
    // Web Crypto API ile SHA-256 Hash oluşturma
    const msgUint8 = new TextEncoder().encode(fingerprintString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    
    return hashHex;
}

/**
 * API modülünü PocketBase instance ile başlatır.
 * @param {object} pbInstance 
 */
export function initApi(pbInstance) {
    pb = pbInstance;
}

/**
 * Kullanıcının kilit (ban) ve cihaz kilidi (lock) durumlarını anlık dinler.
 */
export async function subscribeToRealtimeChanges() {
    if (!pb || !pb.authStore.isValid) {
        return;
    }

    const userId = pb.authStore.model.id;
    // Yeni parmak izi sistemine göre anahtarı al
    const browserDeviceKey = await getDeviceFingerprint();

    try {
        const currentUserRecord = await pb.collection('users').getOne(userId);
        if (currentUserRecord.is_banned === true) {
             console.warn('Hesap kilitli. Oturum sonlandırılıyor.');
             showLockoutOverlay("Hesabınız bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...");
             logoutUser();
             setTimeout(() => window.location.reload(), 3000);
             return;
        }
        
        pb.collection('users').subscribe(userId, function(e) {
            if (e.record && e.record.is_banned === true) {
                showLockoutOverlay("Hesabınız bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...");
                logoutUser();
                setTimeout(() => window.location.reload(), 3000);
            }
        });
    } catch (error) {
        console.error('Kullanıcı dinlemesi başlatılamadı:', error);
    }

    if (pb.authStore.model.role === 'client') {
        try {
            const deviceRecord = await pb.collection('user_devices').getFirstListItem(
                `user="${userId}" && device_key="${browserDeviceKey}"`
            );

            if (deviceRecord.is_locked === true) {
                showLockoutOverlay("Bu cihaz bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...");
                logoutUser();
                setTimeout(() => window.location.reload(), 3000);
                return;
            }

            pb.collection('user_devices').subscribe(deviceRecord.id, function(e) {
                if (e.record && e.record.is_locked === true) {
                    showLockoutOverlay("Bu cihaz bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...");
                    logoutUser();
                    setTimeout(() => window.location.reload(), 3000);
                }
            });

        } catch (error) {
            console.error('Cihaz kilidi kontrol hatası:', error);
        }
    }
}

/**
 * O anki aya ait denetim verilerini yükler.
 */
async function loadMonthlyAuditData() {
    state.setAuditedThisMonth([]);
    if (!pb || !pb.authStore.isValid) return;

    try {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0] + ' 00:00:00';
        const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;

        let geriAlinanlarBuAy = [];
        try {
            const geriAlinanRecords = await pb.collection('denetim_geri_alinanlar').getFullList({
                filter: `yil_ay = "${currentMonthKey}"`,
                expand: 'bayi'
            });
            geriAlinanlarBuAy = geriAlinanRecords
                .map(rec => rec.expand && rec.expand.bayi ? rec.expand.bayi.bayiKodu : null)
                .filter(Boolean);
        } catch (error) {
            if (error.status !== 404) console.error("Geri alınan bayi bilgisi yüklenemedi:", error);
        }

        const records = await pb.collection('denetim_raporlari').getFullList({
            filter: `denetimTamamlanmaTarihi >= "${firstDayOfMonth}"`,
            expand: 'bayi'
        });

        const allAuditedThisMonth = records.map(record => record.expand.bayi.bayiKodu);
        const finalAuditedList = allAuditedThisMonth.filter(bayiKodu => !geriAlinanlarBuAy.includes(bayiKodu));
        state.setAuditedThisMonth(finalAuditedList);

    } catch (error) {
        console.error("Bu ay denetlenen bayi verileri yüklenirken hata oluştu:", error);
    }
}

/**
 * Bulutta kayıtlı olan DiDe ve FiDe excel verilerini çeker.
 */
export async function loadExcelDataFromCloud() {
    if (!pb || !pb.authStore.isValid) return;

    try {
        const dideRecord = await pb.collection('excel_verileri').getFirstListItem('tip="dide"');
        if (dideRecord) {
            if (dideRecord.dosyaAdi) {
                const el = document.getElementById('file-name');
                if(el) el.textContent = `Buluttan yüklendi: ${dideRecord.dosyaAdi}`;
            }
            state.setDideData(dideRecord.veri);
        }
    } catch (error) {
        if (error.status !== 404) console.error("Buluttan DiDe Excel verisi yüklenirken hata oluştu:", error);
    }

    try {
        const fideRecord = await pb.collection('excel_verileri').getFirstListItem('tip="fide"');
        if (fideRecord) {
            if (fideRecord.dosyaAdi) {
                const el = document.getElementById('fide-file-name');
                if(el) el.textContent = `Buluttan yüklendi: ${fideRecord.dosyaAdi}`;
            }
            state.setFideData(fideRecord.veri);
        }
    } catch (error) {
        if (error.status !== 404) console.error("Buluttan FiDe Excel verisi yüklenirken hata oluştu:", error);
    }
}

/**
 * Uygulama için gerekli tüm başlangıç verilerini yükler.
 */
export async function loadInitialData() {
    if (!pb || !pb.authStore.isValid) {
        state.setFideQuestions(state.fallbackFideQuestions);
        return false;
    }

    showLoadingOverlay("Veriler yükleniyor...");
    try {
        await loadMonthlyAuditData();

        const ayarlarRecords = await pb.collection('ayarlar').getFullList();
        const fideQuestionsDataRecord = ayarlarRecords.find(r => r.anahtar === 'fideQuestionsData');

        if (fideQuestionsDataRecord) {
            const cloudData = fideQuestionsDataRecord.deger;
            state.setFideQuestions(cloudData.questions || []);
            state.setProductList(cloudData.productList || []);
        } else {
            throw new Error("fideQuestionsData bulunamadı");
        }

        const popSystemQuestion = state.fideQuestions.find(q => q.type === 'pop_system');
        if (popSystemQuestion) {
            state.setPopCodes(popSystemQuestion.popCodes || []);
            state.setExpiredCodes(popSystemQuestion.expiredCodes || []);
        }

        const allStoresData = await pb.collection('bayiler').getFullList({ sort: 'bayiAdi' });
        state.setAllStores(allStoresData);

        const storeEmailsData = {};
        allStoresData.forEach(store => {
            if (store.email) storeEmailsData[store.bayiKodu] = store.email;
        });
        state.setStoreEmails(storeEmailsData);
        
        await loadExcelDataFromCloud();
        return true;

    } catch (error) {
        console.error("Başlangıç verileri okunurken hata oluştu:", error);
        state.setFideQuestions(state.fallbackFideQuestions);
        const errDiv = document.getElementById('initialization-error');
        if(errDiv) errDiv.style.display = 'block';
        return false;
    } finally {
        hideLoadingOverlay();
    }
}

/**
 * Formun mevcut durumunu veritabanına kaydeder veya günceller.
 */
export async function saveFormState(reportData, isFinalizing = false) {
    if (!state.selectedStore || !pb || !pb.authStore.isValid) return;

    const bayiKodu = String(state.selectedStore.bayiKodu);
    const storeRecord = state.allStores.find(s => s.bayiKodu === bayiKodu);
    if (!storeRecord) {
        console.error("Bayi bulunamadı!");
        return;
    }

    if (isFinalizing) {
        try {
            const today = new Date();
            const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
            const undoneRecord = await pb.collection('denetim_geri_alinanlar').getFirstListItem(`yil_ay="${currentMonthKey}" && bayi="${storeRecord.id}"`);
            await pb.collection('denetim_geri_alinanlar').delete(undoneRecord.id);
        } catch (error) {
            if (error.status !== 404) console.error("Geri alınan rapor temizleme hatası:", error);
        }
    }

    const dataToSave = {
        "bayi": storeRecord.id,
        "soruDurumlari": reportData.questions_status,
        "user": pb.authStore.model.id
    };
    
    const isAlreadyAudited = state.auditedThisMonth.includes(bayiKodu);
    if (isFinalizing && !isAlreadyAudited) {
        dataToSave.denetimTamamlanmaTarihi = new Date().toISOString();
    }

    if (isFinalizing) showLoadingOverlay("Rapor kaydediliyor...");

    try {
        if (state.currentReportId) {
            await pb.collection('denetim_raporlari').update(state.currentReportId, dataToSave);
        } else {
            const newRecord = await pb.collection('denetim_raporlari').create(dataToSave);
            state.setCurrentReportId(newRecord.id);
        }
    } catch (error) {
        console.error("Kayıt hatası:", error);
        if (isFinalizing) alert("Rapor kaydedilirken bir hata oluştu!");
    } finally {
        if (isFinalizing) hideLoadingOverlay();
    }
}

/**
 * Belirli bir bayi için kaydedilmiş raporu buluttan yükler.
 */
export async function loadReportForStore(bayiKodu) {
    if (!pb || !pb.authStore.isValid) return null;
    
    showLoadingOverlay("Rapor yükleniyor...");
    try {
        const storeRecord = state.allStores.find(s => s.bayiKodu === bayiKodu);
        if (!storeRecord) throw new Error("Bayi bulunamadı.");

        const reportRecord = await pb.collection('denetim_raporlari').getFirstListItem(`bayi="${storeRecord.id}"`, {
            sort: '-created'
        });

        state.setCurrentReportId(reportRecord.id);
        return reportRecord.soruDurumlari;

    } catch (error) {
        if (error.status === 404) {
            state.setCurrentReportId(null);
        } else {
            console.error("Rapor yükleme hatası:", error);
        }
        return null;
    } finally {
        hideLoadingOverlay();
    }
}

/**
 * Belirtilen tipteki Excel verisini buluttan siler.
 */
export async function clearExcelFromCloud(type) {
    if (!pb.authStore.isValid) return;
    
    try {
        const record = await pb.collection('excel_verileri').getFirstListItem(`tip="${type}"`);
        await pb.collection('excel_verileri').delete(record.id);
        alert(`${type.toUpperCase()} verisi silindi. Sayfa yenileniyor.`);
        window.location.reload();
    } catch (error) {
        console.error("Silme hatası:", error);
    }
}

/**
 * PROFESYONEL PARMAK İZİ DESTEKLİ GİRİŞ
 */
export async function loginUser(email, password) {
    if (!pb) return { success: false, message: "Bağlantı hatası." };

    let user;
    try {
        const authData = await pb.collection('users').authWithPassword(email, password);
        user = await pb.collection('users').getOne(authData.record.id);
    } catch (error) {
        return { success: false, message: "E-posta veya şifre hatalı." };
    }

    try {
        if (user.is_banned === true) {
            logoutUser();
            return { success: false, message: "Bu hesap kilitlenmiştir." };
        }

        if (user.role === 'admin') return { success: true, message: "Yönetici girişi başarılı." };

        if (user.mobile_access === false && isMobileDevice()) {
            logoutUser();
            return { success: false, message: "Mobil cihaz girişi yasaktır." };
        }

        // Cihaz parmak izini hesapla
        const browserFingerprint = await getDeviceFingerprint();
        const currentDeviceDesc = getDeviceDescription();

        try {
            // Parmak iziyle eşleşen cihazı ara
            const deviceRecord = await pb.collection('user_devices').getFirstListItem(
                `user="${user.id}" && device_key="${browserFingerprint}"`
            );

            if (deviceRecord.is_locked) {
                logoutUser();
                return { success: false, message: "Bu cihaz kilitlenmiştir." };
            }

            await pb.collection('user_devices').update(deviceRecord.id, {
                'last_login': new Date().toISOString(),
                'device_info': currentDeviceDesc 
            });
            return { success: true, message: "Giriş başarılı." };

        } catch (error) {
            // Parmak izi sistemde yoksa yeni cihaz olarak değerlendir
            const deviceLimit = user.device_limit || 1;
            const userDevices = await pb.collection('user_devices').getFullList({
                filter: `user="${user.id}"`
            });
            
            if (userDevices.length >= deviceLimit) {
                logoutUser();
                return { 
                    success: false, 
                    message: `Cihaz limitiniz (${deviceLimit}) dolmuştur. Lütfen yöneticinizle iletişime geçin.` 
                };
            }

            await pb.collection('user_devices').create({
                'user': user.id,
                'device_key': browserFingerprint,
                'device_info': currentDeviceDesc,
                'last_login': new Date().toISOString(),
                'is_locked': false
            });

            return { success: true, message: "Yeni cihaz kaydedildi." };
        }

    } catch (error) {
        console.error("Güvenlik kontrolü hatası:", error);
        logoutUser();
        return { success: false, message: "Güvenlik hatası oluştu." };
    }
}

/**
 * Kullanıcı çıkış işlemini yapar.
 */
export function logoutUser() {
    if (pb) {
        pb.authStore.clear();
    }
}