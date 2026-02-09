# AI Güvenli Kod Güncelleme Protokolü

Bu doküman, yapay zeka ile çalışırken mevcut sistemi bozmadan, kontrollü
ve öngörülebilir şekilde kod güncellemesi yapılmasını sağlamak amacıyla
hazırlanmıştır.\
AI, bu kurallara uyarak yalnızca tanımlanan kapsam içinde değişiklik
yapmalıdır.

------------------------------------------------------------------------

## 1. Temel Çalışma Prensibi

AI aşağıdaki öncelik sırasına göre hareket etmelidir:

1.  Mevcut çalışan sistemi korumak
2.  Değişiklik kapsamını aşmamak
3.  Yan etki oluşturmamak
4.  Minimum değişiklikle çözüm üretmek
5.  Yapısal dönüşüm (refactor) yapmamak

Amaç "en modern çözüm" değil, **en güvenli ve minimal çözüm**
üretmektir.

------------------------------------------------------------------------

## 2. Değişiklik Sınırları (Scope Kontrolü)

AI yalnızca açıkça belirtilen dosyalara müdahale edebilir.

### Kurallar:

-   Allowlist dışında hiçbir dosya değiştirilemez.
-   Yeni dosya eklenemez (özellikle belirtilmedikçe).
-   Var olan dosya silinemez.
-   Dosya taşınamaz.
-   Klasör yapısı değiştirilemez.
-   Import yapısı genişletilemez (zorunlu değilse).

Allowlist dışına çıkan herhangi bir değişiklik geçersiz kabul edilir.

------------------------------------------------------------------------

## 3. Refactor ve Mimari Müdahale Yasağı

AI aşağıdakileri yapamaz:

-   Kod sadeleştirme
-   Mimari iyileştirme
-   State yapısını değiştirme
-   Hook yapısını yeniden tasarlama
-   Component bölme/birleştirme
-   Utility extraction
-   Kod modernizasyonu
-   Dosya reorganizasyonu

İstenen görev dışında yapısal değişiklik yapılmaz.

------------------------------------------------------------------------

## 4. Veritabanı ve Veri Sözleşmesi Koruması

Veri katmanı dokunulmazdır.

### Yasaklar:

-   DB şeması değiştirilemez
-   Collection isimleri değiştirilemez
-   Relation yapısı değiştirilemez
-   Index eklenemez/silinemez
-   Migration oluşturulamaz
-   API response formatı değiştirilemez
-   Mevcut alanlar silinemez veya yeniden adlandırılamaz

Ek validasyon gerekiyorsa geriye dönük uyum korunmalıdır.

------------------------------------------------------------------------

## 5. CSS ve UI Kuralları

-   -CSS düzenlemeleri sadece ilgili .css dosyasına, HTML sadece ilgili HTML dosyasına, JS düzenlemeleri sadece JS dosyasına yazılmalı.
-   Inline style eklenmez (zorunlu değilse).
-   Global style bozulmaz.
-   Component style başka dosyaya taşınmaz.
-   Mevcut class isimleri değiştirilmez.
-   UI düzenlemesi yapılırken layout kayması oluşturulmaz.

------------------------------------------------------------------------

## 6. Modal Standardı

Eğer modal kullanılacaksa:

-   Her zaman tek ve ortak modal yapısı kullanılmalıdır.
-   Yeni modal instance oluşturulmaz.
-   Ayrı popup sistemi kurulmaz.

------------------------------------------------------------------------

## 7. Özellik Kaldırma Kuralları

Bir özellik kaldırıldığında:

-   HTML kalıntıları temizlenir
-   JS referansları silinir
-   CSS class'ları kaldırılır
-   Event listener kalıntısı bırakılmaz
-   Route veya API bağlantıları temizlenir

Özellik kaldırma işlemi yarım bırakılmaz.

------------------------------------------------------------------------

## 8. Çıktı Formatı Standardı

AI çıktıyı aşağıdaki formatta vermelidir:

1.  Değişen dosyaların listesi
2.  Her değişen dosyanın tam ve güncel hali
3.  Kısa değişiklik özeti (maksimum 5 madde)
4.  Test senaryoları (en az 5 madde)

Diff dışında açıklama yapılmaz. Gereksiz yorum eklenmez.
------------------------------------------------------------------------

## 10. Etki Analizi Zorunluluğu

Riskli değişikliklerde AI önce şu analizi yapmalıdır:

1.  Hangi dosyalar etkilenecek?
2.  Yan etki riski var mı?
3.  En küçük çözüm seti nedir?
4.  Edge-case senaryoları neler?

Analiz yapılmadan geniş kapsamlı değişiklik üretilmez.

------------------------------------------------------------------------

## 11. Yan Etki Kontrolü

AI aşağıdaki durumlara dikkat etmelidir:

-   Null / undefined veri
-   Loading state
-   Error state
-   Boş liste
-   API başarısızlığı
-   Yetki kontrolü

Yeni hata üretme ihtimali değerlendirilmelidir.

------------------------------------------------------------------------

## 12. Performans ve Temizlik

-   Gereksiz state eklenmez
-   Gereksiz re-render tetiklenmez
-   Dead code bırakılmaz
-   Console log bırakılmaz
-   Kullanılmayan import kalmaz

Kod temiz ve üretim kalitesinde olmalıdır.

------------------------------------------------------------------------

## 13. Deterministik Davranış Beklentisi

AI:

-   Alternatif çözüm önermemelidir
-   Birden fazla yaklaşım sunmamalıdır
-   Opsiyon üretmemelidir
-   Kararsız mimari öneri yapmamalıdır

Tek, net ve minimal çözüm üretmelidir.

------------------------------------------------------------------------

## 14. Güvenlik Kuralı

AI hiçbir zaman:

-   Auth yapısını değiştiremez
-   Yetki kontrolünü gevşetemez
-   Token akışını modifiye edemez
-   Güvenlik validasyonunu kaldıramaz

------------------------------------------------------------------------

## 15. Test Senaryosu Standardı

Her güncellemede aşağıdaki testler yazılmalıdır:

1.  Normal kullanım senaryosu
2.  Boş veri durumu
3.  Hatalı giriş durumu
4.  API başarısızlık durumu
5.  Edge-case senaryosu

------------------------------------------------------------------------

## 16. Nihai Hedef

Bu sistemin amacı:

-   AI'yı yardımcı araç olarak kullanmak
-   Kontrolü kaybetmemek
-   Proje bütünlüğünü korumak
-   Regresyon riskini minimize etmek
-   Minimal ve güvenli patch üretmektir

------------------------------------------------------------------------

Bu README, proje yüklenmeden önce AI'ya verilecek kurallar bütünüdür.\
Bu kurallara uyulmadığı durumda üretilen kod geçersiz kabul edilir.
