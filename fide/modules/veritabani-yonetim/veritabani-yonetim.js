import { showLoadingOverlay, hideLoadingOverlay } from '../../utils.js';

let pbInstance = null;

/**
 * Modülün başlangıç noktası.
 */
export async function initializeVeritabaniYonetimModule(pb) {
    pbInstance = pb;
    
    showLoadingOverlay("Veritabanı modülü hazırlanıyor...");
    
    try {
        if (pbInstance && pbInstance.authStore.isValid) {
            prepareTableContainer(); 
        } else {
            renderAuthError();
        }
    } catch (error) {
        console.error("Modül yükleme hatası:", error);
    } finally {
        hideLoadingOverlay();
    }
}

/**
 * Tabloyu yeni özellikler eklenmesi için hazır hale getirir.
 */
function prepareTableContainer() {
    const tbody = document.querySelector('#tablo-yonetim-tablosu tbody');
    if (tbody) tbody.innerHTML = ''; // Tabloyu tamamen boşalt
}

/**
 * Yetkisiz erişim durumunda uyarı gösterir.
 */
function renderAuthError() {
    const container = document.getElementById('module-container');
    if(container) {
        container.innerHTML = '<p class="auth-error">Bu modülü kullanmak için yönetici girişi yapmalısınız.</p>';
    }
}