// --- PocketBase Başlatma ---
// Bu dosya, tüm JavaScript modülleri tarafından kullanılacak
// veritabanı bağlantı ayarlarını içerir.

// PocketBase'in bilgisayarınızda çalıştığı adresi buraya yazıyoruz.
// Genellikle bu adres http://127.0.0.1:8090 şeklindedir.
const POCKETBASE_URL = 'https://melih.zelab.uk/';

// Değişkeni dışarı aktararak 'main.js' gibi diğer dosyaların
// 'import { POCKETBASE_URL } from ./db-config.js'
// şeklinde bu bilgiye erişmesini sağlıyoruz.
export { POCKETBASE_URL };