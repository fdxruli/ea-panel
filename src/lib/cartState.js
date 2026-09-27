const toFiniteNumber = (value) => {
    if (typeof value !== 'number' && typeof value !== 'string') return NaN;
    if (typeof value === 'string' && !value.trim()) return NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
};

export const getCartLineKey = (item) => {
    if (!item) return '';
    const baseId = String(item.id || item.product_id || '');
    const modifiers = Array.isArray(item.selected_modifiers) && item.selected_modifiers.length > 0
        ? [...item.selected_modifiers]
            .map(m => `${m.group_id || ''}:${m.option_id || m.id || ''}:${m.name || ''}:${toFiniteNumber(m.price_delta) || 0}`)
            .sort()
            .join('|')
        : '';
    const notes = typeof item.item_notes === 'string' ? item.item_notes.trim().toLowerCase() : '';
    if (!modifiers && !notes) return baseId;
    return `${baseId}__mods[${modifiers}]__notes[${notes}]`;
};

export const normalizeCartItems = (value) => {
    if (!Array.isArray(value)) return [];
    const items = new Map();

    for (const item of value) {
        if (!item || typeof item !== 'object') continue;
        const validId = (typeof item.id === 'string' && item.id.trim().length > 0)
            || (typeof item.id === 'number' && Number.isFinite(item.id));
        const price = toFiniteNumber(item.price);
        const quantity = toFiniteNumber(item.quantity);
        if (!validId || typeof item.name !== 'string' || !item.name.trim()
            || !Number.isFinite(price) || price < 0
            || !Number.isFinite(quantity) || quantity <= 0
            || !Number.isFinite(price * quantity)) continue;

        const lineKey = item.line_id || getCartLineKey(item);
        const hasModifiers = Array.isArray(item.selected_modifiers) && item.selected_modifiers.length > 0;
        const hasNotes = typeof item.item_notes === 'string' && item.item_notes.trim().length > 0;

        const existing = items.get(lineKey);
        if (existing) {
            const combinedQuantity = existing.quantity + quantity;
            if (Number.isFinite(combinedQuantity) && Number.isFinite(existing.price * combinedQuantity)) {
                items.set(lineKey, { ...existing, quantity: combinedQuantity });
            }
        } else {
            const normalized = { ...item, price, quantity };
            if (hasModifiers) {
                normalized.selected_modifiers = item.selected_modifiers;
            }
            if (hasNotes) {
                normalized.item_notes = item.item_notes.trim();
            }
            if (lineKey !== String(item.id)) {
                normalized.line_id = lineKey;
            }
            items.set(lineKey, normalized);
        }
    }

    return [...items.values()];
};

export const addCartItem = (items, product, quantity = 1) => {
    const [item] = normalizeCartItems([{ ...product, quantity }]);
    if (!item) return items;
    return normalizeCartItems([...items, item]);
};

export const updateCartQuantity = (items, key, value) => {
    const quantity = toFiniteNumber(value);
    const targetKey = String(key);
    if (!Number.isFinite(quantity)) return items;
    const isTarget = (item) => (item.line_id ? String(item.line_id) === targetKey : String(item.id) === targetKey);

    if (quantity < 1) return items.filter(item => !isTarget(item));
    return items.map(item => isTarget(item) && Number.isFinite(item.price * quantity)
        ? { ...item, quantity }
        : item);
};

export const reconcileCartItems = (items, products, { loading = false, error = null, catalogReady = false } = {}) => {
    const result = { items, removedNames: [], pricesChanged: false };
    // Un fallo de carga no demuestra que los productos hayan sido eliminados.
    if (loading || error || !catalogReady || !Array.isArray(products)) return result;

    const catalog = new Map(products.map(product => [product.id, product]));
    const nextItems = [];
    for (const item of items) {
        const product = catalog.get(item.id);
        if (!product || product.is_out_of_stock || product.is_active === false) {
            result.removedNames.push(item.name);
            continue;
        }
        const basePrice = toFiniteNumber(product.price);
        if (!Number.isFinite(basePrice) || basePrice < 0) {
            nextItems.push(item);
            continue;
        }
        const modifierDeltaSum = Array.isArray(item.selected_modifiers)
            ? item.selected_modifiers.reduce((sum, m) => sum + (toFiniteNumber(m.price_delta) || 0), 0)
            : 0;
        const expectedPrice = Math.max(0, basePrice + modifierDeltaSum);

        if (Number.isFinite(expectedPrice) && expectedPrice >= 0 && expectedPrice !== item.price
            && Number.isFinite(expectedPrice * item.quantity)) {
            result.pricesChanged = true;
            nextItems.push({ ...item, price: expectedPrice });
        } else {
            nextItems.push(item);
        }
    }
    if (result.removedNames.length || result.pricesChanged) result.items = nextItems;
    return result;
};
