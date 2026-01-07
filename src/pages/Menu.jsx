import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import styles from './Menu.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ProductModal from '../components/ProductModal';
import { useBusinessHours } from '../context/BusinessHoursContext';
import ImageWithFallback from '../components/ImageWithFallback';
import SEO, { restaurantSchema } from '../components/SEO';
import { getThumbnailUrl } from '../utils/imageUtils';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { BUSINESS_PHONE } from '../config/constantes';

// ==================== ICONOS PARA CAMBIO DE VISTA ====================

const ListIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>;
const GridIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;

const WhatsappIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.592 2.654-.696c1.001.572 2.135.881 3.298.881 3.182 0 5.77-2.587 5.77-5.766 0-3.18-2.587-5.764-5.762-5.764zm5.176 8.35c-.217.61-1.077 1.121-1.488 1.166-.352.04-2.825 1.354-4.223-.744-.805-1.207-.852-1.503-.94-1.884-.132-.572.164-1.018.39-1.282.176-.206.33-.298.508-.298s.322.022.464.368c.175.43.585 1.436.635 1.54.05.104.084.226.012.368-.073.142-.109.229-.215.352-.107.123-.223.272-.319.366-.104.103-.213.216-.092.424.121.209.536.878 1.151 1.425.8.711 1.474.931 1.685 1.035.21.104.333.09.458-.051.124-.142.535-.619.678-.832.143-.212.285-.177.478-.106.193.07 1.215.572 1.423.676.208.104.347.157.398.244.051.087.051.503-.166 1.113z" /></svg>;
const FacebookIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.192-1.333 1.115-1.333h2.885v-5h-3.808c-3.596 0-5.192 1.583-5.192 4.615v3.385z" /></svg>;

const LAYOUT_STORAGE_KEY = 'product-layout-preference';

const createSlug = (text) => {
  return text
    .toString()
    .toLowerCase()
    .normalize("NFD") // Descompone acentos (á -> a)
    .replace(/[\u0300-\u036f]/g, "") // Elimina los acentos
    .trim()
    .replace(/\s+/g, '-') // Reemplaza espacios con guiones
    .replace(/[^\w\-]+/g, '') // Elimina caracteres no alfanuméricos
    .replace(/\-\-+/g, '-'); // Reemplaza múltiples guiones por uno solo
};
// ==================== COMPONENTE PRODUCT CARD MEMOIZADO (MODIFICADO) ====================
const MemoizedProductCard = memo(({
  product,
  layout,
  isBusinessOpen,
  handleAddToCart,
  setSelectedProduct,
  priority
}) => {

  // --- 2. DEFINIR TAMAÑOS PARA IMÁGENES DEL GRID ---
  // Tamaños pequeños para los thumbnails
  const cardImageSizes = [200, 400]; // Tallas de 200px y 400px de ancho
  // El navegador elegirá:
  // - En pantallas < 767px de ancho, la imagen debe llenar el 45% del ancho de la pantalla.
  // - En pantallas > 768px de ancho, la imagen tendrá un ancho fijo de 280px.
  const cardSizes = "(max-width: 767px) 45vw, 280px";
  const productSlug = createSlug(product.name);

  return (
    <div className={styles.productCard}>
      <Link
        to={`/producto/${productSlug}`}
        style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', flexGrow: 1 }}
      >
        <div className={styles.imageContainer}>
          <ImageWithFallback
            src={getThumbnailUrl(product.image_url, 110, 110)} // Usar la función para obtener thumbnail
            alt={`Imagen de ${product.name}`}
            priority={priority}
          />
        </div>
        <div className={styles.cardContent}>
          <h3>{product.name}</h3> {/* Aquí está bien que sea H3 porque es una lista */}
        </div>
      </Link>
      <div className={styles.cardFooter}>
        <div className={styles.priceContainer}>
          {product.original_price && product.original_price !== product.price ? (
            <>
              <span className={styles.originalPrice}>${product.original_price.toFixed(2)}</span>
              <span className={styles.specialPrice}>${product.price.toFixed(2)}</span>
            </>
          ) : (
            <span className={styles.price}>${product.price.toFixed(2)}</span>
          )}
        </div>
        <button onClick={(e) => handleAddToCart(product, 1, e)} disabled={!isBusinessOpen}>
          {isBusinessOpen ? 'Añadir' : 'Cerrado'}
        </button>
      </div>
    </div>
  );
});
MemoizedProductCard.displayName = 'MemoizedProductCard';

// ==================== COMPONENTE PRINCIPAL ====================

export default function Menu() {
  const { products, categories, loading, error } = useProducts();
  const { addToCart, showToast } = useCart();
  const navigate = useNavigate();
  const { productSlug } = useParams();
  const location = useLocation();
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [layout, setLayout] = useState(() => localStorage.getItem(LAYOUT_STORAGE_KEY) || 'grid');
  const [flyingImages, setFlyingImages] = useState([]);
  const { isOpen: isBusinessOpen } = useBusinessHours();

  useEffect(() => {
    if (productSlug && products.length > 0) {
      const productFound = products.find(p =>
        createSlug(p.name) === productSlug
      );

      if (productFound) {
        if (!selectedProduct || selectedProduct.id !== productFound.id) {
          setSelectedProduct(productFound);
        }
      }
    } else if (!productSlug && selectedProduct) {
      setSelectedProduct(null);
    }
  }, [productSlug, products]);

  const handleOpenProduct = useCallback((product) => {
    const slug = createSlug(product.name);
    // Esto cambia la URL a /producto/alitas-bbq sin recargar la página
    navigate(`/producto/${slug}`);
  }, [navigate]);

  const handleCloseProduct = useCallback(() => {
    navigate('/');
  }, [navigate]);

  useEffect(() => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
  }, [layout]);

  const handleAddToCart = useCallback((product, quantity, event) => {
    if (!isBusinessOpen) {
      showToast(' Estamos cerrados ahora mismo, no se pueden añadir productos al carrito.');
      return;
    }
    addToCart(product, quantity);
    const quantityAdded = quantity || 1;
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
      if (event && event.currentTarget) {
        const rect = event.currentTarget.getBoundingClientRect();
        const newImage = {
          id: Date.now(),
          src: product.image_url || 'https://placehold.co/150',
          top: rect.top + rect.height / 2,
          left: rect.left + rect.width / 2,
        };
        setFlyingImages(prev => [...prev, newImage]);
        setTimeout(() => {
          setFlyingImages(prev => prev.filter(img => img.id !== newImage.id));
        }, 1000);
      }
    } else {
      showToast(`${quantityAdded} x ${product.name} añadido(s) al carrito!`);
    }
  }, [isBusinessOpen, addToCart, showToast]);

  const toggleLayout = () => {
    setLayout(prevLayout => (prevLayout === 'list' ? 'grid' : 'list'));
  };

  const filteredProducts = useMemo(() => {
    return products.filter(product =>
      selectedCategory ? product.category_id === selectedCategory : true
    );
  }, [products, selectedCategory]);

  const currentUrl = window.location.href;
  const canonicalUrl = selectedProduct
    ? `https://ea-panel.vercel.app/producto/${createSlug(selectedProduct.name)}`
    : `https://ea-panel.vercel.app/`;
  const reviewCount = 0;
  const reviewAverage = 0;
  const currentSchema = selectedProduct ? {
    "@context": "http://schema.org",
    "@type": "Product",
    "name": selectedProduct.name,
    "image": selectedProduct.image_url,
    "description": selectedProduct.description || `Delicioso ${selectedProduct.name} en Entre Alas.`,
    "offers": {
      "@type": "Offer",
      "priceCurrency": "MXN",
      "price": selectedProduct.price,
      "availability": "http://schema.org/InStock",
      "url": canonicalUrl
    },
    ...(reviewCount > 0 && {
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": reviewAverage,
        "reviewCount": reviewCount,
        "bestRating": "5",
        "worstRating": "1"
      }
    })
  } : restaurantSchema;

  const pageTitle = selectedProduct
    ? `${selectedProduct.name} - Entre Alas`
    : 'Menú de Alitas y Boneless - Entre Alas';

  if (loading) return <LoadingSpinner />;
  if (error) return <p className={styles.error}>Error: {error}</p>;

  return (
    <>
      <SEO
        title={pageTitle}
        description="Explora nuestro delicioso menú de alitas, boneless, hamburguesas, papas y más. Pide ahora y disfruta del mejor sabor en La Trinitaria, Chiapas."
        name="Entre Alas"
        type={selectedProduct ? "product" : "website"}
        schemaMarkup={currentSchema}
        canonicalUrl={currentUrl.split('?')[0]}
        image={selectedProduct ? selectedProduct.image_url : null}
      />
      <div className={styles.menuContainer}>
        {flyingImages.map(img => (
          <img
            key={img.id}
            src={img.src}
            alt="Producto volando al carrito"
            className={styles.flyImage}
            style={{ top: `${img.top}px`, left: `${img.left}px` }}
          />
        ))}

        <div className={styles.filters}>
          <div className={styles.categoryButtons}>
            <button onClick={() => setSelectedCategory(null)} className={!selectedCategory ? styles.active : ''}>
              Todos
            </button>
            {categories.map(category => (
              <button key={category.id} onClick={() => setSelectedCategory(category.id)} className={selectedCategory === category.id ? styles.active : ''}>
                {category.name}
              </button>
            ))}
          </div>
          <div className={styles.layoutToggle}>
            <button onClick={toggleLayout} title="Cambiar vista">
              {layout === 'list' ? <GridIcon /> : <ListIcon />}
            </button>
          </div>
        </div>

        <div className={`${styles.productList} ${styles[layout]}`}>
          {filteredProducts.length > 0 ? filteredProducts.map((product, index) => ( // <-- 4. AÑADIR 'index'
            <MemoizedProductCard
              key={product.id}
              product={product}
              layout={layout}
              isBusinessOpen={isBusinessOpen}
              handleAddToCart={handleAddToCart}
              setSelectedProduct={handleOpenProduct}
              priority={index < 4}
            />
          )) : <p>No se encontraron productos.</p>}
        </div>

        {selectedProduct && (
          <ProductModal
            product={selectedProduct}
            onClose={handleCloseProduct} // Asegúrate que esta sea tu función que limpia la URL
            onAddToCart={handleAddToCart}
          />
        )}
        <footer className={styles.seoFooter}>
          <div className={styles.footerContent}>
            {/* Texto simplificado: Solo marca y ubicación */}
            <div style={{ marginBottom: '1.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Entre Alas</h2>
              <p style={{ fontSize: '1rem', margin: 0 }}>
                El mejor sabor a domicilio en <strong>Chamic y Ejido 20 de Abril</strong>.
              </p>
            </div>

            <div className={styles.socialSection}>
              {/* Se eliminó el texto "¡Síguenos y haz tu pedido!" porque los botones ya son obvios */}
              <div className={styles.socialButtons}>
                <a
                  href="https://www.facebook.com/EntreAlasDarkitchen"
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${styles.socialBtn} ${styles.facebook}`}
                >
                  <FacebookIcon />
                  Facebook
                </a>

                <a
                  href={`https://wa.me/${BUSINESS_PHONE}?text=Hola!%20Vengo%20de%20su%20página%20web%20y%20quiero%20hacer%20un%20pedido.`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${styles.socialBtn} ${styles.whatsapp}`}
                >
                  <WhatsappIcon />
                  WhatsApp
                </a>
              </div>
            </div>

            <p style={{ fontSize: '0.75rem', marginTop: '1.5rem', opacity: 0.6 }}>
              &copy; {new Date().getFullYear()} Entre Alas.
            </p>
          </div>
        </footer>
      </div>
    </>
  );
}