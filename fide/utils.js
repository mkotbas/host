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
        if (icon) {
            icon.className = 'fas fa-spinner fa-spin'; // Spinner ikonu
            // (DÜZELTME) Mobil düzeltmelerin spinner'da kalmamasını sağla
            icon.style.fontSize = '';
            icon.style.marginBottom = '';
            overlay.querySelector('p').style.maxWidth = '';
            overlay.querySelector('p').style.textAlign = '';
            overlay.querySelector('p').style.padding = '';
            overlay.querySelector('p').style.wordWrap = '';
            overlay.querySelector('p').style.overflowWrap = '';
        }
        
        overlay.querySelector('p').textContent = message;
        overlay.style.display = 'flex';
        // (DÜZELTME) Kilit ekranından kalma renkleri sıfırla
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        overlay.style.color = 'white';
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
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
 * (YENİ FONKSİYON - Mobil Cihazlar İçin Düzeltildi)
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
            icon = document.createElement('i');
            overlay.prepend(icon);
        }
        icon.className = 'fas fa-lock'; // FontAwesome kilit ikonu
        icon.style.fontSize = '40px'; // İkonu büyüt
        icon.style.marginBottom = '20px'; // Mesajla arasına boşluk koy

        // --- MOBİL TAŞMA DÜZELTMELERİ ---
        const p = overlay.querySelector('p');
        p.textContent = message;
        
        // 1. Metnin satır atlamasını (kaymasını) sağla
        p.style.wordWrap = 'break-word';
        p.style.overflowWrap = 'break-word';
        // 2. Metni her zaman ortala
        p.style.textAlign = 'center';
        // 3. Ekran kenarlarına boşluk ver (taşmayı engeller)
        p.style.padding = '0 20px'; 
        // 4. Paragrafın genişliğini %90 ile sınırla
        p.style.maxWidth = '90%'; 
        // --- DÜZELTME BİTTİ ---

        // Stili ayarla (kapatılamaz)
        overlay.style.display = 'flex';
        // (YENİ) Flex ayarlarını garantile (dikeyde ve yatayda ortalama)
        overlay.style.flexDirection = 'column';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        
        // Kırmızı uyarı rengi
        overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.7)';
        overlay.style.color = 'white';
        overlay.style.zIndex = '2000'; // En üstte olmasını garantile
    }
}