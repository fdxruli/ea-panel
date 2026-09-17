import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDiscountAmount, formatDiscountLabel } from '../src/lib/discountCalculation.js';

const items = [
  { id: 'prod-1', category_id: 'cat-food', price: 100, quantity: 2 }, // $200
  { id: 'prod-2', category_id: 'cat-drinks', price: 50, quantity: 1 }, // $50
];
const subtotal = 250;

test('calculateDiscountAmount returns 0 for invalid or empty inputs', () => {
  assert.equal(calculateDiscountAmount(0, items, { type: 'global', value: 10 }), 0);
  assert.equal(calculateDiscountAmount(subtotal, [], { type: 'global', value: 10 }), 0);
  assert.equal(calculateDiscountAmount(subtotal, items, null), 0);
  assert.equal(calculateDiscountAmount(subtotal, items, { type: 'global', value: -10 }), 0);
  assert.equal(calculateDiscountAmount(subtotal, items, { type: 'global', value: 0 }), 0);
});

test('calculateDiscountAmount handles global percentage discount', () => {
  const discount = { type: 'global', value: 20, discount_mode: 'percentage' };
  assert.equal(calculateDiscountAmount(subtotal, items, discount), 50); // 20% of 250 = 50
});

test('calculateDiscountAmount handles global fixed amount discount', () => {
  const discount = { type: 'global', value: 30, discount_mode: 'fixed' };
  assert.equal(calculateDiscountAmount(subtotal, items, discount), 30);
});

test('calculateDiscountAmount caps fixed amount discount at subtotal (never negative total)', () => {
  const discount = { type: 'global', value: 300, discount_mode: 'fixed' };
  assert.equal(calculateDiscountAmount(subtotal, items, discount), 250); // capped at subtotal
});

test('calculateDiscountAmount handles category percentage discount', () => {
  const discount = { type: 'category', target_id: 'cat-food', value: 10, discount_mode: 'percentage' };
  assert.equal(calculateDiscountAmount(subtotal, items, discount), 20); // 10% of 200 = 20
});

test('calculateDiscountAmount handles category fixed amount discount', () => {
  const discount = { type: 'category', target_id: 'cat-drinks', value: 20, discount_mode: 'fixed' };
  assert.equal(calculateDiscountAmount(subtotal, items, discount), 20); // $20 off $50 drinks

  const largeDiscount = { type: 'category', target_id: 'cat-drinks', value: 80, discount_mode: 'fixed' };
  assert.equal(calculateDiscountAmount(subtotal, items, largeDiscount), 50); // capped at category subtotal ($50)
});

test('calculateDiscountAmount handles product percentage discount', () => {
  const discount = { type: 'product', target_id: 'prod-1', value: 15, discount_mode: 'percentage' };
  assert.equal(calculateDiscountAmount(subtotal, items, discount), 30); // 15% of 200 = 30
});

test('calculateDiscountAmount handles product fixed amount discount', () => {
  const discount = { type: 'product', target_id: 'prod-2', value: 35, discount_mode: 'fixed' };
  assert.equal(calculateDiscountAmount(subtotal, items, discount), 35);

  const excessDiscount = { type: 'product', target_id: 'prod-2', value: 90, discount_mode: 'fixed' };
  assert.equal(calculateDiscountAmount(subtotal, items, excessDiscount), 50); // capped at product total ($50)
});

test('calculateDiscountAmount returns 0 if targeted category or product not in cart', () => {
  const discountCat = { type: 'category', target_id: 'non-existent', value: 20 };
  assert.equal(calculateDiscountAmount(subtotal, items, discountCat), 0);

  const discountProd = { type: 'product', target_id: 'non-existent', value: 20 };
  assert.equal(calculateDiscountAmount(subtotal, items, discountProd), 0);
});

test('formatDiscountLabel formats percentage and fixed amounts correctly', () => {
  assert.equal(formatDiscountLabel({ value: 20, discount_mode: 'percentage' }), '20%');
  assert.equal(formatDiscountLabel({ value: 15 }), '15%'); // defaults to percentage
  assert.equal(formatDiscountLabel({ value: 30, discount_mode: 'fixed' }), '$30');
  assert.equal(formatDiscountLabel({ value: 25.5, discount_mode: 'fixed' }), '$25.50');
  assert.equal(formatDiscountLabel(null), '');
});
