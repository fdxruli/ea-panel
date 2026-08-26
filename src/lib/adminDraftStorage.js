import Dexie from 'dexie';

export const ADMIN_DRAFT_DB_NAME = 'EAPanelAdminDraftsDB';
export const ADMIN_DRAFT_STORE_NAME = 'drafts';
export const ADMIN_DRAFT_DB_VERSION = 1;

let dbPromise = null;

const createDb = () => {
    const db = new Dexie(ADMIN_DRAFT_DB_NAME);
    db.version(ADMIN_DRAFT_DB_VERSION).stores({
        drafts: 'id, ownerKey, workflow, updatedAt, expiresAt, status, schemaVersion'
    });
    return db;
};

const getDb = async () => {
    if (typeof indexedDB === 'undefined') throw new Error('IndexedDB is not available in this environment.');
    if (!dbPromise) {
        dbPromise = Promise.resolve(createDb()).then(async db => {
            await db.open();
            return db;
        }).catch(error => {
            dbPromise = null;
            throw error;
        });
    }
    return dbPromise;
};

const runStorageOperation = async (operation, fallbackValue) => {
    try {
        const db = await getDb();
        return await operation(db);
    } catch (error) {
        console.warn('[AdminDraftStorage] Persistence unavailable:', error);
        return fallbackValue;
    }
};

export const adminDraftStorage = {
    async create(draft) {
        return runStorageOperation(db => db.table(ADMIN_DRAFT_STORE_NAME).add(draft).then(() => draft), null);
    },
    async get(id) {
        return runStorageOperation(db => db.table(ADMIN_DRAFT_STORE_NAME).get(id), null);
    },
    async update(id, draft) {
        return runStorageOperation(db => db.table(ADMIN_DRAFT_STORE_NAME).put({ ...draft, id }).then(() => true), false);
    },
    async delete(id) {
        return runStorageOperation(db => db.table(ADMIN_DRAFT_STORE_NAME).delete(id).then(() => true), false);
    },
    async list(filters = {}) {
        return runStorageOperation(async db => {
            const entries = await db.table(ADMIN_DRAFT_STORE_NAME).toArray();
            return entries.filter(draft => {
                if (filters.ownerKey && draft.ownerKey !== filters.ownerKey) return false;
                if (filters.workflow && draft.workflow !== filters.workflow) return false;
                if (filters.status && draft.status !== filters.status) return false;
                return true;
            });
        }, []);
    },
    async clearExpired(now = new Date().toISOString()) {
        return runStorageOperation(async db => {
            const entries = await db.table(ADMIN_DRAFT_STORE_NAME).toArray();
            const expired = entries.filter(draft => draft.expiresAt && draft.expiresAt <= now);
            if (expired.length) await db.table(ADMIN_DRAFT_STORE_NAME).bulkDelete(expired.map(draft => draft.id));
            return expired.length;
        }, 0);
    },
    async clearAll() {
        return runStorageOperation(db => db.table(ADMIN_DRAFT_STORE_NAME).clear().then(() => true), false);
    }
};

export const closeAdminDraftStorage = async () => {
    if (!dbPromise) return;
    try {
        const db = await dbPromise;
        db.close();
    } finally {
        dbPromise = null;
    }
};

export const resetAdminDraftStorageConnection = closeAdminDraftStorage;
