import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import { useUserData } from '../context/UserDataContext';
import { useBusinessHours } from '../context/BusinessHoursContext';
import styles from './Menu.module.css';
import MenuRouteSkeleton from '../components/MenuRouteSkeleton';
import { animateToCart } from '../utils/cartAnimation';
import fallbackImage from '../assets/images/fallback-product.svg';
import MenuFilters from './menu/MenuFilters';
import MenuFooter from './menu/MenuFooter';
import MenuHero from './menu/MenuHero';
import MenuProductGrid from './menu/MenuProductGrid';
import MenuSeo from './menu/MenuSeo';
import MenuUnavailableProduct from './menu/MenuUnavailableProduct';
import { useMenuFilters } from './menu/useMenuFilters';
import { getFirstAvailableProductImage, getProductDisplayImage } from './menu/menuUtils';

const MOBILE_BREAKPOINT = 768;
const ProductModal = lazy(() => import('../components/ProductModal'));

export default function Menu() {
    const { products, categories, loading, error, refetch } = useProducts();
    const { addToCart, showToast } = useCart();
    const { customer } = useUserData();
    const { isOpen: isBusinessOpen, message: businessStatusMessage } = useBusinessHours();
    const location = useLocation();
    const navigate = useNavigate();
    const { productSlug } = useParams();
    const pathnameRef = useRef(location.pathname);

    const {
        selectedCategory,
        searchQuery,
        layout,
        filteredProducts,
        selectedCategoryLabel,
        heroDescription,
        hasCategoryFilter,
        hasSearchFilter,
        handleSelectCategory,
        handleSearchChange,
        clearSearch,
        toggleLayout,
    } = useMenuFilters({ products, categories });

    const shouldShowLeadCapture = !customer;
    const routeSelectedProduct = useMemo(() => (
        productSlug ? products.find((product) => product.slug === productSlug) || null : null
    ), [productSlug, products]);
    const defaultCatalogImage = useMemo(() => getFirstAvailableProductImage(products), [products]);
    const isMissingProductRoute = Boolean(productSlug) && !loading && !error && !routeSelectedProduct;

    useEffect(() => {
        pathnameRef.current = location.pathname;
    }, [location.pathname]);

    const handleCloseProduct = useCallback(() => {
        const closingPath = location.pathname;

        if (pathnameRef.current === closingPath) {
            navigate('/');
        }
    }, [location.pathname, navigate]);

    const handleAddToCart = useCallback((product, quantity, event) => {
        if (!product?.id) {
            showToast('Este producto no esta disponible en este momento.');
            return;
        }

        if (product.is_out_of_stock) {
            showToast('Lo sentimos, este producto se encuentra agotado.');
            return;
        }

        const parsedQuantity = Number(quantity);
        const safeQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0
            ? parsedQuantity
            : 1;

        // Client-side guard only. Final availability must be revalidated server-side.
        if (!isBusinessOpen) {
            showToast('🕒 Estamos cerrados ahora mismo, no se pueden añadir productos al carrito.');
            return;
        }

        addToCart(product, safeQuantity);

        const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
        if (isMobile && event?.currentTarget) {
            const imgSrc = getProductDisplayImage(product) || fallbackImage;
            const animationTriggered = animateToCart({
                originElement: event.currentTarget,
                imgSrc,
                motionProfile: 'compact-mobile',
            });

            if (animationTriggered) return;
        }

        showToast(`${safeQuantity} x ${product.name} añadido(s) al carrito.`);
    }, [addToCart, isBusinessOpen, showToast]);

    const renderClientActions = useCallback((product) => {
        if (product.is_out_of_stock) {
            return (
                <button
                    type="button"
                    className={`${styles.cardActionButton} ${styles.cardActionButtonOutOfStock}`}
                    disabled={true}
                >
                    Agotado
                </button>
            );
        }

        return (
            <button
                type="button"
                className={`${styles.cardActionButton} ${!isBusinessOpen ? styles.cardActionButtonClosed : ''}`}
                onClick={(event) => {
                    event.preventDefault();
                    handleAddToCart(product, 1, event);
                }}
                disabled={!isBusinessOpen}
            >
                {isBusinessOpen ? 'Añadir' : 'Cerrado'}
            </button>
        );
    }, [handleAddToCart, isBusinessOpen]);

    return (
        <>
            <MenuSeo
                activeProduct={routeSelectedProduct}
                categories={categories}
                defaultCatalogImage={defaultCatalogImage}
                error={error}
                isMissingProductRoute={isMissingProductRoute}
                loading={loading}
                productSlug={productSlug}
            />

            {isMissingProductRoute ? (
                <MenuUnavailableProduct />
            ) : loading ? (
                <MenuRouteSkeleton layout={layout} showLeadCapture={shouldShowLeadCapture} />
            ) : (
                <div className={`${styles.menuContainer} ${shouldShowLeadCapture ? styles.menuContainerWithLeadCapture : ''}`}>
                    <MenuHero
                        selectedCategory={selectedCategory}
                        selectedCategoryLabel={selectedCategoryLabel}
                        heroDescription={heroDescription}
                        isBusinessOpen={isBusinessOpen}
                        businessStatusMessage={businessStatusMessage}
                    />

                    <MenuFilters
                        products={products}
                        categories={categories}
                        defaultCatalogImage={defaultCatalogImage}
                        selectedCategory={selectedCategory}
                        selectedCategoryLabel={selectedCategoryLabel}
                        onSelectCategory={handleSelectCategory}
                        searchQuery={searchQuery}
                        onSearchChange={handleSearchChange}
                        onClearSearch={clearSearch}
                        layout={layout}
                        onToggleLayout={toggleLayout}
                    />

                    <MenuProductGrid
                        products={products}
                        filteredProducts={filteredProducts}
                        layout={layout}
                        error={error}
                        onRefetch={refetch}
                        searchQuery={searchQuery}
                        hasSearchFilter={hasSearchFilter}
                        hasCategoryFilter={hasCategoryFilter}
                        renderActions={renderClientActions}
                    />

                    {routeSelectedProduct && (
                        <Suspense fallback={null}>
                            <ProductModal
                                key={routeSelectedProduct.id ?? routeSelectedProduct.slug}
                                product={routeSelectedProduct}
                                onClose={handleCloseProduct}
                                onAddToCart={handleAddToCart}
                            />
                        </Suspense>
                    )}

                    {!customer && <MenuFooter />}
                </div>
            )}
        </>
    );
}
