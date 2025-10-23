// vite.config.js - CORREGIDO
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import svgr from 'vite-plugin-svgr';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr(), // Para importar SVGs como componentes React
    VitePWA({
      registerType: 'autoUpdate', // Mantiene el Service Worker actualizado
      // === CAMBIOS CLAVE AQUÍ ===
      strategies: 'injectManifest', // 1. Especifica explícitamente la estrategia
      srcDir: 'src',                // 2. Directorio donde está tu sw.js (ya estaba bien)
      filename: 'sw.js',            // 3. Nombre de tu archivo fuente (ya estaba bien)
      // === FIN CAMBIOS CLAVE ===

      // Opcional: Habilita el SW en desarrollo (importante para probar)
      devOptions: {
        enabled: true,
        type: 'module', // Necesario para importaciones ES Module en sw.js
      },

      // El manifest se queda igual
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