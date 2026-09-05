import test, { after, mock } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';

// The cache sweeper is irrelevant to these deterministic expiration checks.
mock.timers.enable({ apis: ['setInterval'] });
const { db, getAsyncCache, setAsyncCache, clearAsyncCache } = await import('../src/lib/db.js');
after(() => {
  db.close();
  mock.timers.reset();
});

test('repeated reads of an expired disk entry stay stale', async () => {
  await db.api_caches.put({
    key: 'expired', scope: 'client', data: ['old catalog'],
    updatedAt: Date.now() - 2000, expiresAt: Date.now() - 1000, ttl: 1000,
  });
  const first = await getAsyncCache('expired');
  const second = await getAsyncCache('expired');
  assert.deepEqual(first, { data: ['old catalog'], isStale: true });
  assert.deepEqual(second, first);
});

test('disk hydration preserves remaining lifetime instead of restarting the TTL', async (t) => {
  const clock = t.mock.method(Date, 'now', () => 10000);
  await db.api_caches.put({
    key: 'near-expiry', scope: 'client', data: ['catalog'],
    updatedAt: 9500, expiresAt: 10500, ttl: 1000,
  });
  assert.equal((await getAsyncCache('near-expiry')).isStale, false);
  clock.mock.mockImplementation(() => 10501);
  assert.equal((await getAsyncCache('near-expiry')).isStale, true);
});

test('a zero TTL is not treated as an entry that never expires', async (t) => {
  const clock = t.mock.method(Date, 'now', () => 20000);
  await setAsyncCache({ key: 'zero-ttl', scope: 'client', ttl: 0 }, []);
  clock.mock.mockImplementation(() => 20001);
  assert.equal((await getAsyncCache('zero-ttl')).isStale, true);
});

test('entries without expiration remain available and can be cleared', async () => {
  await setAsyncCache({ key: 'persistent', scope: 'client', ttl: null }, { value: 1 });
  assert.deepEqual(await getAsyncCache('persistent'), { data: { value: 1 }, isStale: false });
  await clearAsyncCache('persistent');
  assert.deepEqual(await getAsyncCache('persistent'), { data: null, isStale: true });
});
