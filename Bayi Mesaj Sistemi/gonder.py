from pathlib import Path
import pandas as pd
import pyautogui
import pyperclip
import time
import webbrowser
import sys
import re

# Şehir plaka kodları sözlüğü
SEHIR_HARITASI = {
    "01": "Adana", "02": "Adıyaman", "03": "Afyonkarahisar", "04": "Ağrı", "05": "Amasya",
    "06": "Ankara", "07": "Antalya", "08": "Artvin", "09": "Aydın", "10": "Balıkesir",
    "11": "Bilecik", "12": "Bingöl", "13": "Bitlis", "14": "Bolu", "15": "Burdur",
    "16": "Bursa", "17": "Çanakkale", "18": "Çankırı", "19": "Çorum", "20": "Denizli",
    "21": "Diyarbakır", "22": "Edirne", "23": "Elazığ", "24": "Erzincan", "25": "Erzurum",
    "26": "Eskişehir", "27": "Gaziantep", "28": "Giresun", "29": "Gümüşhane", "30": "Hakkari",
    "31": "Hatay", "32": "Isparta", "33": "Mersin", "34": "İstanbul", "35": "İzmir",
    "36": "Kars", "37": "Kastamonu", "38": "Kayseri", "39": "Kırklareli", "40": "Kırşehir",
    "41": "Kocaeli", "42": "Konya", "43": "Kütahya", "44": "Malatya", "45": "Manisa",
    "46": "Kahramanmaraş", "47": "Mardin", "48": "Muğla", "49": "Muş", "50": "Nevşehir",
    "51": "Niğde", "52": "Ordu", "53": "Rize", "54": "Sakarya", "55": "Samsun",
    "56": "Siirt", "57": "Sinop", "58": "Sivas", "59": "Tekirdağ", "60": "Tokat",
    "61": "Trabzon", "62": "Tunceli", "63": "Şanlıurfa", "64": "Uşak", "65": "Van",
    "66": "Yozgat", "67": "Zonguldak", "68": "Aksaray", "69": "Bayburt", "70": "Karaman",
    "71": "Kırıkkale", "72": "Batman", "73": "Şırnak", "74": "Bartın", "75": "Ardahan",
    "76": "Iğdır", "77": "Yalova", "78": "Karabük", "79": "Kilis", "80": "Osmaniye",
    "81": "Düzce"
}

class BayiTakip:
    def __init__(self, dosya_yolu):
        self.dosya_yolu = dosya_yolu
        self.gonderilenler = set()
        self._dosyayi_oku()
    
    def _dosyayi_oku(self):
        if Path(self.dosya_yolu).exists():
            with open(self.dosya_yolu, "r", encoding="utf-8") as f:
                self.gonderilenler = {line.strip() for line in f if line.strip()}
    
    def bayi_gonderildi(self, bayi_kodu):
        if bayi_kodu not in self.gonderilenler:
            self.gonderilenler.add(bayi_kodu)
            with open(self.dosya_yolu, "a", encoding="utf-8") as f:
                f.write(f"{bayi_kodu}\n")
    
    def sifirla(self):
        self.gonderilenler.clear()
        path = Path(self.dosya_yolu)
        if path.exists():
            path.unlink()

class WhatsAppBayiMesajlasma:
    def __init__(self):
        self.dosya_dizini = Path(__file__).resolve().parent
        self.anket_kodlari_yolu = self.dosya_dizini / 'bayi kodları.xlsx'
        self.tum_bayiler_yolu = self.dosya_dizini / 'Tüm Bayiler.xlsx'
        self.telefonlar_yolu = self.dosya_dizini / 'bayi telefonları.xlsx'
        self.mesaj_dosyasi = self.dosya_dizini / 'mesaj.txt'
        self.ozel_mesaj_dosyasi = self.dosya_dizini / 'ozelmesaj.txt'
        self.takip_dosyasi = self.dosya_dizini / 'gonderilen_bayiler.txt'
        
        self.bayi_takip = BayiTakip(self.takip_dosyasi)
        self.mesaj_icerik = ""
        if self.mesaj_dosyasi.exists():
            self.mesaj_icerik = self.mesaj_dosyasi.read_text(encoding='utf-8').strip()

    def _dosya_secimi(self):
        while True:
            print("\n--- Veri Kaynağı Seçimi ---")
            print("1) Tüm Bayiler.xlsx")
            print("2) bayi kodları.xlsx")
            secim = input("Seçiminiz (1 veya 2): ").strip()
            
            if secim == '1':
                return self.tum_bayiler_yolu
            elif secim == '2':
                return self.anket_kodlari_yolu
            else:
                print(f"\n[!] Hatalı giriş: '{secim}'. Lütfen sadece 1 veya 2 rakamını giriniz.")

    def _veri_yukle(self, excel_yolu):
        if not excel_yolu.exists():
            print(f"Hata: {excel_yolu.name} dosyası bulunamadı.")
            return None, None, None

        try:
            excel_file = pd.ExcelFile(excel_yolu)
            if "Tüm Bayiler" in excel_file.sheet_names:
                df_kod = pd.read_excel(excel_yolu, sheet_name="Tüm Bayiler", dtype={'Bayi Kodu': str})
            else:
                df_kod = pd.read_excel(excel_yolu, dtype={'Bayi Kodu': str})
        except:
            df_kod = pd.read_excel(excel_yolu, dtype={'Bayi Kodu': str})

        df_tel = pd.read_excel(
            self.telefonlar_yolu, 
            dtype={'Bayi Kodu': str, 'Telefon Numarası 1': str, 'Telefon Numarası 2': str, 'Telefon Numarası 3': str}
        )
        
        kodlar = df_kod['Bayi Kodu'].dropna().unique().tolist()
        
        sehir_bilgisi = {}
        for kod in kodlar:
            if len(kod) >= 5:
                plaka = kod[3:5] 
                sehir_adi = SEHIR_HARITASI.get(plaka, "Bilinmeyen Şehir")
                sehir_bilgisi[kod] = {"plaka": plaka, "sehir": sehir_adi}
            else:
                sehir_bilgisi[kod] = {"plaka": "00", "sehir": "Hatalı Kod"}

        df_tel = df_tel.set_index('Bayi Kodu')
        telefonlar = df_tel.loc[df_tel.index.intersection(kodlar)]
        
        return kodlar, telefonlar, sehir_bilgisi

    def _sehir_secimi_yap(self, bayi_listesi, sehir_bilgisi):
        mevcut_sehirler = {}
        for kod in bayi_listesi:
            bilgi = sehir_bilgisi.get(kod)
            if bilgi:
                mevcut_sehirler[bilgi['plaka']] = bilgi['sehir']
        
        print("\n--- Tespit Edilen Şehirler ---")
        sirali_plakalar = sorted(mevcut_sehirler.keys())
        for plaka in sirali_plakalar:
            print(f"[{plaka}] {mevcut_sehirler[plaka]}")
        
        secim = input("\nPlaka kodlarını girin (Örn: 04, 36) veya Hepsi için Enter: ").strip()
        
        if not secim:
            return bayi_listesi
        
        secilen_plakalar = [s.strip() for s in secim.split(',')]
        return [kod for kod in bayi_listesi if sehir_bilgisi.get(kod, {}).get('plaka') in secilen_plakalar]

    def _menu(self):
        print("\n=== GELİŞMİŞ WHATSAPP OTOMASYONU (HIZLANDIRILMIŞ) ===")
        print("1) Anketini Yapmayanlar (bayi kodları.xlsx)")
        print("2) Gönderilmeyenleri tekrar dene")
        print("3) Manuel kod ile gönder")
        print("4) ÖZEL MESAJ (Kodlu + Selamlama - DOSYA SEÇİMLİ)")
        print("5) ÖZEL MESAJ (Sadece Metin - DOSYA SEÇİMLİ)")
        print("6) Şehir Filtreli Anket Gönder (Tüm Bayiler.xlsx)")
        print("7) Kayıtları sıfırla")
        print("8) Çıkış")
        return input("\nSeçiminiz: ")

    def _format_telefon(self, val):
        num = re.sub(r'\D', '', str(val))
        if not (10 <= len(num) <= 13): return None
        if num.startswith("90"): return f"+{num}"
        elif num.startswith("0"): return f"+90{num[1:]}"
        else: return f"+90{num}"

    def _gonderim_islemi(self, bayi_kodlari_listesi, telefonlar_df, baslik_metni="", mesaj_override=None, mod="normal"):
        if not bayi_kodlari_listesi:
            print("Liste boş, işlem iptal edildi.")
            return

        print(f"\n>> {baslik_metni}")
        print(f">> Toplam bayi: {len(bayi_kodlari_listesi)}")
        if input("Devam edilsin mi? (E/H): ").lower() != 'e': return
            
        webbrowser.open("https://web.whatsapp.com/")
        print("WhatsApp bekleniyor...")
        time.sleep(10) # Açılış bekleme süresi optimize edildi
        
        sent_codes = set()
        telefon_map = {}
        for kod in bayi_kodlari_listesi:
            if kod in telefonlar_df.index:
                rows = telefonlar_df.loc[[kod]]
                for _, row in rows.iterrows():
                    for val in row:
                        if pd.notna(val):
                            num = self._format_telefon(val)
                            if num: telefon_map.setdefault(num, []).append(kod)
        
        for num, kod_list in telefon_map.items():
            try:
                # Görsel algılama yerine direkt kısayol kullanımı
                pyautogui.hotkey('ctrl', 'alt', '/')
                time.sleep(1.0)
                pyautogui.hotkey('ctrl', 'a')
                pyautogui.press('backspace')
                
                pyautogui.write(num)
                time.sleep(1.2)
                pyautogui.press('enter')
                time.sleep(1.2)

                if len(kod_list) == 1:
                    kod_str = f"*{kod_list[0]}*" 
                    ek = "mağaza koduna"
                else:
                    kod_birlesik = " - ".join(kod_list)
                    kod_str = f"*{kod_birlesik}*"
                    ek = "mağaza kodlarına"

                if mod == "ozel_kodlu":
                    mesaj = f"Merhaba,\n\n{kod_str} {ek} ait mağaza/mağazalarınız için;\n\nAşağıdaki ürün gruplarının fotoğraflarını WhatsApp üzerinden iletir misiniz?\n\n{mesaj_override}"
                elif mod == "ozel_sade":
                    mesaj = mesaj_override
                else:
                    mesaj = f"Merhaba,\n\n{kod_str} {ek} ait dijital denetim anketiniz ulaşmamıştır.\n\n{self.mesaj_icerik}"

                pyperclip.copy(mesaj)
                pyautogui.hotkey('ctrl', 'v')
                pyautogui.press('enter')
                time.sleep(1.5) # Gönderim sonrası bekleme hızlandırıldı

                for k in kod_list:
                    self.bayi_takip.bayi_gonderildi(k)
                    sent_codes.add(k)
            except Exception as e:
                print(f"Hata: {num} -> {e}")

        unsent = set(bayi_kodlari_listesi) - sent_codes
        if unsent:
            (self.dosya_dizini / 'gonderilmeyen_bayiler.txt').write_text("\n".join(sorted(unsent)), encoding='utf-8')
        
        print(f"\nİşlem bitti. Başarılı: {len(sent_codes)}, Başarısız: {len(unsent)}")

    def calistir(self):
        while True:
            secim = self._menu().strip()
            
            if secim == '1':
                kodlar, tels, sehirler = self._veri_yukle(self.anket_kodlari_yolu)
                if kodlar:
                    yeni = [k for k in kodlar if k not in self.bayi_takip.gonderilenler]
                    self._gonderim_islemi(yeni, tels, "Normal Anket Gönderimi", mod="normal")

            elif secim == '2':
                f = self.dosya_dizini / 'gonderilmeyen_bayiler.txt'
                if f.exists():
                    liste = [k.strip() for k in f.read_text(encoding='utf-8').splitlines() if k.strip()]
                    _, tels, _ = self._veri_yukle(self.tum_bayiler_yolu)
                    self._gonderim_islemi(liste, tels, "Tekrar Deneniyor")
                else: print("Liste yok.")

            elif secim == '3':
                kod = input("Kod: ").strip()
                if kod:
                    _, tels, _ = self._veri_yukle(self.tum_bayiler_yolu)
                    self._gonderim_islemi([kod], tels, "Manuel Gönderim")

            elif secim == '4':
                kaynak = self._dosya_secimi()
                kodlar, tels, sehirler = self._veri_yukle(kaynak)
                if kodlar and self.ozel_mesaj_dosyasi.exists():
                    msg = self.ozel_mesaj_dosyasi.read_text(encoding='utf-8').strip()
                    filtrelenmis = self._sehir_secimi_yap(kodlar, sehirler)
                    self._gonderim_islemi(filtrelenmis, tels, f"Özel Mesaj (Kodlu - {kaynak.name})", mesaj_override=msg, mod="ozel_kodlu")

            elif secim == '5':
                kaynak = self._dosya_secimi()
                kodlar, tels, sehirler = self._veri_yukle(kaynak)
                if kodlar and self.ozel_mesaj_dosyasi.exists():
                    msg = self.ozel_mesaj_dosyasi.read_text(encoding='utf-8').strip()
                    filtrelenmis = self._sehir_secimi_yap(kodlar, sehirler)
                    self._gonderim_islemi(filtrelenmis, tels, f"Özel Mesaj (Sade - {kaynak.name})", mesaj_override=msg, mod="ozel_sade")

            elif secim == '6':
                kodlar, tels, sehirler = self._veri_yukle(self.tum_bayiler_yolu)
                if kodlar:
                    secilen_bayiler = self._sehir_secimi_yap(kodlar, sehirler)
                    yeni_gonderilecek = [k for k in secilen_bayiler if k not in self.bayi_takip.gonderilenler]
                    
                    if not yeni_gonderilecek:
                        print("\n[!] Seçilen şehir(ler)deki tüm bayilere mesaj zaten gönderilmiş.")
                    else:
                        self._gonderim_islemi(yeni_gonderilecek, tels, "Şehir Filtreli Anket Gönderimi", mod="normal")

            elif secim == '7':
                if input("Kayıtlar sıfırlansın mı? (E/H): ").lower() == 'e':
                    self.bayi_takip.sifirla(); print("Sıfırlandı.")
            
            elif secim == '8':
                break

            else: print("Geçersiz seçim.")

if __name__ == "__main__":
    WhatsAppBayiMesajlasma().calistir()