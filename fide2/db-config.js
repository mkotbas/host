// --- PocketBase Başlatma ---
// Bu dosya, tüm HTML sayfaları tarafından ortak olarak kullanılacak
// veritabanı bağlantı ayarlarını içerir.

// PocketBase JavaScript kütüphanesini doğrudan internetten (CDN) projemize dahil ediyoruz.
// Bu sayede bilgisayarımıza veya projemizin içine bir dosya indirmemize gerek kalmıyor.
// Bu satırın index.html dosyasına eklendiğinden emin olacağız.
// <script src="https://cdn.jsdelivr.net/npm/pocketbase/dist/pocketbase.umd.js"></script>

// PocketBase'in bilgisayarınızda çalıştığı adresi buraya yazıyoruz.
// Genellikle bu adres http://127.0.0.1:8090 şeklindedir.
const POCKETBASE_URL = 'http://127.0.0.1:8090';

// 'pb' adında global bir değişken oluşturup PocketBase istemcisini başlatıyoruz.
// Uygulamanın diğer tüm JavaScript dosyaları veritabanına erişmek için bu 'pb' değişkenini kullanacak.
let pb;
try {
    pb = new PocketBase(POCKETBASE_URL);
} catch (e) {
    console.error("PocketBase başlatılamadı. Adresin doğru olduğundan emin olun.", e);
}