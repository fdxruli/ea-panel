import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLocalDateString,
  getSpecialPriceStatus,
  getSpecialPriceBadgeInfo,
  calculateProductSavings,
  filterSpecialPrices,
  calculateCategoryImpact,
} from '../src/lib/specialPriceCalculations.js';

test('getLocalDateString returns YYYY-MM-DD format', () => {
  const dateStr = getLocalDateString(new Date('2026-09-17T15:00:00Z'));
  assert.match(dateStr, /^\d{4}-\d{2}-\d{2}$/);
});

test('getSpecialPriceStatus handles paused state', () => {
  const price = {
    is_active: false,
    start_date: '2026-09-01',
    end_date: '2026-09-30',
  };
  assert.equal(getSpecialPriceStatus(price, '2026-09-17'), 'paused');
  assert.deepEqual(getSpecialPriceBadgeInfo(price, '2026-09-17'), { label: 'Pausada', key: 'paused' });
});

test('getSpecialPriceStatus handles active/vigente state', () => {
  const price = {
    is_active: true,
    start_date: '2026-09-10',
    end_date: '2026-09-20',
  };
  assert.equal(getSpecialPriceStatus(price, '2026-09-17'), 'active');
  assert.deepEqual(getSpecialPriceBadgeInfo(price, '2026-09-17'), { label: 'Vigente', key: 'active' });
});

test('getSpecialPriceStatus handles scheduled/futura state', () => {
  const price = {
    is_active: true,
    start_date: '2026-09-20',
    end_date: '2026-09-30',
  };
  assert.equal(getSpecialPriceStatus(price, '2026-09-17'), 'scheduled');
  assert.deepEqual(getSpecialPriceBadgeInfo(price, '2026-09-17'), { label: 'Programada', key: 'scheduled' });
});

test('getSpecialPriceStatus handles expired/pasada state', () => {
  const price = {
    is_active: true,
    start_date: '2026-09-01',
    end_date: '2026-09-15',
  };
  assert.equal(getSpecialPriceStatus(price, '2026-09-17'), 'expired');
  assert.deepEqual(getSpecialPriceBadgeInfo(price, '2026-09-17'), { label: 'Expirada', key: 'expired' });
});

test('calculateProductSavings computes savings correctly', () => {
  const result = calculateProductSavings(150, 120, 60);
  assert.equal(result.originalPrice, 150);
  assert.equal(result.overridePrice, 120);
  assert.equal(result.savingsAmount, 30);
  assert.equal(result.savingsPercent, 20);
  assert.equal(result.isIncrease, false);
  assert.equal(result.isBelowCost, false);
  assert.equal(result.marginAmount, 60);
  assert.equal(result.marginPercent, 50);
});

test('calculateProductSavings detects price increase and below cost', () => {
  const higherPrice = calculateProductSavings(150, 180, 50);
  assert.equal(higherPrice.isIncrease, true);
  assert.equal(higherPrice.savingsAmount, 0);

  const lossPrice = calculateProductSavings(150, 40, 60);
  assert.equal(lossPrice.isBelowCost, true);
  assert.equal(lossPrice.marginAmount, -20);
});

test('filterSpecialPrices filters by tab and search query', () => {
  const mockPrices = [
    { id: '1', product_name: 'Alitas BBQ', is_active: true, start_date: '2026-09-10', end_date: '2026-09-20', override_price: 99, product_id: 'p1' },
    { id: '2', product_name: 'Boneless Bufalo', is_active: false, start_date: '2026-09-10', end_date: '2026-09-20', override_price: 89, product_id: 'p2' },
    { id: '3', category_name: 'Bebidas', is_active: true, start_date: '2026-08-01', end_date: '2026-08-30', override_price: 25, category_id: 'c1' },
    { id: '4', product_name: 'Hamburguesa Doble', is_active: true, start_date: '2026-09-25', end_date: '2026-09-30', override_price: 110, product_id: 'p3', target_customer_ids: ['cust-1'] },
  ];

  // Tab active: should return 'Alitas BBQ' (active) and 'Hamburguesa Doble' (scheduled)
  const activeOnly = filterSpecialPrices(mockPrices, { tab: 'active', today: '2026-09-17' });
  assert.equal(activeOnly.length, 2);

  // Tab paused: should return 'Boneless Bufalo'
  const pausedOnly = filterSpecialPrices(mockPrices, { tab: 'paused', today: '2026-09-17' });
  assert.equal(pausedOnly.length, 1);
  assert.equal(pausedOnly[0].product_name, 'Boneless Bufalo');

  // Search 'alitas'
  const searchResult = filterSpecialPrices(mockPrices, { search: 'alitas', tab: 'all', today: '2026-09-17' });
  assert.equal(searchResult.length, 1);
  assert.equal(searchResult[0].product_name, 'Alitas BBQ');

  // Filter by audience: specific
  const specificOnly = filterSpecialPrices(mockPrices, { audience: 'specific', tab: 'all', today: '2026-09-17' });
  assert.equal(specificOnly.length, 1);
  assert.equal(specificOnly[0].product_name, 'Hamburguesa Doble');
});

test('calculateCategoryImpact analyzes category products correctly', () => {
  const mockProducts = [
    { id: 'p1', name: 'Refresco Cola', category_id: 'c-drinks', price: 25 },
    { id: 'p2', name: 'Agua Mineral', category_id: 'c-drinks', price: 30 },
    { id: 'p3', name: 'Cerveza Corona', category_id: 'c-drinks', price: 45 },
    { id: 'p4', name: 'Alitas', category_id: 'c-food', price: 120 },
  ];

  // Override de $35 en c-drinks:
  // Refresco Cola ($25 -> $35): encarece (diff -10)
  // Agua Mineral ($30 -> $35): encarece (diff -5)
  // Cerveza ($45 -> $35): abarata (diff +10)
  const impact = calculateCategoryImpact(mockProducts, 'c-drinks', 35);
  assert.equal(impact.count, 3);
  assert.equal(impact.minPrice, 25);
  assert.equal(impact.maxPrice, 45);
  assert.equal(impact.cheaperCount, 1);
  assert.equal(impact.moreExpensiveCount, 2);
});
