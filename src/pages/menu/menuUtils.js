export const getProductDisplayImage = (product) => (
    product?.image_url || product?.product_images?.[0]?.image_url || ''
);

export const getFirstAvailableProductImage = (products = []) => {
    const productWithImage = products.find((product) => Boolean(getProductDisplayImage(product)));
    return getProductDisplayImage(productWithImage);
};

export const getCategoryFallback = (name) => {
    const compactName = name?.trim() || 'EA';
    const parts = compactName.split(/\s+/).filter(Boolean);

    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};

export const formatPrice = (value) => `$${Number(value || 0).toFixed(2)}`;

export const hasSpecialPrice = (product) => (
    Boolean(product?.original_price && product.original_price !== product.price)
);
