/* src/utils/cacheAdminUtils.js */

// Configuración de IndexedDB para reemplazar sessionStorage
const DB_NAME = 'EAPanelAdminCacheDB';
const STORE_NAME = 'cache_store';
const DB_VERSION = 1;

let dbPromise = null;

const initDB = () => {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }
    return dbPromise;
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
 * Recupera todas las entradas del almacenamiento para la hidratación inicial.
 */
export const getAllStorageItems = async () => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const entries = {};
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    entries[cursor.key] = cursor.value;
                    cursor.continue();
                } else {
                    resolve(entries);
                }
            };
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error(`[CacheAdmin] Error al obtener items de IndexedDB:`, error);
        return {};
    }
};

/**
 * Guarda de forma asíncrona en IndexedDB.
 */
export const setStorageItem = async (key, data) => {
    if (!data) return;
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(data, key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error(`[CacheAdmin] Error al guardar en IndexedDB "${key}":`, error);
    }
};

/**
 * Elimina de forma asíncrona de IndexedDB.
 */
export const removeStorageItem = async (key) => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error(`[CacheAdmin] Error al eliminar de IndexedDB "${key}":`, error);
    }
};

/**
 * Limpia todas las entradas del store en IndexedDB.
 */
export const clearStorage = async () => {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error(`[CacheAdmin] Error al limpiar IndexedDB:`, error);
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
            removeStorageItem(key); // Fire-and-forget asíncrono
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
