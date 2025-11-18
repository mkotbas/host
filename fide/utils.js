// --- Genel Yardımcı Fonksiyonlar ---

/**
 * Yükleme ekranını belirtilen bir mesajla gösterir.
 * @param {string} message Gösterilecek mesaj.
 */
export function showLoadingOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        
        // --- (YENİ) KİLİT STİLLERİNİ SIFIRLAMA ---
        // 'showLockoutOverlay' tarafından eklenen stilleri sıfırlar.
        
        // 1. İkonu bul ve spinner'a geri döndür
        const icon = overlay.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-spinner fa-spin'; // Spinner
            icon.style.fontSize = ''; // Stili sıfırla
            icon.style.marginBottom = ''; // Stili sıfırla
        }

        // 2. Paragrafı bul ve stilleri sıfırla
        const p = overlay.querySelector('p');
        p.textContent = message;
        p.style.textAlign = '';
        p.style.padding = '';
        p.style.maxWidth = '';
        p.style.boxSizing = '';
        p.style.wordWrap = '';
        p.style.overflowWrap = '';
        p.style.width = ''; // (YENİ) Genişlik sıfırlaması

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
 * (YENİ FONKSİYON - Mobil Cihazlar İçin Düzeltildi v2)
 * Kullanıcının erişimini engelleyen bir kilit ekranı gösterir.
 * @param {string} message Engelleme mesajı (örn: "Cihazınız kilitlendi.").
 */
export function showLockoutOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        
        // 1. İkonu bul ve kilide dönüştür
        // (index.html'de <i class="..."> etiketi olduğunu varsayıyoruz)
        const icon = overlay.querySelector('i');
        if (icon) {
            icon.className = 'fas fa-lock'; // Kilit ikonu
            icon.style.fontSize = '40px';
            icon.style.marginBottom = '20px';
        }

        // 2. Paragrafı bul ve KULLANICININ İSTEDİĞİ GİBİ STİLLENDİR
        const p = overlay.querySelector('p');
        p.textContent = message;
        
        // --- METİN ORTALAMA VE TAŞMA DÜZELTMELERİ ---
        p.style.width = '90%';            // Genişliği %90 yap (Ortalamak için)
        p.style.maxWidth = '90%';         // Maksimum genişlik %90
        p.style.textAlign = 'center';       // Bu %90'lık alan içinde metni ortala
        p.style.padding = '0';              // Sağ/sol boşluğu sıfırla (artık 'width' var)
        p.style.boxSizing = 'border-box'; // Genişlik hesaplamasını düzelt
        p.style.wordWrap = 'break-word';  // Satır atlamayı aç (taşmayı önler)
        p.style.overflowWrap = 'break-word'; // Satır atlamayı aç (taşmayı önler)
        // --- BİTTİ ---

        // 3. Overlay'i ayarla (Arka plan, renk, hizalama)
        overlay.style.backgroundColor = 'rgba(255, 0, 0, 0.7)'; // Kırmızı
        overlay.style.color = 'white';
        overlay.style.flexDirection = 'column'; // Dikey (ikon ve metin alt alta)
        overlay.style.justifyContent = 'center'; // Dikeyde ortala
        overlay.style.alignItems = 'center'; // YATAYDA ORTALA (Metin bloğunu ortalar)
        
        overlay.style.display = 'flex';
        overlay.style.zIndex = '2000'; // En üstte
    }
}