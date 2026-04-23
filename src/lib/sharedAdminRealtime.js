/**
 * Canal Realtime compartido para todas las páginas del admin.
 * Evita suscripciones duplicadas cuando múltiples componentes/páginas
 * escuchan los mismos cambios en las tablas.
 * 
 * @module sharedAdminRealtime
 */

import { supabase } from './supabaseClient';

// Estado compartido del canal
let sharedChannel = null;
let listenerCount = 0;
const changeListeners = new Map(); // tableName -> Set de callbacks

/**
 * Inicializa el canal compartido si no existe.
 * @private
 */
const ensureChannel = () => {
  if (!sharedChannel) {
    sharedChannel = supabase.channel('shared-admin-changes');
    
    // Suscribirse a cambios en tablas principales
    const tables = ['orders', 'order_items', 'products', 'customers', 'categories', 'product_images'];
    
    tables.forEach(tableName => {
      sharedChannel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: tableName },
        (payload) => {
          // Notificar a todos los listeners de esta tabla
          const listeners = changeListeners.get(tableName);
          if (listeners) {
            listeners.forEach(callback => {
              try {
                callback(payload);
              } catch (error) {
                console.error(`[Realtime] Error en listener de ${tableName}:`, error);
              }
            });
          }
        }
      );
    });

    sharedChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('[Realtime] Canal compartido inicializado correctamente');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('[Realtime] Error en el canal compartido');
      }
    });
  }
};

/**
 * Suscribe un callback a cambios en una tabla específica.
 * 
 * @param {string} tableName - Nombre de la tabla ('orders', 'products', etc.)
 * @param {function} callback - Función a llamar cuando haya cambios
 * @returns {function} Función para desuscribirse
 * 
 * @example
 * const unsubscribe = subscribeToTableChanges('orders', (payload) => {
 *   console.log('Pedido cambiado:', payload);
 * });
 * 
 * // Después, para desuscribirse:
 * unsubscribe();
 */
export const subscribeToTableChanges = (tableName, callback) => {
  ensureChannel();
  
  if (!changeListeners.has(tableName)) {
    changeListeners.set(tableName, new Set());
  }
  
  changeListeners.get(tableName).add(callback);
  listenerCount++;
  
  // Función para desuscribirse
  return () => {
    const listeners = changeListeners.get(tableName);
    if (listeners) {
      listeners.delete(callback);
      
      if (listeners.size === 0) {
        changeListeners.delete(tableName);
      }
    }
    
    listenerCount--;
    
    // Limpiar canal si no hay listeners
    if (listenerCount === 0 && sharedChannel) {
      supabase.removeChannel(sharedChannel);
      sharedChannel = null;
      console.log('[Realtime] Canal compartido cerrado (sin listeners)');
    }
  };
};

/**
 * Suscribe un callback a cambios en múltiples tablas.
 * 
 * @param {string[]} tableNames - Array de nombres de tablas
 * @param {function} callback - Función a llamar cuando haya cambios
 * @returns {function} Función para desuscribirse
 * 
 * @example
 * const unsubscribe = subscribeToTables(['orders', 'order_items'], (payload) => {
 *   console.log('Cambio detectado:', payload.table, payload.eventType);
 * });
 */
export const subscribeToTables = (tableNames, callback) => {
  const unsubscribers = [];
  
  tableNames.forEach(tableName => {
    const unsubscribe = subscribeToTableChanges(tableName, callback);
    unsubscribers.push(unsubscribe);
  });
  
  // Función para desuscribirse de todas las tablas
  return () => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
};

/**
 * Obtiene el estado actual del canal compartido.
 * @returns {{ isConnected: boolean, listenerCount: number, subscribedTables: string[] }}
 */
export const getRealtimeStatus = () => ({
  isConnected: sharedChannel !== null,
  listenerCount,
  subscribedTables: Array.from(changeListeners.keys())
});

/**
 * Fuerza el cierre del canal compartido.
 * Útil para cleanup en logout o cuando se sabe que no se usará más.
 */
export const disconnectSharedRealtime = () => {
  if (sharedChannel) {
    supabase.removeChannel(sharedChannel);
    sharedChannel = null;
    changeListeners.clear();
    listenerCount = 0;
    console.log('[Realtime] Canal compartido desconectado forzosamente');
  }
};
