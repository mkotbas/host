// --- Genel Yardımcı Fonksiyonlar ---

/**
 * Yükleme ekranını belirtilen bir mesajla gösterir.
 * @param {string} message Gösterilecek mesaj.
 */
export function showLoadingOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
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