import { resolve } from 'path'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
   --- YENİ EKLENEN SATIR ---
   Dosya yollarını göreceli ('.assets' gibi) yapar.
  base '.', 
   --- YENİ EKLENEN SATIR BİTTİ ---

  root __dirname,
  build {
    outDir 'dist',
    rollupOptions {
      input {
        main resolve(__dirname, 'index.html'),
        admin resolve(__dirname, 'adminadmin.html')
      }
    }
  }
})