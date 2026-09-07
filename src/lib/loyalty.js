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

export function calculateLoyaltyCategory({ totalSpent = 0, completedOrders = 0, lastOrderDate = null, now = new Date() }) {
    const spent = Number(totalSpent) || 0;
    const orders = Number(completedOrders) || 0;

    if (!lastOrderDate) return LOYALTY_CATEGORIES.INICIAL;

    const lastOrder = new Date(lastOrderDate);
    if (Number.isNaN(lastOrder.getTime())) return LOYALTY_CATEGORIES.INICIAL;

    const referenceNow = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(referenceNow.getTime())) return LOYALTY_CATEGORIES.INICIAL;

    const recentEnough = lastOrder.getTime() >= referenceNow.getTime() - RECENCY_DAYS * 24 * 60 * 60 * 1000;
    if (!recentEnough) return LOYALTY_CATEGORIES.INICIAL;

    if (spent >= 3000 || orders >= 15) return LOYALTY_CATEGORIES.VIP;
    if (spent >= 750 || orders >= 3) return LOYALTY_CATEGORIES.FRECUENTE;
    return LOYALTY_CATEGORIES.INICIAL;
}

export function getLoyaltyCategoryLabel(category) {
    return LOYALTY_CATEGORY_LABELS[category] || null;
}
