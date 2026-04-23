import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
} from 'firebase/messaging';
import {
  firebaseWebConfig,
  getNotificationDisplayFromPayload,
} from './firebaseMessagingConfig';

const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseWebConfig);

let messagingSupportPromise = null;
let messagingPromise = null;

const isBrowser = () => typeof window !== 'undefined';

const isStandaloneDisplay = () => {
  if (!isBrowser()) {
    return false;
  }

  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
};

const isAppleMobileDevice = () => {
  if (!isBrowser()) {
    return false;
  }

  const userAgent = window.navigator.userAgent || '';
  const platform = window.navigator.platform || '';
  const touchMac = platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;

  return /iPad|iPhone|iPod/.test(userAgent) || touchMac;
};

const getUnsupportedState = (reason) => ({
  state: 'unsupported',
  reason,
});

const ensureMessagingSupport = () => {
  if (!isBrowser()) {
    return Promise.resolve(false);
  }

  if (!window.isSecureContext) {
    return Promise.resolve(false);
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    return Promise.resolve(false);
  }

  if (isAppleMobileDevice() && !isStandaloneDisplay()) {
    return Promise.resolve(false);
  }

  if (!messagingSupportPromise) {
    messagingSupportPromise = isSupported().catch((error) => {
      console.error('[Notifications] No se pudo verificar el soporte de Firebase Messaging:', error);
      return false;
    });
  }

  return messagingSupportPromise;
};

const getMessagingInstance = () => {
  if (!messagingPromise) {
    messagingPromise = ensureMessagingSupport().then((supported) => {
      if (!supported) {
        return null;
      }

      try {
        return getMessaging(firebaseApp);
      } catch (error) {
        console.error('[Notifications] No se pudo inicializar Messaging:', error);
        return null;
      }
    });
  }

  return messagingPromise;
};

export const getNotificationSupportState = async () => {
  if (!isBrowser()) {
    return getUnsupportedState('Las notificaciones solo estan disponibles en el navegador.');
  }

  if (!window.isSecureContext) {
    return getUnsupportedState('Las notificaciones requieren HTTPS o un entorno local seguro.');
  }

  if (!('Notification' in window)) {
    return getUnsupportedState('Tu navegador no soporta la API de notificaciones.');
  }

  if (!('serviceWorker' in navigator)) {
    return getUnsupportedState('Tu navegador no soporta service workers.');
  }

  if (isAppleMobileDevice() && !isStandaloneDisplay()) {
    return getUnsupportedState(
      'En iPhone y iPad debes instalar la app en la pantalla de inicio para activar notificaciones.'
    );
  }

  const supported = await ensureMessagingSupport();
  if (!supported) {
    return getUnsupportedState(
      'Este navegador no soporta Firebase Cloud Messaging para notificaciones push.'
    );
  }

  if (Notification.permission === 'granted') {
    return {
      state: 'granted',
      reason: '',
    };
  }

  if (Notification.permission === 'denied') {
    return {
      state: 'denied',
      reason: 'Las notificaciones estan bloqueadas. Activalas desde la configuracion del navegador.',
    };
  }

  return {
    state: 'default',
    reason: 'Activa notificaciones para recibir cambios en el estado de tus pedidos.',
  };
};

export const requestBrowserNotificationPermission = async () => {
  const supportState = await getNotificationSupportState();

  if (supportState.state === 'unsupported' || supportState.state === 'denied') {
    return supportState.state;
  }

  try {
    return await Notification.requestPermission();
  } catch (error) {
    console.error('[Notifications] Error solicitando permiso del navegador:', error);
    return 'default';
  }
};

export const requestFCMToken = async () => {
  const messagingInstance = await getMessagingInstance();
  if (!messagingInstance) {
    return null;
  }

  if (Notification.permission !== 'granted') {
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    return await getToken(messagingInstance, {
      vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
  } catch (error) {
    console.error('[Notifications] Error obteniendo token FCM:', error);
    return null;
  }
};

export const deleteFCMRegistration = async () => {
  const messagingInstance = await getMessagingInstance();
  if (!messagingInstance) {
    return false;
  }

  try {
    return await deleteToken(messagingInstance);
  } catch (error) {
    console.error('[Notifications] Error eliminando token FCM:', error);
    return false;
  }
};

export const onForegroundMessage = (callback) => {
  let cancelled = false;
  let unsubscribe = () => {};

  getMessagingInstance()
    .then((messagingInstance) => {
      if (!messagingInstance || cancelled) {
        return;
      }

      unsubscribe = onMessage(messagingInstance, (payload) => {
        callback(payload, getNotificationDisplayFromPayload(payload));
      });

      if (cancelled) {
        unsubscribe();
      }
    })
    .catch((error) => {
      console.error('[Notifications] Error registrando listener en foreground:', error);
    });

  return () => {
    cancelled = true;
    unsubscribe();
  };
};

export { getNotificationDisplayFromPayload };
