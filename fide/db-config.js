// db-config.js
// Bu dosya, uygulamanın hangi PocketBase sunucusuna bağlanacağını belirtir.

// PocketBase sunucunuzun adresini buraya girin.
// Bu adres, PocketBase'in bilgisayarınızdaki yerel (lokal) adresidir.
const POCKETBASE_URL = 'http://127.0.0.1:8090';

// Bu değişkenleri diğer dosyalarda kullanabilmek için dışa aktarıyoruz.
// Bu satırlarda herhangi bir değişiklik yapmanıza gerek yok.
window.dbConfig = {
    POCKETBASE_URL: POCKETBASE_URL
};