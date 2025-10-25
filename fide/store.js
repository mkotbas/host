import * as state from './state.js';
import { loadReportForStore } from './api.js';
import { loadReportUI, resetForm, updateFormInteractivity } from './ui.js';

/**
 * Filtrelenmiş bayi listesini arama sonuçları alanında gösterir.
 * @param {Array} stores Gösterilecek bayi nesneleri dizisi.
 */
export function displayStores(stores) {
    const storeListDiv = document.getElementById('store-list');
    storeListDiv.innerHTML = '';
    stores.forEach(store => {
        const item = document.createElement('div');
        item.className = 'store-item';
        
        let displayName = store.bayiAdi;
        if (displayName && displayName.length > 20) {
            displayName = displayName.substring(0, 20) + '...';
        }
        
        item.textContent = `${displayName} (${store.bayiKodu})`;
        item.dataset.bayiKodu = store.bayiKodu;
        item.addEventListener('click', () => {
            selectStore(store);
        });
        storeListDiv.appendChild(item);
    });
}

/**
 * Bir bayiyi denetim için seçer, form durumunu günceller ve varsa eski raporunu yükler.
 * @param {object} store Seçilen bayi nesnesi.
 * @param {boolean} loadSavedData Kayıtlı rapor verisi yüklensin mi?
 */
export async function selectStore(store, loadSavedData = true) {
    if (state.auditedThisMonth.includes(String(store.bayiKodu))) {
        const proceed = confirm(
            `UYARI: Bu bayi (${store.bayiAdi} - ${store.bayiKodu}) bu ay içinde zaten denetlenmiş.\n\n` +
            `Rapora devam edebilirsiniz ancak bu işlem aylık denetim sayınızı ARTTIRMAYACAKTIR.\n\n` +
            `Yine de devam etmek istiyor musunuz?`
        );
        if (!proceed) {
            return; 
        }
    }

    // Arayüzdeki seçimi güncelle
    document.querySelectorAll('.store-item').forEach(i => i.classList.remove('selected'));
    const storeItem = document.querySelector(`.store-item[data-bayi-kodu="${store.bayiKodu}"]`);
    if (storeItem) storeItem.classList.add('selected');
    
    // State'i güncelle
    state.setSelectedStore({ bayiKodu: store.bayiKodu, bayiAdi: store.bayiAdi });
    
    const searchInput = document.getElementById('store-search-input');
    let shortBayiAdi = store.bayiAdi.length > 20 ? store.bayiAdi.substring(0, 20) + '...' : store.bayiAdi;
    searchInput.value = `${store.bayiKodu} - ${shortBayiAdi}`;
    
    document.getElementById('store-list').innerHTML = '';
    document.getElementById('store-list').style.display = 'none';
    
    if (loadSavedData) {
        // API modülünden raporu yükle
        const reportData = await loadReportForStore(store.bayiKodu);
        if (reportData) {
            // UI modülü ile formu doldur
            loadReportUI(reportData);
        } else {
            // Rapor yoksa formu sıfırla
            resetForm();
        }
    } else {
        resetForm();
    }
    
    updateFormInteractivity(true); 
}