import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        // Ana giriş noktası (Denetim Formu)
        main: resolve(__dirname, 'index.html'),
        
        // İkinci giriş noktası (Yönetim Paneli)
        admin: resolve(__dirname, 'admin/admin.html'),
      },
    },
  },
});