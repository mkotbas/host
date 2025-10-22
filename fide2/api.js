import { showLoadingOverlay, hideLoadingOverlay } from './utils.js';
import * as state from './state.js';

let pb; // PocketBase instance

// --- YENİ YARDIMCI GÜVENLİK FONKSİYONLARI ---

/**
 * Cihazın mobil olup olmadığını User Agent üzerinden kontrol eder.
 * @returns {boolean}
 */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

/**
 * YENİ FONKSİYON: Rastgele, benzersiz bir cihaz anahtarı oluşturur.
 * @returns {string} Örneğin: "AHS7-8J3K-9B3D-N1C9"
 */
function generateDeviceKey() {
    const arr = new Uint32Array(4);
    // Kriptografik olarak güvenli rastgele sayılar kullan
    window.crypto.getRandomValues(arr); 
    // Sayıları 36'lık tabana (harf+rakam) çevir ve birleştir
    return Array.from(arr, dec => dec.toString(36)).join('-').toUpperCase();
}

/**
 * KALDIRILDI: getFormattedUserAgent() fonksiyonu artık kullanılmıyor.
 */


/**
 * API modülünü PocketBase instance ile başlatır.
 * @param {object} pbInstance 
 */
export function initApi(pbInstance) {
    pb = pbInstance;
}

/**
 * O anki aya ait denetim verilerini (kimler denetlenmiş) yükler.
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
 * Uygulama için gerekli tüm başlangıç verilerini (sorular, bayiler vb.) yükler.
 * @returns {boolean} Veri yükleme başarılı olursa true, aksi takdirde false döner.
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
 * GÜNCELLENDİ: Kullanıcı girişi ve YENİ cihaz anahtarı kontrolünü gerçekleştirir.
 * @param {string} email 
 * @param {string} password 
 * @returns {Promise<{success: boolean, message: string}>} Giriş denemesinin sonucunu döner.
 */
export async function loginUser(email, password) {
    if (!pb) return { success: false, message: "Veritabanı bağlantısı kurulamadı." };

    try {
        // 1. Adım: Şifre ile kimlik doğrulama
        await pb.collection('users').authWithPassword(email, password);
    } catch (error) {
        console.error("Login error:", error);
        return { success: false, message: "E-posta veya şifre hatalı." };
    }

    try {
        // 2. Adım: Güvenlik alanlarını içeren tam kullanıcı kaydını çek
        const user = await pb.collection('users').getOne(pb.authStore.model.id);

        // 3. Adım: Mobil Erişim Kontrolü
        if (user.mobile_access === false && isMobileDevice()) {
            logoutUser(); // Güvenlik ihlalinde oturumu hemen kapat
            return { success: false, message: "Bu hesaptan mobil cihaz ile giriş izni yoktur." };
        }

        // 4. Adım: Cihaz Anahtarı (Device Key) Kontrolü
        // Tarayıcının hafızasındaki anahtarı al
        const browserDeviceKey = localStorage.getItem('myAppDeviceKey');
        // Veritabanındaki anahtarı al
        const dbDeviceKey = user.device_key;

        if (!dbDeviceKey) {
            // Senaryo 1: İLK GİRİŞ. Kullanıcının veritabanında anahtarı yok.
            // Yeni bir anahtar oluştur, tarayıcıya ve veritabanına kaydet.
            const newKey = generateDeviceKey();
            localStorage.setItem('myAppDeviceKey', newKey);
            await pb.collection('users').update(user.id, { 'device_key': newKey });
            
        } else if (dbDeviceKey !== browserDeviceKey) {
            // Senaryo 2: ENGELLEME. 
            // Veritabanında bir anahtar var, ancak tarayıcıdaki anahtar onunla eşleşmiyor
            // (ya başka bir cihazdan giriyor ya da tarayıcı hafızası silinmiş).
            logoutUser(); // Güvenlik ihlalinde oturumu hemen kapat
            return { success: false, message: `Bu hesaba sadece kayıtlı cihazdan giriş yapılabilir. Bu cihazı ilk kez kullanıyorsanız veya tarayıcı verilerini sildiyseniz, yöneticinizden cihaz kilidini sıfırlamasını isteyin.` };
        }
        
        // Senaryo 3: BAŞARILI GİRİŞ.
        // dbDeviceKey var VE browserDeviceKey ile eşleşiyor.
        // Tüm kontrollerden geçti
        return { success: true, message: "Giriş başarılı." };

    } catch (error) {
        console.error("Login security check error:", error);
        logoutUser(); // Herhangi bir hata durumunda oturumu kapat
        return { success: false, message: "Güvenlik kontrolü sırasında bir hata oluştu." };
    }
}

/**
 * Kullanıcı çıkış işlemini yapar.
 * (Bu fonksiyonda değişiklik yok)
 * ÖNEMLİ NOT: Çıkış yaparken 'myAppDeviceKey'i localStorage'dan SİLMEYİZ.
 * Silinirse, kullanıcı kendi cihazından bile kilitlenir. 
 * Anahtar tarayıcıda kalıcı olmalıdır.
 */
export function logoutUser() {
    if (pb) {
        pb.authStore.clear();
    }
}