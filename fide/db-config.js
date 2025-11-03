// --- PocketBase Başlatma (Vite / ES6 Modül Uyumlu) ---
// Bu dosya, tüm JavaScript modüllerine merkezi bir bağlantı noktası sağlar.

// PocketBase JavaScript kütüphanesini doğrudan internetten (CDN) projemize dahil ediyoruz.
// Bu satırlar artık HTML dosyalarımızda değil, doğrudan JavaScript içinde yönetilecek.
import PocketBase from 'https://cdn.jsdelivr.net/npm/pocketbase/dist/pocketbase.es.mjs';

// PocketBase'in adresini tanımlıyoruz ve İHRAÇ (export) ediyoruz.
export const POCKETBASE_URL = 'https://melih.zelab.uk/';

// 'pb' adında bir PocketBase istemcisi başlatıp İHRAÇ (export) ediyoruz.
// Artık 'pb' değişkeni global (herkesin erişimine açık) değil,
// ihtiyacı olan modülün 'import { pb } from ...' ile çağırması gereken
// merkezi bir değişkendir.
export const pb = new PocketBase(POCKETBASE_URL);