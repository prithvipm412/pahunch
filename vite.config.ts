import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,json,svg,png,mp3}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Pahunch',
        short_name: 'Pahunch',
        theme_color: '#0B1B3F',
        background_color: '#0B1B3F',
        display: 'standalone',
        icons: [
          { src: '/icons/pahunch-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/pahunch-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/pahunch-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
