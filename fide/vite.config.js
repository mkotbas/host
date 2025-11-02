import { resolve } from 'path'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'

// Bu satır, ES modüllerinde __dirname değişkenini tanımlamamızı sağlar
const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  // Projenin ana klasörü
  root: __dirname,
  build: {
    // Gizlenmiş kodların çıkacağı klasörün adı
    outDir: 'dist',
    rollupOptions: {
      input: {
        // Ana sayfamız
        main: resolve(__dirname, 'index.html'),
        
        // Admin sayfamız (Dokümandaki /admin/admin.html yoluna göre)
        admin: resolve(__dirname, 'admin/admin.html')
      }
    }
  }
})