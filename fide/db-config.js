// db-config.js

// PocketBase JavaScript SDK'sını (kütüphanesini) projemize dahil ediyoruz.
// Bu satır, projemizin PocketBase ile konuşabilmesini sağlayan bir tercüman gibidir.
// Kodu html dosyasından çekeceğimiz için bu dosyada sdk eklemeye gerek yok.

// PocketBase sunucunuzun adresini buraya yazın.
// Örneğin, 'http://127.0.0.1:8090' veya sunucunuza yüklediyseniz 'https://benimsitem.com' gibi.
const pocketbaseUrl = 'POCKETBASE_SUNUCU_ADRESINIZI_BURAYA_YAZIN';

// PocketBase istemcisini (client) oluşturuyoruz. 
// Uygulamanın geri kalanındaki tüm veritabanı işlemleri bu 'pb' değişkeni üzerinden yapılacak.
const pb = new PocketBase(pocketbaseUrl);

// ÖNEMLİ NOT:
// Bu dosyayı güncelledikten sonra, index.html dosyasını da güncellememiz gerekecek.
// Çünkü Firebase kütüphanelerini kaldırıp yerine PocketBase kütüphanesini eklemeliyiz.
// Bir sonraki adımda bunu yapacağız.