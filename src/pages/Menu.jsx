import React, { useState, useEffect } from 'react';
import { useProducts } from '../context/ProductContext';
import { useCart } from '../context/CartContext';
import styles from './Menu.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ProductModal from '../components/ProductModal';
import { useBusinessHours } from '../context/BusinessHoursContext';
import ImageWithFallback from '../components/ImageWithFallback';

const ListIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>;
const GridIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;

const LAYOUT_STORAGE_KEY = 'product-layout-preference';

export default function Menu() {
    const { products, categories, loading, error } = useProducts();
    const { addToCart, showToast } = useCart();
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [layout, setLayout] = useState(() => localStorage.getItem(LAYOUT_STORAGE_KEY) || 'grid');
    const [flyingImages, setFlyingImages] = useState([]);
    const { isOpen: isBusinessOpen } = useBusinessHours();

    useEffect(() => {
        localStorage.setItem(LAYOUT_STORAGE_KEY, layout);
    }, [layout]);

    const handleAddToCart = (product, quantity, event) => {
        if (!isBusinessOpen) {
            showToast(' Estamos cerrados ahora mismo, no se pueden añadir productos al carrito.');
            return;
        }
        addToCart(product, quantity);
        const quantityAdded = quantity || 1;

        showToast(`${quantityAdded} x ${product.name} añadido(s) al carrito!`);

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
    };

    const toggleLayout = () => {
        setLayout(prevLayout => (prevLayout === 'list' ? 'grid' : 'list'));
    };

    const filteredProducts = products.filter(product => selectedCategory ? product.category_id === selectedCategory : true);

    if (loading) return <LoadingSpinner />;
    if (error) return <p className={styles.error}>Error: {error}</p>;

    return (
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
                {filteredProducts.length > 0 ? filteredProducts.map(product => (
                    <div key={product.id} className={styles.productCard}>
                        <div onClick={() => setSelectedProduct(product)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                            <div className={styles.imageContainer}>
                                <ImageWithFallback
                                    src={product.image_url}
                                    alt={product.name}
                                />
                            </div>
                            <div className={styles.cardContent}>
                                <h3>{product.name}</h3>
                            </div>
                        </div>
                        <div className={styles.cardFooter}>
                            <div className={styles.priceContainer}>
                                {product.original_price ? (
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
                )) : <p>No se encontraron productos.</p>}
            </div>

            <ProductModal
                product={selectedProduct}
                onClose={() => setSelectedProduct(null)}
                onAddToCart={handleAddToCart}
            />
        </div>
    );
}