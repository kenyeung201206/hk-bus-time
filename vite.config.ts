/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'HK Bus Time 巴士到站',
        short_name: '巴士到站',
        description: '冇廣告嘅九巴、城巴到站時間',
        lang: 'zh-HK',
        start_url: './#/fav',
        display: 'standalone',
        background_color: '#fff4f8',
        theme_color: '#ff7eb6',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: '我的巴士', url: './#/fav' },
          { name: '搵路線', url: './#/trip' },
          { name: '附近', url: './#/nearby' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        runtimeCaching: [
          {
            urlPattern: /bus-data\.json/,
            // network first so the 7-day age check sees the newest deployed snapshot
            handler: 'NetworkFirst',
            options: { cacheName: 'bus-data', networkTimeoutSeconds: 8 },
          },
          {
            // Cantonese reminder clips: cached the first time they're fetched
            urlPattern: /\/voice\/.+\.mp3$/,
            handler: 'CacheFirst',
            options: { cacheName: 'voice', expiration: { maxEntries: 200 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 365 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
});
