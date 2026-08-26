import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  ADMIN_DRAFT_SCHEMA_VERSION,
  DEFAULT_DRAFT_TTL_MS,
  clearAllDraftsForTests,
  clearExpiredDrafts,
  createDebouncedDraftSaver,
  createDraft,
  deleteDraft,
  flushDraft,
  getDraft,
  hasDraft,
  listDrafts,
  updateDraft,
} from '../src/lib/adminDraftStorage.js';

const makeDraft = (suffix, options = {}) => createDraft({
  id: `draft-${suffix}`,
  workflow: 'test-workflow',
  payload: { value: suffix },
  ...options,
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const invalidSerializableValues = [
  ['undefined', undefined],
  ['function', () => {}],
  ['symbol', Symbol('draft')],
  ['bigint', 1n],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['Date', new Date()],
  ['RegExp', /draft/],
  ['Map', new Map([['key', 'value']])],
  ['Set', new Set(['value'])],
  ['Promise', Promise.resolve()],
  ['class instance', new (class DraftClass {})()],
];

afterEach(async () => {
  await clearAllDraftsForTests();
});

test('createDraft and getDraft persist data', async () => {
  const created = await makeDraft('a');
  const loaded = await getDraft(created.id);
  assert.equal(loaded.id, created.id);
  assert.deepEqual(loaded.payload, { value: 'a' });
  assert.equal(loaded.version, ADMIN_DRAFT_SCHEMA_VERSION);
});

test('storage survives a new read access to the same IndexedDB database', async () => {
  const created = await makeDraft('persistent');
  assert.deepEqual(await getDraft(created.id), created);
});

test('updateDraft updates payload without changing identity', async () => {
  const created = await makeDraft('a', { now: 1000 });
  const updated = await updateDraft(created.id, { payload: { value: 'changed' } }, { now: 1100 });
  assert.equal(updated.id, created.id);
  assert.equal(updated.workflow, created.workflow);
  assert.deepEqual(updated.payload, { value: 'changed' });
  assert.equal(updated.createdAt, created.createdAt);
});

test('updateDraft isolates one draft from another', async () => {
  const draftA = await makeDraft('a', { payload: { value: 'A' } });
  const draftB = await makeDraft('b', { payload: { value: 'B' } });
  const originalB = await getDraft(draftB.id);
  await updateDraft(draftA.id, { payload: { value: 'A-updated' } });
  assert.deepEqual(await getDraft(draftB.id), originalB);
  assert.deepEqual((await getDraft(draftA.id)).payload, { value: 'A-updated' });
});

test('deleteDraft and hasDraft', async () => {
  const created = await makeDraft('a');
  assert.equal(await hasDraft(created.id), true);
  await deleteDraft(created.id);
  assert.equal(await hasDraft(created.id), false);
});

test('listDrafts supports multiple isolated drafts', async () => {
  await makeDraft('a');
  await makeDraft('b');
  const drafts = await listDrafts();
  assert.equal(drafts.length, 2);
  assert.deepEqual(new Set(drafts.map((draft) => draft.id)), new Set(['draft-a', 'draft-b']));
});

test('workflow filter isolates drafts', async () => {
  await makeDraft('a', { workflow: 'create-order' });
  await makeDraft('b', { workflow: 'edit-order' });
  assert.deepEqual((await listDrafts({ workflow: 'create-order' })).map((draft) => draft.id), ['draft-a']);
});

test('default TTL is absolute and explicit', async () => {
  const created = await makeDraft('ttl', { now: 1000 });
  assert.equal(created.expiresAt - created.createdAt, DEFAULT_DRAFT_TTL_MS);
});

test('custom TTL is applied at creation', async () => {
  const created = await makeDraft('custom-ttl', { ttlMs: 100, now: 1000 });
  assert.equal(created.expiresAt, 1100);
});

test('updateDraft without ttlMs preserves absolute expiration', async () => {
  const created = await makeDraft('ttl-preserve', { ttlMs: 1000, now: 1000 });
  const updated = await updateDraft(created.id, { payload: { value: 'updated' } }, { now: 1500 });
  assert.equal(updated.expiresAt, 2000);
});

test('updateDraft with ttlMs changes expiration from update time', async () => {
  const created = await makeDraft('ttl-update', { ttlMs: 1000, now: 1000 });
  const updated = await updateDraft(created.id, { payload: { value: 'updated' } }, { now: 1500, ttlMs: 2000 });
  assert.equal(updated.expiresAt, 3500);
});

test('invalid TTL is rejected on create and update', async () => {
  await assert.rejects(() => makeDraft('bad-create-ttl', { ttlMs: 0 }), /ttlMs/);
  const created = await makeDraft('bad-update-ttl');
  await assert.rejects(() => updateDraft(created.id, {}, { ttlMs: 0 }), /ttlMs/);
});

test('expired drafts are not restored', async () => {
  const created = await makeDraft('expired', { ttlMs: 100, now: 1000 });
  assert.equal((await getDraft(created.id, { now: 1099 })).id, created.id);
  assert.equal(await getDraft(created.id, { now: 1100 }), null);
});

test('expired drafts cannot be updated', async () => {
  const created = await makeDraft('expired-update', { ttlMs: 100, now: 1000 });
  assert.equal(await updateDraft(created.id, { payload: { value: 'too-late' } }, { now: 1100 }), null);
});

test('cleanup removes expired records', async () => {
  await makeDraft('expired', { ttlMs: 1, now: 100 });
  assert.equal(await clearExpiredDrafts({ now: 101 }), 1);
  assert.equal(await getDraft('draft-expired', { now: 101 }), null);
});

test('incompatible stored version is rejected and cleaned up', async () => {
  const created = await makeDraft('version');
  const request = globalThis.indexedDB.open('ea-panel-admin-drafts', 1);
  const database = await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = database.transaction('drafts', 'readwrite');
    tx.objectStore('drafts').put({ ...created, version: 2 });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  database.close();
  assert.equal(await getDraft(created.id), null);
  const checkRequest = globalThis.indexedDB.open('ea-panel-admin-drafts', 1);
  const checkDb = await new Promise((resolve, reject) => {
    checkRequest.onsuccess = () => resolve(checkRequest.result);
    checkRequest.onerror = () => reject(checkRequest.error);
  });
  const check = await new Promise((resolve, reject) => {
    const tx = checkDb.transaction('drafts', 'readonly');
    const read = tx.objectStore('drafts').get(created.id);
    read.onsuccess = () => resolve(read.result);
    read.onerror = () => reject(read.error);
  });
  checkDb.close();
  assert.equal(check, undefined);
});

test('serialization accepts JSON-like primitives and structures', async () => {
  const payload = {
    string: 'text',
    number: 42,
    boolean: true,
    nullable: null,
    array: [1, 'two', false, null],
    object: { nested: { value: 'ok' } },
  };
  const created = await createDraft({ id: 'draft-serializable', workflow: 'test-workflow', payload });
  assert.deepEqual(created.payload, payload);
});

test('serialization rejects unsupported values', async () => {
  for (const [name, value] of invalidSerializableValues) {
    await assert.rejects(
      () => makeDraft(`invalid-${name.replace(/\W/g, '-')}`, { payload: { value } }),
      { name: 'TypeError' },
      `${name} should be rejected`,
    );
  }
});

test('serialization rejects circular references', async () => {
  const payload = {};
  payload.self = payload;
  await assert.rejects(() => makeDraft('circular', { payload }), /Circular reference/);
});

test('storage unavailable is surfaced before database access', async () => {
  const originalIndexedDb = globalThis.indexedDB;
  try {
    globalThis.indexedDB = undefined;
    await assert.rejects(() => getDraft('unavailable'), /ADMIN_DRAFT_STORAGE_UNAVAILABLE/);
  } finally {
    globalThis.indexedDB = originalIndexedDb;
  }
});

test('duplicate create surfaces an IndexedDB write error', async () => {
  await makeDraft('duplicate');
  await assert.rejects(() => makeDraft('duplicate'), (error) => {
    assert.match(error?.name ?? '', /ConstraintError/);
    return true;
  });
});

test('flushDraft waits for the immediate persistence write', async () => {
  const created = await makeDraft('flush', { now: 1000 });
  const flushed = await flushDraft({ ...created, payload: { value: 'flushed' } });
  assert.deepEqual((await getDraft(created.id)).payload, { value: 'flushed' });
  assert.equal(flushed.id, created.id);
});

test('debounced saver does not write before the delay and saves the latest value', async () => {
  const saved = [];
  const saver = createDebouncedDraftSaver(async (value) => { saved.push(value); }, 30);
  saver.schedule('first');
  saver.schedule('second');
  await wait(5);
  assert.deepEqual(saved, []);
  await wait(40);
  assert.deepEqual(saved, ['second']);
});

test('debounced saver cancel prevents a scheduled write', async () => {
  const saved = [];
  const saver = createDebouncedDraftSaver(async (value) => { saved.push(value); }, 20);
  saver.schedule('cancelled');
  saver.cancel();
  await wait(30);
  assert.deepEqual(saved, []);
});

test('debounced saver flush writes immediately and clears the timer', async () => {
  const saved = [];
  const saver = createDebouncedDraftSaver(async (value) => { saved.push(value); }, 50);
  saver.schedule('flushed');
  await saver.flush();
  assert.deepEqual(saved, ['flushed']);
  await wait(60);
  assert.deepEqual(saved, ['flushed']);
});

test('debounced save errors are caught without an unhandled rejection', async () => {
  const unhandled = [];
  const onUnhandled = (error) => unhandled.push(error);
  process.on('unhandledRejection', onUnhandled);
  try {
    const saver = createDebouncedDraftSaver(async () => { throw new Error('save failed'); }, 10);
    saver.schedule('bad');
    await wait(30);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('invalid workflow is rejected', async () => {
  await assert.rejects(() => createDraft({ id: 'missing-workflow', payload: {} }), /workflow/);
});
