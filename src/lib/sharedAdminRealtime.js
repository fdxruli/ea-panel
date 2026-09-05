/**
 * Canales Realtime compartidos por tabla para el admin.
 *
 * Cada tabla obtiene un único canal mientras tenga listeners activos.
 * Esto evita que una página que solo necesita, por ejemplo, `orders`,
 * mantenga suscripciones CDC para todas las tablas administrativas.
 *
 * @module sharedAdminRealtime
 */

import { supabase } from './supabaseClient';

// tableName -> { channel, listeners }
const tableChannels = new Map();

const ADMIN_TABLES = new Set([
  'orders',
  'order_items',
  'products',
  'customers',
  'categories',
  'product_images',
  'discounts',
  'special_prices',
  'ingredients',
  'product_recipes',
  'business_hours',
  'business_exceptions',
  'admins',
  'terms_and_conditions',
  'referral_levels',
  'settings',
  'customer_addresses'
]);

const createTableChannel = (tableName) => {
  const channel = supabase.channel(`shared-admin-${tableName}`);

  channel
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: tableName },
      (payload) => {
        const entry = tableChannels.get(tableName);
        if (!entry) return;

        entry.listeners.forEach((callback) => {
          try {
            callback(payload);
          } catch (error) {
            console.error(`[Realtime] Error en listener de ${tableName}:`, error);
          }
        });
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Canal compartido activo: ${tableName}`);
      } else if (status === 'CHANNEL_ERROR') {
        console.error(`[Realtime] Error en canal compartido: ${tableName}`);
      }
    });

  return channel;
};

/**
 * Suscribe un callback a cambios en una tabla específica.
 *
 * @param {string} tableName
 * @param {function} callback
 * @returns {function} Función idempotente para desuscribirse.
 */
export const subscribeToTableChanges = (tableName, callback) => {
  if (!ADMIN_TABLES.has(tableName)) {
    console.warn(`[Realtime] Tabla no permitida: ${tableName}`);
    return () => {};
  }

  if (typeof callback !== 'function') {
    console.warn(`[Realtime] Callback inválido para ${tableName}`);
    return () => {};
  }

  let entry = tableChannels.get(tableName);

  if (!entry) {
    entry = {
      channel: createTableChannel(tableName),
      listeners: new Set(),
    };
    tableChannels.set(tableName, entry);
  }

  entry.listeners.add(callback);

  let active = true;

  return () => {
    if (!active) return;
    active = false;

    const current = tableChannels.get(tableName);
    if (!current) return;

    current.listeners.delete(callback);

    if (current.listeners.size === 0) {
      tableChannels.delete(tableName);
      supabase.removeChannel(current.channel);
      console.log(`[Realtime] Canal compartido cerrado: ${tableName}`);
    }
  };
};

/**
 * Suscribe el mismo callback a múltiples tablas.
 *
 * @param {string[]} tableNames
 * @param {function} callback
 * @returns {function} Función idempotente para desuscribirse de todas.
 */
export const subscribeToTables = (tableNames, callback) => {
  const unsubscribers = tableNames.map((tableName) =>
    subscribeToTableChanges(tableName, callback)
  );

  let active = true;

  return () => {
    if (!active) return;
    active = false;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
  };
};

/**
 * Obtiene el estado actual de los canales compartidos.
 */
export const getRealtimeStatus = () => ({
  isConnected: tableChannels.size > 0,
  listenerCount: Array.from(tableChannels.values()).reduce(
    (total, entry) => total + entry.listeners.size,
    0
  ),
  subscribedTables: Array.from(tableChannels.keys()),
});

/**
 * Fuerza el cierre de todos los canales compartidos.
 */
export const disconnectSharedRealtime = () => {
  tableChannels.forEach(({ channel }) => {
    supabase.removeChannel(channel);
  });

  tableChannels.clear();
  console.log('[Realtime] Canales compartidos desconectados forzosamente');
};
