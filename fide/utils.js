// --- Genel Yardımcı Fonksiyonlar ---

/**
 * Yükleme ekranını belirtilen bir mesajla gösterir.
 * @param {string} message Gösterilecek mesaj.
 */
export function showLoadingOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        // Varsa kilit ikonunu kaldır, spinner'ı göster
        const icon = overlay.querySelector('i');
        if (icon) icon.className = 'fas fa-spinner fa-spin'; // Spinner ikonu

        overlay.querySelector('p').textContent = message;
        overlay.style.display = 'flex';
    }
}

/**
 * Yükleme ekranını gizler.
 */
export function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

/**
 * (YENİ FONKSİYON)
 * Kullanıcının erişimini engelleyen bir kilit ekranı gösterir.
 * Bu ekran kapatılamaz ve kullanıcıyı sistemde kilitler.
 * @param {string} message Engelleme mesajı (örn: "Cihazınız kilitlendi.").
 */
export function showLockoutOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        // Spinner yerine kilit ikonu göster
        let icon = overlay.querySelector('i');
        if (!icon) {
            // Eğer ikon elementi yoksa, (p'den önce) oluşturalım
            icon = document.createElement('i');
            overlay.prepend(icon);
        }
        icon.className = 'fas fa-lock'; // FontAwesome kilit ikonu
        icon.style.fontSize = '40px'; // İkonu büyüt
        icon.style.marginBottom = '20px'; // Mesajla arasına boşluk koy

        // Mesajı ayarla
        overlay.querySelector('p').textContent = message;
        
        // Stili ayarla (kapatılamaz)
        overlay.style.display = 'flex';
        overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.7)'; // Kırmızı uyarı rengi
        overlay.style.color = 'white';
        overlay.style.zIndex = '2000'; // En üstte olmasını garantile
    }
}