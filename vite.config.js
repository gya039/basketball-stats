import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // use our existing public/manifest.webmanifest
      manifest: false,
      workbox: {
        // cache all app shell assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        // SPA fallback — any navigation request serves index.html from cache
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // never cache Supabase API calls — always go to network
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            // Google Fonts — cache on first use
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-stylesheets' },
          },
        ],
      },
    }),
  ],
})
