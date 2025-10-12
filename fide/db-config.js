// --- PocketBase Başlatma ---
// Bu dosya, tüm HTML sayfaları tarafından ortak olarak kullanılacak
// veritabanı bağlantı ayarlarını içerir.

// PocketBase sunucunuzun adresini buraya yazıyoruz.
// Yerel bilgisayarınızda çalıştırdığımız için adres bu şekildedir.
const pocketbaseUrl = 'http://127.0.0.1:8090';

// PocketBase istemcisini (client) oluşturuyoruz.
// Projedeki tüm veritabanı işlemleri bu 'pb' değişkeni üzerinden yapılacak.
const pb = new PocketBase(pocketbaseUrl);


// --- OTOMATİK VERİTABANI KURULUMU İÇİN GEREKLİ BİLGİLER ---
// DİKKAT: Bu bilgiler, sadece uygulama ilk kez çalıştırıldığında veritabanı tablolarını
// otomatik olarak oluşturmak için kullanılır. Lütfen PocketBase yönetici panelini
// kurarken belirlediğiniz e-posta ve şifreyi buraya girin.
// Kurulum tamamlandıktan sonra bu bilgileri silebilirsiniz.
const ADMIN_EMAIL_FOR_SETUP = 'melihkotbas@gmail.com';
const ADMIN_PASSWORD_FOR_SETUP = '010203.com';