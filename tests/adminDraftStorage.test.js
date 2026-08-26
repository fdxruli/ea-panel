import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { ADMIN_DRAFT_SCHEMA_VERSION, DEFAULT_DRAFT_TTL_MS, clearAllDraftsForTests, clearExpiredDrafts, createDraft, deleteDraft, getDraft, hasDraft, listDrafts, updateDraft } from '../src/lib/adminDraftStorage.js';

const makeDraft = (suffix, options = {}) => createDraft({ id: `draft-${suffix}`, workflow: 'test-workflow', payload: { value: suffix }, ...options });
afterEach(async () => { await clearAllDraftsForTests(); });

test('createDraft and getDraft persist data', async () => { const created = await makeDraft('a'); const loaded = await getDraft(created.id); assert.equal(loaded.id, created.id); assert.deepEqual(loaded.payload, { value: 'a' }); assert.equal(loaded.version, ADMIN_DRAFT_SCHEMA_VERSION); });
test('storage survives a new read access to the same IndexedDB database', async () => { const created = await makeDraft('persistent'); assert.deepEqual(await getDraft(created.id), created); });
test('updateDraft updates payload without changing identity', async () => { const created = await makeDraft('a'); const updated = await updateDraft(created.id, { payload: { value: 'changed' } }); assert.equal(updated.id, created.id); assert.equal(updated.workflow, created.workflow); assert.deepEqual(updated.payload, { value: 'changed' }); assert.equal(updated.createdAt, created.createdAt); });
test('deleteDraft and hasDraft', async () => { const created = await makeDraft('a'); assert.equal(await hasDraft(created.id), true); await deleteDraft(created.id); assert.equal(await hasDraft(created.id), false); });
test('listDrafts supports multiple isolated drafts', async () => { await makeDraft('a'); await makeDraft('b'); const drafts = await listDrafts(); assert.equal(drafts.length, 2); assert.deepEqual(new Set(drafts.map((draft) => draft.id)), new Set(['draft-a', 'draft-b'])); });
test('workflow filter isolates drafts', async () => { await makeDraft('a', { workflow: 'create-order' }); await makeDraft('b', { workflow: 'edit-order' }); assert.deepEqual((await listDrafts({ workflow: 'create-order' })).map((draft) => draft.id), ['draft-a']); });
test('TTL and expiration prevent restoration', async () => { const created = await makeDraft('expired', { ttlMs: 100, now: 1000 }); assert.equal(created.expiresAt, 1100); assert.equal((await getDraft(created.id, { now: 1099 })).id, created.id); assert.equal(await getDraft(created.id, { now: 1100 }), null); });
test('default TTL is explicit and positive', async () => { const created = await makeDraft('ttl'); assert.equal(created.expiresAt - created.createdAt, DEFAULT_DRAFT_TTL_MS); });
test('cleanup removes expired records', async () => { await makeDraft('expired', { ttlMs: 1, now: 100 }); assert.equal(await clearExpiredDrafts({ now: 101 }), 1); assert.equal(await getDraft('draft-expired', { now: 101 }), null); });
test('invalid payload values are rejected', async () => { await assert.rejects(() => makeDraft('function', { payload: { fn: () => {} } }), /Unsupported value/); await assert.rejects(() => makeDraft('promise', { payload: { promise: Promise.resolve() } }), /Unsupported object/); });
test('invalid TTL and missing workflow are rejected', async () => { await assert.rejects(() => makeDraft('bad-ttl', { ttlMs: 0 }), /ttlMs/); await assert.rejects(() => createDraft({ id: 'missing-workflow', payload: {} }), /workflow/); });
