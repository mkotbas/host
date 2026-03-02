import PocketBase from 'pocketbase';

// ─── Bağlantı Ayarı ──────────────────────────────────────────────────────────
// PocketBase sunucusunun çalıştığı adresi buradan değiştirin.
const POCKETBASE_URL = 'http://127.0.0.1:8090';

// ─── PocketBase İstemcisi ─────────────────────────────────────────────────────
// Tüm modüller bu tek instance'ı kullanır.
export const pb = new PocketBase(POCKETBASE_URL);

// Otomatik token yenileme — oturum süresi dolduğunda sessizce yeniler.
pb.autoCancellation(false);
