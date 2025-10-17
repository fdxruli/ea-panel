import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr(),
    VitePWA({
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,gif}'],
      },
      srcDir: 'src', // Directorio donde está nuestro sw.js
      filename: 'sw.js', // Nombre de nuestro archivo de service worker
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        name: 'Entre Alas',
        short_name: 'EntreAlas',
        description: 'El mejor lugar para disfrutar alitas. Pide en línea y disfruta del mejor sabor.',
        theme_color: '#E57373',
        background_color: '#FDFDFD',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        orientation: 'portrait',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
});