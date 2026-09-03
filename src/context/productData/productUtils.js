import { CACHE_KEYS } from '../../config/cacheConfig';
import { createSlug } from '../../seo/config';

export const EMPTY_BASE_CATALOG = {
    products: [],
    categories: [],
};

export const EMPTY_SPECIAL_PRICES = [];
export const PRODUCTS_WITH_IMAGES_SELECT = '*, product_images ( id, image_url )';
export const CLIENT_CACHE_SCOPE = 'client';
export const BASE_ALERT_DELAY_MS = 400;
export const PRICES_ALERT_DELAY_MS = 400;

export const normalizeBaseCatalog = (catalog) => ({
    products: Array.isArray(catalog?.products) ? catalog.products : [],
    categories: Array.isArray(catalog?.categories) ? catalog.categories : [],
});

export const normalizeSpecialPrices = (prices) => (
    Array.isArray(prices) ? prices : EMPTY_SPECIAL_PRICES
);

export const serializeBaseCatalog = (catalog) => JSON.stringify(normalizeBaseCatalog(catalog));

export const toBasicProduct = (product) => ({
    id: product?.id ?? null,
    name: product?.name ?? '',
    description: product?.description ?? '',
    price: product?.price ?? 0,
    image_url: product?.image_url ?? null,
    category_id: product?.category_id ?? null,
    is_active: Boolean(product?.is_active),
    is_out_of_stock: Boolean(product?.is_out_of_stock),
});

export const toBasicProducts = (products) => (
    Array.isArray(products) ? products.map(toBasicProduct) : []
);

export const buildSpecialPricesCacheKey = (customerId) => (
    `${CACHE_KEYS.SPECIAL_PRICES}-${customerId || 'global'}`
);

export const applySpecialPrices = ({ baseProducts, categories, specialPrices, customerId }) => {
    if (baseProducts.length === 0) return [];

    const categoryMap = new Map();
    for (let i = 0; i < categories.length; i++) {
        categoryMap.set(categories[i].id, categories[i].name);
    }

    const shouldApplySpecialPrices = Boolean(customerId);
    const productPricesMap = new Map();
    const categoryPricesMap = new Map();

    if (shouldApplySpecialPrices) {
        for (let i = 0; i < specialPrices.length; i++) {
            const specialPrice = specialPrices[i];
            if (specialPrice.product_id) {
                productPricesMap.set(specialPrice.product_id, specialPrice);
            } else if (specialPrice.category_id) {
                categoryPricesMap.set(specialPrice.category_id, specialPrice);
            }
        }
    }

    const pricedProducts = baseProducts.map((product) => {
        const productSpecificPrice = productPricesMap.get(product.id);
        const categorySpecificPrice = !productSpecificPrice
            ? categoryPricesMap.get(product.category_id)
            : undefined;
        const specialPriceInfo = productSpecificPrice || categorySpecificPrice;
        const productWithSlug = { ...product, slug: createSlug(product.name) };

        if (specialPriceInfo && shouldApplySpecialPrices) {
            return {
                ...productWithSlug,
                original_price: product.price,
                price: parseFloat(specialPriceInfo.override_price),
            };
        }

        const productWithoutOriginalPrice = { ...productWithSlug };
        delete productWithoutOriginalPrice.original_price;
        return productWithoutOriginalPrice;
    });

    return pricedProducts.sort((a, b) => {
        const categoryA = categoryMap.get(a.category_id) || 'Z';
        const categoryB = categoryMap.get(b.category_id) || 'Z';

        const isAlitasA = categoryA === 'Alitas';
        const isAlitasB = categoryB === 'Alitas';

        if (isAlitasA && !isAlitasB) return -1;
        if (!isAlitasA && isAlitasB) return 1;

        const categoryCompare = categoryA.localeCompare(categoryB);
        if (categoryCompare !== 0) return categoryCompare;

        return a.name.localeCompare(b.name);
    });
};

export const getVisibleCategories = (products, categories) => {
    if (products.length === 0 || categories.length === 0) return [];

    const categoryIds = new Set(products.map(product => product.category_id));
    return categories.filter(category => categoryIds.has(category.id));
};
