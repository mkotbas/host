// Bu modül, diğer modüller tarafından ortaklaşa kullanılan
// arayüz (UI) fonksiyonlarını içerir. (Arayüz Departmanı)

/**
 * Ekranda bir modal (popup) pencere gösterir.
 * @param {string} title Pencerenin başlığı (HTML içerebilir).
 * @param {string} body Pencerenin içeriği (HTML içerebilir).
 * @param {string} footer Pencerenin alt kısmı (butonlar vb., HTML içerebilir).
 */
export function showModal(title, body, footer) {
    document.getElementById('modal-title').innerHTML = title;
    document.getElementById('modal-body').innerHTML = body;
    document.getElementById('modal-footer').innerHTML = footer;
    document.getElementById('maintenance-modal').style.display = 'flex';
}

/**
 * Ekranda açık olan modal pencereyi gizler.
 */
export function hideModal() {
    document.getElementById('maintenance-modal').style.display = 'none';
}


/**
 * Firebase bağlantı durumunu ve kullanıcı giriş durumunu yansıtan
 * görsel göstergeyi günceller.
 * @param {boolean} isFirebaseConnected Firebase'e bağlı mı?
 * @param {object} currentUser Aktif kullanıcı nesnesi.
 */
export function updateConnectionIndicator(isFirebaseConnected, currentUser) {
    const statusSwitch = document.getElementById('connection-status-switch');
    const statusText = document.getElementById('connection-status-text');
    const isOnline = isFirebaseConnected && currentUser;
    
    // hideModal() fonksiyonunu, bir modal içindeyken butona tıklandığında
    // global scope'ta erişilebilir yapmak için window nesnesine atıyoruz.
    // Bu, modüler yapının getirdiği bir gerekliliktir.
    window.hideModal = hideModal;
    
    if(!statusSwitch || !statusText) return;

    statusSwitch.classList.toggle('connected', isOnline);
    statusSwitch.classList.toggle('disconnected', !isOnline);
    statusText.textContent = isOnline ? 'Buluta Bağlı' : 'Bağlı Değil';
}