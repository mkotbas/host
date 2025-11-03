import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    // Build (İnşa) ayarları
    rollupOptions: {
      input: {
        // Burası Vite'e "iki kapı" olduğunu söylediğimiz yerdir
        main: 'index.html',         // 1. Kapı: Ana sayfa
        admin: 'admin/admin.html'   // 2. Kapı: Admin paneli
      }
    },
    // Çıktı klasörünü her seferinde temizle
    emptyOutDir: true,
    // İnşa edilen dosyaların konulacağı klasörün adı
    outDir: 'dist',
  },
  server: {
    // "npm run dev" komutu için geliştirme sunucusu ayarları
    open: true // Sunucu başladığında tarayıcıyı otomatik aç
  }
});