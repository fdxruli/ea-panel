// src/lib/firebaseConfig.js
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
let messaging = null;

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  messaging = getMessaging(app);
}

// ✅ Función actualizada para usar el service worker existente
export const requestFCMToken = async () => {
  if (!messaging) {
    console.warn('⚠️ Messaging no disponible');
    return null;
  }

  try {
    // Esperar que el service worker esté listo
    const registration = await navigator.serviceWorker.ready;
    console.log('✅ Service Worker listo:', registration);

    // Solicitar permiso
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.warn('⚠️ Permiso denegado');
      return null;
    }

    // ✅ IMPORTANTE: Pasar el registro del service worker a Firebase
    const currentToken = await getToken(messaging, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration // ✅ Usar el SW existente
    });

    if (currentToken) {
      console.log('✅ Token FCM obtenido');
      return currentToken;
    } else {
      console.warn('⚠️ No se pudo obtener token');
      return null;
    }
  } catch (error) {
    console.error('❌ Error obteniendo token:', error);
    return null;
  }
};

// Listener para mensajes en primer plano
export const onForegroundMessage = (callback) => {
  if (!messaging) return;

  onMessage(messaging, (payload) => {
    console.log('📨 Mensaje en primer plano:', payload);
    callback(payload);
  });
};

export { messaging };
