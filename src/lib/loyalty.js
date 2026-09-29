export const LOYALTY_CATEGORIES = Object.freeze({
    INICIAL: 'inicial',
    FRECUENTE: 'frecuente',
    VIP: 'vip',
});

export const LOYALTY_CATEGORY_LABELS = Object.freeze({
    [LOYALTY_CATEGORIES.INICIAL]: 'Cliente Inicial',
    [LOYALTY_CATEGORIES.FRECUENTE]: 'Cliente Frecuente',
    [LOYALTY_CATEGORIES.VIP]: 'Cliente VIP',
});

const RECENCY_DAYS = 90;

export function calculateLoyaltyCategory({ totalSpent = 0, completedOrders = 0, lastOrderDate = null, now = new Date(), tiers = [] }) {
    const spent = Number(totalSpent) || 0;
    const orders = Number(completedOrders) || 0;

    // Si se pasan niveles dinámicos configurados
    if (Array.isArray(tiers) && tiers.length > 0) {
        const sortedTiers = [...tiers].sort((a, b) => (b.rank_priority || 0) - (a.rank_priority || 0));
        const defaultTier = sortedTiers.find(t => t.is_default) || { slug: LOYALTY_CATEGORIES.INICIAL };

        if (spent <= 0 && orders <= 0) return defaultTier.slug;

        const referenceNow = now instanceof Date ? now : new Date(now);
        const lastOrder = lastOrderDate ? new Date(lastOrderDate) : null;
        const hasValidLastOrder = lastOrder && !Number.isNaN(lastOrder.getTime());

        for (const tier of sortedTiers) {
            if (tier.is_default || !tier.is_active) continue;

            // Si hay fecha y el tier exige período, verificar recencia
            if (hasValidLastOrder && tier.period_days > 0) {
                const period = tier.period_days || RECENCY_DAYS;
                const recentEnough = lastOrder.getTime() >= referenceNow.getTime() - period * 24 * 60 * 60 * 1000;
                if (!recentEnough) continue;
            }

            if ((tier.min_spent > 0 && spent >= tier.min_spent) || (tier.min_orders > 0 && orders >= tier.min_orders)) {
                return tier.slug;
            }
        }
        return defaultTier.slug;
    }

    if (spent <= 0 && orders <= 0) return LOYALTY_CATEGORIES.INICIAL;

    const referenceNow = now instanceof Date ? now : new Date(now);
    const lastOrder = lastOrderDate ? new Date(lastOrderDate) : null;
    const hasValidLastOrder = lastOrder && !Number.isNaN(lastOrder.getTime());

    if (hasValidLastOrder) {
        const recentEnough = lastOrder.getTime() >= referenceNow.getTime() - RECENCY_DAYS * 24 * 60 * 60 * 1000;
        if (!recentEnough) return LOYALTY_CATEGORIES.INICIAL;
    }

    if (spent >= 3000 || orders >= 15) return LOYALTY_CATEGORIES.VIP;
    if (spent >= 750 || orders >= 3) return LOYALTY_CATEGORIES.FRECUENTE;
    return LOYALTY_CATEGORIES.INICIAL;
}

export function getLoyaltyCategoryLabel(category, customTiers = []) {
    if (!category) return null;
    const lower = String(category).toLowerCase();
    if (LOYALTY_CATEGORY_LABELS[lower]) {
        return LOYALTY_CATEGORY_LABELS[lower];
    }
    if (Array.isArray(customTiers) && customTiers.length > 0) {
        const found = customTiers.find(t => t.slug === lower);
        if (found) return found.name;
    }
    return `Cliente ${lower.charAt(0).toUpperCase() + lower.slice(1)}`;
}
