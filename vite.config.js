// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    svgr(),
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      
      // ✅ AGREGAR ESTA CONFIGURACIÓN
      injectManifest: {
        // Patrones de archivos a incluir en el precache
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,json,woff,woff2,ttf,eot}'
        ],
        // Archivos grandes que quieres incluir (opcional)
        maximumFileSizeToCacheInBytes: 3000000, // 3MB
        // Directorio de salida (por defecto es 'dist')
        globDirectory: 'dist',
      },

      // Opciones de desarrollo
      devOptions: {
        enabled: true,
        type: 'module',
        navigateFallback: 'index.html',
      },

      // ✅ Agregar workbox para sourcemaps (opcional, útil para debugging)
      workbox: {
        sourcemap: true,
      },

      // Manifest PWA
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
