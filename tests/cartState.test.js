import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCartItems, addCartItem, updateCartQuantity, reconcileCartItems } from '../src/lib/cartState.js';

const product = { id: 'wings', name: 'Alitas', price: 100, category_id: 'food' };
const cart = [{ ...product, quantity: 2 }];

test('invalid persisted roots become an empty cart', () => {
    for (const value of [null, {}, 'cart', 5, false]) {
        assert.deepEqual(normalizeCartItems(value), []);
    }
});

test('corrupt lines are discarded while valid products and metadata survive', () => {
    const value = [null, {}, false, { ...product, quantity: -1 },
        { ...product, quantity: 'Infinity' }, { ...product, quantity: 1, price: null },
        { ...product, quantity: 1, price: -5 }, { ...product, quantity: true },
        { ...product, quantity: 1, price: ' ' }, { ...product, quantity: 2, id: {} },
        { ...product, quantity: 2, name: {} }, { ...product, quantity: '2', price: '100.50' }];
    assert.deepEqual(normalizeCartItems(value), [{ ...product, quantity: 2, price: 100.5 }]);
});

test('duplicate products are combined and string quantities add numerically', () => {
    const restored = normalizeCartItems([{ ...product, quantity: '2' }, { ...product, quantity: 1 }]);
    assert.deepEqual(addCartItem(restored, product, '2'), [{ ...product, quantity: 5 }]);
});

test('invalid additions leave the cart intact and zero-priced products are supported', () => {
    assert.strictEqual(addCartItem(cart, product, Infinity), cart);
    assert.strictEqual(addCartItem(cart, product, -1), cart);
    assert.deepEqual(addCartItem([], { ...product, price: 0 }), [{ ...product, price: 0, quantity: 1 }]);
});

test('quantity changes reject invalid values and preserve removal at zero', () => {
    for (const value of [NaN, Infinity, 'invalid', null, true]) {
        assert.strictEqual(updateCartQuantity(cart, product.id, value), cart);
    }
    assert.equal(updateCartQuantity(cart, product.id, '3')[0].quantity, 3);
    assert.deepEqual(updateCartQuantity(cart, product.id, 0), []);
    assert.equal(cart[0].quantity, 2);
});

test('failed, loading, or unconfirmed catalogs never empty the saved cart', () => {
    for (const options of [
        { loading: true, catalogReady: true },
        { error: 'Failed to fetch', catalogReady: true },
        { error: null, catalogReady: false },
        {},
    ]) {
        const result = reconcileCartItems(cart, [], options);
        assert.strictEqual(result.items, cart);
        assert.deepEqual(result.removedNames, []);
    }
});

test('a confirmed empty catalog removes unavailable products', () => {
    const result = reconcileCartItems(cart, [], { catalogReady: true });
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.removedNames, ['Alitas']);
});

test('reconciliation removes unavailable products and updates even one-cent changes', () => {
    const items = [...cart, { id: 'fries', name: 'Papas', price: 50, quantity: 1 }];
    const result = reconcileCartItems(items, [
        { ...product, price: '100.01' },
        { id: 'fries', is_out_of_stock: true },
    ], { catalogReady: true });
    assert.deepEqual(result.items, [{ ...product, quantity: 2, price: 100.01 }]);
    assert.deepEqual(result.removedNames, ['Papas']);
    assert.equal(result.pricesChanged, true);
    assert.equal(cart[0].price, 100);
});

test('unchanged or invalid catalog prices preserve the current cart', () => {
    for (const price of [100, null, 'invalid', Infinity, -1]) {
        assert.strictEqual(reconcileCartItems(cart, [{ ...product, price }], { catalogReady: true }).items, cart);
    }
});

test('items with distinct modifiers or notes create separate cart lines', () => {
    const modA = [{ group_id: 'g1', option_id: 'o1', name: 'Extra Pollo', price_delta: 35 }];
    const modB = [{ group_id: 'g1', option_id: 'o2', name: 'Sin Cebolla', price_delta: 0 }];

    const itemA = { ...product, price: 135, quantity: 1, selected_modifiers: modA };
    const itemB = { ...product, price: 100, quantity: 2, selected_modifiers: modB };
    const itemC = { ...product, price: 100, quantity: 1, selected_modifiers: modB, item_notes: 'Sin picante' };

    const normalized = normalizeCartItems([itemA, itemB, itemC]);
    assert.equal(normalized.length, 3);
    assert.equal(normalized[0].price, 135);
    assert.equal(normalized[0].quantity, 1);
    assert.equal(normalized[1].quantity, 2);
    assert.equal(normalized[2].item_notes, 'Sin picante');
});

test('items with identical modifiers and notes combine quantities', () => {
    const modA = [{ group_id: 'g1', option_id: 'o1', name: 'Extra Pollo', price_delta: 35 }];
    const item1 = { ...product, price: 135, quantity: 1, selected_modifiers: modA, item_notes: 'Bien cocido' };
    const item2 = { ...product, price: 135, quantity: 2, selected_modifiers: modA, item_notes: 'Bien cocido' };

    const result = normalizeCartItems([item1, item2]);
    assert.equal(result.length, 1);
    assert.equal(result[0].quantity, 3);
    assert.equal(result[0].price, 135);
});

test('updating quantity and removing customized items targets specific line', () => {
    const modA = [{ group_id: 'g1', option_id: 'o1', name: 'Extra Pollo', price_delta: 35 }];
    const modB = [{ group_id: 'g1', option_id: 'o2', name: 'Sin Cebolla', price_delta: 0 }];

    const itemA = { ...product, price: 135, quantity: 1, selected_modifiers: modA };
    const itemB = { ...product, price: 100, quantity: 2, selected_modifiers: modB };

    const cartWithMods = normalizeCartItems([itemA, itemB]);
    const lineAId = cartWithMods[0].line_id;
    const lineBId = cartWithMods[1].line_id;

    assert.ok(lineAId);
    assert.ok(lineBId);
    assert.notEqual(lineAId, lineBId);

    // Update quantity of line A
    const updated = updateCartQuantity(cartWithMods, lineAId, 4);
    assert.equal(updated.find(i => i.line_id === lineAId).quantity, 4);
    assert.equal(updated.find(i => i.line_id === lineBId).quantity, 2);

    // Remove line A by setting quantity 0
    const afterRemoval = updateCartQuantity(updated, lineAId, 0);
    assert.equal(afterRemoval.length, 1);
    assert.equal(afterRemoval[0].line_id, lineBId);
});

test('reconciliation recalculates price deltas when catalog base price changes', () => {
    const mod = [{ group_id: 'g1', option_id: 'o1', name: 'Extra Pollo', price_delta: 35 }];
    const customizedCart = normalizeCartItems([{
        ...product,
        price: 135,
        quantity: 2,
        selected_modifiers: mod
    }]);

    // Catalog base price changed from 100 to 120
    const result = reconcileCartItems(customizedCart, [{ ...product, price: 120 }], { catalogReady: true });
    assert.equal(result.pricesChanged, true);
    assert.equal(result.items[0].price, 155); // 120 + 35
    assert.equal(result.items[0].quantity, 2);
});
