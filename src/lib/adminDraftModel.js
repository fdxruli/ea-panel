export const ADMIN_DRAFT_SCHEMA_VERSION = 1;
export const DEFAULT_ADMIN_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const ADMIN_DRAFT_STATUS = Object.freeze({ ACTIVE: 'active' });

const FORBIDDEN_KEY = /(?:access[_-]?token|refresh[_-]?token|password|secret|credential|private[_-]?key)/i;

const isPlainObject = value => {
    if (value === null || typeof value !== 'object') return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
};

export const assertSerializable = (value, path = 'payload') => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new TypeError(`${path} contains a non-finite number.`);
        return value;
    }

    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') {
        throw new TypeError(`${path} contains a non-serializable value.`);
    }

    if (Array.isArray(value)) {
        value.forEach((item, index) => assertSerializable(item, `${path}[${index}]`));
        return value;
    }

    if (!isPlainObject(value)) {
        throw new TypeError(`${path} contains an unsupported object type.`);
    }

    for (const [key, child] of Object.entries(value)) {
        if (FORBIDDEN_KEY.test(key)) {
            throw new TypeError(`${path}.${key} is not allowed in a draft.`);
        }
        assertSerializable(child, `${path}.${key}`);
    }

    return value;
};

export const createDraftRecord = ({
    id,
    ownerKey,
    workflow,
    entityType = null,
    entityId = null,
    payload,
    metadata = {},
    ttlMs = DEFAULT_ADMIN_DRAFT_TTL_MS,
    now = new Date()
}) => {
    if (!id || typeof id !== 'string') throw new TypeError('Draft id is required.');
    if (!ownerKey || typeof ownerKey !== 'string') throw new TypeError('Draft ownerKey is required.');
    if (!workflow || typeof workflow !== 'string') throw new TypeError('Draft workflow is required.');
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new TypeError('Draft ttlMs must be a positive finite number.');

    assertSerializable(payload, 'payload');
    assertSerializable(metadata, 'metadata');

    const timestamp = now.toISOString();
    return {
        id,
        ownerKey,
        workflow,
        entityType,
        entityId,
        schemaVersion: ADMIN_DRAFT_SCHEMA_VERSION,
        baseVersion: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
        expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
        status: ADMIN_DRAFT_STATUS.ACTIVE,
        payload,
        metadata
    };
};

export const isDraftExpired = (draft, now = new Date()) => {
    if (!draft?.expiresAt) return true;
    return new Date(draft.expiresAt).getTime() <= now.getTime();
};

export const validateDraftRecord = draft => {
    if (!draft || typeof draft !== 'object') return false;
    if (draft.schemaVersion !== ADMIN_DRAFT_SCHEMA_VERSION) return false;
    if (!draft.id || !draft.ownerKey || !draft.workflow) return false;
    if (!draft.createdAt || !draft.updatedAt || !draft.expiresAt) return false;
    if (draft.status !== ADMIN_DRAFT_STATUS.ACTIVE) return false;

    try {
        assertSerializable(draft.payload, 'payload');
        assertSerializable(draft.metadata ?? {}, 'metadata');
    } catch {
        return false;
    }

    return true;
};

export const migrateDraftRecord = draft => {
    if (!draft || typeof draft !== 'object') return null;
    if (draft.schemaVersion === ADMIN_DRAFT_SCHEMA_VERSION && validateDraftRecord(draft)) return draft;
    return null;
};
