import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Kodları çirkinleştirme (obfuscation) ve sıkıştırma (minification)
    // 'terser' varsayılan olarak JS kodlarınızı okunaksız hale getirir.
    minify: 'terser',
    terserOptions: {
      compress: {
        // Geliştirme sırasında kullandığınız console.log() mesajlarını
        // son kullanıcıya göstermemek için kaldırır.
        drop_console: true, 
      },
    },
    rollupOptions: {
      // Projenizin iki farklı giriş noktası olduğunu burada belirtiyoruz.
      input: {
        // Ana site (index.html)
        main: 'index.html',
        
        // Yönetim paneli (admin/admin.html)
        admin: 'admin/admin.html'
      }
    }
  }
});