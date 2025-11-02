import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { registerRoute } from 'workbox-routing';
import { NetworkFirst, StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

// Eventos de lifecycle
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activado');
  cleanupOutdatedCaches();
  event.waitUntil(clientsClaim());
});

self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker instalando...');
  self.skipWaiting(); // Activar inmediatamente
});

// Manejo de clicks en notificaciones
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Click en notificación');
  event.notification.close();

  const urlToOpen = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Buscar si ya hay una ventana abierta con esa URL
        for (const client of clientList) {
          if (client.url.includes(urlToOpen) && 'focus' in client) {
            return client.focus();
          }
        }
        // Si no hay ventana abierta, abrir una nueva
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Precache de recursos
precacheAndRoute(self.__WB_MANIFEST || []);

// Configuración de Firebase
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);

// Manejo de notificaciones en background
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

// ===== ESTRATEGIAS DE CACHE DIFERENCIADAS =====

// Rutas de API - NetworkFirst
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkFirst({
    cacheName: 'api-cache',
    networkTimeoutSeconds: 10,
  })
);

// Imágenes - StaleWhileRevalidate
registerRoute(
  ({ request }) => request.destination === 'image',
  new StaleWhileRevalidate({
    cacheName: 'images-cache',
  })
);

// Manifiestos - NetworkFirst (para que siempre estén actualizados)
registerRoute(
  ({ url }) => url.pathname.endsWith('manifest-client.json') ||
    url.pathname.endsWith('manifest-admin.json'),
  new NetworkFirst({
    cacheName: 'manifest-cache',
  })
);

// Estrategia para rutas de admin - NetworkFirst más agresivo
registerRoute(
  ({ url }) => url.pathname.startsWith('/admin'),
  new NetworkFirst({
    cacheName: 'admin-cache',
    networkTimeoutSeconds: 5,
    plugins: [
      {
        cacheWillUpdate: async ({ response }) => {
          // Solo cachear respuestas exitosas
          if (response && response.status === 200) {
            return response;
          }
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
          if (response && response.status === 200) {
            return response;
          }
          return null;
        },
      },
    ],
  })
);
