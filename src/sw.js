// src/sw.js - Versión Original con Pequeñas Mejoras Sugeridas

import { precacheAndRoute } from 'workbox-precaching';

// Añadir fallback por si acaso __WB_MANIFEST no está definido
precacheAndRoute(self.__WB_MANIFEST || []);

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');
  // Loguear datos crudos para depuración
  console.log('[Service Worker] Push data (raw):', event.data?.text());

  // Verificar si hay datos en el evento push
  if (!event.data) {
    console.error('[Service Worker] Push event but no data');
    return; // Salir si no hay datos
  }

  try {
    // Intentar parsear los datos como JSON
    const data = event.data.json();
    console.log('[Service Worker] Push data parsed:', data);

    // Usar valores por defecto si title o body faltan
    const title = data.title || 'Nueva Notificación'; // Título por defecto
    const body = data.body || 'Tienes una actualización.'; // Cuerpo por defecto

    // Ajustar cómo se lee la URL para que coincida con tu backend (data.data.url)
    const urlToOpen = data.data?.url || data.url || '/'; // Busca en data.data.url, luego data.url, luego fallback a '/'
    console.log('[Service Worker] URL to open:', urlToOpen);

    // Definir las opciones de la notificación
    const options = {
      body: body,
      icon: '/pwa-192x192.png', // Asegúrate que esta ruta sea correcta y accesible
      badge: '/pwa-192x192.png', // Asegúrate que esta ruta sea correcta y accesible
      data: { // Datos asociados a la notificación (para usar en 'notificationclick')
        url: urlToOpen,
      },
      // tag: `notification-${Date.now()}` // Opcional: Descomenta si quieres evitar que notificaciones idénticas se agrupen
    };

    console.log('[Service Worker] Showing notification with title:', title, 'and options:', options);

    // Mostrar la notificación y mantener el SW activo hasta que se complete
    event.waitUntil(
      self.registration.showNotification(title, options)
        .then(() => console.log('[Service Worker] Notification shown successfully.'))
        // Loguear errores de forma más detallada si falla showNotification
        .catch(err => console.error('[Service Worker] Error showing notification:', err.name, err.message))
    );

  } catch (error) {
    // Capturar errores si event.data.json() falla
    console.error('[Service Worker] Error processing push event data (JSON parsing?):', error);
  }
});

self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.');
  event.notification.close(); // Cerrar la notificación al hacer clic

  // Obtener la URL de los datos de la notificación
  const urlToOpen = event.notification.data?.url || '/';
  console.log('[Service Worker] Opening window:', urlToOpen);

  // Abrir la URL correspondiente y mantener el SW activo
  event.waitUntil(
    clients.openWindow(urlToOpen)
      // Capturar errores si falla la apertura de la ventana
      .catch(err => console.error('[Service Worker] Error opening window:', err))
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activate event!');
  // Forzar al SW activado a tomar control inmediato de la página
  event.waitUntil(clients.claim());
});