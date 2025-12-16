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
      
      // Configuración de injectManifest
      injectManifest: {
        // Patrones de archivos a incluir en el precache
        globPatterns: [
          '**/*.{js,css,html,ico,png,svg,woff,woff2,ttf,eot}',
          // Incluir ambos manifiestos en el precache
          '**/manifest-*.json'
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
      
      // Workbox para sourcemaps (opcional, útil para debugging)
      workbox: {
        sourcemap: true,
      },
      
    }),
  ],
});
