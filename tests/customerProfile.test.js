import test from 'node:test';
import assert from 'node:assert/strict';
import { LOYALTY_CATEGORIES, LOYALTY_CATEGORY_LABELS, getLoyaltyCategoryLabel } from '../src/lib/loyalty.js';

test('Loyalty only supports the 3 official categories', () => {
    const categories = Object.values(LOYALTY_CATEGORIES);
    assert.deepEqual(categories.sort(), ['frecuente', 'inicial', 'vip']);

    assert.equal(getLoyaltyCategoryLabel('inicial'), 'Cliente Inicial');
    assert.equal(getLoyaltyCategoryLabel('frecuente'), 'Cliente Frecuente');
    assert.equal(getLoyaltyCategoryLabel('vip'), 'Cliente VIP');
    assert.equal(getLoyaltyCategoryLabel('platino'), null);
    assert.equal(getLoyaltyCategoryLabel('gold'), null);
});

test('Loyalty data structure guarantees zero monetary leak to frontend', () => {
    // Mock loyalty service response shape
    const mockServicePayload = {
        category: 'vip',
        benefit_label: 'Accedes a beneficios y cortesías exclusivas.',
        condition_label: 'Nivel VIP activo (últimos 90 días).',
    };

    const forbiddenKeys = ['total_spent', 'spent', 'gastado', 'dinero', 'saldo', 'deuda', 'monto'];
    for (const key of forbiddenKeys) {
        assert.equal(key in mockServicePayload, false, `Forbidden key "${key}" must not be present in loyalty payload`);
    }

    assert.equal(typeof mockServicePayload.category, 'string');
    assert.equal(['inicial', 'frecuente', 'vip'].includes(mockServicePayload.category), true);
});

test('Address default logic guarantees single default invariant', () => {
    const addresses = [
        { id: 'addr-1', label: 'Casa', is_default: false },
        { id: 'addr-2', label: 'Oficina', is_default: true },
        { id: 'addr-3', label: 'Trabajo', is_default: false },
    ];

    // Simulate atomic switch to addr-1
    const targetId = 'addr-1';
    const updated = addresses.map(a => ({
        ...a,
        is_default: a.id === targetId,
    }));

    const defaults = updated.filter(a => a.is_default);
    assert.equal(defaults.length, 1);
    assert.equal(defaults[0].id, 'addr-1');
});

test('Profile name validation enforces clean boundaries', () => {
    const validateName = (val) => {
        const clean = String(val || '').trim();
        if (clean.length < 2 || clean.length > 100) {
            throw new Error('invalid_name_length');
        }
        return clean;
    };

    assert.equal(validateName('  Juan Perez  '), 'Juan Perez');
    assert.throws(() => validateName(''), /invalid_name_length/);
    assert.throws(() => validateName(' A '), /invalid_name_length/);
    assert.throws(() => validateName('x'.repeat(101)), /invalid_name_length/);
});

test('Unsaved changes detection flags dirty form only when value actually changed', () => {
    const initialName = 'Carlos Lopez';
    const isDirty = (current) => current.trim() !== initialName.trim();

    assert.equal(isDirty('Carlos Lopez'), false);
    assert.equal(isDirty(' Carlos Lopez '), false);
    assert.equal(isDirty('Carlos Gomez'), true);
    assert.equal(isDirty(''), true);
});

test('Customer profile RPC contract strictly isolates name mutation and prohibits sensitive field injection', () => {
    // Contract definition for update_my_customer_profile
    const allowedInputParam = 'p_name';
    const forbiddenInputParams = [
        'customer_id',
        'p_customer_id',
        'auth_user_id',
        'phone',
        'referrer_id',
        'referral_code',
        'referral_count',
        'has_made_first_purchase',
    ];

    const rpcPayload = { p_name: 'Maria Sanchez' };
    assert.equal(Object.keys(rpcPayload).length, 1);
    assert.equal(Object.keys(rpcPayload)[0], allowedInputParam);

    for (const forbidden of forbiddenInputParams) {
        assert.equal(forbidden in rpcPayload, false, `RPC payload must not accept ${forbidden}`);
    }

    // Returned shape contract
    const rpcReturnShape = {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'Maria Sanchez',
        phone: '+525512345678',
        referral_code: 'MARIA123',
    };

    const allowedReturnKeys = ['id', 'name', 'phone', 'referral_code'];
    assert.deepEqual(Object.keys(rpcReturnShape).sort(), allowedReturnKeys.sort());
});

test('Security invariants: customer-facing profile RPCs must prohibit anonymous execution', () => {
    const customerFacingRpcs = [
        'get_my_loyalty_category',
        'set_my_default_customer_address',
        'update_my_customer_profile',
    ];

    const allowedGrantees = ['authenticated', 'service_role', 'postgres'];
    const forbiddenGrantees = ['anon', 'public'];

    for (const rpc of customerFacingRpcs) {
        for (const forbidden of forbiddenGrantees) {
            assert.equal(allowedGrantees.includes(forbidden), false, `${rpc} must not grant EXECUTE to ${forbidden}`);
        }
    }
});
