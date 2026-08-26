import Dexie from 'dexie';

export const ADMIN_DRAFT_SCHEMA_VERSION = 1;
export const DEFAULT_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DB_NAME = 'ea-panel-admin-drafts';
const TABLE_NAME = 'drafts';
let dbPromise;
let dbInstance;

const getDb = () => {
  if (typeof indexedDB === 'undefined') throw new Error('ADMIN_DRAFT_STORAGE_UNAVAILABLE');
  if (!dbPromise) {
    dbInstance = new Dexie(DB_NAME);
    dbInstance.version(1).stores({ drafts: 'id, workflow, updatedAt, expiresAt, version' });
    dbPromise = dbInstance.open().catch((error) => { dbPromise = undefined; dbInstance = undefined; throw error; });
  }
  return dbPromise.then(() => dbInstance);
};

const isPlainObject = (value) => {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const validateSerializable = (value, path = 'payload', seen = new WeakSet()) => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${path}`); return; }
  if (typeof value === 'undefined') throw new TypeError(`Undefined value at ${path}`);
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint') throw new TypeError(`Unsupported value at ${path}`);
  if (typeof value !== 'object') throw new TypeError(`Unsupported value at ${path}`);
  if (seen.has(value)) throw new TypeError(`Circular reference at ${path}`);
  if (value instanceof Date || value instanceof RegExp || value instanceof Map || value instanceof Set || value instanceof Promise) throw new TypeError(`Unsupported object at ${path}`);
  if (!isPlainObject(value) && !Array.isArray(value)) throw new TypeError(`Non-plain object at ${path}`);
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item, index) => validateSerializable(item, `${path}[${index}]`, seen));
  else Object.entries(value).forEach(([key, item]) => validateSerializable(item, `${path}.${key}`, seen));
  seen.delete(value);
};

const assertDraft = (draft) => {
  if (!draft || typeof draft !== 'object') throw new TypeError('Invalid draft');
  if (typeof draft.id !== 'string' || !draft.id) throw new TypeError('Invalid draft: missing id');
  if (typeof draft.workflow !== 'string' || !draft.workflow) throw new TypeError('Invalid draft: missing workflow');
  for (const field of ['createdAt', 'updatedAt', 'expiresAt']) if (!Number.isFinite(draft[field])) throw new TypeError(`Invalid draft: missing ${field}`);
  if (!Number.isInteger(draft.version) || draft.version < 1) throw new TypeError('Invalid draft version');
  if (draft.version !== ADMIN_DRAFT_SCHEMA_VERSION) throw new Error('ADMIN_DRAFT_VERSION_INCOMPATIBLE');
  validateSerializable(draft.payload);
  if (draft.metadata !== undefined) validateSerializable(draft.metadata, 'metadata');
};

const isExpired = (draft, now = Date.now()) => draft.expiresAt <= now;
const cloneDraft = (draft) => structuredClone(draft);

export const createDraft = async ({ id = crypto.randomUUID(), workflow, payload, metadata = {}, ttlMs = DEFAULT_DRAFT_TTL_MS, now = Date.now() }) => {
  if (!workflow || typeof workflow !== 'string') throw new TypeError('workflow is required');
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new TypeError('ttlMs must be a positive finite number');
  if (!Number.isFinite(now)) throw new TypeError('now must be finite');
  validateSerializable(payload); validateSerializable(metadata, 'metadata');
  const draft = { id, version: ADMIN_DRAFT_SCHEMA_VERSION, workflow, createdAt: now, updatedAt: now, expiresAt: now + ttlMs, payload: cloneDraft(payload), metadata: cloneDraft(metadata) };
  assertDraft(draft);
  const db = await getDb(); await db.table(TABLE_NAME).add(draft); return cloneDraft(draft);
};

export const getDraft = async (id, { now = Date.now(), cleanupExpired = true } = {}) => {
  if (!id) return null;
  const db = await getDb(); const draft = await db.table(TABLE_NAME).get(id);
  if (!draft) return null;
  try { assertDraft(draft); } catch { if (cleanupExpired) await db.table(TABLE_NAME).delete(id); return null; }
  if (isExpired(draft, now)) { if (cleanupExpired) await db.table(TABLE_NAME).delete(id); return null; }
  return cloneDraft(draft);
};

export const updateDraft = async (id, changes, { now = Date.now(), ttlMs } = {}) => {
  const existing = await getDraft(id, { now });
  if (!existing) return null;
  if (!changes || typeof changes !== 'object') throw new TypeError('changes must be an object');
  if (ttlMs !== undefined && (!Number.isFinite(ttlMs) || ttlMs <= 0)) throw new TypeError('ttlMs must be a positive finite number');
  const nextPayload = Object.prototype.hasOwnProperty.call(changes, 'payload') ? changes.payload : existing.payload;
  const nextMetadata = Object.prototype.hasOwnProperty.call(changes, 'metadata') ? changes.metadata : existing.metadata;
  validateSerializable(nextPayload); validateSerializable(nextMetadata, 'metadata');
  const updated = { ...existing, ...changes, id: existing.id, version: ADMIN_DRAFT_SCHEMA_VERSION, workflow: existing.workflow, createdAt: existing.createdAt, updatedAt: now, expiresAt: ttlMs === undefined ? existing.expiresAt : now + ttlMs, payload: cloneDraft(nextPayload), metadata: cloneDraft(nextMetadata) };
  assertDraft(updated);
  const db = await getDb(); await db.table(TABLE_NAME).put(updated); return cloneDraft(updated);
};

export const deleteDraft = async (id) => { const db = await getDb(); await db.table(TABLE_NAME).delete(id); };

export const listDrafts = async ({ workflow, now = Date.now(), cleanupExpired = true } = {}) => {
  const db = await getDb();
  const drafts = workflow ? await db.table(TABLE_NAME).where('workflow').equals(workflow).toArray() : await db.table(TABLE_NAME).toArray();
  const valid = [];
  for (const draft of drafts) {
    try { assertDraft(draft); if (isExpired(draft, now)) throw new Error('expired'); valid.push(cloneDraft(draft)); }
    catch { if (cleanupExpired) await db.table(TABLE_NAME).delete(draft.id); }
  }
  return valid.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const hasDraft = async (id, options = {}) => Boolean(await getDraft(id, options));

export const clearExpiredDrafts = async ({ now = Date.now() } = {}) => {
  const db = await getDb(); const drafts = await db.table(TABLE_NAME).toArray();
  const expiredIds = drafts.filter((draft) => { try { assertDraft(draft); return isExpired(draft, now); } catch { return true; } }).map((draft) => draft.id);
  if (expiredIds.length) await db.table(TABLE_NAME).bulkDelete(expiredIds);
  return expiredIds.length;
};

export const clearAllDraftsForTests = async () => { const db = await getDb(); await db.table(TABLE_NAME).clear(); };

export const flushDraft = async (draftOrPromise) => {
  const draft = await draftOrPromise;
  if (!draft || !draft.id) throw new TypeError('A draft is required');
  const updated = await updateDraft(draft.id, draft);
  if (!updated) throw new Error('ADMIN_DRAFT_NOT_FOUND');
  return updated;
};

export const createDebouncedDraftSaver = (save, delayMs = 500) => {
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new TypeError('delayMs must be a non-negative finite number');
  let timer = null; let pending = null;
  const schedule = (value) => { pending = value; if (timer) clearTimeout(timer); timer = setTimeout(async () => { const valueToSave = pending; pending = null; timer = null; try { await save(valueToSave); } catch (error) { console.warn('[AdminDraft] Debounced save failed', error); } }, delayMs); };
  const flush = async () => { if (timer) clearTimeout(timer); timer = null; if (pending === null) return; const valueToSave = pending; pending = null; await save(valueToSave); };
  const cancel = () => { if (timer) clearTimeout(timer); timer = null; pending = null; };
  return { schedule, flush, cancel };
};

export const isDraftStorageAvailable = () => typeof indexedDB !== 'undefined';
