// db-config.js (Lokal Kurulum için Güncellendi)

// PocketBase JavaScript SDK'sını projemize dahil ediyoruz.
// Bu, index.html dosyasından yüklenecek.

// PocketBase sunucunuzun lokal adresini buraya yazıyoruz.
// PocketBase'i kendi bilgisayarınızda başlattığınızda varsayılan adres budur.
const pocketbaseUrl = 'http://127.0.0.1:8090';

// PocketBase istemcisini (client) oluşturuyoruz.
// Uygulamanın geri kalanındaki tüm veritabanı işlemleri bu 'pb' değişkeni üzerinden yapılacak.
const pb = new PocketBase(pocketbaseUrl);

// ÖNEMLİ NOT:
// Eğer PocketBase'i başlatırken farklı bir port veya adres ayarı yaptıysanız,
// (örneğin: --http="0.0.0.0:8091"), yukarıdaki adresi ona göre düzenlemelisiniz.
// Varsayılan kurulum için bu adres doğrudur.