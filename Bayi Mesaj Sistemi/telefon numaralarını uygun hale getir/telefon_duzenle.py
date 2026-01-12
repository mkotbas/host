import pandas as pd
import re
import shutil

def telefon_formatla(numara):
    """
    +90, boşluk, ayraç içeren veya hatalı formatlı numaraları 10 haneli standart forma dönüştürür
    """
    if pd.isna(numara) or numara in ['-', '', ' ']:
        return None
    
    numara_str = str(numara)
    temiz_numara = re.sub(r'[^0-9]', '', numara_str)
    
    # 11 haneli (0 ile başlayan)
    if len(temiz_numara) == 11 and temiz_numara.startswith('0'):
        return temiz_numara[1:]
    
    # +90 ile başlayan
    elif len(temiz_numara) == 12 and temiz_numara.startswith('90'):
        return temiz_numara[2:]
    
    # 90 ile başlayan 11 haneli
    elif len(temiz_numara) == 11 and temiz_numara.startswith('90'):
        return temiz_numara[2:]
    
    # Zaten 10 haneli
    elif len(temiz_numara) == 10:
        return temiz_numara
    
    return None

def bayi_telefonlari_duzenle(excel_dosyasi, kaydet=False):
    """
    Bayi telefonları Excel dosyasını özel olarak işler
    
    Parametreler:
    excel_dosyasi: İşlenecek Excel dosyasının yolu
    kaydet: True ise orijinal dosyayı değiştirir, False ise sadece sonucu gösterir
    """
    # Excel'i oku (tüm sütunları string olarak oku)
    df = pd.read_excel(excel_dosyasi, dtype=str)
    
    # Özel sütun isimleri
    telefon_sutunlari = ['Telefon Numarası 1', 'Telefon Numarası 2', 'Telefon Numarası 3']
    
    # Orijinal dosyayı yedekle
    if kaydet:
        yedek_dosya = excel_dosyasi.replace('.xlsx', '_ORJINAL.xlsx')
        shutil.copyfile(excel_dosyasi, yedek_dosya)
        print(f"Yedek oluşturuldu: {yedek_dosya}")
    
    # Her telefon sütununu temizle
    for sutun in telefon_sutunlari:
        if sutun in df.columns:
            df[sutun] = df[sutun].apply(telefon_formatla)
            gecersiz = df[sutun].isna().sum()
            print(f"{sutun} sütunu: {gecersiz} geçersiz numara")
        else:
            print(f"Uyarı: {sutun} sütunu bulunamadı")
    
    # Geçersiz numaralar için rapor
    print("\nGeçersiz Numaralar Raporu:")
    for index, row in df.iterrows():
        gecersizler = []
        for sutun in telefon_sutunlari:
            if sutun in df.columns and pd.isna(row[sutun]):
                gecersizler.append(sutun)
        
        if gecersizler and pd.notna(row.get('Bayi Kodu')):
            print(f"Bayi Kodu: {row['Bayi Kodu']} - Geçersiz sütunlar: {', '.join(gecersizler)}")
    
    if kaydet:
        df.to_excel(excel_dosyasi, index=False)
        print(f"\nDosya başarıyla güncellendi: {excel_dosyasi}")
    else:
        print("\nÖnizleme (ilk 5 satır):")
        print(df[['Bayi Kodu'] + [s for s in telefon_sutunlari if s in df.columns]].head())
    
    return df

# Kullanım örneği
if __name__ == "__main__":
    dosya_yolu = "bayi telefonları.xlsx"
    
    # Önce önizleme yap
    print("=== ÖNİZLEME MODU ===")
    bayi_telefonlari_duzenle(dosya_yolu, kaydet=False)
    
    # Onay sonrası gerçek değişiklik yap
    if input("\nDosyayı güncellemek istiyor musunuz? (E/H): ").strip().upper() == 'E':
        print("\n=== DOSYA GÜNCELLENİYOR ===")
        bayi_telefonlari_duzenle(dosya_yolu, kaydet=True)