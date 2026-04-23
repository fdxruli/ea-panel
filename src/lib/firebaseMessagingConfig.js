export const firebaseWebConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const DEFAULT_NOTIFICATION_URL = '/mis-pedidos';
export const DEFAULT_NOTIFICATION_ICON = '/pwa-192x192.png';

export const getNotificationUrlFromPayload = (payload) =>
  payload?.data?.url ||
  payload?.fcmOptions?.link ||
  payload?.notification?.click_action ||
  DEFAULT_NOTIFICATION_URL;

export const getNotificationDisplayFromPayload = (payload) => {
  const title = payload?.notification?.title || 'Notificacion';
  const body = payload?.notification?.body || 'Tienes una actualizacion de pedido.';
  const url = getNotificationUrlFromPayload(payload);

  return {
    title,
    body,
    url,
    options: {
      body,
      icon: payload?.notification?.icon || DEFAULT_NOTIFICATION_ICON,
      badge: DEFAULT_NOTIFICATION_ICON,
      data: {
        ...payload?.data,
        url,
      },
      tag: payload?.data?.orderCode
        ? `order-${payload.data.orderCode}`
        : 'customer-notification',
      renotify: false,
    },
  };
};
