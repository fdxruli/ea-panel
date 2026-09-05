const toFiniteNumber = (value) => {
    if (typeof value !== 'number' && typeof value !== 'string') return NaN;
    if (typeof value === 'string' && !value.trim()) return NaN;
    const number = Number(value);
    return Number.isFinite(number) ? number : NaN;
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

        const existing = items.get(item.id);
        if (existing) {
            const combinedQuantity = existing.quantity + quantity;
            if (Number.isFinite(combinedQuantity) && Number.isFinite(existing.price * combinedQuantity)) {
                items.set(item.id, { ...existing, quantity: combinedQuantity });
            }
        } else {
            items.set(item.id, { ...item, price, quantity });
        }
    }

    return [...items.values()];
};

export const addCartItem = (items, product, quantity = 1) => {
    const [item] = normalizeCartItems([{ ...product, quantity }]);
    if (!item) return items;
    return normalizeCartItems([...items, item]);
};

export const updateCartQuantity = (items, productId, value) => {
    const quantity = toFiniteNumber(value);
    if (!Number.isFinite(quantity)) return items;
    if (quantity < 1) return items.filter(item => item.id !== productId);
    return items.map(item => item.id === productId && Number.isFinite(item.price * quantity)
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
        const price = toFiniteNumber(product.price);
        if (Number.isFinite(price) && price >= 0 && price !== item.price
            && Number.isFinite(price * item.quantity)) {
            result.pricesChanged = true;
            nextItems.push({ ...item, price });
        } else {
            nextItems.push(item);
        }
    }
    if (result.removedNames.length || result.pricesChanged) result.items = nextItems;
    return result;
};
