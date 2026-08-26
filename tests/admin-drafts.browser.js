import { AdminDraftStore } from '../src/lib/adminDraftStore';
import { adminDraftStorage, closeAdminDraftStorage } from '../src/lib/adminDraftStorage';
import { createDraftRecord } from '../src/lib/adminDraftModel';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const deepEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const store = new AdminDraftStore();
const ownerA = 'admin-a';
const ownerB = 'admin-b';

await adminDraftStorage.clearAll();
await closeAdminDraftStorage();

 test('createDraft', async () => {
    const draft = await store.createDraft({ ownerKey: ownerA, workflow: 'create-order', payload: { cart: [] } });
    assert(draft.id && draft.schemaVersion === 1, 'draft metadata missing');
});

test('getDraft', async () => {
    const draft = await store.createDraft({ ownerKey: ownerA, workflow: 'create-order', payload: { step: 2 } });
    const loaded = await store.getDraft(draft.id);
    assert(deepEqual(loaded.payload, { step: 2 }), 'payload was not recovered');
});

test('updateDraft', async () => {
    const draft = await store.createDraft({ ownerKey: ownerA, workflow: 'create-order', payload: { step: 1 } });
    const updated = await store.updateDraft(draft.id, { payload: { step: 3 } });
    assert(updated.payload.step === 3 && updated.updatedAt >= draft.updatedAt, 'draft was not updated');
});

test('deleteDraft', async () => {
    const draft = await store.createDraft({ ownerKey: ownerA, workflow: 'create-order', payload: {} });
    await store.deleteDraft(draft.id);
    assert(!(await store.hasDraft(draft.id)), 'draft still exists');
});

test('listDrafts', async () => {
    const before = await store.listDrafts({ ownerKey: ownerA });
    const draft = await store.createDraft({ ownerKey: ownerA, workflow: 'edit-order', payload: {} });
    const after = await store.listDrafts({ ownerKey: ownerA });
    assert(after.length === before.length + 1 && after.some(item => item.id === draft.id), 'listDrafts failed');
});

test('hasDraft', async () => {
    const draft = await store.createDraft({ ownerKey: ownerA, workflow: 'create-order', payload: {} });
    assert(await store.hasDraft(draft.id), 'hasDraft returned false for existing draft');
    assert(!(await store.hasDraft('missing-draft')), 'hasDraft returned true for missing draft');
});

test('multiple drafts and isolation', async () => {
    const a = await store.createDraft({ ownerKey: ownerA, workflow: 'create-order', payload: { value: 'A' } });
    const b = await store.createDraft({ ownerKey: ownerA, workflow: 'create-order', payload: { value: 'B' } });
    await store.updateDraft(a.id, { payload: { value: 'A2' } });
    const loadedB = await store.getDraft(b.id);
    assert(loadedB.payload.value === 'B', 'Draft A overwrote Draft B');
    assert(a.id !== b.id, 'draft ids are not unique');
});

test('TTL and expiration', async () => {
    const draft = await store.createDraft({ ownerKey: ownerA, workflow: 'ttl-test', payload: {}, ttlMs: 20 });
    await new Promise(resolve => setTimeout(resolve, 35));
    assert(!(await store.hasDraft(draft.id)), 'expired draft remained recoverable');
});

test('clearExpiredDrafts', async () => {
    const expired = createDraftRecord({
        id: 'expired-cleanup', ownerKey: ownerA, workflow: 'cleanup', payload: {},
        now: new Date(Date.now() - 1000), ttlMs: 100
    });
    await adminDraftStorage.create(expired);
    const count = await store.clearExpiredDrafts();
    assert(count >= 1, 'expired draft was not cleaned');
});

test('schema versioning and invalid drafts', async () => {
    const invalid = { id: 'bad-version', ownerKey: ownerA, workflow: 'bad', schemaVersion: 99 };
    await adminDraftStorage.create(invalid);
    assert(!(await store.hasDraft(invalid.id)), 'incompatible draft was restored');
    assert(!(await adminDraftStorage.get(invalid.id)), 'incompatible draft was not discarded');
});

test('serialization rules', async () => {
    let rejected = false;
    try { await store.createDraft({ ownerKey: ownerA, workflow: 'bad', payload: { callback: () => {} } }); } catch { rejected = true; }
    assert(rejected, 'functions were accepted in payload');
    rejected = false;
    try { await store.createDraft({ ownerKey: ownerA, workflow: 'bad', payload: { accessToken: 'secret' } }); } catch { rejected = true; }
    assert(rejected, 'credential-like data was accepted');
});

test('storage failure fallback', async () => {
    const failingStorage = {
        create: async () => null,
        get: async () => null,
        update: async () => false,
        delete: async () => false,
        list: async () => [],
        clearExpired: async () => 0
    };
    const degraded = new AdminDraftStore({ storage: failingStorage });
    const draft = await degraded.createDraft({ ownerKey: ownerA, workflow: 'offline', payload: { ok: true } });
    assert((await degraded.getDraft(draft.id)).payload.ok === true, 'fallback memory store failed');
    await degraded.updateDraft(draft.id, { payload: { ok: false } });
    assert((await degraded.getDraft(draft.id)).payload.ok === false, 'fallback update failed');
});

test('autosave and flush', async () => {
    const draft = await store.createDraft({ ownerKey: ownerA, workflow: 'autosave', payload: { step: 1 } });
    store.scheduleSave(draft.id, { payload: { step: 2 } }, 1000);
    await store.flushDraft(draft.id);
    assert((await store.getDraft(draft.id)).payload.step === 2, 'flush did not persist pending autosave');
});

test('real IndexedDB persistence across store recreation', async () => {
    const draft = await store.createDraft({ ownerKey: ownerB, workflow: 'persistence', payload: { restored: true } });
    await closeAdminDraftStorage();
    const recreatedStore = new AdminDraftStore();
    const recovered = await recreatedStore.getDraft(draft.id);
    assert(recovered?.payload?.restored === true, 'draft did not survive storage connection recreation');
});

const failures = [];
for (const item of tests) {
    try { await item.fn(); }
    catch (error) { failures.push(`${item.name}: ${error.message}`); }
}

window.__ADMIN_DRAFT_TEST_RESULT__ = {
    ok: failures.length === 0,
    passed: tests.length - failures.length,
    total: tests.length,
    error: failures.join('\n')
};
