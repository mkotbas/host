# Arçelik Bayi Alarm Sipariş Otomasyon Sistemi - Teknik Dokümantasyon (v2.10 - Yeni Cihaz Ekleme Özelliği Eklendi)

## 1. Sistemin Amacı

Bu sistem, Arçelik Mağaza Denetim Uzmanları için geliştirilmiş web tabanlı bir otomasyon aracıdır. Temel amacı, yeni açılan veya konsept değiştiren bayilere gönderilecek elektronik cihaz (telefon, tablet, akıllı saat, bilgisayar) listesine göre, **gerekli alarm ünitesi ve montaj malzemelerinin sipariş listesini otomatik olarak ve hatasız bir şekilde oluşturmaktır.**

Sistem, cihazların şarj portu yapılarını analiz ederek doğru alarm kablosunu, standı, paneli ve tamamlayıcı parçaları seçer. Kullanıcıya, telefon veya tabletlerin akrilik stand üzerinde sergilenip sergilenmeyeceğini seçme imkanı sunar. Akıllı saatler için kullanıcıya MGM veya SALUS marka alarm kiti seçeneği sunar. **(YENİ)** Ayrıca, kullanıcıların veritabanında bulunmayan **yeni cihazları doğrudan arayüz üzerinden eklemesine** ve güncellenmiş cihaz listesini indirmesine olanak tanır. Malzemelerin paket içi adetlerine göre sipariş edilmesi gereken **paket sayısını** otomatik olarak hesaplar.

Bu sayede manuel yapılan işlemlerdeki "yanlış malzeme gönderme" veya "eksik parça hesaplama" gibi hatalar tamamen ortadan kaldırılır ve cihaz veritabanı kolayca güncel tutulabilir.

## 2. Kullanılan Teknolojiler
* **Arayüz (UI):** `index.html`
* **Stil (CSS):** `style.css`
* **Ana Mantık (Logic):** `script.js` (ES6+)
* **Veri Tabanı (Data):** `cihazlar.json`, `malzemeler.json`

## 3. Dosya Yapısı ve Görevleri
* **`index.html`:** Kullanıcının etkileşime girdiği ana HTML dosyası. Kategori filtreleri, arama çubuğu, adet girişi, akrilik stand kullanım onay kutusu, eklenecek ürün listesi, sonuç tablosu ve **(YENİ)** yeni cihaz ekleme formunun iskeletini içerir.
* **`style.css`:** Arayüzün (UI) tüm görsel stillerini, renklerini, filtrelerin/onay kutusunun/yeni cihaz formunun görünümünü ve "devre dışı" (disabled) durumlarını yönetir.
* **`cihazlar.json`:** Cihaz Veri Tabanı. Hangi modelin hangi kategoriye ve markaya ait olduğunu, port tipini ve yılını belirtir. Akıllı saatler dışındaki cihazlar için hangi kablo/stand/panel stok kodlarını tetiklediğini de içerir.
* **`malzemeler.json`:** Malzeme Veri Tabanı. Stok kodu, ürün adı, kullanım amacı, **paket içi adet** ve **kategori** gibi kritik bilgileri içeren envanter listesidir.
* **`script.js`:** Sistemin "Beyni". Tüm hesaplama mantığı, veri yükleme, arama filtrelemesi, akıllı saat kiti seçimi, stand kullanım tercihinin işlenmesi, **(YENİ)** yeni cihaz ekleme ve indirme linki oluşturma işlemleri ve kuralların uygulanması bu dosyada gerçekleşir.

## 4. Veri Yapısı (JSON Dosyaları)
*(Bu bölümde değişiklik yok)*

### `malzemeler.json`
* `stok_kodu`, `urun_adi`, `kullanim_amaci`, `paket_ici_adet`, `kategori` (`Kablo`, `Stand`, `Panel`, `Salus`, `Genel`, `Aksesuar`).

### `cihazlar.json`
* `kategori`, `marka`, `model`, `port`, `yil`, `kablo_stok_kodu` (Akıllı Saat hariç), `stand_stok_kodu` (Akıllı Saat ve Bilgisayar hariç), `panel_stok_kodu` (Sadece Tablet).

## 5. Çalışma Mantığı ve Fonksiyonlar (`script.js`)

Sistem, `DOMContentLoaded` olayı ile başlar ve aşağıdaki adımları izler:

1.  **`verileriYukle()`:** `.json` dosyalarını `fetch` ile çeker. Arayüz elemanları (arama, ekleme ve **(YENİ)** yeni cihaz formu dahil) `disabled` durumdadır. Başarılı olursa `aktiveEtArayuzu()`'nü çağırır.
2.  **`aktiveEtArayuzu()`:** Tüm `input`, `button`, `checkbox` ve `select` elemanlarını aktif hale getirir. "Yükleniyor..." mesajını gizler.
3.  **Kategori Filtreleme:** Tıklanan butona göre `seciliKategori` güncellenir ve `aramaYap()` tetiklenir.
4.  **Arama Olayları:** Kullanıcı yazdıkça filtreleme yapılır. Akıllı saat ise `[MGM Kiti]` / `[SALUS Kiti]` seçenekleri sunulur.
5.  **`handleAramaSonucClick()`:** Tıklanan sonuç `secilenCihaz`'a atanır. Akıllı Saat/Bilgisayar ise stand onay kutusu disable edilir, Telefon/Tablet ise enable edilir.
6.  **`ekleButton` Olayı:** Seçilen cihazı, adedi, `data-kit` ve `data-onstand` bilgisiyle `#secilenUrunListesi`'ne `<li>` olarak ekler.
7.  **`(YENİ) Yeni Cihaz Ekleme Olayları:`**
    * `yeniPortSelect`'in `"change"` olayı: "Diğer" seçilirse metin kutusunu gösterir.
    * `yeniCihazKaydetButton`'un `"click"` olayı:
        * Form verilerini okur ve doğrular.
        * Cihazın zaten var olup olmadığını kontrol eder.
        * Kategori ve porta göre stok kodlarını (kablo, stand, panel) belirler.
        * Yeni cihaz nesnesini oluşturur.
        * Hafızadaki `cihazVeritabani`'na yeni cihazı ekleyerek `guncelCihazVeritabani`'nı oluşturur.
        * `guncelCihazVeritabani`'nı JSON string'e çevirir.
        * `Blob` ve `URL.createObjectURL` kullanarak indirilebilir bir veri oluşturur.
        * `<a>` etiketi ile `download="cihazlar.json"` özelliğini ayarlayarak indirme linkini oluşturur ve `#cihazEklemeSonuc` div'inde gösterir. Kullanıcıya dosyayı indirip eskisinin üzerine yazması gerektiğini belirtir.
        * Formu temizler.
8.  **`hesaplaButton` Olayı (Ana Hesaplama):** `#secilenUrunListesi`'ndeki `<li>`'leri okur.
9.  **İş Kuralları ve Malzeme Ekleme (`hesapla()` içinde):**
    * `data-kit` ve `data-onstand` bilgilerine göre doğru malzemeler (`kablo`, `stand`, `panel`, `yapışkanlar`, `konnektör`, `kumanda`) `siparisListesi`'ne eklenir.
10. **Sonuçları Yazdırma (Render):** `siparisListesi` döngüye alınır, paket hesabı yapılır ve sonuçlar ilgili tablolara yazdırılır.

## 6. Güncelleme ve Hata Ayıklama (AI için Notlar)

### Yeni Bir Cihaz Manuel Olarak Nasıl Eklenir?
*(Bu bölüm, yeni özellik nedeniyle daha az önemli hale geldi ama referans olarak kalabilir)*

1.  **Sadece `cihazlar.json` dosyasını açın**.
2.  Cihazın kategorisini, markasını, modelini, port tipini ve yılını belirleyin.
3.  Akıllı Saat ise, stok kodu belirtmeden ekleyin.
4.  Diğer cihaz ise, porta/kategoriye göre doğru `kablo_stok_kodu`, `stand_stok_kodu` ve `panel_stok_kodu` atayın.
5.  Dosyanın JSON formatını bozmadan yeni nesneyi ekleyin.

### "Hesapla" Butonu / Arayüz Çalışmıyor veya Hata Veriyorsa?

1.  **CORS Hatası / "HATA: ... yüklenemedi":** Sistemi bir web sunucusu üzerinden çalıştırın.
2.  **Arama / Ekleme / Hesaplama Çalışmıyor:** Tarayıcının geliştirici konsolunu (F12) açıp hataları kontrol edin.
    * `verileriYukle()` hatası varsa JSON dosyalarının formatını ve erişilebilirliğini kontrol edin.
    * JavaScript hataları varsa (`TypeError`, `ReferenceError` vb.), `script.js` kodunu ilgili bölümler için inceleyin.
3.  **(YENİ) Yeni Cihaz Ekleme Çalışmıyor:**
    * Formun doğru okunup okunmadığını kontrol edin (`yeniCihazKaydetButton` olay dinleyicisi).
    * Stok kodu atama mantığının (kategori/porta göre) doğru çalıştığını kontrol edin.
    * İndirme linki oluşturma kısmında (`Blob`, `URL.createObjectURL`) hata olup olmadığını konsoldan kontrol edin.
4.  **Yanlış Malzeme/Adet Hesaplanıyor:** `script.js`'deki İş Kuralları (Bölüm 5, Adım 9) bölümünü inceleyin.
5.  **"Toplam Ürün Adedi" Sütunu "undefined" Görünüyor:** `script.js`'deki son döngüde (Adım 10), `<td>` içine yazdırılan değişkenin `toplamGerekliAdet` olduğundan emin olun.

## 7. Yapay Zeka İçin Uyulması Gereken Kurallar

Bu dokümanla etkileşime geçen herhangi bir yapay zeka aşağıdaki kurallara uymalıdır:

* **Analiz:** Bu doküman yüklendiğinde, sistemin çalışma mantığını, işleyişini ve tüm kodlarını (HTML, CSS, JS, JSON) tam olarak analiz et.
* **Eş Zamanlı Güncelleme:** Sisteme (kodlara veya JSON verilerine) bir güncelleme istendiğinde, kod değişikliği yapıldıktan sonra **bu teknik dokümanı (`README.md`) da değişikliği yansıtacak şekilde güncelle**.
* **Onay ve Versiyonlama:** Kod ve doküman güncellemesi bittiğinde, kullanıcıya **"Başka bir isteğiniz var mı?"** diye sor. Eğer kullanıcı "yok" derse, bu dokümanın başlığındaki versiyon numarasını bir sonraki adıma yükselt (örn: v2.10 -> v2.11) ve güncellenmiş dokümanı sun.
* **Anlama:** Bu doküman her yüklendiğinde veya her güncellendiğinde, sistemin güncel çalışma mantığını kavradığından emin ol.
* **Doküman Bütünlüğü:** Bu dokümanı güncellerken, **tüm bölümlerin** eksiksiz olarak yazıldığından emin ol. Sadece değişen kısımları değil, değişmeyen kısımları da içeren **tam dokümanı** sun. Güncelleme yapılan bölümleri veya önemli değişiklikleri **(Güncellendi)** veya **(YENİ)** gibi etiketlerle belirt.