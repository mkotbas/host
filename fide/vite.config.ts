import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

export default defineConfig({
  root: 'src',
  base: './',

  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@modules': resolve(__dirname, 'src/modules'),
      '@styles': resolve(__dirname, 'src/styles'),
    },
  },

  build: {
    outDir: '../dist',
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/fide.html'),
        admin: resolve(__dirname, 'src/admin/admin.html'),
      },
      output: {
        manualChunks: {
          pocketbase: ['pocketbase'],
          xlsx: ['xlsx'],
        },
      },
    },
  },

  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cdnjs\.cloudflare\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'cdn-cache',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: 'FiDe Denetim Sistemi',
        short_name: 'FiDe',
        description: 'FiDe Bayi Denetim Yönetim Sistemi',
        theme_color: '#cc0000',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          { src: 'assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],

  server: {
    port: 3000,
    open: '/fide.html',
  },
});
