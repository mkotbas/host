// --- PocketBase Başlatma ---
// Bu dosya, tüm HTML sayfaları tarafından ortak olarak kullanılacak 
// PocketBase veritabanı bağlantı ayarlarını içerir.

// PocketBase sunucunuzun adresi. Şimdilik bilgisayarınızda çalıştığı için bu şekilde kalacak.
// Eğer bir sunucuya yüklerseniz, o sunucunun adresiyle değiştirmeniz gerekecek.
const POCKETBASE_URL = 'http://127.0.0.1:8090';

// 'pb' adında bir değişken oluşturuyoruz. Projemizin her yerinde veritabanı ile konuşmak için bunu kullanacağız.
let pb;
try {
    // PocketBase istemcisini (client) oluşturuyoruz ve sunucu adresini veriyoruz.
    pb = new PocketBase(POCKETBASE_URL);

    // Oturum bilgisinin tarayıcıda saklanmasını sağlıyoruz.
    // Bu sayede sayfa yenilense bile giriş bilgisi kaybolmaz.
    pb.authStore.loadFromCookie();

} catch (e) {
    // Eğer bir hata olursa, konsola bir hata mesajı yazdırıyoruz.
    console.error("PocketBase başlatılamadı.", e);
}