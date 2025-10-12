// --- PocketBase Başlatma ---
// Bu dosya, tüm HTML sayfaları tarafından ortak olarak kullanılacak
// PocketBase veritabanı bağlantı ayarını içerir.

let pb;
try {
    // PocketBase sunucumuzun adresini belirtiyoruz.
    // Bu, 1. Adım'da başlattığımız sunucunun adresidir.
    pb = new PocketBase('http://127.0.0.1:8090');
} catch (e) {
    console.error("PocketBase başlatılamadı.", e);
    // Hata durumunda kullanıcıyı bilgilendirmek için bir uyarı gösterebiliriz.
    alert("Veritabanı bağlantısı kurulamadı. Lütfen PocketBase sunucusunun çalıştığından emin olun.");
}