import { resolve } from 'path'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'

// Bu satır, ES modüllerinde __dirname değişkenini tanımlamamızı sağlar
const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  // Dosya yollarını göreceli ('./assets/' gibi) yapar.
  // Bu, 404 hatasını çözer.
  base: './',
  
  root: __dirname,
  
  build: {
    // Kodları gizlemeyi (değişken adlarını karıştırma dahil) zorunlu kıl.
    // Bu, %100 gizliliği sağlar.
    minify: 'esbuild',
    
    // Gizlenmiş kodların çıkacağı klasörün adı
    outDir: 'dist',
    
    rollupOptions: {
      input: {
        // Ana sayfamız
        main: resolve(__dirname, 'index.html'),
        
        // Admin sayfamız
        admin: resolve(__dirname, 'admin/admin.html')
      }
    }
  }
})