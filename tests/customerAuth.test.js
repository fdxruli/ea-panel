import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerAuth, normalizeCustomerAuthPhone } from '../src/lib/customerAuth.js';

test('normalizeCustomerAuthPhone requires E.164', () => {
  assert.equal(normalizeCustomerAuthPhone(' +529631234567 '), '+529631234567');
  assert.throws(() => normalizeCustomerAuthPhone('9631234567'));
});

test('requestOtp delegates to Phone OTP without a customer_id', async () => {
  const calls = [];
  const client = {
    auth: {
      signInWithOtp: async (payload) => {
        calls.push(payload);
        return { error: null };
      },
    },
  };

  await createCustomerAuth(client).requestOtp('+529631234567');

  assert.deepEqual(calls, [{
    phone: '+529631234567',
  }]);
});

test('verifyOtpAndLink verifies OTP then calls a zero-argument linking RPC', async () => {
  const calls = [];
  const client = {
    auth: {
      verifyOtp: async (payload) => {
        calls.push(['verifyOtp', payload]);
        return { data: { session: { user: { id: 'auth-user' } } }, error: null };
      },
    },
    rpc: async (name, args) => {
      calls.push(['rpc', name, args]);
      return { data: 'customer-id', error: null };
    },
  };

  const result = await createCustomerAuth(client).verifyOtpAndLink('+529631234567', '123456');

  assert.equal(result.customerId, 'customer-id');
  assert.deepEqual(calls, [
    ['verifyOtp', { phone: '+529631234567', token: '123456', type: 'sms' }],
    ['rpc', 'link_my_customer', undefined],
  ]);
});
