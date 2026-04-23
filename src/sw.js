// src/sw.js — App Shell + Graceful Degradation
// Estrategia: injectManifest (control total sobre Workbox)

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import {
  NetworkFirst,
  StaleWhileRevalidate,
  CacheFirst,
} from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import {
  firebaseWebConfig,
  getNotificationDisplayFromPayload,
  DEFAULT_NOTIFICATION_URL,
} from './lib/firebaseMessagingConfig';

// ─── Constantes de nombres de caché ───────────────────────────────────────────
const CACHE_NAMES = {
  SHELL: 'app-shell-v1',        // HTML/CSS/JS — App Shell
  SUPABASE_DATA: 'supabase-data-v1',    // REST API (menú, categorías, etc.)
  SUPABASE_STORAGE: 'supabase-storage-v1', // Imágenes del menú en Storage
  IMAGES: 'local-images-v1',     // Imágenes estáticas del bundle
  MANIFESTS: 'manifests-v1',        // manifest-client.json, manifest-admin.json
  ADMIN: 'admin-pages-v1',      // Rutas del panel de administración
  CLIENT_PAGES: 'client-pages-v1',     // Rutas del cliente (navegación)
};

// ─── Dominio de Supabase (inyectado en build, disponible en SW via injectManifest) ─
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
// Extraer solo el hostname para las comparaciones (ej: "xyzabc.supabase.co")
const SUPABASE_HOST = SUPABASE_URL
  ? new URL(SUPABASE_URL).hostname
  : null;

const getUrlToOpen = (notification) => {
  const rawData = notification?.data;

  if (rawData?.url) {
    return rawData.url;
  }

  if (rawData?.FCM_MSG?.data?.url) {
    return rawData.FCM_MSG.data.url;
  }

  if (rawData?.FCM_MSG?.fcmOptions?.link) {
    return rawData.FCM_MSG.fcmOptions.link;
  }

  if (rawData?.FCM_MSG?.notification?.click_action) {
    return rawData.FCM_MSG.notification.click_action;
  }

  return DEFAULT_NOTIFICATION_URL;
};

const firebaseApp = initializeApp(firebaseWebConfig);
const messaging = getMessaging(firebaseApp);

// ─── Lifecycle ────────────────────────────────────────────────────────────────

// Limpiar cachés de versiones anteriores automáticamente
cleanupOutdatedCaches();

self.addEventListener('install', () => {
  // No llamamos self.skipWaiting() aquí intencionalmente.
  // Con registerType: 'prompt', el SW espera en 'waiting' hasta que
  // el usuario acepte vía ReloadPrompt → updateServiceWorker(true).
  // Esto previene el "App Zombie" (cliente en caché vieja sin saberlo).
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clientsClaim());
});

// ─── Escuchar orden de actualización manual ───────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ─── Notificaciones Push (click) ──────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(getUrlToOpen(event.notification), self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === targetUrl && 'focus' in client) {
            return client.focus();
          }
        }

        if (clients.openWindow) {
          return clients.openWindow(targetUrl);
        }

        return undefined;
      })
  );
});

onBackgroundMessage(messaging, async (payload) => {
  const notificationDisplay = getNotificationDisplayFromPayload(payload);
  const existingNotifications = await self.registration.getNotifications({
    tag: notificationDisplay.options.tag,
  });

  existingNotifications.forEach((notification) => notification.close());

  await self.registration.showNotification(
    notificationDisplay.title,
    notificationDisplay.options
  );
});

// ─── Precache del App Shell ───────────────────────────────────────────────────
// Vite-plugin-pwa inyecta aquí el manifiesto de precache con todos los
// assets del bundle (HTML, CSS, JS, imágenes locales, fuentes).
// Estrategia implícita: CacheFirst (es un precache con revisión de hash).
precacheAndRoute(self.__WB_MANIFEST || []);


// ═══════════════════════════════════════════════════════════════════════════════
//  ESTRATEGIAS DE CACHÉ EN RUNTIME
// ═══════════════════════════════════════════════════════════════════════════════

// ─── 1. SUPABASE REST API ─────────────────────────────────────────────────────
// Cubre: menú (productos), categorías, horarios, configuraciones, etc.
// Estrategia: NetworkFirst con timeout 8s → fallback a caché guardada.
// Si hay red → sirve datos frescos y actualiza caché.
// Si no hay red → sirve la última versión guardada del menú.
// No cacheamos /auth/v1 para evitar falsos positivos del health check.
// TTL: 24 horas | Max entradas: 60 (para no explotar el almacenamiento)
if (SUPABASE_HOST) {
  registerRoute(
    ({ url }) =>
      url.hostname === SUPABASE_HOST &&
      url.pathname.startsWith('/rest/v1/'),
    new NetworkFirst({
      cacheName: CACHE_NAMES.SUPABASE_DATA,
      networkTimeoutSeconds: 8,
      plugins: [
        // Solo cachear respuestas HTTP 200 OK
        new CacheableResponsePlugin({ statuses: [200] }),
        // Máximo 60 entradas, expiran a las 24 horas
        new ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 24 * 60 * 60, // 24 horas
          purgeOnQuotaError: true,
        }),
      ],
    })
  );
}

// ─── 2. SUPABASE STORAGE (imágenes del menú) ──────────────────────────────────
// Cubre: fotos de productos almacenadas en Supabase Storage.
// Estrategia: CacheFirst — las imágenes del menú cambian raramente.
// Si está en caché → sirve instantáneamente (sin red).
// Si no está → va a la red, guarda en caché, responde.
// TTL: 7 días | Max entradas: 200 imágenes
if (SUPABASE_HOST) {
  registerRoute(
    ({ url }) =>
      url.hostname === SUPABASE_HOST &&
      url.pathname.startsWith('/storage/v1/'),
    new CacheFirst({
      cacheName: CACHE_NAMES.SUPABASE_STORAGE,
      plugins: [
        new CacheableResponsePlugin({ statuses: [200] }),
        new ExpirationPlugin({
          maxEntries: 200,
          maxAgeSeconds: 7 * 24 * 60 * 60, // 7 días
          purgeOnQuotaError: true,
        }),
      ],
    })
  );
}

// ─── 3. IMÁGENES LOCALES (bundle / assets estáticos) ─────────────────────────
// Cubre: iconos, placeholders, logos incluidos en el bundle.
// Estrategia: StaleWhileRevalidate — sirve desde caché inmediatamente,
// actualiza en background para la próxima visita.
// TTL: 30 días | Max entradas: 60
registerRoute(
  ({ request, url }) =>
    request.destination === 'image' &&
    // Excluir imágenes de Supabase (ya tienen su propia ruta)
    (!SUPABASE_HOST || url.hostname !== SUPABASE_HOST),
  new StaleWhileRevalidate({
    cacheName: CACHE_NAMES.IMAGES,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 días
        purgeOnQuotaError: true,
      }),
    ],
  })
);

// ─── 4. MANIFESTS PWA (client / admin) ───────────────────────────────────────
// Estrategia: NetworkFirst — los manifiestos deben estar siempre actualizados.
registerRoute(
  ({ url }) =>
    url.pathname.endsWith('manifest-client.json') ||
    url.pathname.endsWith('manifest-admin.json'),
  new NetworkFirst({
    cacheName: CACHE_NAMES.MANIFESTS,
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 5, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);

// ─── 5. RUTAS DEL PANEL DE ADMINISTRACIÓN ────────────────────────────────────
// Estrategia: NetworkFirst estricto — el admin SIEMPRE debe tener datos frescos.
// Solo cachea si la respuesta es 200 OK. Sin fallback offline intencionado.
registerRoute(
  ({ url, request }) =>
    request.mode === 'navigate' && url.pathname.startsWith('/admin'),
  new NetworkFirst({
    cacheName: CACHE_NAMES.ADMIN,
    networkTimeoutSeconds: 5,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 }), // 1 hora
    ],
  })
);

// ─── 6. RUTAS DEL CLIENTE (App Shell Navigation) ─────────────────────────────
// Cubre: /, /mis-pedidos, /mi-perfil, /mi-actividad, /terminos, etc.
// Estrategia: NetworkFirst con 7s timeout → fallback al App Shell cacheado.
// Si falla la red, el precache sirve el index.html y React Router
// maneja el routing en el cliente. Los datos del menú vienen de la
// caché de Supabase (ruta #1 arriba).
registerRoute(
  ({ url, request }) =>
    request.mode === 'navigate' &&
    !url.pathname.startsWith('/admin'),
  new NetworkFirst({
    cacheName: CACHE_NAMES.CLIENT_PAGES,
    networkTimeoutSeconds: 7,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 24 * 60 * 60 }),
    ],
  })
);
