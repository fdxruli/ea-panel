import test from 'node:test';
import assert from 'node:assert/strict';
import { LOYALTY_CATEGORIES } from '../src/lib/loyalty.js';
import { buildGuestOrderMessage } from '../src/services/whatsappService.js';

test('VIP exclusivity evaluation identifies VIP products properly', () => {
    const publicProduct = { id: 'p1', name: 'Tacos', target_customer_ids: null, target_customer_tiers: null };
    const customerSpecificProduct = { id: 'p2', name: 'Pastel Juan', target_customer_ids: ['uuid-123'], target_customer_tiers: null };
    const vipExclusiveProduct = { id: 'p3', name: 'Pasta Rosa VIP', target_customer_ids: null, target_customer_tiers: ['vip'] };
    const multiTierProduct = { id: 'p4', name: 'Postre Especial', target_customer_ids: null, target_customer_tiers: ['frecuente', 'vip'] };

    const isExclusive = (p) => Boolean(
        (p.target_customer_ids && p.target_customer_ids.length > 0) ||
        (p.target_customer_tiers && p.target_customer_tiers.length > 0)
    );

    const isVipExclusive = (p) => Boolean(
        p.target_customer_tiers && p.target_customer_tiers.includes(LOYALTY_CATEGORIES.VIP)
    );

    assert.equal(isExclusive(publicProduct), false);
    assert.equal(isVipExclusive(publicProduct), false);

    assert.equal(isExclusive(customerSpecificProduct), true);
    assert.equal(isVipExclusive(customerSpecificProduct), false);

    assert.equal(isExclusive(vipExclusiveProduct), true);
    assert.equal(isVipExclusive(vipExclusiveProduct), true);

    assert.equal(isExclusive(multiTierProduct), true);
    assert.equal(isVipExclusive(multiTierProduct), true);
});

test('Audience eligibility check blocks unauthorized buyers', () => {
    const isEligibleToPurchase = (product, customerId, customerTier) => {
        // 1. Público
        const hasSpecific = Array.isArray(product.target_customer_ids) && product.target_customer_ids.length > 0;
        const hasTiers = Array.isArray(product.target_customer_tiers) && product.target_customer_tiers.length > 0;

        if (!hasSpecific && !hasTiers) {
            return { eligible: true };
        }

        // 2. Por cliente específico
        if (hasSpecific) {
            if (customerId && product.target_customer_ids.includes(customerId)) {
                return { eligible: true };
            }
            if (!hasTiers) {
                return { eligible: false, reason: 'Producto exclusivo asignado a otro cliente' };
            }
        }

        // 3. Por categoría
        if (hasTiers) {
            if (customerTier && product.target_customer_tiers.includes(customerTier)) {
                return { eligible: true };
            }
            return { eligible: false, reason: `Producto exclusivo para nivel ${product.target_customer_tiers.join(', ')}` };
        }

        return { eligible: false, reason: 'Acceso no permitido' };
    };

    const vipProduct = { target_customer_ids: null, target_customer_tiers: ['vip'] };

    // Anónimo
    assert.equal(isEligibleToPurchase(vipProduct, null, null).eligible, false);

    // Cliente Inicial
    assert.equal(isEligibleToPurchase(vipProduct, 'user-1', 'inicial').eligible, false);

    // Cliente Frecuente
    assert.equal(isEligibleToPurchase(vipProduct, 'user-2', 'frecuente').eligible, false);

    // Cliente VIP
    assert.equal(isEligibleToPurchase(vipProduct, 'user-3', 'vip').eligible, true);
});

test('Modifier structure sanitization removes empty groups and empty options', () => {
    const rawGroups = [
        {
            id: 'g1',
            name: 'Complementos y Extras',
            required: false,
            options: [
                { id: 'o1', name: 'Extra pollo', price_delta: '25' },
                { id: 'o2', name: 'Sin cebolla', price_delta: 0 },
                { id: 'o3', name: '   ', price_delta: 10 } // empty name
            ]
        },
        {
            id: 'g2',
            name: '   ', // empty group
            options: [{ id: 'o4', name: 'Test', price_delta: 5 }]
        },
        {
            id: 'g3',
            name: 'Grupo sin opciones válidas',
            options: []
        }
    ];

    const cleanModifiers = (groups) => {
        return groups
            .filter(g => g.name && g.name.trim().length > 0)
            .map(g => ({
                id: g.id,
                name: g.name.trim(),
                required: Boolean(g.required),
                options: (g.options || [])
                    .filter(o => o.name && o.name.trim().length > 0)
                    .map(o => ({
                        id: o.id,
                        name: o.name.trim(),
                        price_delta: Number(o.price_delta) || 0
                    }))
            }))
            .filter(g => g.options.length > 0);
    };

    const cleaned = cleanModifiers(rawGroups);
    assert.equal(cleaned.length, 1);
    assert.equal(cleaned[0].name, 'Complementos y Extras');
    assert.equal(cleaned[0].options.length, 2);
    assert.equal(cleaned[0].options[0].name, 'Extra pollo');
    assert.equal(cleaned[0].options[0].price_delta, 25);
    assert.equal(cleaned[0].options[1].name, 'Sin cebolla');
    assert.equal(cleaned[0].options[1].price_delta, 0);
});

test('Item price with positive, zero, and negative modifiers is calculated accurately', () => {
    const basePrice = 120.00;
    const selectedModifiers = [
        { id: 'opt_1', name: 'Extra pollo', price_delta: 25.00 },
        { id: 'opt_2', name: 'Sin cebolla', price_delta: 0.00 },
        { id: 'opt_3', name: 'Sin salsa especial', price_delta: -5.00 }
    ];

    const computeUnitPrice = (price, modifiers) => {
        const modifiersTotal = (modifiers || []).reduce(
            (sum, mod) => sum + (Number(mod.price_delta) || 0),
            0
        );
        return Math.max(0, price + modifiersTotal);
    };

    const finalUnitPrice = computeUnitPrice(basePrice, selectedModifiers);
    assert.equal(finalUnitPrice, 140.00); // 120 + 25 + 0 - 5 = 140

    // Con cantidad
    const quantity = 3;
    const itemSubtotal = finalUnitPrice * quantity;
    assert.equal(itemSubtotal, 420.00);
});

test('Order items payload formats selected_modifiers and item_notes properly for RPC', () => {
    const rawCartItems = [
        {
            id: 'prod_1',
            quantity: 2,
            price: 135,
            cost: 40,
            selected_modifiers: [
                { group_id: 'g1', option_id: 'o1', name: 'Extra Pollo', price_delta: 35 }
            ],
            item_notes: 'Sin cebolla'
        },
        {
            id: 'prod_2',
            quantity: 1,
            price: 50,
            cost: 15
        }
    ];

    const p_cart_items = rawCartItems.map((item) => ({
        product_id: item.id || item.product_id,
        quantity: item.quantity,
        price: item.price,
        cost: item.cost || 0,
        selected_modifiers: Array.isArray(item.selected_modifiers) ? item.selected_modifiers : [],
        item_notes: typeof item.item_notes === 'string' && item.item_notes.trim() ? item.item_notes.trim() : null,
    }));

    assert.equal(p_cart_items.length, 2);
    assert.equal(p_cart_items[0].product_id, 'prod_1');
    assert.equal(p_cart_items[0].selected_modifiers.length, 1);
    assert.equal(p_cart_items[0].selected_modifiers[0].name, 'Extra Pollo');
    assert.equal(p_cart_items[0].item_notes, 'Sin cebolla');

    assert.equal(p_cart_items[1].product_id, 'prod_2');
    assert.deepEqual(p_cart_items[1].selected_modifiers, []);
    assert.equal(p_cart_items[1].item_notes, null);
});

test('WhatsApp order message displays customized add-on modifiers and item notes', () => {
    const cartItems = [
        {
            name: 'Pasta Rosa con Pollo',
            quantity: 1,
            price: 155,
            selected_modifiers: [
                { name: 'Extra Pollo', price_delta: 35 },
                { name: 'Sin Cebolla', price_delta: 0 }
            ],
            item_notes: 'Bien caliente por favor'
        }
    ];

    const msg = buildGuestOrderMessage({ orderCode: 'EA-1234', cartItems, total: 155 });
    assert.ok(msg.includes('*Pedido N°: EA-1234*'));
    assert.ok(msg.includes('1x Pasta Rosa con Pollo'));
    assert.ok(msg.includes('Complementos: Extra Pollo, Sin Cebolla'));
    assert.ok(msg.includes('Nota: Bien caliente por favor'));
    assert.ok(msg.includes('*Total: $155.00*'));
});

test('Modifier options linked to inventory ingredients preserve ingredient_id, quantity_used, and calculate stock correctly', () => {
    const rawGroups = [
        {
            id: 'g1',
            name: 'Complementos de Cocina',
            required: false,
            options: [
                { 
                    id: 'o1', 
                    name: 'Extra Queso Parmesano 30g', 
                    price_delta: 20,
                    ingredient_id: '550e8400-e29b-41d4-a716-446655440000',
                    quantity_used: '30'
                },
                { 
                    id: 'o2', 
                    name: 'Sin Sal', 
                    price_delta: 0,
                    ingredient_id: null,
                    quantity_used: null
                }
            ]
        }
    ];

    const cleanModifiers = (groups) => {
        return groups
            .filter(g => g.name && g.name.trim().length > 0)
            .map(g => ({
                id: g.id,
                name: g.name.trim(),
                required: Boolean(g.required),
                options: (g.options || [])
                    .filter(o => o.name && o.name.trim().length > 0)
                    .map(o => ({
                        id: o.id,
                        name: o.name.trim(),
                        price_delta: Number(o.price_delta) || 0,
                        ingredient_id: o.ingredient_id || null,
                        quantity_used: o.ingredient_id && Number(o.quantity_used) > 0 ? Number(o.quantity_used) : null
                    }))
            }))
            .filter(g => g.options.length > 0);
    };

    const cleaned = cleanModifiers(rawGroups);
    assert.equal(cleaned[0].options[0].ingredient_id, '550e8400-e29b-41d4-a716-446655440000');
    assert.equal(cleaned[0].options[0].quantity_used, 30);
    assert.equal(cleaned[0].options[1].ingredient_id, null);
    assert.equal(cleaned[0].options[1].quantity_used, null);

    // Simulación de cálculo de stock deducible
    const orderItem = {
        quantity: 3,
        selected_modifiers: [
            {
                ingredient_id: '550e8400-e29b-41d4-a716-446655440000',
                quantity_used: 30
            }
        ]
    };

    const totalDeduction = orderItem.selected_modifiers.reduce((sum, mod) => {
        return sum + (orderItem.quantity * (mod.quantity_used || 0));
    }, 0);

    assert.equal(totalDeduction, 90); // 3 porciones x 30g = 90g
});

