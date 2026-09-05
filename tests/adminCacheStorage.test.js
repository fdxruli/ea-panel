import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { setStorageItem, getAllStorageItems, removeStorageItem, clearStorage } from '../src/utils/cacheAdminUtils.js';

test('a failed database open can recover on the next operation', async (t) => {
    const log = t.mock.method(console, 'error', () => {});
    const open = t.mock.method(indexedDB, 'open', () => { throw new Error('Storage temporarily unavailable'); });
    assert.deepEqual(await getAllStorageItems(), {});
    open.mock.restore();
    await setStorageItem('recovered', { data: 'available', timestamp: Date.now() });
    assert.equal((await getAllStorageItems()).recovered.data, 'available');
    assert.equal(log.mock.callCount(), 1);
    await clearStorage();
});

test('writes, deletions and clears finish after the transaction commits', async () => {
    const entry = { data: ['products'], timestamp: Date.now(), ttl: 1000 };
    await setStorageItem('catalog', entry);
    assert.deepEqual(await getAllStorageItems(), { catalog: entry });
    await removeStorageItem('catalog');
    assert.deepEqual(await getAllStorageItems(), {});
    await setStorageItem('catalog', entry);
    await clearStorage();
    assert.deepEqual(await getAllStorageItems(), {});
});

test('aborted writes, deletions and clears are caught and preserve committed data', async (t) => {
    const entry = { data: ['original'], timestamp: Date.now() };
    await setStorageItem('catalog', entry);
    const log = t.mock.method(console, 'error', () => {});
    for (const method of ['put', 'delete', 'clear']) {
        const original = IDBObjectStore.prototype[method];
        const operation = t.mock.method(IDBObjectStore.prototype, method, function (...args) {
            const request = original.apply(this, args);
            request.addEventListener('success', () => this.transaction.abort());
            return request;
        });
        if (method === 'put') await setStorageItem('catalog', { data: ['new'] });
        if (method === 'delete') await removeStorageItem('catalog');
        if (method === 'clear') await clearStorage();
        operation.mock.restore();
        assert.deepEqual((await getAllStorageItems()).catalog, entry);
    }
    assert.equal(log.mock.callCount(), 3);
    await clearStorage();
});

test('aborted reads return an empty cache without rejecting', async (t) => {
    await setStorageItem('catalog', { data: 'value' });
    const log = t.mock.method(console, 'error', () => {});
    const original = IDBObjectStore.prototype.openCursor;
    const cursor = t.mock.method(IDBObjectStore.prototype, 'openCursor', function (...args) {
        const request = original.apply(this, args);
        request.addEventListener('success', () => this.transaction.abort(), { once: true });
        return request;
    });
    assert.deepEqual(await getAllStorageItems(), {});
    assert.equal(log.mock.callCount(), 1);
    cursor.mock.restore();
    await clearStorage();
});
