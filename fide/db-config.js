// --- PocketBase Başlatma ---
// Bu dosya, tüm HTML sayfaları tarafından ortak olarak kullanılacak
// veritabanı bağlantı ayarlarını içerir.

// PocketBase sunucunuzun adresi. Şimdilik bilgisayarınızda çalıştığı için bu şekilde kalmalı.
const POCKETBASE_URL = 'http://127.0.0.1:8090';

let pb;
try {
    // Yeni PocketBase istemcisini oluşturuyoruz.
    // Projedeki tüm veritabanı işlemleri bu 'pb' nesnesi üzerinden yapılacak.
    pb = new PocketBase(POCKETBASE_URL);

    // Oturum bilgisinin tarayıcıda saklanmasını ve sayfa yenilendiğinde
    // kaybolmamasını sağlıyoruz.
    pb.authStore.loadFromCookie(document.cookie);

} catch (e) {
    console.error("PocketBase başlatılamadı.", e);
    // Hata durumunda kullanıcıya bilgi verilebilir.
    alert("Veritabanı bağlantısı kurulamadı. Lütfen PocketBase'in çalıştığından emin olun.");
}