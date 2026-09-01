// src/lib/broadcastRealtime.js
import { supabase } from './supabaseClient';

/**
 * Canal singleton para eventos globales de tienda/catálogo.
 */
let storeBroadcastChannel = null;
const storeListeners = new Map();

const ensureStoreChannel = () => {
  if (!storeBroadcastChannel) {
    storeBroadcastChannel = supabase.channel('store-broadcast', {
      config: {
        broadcast: { self: true },
      },
    });

    storeBroadcastChannel.on('broadcast', { event: '*' }, (payload) => {
      const eventName = payload.event;
      const data = payload.payload;

      // Notificar a listeners específicos
      const specificListeners = storeListeners.get(eventName);
      if (specificListeners) {
        specificListeners.forEach((callback) => {
          try {
            callback(data);
          } catch (err) {
            console.error(`[Broadcast] Error en listener para "${eventName}":`, err);
          }
        });
      }

      // Notificar a listeners wildcard ('*')
      const wildcardListeners = storeListeners.get('*');
      if (wildcardListeners) {
        wildcardListeners.forEach((callback) => {
          try {
            callback({ event: eventName, data });
          } catch (err) {
            console.error('[Broadcast] Error en listener wildcard:', err);
          }
        });
      }
    });

    storeBroadcastChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Broadcast] Canal store-broadcast suscrito correctamente.');
      }
    });
  }
  return storeBroadcastChannel;
};

/**
 * Emite un evento broadcast a todos los clientes y administradores conectados.
 */
export const broadcastStoreChange = (eventName, payload = {}) => {
  const channel = ensureStoreChannel();
  try {
    channel.send({
      type: 'broadcast',
      event: eventName,
      payload: { ...payload, timestamp: Date.now() },
    });
    console.log(`[Broadcast] Evento emitido: "${eventName}"`, payload);
  } catch (err) {
    console.error(`[Broadcast] Error enviando evento "${eventName}":`, err);
  }
};

/**
 * Suscribe un callback a eventos broadcast de tienda.
 */
export const subscribeToStoreBroadcast = (eventName, callback) => {
  ensureStoreChannel();

  if (!storeListeners.has(eventName)) {
    storeListeners.set(eventName, new Set());
  }
  storeListeners.get(eventName).add(callback);

  return () => {
    const listeners = storeListeners.get(eventName);
    if (listeners) {
      listeners.delete(callback);
      if (listeners.size === 0) {
        storeListeners.delete(eventName);
      }
    }
  };
};

/**
 * Canales dedicados por código de orden para invitados y clientes.
 */
const orderChannels = new Map();

/**
 * Emite un cambio de estado de pedido directamente al canal del pedido.
 */
export const broadcastOrderUpdate = (orderCode, orderData = {}) => {
  if (!orderCode) return;

  const channelName = `order-updates:${orderCode}`;
  let channel = orderChannels.get(orderCode);

  if (!channel) {
    channel = supabase.channel(channelName, {
      config: { broadcast: { self: true } },
    });
    orderChannels.set(orderCode, channel);
    channel.subscribe();
  }

  try {
    channel.send({
      type: 'broadcast',
      event: 'status_changed',
      payload: { orderCode, ...orderData, timestamp: Date.now() },
    });
    console.log(`[Broadcast] Actualización de pedido emitida para "${orderCode}":`, orderData);
  } catch (err) {
    console.error(`[Broadcast] Error enviando actualización de pedido "${orderCode}":`, err);
  }
};

/**
 * Suscribe la vista de detalle de pedido a actualizaciones directas por Broadcast.
 */
export const subscribeToOrderBroadcast = (orderCode, callback) => {
  if (!orderCode) return () => {};

  const channelName = `order-updates:${orderCode}`;
  const channel = supabase.channel(channelName, {
    config: { broadcast: { self: false } },
  });

  channel
    .on('broadcast', { event: 'status_changed' }, (payload) => {
      console.log(`[Broadcast] Actualización recibida para pedido "${orderCode}":`, payload);
      if (payload?.payload) {
        callback(payload.payload);
      }
    })
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
