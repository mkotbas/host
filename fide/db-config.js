// --- PocketBase Başlatma ---
// Bu dosya, tüm HTML sayfaları tarafından ortak olarak kullanılacak 
// PocketBase veritabanı bağlantı ayarlarını içerir.

// PocketBase SDK'sını kullanarak bilgisayarınızda yerel olarak çalışan 
// sunucuya bağlanıyoruz. Standart adresi 'http://127.0.0.1:8090' şeklindedir.
const pb = new PocketBase('http://127.0.0.1:8090');

// Firebase'den kalan eski değişkenleri temizliyoruz.
let database = null;
let auth = null;