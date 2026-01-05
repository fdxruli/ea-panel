import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

cleanupOutdatedCaches();
// Eventos de lifecycle (Sin cambios)
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activado');
  event.waitUntil(clientsClaim());
});

self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker instalando...');
  self.skipWaiting();
});

// Manejo de clicks en notificaciones (Sin cambios)
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Click en notificación');
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Precache de recursos (Sin cambios)
precacheAndRoute(self.__WB_MANIFEST || []);

// --- 👇 MODIFICACIÓN IMPORTANTE AQUÍ 👇 ---
// Solo ejecutar el código de Firebase Messaging en PRODUCCIÓN.
// import.meta.env.DEV es 'true' en desarrollo (npm run dev)
// y 'false' en producción (npm run build).
if (!import.meta.env.DEV) {
  console.log('[SW] Modo Producción: Inicializando Firebase Messaging...');
  
  const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
  };

  try {
    const app = initializeApp(firebaseConfig);
    const messaging = getMessaging(app);

    onBackgroundMessage(messaging, (payload) => {
      console.log('[SW] Mensaje FCM recibido:', payload);

      const notificationTitle = payload.notification?.title || 'Nueva Notificación';
      const notificationOptions = {
        body: payload.notification?.body || '',
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: { url: payload.data?.url || '/' },
        tag: 'notification-' + Date.now(),
        requireInteraction: false
      };

      return self.registration.showNotification(notificationTitle, notificationOptions);
    });
  } catch (err) {
    console.warn('[SW] Falló la inicialización de Firebase Messaging en Producción.', err);
  }
} else {
  console.log('[SW] Modo Desarrollo: Omitiendo Firebase Messaging.');
}
// --- 👆 FIN DE LA MODIFICACIÓN 👆 ---

// ===== ESTRATEGIAS DE CACHE (Sin cambios) =====
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({ cacheName: 'api-cache', networkTimeoutSeconds: 10 })
);

registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({ cacheName: 'images-cache' })
);

// ... (resto de las rutas de 'registerRoute' sin cambios) ...
registerRoute(
  ({ url }) => url.pathname.endsWith('manifest-client.json') || url.pathname.endsWith('manifest-admin.json'),
  new NetworkFirst({ cacheName: 'manifest-cache' })
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/admin'),
  new NetworkFirst({
    cacheName: 'admin-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          if (response && response.status === 200) return response;
          return null;
        },
      },
    ],
  })
);

registerRoute(
  ({ url, request }) => {
    return request.mode === 'navigate' &&
      !url.pathname.startsWith('/admin') &&
      !url.pathname.startsWith('/api/');
  },
  new NetworkFirst({
    cacheName: 'client-pages-cache',
    networkTimeoutSeconds: 7,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          if (response && response.status === 200) return response;
          return null;
        },
      },
    ],
  })

);
