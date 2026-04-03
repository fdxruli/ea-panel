const EXPIRATION_THRESHOLD = 30 * 24 * 60 * 60 * 1000;
const CACHE_KEY_PREFIXES = ['ea-', 'client:', 'admin:'];

const isExpired = (timestamp, ttl) => {
  if (!timestamp) return true;
  return Date.now() - timestamp > ttl;
};

export const getCache = (key, ttl) => {
  try {
    const cachedItem = localStorage.getItem(key);
    if (!cachedItem) {
      return { data: null, isStale: true };
    }

    const { data, ts } = JSON.parse(cachedItem);
    return { data, isStale: isExpired(ts, ttl) };
  } catch (error) {
    console.error(`Error al leer el cache para la clave "${key}":`, error);
    return { data: null, isStale: true };
  }
};

export const setCache = (key, data) => {
  try {
    const itemToCache = {
      data,
      ts: Date.now(),
    };
    localStorage.setItem(key, JSON.stringify(itemToCache));
  } catch (error) {
    console.error(`Error al guardar en cache para la clave "${key}":`, error);
  }
};

export const cleanupExpiredCache = () => {
    console.log('Running cache cleanup...');
    Object.keys(localStorage).forEach(key => {
        if (CACHE_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
            try {
                const item = JSON.parse(localStorage.getItem(key));
                if (item && item.ts && (Date.now() - item.ts > EXPIRATION_THRESHOLD)) {
                    console.log(`Removing expired cache item: ${key}`);
                    localStorage.removeItem(key);
                }
            } catch (error) {
                console.error(`Error cleaning up cache for key "${key}":`, error);
                localStorage.removeItem(key);
            }
        }
    });
};
