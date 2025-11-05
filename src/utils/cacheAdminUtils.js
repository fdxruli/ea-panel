/* src/utils/cacheAdminUtils.js */
import { Mutex } from 'async-mutex';

// Prefijo para claves en sessionStorage
const CACHE_PREFIX = 'admin_cache:';

// Mutex (SOLO para operaciones de escritura y limpieza masiva)
const storageMutex = new Mutex();

/**
 * Encuentra y elimina la entrada de caché más antigua (menor timestamp)
 * del sessionStorage para liberar espacio.
 * @returns {boolean} - True si una entrada fue eliminada, false si no.
 */
const evictOldestEntry = () => {
    let oldestKey = null;
    let oldestTimestamp = Infinity;

    try {
        const keys = Object.keys(sessionStorage).filter(k => k.startsWith(CACHE_PREFIX));

        for (const key of keys) {
            try {
                const item = JSON.parse(sessionStorage.getItem(key));
                // Validar que el timestamp sea un número antes de comparar
                if (item && typeof item.timestamp === 'number' && item.timestamp < oldestTimestamp) {
                    oldestTimestamp = item.timestamp;
                    oldestKey = key;
                }
            } catch (e) {
                // --- MEJORA (PUNTO 5) ---
                // Si falla el parseo, la entrada está corrupta. Eliminarla de forma segura.
                console.warn(`[CacheAdmin] Eliminando entrada corrupta: ${key}`);
                try {
                    sessionStorage.removeItem(key);
                } catch (removeError) {
                    console.error(`[CacheAdmin] No se pudo eliminar la entrada corrupta "${key}":`, removeError);
                }
                // --- FIN MEJORA ---
            }
        }

        if (oldestKey) {
            console.warn(`[CacheAdmin] Quota llena. Eliminando la entrada más antigua: ${oldestKey}`);
            sessionStorage.removeItem(oldestKey);
            return true; // Evicción exitosa
        }
        
    } catch (error) {
         console.error(`[CacheAdmin] Error durante la evicción de caché:`, error);
    }
    
    return false; // No se pudo eliminar nada
};


/**
 * Comprueba si una marca de tiempo ha expirado según un TTL (Time To Live).
 */
export const isExpired = (timestamp, ttl) => {
    if (!timestamp) return true;
    if (!ttl) return false;
    return Date.now() - timestamp > ttl;
};

/**
 * Prepara datos para sessionStorage (serialización).
 */
export const serializeForStorage = (entry) => {
    try {
        return JSON.stringify(entry);
    } catch (error) {
        console.error(`[CacheAdmin] Error al serializar la clave "${entry.key}":`, error);
        return null;
    }
};

/**
 * Recupera datos de sessionStorage (deserialización).
 */
export const deserializeFromStorage = (key) => {
    try {
        const item = sessionStorage.getItem(CACHE_PREFIX + key);
        if (!item) return null;
        
        const entry = JSON.parse(item);
        
        // --- MEJORA (PUNTO 3) ---
        // Validación robusta
        if (
            typeof entry === 'object' && 
            entry !== null && 
            'data' in entry && 
            'timestamp' in entry &&
            typeof entry.timestamp === 'number' &&
            entry.timestamp > 0
        ) {
            return entry;
        }
        // --- FIN MEJORA ---
        
        console.warn(`[CacheAdmin] La entrada de caché "${key}" está corrupta o tiene un formato inválido. Descartando.`);
        removeStorageItem(key); // Llama a la versión síncrona
        return null;
    } catch (error) {
        console.error(`[CacheAdmin] Error al deserializar la clave "${key}":`, error);
        removeStorageItem(key); // Llama a la versión síncrona
        return null;
    }
};

/**
 * Guarda de forma segura en sessionStorage, con reintento y evicción.
 */
export const setStorageItem = async (key, serializedData) => {
    if (!serializedData) return;

    const release = await storageMutex.acquire();
    try {
        // Intento 1
        sessionStorage.setItem(CACHE_PREFIX + key, serializedData);
    } catch (error) {
        // --- MEJORA (PUNTO 2) ---
        if (error.name === 'QuotaExceededError') {
            console.warn(`[CacheAdmin] sessionStorage está lleno. Intentando limpiar la entrada más antigua...`);
            
            const evicted = evictOldestEntry(); // Síncrono

            if (evicted) {
                try {
                    // 2. Reintentar guardar
                    console.log(`[CacheAdmin] Reintentando guardar: ${key}`);
                    sessionStorage.setItem(CACHE_PREFIX + key, serializedData);
                } catch (retryError) {
                    console.error(`[CacheAdmin] Falló el reintento de guardar "${key}" después de la evicción:`, retryError);
                }
            } else {
                 console.error(`[CacheAdmin] Quota excedida, pero no se pudo eliminar ninguna entrada antigua para liberar espacio.`);
            }

        } else {
            console.error(`[CacheAdmin] Error al guardar en sessionStorage "${key}":`, error);
        }
        // --- FIN MEJORA ---
    } finally {
        release();
    }
};

/**
 * Elimina de forma síncrona de sessionStorage.
 */
// --- MEJORA (PUNTO 3) ---
export const removeStorageItem = (key) => {
    try {
        sessionStorage.removeItem(CACHE_PREFIX + key);
    } catch (error) {
        console.error(`[CacheAdmin] Error al eliminar de sessionStorage "${key}":`, error);
    }
};
// --- FIN MEJORA ---

/**
 * Limpia todas las entradas del caché del admin en sessionStorage (esta SÍ usa mutex).
 */
export const clearStorage = async () => {
     const release = await storageMutex.acquire();
    try {
        Object.keys(sessionStorage)
            .filter(key => key.startsWith(CACHE_PREFIX))
            .forEach(key => sessionStorage.removeItem(key)); // Síncrono, pero dentro del mutex
    } catch (error) {
         console.error(`[CacheAdmin] Error al limpiar sessionStorage:`, error);
    } finally {
        release();
    }
};


/**
 * Devuelve un nuevo objeto de caché solo con las entradas que no han expirado.
 */
export const cleanupExpiredEntries = (cache) => {
    const now = Date.now();
    const nextCache = {};
    let entriesCleaned = 0;

    for (const key in cache) {
        const entry = cache[key];
        if (entry.ttl && (now - entry.timestamp > entry.ttl)) {
            // --- MEJORA (PUNTO 3) ---
            removeStorageItem(key); // Llama a la versión síncrona
            entriesCleaned++;
        } else {
            nextCache[key] = entry;
        }
    }
    
    if (entriesCleaned > 0) {
         console.log(`[CacheAdmin] Limpieza automática: ${entriesCleaned} entrada(s) expirada(s) eliminada(s).`);
    }
    return nextCache;
};

/**
 * Genera una clave de caché consistente y robusta.
 */
// --- MEJORA (PUNTO 1 y 4) ---
export const generateKey = (base, params) => {
    if (!params) return base;
    if (typeof params === 'string' || typeof params === 'number') {
        return `${base}:${params}`;
    }

    // Ordenar keys alfabéticamente para crear una clave estable
    const sortedKeys = Object.keys(params).sort();
    
    const sortedParams = sortedKeys
        .map(key => {
            const value = params[key];
            
            // Serializar según tipo para evitar colisiones
            if (value === null) return `${key}=null`;
            if (value === undefined) return `${key}=undefined`;
            if (Array.isArray(value)) return `${key}=[${value.join(',')}]`; // Simple serialización de array
            
            if (typeof value === 'object' && value !== null) {
                try {
                    return `${key}=${JSON.stringify(value)}`;
                } catch (e) {
                    return `${key}=[ObjectError]`;
                }
            }
                        
            return `${key}=${value}`; // Primitivos (string, number, boolean)
        })
        .join(':');
            
    return `${base}:${sortedParams}`;
};
// --- FIN MEJORA ---