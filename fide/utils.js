// --- Genel Yardımcı Fonksiyonlar (Optimize Edildi) ---

export function showLoadingOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        const icon = overlay.querySelector('i');
        // Reset icon to spinner
        if (icon) icon.className = 'fas fa-spinner fa-spin';
        
        const p = overlay.querySelector('p');
        if(p) p.textContent = message;
        
        // CSS Reset (Stil dosyasından alacak, inline stilleri temizliyoruz)
        overlay.removeAttribute('style'); 
        overlay.style.display = 'flex'; // Sadece display'i açıyoruz
    }
}

export function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}

export function showLockoutOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        const icon = overlay.querySelector('i');
        if (icon) icon.className = 'fas fa-lock'; // Lock icon

        const p = overlay.querySelector('p');
        if(p) p.textContent = message;

        // Stil ayarları (Özel kırmızı arka plan)
        overlay.style.display = 'flex';
        overlay.style.backgroundColor = 'rgba(220, 38, 38, 0.95)'; // Kırmızı
        overlay.style.zIndex = '9999';
    }
}