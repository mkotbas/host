import { resolve } from 'path';
import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';

// Bu bölüm, ES Modüllerinde klasör yolunu bulmak için gereklidir
const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

export default defineConfig({
  build: {
    // Kodların karmaşıklaşması (minification) için 'terser' kullanılır
    minify: 'terser',
    terserOptions: {
      compress: {
        // Kod çalışırken 'console.log' ile yazdırılan notları kaldırır
        drop_console: true,
      },
    },
    rollupOptions: {
      // Netlify'ın build etmesi gereken HTML dosyalarınız
      // Proje yapınıza göre (index.html ve admin/admin.html) ayarlandı
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/admin.html'),
      },
    },
    // Build edilen kodların konulacağı klasör
    outDir: 'dist',
  },
});