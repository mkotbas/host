# Arçelik Bayi Alarm Sipariş Otomasyon Sistemi - Teknik Dokümantasyon (v2.7 - Checkbox Davranışı Düzeltildi)

## 1. Sistemin Amacı

Bu sistem, Arçelik Mağaza Denetim Uzmanları için geliştirilmiş web tabanlı bir otomasyon aracıdır. Temel amacı, yeni açılan veya konsept değiştiren bayilere gönderilecek elektronik cihaz (telefon, tablet, akıllı saat, bilgisayar) listesine göre, **gerekli alarm ünitesi ve montaj malzemelerinin sipariş listesini otomatik olarak ve hatasız bir şekilde oluşturmaktır.**

Sistem, cihazların şarj portu yapılarını analiz ederek doğru alarm kablosunu, standı, paneli ve tamamlayıcı parçaları seçer. Kullanıcıya, telefon veya tabletlerin **akrilik stand üzerinde sergilenip sergilenmeyeceğini seçme imkanı sunar.** Akıllı saatler için kullanıcıya MGM veya SALUS marka alarm kiti seçeneği sunar. Ayrıca, malzemelerin paket içi adetlerine göre sipariş edilmesi gereken **paket sayısını** otomatik olarak hesaplar.

Bu sayede manuel yapılan işlemlerdeki "yanlış malzeme gönderme" veya "eksik parça hesaplama" gibi hatalar tamamen ortadan kaldırılır.

## 2. Kullanılan Teknolojiler
* **Arayüz (UI):** `index.html`
* **Stil (CSS):** `style.css`
* **Ana Mantık (Logic):** `script.js` (ES6+)
* **Veri Tabanı (Data):** `cihazlar.json`, `malzemeler.json`

## 3. Dosya Yapısı ve Görevleri
* **`index.html`:** Kullanıcının etkileşime girdiği ana HTML dosyası. Kategori filtreleri, arama çubuğu, adet girişi, akrilik stand kullanım onay kutusu, eklenecek ürün listesi ve sonuç tablosunun iskeletini içerir.
* **`style.css`:** Arayüzün (UI) tüm görsel stillerini, renklerini, kategori filtrelerinin/onay kutusunun görünümünü ve "devre dışı" (disabled) durumlarını yönetir.
* **`cihazlar.json`:** Cihaz Veri Tabanı. Hangi modelin hangi kategoriye ve markaya ait olduğunu, port tipini ve yılını belirtir. Akıllı saatler dışındaki cihazlar için hangi kablo/stand/panel stok kodlarını tetiklediğini de içerir. Akıllı saatler için stok kodu bilgisi içermez.
* **`malzemeler.json`:** Malzeme Veri Tabanı. Stok kodu, ürün adı, kullanım amacı, **paket içi adet** ve **kategori** gibi kritik bilgileri içeren envanter listesidir.
* **`script.js`:** Sistemin "Beyni". Tüm hesaplama mantığı, veri yükleme, arama filtrelemesi, akıllı saat kiti seçimi, stand kullanım tercihinin işlenmesi ve kuralların uygulanması bu dosyada gerçekleşir.

## 4. Veri Yapısı (JSON Dosyaları)
*(Bu bölümde değişiklik yok)*

### `malzemeler.json`
* `stok_kodu`, `urun_adi`, `kullanim_amaci`, `paket_ici_adet`, `kategori` (`Kablo`, `Stand`, `Panel`, `Salus`, `Genel`, `Aksesuar`).

### `cihazlar.json`
* `kategori`, `marka`, `model`, `port`, `yil`, `kablo_stok_kodu` (Akıllı Saat hariç), `stand_stok_kodu` (Akıllı Saat ve Bilgisayar hariç), `panel_stok_kodu` (Sadece Tablet).

## 5. Çalışma Mantığı ve Fonksiyonlar (`script.js`)

Sistem, `DOMContentLoaded` olayı ile başlar ve aşağıdaki adımları izler:

1.  **`verileriYukle()`:** `.json` dosyalarını `fetch` ile çeker. Arayüz elemanları `disabled` durumdadır. Başarılı olursa `aktiveEtArayuzu()`'nü çağırır.
2.  **`aktiveEtArayuzu()`:** Tüm `input`, `button` ve `checkbox` elemanlarını aktif hale getirir (checkbox başlangıçta disable kalır). "Yükleniyor..." mesajını gizler.
3.  **Kategori Filtreleme:** Tıklanan butona göre `seciliKategori` güncellenir ve `aramaYap()` tetiklenir.
4.  **Arama Olayları:** Kullanıcı yazdıkça filtreleme yapılır. Akıllı saat ise `[MGM Kiti]` / `[SALUS Kiti]` seçenekleri sunulur.
5.  **`handleAramaSonucClick()`:** Arama sonucuna tıklanınca çağrılır. Seçilen cihaz ve `kitTuru` `secilenCihaz`'a atanır. **(Güncellendi)** Eğer seçilen cihaz Akıllı Saat veya Bilgisayar ise, akrilik stand onay kutusu (`#akrilikStandVar`) devre dışı bırakılır ve işareti kaldırılır. Telefon/Tablet ise **aktif edilir** ve varsayılan olarak işaretlenir.
6.  **`ekleButton` Olayı:** Seçilen cihazı, adedi, `data-kit` bilgisini ve `data-onstand` (onay kutusunun durumu) bilgisini `#secilenUrunListesi`'ne `<li>` olarak ekler. **(Güncellendi)** Form sıfırlandıktan sonra akrilik stand onay kutusu **aktif kalır** (başlangıçta disable edilmişti, ama bir telefon/tablet seçildiyse aktif kalır).
7.  **`hesaplaButton` Olayı:** `#secilenUrunListesi`'ndeki `<li>`'leri okur. Her `<li>` için `data-model`, `data-adet`, `data-kit` ve `data-onstand` bilgilerini alır.
8.  **İş Kuralları ve Malzeme Ekleme (`hesapla()` içinde):**
    * **Kural (Akıllı Saat Kiti):** `data-kit`'e göre MGM veya SALUS parçaları eklenir.
    * **Kural (Telefon/Tablet - Stand Durumu):**
        * `data-onstand` == `true` ise: Stand (`8906991600`), standa özel kablo ve ilgili yapışkanlar eklenir.
        * `data-onstand` == `false` ise: Stand ve stand yapışkanları **eklenmez**, porta uygun "stand üzerinde olmayan" kablo eklenir.
    * **Kural (Bilgisayar):** Stand eklenmez, markaya göre doğru kablo (`8907061