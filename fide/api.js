// 'showLockoutOverlay' fonksiyonunu utils.js'den içeri aktar
import { showLoadingOverlay, hideLoadingOverlay, showLockoutOverlay } from './utils.js';
import * as state from './state.js';

let pb; // PocketBase instance

// --- YARDIMCI GÜVENLİK FONKSİYONLARI ---
// (Bu bölümde değişiklik yok)

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

    // İşletim Sistemi Tespiti
    if (/Windows/.test(ua)) os = "Windows";
    else if (/Macintosh/.test(ua)) os = "MacOS";
    else if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
    else if (/Android/.test(ua)) os = "Android";
    else if (/Linux/.test(ua)) os = "Linux";

    // Tarayıcı Tespiti
    if (/Edg/.test(ua)) browser = "Edge";
    else if (/Chrome/.test(ua) && !/Edg/.test(ua)) browser = "Chrome";
    else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = "Safari";
    else if (/Firefox/.test(ua)) browser = "Firefox";
    
    return `${browser} on ${os}`;
}

/**
 * Rastgele, benzersiz bir cihaz anahtarı oluşturur.
 * @returns {string} Örneğin: "AHS7-8J3K-9B3D-N1C9"
 */
function generateDeviceKey() {
    const arr = new Uint32Array(4);
    window.crypto.getRandomValues(arr); 
    return Array.from(arr, dec => dec.toString(36)).join('-').toUpperCase();
}


/**
 * API modülünü PocketBase instance ile başlatır.
 * @param {object} pbInstance 
 */
export function initApi(pbInstance) {
    pb = pbInstance;
}

// --- (SÜRE GÜNCELLENDİ) ANLIK ABONELİK FONKSİYONU ---

/**
 * (SÜRE GÜNCELLENDİ)
 * Kullanıcının kilit (ban) ve cihaz kilidi (lock) durumlarını anlık dinler.
 * ÖNCE cihazın mevcut durumunu kontrol eder, SONRA değişiklikleri dinler.
 */
export async function subscribeToRealtimeChanges() {
    if (!pb || !pb.authStore.isValid) {
        return; // Giriş yapılmamışsa dinleme
    }

    const userId = pb.authStore.model.id;
    const browserDeviceKey = localStorage.getItem('myAppDeviceKey');

    // 1. Hesap Kilidi (Ban) Dinlemesi
    try {
        // --- ANINDA KONTROL (Hesap Banı) ---
        const currentUserRecord = await pb.collection('users').getOne(userId);
        if (currentUserRecord.is_banned === true) {
             console.warn('Hesap zaten kilitli. Oturum sonlandırılıyor.');
             showLockoutOverlay("Hesabınız bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...");
             logoutUser();
             // --- SÜRE GÜNCELLENDİ ---
             setTimeout(() => window.location.reload(), 3000); // 2 saniyeden 3 saniyeye
             return; // Fonksiyondan çık
        }
        
        // --- GELECEKTEKİ DEĞİŞİKLİKLERİ DİNLE (Hesap Banı) ---
        pb.collection('users').subscribe(userId, function(e) {
            if (e.record && e.record.is_banned === true) {
                console.warn('Kullanıcı kilitlendi (is_banned=true). Oturum sonlandırılıyor.');
                showLockoutOverlay("Hesabınız bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...");
                logoutUser();
                // --- SÜRE GÜNCELLENDİ ---
                setTimeout(() => window.location.reload(), 3000); // 2 saniyeden 3 saniyeye
            }
        });
    } catch (error) {
        console.error('Kullanıcı (ban) dinlemesi başlatılamadı:', error);
    }

    // 2. Cihaz Kilidi Dinlemesi (Sadece 'client' rolü ve kayıtlı anahtar varsa)
    if (pb.authStore.model.role === 'client' && browserDeviceKey) {
        try {
            // 1. Cihazın mevcut kaydını bul
            const deviceRecord = await pb.collection('user_devices').getFirstListItem(
                `user="${userId}" && device_key="${browserDeviceKey}"`
            );

            // 2. (YENİ) ANINDA KONTROL: Cihaz zaten kilitli mi?
            if (deviceRecord.is_locked === true) {
                console.warn('Cihaz zaten kilitli. Oturum sonlandırılıyor.');
                showLockoutOverlay("Bu cihaz bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...");
                logoutUser();
                // --- SÜRE GÜNCELLENDİ ---
                setTimeout(() => window.location.reload(), 3000); // 2 saniyeden 3 saniyeye
                return; // Fonksiyondan çık, abonelik kurma
            }

            // 3. (MEVCUT) GELECEKTEKİ DEĞİŞİKLİKLERİ DİNLE: Cihaz şu an kilitli değil.
            pb.collection('user_devices').subscribe(deviceRecord.id, function(e) {
                if (e.record && e.record.is_locked === true) {
                    console.warn('Cihaz kilitlendi (is_locked=true). Oturum sonlandırılıyor.');
                    showLockoutOverlay("Bu cihaz bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...");
                    logoutUser();
                    // --- SÜRE GÜNCELLENDİ ---
                    setTimeout(() => window.location.reload(), 3000); // 2 saniyeden 3 saniyeye
                }
            });

        } catch (error) {
            // Hata (örn: 404 Not Found), cihaz kaydının silindiği anlamına gelir.
            console.error('Cihaz (lock) dinlemesi başlatılamadı veya cihaz kaydı bulunamadı:', error);
            
            showLockoutOverlay("Cihaz kaydınız bulunamadı veya geçersiz. Güvenlik nedeniyle çıkış yapılıyor...");
            logoutUser();
            localStorage.removeItem('myAppDeviceKey'); // Bozuk anahtarı temizle
            // --- SÜRE GÜNCELLENDİ ---
            setTimeout(() => window.location.reload(), 3000); // 2 saniyeden 3 saniyeye
        }
    }
}


// --- MEVCUT FONKSİYONLAR ---

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

export async function loadExcelDataFromCloud() {
    if (!pb || !pb.authStore.isValid) return;

    try {
        const dideRecord = await pb.collection('excel_verileri').getFirstListItem('tip="dide"');
        if (dideRecord) {
            if (dideRecord.dosyaAdi) {
                document.getElementById('file-name').textContent = `Buluttan yüklendi: ${dideRecord.dosyaAdi}`;
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
                document.getElementById('fide-file-name').textContent = `Buluttan yüklendi: ${fideRecord.dosyaAdi}`;
            }
            state.setFideData(fideRecord.veri);
        }
    } catch (error) {
        if (error.status !== 404) console.error("Buluttan FiDe Excel verisi yüklenirken hata oluştu:", error);
    }
}

// --- YENİ EKLENEN: EXCEL EŞLEŞTİRME AYARLARINI YÖNETME ---

/**
 * PocketBase'deki 'ayarlar' koleksiyonundan Excel sütun eşleştirmelerini çeker.
 * @returns {Promise<Object>} { dide: {...}, fide: {...} } formatında ayarlar.
 */
export async function getExcelMappings() {
    if (!pb || !pb.authStore.isValid) return { dide: null, fide: null };

    try {
        const record = await pb.collection('ayarlar').getFirstListItem('anahtar="excel_mappings"');
        return record.deger || { dide: null, fide: null };
    } catch (error) {
        // Eğer ayar hiç yoksa (ilk kurulum), boş dön.
        if (error.status === 404) return { dide: null, fide: null };
        console.error("Excel mapping ayarları çekilemedi:", error);
        return { dide: null, fide: null };
    }
}

/**
 * Kullanıcının Excel Sihirbazında yaptığı seçimi PocketBase'e kaydeder.
 * @param {string} type 'dide' veya 'fide'
 * @param {Object} mappingConfig { bayiColIndex: 0, firstMonthColIndex: 3, headerRowIndex: 0 }
 */
export async function saveExcelMapping(type, mappingConfig) {
    if (!pb || !pb.authStore.isValid) return false;

    try {
        // Mevcut ayarları çek
        let currentSettings = { dide: null, fide: null };
        let recordId = null;

        try {
            const record = await pb.collection('ayarlar').getFirstListItem('anahtar="excel_mappings"');
            currentSettings = record.deger;
            recordId = record.id;
        } catch (e) {
            // Kayıt yoksa devam et (create yapılacak)
        }

        // İlgili tipi güncelle
        currentSettings[type] = mappingConfig;

        if (recordId) {
            await pb.collection('ayarlar').update(recordId, { deger: currentSettings });
        } else {
            await pb.collection('ayarlar').create({
                anahtar: 'excel_mappings',
                deger: currentSettings
            });
        }
        return true;
    } catch (error) {
        console.error("Excel mapping ayarları kaydedilemedi:", error);
        alert("Sütun ayarları buluta kaydedilemedi. Lütfen internet bağlantınızı kontrol edin.");
        return false;
    }
}


/**
 * Uygulama için gerekli tüm başlangıç verilerini yükler.
 * --- GÜNCELLENDİ: Excel Mappings'i de state'e atar ---
 */
export async function loadInitialData() {
    if (!pb || !pb.authStore.isValid) {
        state.setFideQuestions(state.fallbackFideQuestions);
        return false;
    }

    showLoadingOverlay("Veriler yükleniyor...");
    try {
        await loadMonthlyAuditData();

        // Ayarları Toplu Çek
        const ayarlarRecords = await pb.collection('ayarlar').getFullList();
        
        // 1. Sorular
        const fideQuestionsDataRecord = ayarlarRecords.find(r => r.anahtar === 'fideQuestionsData');
        if (fideQuestionsDataRecord) {
            const cloudData = fideQuestionsDataRecord.deger;
            state.setFideQuestions(cloudData.questions || []);
            state.setProductList(cloudData.productList || []);
        } else {
            throw new Error("fideQuestionsData bulunamadı");
        }

        // 2. Pop Sistemi
        const popSystemQuestion = state.fideQuestions.find(q => q.type === 'pop_system');
        if (popSystemQuestion) {
            state.setPopCodes(popSystemQuestion.popCodes || []);
            state.setExpiredCodes(popSystemQuestion.expiredCodes || []);
        }

        // 3. (YENİ) Excel Eşleştirmeleri
        const mappingRecord = ayarlarRecords.find(r => r.anahtar === 'excel_mappings');
        if (mappingRecord && mappingRecord.deger) {
            // State.js'de bu alanı tutacak bir yerimiz yoksa bile
            // Excel.js her seferinde api.getExcelMappings ile de çekebilir.
            // Ancak performans için state nesnesine "temp" olarak ekliyoruz.
            state.appState.excelMappings = mappingRecord.deger; 
        } else {
            state.appState.excelMappings = { dide: null, fide: null };
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
        document.getElementById('initialization-error').style.display = 'block';
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
        console.error("Kaydedilecek bayi veritabanında bulunamadı!");
        return;
    }

    if (isFinalizing) {
        try {
            const today = new Date();
            const currentMonthKey = `${today.getFullYear()}-${today.getMonth()}`;
            const undoneRecord = await pb.collection('denetim_geri_alinanlar').getFirstListItem(`yil_ay="${currentMonthKey}" && bayi="${storeRecord.id}"`);
            await pb.collection('denetim_geri_alinanlar').delete(undoneRecord.id);
        } catch (error) {
            if (error.status !== 404) console.error("Geri alınmış denetim kaydı temizlenirken bir hata oluştu:", error);
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

    // --- GÜNCELLEME ---
    // Yükleme ekranını SADECE "isFinalizing" (E-posta taslağı oluşturma) 
    // durumunda göster. Diğer tüm (arka plan) kaydetmeler sessizce yapılsın.
    if (isFinalizing) {
        showLoadingOverlay("Rapor kaydediliyor...");
    }

    try {
        if (state.currentReportId) {
            await pb.collection('denetim_raporlari').update(state.currentReportId, dataToSave);
        } else {
            const newRecord = await pb.collection('denetim_raporlari').create(dataToSave);
            state.setCurrentReportId(newRecord.id);
        }
    } catch (error) {
        console.error("PocketBase'e yazma hatası:", error);
        // Sadece sonlandırma sırasında hata uyarısı göster
        if (isFinalizing) {
            alert("Rapor kaydedilirken bir hata oluştu!");
        }
    } finally {
        // Yükleme ekranını sadece gösterildiyse gizle
        if (isFinalizing) {
            hideLoadingOverlay();
        }
    }
}

/**
 * Belirli bir bayi için kaydedilmiş raporu buluttan yükler.
 * (Bu fonksiyonda değişiklik yok)
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
            console.log("Bu bayi için kaydedilmiş bir rapor bulunamadı. Temiz form açılıyor.");
            state.setCurrentReportId(null);
        } else {
            console.error("PocketBase'den rapor okuma hatası:", error);
        }
        return null;
    } finally {
        hideLoadingOverlay();
    }
}

/**
 * Belirtilen tipteki Excel verisini buluttan siler.
 * (Bu fonksiyonda değişiklik yok)
 */
export async function clearExcelFromCloud(type) {
    if (!pb.authStore.isValid) {
        alert("Bu işlem için giriş yapmış olmalısınız.");
        return;
    }
    
    try {
        const record = await pb.collection('excel_verileri').getFirstListItem(`tip="${type}"`);
        await pb.collection('excel_verileri').delete(record.id);
        alert(`${type.toUpperCase()} Excel verisi buluttan temizlendi. Sayfa yenileniyor.`);
        window.location.reload();
    } catch (error) {
        if (error.status === 404) {
            alert(`Silinecek ${type.toUpperCase()} verisi bulunamadı.`);
        } else {
            console.error(`${type.toUpperCase()} verisi silinirken bir hata oluştu:`, error);
            alert("Veri silinirken bir hata oluştu.");
        }
    }
}

/**
 * DÜZELTİLDİ: Kullanıcı girişi ve BİREYSEL cihaz limiti.
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<{success: boolean, message: string}>} Giriş denemesinin sonucunu döner.
 * (Bu fonksiyonda değişiklik yok)
 */
export async function loginUser(email, password) {
    if (!pb) return { success: false, message: "Veritabanı bağlantısı kurulamadı." };

    let user;
    try {
        // 1. Adım: Şifre ile kimlik doğrulama
        const authData = await pb.collection('users').authWithPassword(email, password);
        
        // --- DÜZELTME BURADA ---
        // 'authData.record' (dönen kayıt), 'device_limit' gibi özel alanlarımızı içermeyebilir.
        // Bu nedenle, 'device_limit' gibi alanlara güvenli erişim için
        // kullanıcının tam kaydını 'getOne' ile tekrar çekiyoruz.
        user = await pb.collection('users').getOne(authData.record.id);
        // --- DÜZELTME BİTTİ ---

    } catch (error) {
        console.error("Login error:", error);
        return { success: false, message: "E-posta veya şifre hatalı." };
    }

    try {
        // 2. Adım: Kullanıcı KİLİTLİ (BANNED) mi?
        if (user.is_banned === true) {
            logoutUser();
            return { success: false, message: "Bu hesap yönetici tarafından kilitlenmiştir." };
        }

        // 3. Adım: Kullanıcı ROLÜ 'admin' mi?
        if (user.role === 'admin') {
            return { success: true, message: "Yönetici girişi başarılı." };
        }

        // 4. Adım: 'client' (Standart Kullanıcı) için Güvenlik Kontrolleri
        
        // 4a. Mobil Erişim Kontrolü
        if (user.mobile_access === false && isMobileDevice()) {
            logoutUser();
            return { success: false, message: "Bu hesaptan mobil cihaz ile giriş izni yoktur." };
        }

        // 4b. Yeni Cihaz Yönetimi
        const browserDeviceKey = localStorage.getItem('myAppDeviceKey');
        const currentDeviceDesc = getDeviceDescription(); 

        if (browserDeviceKey) {
            // --- CİHAZDA ANAHTAR VAR (Normal giriş denemesi) ---
            try {
                const deviceRecord = await pb.collection('user_devices').getFirstListItem(
                    `user="${user.id}" && device_key="${browserDeviceKey}"`
                );

                if (deviceRecord.is_locked) {
                    logoutUser();
                    return { success: false, message: "Bu cihaz yönetici tarafından kilitlenmiştir." };
                }

                await pb.collection('user_devices').update(deviceRecord.id, {
                    'last_login': new Date().toISOString(),
                    'device_info': currentDeviceDesc 
                });
                return { success: true, message: "Giriş başarılı." };

            } catch (error) {
                // Hata 404 (Not Found) ise: Tarayıcıdaki anahtar veritabanında yok.
                // (Muhtemelen admin tarafından silinmiş veya eski sistemden kalma).
                // Anahtarı temizle ve yeniden giriş yapmayı dene (yeni cihaz gibi).
                localStorage.removeItem('myAppDeviceKey');
                return loginUser(email, password); // Fonksiyonu yeniden çağır
            }

        } else {
            // --- CİHAZDA ANAHTAR YOK (Yeni Cihaz Kaydı) ---
            
            // Cihaz limitini doğrudan tam 'user' kaydından oku
            // (Artık 'user' nesnesinde 'device_limit' alanı garanti)
            const deviceLimit = user.device_limit || 1; 

            const userDevices = await pb.collection('user_devices').getFullList({
                filter: `user="${user.id}"`
            });
            
            if (userDevices.length >= deviceLimit) {
                // CİHAZ LİMİTİ DOLU
                logoutUser();
                return { 
                    success: false, 
                    message: `Kişisel cihaz limitiniz (${deviceLimit}) dolmuştur. Yeni bir cihaz ekleyemezsiniz. Lütfen yöneticinizle iletişime geçin.` 
                };
            }

            // LİMİT DOLU DEĞİL: Yeni cihazı kaydet
            const newKey = generateDeviceKey();
            
            await pb.collection('user_devices').create({
                'user': user.id,
                'device_key': newKey,
                'device_info': currentDeviceDesc,
                'last_login': new Date().toISOString(),
                'is_locked': false
            });

            localStorage.setItem('myAppDeviceKey', newKey);
            return { success: true, message: "Yeni cihaz kaydedildi ve giriş yapıldı." };
        }

    } catch (error) {
        // Bu 'catch' bloğu, 4. Adımdaki (client güvenliği) tüm hataları yakalar.
        console.error("Login security check error:", error);
        logoutUser();
        // Hatanın nedeni büyük ihtimalle 'user_devices' tablosunun bulunamaması
        // veya 'device_limit' alanının 'users' tablosuna eklenmemiş olmasıdır.
        return { success: false, message: "Güvenlik kontrolü sırasında bir hata oluştu." };
    }
}

/**
 * Kullanıcı çıkış işlemini yapar.
 * (Bu fonksiyonda değişiklik yok)
 */
export function logoutUser() {
    if (pb) {
        pb.authStore.clear();
    }
}