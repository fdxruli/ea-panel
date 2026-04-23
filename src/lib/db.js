import Dexie from 'dexie';

const CACHE_TABLE_NAME = 'api_caches';

// Configuración de LRU cache
const LRU_MAX_SIZE = 100; // Máximo 100 entradas en memoria
const LRU_TTL_MS = 30 * 60 * 1000; // 30 minutos de vida máxima en caché

/**
 * Implementación simple de LRU (Least Recently Used) cache.
 * Elimina automáticamente las entradas menos usadas cuando se excede el límite.
 */
class LRUCache {
    constructor(maxSize = LRU_MAX_SIZE) {
        this.maxSize = maxSize;
        this.cache = new Map();
    }

    get(key) {
        const item = this.cache.get(key);

        if (!item) {
            return null;
        }

        // Verificar si está expirado
        if (item.expiresAt && Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        // Mover al final (más reciente)
        this.cache.delete(key);
        this.cache.set(key, item);

        return item;
    }

    set(key, value, ttl = LRU_TTL_MS) {
        // Si ya existe, eliminarlo primero para actualizar posición
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }

        // Verificar si necesitamos hacer espacio
        if (this.cache.size >= this.maxSize) {
            // Eliminar el primero (menos reciente)
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
            console.log(`[LRUCache] Evicting "${firstKey}" (max size: ${this.maxSize})`);
        }

        const expiresAt = ttl ? Date.now() + ttl : null;
        this.cache.set(key, { value, expiresAt, timestamp: Date.now() });
    }

    delete(key) {
        return this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    has(key) {
        const item = this.cache.get(key);
        if (!item) return false;

        if (item.expiresAt && Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return false;
        }

        return true;
    }

    get size() {
        return this.cache.size;
    }

    /**
     * Limpia entradas expiradas
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, item] of this.cache.entries()) {
            if (item.expiresAt && now > item.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        if (cleaned > 0) {
            console.log(`[LRUCache] Cleaned ${cleaned} expired entries`);
        }
    }
}

class AppDatabase extends Dexie {
    constructor() {
        super('AppDB');

        // IndexedDB requiere control de versiones estricto.
        // No edites una version ya publicada; agrega una nueva.
        this.version(1).stores({
            products: 'id, category_id, status',
            categories: 'id, status',
            system_cache_metadata: 'key'
        });

        this.version(2).stores({
            api_caches: '&key, scope, expiresAt, updatedAt',
            products: null,
            categories: null,
            system_cache_metadata: null
        });

        this.on('ready', () => console.log('Dexie: Base de datos AppDB abierta y lista.'));
        this.on('populate', () => console.log('Dexie: Base de datos creada o migrada correctamente.'));
    }
}

export const db = new AppDatabase();

// Reemplazar Map con LRU cache
const memoryCache = new LRUCache(LRU_MAX_SIZE);

let isIDBDegraded = false;

// Cleanup periódico de entradas expiradas
setInterval(() => {
    memoryCache.cleanup();
}, 60 * 1000); // Cada minuto

const notifyUIDegradation = (cacheKey, error) => {
    if (isIDBDegraded) return;

    console.error(`[Cache] Fallo critico en IndexedDB para "${cacheKey}".`, error);
    isIDBDegraded = true;

    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('idb-degraded', {
            detail: {
                tableName: CACHE_TABLE_NAME,
                cacheKey,
                message: error?.message || 'Almacenamiento local no disponible por falta de espacio o permisos.'
            }
        }));
    }
};

const isExpired = (expiresAt) => {
    if (expiresAt == null) return false;
    return Date.now() > expiresAt;
};

const buildCacheRecord = ({ key, scope, ttl }, data) => {
    const updatedAt = Date.now();
    const hasNumericTTL = typeof ttl === 'number' && Number.isFinite(ttl);

    return {
        key,
        scope,
        data,
        ttl: hasNumericTTL ? ttl : null,
        updatedAt,
        expiresAt: hasNumericTTL ? updatedAt + ttl : null
    };
};

export const setAsyncCache = async (cacheConfig, data) => {
    const { key, scope, ttl } = cacheConfig ?? {};

    if (!key || !scope || !db.api_caches) {
        console.error('Configuracion de cache invalida para IndexedDB.', cacheConfig);
        return;
    }

    const record = buildCacheRecord({ key, scope, ttl }, data);

    // Guardar en LRU cache (memoria)
    memoryCache.set(key, record.data, ttl);

    try {
        // Eliminar transacción manual innecesaria - Dexie la crea automáticamente
        await db.api_caches.put(record);
    } catch (error) {
        console.error(`[Dexie] Fallo al persistir cache asyncrona para ${key}:`, error);
        notifyUIDegradation(key, error);
    }
};

export const getAsyncCache = async (key) => {
    // Intentar primero en LRU cache (memoria)
    const memoryRecord = memoryCache.get(key);
    if (memoryRecord) {
        return {
            data: memoryRecord.value,
            isStale: isExpired(memoryRecord.expiresAt)
        };
    }

    if (!isIDBDegraded) {
        try {
            const record = await db.api_caches.get(key);

            if (record) {
                // Guardar en LRU cache para próximas consultas
                memoryCache.set(key, record.data, record.ttl);
                return {
                    data: record.data,
                    isStale: isExpired(record.expiresAt)
                };
            }
        } catch (error) {
            console.error(`[Cache] Fallo de lectura en IndexedDB para ${key}.`, error);
            notifyUIDegradation(key, error);
        }
    }

    return { data: null, isStale: true };
};

export const clearAsyncCache = async (key) => {
    // Eliminar de LRU cache (memoria)
    memoryCache.delete(key);

    if (isIDBDegraded) return;

    try {
        await db.api_caches.delete(key);
    } catch (error) {
        console.error(`[Cache] Error al limpiar IndexedDB para ${key}.`, error);
        notifyUIDegradation(key, error);
    }
};

/**
 * Obtiene el estado actual del caché.
 * @returns {{ memorySize: number, memoryUsed: number, isIDBDegraded: boolean }}
 */
export const getCacheStatus = () => ({
    memorySize: memoryCache.size,
    memoryUsed: memoryCache.size / LRU_MAX_SIZE,
    isIDBDegraded
});
