// --- PocketBase Başlatma ---
// Bu dosya, projedeki tüm sayfalar tarafından ortak olarak kullanılacak
// veritabanı bağlantı ayarlarını ve PocketBase istemcisini içerir.

// PocketBase sunucunuzun çalıştığı adres.
// Kurulum adımında çalıştırdığınız .exe'nin verdiği adres budur.
const POCKETBASE_URL = 'http://127.0.0.1:8090';

// PocketBase SDK'sından bir istemci (client) örneği oluşturuyoruz.
// Bu 'pb' nesnesini tüm veritabanı işlemleri için kullanacağız.
const pb = new PocketBase(POCKETBASE_URL);