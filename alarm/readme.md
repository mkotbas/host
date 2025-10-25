# Arçelik Bayi Alarm Sipariş Otomasyon Sistemi - Teknik Dokümantasyon (v2.6 - Stand Seçeneği Eklendi)

## 1. Sistemin Amacı

Bu sistem, Arçelik Mağaza Denetim Uzmanları için geliştirilmiş web tabanlı bir otomasyon aracıdır. Temel amacı, yeni açılan veya konsept değiştiren bayilere gönderilecek elektronik cihaz (telefon, tablet, akıllı saat, bilgisayar) listesine göre, **gerekli alarm ünitesi ve montaj malzemelerinin sipariş listesini otomatik olarak ve hatasız bir şekilde oluşturmaktır.**

Sistem, cihazların şarj portu yapılarını analiz ederek doğru alarm kablosunu, standı, paneli ve tamamlayıcı parçaları (yapışkan, konnektör) seçer. **(YENİ)** Kullanıcıya, telefon veya tabletlerin **akrilik stand üzerinde sergilenip sergilenmeyeceğini seçme imkanı sunar.** Akıllı saatler için kullanıcıya MGM veya SALUS marka alarm kiti seçeneği sunar. Ayrıca, malzemelerin paket içi adetlerine göre sipariş edilmesi gereken **paket sayısını** otomatik olarak hesaplar.

Bu sayede manuel yapılan işlemlerdeki "yanlış malzeme gönderme" veya "eksik parça hesaplama" gibi hatalar tamamen ortadan kaldırılır.

## 2. Kullanılan Teknolojiler
* **Arayüz (UI):** `index.html`
* **Stil (CSS):** `style.css`
* **Ana Mantık (Logic):** `script.js` (ES6+)
* **Veri Tabanı (Data):** `cihazlar.json`, `malzemeler.json`

## 3. Dosya Yapısı ve Görevleri
* **`index.html`:** Kullanıcının etkileşime girdiği ana HTML dosyası. Kategori filtreleri, arama çubuğu, adet girişi, **(YENİ)** akrilik stand kullanım onay kutusu, eklenecek ürün listesi ve sonuç tablosunun iskeletini içerir.
* **`style.css`:** Arayüzün (UI) tüm görsel stillerini, renklerini, kategori filtrelerinin/onay kutusunun görünümünü ve "devre dışı" (disabled) durumlarını yönetir.
* **`cihazlar.json`:** Cihaz Veri Tabanı. Hangi modelin hangi kategoriye ve markaya ait olduğunu, port tipini ve yılını belirtir. Akıllı saatler dışındaki cihazlar için hangi kablo/stand/panel stok kodlarını tetiklediğini de içerir. Akıllı saatler için stok kodu bilgisi içermez.
* **`malzemeler.json`:** Malzeme Veri Tabanı. Stok kodu, ürün adı, kullanım amacı, **paket içi adet** ve **kategori** gibi kritik bilgileri içeren envanter listesidir.
* **`script.js`:** Sistemin "Beyni". Tüm hesaplama mantığı, veri yükleme, arama filtrelemesi, akıllı saat kiti seçimi, **(YENİ)** stand kullanım tercihinin işlenmesi ve kuralların uygulanması bu dosyada gerçekleşir.

## 4. Veri Yapısı (JSON Dosyaları)
*(Bu bölümde değişiklik yok)*

### `malzemeler.json`
* `stok_kodu`, `urun_adi`, `kullanim_amaci`, `paket_ici_adet`, `kategori` (`Kablo`, `Stand`, `Panel`, `Salus`, `Genel`, `Aksesuar`).

### `cihazlar.json`
* `kategori`, `marka`, `model`, `port`, `yil`, `kablo_stok_kodu` (Akıllı Saat hariç), `stand_stok_kodu` (Akıllı Saat ve Bilgisayar hariç), `panel_stok_kodu` (Sadece Tablet).

## 5. Çalışma Mantığı ve Fonksiyonlar (`script.js`)

Sistem, `DOMContentLoaded` olayı ile başlar ve aşağıdaki adımları izler:

1.  **`verileriYukle()`:** `.json` dosyalarını çeker. Arayüz elemanları `disabled` durumdadır. Başarılı olursa `aktiveEtArayuzu()`'nü çağırır.
2.  **`aktiveEtArayuzu()`:** Tüm `input`, `button` ve **(YENİ) `checkbox`** elemanlarını aktif hale getirir. "Yükleniyor..." mesajını gizler.
3.  **Kategori Filtreleme:** Tıklanan butona göre `seciliKategori` güncellenir ve `aramaYap()` tetiklenir.
4.  **Arama Olayları:** Kullanıcı yazdıkça filtreleme yapılır. Akıllı saat ise `[MGM Kiti]` / `[SALUS Kiti]` seçenekleri sunulur.
5.  **`(YENİ) handleAramaSonucClick()`:** Arama sonucuna tıklanınca çağrılır. Seçilen cihaz ve `kitTuru` (`null`, "MGM", "SALUS") `secilenCihaz`'a atanır. **(YENİ)** Eğer seçilen cihaz Akıllı Saat veya Bilgisayar ise, akrilik stand onay kutusu (`#akrilikStandVar`) devre dışı bırakılır ve işareti kaldırılır. Telefon/Tablet ise aktif edilir ve varsayılan olarak işaretlenir.
6.  **`ekleButton` Olayı:** Seçilen cihazı, adedi, `data-kit` bilgisini ve **(YENİ) `data-onstand` (onay kutusunun durumu)** bilgisini `#secilenUrunListesi`'ne `<li>` olarak ekler.
7.  **`hesaplaButton` Olayı:** `#secilenUrunListesi`'ndeki `<li>`'leri okur. Her `<li>` için `data-model`, `data-adet`, `data-kit` ve **(YENİ) `data-onstand`** bilgilerini alır.
8.  **İş Kuralları ve Malzeme Ekleme (`hesapla()` içinde):**
    * **Kural (Akıllı Saat Kiti):** `data-kit`'e göre MGM veya SALUS parçaları eklenir.
    * **(GÜNCELLENDİ) Kural (Telefon/Tablet - Stand Durumu):**
        * Eğer `data-onstand` == `true` (veya cihaz Bilgisayar değilse varsayılan):
            * `cihazlar.json`'daki `stand_stok_kodu` (`8906991600`) eklenir.
            * `cihazlar.json`'daki `kablo_stok_kodu` (standa özel kablo) eklenir.
            * `akrilikStandKullananAdetHesapla` sayacı artırılır.
            * Tablet ise `panel_stok_kodu` eklenir.
        * Eğer `data-onstand` == `false`:
            * **Stand eklenmez.**
            * Cihazın portuna uygun **"stand üzerinde olmayan"** kablo eklenir (Lightning=`8907041600`, USB-C=`8907011600`, MicroUSB=`8907051600`).
            * Tablet ise `panel_stok_kodu` yine eklenir.
    * **Kural (Bilgisayar):** Stand eklenmez, `cihazlar.json`'daki `kablo_stok_kodu` (Mac=`8907061600`, Diğer=`8907051600`) eklenir.
    * **Kural (Kumanda):** Toplam cihaz varsa 1 adet `8907071600` eklenir.
    * **Kural (Panel Hesabı):** `telefonAdediStandli` (stand kullanan Tel) ve `pcAdedi` (Mac+Diğer) hesaplanıp 5'e bölünerek `8906971600` (5'li Panel) eklenir.
    * **Kural (Konnektör):** `konnektorGerekenAdet = (akrilikStandKullananAdetHesapla + telefonAdediStandsiz + pcAdedi)` hesaplanır. Bu adet kadar `8907081600` (Konnektör) eklenir.
    * **(GÜNCELLENDİ) Kural (Akrilik Stand Yapışkanları):** `akrilikStandKullananAdetHesapla` (Sadece stand kullanan Tel+Tab) hesaplanır. Bu adet kadar `9220951600` (Taban Yapışkanı) ve `9224911600` (Ek Yapışkan) eklenir. Stand kullanmayanlar için bu yapışkanlar **eklenmez**.
    * **Kural (PC/MacBook Yapışkanı):** `pcAdediMac > 0` ise o adet kadar `8907091600` (Damla Yapışkan) eklenir.
9.  **Sonuçları Yazdırma (Render):** `siparisListesi` döngüye alınır, paket hesabı yapılır ve sonuçlar ilgili tablolara yazdırılır.

## 6. Güncelleme ve Hata Ayıklama (AI için Notlar)

### Yeni Bir Cihaz Nasıl Eklenir?
*(Bu bölümdeki adımlar aynı kalmıştır, sadece Akıllı Saatler için stok kodu eklenmemesi gerektiği vurgulanmıştır.)*

### "Hesapla" Butonu Çalışmıyor veya Hata Veriyorsa?
*(Bu bölümdeki adımlar aynı kalmıştır.)*

## 7. Yapay Zeka İçin Uyulması Gereken Kurallar
*(Bu bölümdeki kurallar aynı kalmıştır.)*

* **Analiz:** Dokümanı ve kodları analiz et.
* **Eş Zamanlı Güncelleme:** Kod değişikliği sonrası dokümanı güncelle.
* **Onay ve Versiyonlama:** İş bitince onaya sun, "yok" denirse versiyonu yükselt.
* **Anlama:** Her zaman güncel mantığı kavra.