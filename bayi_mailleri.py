import json

# Dönüştürülecek kaynak dosyanın adı
kaynak_dosya_adi = 'mail adresleri.txt'
# Çıktı olarak oluşturulacak JSON dosyasının adı
hedef_dosya_adi = 'bayi_mailleri.json'

bayi_mail_veritabani = {}

try:
    # Metin dosyasını UTF-8 formatında aç
    with open(kaynak_dosya_adi, 'r', encoding='utf-8') as f:
        for satir in f:
            # Satır boşluklarını temizle
            temiz_satir = satir.strip()
            if not temiz_satir:
                continue

            # Satırı boşluk karakterine göre ikiye böl
            parcalar = temiz_satir.split()
            
            # Eğer satırda en az iki parça varsa (bayi kodu ve mail)
            if len(parcalar) >= 2:
                bayi_kodu = parcalar[0]
                mail_adresi = parcalar[1]
                
                # Sözlüğe ekle
                bayi_mail_veritabani[bayi_kodu] = mail_adresi
            else:
                print(f"Uyarı: '{temiz_satir}' satırı beklenen formatta değil ve atlandı.")

    # Toplanan veriyi JSON formatında dosyaya yaz
    with open(hedef_dosya_adi, 'w', encoding='utf-8') as f:
        # json.dump ile veriyi güzel bir formatta yaz
        json.dump(bayi_mail_veritabani, f, indent=4, ensure_ascii=False)

    print(f"Başarılı! {len(bayi_mail_veritabani)} adet bayi bilgisi '{hedef_dosya_adi}' dosyasına aktarıldı.")

except FileNotFoundError:
    print(f"Hata: '{kaynak_dosya_adi}' dosyası bulunamadı. Lütfen dosyanın bu programla aynı klasörde olduğundan emin olun.")
except Exception as e:
    print(f"Bir hata oluştu: {e}")