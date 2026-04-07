import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import { useUserData } from '../context/UserDataContext';
import { useBusinessHours } from '../context/BusinessHoursContext';
import styles from './Menu.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ProductModal from '../components/ProductModal';
import ImageWithFallback from '../components/ImageWithFallback';
import SEO from '../components/SEO';
import { getThumbnailUrl } from '../utils/imageUtils';
import BaseProductCard from '../components/BaseProductCard';
import { animateToCart } from '../utils/cartAnimation';
import {
  defaultSeoImageAlt,
  homeDescription,
  homeTitle,
  joinSiteUrl,
  restaurantSchema,
  resolveSeoImage,
  siteName,
  websiteSchema,
} from '../seo/config';
import { notifySeoReady } from '../seo/prerender';
import fallbackImage from '../assets/images/fallback-product.svg';

const ListIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <line x1="8" y1="6" x2="21" y2="6"></line>
    <line x1="8" y1="12" x2="21" y2="12"></line>
    <line x1="8" y1="18" x2="21" y2="18"></line>
    <line x1="3" y1="6" x2="3.01" y2="6"></line>
    <line x1="3" y1="12" x2="3.01" y2="12"></line>
    <line x1="3" y1="18" x2="3.01" y2="18"></line>
  </svg>
);

const GridIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="7" height="7"></rect>
    <rect x="14" y="3" width="7" height="7"></rect>
    <rect x="14" y="14" width="7" height="7"></rect>
    <rect x="3" y="14" width="7" height="7"></rect>
  </svg>
);

const LAYOUT_STORAGE_KEY = 'product-layout-preference';
const MOBILE_BREAKPOINT = 768;

const getProductDisplayImage = (product) =>
  product?.image_url || product?.product_images?.[0]?.image_url || '';

const getFirstAvailableProductImage = (productList = []) => {
  const productWithImage = productList.find((product) => Boolean(getProductDisplayImage(product)));
  return getProductDisplayImage(productWithImage);
};

const getCategoryFallback = (name) => {
  const compactName = name?.trim() || 'EA';
  const parts = compactName.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
};

const formatPrice = (value) => `$${Number(value || 0).toFixed(2)}`;

const renderClientOverlay = (p) => {
  const hasSpecialPrice = p.original_price && p.original_price !== p.price;
  return hasSpecialPrice ? <span className={styles.offerBadge}>Oferta</span> : null;
};

const renderClientDescription = (p) => {
  const hasDescription = Boolean(p.description?.trim());
  return hasDescription ? <p className={styles.productDescription}>{p.description}</p> : null;
};

const renderClientPrice = (p) => {
  const hasSpecialPrice = p.original_price && p.original_price !== p.price;
  return (
    <div className={styles.priceContainer}>
      {hasSpecialPrice ? (
        <>
          <span className={styles.originalPrice}>{formatPrice(p.original_price)}</span>
          <span className={styles.specialPrice}>{formatPrice(p.price)}</span>
        </>
      ) : (
        <span className={styles.price}>{formatPrice(p.price)}</span>
      )}
    </div>
  );
};

export default function Menu() {
  const { products, categories, loading, error } = useProducts();
  const { addToCart, showToast } = useCart();
  const { customer } = useUserData();
  const { isOpen: isBusinessOpen, message: businessStatusMessage } = useBusinessHours();
  const location = useLocation();
  const navigate = useNavigate();
  const { productSlug } = useParams();
  const categoryRailRef = useRef(null);
  const pathnameRef = useRef(location.pathname);

  const [selectedCategory, setSelectedCategory] = useState(null);
  const [layout, setLayout] = useState(() => localStorage.getItem(LAYOUT_STORAGE_KEY) || 'grid');
  const shouldShowLeadCapture = !customer;
  const routeSelectedProduct = useMemo(() => (
    productSlug ? products.find((product) => product.slug === productSlug) || null : null
  ), [productSlug, products]);
  const selectedProduct = routeSelectedProduct;
  const activeSeoProduct = selectedProduct;

  useEffect(() => {
    pathnameRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  }, [layout]);

  const defaultCatalogImage = useMemo(() => getFirstAvailableProductImage(products), [products]);

  const categoryVisuals = useMemo(() => {
    const allEntry = {
      id: null,
      key: 'all',
      name: 'Todos',
      imageUrl: defaultCatalogImage,
      fallback: 'EA',
    };

    const visualCategories = categories.map((category) => {
      return {
        id: category.id,
        key: category.id,
        name: category.name,
        imageUrl: getFirstAvailableProductImage(
          products.filter((product) => product.category_id === category.id)
        ),
        fallback: getCategoryFallback(category.name),
      };
    });

    return [allEntry, ...visualCategories];
  }, [categories, defaultCatalogImage, products]);

  useEffect(() => {
    const activeElement = categoryRailRef.current?.querySelector('[data-active-category="true"]');

    if (activeElement) {
      activeElement.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      });
    }
  }, [selectedCategory, categoryVisuals.length]);

  const filteredProducts = useMemo(() => (
    products.filter((product) => (selectedCategory ? product.category_id === selectedCategory : true))
  ), [products, selectedCategory]);

  const selectedCategoryLabel = useMemo(() => {
    if (!selectedCategory) {
      return 'Todo el menu';
    }

    return categories.find((category) => category.id === selectedCategory)?.name || 'Todo el menu';
  }, [categories, selectedCategory]);

  const heroDescription = useMemo(() => {
    if (!selectedCategory) {
      return 'Preparados al momento, bañados en tus salsas favoritas y listos para llevar hasta tu puerta.';
    }

    const category = categories.find((c) => c.id === selectedCategory);

    if (category?.description && category.description.trim() !== '') {
      return category.description.trim();
    }

    return `Descubre nuestra selección de ${selectedCategoryLabel.toLowerCase()}. Elige tus favoritos y nosotros nos encargamos del resto.`;
  }, [selectedCategory, selectedCategoryLabel, categories]);

  const handleCloseProduct = useCallback(() => {
    const closingPath = location.pathname;

    if (pathnameRef.current === closingPath) {
      navigate('/');
    }
  }, [location.pathname, navigate]);

  const handleSelectCategory = useCallback((categoryId) => {
    setSelectedCategory(categoryId);
  }, []);

  const toggleLayout = useCallback(() => {
    setLayout((currentLayout) => (currentLayout === 'list' ? 'grid' : 'list'));
  }, []);

  const handleAddToCart = useCallback((product, quantity, event) => {
    if (!product?.id) {
      showToast('Este producto no esta disponible en este momento.');
      return;
    }

    const parsedQuantity = Number.parseInt(quantity, 10);
    const safeQuantity = Number.isFinite(parsedQuantity) && parsedQuantity > 0
      ? parsedQuantity
      : 1;

    // TODO: Revalidate business hours and product availability on the server,
    // or at the final checkout step. Client-side guards are UX only.
    if (!isBusinessOpen) {
      showToast('🕒 Estamos cerrados ahora mismo, no se pueden añadir productos al carrito.');
      return;
    }

    addToCart(product, safeQuantity);

    const quantityAdded = safeQuantity;
    const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

    if (isMobile && event?.currentTarget) {
      const imgSrc = getProductDisplayImage(product) || fallbackImage;

      const animationTriggered = animateToCart({
        originElement: event.currentTarget,
        imgSrc,
        motionProfile: 'compact-mobile',
      });

      if (animationTriggered) {
        return;
      }
    }

    showToast(`${quantityAdded} x ${product.name} añadido(s) al carrito.`);
  }, [isBusinessOpen, addToCart, showToast]);

  const renderClientActions = useCallback((p) => (
    <button
      type="button"
      className={`${styles.cardActionButton} ${!isBusinessOpen ? styles.cardActionButtonClosed : ''}`}
      onClick={(event) => {
        event.preventDefault();
        handleAddToCart(p, 1, event);
      }}
      disabled={!isBusinessOpen}
    >
      {isBusinessOpen ? 'Añadir' : 'Cerrado'}
    </button>
  ), [isBusinessOpen, handleAddToCart]);

  const isProductRoute = Boolean(productSlug);
  const isMissingProductRoute = isProductRoute && !loading && !error && !routeSelectedProduct;
  const selectedProductCategoryName = activeSeoProduct
    ? categories.find((category) => category.id === activeSeoProduct.category_id)?.name
    : null;
  const productDescription = activeSeoProduct?.description?.trim()
    || (activeSeoProduct
      ? `Pide ${activeSeoProduct.name} de ${selectedProductCategoryName?.toLowerCase() || 'nuestro menu'} en ${siteName}. Servicio a domicilio en La Trinitaria, Chiapas.`
      : '');
  const canonicalUrl = activeSeoProduct
    ? joinSiteUrl(`/producto/${activeSeoProduct.slug}`)
    : isMissingProductRoute
      ? joinSiteUrl(`/producto/${productSlug}`)
      : joinSiteUrl('/');
  const seoImage = resolveSeoImage(
    getProductDisplayImage(activeSeoProduct) || defaultCatalogImage || fallbackImage
  );
  const seoImageAlt = activeSeoProduct
    ? `${activeSeoProduct.name} de ${siteName}`
    : defaultSeoImageAlt;
  const currentSchema = activeSeoProduct ? {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: activeSeoProduct.name,
    description: productDescription,
    image: [seoImage],
    category: selectedProductCategoryName || undefined,
    seller: {
      '@type': 'Restaurant',
      name: siteName,
      url: joinSiteUrl('/'),
    },
    offers: {
      '@type': 'Offer',
      priceCurrency: 'MXN',
      price: Number(activeSeoProduct.price || 0).toFixed(2),
      availability: 'https://schema.org/InStock',
      url: canonicalUrl,
      seller: {
        '@type': 'Organization',
        name: siteName,
      },
    },
  } : isMissingProductRoute ? null : [restaurantSchema, websiteSchema];

  const pageTitle = activeSeoProduct
    ? `${activeSeoProduct.name} | ${siteName}`
    : isMissingProductRoute
      ? `Producto no encontrado | ${siteName}`
      : homeTitle;
  const pageDescription = activeSeoProduct
    ? productDescription
    : isMissingProductRoute
      ? 'El producto que buscas no existe o ya no esta disponible en Entre Alas.'
      : homeDescription;

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!productSlug || routeSelectedProduct || isMissingProductRoute || error) {
      notifySeoReady();
    }
  }, [error, isMissingProductRoute, loading, productSlug, routeSelectedProduct]);

  if (loading) return <LoadingSpinner />;

  if (error) {
    return (
      <div className={styles.errorContainer}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.errorIcon}
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <h2 className={styles.errorTitle}>¡Ups! Tuvimos un pequeño contratiempo</h2>
        <p className={styles.errorMessage}>
          No pudimos cargar el menú en este momento. Puede deberse a una interrupción momentánea de internet.
        </p>
        <button
          onClick={() => window.location.reload()}
          className={styles.errorRetryButton}
        >
          Intentar nuevamente
        </button>
      </div>
    );
  }

  if (isMissingProductRoute) {
    return (
      <>
        <SEO
          title={pageTitle}
          description={pageDescription}
          type="website"
          canonicalUrl={canonicalUrl}
          image={seoImage}
          imageAlt={seoImageAlt}
          noindex
        />
        <div className={styles.errorContainer}>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.errorIcon}
          >
            <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"></path>
            <path d="M9 9l6 6"></path>
            <path d="M15 9l-6 6"></path>
          </svg>
          <h2 className={styles.errorTitle}>Producto no disponible</h2>
          <p className={styles.errorMessage}>
            El producto que buscas ya no esta disponible o fue retirado del menu publico.
          </p>
          <Link to="/" className={styles.errorRetryButton}>
            Volver al menu
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <SEO
        title={pageTitle}
        description={pageDescription}
        type={activeSeoProduct ? 'product' : 'website'}
        schemaMarkup={currentSchema}
        canonicalUrl={canonicalUrl}
        image={seoImage}
        imageAlt={seoImageAlt}
        noindex={isMissingProductRoute}
      />

      <div className={`${styles.menuContainer} ${shouldShowLeadCapture ? styles.menuContainerWithLeadCapture : ''}`}>

        <section className={styles.menuHero}>
          <div className={styles.heroCopy}>
            <h1>{selectedCategory ? selectedCategoryLabel : '¿Qué se te antoja hoy?'}</h1>
            <p>{heroDescription}</p>
          </div>

          <div className={styles.heroStats}>
            <span className={`${styles.heroStatus} ${isBusinessOpen ? styles.heroStatusOpen : styles.heroStatusClosed}`}>
              <span className={styles.statusDot}></span>
              {isBusinessOpen ? 'Abierto • Recibe en minutos' : 'Cerrado por ahora'}
            </span>

            {businessStatusMessage && <span className={styles.heroMessage}>{businessStatusMessage}</span>}
          </div>
        </section>

        <div className={styles.filters}>
          <div className={styles.filterHeader}>
            <div>
              <p className={styles.filterEyebrow}>Categorias</p>
              <h2>{selectedCategoryLabel}</h2>
            </div>

            <div className={styles.layoutToggle}>
              <button
                type="button"
                onClick={toggleLayout}
                title={layout === 'list' ? 'Cambiar a vista de cuadrícula' : 'Cambiar a vista de lista'}
                aria-label={layout === 'list' ? 'Cambiar a vista de cuadrícula' : 'Cambiar a vista de lista'}
              >
                {layout === 'list' ? <GridIcon /> : <ListIcon />}
              </button>
            </div>
          </div>

          <div
            ref={categoryRailRef}
            className={styles.categoryRail}
            aria-label="Categorias del menu"
          >
            {categoryVisuals.map((category) => {
              const isActive = selectedCategory === category.id;

              return (
                <button
                  key={category.key}
                  type="button"
                  className={`${styles.categoryButton} ${isActive ? styles.categoryButtonActive : ''}`}
                  onClick={() => handleSelectCategory(category.id)}
                  aria-pressed={isActive}
                  data-active-category={isActive ? 'true' : 'false'}
                >
                  <span className={styles.categoryCircle}>
                    {category.imageUrl ? (
                      <ImageWithFallback
                        src={getThumbnailUrl(category.imageUrl, 180, 180)}
                        alt={`Categoria ${category.name}`}
                        className={styles.categoryImage}
                        imageSizes={[120, 180, 240]}
                        sizes="76px"
                      />
                    ) : (
                      <span className={styles.categoryFallback}>{category.fallback}</span>
                    )}
                  </span>
                  <span className={styles.categoryName}>{category.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${styles.productList} ${styles[layout]}`}>
          {filteredProducts.length > 0 ? (
            filteredProducts.map((product, index) => (
              <BaseProductCard
                key={product.id}
                product={product}
                layout={layout}
                linkUrl={`/producto/${product.slug}`}
                imagePriority={index < 4}
                renderImageOverlay={renderClientOverlay}
                renderContentBody={renderClientDescription}
                renderPriceSection={renderClientPrice}
                renderActions={renderClientActions}
              />
            ))
          ) : (
            <div className={styles.emptyState}>
              <p>No se encontraron productos para esta categoria.</p>
            </div>
          )}
        </div>

        {selectedProduct && (
          <ProductModal
            key={selectedProduct.id ?? selectedProduct.slug}
            product={selectedProduct}
            onClose={handleCloseProduct}
            onAddToCart={handleAddToCart}
          />
        )}

        {!customer && (
          <footer className={styles.seoFooter}>
            <div className={styles.footerContent}>
              <div className={styles.socialProof}>
                <span className={styles.socialProofText}>¿Aún no te decides?</span>
                <a
                  href="https://www.facebook.com/EntreAlasDarkitchen"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.socialProofLink}
                >
                  Conocenos más en Facebook
                </a>
              </div>

              <div className={styles.footerBottom}>
                <p>&copy; {new Date().getFullYear()} Entre Alas. Todos los derechos reservados.</p>
              </div>
            </div>
          </footer>
        )}
      </div>
    </>
  );
}
