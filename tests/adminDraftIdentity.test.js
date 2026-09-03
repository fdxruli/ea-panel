import test from 'node:test';
import assert from 'node:assert/strict';
import { getAdminDraftOwnerKey } from '../src/lib/adminDraftIdentity.js';

test('admin session user id is the ownerKey', () => {
  assert.equal(getAdminDraftOwnerKey({ status: 'ADMIN', userId: 'admin-a' }), 'admin-a');
});

test('resolving auth does not expose an ownerKey', () => {
  assert.equal(getAdminDraftOwnerKey({ status: 'RESOLVING', userId: 'admin-a' }), null);
});

test('unauthenticated auth does not expose an ownerKey', () => {
  assert.equal(getAdminDraftOwnerKey({ status: 'UNAUTHENTICATED', userId: null }), null);
});

test('client sessions do not receive an administrative ownerKey', () => {
  assert.equal(getAdminDraftOwnerKey({ status: 'CLIENT', userId: 'client-a' }), null);
});

test('logout clears the ownerKey', () => {
  assert.equal(getAdminDraftOwnerKey({ status: 'UNAUTHENTICATED', userId: null }), null);
});

test('switching authenticated users changes the ownerKey', () => {
  const ownerA = getAdminDraftOwnerKey({ status: 'ADMIN', userId: 'admin-a' });
  const loggedOut = getAdminDraftOwnerKey({ status: 'UNAUTHENTICATED', userId: null });
  const ownerB = getAdminDraftOwnerKey({ status: 'ADMIN', userId: 'admin-b' });

  assert.equal(ownerA, 'admin-a');
  assert.equal(loggedOut, null);
  assert.equal(ownerB, 'admin-b');
  assert.notEqual(ownerA, ownerB);
});
