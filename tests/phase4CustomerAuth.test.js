import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const read = (path) => fs.readFile(path, 'utf8');

test('E.164 normalization accepts the expected Mexican number shape', async () => {
  const source = await read('src/lib/customerAuthUtils.js');
  assert.match(source, /digits\.length !== 10/);
  assert.match(source, /`\+\$\{code\}\$\{digits\}`/);
});

test('CustomerContext is Auth-first and does not read legacy identity storage', async () => {
  const source = await read('src/context/CustomerContext.jsx');
  assert.match(source, /supabase\.auth\.onAuthStateChange/);
  assert.match(source, /INITIAL_SESSION/);
  assert.match(source, /SIGNED_IN/);
  assert.match(source, /SIGNED_OUT/);
  assert.match(source, /TOKEN_REFRESHED/);
  assert.match(source, /USER_UPDATED/);
  assert.match(source, /resolveMyCustomer\(\)/);
  assert.doesNotMatch(source, /localStorage\.getItem\(['"]customer_phone['"]\)/);
  assert.doesNotMatch(source, /localStorage\.getItem\(['"]customer_canonical_id['"]\)/);
});

test('UserDataContext is keyed by canonical customer id, not phone', async () => {
  const source = await read('src/context/UserDataContext.jsx');
  assert.match(source, /useCustomer\(\)/);
  assert.match(source, /USER_INFO-\$\{customerId/);
  assert.match(source, /USER_ORDERS-\$\{customerId/);
  assert.doesNotMatch(source, /eq\('phone'/);
});

test('Customer-facing pricing never queries special_prices directly', async () => {
  const source = await read('src/context/ProductContext.jsx');
  assert.doesNotMatch(source, /from\(['"]special_prices['"]\)/);
  assert.match(source, /rpc\(['"]get_my_special_prices['"]\)/);
});

test('Customer-facing rewards use Auth-safe RPCs', async () => {
  const source = await read('src/pages/MyStuff.jsx');
  assert.match(source, /rpc\(['"]get_my_customer_rewards_progress['"]\)/);
  assert.match(source, /rpc\(['"]generate_my_personal_reward_code['"]\)/);
  assert.doesNotMatch(source, /rpc\(['"]get_customer_rewards_progress['"]/);
  assert.doesNotMatch(source, /rpc\(['"]generate_personal_reward_code['"]/);
});

test('Order service uses Auth-safe RPC for authenticated customers', async () => {
  const source = await read('src/services/orderService.js');
  assert.match(source, /create_my_order_with_stock_check/);
  assert.match(source, /record_my_discount_usage_and_deactivate/);
});

test('Special-price RPC does not expose target_customer_ids', async () => {
  const source = await read('supabase/migrations/20260906204500_phase_4_customer_auth_frontend.sql');
  assert.match(source, /get_my_special_prices/);
  assert.doesNotMatch(source, /returns table\([\s\S]*target_customer_ids uuid\[\]/i);
});
