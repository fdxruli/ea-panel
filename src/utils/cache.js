// src/utils/cache.js

const EXPIRATION_THRESHOLD = 30 * 24 * 60 * 60 * 1000; // 30 días en milisegundos

/**
 * Comprueba si una marca de tiempo ha expirado según un TTL (Time To Live).
 * @param {number} timestamp - La marca de tiempo en milisegundos.
 * @param {number} ttl - El tiempo de vida en milisegundos.
 * @returns {boolean} - True si ha expirado, false en caso contrario.
 */
const isExpired = (timestamp, ttl) => {
  if (!timestamp) return true;
  return Date.now() - timestamp > ttl;
};

/**
 * Obtiene datos del caché de localStorage.
 * @param {string} key - La clave del caché.
 * @param {number} ttl - El tiempo de vida para determinar si los datos son "stale".
 * @returns {{data: any | null, isStale: boolean}} - El objeto con los datos y un indicador de si están expirados.
 */
export const getCache = (key, ttl) => {
  try {
    const cachedItem = localStorage.getItem(key);
    if (!cachedItem) {
      return { data: null, isStale: true };
    }
    const { data, ts } = JSON.parse(cachedItem);
    return { data, isStale: isExpired(ts, ttl) };
  } catch (error) {
    console.error(`Error al leer el caché para la clave "${key}":`, error);
    return { data: null, isStale: true };
  }
};

/**
 * Guarda datos en el caché de localStorage con una marca de tiempo actual.
 * @param {string} key - La clave del caché.
 * @param {any} data - Los datos a guardar.
 */
export const setCache = (key, data) => {
  try {
    const itemToCache = {
      data,
      ts: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(itemToCache));
  } catch (error) {
    console.error(`Error al guardar en caché para la clave "${key}":`, error);
  }
};

/**
 * Limpia las entradas de caché de localStorage que no han sido accedidas en mucho tiempo.
 */
export const cleanupExpiredCache = () => {
    console.log("Running cache cleanup...");
    Object.keys(localStorage).forEach(key => {
        if (key.startsWith('ea-')) { // Un prefijo común para tus claves de caché
            try {
                const item = JSON.parse(localStorage.getItem(key));
                if (item && item.ts && (Date.now() - item.ts > EXPIRATION_THRESHOLD)) {
                    console.log(`Removing expired cache item: ${key}`);
                    localStorage.removeItem(key);
                }
            } catch (error) {
                console.error(`Error cleaning up cache for key "${key}":`, error);
                localStorage.removeItem(key); // Elimina si está corrupto
            }
        }
    });
};