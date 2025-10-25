# Arçelik Bayi Alarm Sipariş Otomasyon Sistemi - Teknik Dokümantasyon (v2.3 - Yapay Zeka Kuralları & Son Güncellemeler)

## 1. Sistemin Amacı

Bu sistem, Arçelik Mağaza Denetim Uzmanları için geliştirilmiş web tabanlı bir otomasyon aracıdır. Temel amacı, yeni açılan veya konsept değiştiren bayilere gönderilecek elektronik cihaz (telefon, tablet, akıllı saat, bilgisayar) listesine göre, **gerekli alarm ünitesi ve montaj malzemelerinin sipariş listesini otomatik olarak ve hatasız bir şekilde oluşturmaktır.**

Sistem, cihazların şarj portu yapılarını (USB-C, Lightning vb.) analiz ederek doğru alarm kablosunu, standı, paneli ve tamamlayıcı parçaları (yapışkan, konnektör) seçer. **Akıllı saatler için kullanıcıya MGM veya SALUS marka alarm kiti seçeneği sunar.** Ayrıca, malzemelerin paket içi adetlerine göre sipariş edilmesi gereken **paket sayısını** otomatik olarak hesaplar.

Bu sayede manuel yapılan işlemlerdeki "yanlış malzeme gönderme" veya "eksik parça hesaplama" gibi hatalar tamamen ortadan kaldırılır.

## 2. Kullanılan Teknolojiler

* **Arayüz (UI):** `index.html`
* **Stil (CSS):** `style.css`
* **Ana Mantık (Logic):** `script.js` (ES6+)
* **Veri Tabanı (Data):** `cihazlar.json`, `malzemeler.json`

## 3. Dosya Yapısı ve Görevleri

Sistem 5 ana dosyadan oluşur:

* **`index.html`:** Kullanıcının etkileşime girdiği ana HTML dosyası. Kategori filtreleri, arama çubuğu, adet girişi, eklenecek ürün listesi ve sonuç tablosunun iskeletini içerir.
* **`style.css`:** Arayüzün (UI) tüm görsel stillerini, renklerini, kategori filtrelerinin görünümünü ve "devre dışı" (disabled) durumlarını yönetir.
* **`cihazlar.json`:** Cihaz Veri Tabanı. Hangi modelin hangi kategoriye ve markaya ait olduğunu, port tipini ve yılını belirtir. **(Güncellendi)** **Akıllı saatler dışındaki** cihazlar için hangi kablo/stand/panel stok kodlarını tetiklediğini de içerir. Akıllı saatler için stok kodu bilgisi **içermez**, bu `script.js` tarafından yönetilir.
* **`malzemeler.json`:** Malzeme Veri Tabanı. Stok kodu, ürün adı, kullanım amacı, **paket içi adet** ve **kategori** gibi kritik bilgileri içeren envanter listesidir.
* **`script.js`:** Sistemin "Beyni". Tüm hesaplama mantığı, veri yükleme, arama filtrelemesi, **akıllı saat kiti seçimi** ve kuralların işlenmesi bu dosyada gerçekleşir.

## 4. Veri Yapısı (JSON Dosyaları)

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
* `port`: (String) Cihazın şarj/bağlantı portu tipi (örn: "USB-C", "Lightning", "Manyetik Kablosuz"). Kablo seçimini etkiler.
* `yil`: (Number) Cihazın piyasaya sürülme yılı.
* `kablo_stok_kodu`: (String veya `null`) **(Güncellendi)** **Akıllı Saatler HARİÇ**, bu cihaz için gereken alarm kablosunun stok kodu. Akıllı saatlerde bu alan **bulunmaz veya `null`'dır**.
* `stand_stok_kodu`: (String veya `null`) **(Güncellendi)** **Akıllı Saatler ve Bilgisayarlar HARİÇ**, bu cihaz için gereken standın stok kodu. Akıllı saatler ve Bilgisayarlarda bu alan **bulunmaz veya `null`'dır**.
* `panel_stok_kodu`: (String veya `null`) **Sadece Tabletler için** doldurulur (`8906981600`). Diğerlerinde `null` veya yoktur.

## 5. Çalışma Mantığı ve Fonksiyonlar (`script.js`)

Sistem, `DOMContentLoaded` olayı ile başlar ve aşağıdaki adımları izler:

1.  **`verileriYukle()` (Veri Yükleme):**
    * Sayfa ilk açıldığında çalışır. `.json` dosyalarını `fetch` ile çeker.
    * Arayüz elemanları bu sırada `disabled` durumdadır.
    * `cihazlar.json`'dan `tamAd` oluşturur.
    * Başarılı olursa `aktiveEtArayuzu()`'nü çağırır.
    * Hata olursa hatayı `#yuklemeDurumu` alanına yazar.

2.  **`aktiveEtArayuzu()` (Arayüzü Aktif Etme):**
    * Tüm `input` ve `button` elemanlarını aktif hale getirir.
    * "Yükleniyor..." mesajını gizler.

3.  **Kategori Filtreleme (`filtreButonlari` Olayı):**
    * Kullanıcı bir kategori butonuna tıkladığında, `seciliKategori` değişkeni güncellenir.
    * Arama çubuğu boş değilse, `aramaYap()` fonksiyonu tetiklenir.

4.  **Arama Olayları (`aramaYap()` ve İlgili Olaylar):**
    * Kullanıcı arama çubuğuna yazdıkça (`"input"` olayı) tetiklenir.
    * `cihazVeritabani`'nı önce `seciliKategori`'ye, sonra yazılan metne göre filtreler.
    * **Akıllı Saat Mantığı:** Eğer bulunan cihazın kategorisi "Akıllı Saat" ise, `#aramaSonuçlari` div'ine **iki ayrı seçenek** eklenir: biri `[MGM Kiti]` diğeri `[SALUS Kiti]` etiketiyle. Her seçeneğe `data-kit-turu` ("MGM" veya "SALUS") bilgisi eklenir.
    * **`handleAramaSonucClick()`:** Arama sonucuna tıklandığında çağrılır. Tıklanan cihaz nesnesini ve seçilen `kitTuru`'nü (`null`, "MGM" veya "SALUS") `secilenCihaz` değişkenine atar. Arama çubuğunu doldurur (kit adı olmadan).

5.  **`ekleButton` Olayı (Listeye Ekleme):**
    * `secilenCihaz` ve `adetInput`'u kontrol eder.
    * `#secilenUrunListesi`'ne `<li>` eklerken, `data-model` (tamAd), `data-adet` ve `data-kit` (seçilen kit türü) niteliklerini ekler. Görünür metne de kit bilgisini ekler.

6.  **`hesaplaButton` Olayı (Ana Hesaplama):**
    * `#secilenUrunListesi` içindeki tüm `<li>` elemanlarını okur.
    * Her `<li>` için `data-model`, `data-adet` ve `data-kit` bilgilerini alır.
    * `cihazlar.json`'da eşleşen kaydı bulur.

7.  **İş Kuralları ve Malzeme Ekleme (`hesapla()` içinde):**
    * Cihazdan gelen bilgiler ve `data-kit` kullanılarak `stokKoduEkle()` ile `siparisListesi` oluşturulur.
    * **Kural (Akıllı Saat Kiti):**
        * Eğer cihaz "Akıllı Saat" ise:
            * `data-kit` == "MGM" ise: `8909011600` (MGM Stand) ve `8909021600` (MGM Kablo) eklenir.
            * `data-kit` == "SALUS" ise: `malzemeler.json`'daki `kategori: "Salus"` olan tüm parçalar eklenir.
    * **Kural (Diğer Cihazlar):**
        * Cihaz "Akıllı Saat" değilse, `cihazlar.json`'daki `kablo_stok_kodu`, `stand_stok_kodu` (varsa) ve `panel_stok_kodu` (tablet ise) eklenir.
    * **Kural (Kumanda):** `toplamCihazSayisi > 0` ise `8907071600` (Kumanda) 1 adet eklenir.
    * **Kural (Panel Hesabı):**
        * `telefonAdedi` (Akrilik stand kullanan ama tablet olmayan) hesaplanır.
        * `pcAdediMac` (`8907061600` kablosu adedi) ve `pcAdediDiger` (`8907051600` kablosu adedi) hesaplanır. Toplam `pcAdedi` bulunur.
        * `gerekliPanelAdedi = Math.ceil((telefonAdedi + pcAdedi) / 5)` ile `8906971600` (5'li Panel) eklenir.
    * **Kural (Genel Yapışkanlar/Konnektör):**
        * `genelCihazAdedi = (telefonAdedi + tabletAdedi)` (Akrilik stand kullananlar) hesaplanır.
        * Bu adet kadar 3 parça eklenir: `8907081600` (Konnektör), `9220951600` (Taban Yapışkanı), `9224911600` (Ek Yapışkan).
    * **Kural (PC/MacBook Yapışkanı):**
        * `pcAdediMac > 0` (Yani **sadece** `8907061600` kablosu varsa) ise, o adet kadar `8907091600` (Damla Yapışkan) eklenir.

8.  **Sonuçları Yazdırma (Render):**
    * `siparisListesi` döngüye alınır.
    * `malzemeler.json`'dan bilgi bulunur.
    * **Paket Hesabı:** `gerekliPaketAdedi = Math.ceil(toplamGerekliAdet / paketIciAdet)` kullanılır.
    * Malzemenin `kategori`'sine göre `#genelMalzemeListesi`'ne veya `#sonucTablosuBody`'ye yazdırılır.

## 6. Güncelleme ve Hata Ayıklama (AI için Notlar)

### Yeni Bir Cihaz Nasıl Eklenir?

1.  **Sadece `cihazlar.json` dosyasını açın.**
2.  Cihazın **kategorisini**, **markasını**, **modelini**, **port tipini** ve **yılını** belirleyin.
3.  **Akıllı Saat İse:** Sadece bu 5 bilgiyi içeren yeni bir nesne ekleyin. **Stok kodu belirtmeyin.**
    ```json
    { "kategori": "Akıllı Saat", "marka": "YeniMarka", "model": "Watch X", "port": "Manyetik Kablosuz", "yil": 2026 }
    ```
4.  **Diğer Cihaz İse:**
    * Port tipine göre doğru `kablo_stok_kodu`'nu atayın (Bkz: Bölüm 7, İş Kuralları veya `malzemeler.json`).
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

1.  **CORS Hatası / "HATA: ... yüklenemedi":** Sistemi bir web sunucusu (örn: `http://localhost`) üzerinden çalıştırın.
2.  **Arama Sonuçları Görünmüyor / Hata Veriyor:** `verileriYukle()` fonksiyonunun başarılı olup olmadığını kontrol edin. JSON dosyalarında format hatası (`Unexpected token '/'` gibi) olmadığından emin olun.
3.  **Akıllı Saat İçin Malzeme Eklenmiyor:** `script.js`'deki `hesapla()` fonksiyonunda, `data-kit` kontrolünün (`if (kitTuru === "MGM")` ve `else if (kitTuru === "SALUS")`) doğru yapıldığından emin olun. `malzemeler.json`'daki "Salus" kategorili ürünlerin stok kodlarının ve `8909011600`, `8909021600` kodlarının doğruluğunu kontrol edin.
4.  **Yanlış Malzeme/Adet Hesaplanıyor:** `script.js`'deki İş Kuralları (Bölüm 7) bölümünü inceleyin. Özellikle panel hesabı, yapışkan/konnektör ekleme koşulları ve `stokKoduEkle` fonksiyonunun mantığını kontrol edin. `malzemeler.json`'daki `paket_ici_adet` değerlerinin doğruluğunu teyit edin.
5.  **"Toplam Ürün Adedi" Sütunu "undefined" Görünüyor:** `script.js`'deki son döngüde (Adım 8), `<td>` içine yazdırılan değişkenin `toplamGerekliAdet` olduğundan emin olun (Bu hata önceki versiyonlarda düzeltildi).

## 7. Yapay Zeka İçin Uyulması Gereken Kurallar

Bu dokümanla etkileşime geçen herhangi bir yapay zeka aşağıdaki kurallara uymalıdır:

* **Analiz:** Bu doküman yüklendiğinde, sistemin çalışma mantığını, işleyişini ve tüm kodlarını (HTML, CSS, JS, JSON) tam olarak analiz et.
* **Eş Zamanlı Güncelleme:** Sisteme (kodlara veya JSON verilerine) bir güncelleme istendiğinde, kod değişikliği yapıldıktan sonra **bu teknik dokümanı (`README.md`) da değişikliği yansıtacak şekilde güncelle**.
* **Onay ve Versiyonlama:** Kod ve doküman güncellemesi bittiğinde, kullanıcıya **"Başka bir isteğiniz var mı?"** diye sor. Eğer kullanıcı "yok" derse, bu dokümanın başlığındaki versiyon numarasını bir sonraki adıma yükselt (örn: v2.3 -> v2.4) ve güncellenmiş dokümanı sun.
* **Anlama:** Bu doküman her yüklendiğinde veya her güncellendiğinde, sistemin güncel çalışma mantığını kavradığından emin ol.