import { pb } from './db-config';
import {
  showLoadingOverlay,
  hideLoadingOverlay,
  showLockoutOverlay,
  toDbDateString,
  getYearMonthKey,
} from './utils';
import {
  getAllStores,
  getAuditedThisMonth,
  getCurrentReportId,
  getSelectedStore,
  setAllStores,
  setAuditedThisMonth,
  setCurrentReportId,
  setDideData,
  setFideData,
  setFideQuestions,
  setIsPocketBaseConnected,
  setPopCodes,
  setExpiredCodes,
  setProductList,
  setStoreEmails,
  FALLBACK_FIDE_QUESTIONS,
  type FideQuestion,
  type Store,
  type DideEntry,
  type FideEntry,
} from './state';

// ─── Tip Tanımları ────────────────────────────────────────────────────────────

interface LoginResult {
  success: boolean;
  message: string;
}

interface ReportData {
  questions_status: Record<string, unknown>;
}

// ─── Cihaz Tespiti ────────────────────────────────────────────────────────────

function isMobileDevice(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

function getDeviceDescription(): string {
  const ua = navigator.userAgent;

  let os = 'Unknown OS';
  if (/Windows/.test(ua))            os = 'Windows';
  else if (/Macintosh/.test(ua))     os = 'MacOS';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua))       os = 'Android';
  else if (/Linux/.test(ua))         os = 'Linux';

  let browser = 'Unknown Browser';
  if (/Edg/.test(ua))                            browser = 'Edge';
  else if (/Chrome/.test(ua))                    browser = 'Chrome';
  else if (/Safari/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Firefox/.test(ua))                   browser = 'Firefox';

  return `${browser} on ${os}`;
}

// ─── Cihaz Parmak İzi (Canvas Fingerprinting + SHA-256) ──────────────────────

async function getDeviceFingerprint(): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  let canvasData = '';

  if (ctx) {
    ctx.textBaseline = 'alphabetic';
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = '#f60';
    ctx.fillRect(125, 1, 62, 20);
    ctx.fillStyle = '#069';
    ctx.fillText('FideSecurity_123!@#', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('FideSecurity_123!@#', 4, 17);
    canvasData = canvas.toDataURL();
  }

  const components = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    `${screen.width}x${screen.height}`,
    new Date().getTimezoneOffset(),
    navigator.hardwareConcurrency ?? 'unknown',
    navigator.platform,
    canvasData,
  ];

  const fingerprintString = components.join('###');
  const msgUint8 = new TextEncoder().encode(fingerprintString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ─── Gerçek Zamanlı Değişiklik Dinleyicisi ────────────────────────────────────

export async function subscribeToRealtimeChanges(): Promise<void> {
  if (!pb.authStore.isValid) return;

  const userId = pb.authStore.model?.['id'] as string;
  const browserDeviceKey = await getDeviceFingerprint();

  // Hesap ban kontrolü — sayfa açılışında anlık kontrol
  try {
    const currentUser = await pb.collection('users').getOne(userId);
    if (currentUser['is_banned'] === true) {
      showLockoutOverlay('Hesabınız bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...');
      logoutUser();
      setTimeout(() => { window.location.reload(); }, 3000);
      return;
    }

    // Gerçek zamanlı ban dinleyicisi
    pb.collection('users').subscribe(userId, (e) => {
      if (e.record?.['is_banned'] === true) {
        showLockoutOverlay('Hesabınız bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...');
        logoutUser();
        setTimeout(() => { window.location.reload(); }, 3000);
      }
    });
  } catch {
    // Kullanıcı dinlemesi başlatılamadı — sessizce devam
  }

  // Client rolü için cihaz kilidi kontrolü
  if (pb.authStore.model?.['role'] !== 'client') return;

  try {
    const deviceRecord = await pb.collection('user_devices').getFirstListItem(
      `user="${userId}" && device_key="${browserDeviceKey}"`,
    );

    if (deviceRecord['is_locked'] === true) {
      showLockoutOverlay('Bu cihaz bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...');
      logoutUser();
      setTimeout(() => { window.location.reload(); }, 3000);
      return;
    }

    pb.collection('user_devices').subscribe(deviceRecord['id'] as string, (e) => {
      if (e.record?.['is_locked'] === true) {
        showLockoutOverlay('Bu cihaz bir yönetici tarafından kilitlenmiştir. Sistemden çıkış yapılıyor...');
        logoutUser();
        setTimeout(() => { window.location.reload(); }, 3000);
      }
    });
  } catch {
    // Cihaz kaydı bulunamadı — sessizce devam
  }
}

// ─── Aylık Denetim Verisi ─────────────────────────────────────────────────────

async function loadMonthlyAuditData(): Promise<void> {
  setAuditedThisMonth([]);
  if (!pb.authStore.isValid) return;

  const today = new Date();
  const firstDayOfMonth = toDbDateString(new Date(today.getFullYear(), today.getMonth(), 1));
  const currentMonthKey = getYearMonthKey(today);

  // Bu ay geri alınan bayileri al
  let revertedCodes: string[] = [];
  try {
    const revertedRecords = await pb.collection('denetim_geri_alinanlar').getFullList({
      filter: `yil_ay = "${currentMonthKey}"`,
      expand: 'bayi',
    });
    revertedCodes = revertedRecords
      .map(r => r['expand']?.['bayi']?.['bayiKodu'] as string | undefined)
      .filter((c): c is string => Boolean(c));
  } catch {
    // Geri alınan kayıt yoksa devam et
  }

  // Bu ay tamamlanan raporları al
  try {
    const records = await pb.collection('denetim_raporlari').getFullList({
      filter: `denetimTamamlanmaTarihi >= "${firstDayOfMonth}"`,
      expand: 'bayi',
    });

    const allAuditedCodes = records
      .map(r => r['expand']?.['bayi']?.['bayiKodu'] as string | undefined)
      .filter((c): c is string => Boolean(c));

    const uniqueCodes = [...new Set(allAuditedCodes)];
    const finalCodes = uniqueCodes.filter(code => !revertedCodes.includes(code));
    setAuditedThisMonth(finalCodes);
  } catch {
    // Rapor yüklenemedi
  }
}

// ─── Başlangıç Verileri ───────────────────────────────────────────────────────

export async function loadInitialData(): Promise<boolean> {
  if (!pb.authStore.isValid) {
    setFideQuestions(FALLBACK_FIDE_QUESTIONS);
    return false;
  }

  showLoadingOverlay('Veriler yükleniyor...');

  try {
    await loadMonthlyAuditData();

    // Soru listesi ve ayarlar
    const ayarlarRecords = await pb.collection('ayarlar').getFullList();
    const fideQuestionsRecord = ayarlarRecords.find(r => r['anahtar'] === 'fideQuestionsData');

    if (!fideQuestionsRecord) throw new Error('fideQuestionsData bulunamadı');

    const cloudData = fideQuestionsRecord['deger'] as {
      questions?: FideQuestion[];
      productList?: string[];
    };

    setFideQuestions(cloudData.questions ?? []);
    setProductList(cloudData.productList ?? []);

    const popQuestion = (cloudData.questions ?? []).find(q => q.type === 'pop_system');
    if (popQuestion) {
      setPopCodes(popQuestion.popCodes ?? []);
      setExpiredCodes(popQuestion.expiredCodes ?? []);
    }

    // Bayi listesi
    const stores = await pb.collection('bayiler').getFullList<Store>({ sort: 'bayiAdi' });
    setAllStores(stores);

    const emails: Record<string, string> = {};
    stores.forEach(s => { if (s.email) emails[s.bayiKodu] = s.email; });
    setStoreEmails(emails);

    await loadExcelDataFromCloud();
    setIsPocketBaseConnected(true);
    return true;

  } catch {
    setFideQuestions(FALLBACK_FIDE_QUESTIONS);
    const errDiv = document.getElementById('initialization-error');
    if (errDiv) errDiv.removeAttribute('hidden');
    return false;
  } finally {
    hideLoadingOverlay();
  }
}

// ─── Excel Verisi (Buluttan) ──────────────────────────────────────────────────

export async function loadExcelDataFromCloud(): Promise<void> {
  if (!pb.authStore.isValid) return;

  try {
    const dideRecord = await pb.collection('excel_verileri').getFirstListItem('tip="dide"');
    const fileNameEl = document.getElementById('file-name');
    if (fileNameEl && dideRecord['dosyaAdi']) {
      fileNameEl.textContent = `Buluttan yüklendi: ${dideRecord['dosyaAdi'] as string}`;
    }
    setDideData(dideRecord['veri'] as DideEntry[]);
  } catch {
    // DiDe verisi yok — normal durum
  }

  try {
    const fideRecord = await pb.collection('excel_verileri').getFirstListItem('tip="fide"');
    const fileNameEl = document.getElementById('fide-file-name');
    if (fileNameEl && fideRecord['dosyaAdi']) {
      fileNameEl.textContent = `Buluttan yüklendi: ${fideRecord['dosyaAdi'] as string}`;
    }
    setFideData(fideRecord['veri'] as FideEntry[]);
  } catch {
    // FiDe verisi yok — normal durum
  }
}

// ─── Rapor Kaydetme ───────────────────────────────────────────────────────────

export async function saveFormState(
  reportData: ReportData,
  isFinalizing = false,
): Promise<void> {
  const selectedStore = getSelectedStore();
  if (!selectedStore || !pb.authStore.isValid) return;

  const bayiKodu = String(selectedStore.bayiKodu);
  const storeRecord = getAllStores().find(s => s.bayiKodu === bayiKodu);
  if (!storeRecord) return;

  // Tamamlanmış raporu geri alınan listesinden temizle
  if (isFinalizing) {
    try {
      const today = new Date();
      const monthKey = getYearMonthKey(today);
      const undoneRecord = await pb.collection('denetim_geri_alinanlar').getFirstListItem(
        `yil_ay="${monthKey}" && bayi="${storeRecord.id}"`,
      );
      await pb.collection('denetim_geri_alinanlar').delete(undoneRecord['id'] as string);
    } catch {
      // Geri alınan kayıt yoksa sorun değil
    }
  }

  const dataToSave: Record<string, unknown> = {
    bayi: storeRecord.id,
    soruDurumlari: reportData.questions_status,
    user: pb.authStore.model?.['id'],
  };

  if (isFinalizing) {
    dataToSave['denetimTamamlanmaTarihi'] = new Date().toISOString();
    const audited = getAuditedThisMonth();
    if (!audited.includes(bayiKodu)) {
      setAuditedThisMonth([...audited, bayiKodu]);
    }
    showLoadingOverlay('Rapor kaydediliyor...');
  }

  try {
    const currentId = getCurrentReportId();
    if (currentId) {
      await pb.collection('denetim_raporlari').update(currentId, dataToSave);
    } else {
      const newRecord = await pb.collection('denetim_raporlari').create(dataToSave);
      setCurrentReportId(newRecord['id'] as string);
    }
  } catch {
    if (isFinalizing) alert('Rapor kaydedilirken bir hata oluştu!');
  } finally {
    if (isFinalizing) hideLoadingOverlay();
  }
}

// ─── Rapor Yükleme ────────────────────────────────────────────────────────────

export async function loadReportForStore(
  bayiKodu: string,
): Promise<Record<string, unknown> | null> {
  if (!pb.authStore.isValid) return null;

  showLoadingOverlay('Rapor yükleniyor...');

  try {
    const storeRecord = getAllStores().find(s => s.bayiKodu === bayiKodu);
    if (!storeRecord) throw new Error('Bayi bulunamadı.');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = toDbDateString(today);

    // Öncelik sırası:
    // 1. Bugün oluşturulan rapor
    // 2. Tamamlanmamış eski taslak
    // 3. En son rapor
    const queries = [
      `bayi="${storeRecord.id}" && created >= "${todayStr}"`,
      `bayi="${storeRecord.id}" && denetimTamamlanmaTarihi = ""`,
      `bayi="${storeRecord.id}"`,
    ];

    for (const filter of queries) {
      try {
        const record = await pb.collection('denetim_raporlari').getFirstListItem(filter, {
          sort: '-created',
        });
        setCurrentReportId(record['id'] as string);
        return record['soruDurumlari'] as Record<string, unknown>;
      } catch {
        // Bu filtreyle kayıt yok — sonrakini dene
      }
    }

    setCurrentReportId(null);
    return null;

  } catch {
    return null;
  } finally {
    hideLoadingOverlay();
  }
}

// ─── Excel Silme ──────────────────────────────────────────────────────────────

export async function clearExcelFromCloud(type: 'dide' | 'fide'): Promise<void> {
  if (!pb.authStore.isValid) return;

  try {
    const record = await pb.collection('excel_verileri').getFirstListItem(`tip="${type}"`);
    await pb.collection('excel_verileri').delete(record['id'] as string);
    alert(`${type.toUpperCase()} verisi silindi. Sayfa yenileniyor.`);
    window.location.reload();
  } catch {
    alert('Silme işlemi sırasında bir hata oluştu.');
  }
}

// ─── Giriş ───────────────────────────────────────────────────────────────────

export async function loginUser(email: string, password: string): Promise<LoginResult> {
  if (!pb) return { success: false, message: 'Bağlantı hatası.' };

  // Kimlik doğrulama
  let user: Record<string, unknown>;
  try {
    const authData = await pb.collection('users').authWithPassword(email, password);
    user = await pb.collection('users').getOne(authData.record['id'] as string);
  } catch {
    return { success: false, message: 'E-posta veya şifre hatalı.' };
  }

  try {
    if (user['is_banned'] === true) {
      logoutUser();
      return { success: false, message: 'Bu hesap kilitlenmiştir.' };
    }

    // Admin için cihaz kontrolü yapılmaz
    if (user['role'] === 'admin') {
      return { success: true, message: 'Yönetici girişi başarılı.' };
    }

    // Mobil erişim kontrolü
    if (user['mobile_access'] === false && isMobileDevice()) {
      logoutUser();
      return { success: false, message: 'Mobil cihaz girişi yasaktır.' };
    }

    const fingerprint = await getDeviceFingerprint();
    const deviceDesc = getDeviceDescription();
    const userId = user['id'] as string;

    try {
      // Kayıtlı cihaz bul
      const deviceRecord = await pb.collection('user_devices').getFirstListItem(
        `user="${userId}" && device_key="${fingerprint}"`,
      );

      if (deviceRecord['is_locked'] === true) {
        logoutUser();
        return { success: false, message: 'Bu cihaz kilitlenmiştir.' };
      }

      // Son giriş güncelle
      await pb.collection('user_devices').update(deviceRecord['id'] as string, {
        last_login: new Date().toISOString(),
        device_info: deviceDesc,
      });

      return { success: true, message: 'Giriş başarılı.' };

    } catch {
      // Yeni cihaz — limit kontrolü
      const deviceLimit = (user['device_limit'] as number | undefined) ?? 1;
      const userDevices = await pb.collection('user_devices').getFullList({
        filter: `user="${userId}"`,
      });

      if (userDevices.length >= deviceLimit) {
        logoutUser();
        return {
          success: false,
          message: `Cihaz limitiniz (${deviceLimit}) dolmuştur. Lütfen yöneticinizle iletişime geçin.`,
        };
      }

      // Yeni cihaz kaydet
      await pb.collection('user_devices').create({
        user: userId,
        device_key: fingerprint,
        device_info: deviceDesc,
        last_login: new Date().toISOString(),
        is_locked: false,
      });

      return { success: true, message: 'Yeni cihaz kaydedildi.' };
    }

  } catch {
    logoutUser();
    return { success: false, message: 'Güvenlik hatası oluştu.' };
  }
}

// ─── Çıkış ───────────────────────────────────────────────────────────────────

export function logoutUser(): void {
  pb.authStore.clear();
}
