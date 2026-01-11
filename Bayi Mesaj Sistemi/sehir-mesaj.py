from pathlib import Path
import pandas as pd
import pyautogui
import pyperclip
import time
import webbrowser
import sys
import re

# Şehir plaka kodları sözlüğü - Tırnak işaretleri ile SyntaxError giderildi
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
        # Dosya ismi "Tüm Bayiler.xlsx" olarak güncellendi
        self.bayi_kodlari_yolu = self.dosya_dizini / 'Tüm Bayiler.xlsx'
        self.telefonlar_yolu = self.dosya_dizini / 'bayi telefonları.xlsx'
        self.mesaj_dosyasi = self.dosya_dizini / 'mesaj.txt'
        self.ozel_mesaj_dosyasi = self.dosya_dizini / 'ozelmesaj.txt'

        # Kritik dosyaların kontrolü
        for p in (self.bayi_kodlari_yolu, self.telefonlar_yolu, self.mesaj_dosyasi):
            if not p.exists():
                print(f"Hata: Dosya bulunamadı: {p.name}")
                sys.exit(1)
        
        takip_dosyasi = self.dosya_dizini / 'gonderilen_bayiler.txt'
        self.bayi_takip = BayiTakip(takip_dosyasi)
        self.mesaj_icerik = self.mesaj_dosyasi.read_text(encoding='utf-8').strip()
        self.bayi_kodlari, self.telefonlar, self.bayi_sehir_bilgisi = self._verileri_hazirla()

    def _verileri_hazirla(self):
        # Excel'den "Bayi Kodu" sütununu metin formatında okur
        df_kod = pd.read_excel(self.bayi_kodlari_yolu, dtype={'Bayi Kodu': str})
        df_tel = pd.read_excel(
            self.telefonlar_yolu, 
            dtype={
                'Bayi Kodu': str, 
                'Telefon Numarası 1': str, 
                'Telefon Numarası 2': str, 
                'Telefon Numarası 3': str
            }
        )
        
        if 'Bayi Kodu' not in df_kod.columns:
            print("Hata: 'Tüm Bayiler.xlsx' içerisinde 'Bayi Kodu' sütunu bulunamadı.")
            sys.exit(1)

        kodlar = df_kod['Bayi Kodu'].dropna().unique().tolist()
        
        # Bayi kodunun 4. ve 5. hanelerinden şehir tespiti yapar
        sehir_bilgisi = {}
        for kod in kodlar:
            if len(kod) >= 5:
                plaka = kod[3:5] 
                sehir_adi = SEHIR_HARITASI.get(plaka, "Bilinmeyen Şehir")
                sehir_bilgisi[kod] = {"plaka": plaka, "sehir": sehir_adi}
            else:
                sehir_bilgisi[kod] = {"plaka": "00", "sehir": "Hatalı Kod"}

        df_tel = df_tel.set_index('Bayi Kodu')
        telefonlar = df_tel.loc[
            df_tel.index.intersection(kodlar),
            ['Telefon Numarası 1', 'Telefon Numarası 2', 'Telefon Numarası 3']
        ]
        return kodlar, telefonlar, sehir_bilgisi

    def _sehir_secimi_yap(self, bayi_listesi):
        mevcut_sehirler = {}
        for kod in bayi_listesi:
            bilgi = self.bayi_sehir_bilgisi.get(kod)
            if bilgi:
                mevcut_sehirler[bilgi['plaka']] = bilgi['sehir']
        
        print("\n--- Listede Tespit Edilen Şehirler ---")
        sirali_plakalar = sorted(mevcut_sehirler.keys())
        for plaka in sirali_plakalar:
            print(f"[{plaka}] {mevcut_sehirler[plaka]}")
        
        secim = input("\nPlaka kodlarını girin (Örn: 04, 36) veya hepsi için Enter: ").strip()
        
        if not secim:
            return bayi_listesi
        
        secilen_plakalar = [s.strip() for s in secim.split(',')]
        filtrelenmis = [
            kod for kod in bayi_listesi 
            if self.bayi_sehir_bilgisi.get(kod, {}).get('plaka') in secilen_plakalar
        ]
        return filtrelenmis

    def _menu(self):
        print("\n=== ŞEHİR BAZLI WHATSAPP SİSTEMİ ===")
        print(f"Kaynak: {self.bayi_kodlari_yolu.name}")
        print("------------------------------------")
        print("1) Şehir seçerek mesaj gönderimi başlat")
        print("2) Gönderilmeyen bayilere tekrar gönder")
        print("3) Manuel bayi koduna mesaj gönder")
        print("4) Tüm bayilere ÖZEL MESAJ gönder (Şehir Seçimli)")
        print("5) Gönderim geçmişini sıfırla")
        print("6) Çıkış")
        return input("\nSeçiminiz: ")

    def _format_telefon(self, val):
        num = re.sub(r'\D', '', str(val))
        if not (10 <= len(num) <= 13): return None
        if num.startswith("90"): return f"+{num}"
        elif num.startswith("0"): return f"+90{num[1:]}"
        else: return f"+90{num}"

    def _wait_for_image(self, image_path, confidence=0.8, timeout=30):
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                box = pyautogui.locateOnScreen(str(image_path), confidence=confidence)
                if box: return box
            except: pass
            time.sleep(0.5)
        return None

    def _gonderim_islemi(self, bayi_kodlari_listesi, baslik_metni="", mesaj_icerik_override=None):
        if not bayi_kodlari_listesi:
            print("Gönderilecek veri bulunamadı.")
            return

        print(f"\n{baslik_metni}")
        print(f"İşlem yapılacak bayi sayısı: {len(bayi_kodlari_listesi)}")
        if input("Devam edilsin mi? (E/H): ").lower() != 'e': return
            
        webbrowser.open("https://web.whatsapp.com/")
        print("WhatsApp Web yükleniyor...")
        time.sleep(10) 
        
        box = self._wait_for_image("whatsapp_search.png")
        use_shortcut = not box
        search_x, search_y = (box.left + 120, box.top + 20) if box else (None, None)

        sent_codes = set()
        telefon_map = {}
        for kod in bayi_kodlari_listesi:
            if kod in self.telefonlar.index:
                rows = self.telefonlar.loc[[kod]]
                for _, row in rows.iterrows():
                    for val in row:
                        if pd.notna(val):
                            num = self._format_telefon(val)
                            if num: telefon_map.setdefault(num, []).append(kod)
        
        for num, kod_list in telefon_map.items():
            try:
                if use_shortcut:
                    pyautogui.hotkey('ctrl', 'alt', '/')
                    time.sleep(1)
                    pyautogui.hotkey('ctrl', 'a'); pyautogui.press('backspace')
                else:
                    pyautogui.click(search_x, search_y); time.sleep(0.5)
                
                pyautogui.write(num); time.sleep(1.5)
                pyautogui.press('enter'); time.sleep(1)

                if mesaj_icerik_override:
                    mesaj = mesaj_icerik_override
                else:
                    kod_str = " - ".join([f"*{k}*" for k in kod_list])
                    mesaj = f"Merhaba,\n\n{kod_str} kodlu mağazanıza ait denetim anketi ulaşmamıştır.\n\n{self.mesaj_icerik}"

                pyperclip.copy(mesaj)
                pyautogui.hotkey('ctrl', 'v'); pyautogui.press('enter')
                time.sleep(2)

                for k in kod_list:
                    self.bayi_takip.bayi_gonderildi(k)
                    sent_codes.add(k)
            except Exception as e:
                print(f"Hata: {num} numarasına mesaj iletilemedi: {e}")

        unsent = set(bayi_kodlari_listesi) - sent_codes
        if unsent:
            (self.dosya_dizini / 'gonderilmeyen_bayiler.txt').write_text("\n".join(sorted(unsent)), encoding='utf-8')
        
        print(f"\nİşlem tamamlandı. Başarılı: {len(sent_codes)}, Başarısız: {len(unsent)}")

    def calistir(self):
        while True:
            secim = self._menu().strip()
            if secim == '1':
                yeni = [k for k in self.bayi_kodlari if k not in self.bayi_takip.gonderilenler]
                self._gonderim_islemi(self._sehir_secimi_yap(yeni), "Şehir Filtreli Gönderim")
            elif secim == '2':
                f = self.dosya_dizini / 'gonderilmeyen_bayiler.txt'
                if f.exists():
                    liste = [k.strip() for k in f.read_text(encoding='utf-8').splitlines() if k.strip()]
                    self._gonderim_islemi(liste, "Kayıtlı Listeden Tekrar Gönderim")
                else: print("Gönderilmeyen bayi listesi bulunamadı.")
            elif secim == '3':
                kod = input("Bayi kodu girin: ").strip()
                if kod: self._gonderim_islemi([kod], "Manuel Gönderim")
            elif secim == '4':
                if self.ozel_mesaj_dosyasi.exists():
                    msg = self.ozel_mesaj_dosyasi.read_text(encoding='utf-8').strip()
                    self._gonderim_islemi(self._sehir_secimi_yap(self.bayi_kodlari), "Özel Mesaj Gönderimi", mesaj_icerik_override=msg)
                else: print("ozelmesaj.txt dosyası bulunamadı.")
            elif secim == '5':
                if input("Gönderilen kayıtlarını sıfırlamak istiyor musunuz? (E/H): ").lower() == 'e':
                    self.bayi_takip.sifirla(); print("Kayıtlar temizlendi.")
            elif secim == '6': break
            else: print("Geçersiz seçim.")

if __name__ == "__main__":
    WhatsAppBayiMesajlasma().calistir()