import Dexie from 'dexie';

const CACHE_TABLE_NAME = 'api_caches';

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

const memoryCache = new Map();

let isIDBDegraded = false;

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

    memoryCache.set(key, record);

    try {
        await db.transaction('rw', db.api_caches, async () => {
            await db.api_caches.put(record);
        });
    } catch (error) {
        console.error(`[Dexie] Fallo al persistir cache asyncrona para ${key}:`, error);
        notifyUIDegradation(key, error);
    }
};

export const getAsyncCache = async (key) => {
    const memoryRecord = memoryCache.get(key);
    if (memoryRecord) {
        return {
            data: memoryRecord.data,
            isStale: isExpired(memoryRecord.expiresAt)
        };
    }

    if (!isIDBDegraded) {
        try {
            const record = await db.api_caches.get(key);

            if (record) {
                memoryCache.set(key, record);
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
    memoryCache.delete(key);

    if (isIDBDegraded) return;

    try {
        await db.transaction('rw', db.api_caches, async () => {
            await db.api_caches.delete(key);
        });
    } catch (error) {
        console.error(`[Cache] Error al limpiar IndexedDB para ${key}.`, error);
        notifyUIDegradation(key, error);
    }
};
