# Arçelik Bayi Alarm Sipariş Otomasyon Sistemi - Teknik Dokümantasyon (v2.8 - Tüm Bölümler Açıkça Yazıldı)

## 1. Sistemin Amacı

Bu sistem, Arçelik Mağaza Denetim Uzmanları için geliştirilmiş web tabanlı bir otomasyon aracıdır. Temel amacı, yeni açılan veya konsept değiştiren bayilere gönderilecek elektronik cihaz (telefon, tablet, akıllı saat, bilgisayar) listesine göre, **gerekli alarm ünitesi ve montaj malzemelerinin sipariş listesini otomatik olarak ve hatasız bir şekilde oluşturmaktır.**

Sistem, cihazların şarj portu yapılarını (USB-C, Lightning, Mikro USB vb.) analiz ederek doğru alarm kablosunu, standı, paneli ve tamamlayıcı parçaları (yapışkan, konnektör) seçer. Kullanıcıya, telefon veya tabletlerin **akrilik stand üzerinde sergilenip sergilenmeyeceğini seçme imkanı sunar.** Akıllı saatler için kullanıcıya MGM veya SALUS marka alarm kiti seçeneği sunar. Ayrıca, malzemelerin paket içi adetlerine göre sipariş edilmesi gereken **paket sayısını** otomatik olarak hesaplar.

Bu sayede manuel yapılan işlemlerdeki "yanlış malzeme gönderme" veya "eksik parça hesaplama" gibi hatalar tamamen ortadan kaldırılır.

## 2. Kullanılan Teknolojiler

* **Arayüz (UI):** `index.html`
* **Stil (CSS):** `style.css`
* **Ana Mantık (Logic):** `script.js` (ES6+)
* **Veri Tabanı (Data):** `cihazlar.json`, `malzemeler.json`

## 3. Dosya Yapısı ve Görevleri

Sistem 5 ana dosyadan oluşur:

* **`index.html`:** Kullanıcının etkileşime girdiği ana HTML dosyası. Kategori filtreleri, arama çubuğu, adet girişi, akrilik stand kullanım onay kutusu, eklenecek ürün listesi ve sonuç tablosunun iskeletini içerir.
* **`style.css`:** Arayüzün (UI) tüm görsel stillerini, renklerini, kategori filtrelerinin/onay kutusunun görünümünü ve "devre dışı" (disabled) durumlarını yönetir.
* **`cihazlar.json`:** Cihaz Veri Tabanı. Hangi modelin hangi kategoriye ve markaya ait olduğunu, port tipini ve yılını belirtir. Akıllı saatler dışındaki cihazlar için hangi kablo/stand/panel stok kodlarını tetiklediğini de içerir. Akıllı saatler için stok kodu bilgisi içermez.
* **`malzemeler.json`:** Malzeme Veri Tabanı. Stok kodu, ürün adı, kullanım amacı, **paket içi adet** ve **kategori** gibi kritik bilgileri içeren envanter listesidir.
* **`script.js`:** Sistemin "Beyni". Tüm hesaplama mantığı, veri yükleme, arama filtrelemesi, akıllı saat kiti seçimi, stand kullanım tercihinin işlenmesi ve kuralların uygulanması bu dosyada gerçekleşir.

## 4. Veri Yapısı (JSON Dosyaları)

Sistemin güncellenmesi veya hata ayıklaması için bu iki dosyanın yapısını anlamak kritiktir.

### `malzemeler.json`

Her bir alarm malzemesinin envanter kaydını tutar.

* `stok_kodu`: (String) Malzemenin benzersiz stok kodu.
* `urun_adi`: (String) ABS Kayıt İsmi.
* `kullanim_amaci`: (String) Malzemenin ne işe yaradığını açıklayan metin.
* `paket_ici_adet`: (Number) **Kritik.** Hesaplama motorunun "kaç paket" alması gerektiğini belirleyen sayıdır.
* `kategori`: (String) **Kritik.** `script.js`'in mantıksal gruplama yaptığı etikettir:
    * `Kablo`, `Stand`, `Panel`: Ana tabloya (cihaza özel) eklenir.
    * `Salus`: **Sadece SALUS kiti seçilen akıllı saatler için** eklenen özel set parçalarıdır.
    * `Genel`, `Aksesuar`: Alt bölümdeki "Genel Teşhir Malzemeleri" listesine eklenir.

### `cihazlar.json`

Hangi cihazın hangi parçaları kullanacağını belirleyen ana eşleştirme kuralı dosyasıdır.

* `kategori`: (String) Cihazın ana türü ("Telefon", "Tablet", "Bilgisayar", "Akıllı Saat"). Hesaplama mantığını doğrudan etkiler.
* `marka`, `model`: (String) Cihazın adı. `script.js` bunları birleştirip "tamAd" oluşturur.
* `port`: (String) Cihazın şarj/bağlantı portu tipi (örn: "USB-C", "Lightning", "Micro USB", "Manyetik Kablosuz"). Kablo seçimini etkiler.
* `yil`: (Number) Cihazın piyasaya sürülme yılı.
* `kablo_stok_kodu`: (String veya `null`) **Akıllı Saatler HARİÇ**, bu cihaz için gereken alarm kablosunun stok kodu.
* `stand_stok_kodu`: (String veya `null`) **Akıllı Saatler ve Bilgisayarlar HARİÇ**, bu cihaz için gereken standın stok kodu.
* `panel_stok_kodu`: (String veya `null`) **Sadece Tabletler için** doldurulur (`8906981600`). Diğerlerinde `null` veya yoktur.

## 5. Çalışma Mantığı ve Fonksiyonlar (`script.js`)

Sistem, `DOMContentLoaded` olayı ile başlar ve aşağıdaki adımları izler:

1.  **`verileriYukle()`:** `.json` dosyalarını `fetch` ile çeker. Arayüz elemanları `disabled` durumdadır. Başarılı olursa `aktiveEtArayuzu()`'nü çağırır.
2.  **`aktiveEtArayuzu()`:** Tüm `input`, `button` ve `checkbox` elemanlarını aktif hale getirir (checkbox başlangıçta disable kalır, ürün seçilince aktifleşir). "Yükleniyor..." mesajını gizler.
3.  **Kategori Filtreleme (`filtreButonlari` Olayı):** Tıklanan butona göre `seciliKategori` güncellenir ve gerekirse `aramaYap()` tetiklenir.
4.  **Arama Olayları (`aramaYap()` vb.):** Kullanıcı yazdıkça `cihazVeritabani`'nı `seciliKategori` ve metne göre filtreler. Akıllı saat ise `[MGM Kiti]` / `[SALUS Kiti]` seçenekleri sunulur.
5.  **`handleAramaSonucClick()`:** Arama sonucuna tıklanınca çağrılır. Seçilen cihaz ve `kitTuru` `secilenCihaz`'a atanır. Eğer seçilen cihaz Akıllı Saat veya Bilgisayar ise, akrilik stand onay kutusu (`#akrilikStandVar`) devre dışı bırakılır ve işareti kaldırılır. Telefon/Tablet ise aktif edilir ve varsayılan olarak işaretlenir.
6.  **`ekleButton` Olayı:** Seçilen cihazı, adedi, `data-kit` bilgisini ve `data-onstand` (onay kutusunun durumu) bilgisini `#secilenUrunListesi`'ne `<li>` olarak ekler. Form sıfırlandıktan sonra akrilik stand onay kutusu aktif kalır (eğer Telefon/Tablet seçilmişse).
7.  **`hesaplaButton` Olayı:** `#secilenUrunListesi`'ndeki `<li>`'leri okur. Her `<li>` için `data-model`, `data-adet`, `data-kit` ve `data-onstand` bilgilerini alır.
8.  **İş Kuralları ve Malzeme Ekleme (`hesapla()` içinde):**
    * **Kural (Akıllı Saat Kiti):** `data-kit`'e göre MGM (`8909011600`, `8909021600`) veya SALUS (`kategori: "Salus"`) parçaları eklenir.
    * **Kural (Telefon/Tablet - Stand Durumu):**
        * `data-onstand` == `true` ise: Stand (`8906991600`), standa özel kablo (cihazın `kablo_stok_kodu`'ndan alınır) ve ilgili yapışkanlar eklenir.
        * `data-onstand` == `false` ise: Stand ve stand yapışkanları **eklenmez**, porta uygun "stand üzerinde olmayan" kablo eklenir (Lightning=`8907041600`, USB-C=`8907011600`, MicroUSB=`8907051600`).
    * **Kural (Bilgisayar):** Stand eklenmez, markaya göre doğru kablo (`8907061600` veya `8907051600`) eklenir.
    * **Kural (Kumanda):** Toplam cihaz varsa 1 adet `8907071600` eklenir.
    * **Kural (Panel Hesabı):** Stand kullanan telefonlar ve tüm bilgisayarların toplamına göre 5'li panel (`8906971600`) eklenir. Tabletler kendi panellerini (`8906981600`) alır.
    * **Kural (Konnektör):** Panele bağlanan her cihaz (standlı/standsız Tel+Tab + tüm PC) için `8907081600` eklenir.
    * **Kural (Akrilik Stand Yapışkanları):** Sadece `data-onstand` == `true` olan Tel+Tab adedi kadar `9220951600` (Taban Yapışkanı) ve `9224911600` (Ek Yapışkan) eklenir.
    * **Kural (PC/MacBook Yapışkanı):** Sadece MacBook kablosu (`8907061600`) varsa, o adet kadar `8907091600` (Damla Yapışkan) eklenir.
9.  **Sonuçları Yazdırma (Render):** `siparisListesi` döngüye alınır, paket hesabı yapılır (`Math.ceil(toplamGerekliAdet / paketIciAdet)`) ve sonuçlar `#sonucTablosuBody` veya `#genelMalzemeListesi`'ne yazdırılır.

## 6. Güncelleme ve Hata Ayıklama (AI için Notlar)

Bu bölüm, yapay zekanın veya geliştiricinin sistemi güncellerken veya hata ayıklarken dikkat etmesi gereken noktaları içerir.

### Yeni Bir Cihaz Nasıl Eklenir?

1.  **Sadece `cihazlar.json` dosyasını açın**.
2.  Cihazın **kategorisini**, **markasını**, **modelini**, **port tipini** ve **yılını** belirleyin.
3.  **Akıllı Saat İse:** Sadece bu 5 bilgiyi içeren yeni bir nesne ekleyin. **Stok kodu belirtmeyin.**
    ```json
    { "kategori": "Akıllı Saat", "marka": "YeniMarka", "model": "Watch X", "port": "Manyetik Kablosuz", "yil": 2026 }
    ```
4.  **Diğer Cihaz İse:**
    * Port tipine göre doğru `kablo_stok_kodu`'nu atayın (Bkz: Bölüm 5, İş Kuralları veya `malzemeler.json`).
    * Eğer **Tablet** ise `panel_stok_kodu` = `"8906981600"` yapın. Değilse `null` bırakın.
    * Eğer **Telefon veya Tablet** ise `stand_stok_kodu` = `"8906991600"` yapın. Bilgisayar ise `null` bırakın.
    * Aşağıdaki gibi yeni bir nesne ekleyin:
        ```json
        {
          "kategori": "Telefon",
          "marka": "YeniMarka",
          "model": "Phone Z",
          "port": "USB-C",
          "yil": 2026,
          "kablo_stok_kodu": "8907011600",
          "stand_stok_kodu": "8906991600",
          "panel_stok_kodu": null
        }
        ```
5.  `script.js`'e dokunmanıza gerek yoktur.

### "Hesapla" Butonu Çalışmıyor veya Hata Veriyorsa?

1.  **CORS Hatası / "HATA: ... yüklenemedi":** Sistemi bir web sunucusu (örn: `http://localhost`) üzerinden çalıştırın. `file:///` protokolü ile `.json` dosyaları okunamaz.
2.  **Arama Sonuçları Görünmüyor / Hata Veriyor:** `verileriYukle()` fonksiyonunun başarılı olup olmadığını tarayıcının geliştirici konsolundan kontrol edin. JSON dosyalarında format hatası (`Unexpected token '/'` gibi yorum satırı olmadığından) emin olun.
3.  **Akıllı Saat İçin Malzeme Eklenmiyor:** `script.js`'deki `hesapla()` fonksiyonunda, `data-kit` kontrolünün (`if (kitTuru === "MGM")` ve `else if (kitTuru === "SALUS")`) doğru yapıldığından emin olun. `malzemeler.json`'daki "Salus" kategorili ürünlerin stok kodlarının ve `8909011600`, `8909021600` kodlarının doğruluğunu kontrol edin.
4.  **Yanlış Malzeme/Adet Hesaplanıyor:** `script.js`'deki İş Kuralları (Bölüm 5, Adım 8) bölümünü inceleyin. Özellikle panel hesabı, konnektör, yapışkan ekleme koşulları (`data-onstand` kontrolü dahil) ve `stokKoduEkle` fonksiyonunun mantığını kontrol edin. `malzemeler.json`'daki `paket_ici_adet` değerlerinin doğruluğunu teyit edin.
5.  **"Toplam Ürün Adedi" Sütunu "undefined" Görünüyor:** `script.js`'deki son döngüde (Adım 9), `<td>` içine yazdırılan değişkenin `toplamGerekliAdet` olduğundan emin olun.

## 7. Yapay Zeka İçin Uyulması Gereken Kurallar

Bu dokümanla etkileşime geçen herhangi bir yapay zeka aşağıdaki kurallara uymalıdır:

* **Analiz:** Bu doküman yüklendiğinde, sistemin çalışma mantığını, işleyişini ve tüm kodlarını (HTML, CSS, JS, JSON) tam olarak analiz et.
* **Eş Zamanlı Güncelleme:** Sisteme (kodlara veya JSON verilerine) bir güncelleme istendiğinde, kod değişikliği yapıldıktan sonra **bu teknik dokümanı (`README.md`) da değişikliği yansıtacak şekilde güncelle**.
* **Onay ve Versiyonlama:** Kod ve doküman güncellemesi bittiğinde, kullanıcıya **"Başka bir isteğiniz var mı?"** diye sor. Eğer kullanıcı "yok" derse, bu dokümanın başlığındaki versiyon numarasını bir sonraki adıma yükselt (örn: v2.8 -> v2.9) ve güncellenmiş dokümanı sun.
* **Anlama:** Bu doküman her yüklendiğinde veya her güncellendiğinde, sistemin güncel çalışma mantığını kavradığından emin ol.