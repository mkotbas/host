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

// --- (YENİ) ANLIK ABONELİK FONKSİYONU ---

/**
 * (YENİ FONKSİYON)
 * Kullanıcının kilit (ban) ve cihaz kilidi (lock) durumlarını anlık dinler.
 * Bir kilitlenme tespit ederse, kullanıcıyı bilgilendirir ve sistemden atar.
 */
export function subscribeToRealtimeChanges() {
    if (!pb || !pb.authStore.isValid) {
        return; // Giriş yapılmamışsa dinleme
    }

    const userId = pb.authStore.model.id;
    const browserDeviceKey = localStorage.getItem('myAppDeviceKey');

    // 1. Hesap Kilidi (Ban) Dinlemesi
    try {
        pb.collection('users').subscribe(userId, function(e) {
            console.log('Kullanıcı kaydı güncellendi (is_banned?):', e.record);
            
            if (e.record && e.record.is_banned === true) {
                console.warn('Kullanıcı kilitlendi (is_banned=true). Oturum sonlandırılıyor.');
                
                // utils.js'teki yeni kilit ekranını göster
                showLockoutOverlay("Hesabınız bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...");
                
                // Oturumu temizle
                logoutUser();
                
                // Kullanıcının mesajı görmesi için 2 saniye bekle ve sayfayı yenile
                setTimeout(() => {
                    window.location.reload();
                }, 2000);
            }
        });
    } catch (error) {
        console.error('Kullanıcı (ban) dinlemesi başlatılamadı:', error);
    }

    // 2. Cihaz Kilidi Dinlemesi (Sadece 'client' rolü ve kayıtlı anahtar varsa)
    if (pb.authStore.model.role === 'client' && browserDeviceKey) {
        try {
            // 'user_devices' tablosunu dinle, ama SADECE bu kullanıcıya VE bu cihaza ait kayıtlar için filtrele
            pb.collection('user_devices').subscribe('*', async function(e) {
                // console.log('Cihaz kaydı güncellendi (is_locked?):', e.record);

                // Gelen güncelleme bu kullanıcıya ve bu cihaza mı ait?
                if (e.record && e.record.user === userId && e.record.device_key === browserDeviceKey) {
                    
                    if (e.record.is_locked === true) {
                        console.warn('Cihaz kilitlendi (is_locked=true). Oturum sonlandırılıyor.');

                        // utils.js'teki yeni kilit ekranını göster
                        showLockoutOverlay("Bu cihaz bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...");
                        
                        // Oturumu temizle
                        logoutUser();
                        
                        // Kullanıcının mesajı görmesi için 2 saniye bekle ve sayfayı yenile
                        setTimeout(() => {
                            window.location.reload();
                        }, 2000);
                    }
                }
            });
        } catch (error) {
            console.error('Cihaz (lock) dinlemesi başlatılamadı:', error);
        }
    }
}


// --- MEVCUT FONKSİYONLAR (Bu bölümde değişiklik yok) ---

/**
 * O anki aya ait denetim verilerini yükler.
 * (Bu fonksiyonda değişiklik yok)
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
 * (Bu fonksiyonda değişiklik yok)
 */
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

/**
 * Uygulama için gerekli tüm başlangıç verilerini yükler.
 * (Bu fonksiyonda değişiklik yok)
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
        document.getElementById('initialization-error').style.display = 'block';
        return false;
    } finally {
        hideLoadingOverlay();
    }
}

/**
 * Formun mevcut durumunu veritabanına kaydeder veya günceller.
 * (Bu fonksiyonda değişiklik yok)
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

    showLoadingOverlay("Rapor kaydediliyor...");
    try {
        if (state.currentReportId) {
            await pb.collection('denetim_raporlari').update(state.currentReportId, dataToSave);
        } else {
            const newRecord = await pb.collection('denetim_raporlari').create(dataToSave);
            state.setCurrentReportId(newRecord.id);
        }
    } catch (error) {
        console.error("PocketBase'e yazma hatası:", error);
        alert("Rapor kaydedilirken bir hata oluştu!");
    } finally {
        hideLoadingOverlay();
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