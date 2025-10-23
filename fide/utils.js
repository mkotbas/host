// --- Genel Yardımcı Fonksiyonlar ---

/**
 * Yükleme ekranını belirtilen bir mesajla gösterir.
 * @param {string} message Gösterilecek mesaj.
 */
export function showLoadingOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {

        // --- (YENİ) KİLİT STİLLERİNİ SIFIRLAMA ---
        
        // 1. İkonu bul ve spinner'a geri döndür
        // (HTML'de 'i' etiketi olduğunu varsayıyoruz)
        const icon = overlay.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-spinner fa-spin'; // Spinner
            icon.style.fontSize = ''; // Stili sıfırla
            icon.style.marginBottom = ''; // Stili sıfırla
        }

        // 2. Paragrafı bul ve stilleri sıfırla
        const p = overlay.querySelector('p');
        p.textContent = message;
        p.style.wordWrap = '';
        p.style.overflowWrap = '';
        p.style.textAlign = '';
        p.style.padding = '';
        p.style.maxWidth = '';

        // 3. Overlay'i sıfırla (Arka plan, renk, hizalama)
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Siyah
        overlay.style.color = 'white';
        overlay.style.flexDirection = 'column'; // Dikey
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        
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
 * (YENİ FONKSİYON - Mobil Cihazlar İçin Düzeltildi)
 * Kullanıcının erişimini engelleyen bir kilit ekranı gösterir.
 * @param {string} message Engelleme mesajı (örn: "Cihazınız kilitlendi.").
 */
export function showLockoutOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        
        // 1. İkonu bul ve kilide dönüştür
        // (HTML'de 'i' etiketi olduğunu varsayıyoruz)
        const icon = overlay.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-lock'; // Kilit ikonu
            icon.style.fontSize = '40px';
            icon.style.marginBottom = '20px';
        }

        // 2. Paragrafı bul ve KULLANICININ İSTEDİĞİ GİBİ STİLLENDİR
        const p = overlay.querySelector('p');
        p.textContent = message;
        
        p.style.wordWrap = 'break-word';        // Satır atlamayı aç (taşmayı önler)
        p.style.overflowWrap = 'break-word';  // Satır atlamayı aç (taşmayı önler)
        p.style.textAlign = 'center';       // Metni ortala
        p.style.padding = '0 20px';         // **İSTEĞİNİZ: Sağdan ve soldan boşluk**
        p.style.maxWidth = '90%';         // Ekranın %90'ını kapla (taşmayı önler)

        // 3. Overlay'i ayarla (Arka plan, renk, hizalama)
        overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.7)'; // Kırmızı
        overlay.style.color = 'white';
        overlay.style.flexDirection = 'column'; // Dikey
        overlay.style.justifyContent = 'center'; // Dikeyde ortala
        overlay.style.alignItems = 'center'; // Yatayda ortala
        
        overlay.style.display = 'flex';
        overlay.style.zIndex = '2000'; // En üstte
    }
}