import { precacheAndRoute } from 'workbox-precaching';

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.'); // <-- LOG 1: Evento recibido
  console.log('[Service Worker] Push data:', event.data?.text()); // <-- LOG 2: Ver datos crudos (si existen)

  if (!event.data) {
    console.error('[Service Worker] Push event but no data');
    return;
  }

  try {
    const data = event.data.json();
    console.log('[Service Worker] Push data parsed:', data); // <-- LOG 3: Ver datos parseados

    // Verificar que title y body existan
    if (!data.title || !data.body) {
      console.error('[Service Worker] Missing title or body in push data:', data);
      // Opcional: Mostrar una notificación genérica si faltan datos
      // self.registration.showNotification('Notificación', { body: 'Actualización recibida.' });
      return;
    }

    const options = {
      body: data.body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      data: {
        url: data.url || '/', // Usar '/' como fallback si no hay URL
      },
    };

    console.log('[Service Worker] Showing notification with title:', data.title, 'and options:', options); // <-- LOG 4: Antes de mostrar

    // event.waitUntil() asegura que el SW no termine antes de que la notificación se muestre
    event.waitUntil(
      self.registration.showNotification(data.title, options)
        .then(() => console.log('[Service Worker] Notification shown successfully.')) // <-- LOG 5: Éxito
        .catch(err => console.error('[Service Worker] Error showing notification:', err)) // <-- LOG 6: Error al mostrar
    );

  } catch (error) {
    console.error('[Service Worker] Error processing push event data:', error); // <-- LOG 7: Error al parsear JSON
  }
});

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.'); // <-- LOG 8: Click en notificación
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || '/')
  );
});

// Opcional: Añadir un listener activate para asegurar que el SW tome control
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate event!');
  event.waitUntil(clients.claim()); // Fuerza al SW a tomar control inmediatamente
});