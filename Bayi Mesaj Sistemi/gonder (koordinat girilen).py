import pandas as pd
import pyautogui
import time
import webbrowser
import pyperclip
import os

class BayiTakip:
    def __init__(self, dosya_yolu):
        self.dosya_yolu = dosya_yolu
        self.gonderilenler = set()
        self._dosyayi_oku()
    
    def _dosyayi_oku(self):
        if os.path.exists(self.dosya_yolu):
            with open(self.dosya_yolu, "r", encoding="utf-8") as f:
                self.gonderilenler = set(line.strip() for line in f if line.strip())
    
    def bayi_gonderildi(self, bayi_kodu):
        if bayi_kodu not in self.gonderilenler:
            self.gonderilenler.add(bayi_kodu)
            with open(self.dosya_yolu, "a", encoding="utf-8") as f:
                f.write(f"{bayi_kodu}\n")
    
    def sifirla(self):
        self.gonderilenler = set()
        if os.path.exists(self.dosya_yolu):
            os.remove(self.dosya_yolu)

    def manuel_ekle(self):
        print("\nManuel bayi ekleme modu (Çıkmak için 'q' girin)")
        while True:
            bayi_kodu = input("Eklemek istediğiniz bayi kodunu girin: ").strip()
            if bayi_kodu.lower() == 'q':
                break
            if bayi_kodu and bayi_kodu not in self.gonderilenler:
                self.bayi_gonderildi(bayi_kodu)
                print(f"{bayi_kodu} başarıyla eklendi ve işaretlendi.")
            else:
                print(f"{bayi_kodu} zaten gönderilmiş veya geçersiz.")

class WhatsAppBayiMesajlasma:
    def __init__(self):
        self.dosya_dizini = os.path.dirname(os.path.abspath(__file__))
        self.bayi_kodlari_yolu = os.path.join(self.dosya_dizini, 'bayi kodları.xlsx')
        self.telefonlar_yolu = os.path.join(self.dosya_dizini, 'bayi telefonları.xlsx')
        self.mesaj_dosyasi = os.path.join(self.dosya_dizini, 'mesaj.txt')

        for p in (self.bayi_kodlari_yolu, self.telefonlar_yolu, self.mesaj_dosyasi):
            if not os.path.exists(p):
                print(f"Hata: Dosya bulunamadı: {p}")
                exit(1)

        takip_dosyasi = os.path.join(self.dosya_dizini, 'gonderilen_bayiler.txt')
        self.bayi_takip = BayiTakip(takip_dosyasi)
        self.mesaj_icerik = open(self.mesaj_dosyasi, 'r', encoding='utf-8').read().strip()
        self.bayi_kodlari, self.telefonlar = self._verileri_hazirla()

    def _verileri_hazirla(self):
        df_kod = pd.read_excel(self.bayi_kodlari_yolu, dtype={'Bayi Kodu': str})
        df_tel = pd.read_excel(self.telefonlar_yolu, dtype={'Bayi Kodu': str})
        kodlar = df_kod['Bayi Kodu'].dropna().tolist()
        df_tel = df_tel.set_index('Bayi Kodu')
        telefonlar = df_tel.loc[
            df_tel.index.intersection(kodlar),
            ['Telefon Numarası 1', 'Telefon Numarası 2', 'Telefon Numarası 3']
        ]
        return kodlar, telefonlar

    def _menu(self):
        print("\n1) Mesaj gönderme başlat")
        print("2) Gönderilen kayıtlarını sıfırla")
        print("3) Manuel bayi ekle")
        print("4) Çıkış")
        return input("Seçiminiz: ")

    def calistir(self):
        while True:
            secim = self._menu().strip()
            if secim == '1':
                self._mesaj_gonder()
            elif secim == '2':
                if input("Sıfırlamak istediğinize emin misiniz? (E/H): ").lower() == 'e':
                    self.bayi_takip.sifirla()
                    print("Kayıtlar sıfırlandı.")
            elif secim == '3':
                self.bayi_takip.manuel_ekle()
            elif secim == '4':
                break
            else:
                print("Geçersiz seçim.")

    def _mesaj_gonder(self):
        toplam_kod = len(self.bayi_kodlari)
        gonderilen_fast = len(self.bayi_takip.gonderilenler)
        yeni = [k for k in self.bayi_kodlari if k not in self.bayi_takip.gonderilenler]

        print(f"Daha önce mesaj gönderilen bayi sayısı: {gonderilen_fast}")
        print(f"Mesaj gönderilecek yeni bayi sayısı: {len(yeni)}")
        if not yeni:
            print("Tüm kodlara mesaj gönderilmiş.")
            return

        if input("Devam? (E/H): ").lower() != 'e':
            return

        webbrowser.open("https://web.whatsapp.com/")
        time.sleep(8)

        sent_codes = set()
        telefon_map = {}
        for kod in yeni:
            if kod in self.telefonlar.index:
                rows = self.telefonlar.loc[kod]
                if isinstance(rows, pd.Series): rows = rows.to_frame().T
                for _, row in rows.iterrows():
                    for val in row:
                        if pd.notna(val):
                            num = str(int(val))
                            telefon_map.setdefault(num, []).append(kod)

        for num, kod_list in telefon_map.items():
            full = f"+90{num}"
            try:
                if len(kod_list) > 1:
                    # Kalın yazı için bayi kodlarını * * arasına al
                    bold_kodlar = [f"*{kod}*" for kod in kod_list]
                    kod_str = " - ".join(bold_kodlar)
                    mesaj = f"Merhaba,\n\n{kod_str} mağaza kodlarına ait dijital denetim anketiniz ulaşmamıştır.\n\n{self.mesaj_icerik}"
                else:
                    # Tek bayi kodu için kalın yazı
                    kod_str = f"*{kod_list[0]}*"
                    mesaj = f"Merhaba,\n\n{kod_str} mağaza koduna ait dijital denetim anketiniz ulaşmamıştır.\n\n{self.mesaj_icerik}"

                pyautogui.moveTo(539, 149, duration=1); pyautogui.click(); time.sleep(2)
                pyautogui.write(full); time.sleep(2); pyautogui.press('enter'); time.sleep(2)
                pyperclip.copy(mesaj); pyautogui.hotkey('ctrl', 'v'); pyautogui.press('enter')
                time.sleep(1)

                for k in kod_list:
                    self.bayi_takip.bayi_gonderildi(k)
                    sent_codes.add(k)
            except Exception:
                continue

        total_sent = len(sent_codes)
        total_unsent = len(yeni) - total_sent
        unsent_codes = set(yeni) - sent_codes
        if unsent_codes:
            with open(os.path.join(self.dosya_dizini, 'gonderilmeyen_bayiler.txt'), 'w', encoding='utf-8') as f:
                for uc in sorted(unsent_codes):
                    f.write(f"{uc}\n")

        print("Mesaj gönderme işlemi tamamlandı.")
        print(f"Toplam gönderilen bayi sayısı: {total_sent}")
        print(f"Toplam gönderilmeyen bayi sayısı: {total_unsent}")

if __name__ == "__main__":
    WhatsAppBayiMesajlasma().calistir()