import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Con Cloudflare Access el manifest se pide con cookies; sin esto no instala.
      useCredentials: true,
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
        // /api/* siempre va a la red (Functions y login de Access).
        navigateFallbackDenylist: [/^\/api\//, /^\/cdn-cgi\//],
      },
    }),
  ],
})
