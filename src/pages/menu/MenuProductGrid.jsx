import React, { memo } from 'react';
import BaseProductCard from '../../components/BaseProductCard';
import styles from '../Menu.module.css';
import { formatPrice, hasSpecialPrice } from './menuUtils';

const renderClientOverlay = (product) => {
    if (product?.is_out_of_stock) {
        return <span className={styles.outOfStockBadge}>Agotado</span>;
    }

    return hasSpecialPrice(product)
        ? <span className={styles.offerBadge}>Oferta</span>
        : null;
};

const renderClientDescription = (product) => {
    const hasDescription = Boolean(product.description?.trim());
    return hasDescription
        ? <p className={styles.productDescription}>{product.description}</p>
        : null;
};

const renderClientPrice = (product) => {
    const hasOffer = hasSpecialPrice(product);

    return (
        <div className={styles.priceContainer}>
            {hasOffer ? (
                <>
                    <span className={styles.originalPrice}>{formatPrice(product.original_price)}</span>
                    <span className={styles.specialPrice}>{formatPrice(product.price)}</span>
                </>
            ) : (
                <span className={styles.price}>{formatPrice(product.price)}</span>
            )}
        </div>
    );
};

const MenuProductGrid = memo(({
    products,
    filteredProducts,
    layout,
    error,
    onRefetch,
    searchQuery,
    hasSearchFilter,
    hasCategoryFilter,
    renderActions,
}) => {
    const hasAnyProducts = products.length > 0;

    return (
        <div className={`${styles.productList} ${styles[layout]}`}>
            {error ? (
                <div className={`${styles.emptyState} ${styles.errorState}`}>
                    <p>Tardó demasiado en cargar. Verifica tu conexión.</p>
                    <button type="button" onClick={onRefetch} className={styles.errorRetryButtonInline}>Reintentar</button>
                </div>
            ) : filteredProducts.length > 0 ? (
                filteredProducts.map((product, index) => (
                    <BaseProductCard
                        key={product.id}
                        product={product}
                        layout={layout}
                        inactive={Boolean(product.is_out_of_stock)}
                        linkUrl={`/producto/${product.slug}`}
                        imagePriority={index < 4}
                        renderImageOverlay={renderClientOverlay}
                        renderContentBody={renderClientDescription}
                        renderPriceSection={renderClientPrice}
                        renderActions={renderActions}
                    />
                ))
            ) : !hasAnyProducts ? (
                <div className={styles.emptyState}>
                    <p>No hay productos disponibles en este momento.</p>
                </div>
            ) : hasSearchFilter ? (
                <div className={styles.emptyState}>
                    <p>No encontramos productos para “{searchQuery.trim()}”.</p>
                    {hasCategoryFilter && (
                        <p style={{ marginTop: '0.5rem', fontSize: '0.88rem', fontWeight: 500 }}>
                            Prueba con otra búsqueda o cambia de categoría.
                        </p>
                    )}
                </div>
            ) : hasCategoryFilter ? (
                <div className={styles.emptyState}>
                    <p>No hay productos disponibles en esta categoría.</p>
                </div>
            ) : (
                <div className={styles.emptyState}>
                    <p>No hay productos disponibles en este momento.</p>
                </div>
            )}
        </div>
    );
});

MenuProductGrid.displayName = 'MenuProductGrid';

export default MenuProductGrid;
