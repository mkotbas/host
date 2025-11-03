import { resolve } from 'path'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  // 1. 404 Hatasını çözmek için dosya yolunu göreceli yap
  base: './',

  root: __dirname,

  build: {
    // 2. %100 Gizlilik için kodları karıştır
    minify: 'esbuild',

    // 3. Çıktı klasörünün adı
    outDir: 'dist',

    rollupOptions: {
      // 4. İki ayrı HTML sayfamız olduğunu belirt
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/admin.html')
      }
    }
  }
})