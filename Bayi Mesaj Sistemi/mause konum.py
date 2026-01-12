import pyautogui
import time

# Sürekli farenin konumunu kontrol et
while True:
    konum = pyautogui.position()
    print(f"Farenin mevcut konumu: {konum}", end="\r")  # Aynı satırda güncellenmesi için end="\r" eklenir
    time.sleep(0.1)  # 0.1 saniye bekleyin, hızlı güncelleme için
