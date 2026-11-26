import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    // `pnpm dev:api` levanta el Worker en 8788. Se conserva el Host
    // para que el ingreso funcione en el origen del front.
    proxy: { '/api': { target: 'http://127.0.0.1:8788', changeOrigin: false } },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mi plan de comidas',
        short_name: 'Mi plan',
        description: 'Seguimiento diario del plan nutricional',
        lang: 'es-AR',
        display: 'standalone',
        theme_color: '#f6f1e9',
        background_color: '#f6f1e9',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Incluye las fuentes para que funcionen offline.
        globPatterns: ['**/*.{js,css,html,woff2,svg,png}'],
        // /api/* siempre va a la red (Worker e ingreso con Google).
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
})
