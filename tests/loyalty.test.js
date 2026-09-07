import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLoyaltyCategory, getLoyaltyCategoryLabel, LOYALTY_CATEGORIES } from '../src/lib/loyalty.js';

const NOW = new Date('2026-09-06T20:00:00.000Z');
const daysAgo = (days) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();

test('VIP by spend at 3000 within 90 days', () => {
    assert.equal(calculateLoyaltyCategory({ totalSpent: 3000, completedOrders: 0, lastOrderDate: daysAgo(90), now: NOW }), LOYALTY_CATEGORIES.VIP);
    assert.equal(calculateLoyaltyCategory({ totalSpent: 2999.99, completedOrders: 0, lastOrderDate: daysAgo(90), now: NOW }), LOYALTY_CATEGORIES.FRECUENTE);
    assert.equal(calculateLoyaltyCategory({ totalSpent: 3000.01, completedOrders: 0, lastOrderDate: daysAgo(89), now: NOW }), LOYALTY_CATEGORIES.VIP);
});

test('VIP by completed orders at 15 within 90 days', () => {
    assert.equal(calculateLoyaltyCategory({ totalSpent: 0, completedOrders: 15, lastOrderDate: daysAgo(90), now: NOW }), LOYALTY_CATEGORIES.VIP);
    assert.equal(calculateLoyaltyCategory({ totalSpent: 0, completedOrders: 14, lastOrderDate: daysAgo(90), now: NOW }), LOYALTY_CATEGORIES.FRECUENTE);
});

test('VIP requires recency', () => {
    assert.equal(calculateLoyaltyCategory({ totalSpent: 3000, completedOrders: 15, lastOrderDate: daysAgo(91), now: NOW }), LOYALTY_CATEGORIES.INICIAL);
});

test('Frecuente by spend and order thresholds within 90 days', () => {
    assert.equal(calculateLoyaltyCategory({ totalSpent: 750, completedOrders: 0, lastOrderDate: daysAgo(90), now: NOW }), LOYALTY_CATEGORIES.FRECUENTE);
    assert.equal(calculateLoyaltyCategory({ totalSpent: 750.01, completedOrders: 0, lastOrderDate: daysAgo(89), now: NOW }), LOYALTY_CATEGORIES.FRECUENTE);
    assert.equal(calculateLoyaltyCategory({ totalSpent: 0, completedOrders: 3, lastOrderDate: daysAgo(90), now: NOW }), LOYALTY_CATEGORIES.FRECUENTE);
    assert.equal(calculateLoyaltyCategory({ totalSpent: 0, completedOrders: 2, lastOrderDate: daysAgo(90), now: NOW }), LOYALTY_CATEGORIES.INICIAL);
});

test('Frecuente does not override VIP priority', () => {
    assert.equal(calculateLoyaltyCategory({ totalSpent: 3000, completedOrders: 3, lastOrderDate: daysAgo(1), now: NOW }), LOYALTY_CATEGORIES.VIP);
});

test('No orders and stale activity are Inicial', () => {
    assert.equal(calculateLoyaltyCategory({ totalSpent: 0, completedOrders: 0, lastOrderDate: null, now: NOW }), LOYALTY_CATEGORIES.INICIAL);
    assert.equal(calculateLoyaltyCategory({ totalSpent: 749.99, completedOrders: 2, lastOrderDate: daysAgo(1), now: NOW }), LOYALTY_CATEGORIES.INICIAL);
    assert.equal(calculateLoyaltyCategory({ totalSpent: 10000, completedOrders: 20, lastOrderDate: daysAgo(180), now: NOW }), LOYALTY_CATEGORIES.INICIAL);
});

test('Labels are limited to the three approved categories', () => {
    assert.equal(getLoyaltyCategoryLabel('vip'), 'Cliente VIP');
    assert.equal(getLoyaltyCategoryLabel('frecuente'), 'Cliente Frecuente');
    assert.equal(getLoyaltyCategoryLabel('inicial'), 'Cliente Inicial');
    assert.equal(getLoyaltyCategoryLabel('premium'), null);
});
