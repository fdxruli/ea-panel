// src/pages/Menu.jsx (CON BOTÓN ÚNICO Y LÓGICA REFINADA)

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import styles from './Menu.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ProductModal from '../components/ProductModal';

// --- Iconos para el botón de vista ---
const ListIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>;
const GridIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;

export default function Menu() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { addToCart } = useCart();
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [toastMessage, setToastMessage] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [layout, setLayout] = useState('list'); // 'list' o 'grid'
    
    useEffect(() => {
        // ... (lógica de fetch sin cambios)
        const fetchProductsAndCategories = async () => {
            try {
                setLoading(true);
                const { data: productsData, error: productsError } = await supabase
                    .from('products')
                    .select(`*, product_images ( id, image_url )`)
                    .eq('is_active', true);
                if (productsError) throw productsError;

                const { data: categoriesData, error: categoriesError } = await supabase
                    .from('categories')
                    .select('*');
                if (categoriesError) throw categoriesError;

                const uniqueCategories = [...new Set(productsData.map(p => p.category_id))];
                const productCategories = categoriesData.filter(c => uniqueCategories.includes(c.id));

                setProducts(productsData);
                setCategories(productCategories);

            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchProductsAndCategories();
    }, []);

    const handleAddToCart = (product, quantity) => {
        // ... (lógica sin cambios)
        addToCart(product, quantity);
        const quantityAdded = quantity || 1;
        setToastMessage(`${quantityAdded} x ${product.name} añadido(s) al carrito!`);
        setTimeout(() => setToastMessage(''), 3000);
    };
    
    // --- 👇 NUEVA FUNCIÓN PARA ALTERNAR LA VISTA ---
    const toggleLayout = () => {
        setLayout(prevLayout => (prevLayout === 'list' ? 'grid' : 'list'));
    };

    const filteredProducts = products.filter(product => selectedCategory ? product.category_id === selectedCategory : true);

    if (loading) return <LoadingSpinner />;
    if (error) return <p className={styles.error}>Error: {error}</p>;

    return (
        <div className={styles.menuContainer}>
            <h1>Nuestro Menú</h1>

            <div className={styles.filters}>
                <div className={styles.categoryButtons}>
                    <button onClick={() => setSelectedCategory(null)} className={!selectedCategory ? styles.active : ''}>
                        Todos
                    </button>
                    {categories.map(category => (
                        <button
                            key={category.id}
                            onClick={() => setSelectedCategory(category.id)}
                            className={selectedCategory === category.id ? styles.active : ''}
                        >
                            {category.name}
                        </button>
                    ))}
                </div>
                
                {/* --- 👇 BOTÓN ÚNICO QUE CAMBIA DE ICONO --- */}
                <div className={styles.layoutToggle}>
                    <button onClick={toggleLayout} title="Cambiar vista">
                        {layout === 'list' ? <GridIcon /> : <ListIcon />}
                    </button>
                </div>
            </div>
            
            <div className={`${styles.productList} ${styles[layout]}`}>
                {/* ... (mapeo de productos sin cambios) ... */}
                {filteredProducts.length > 0 ? filteredProducts.map(product => (
                    <div key={product.id} className={styles.productCard}>
                        <div onClick={() => setSelectedProduct(product)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                            <img src={product.image_url || 'https://via.placeholder.com/150'} alt={product.name} />
                            <div className={styles.cardContent}>
                                <h3>{product.name}</h3>
                            </div>
                        </div>
                        <div className={styles.cardFooter}>
                            <span className={styles.price}>${product.price.toFixed(2)}</span>
                            <button onClick={() => handleAddToCart(product)}>Añadir</button>
                        </div>
                    </div>
                )) : <p>No se encontraron productos.</p>}
            </div>
            
            {toastMessage && <div className={styles.toast}>{toastMessage}</div>}

            <ProductModal 
                product={selectedProduct} 
                onClose={() => setSelectedProduct(null)}
                onAddToCart={handleAddToCart}
            />
        </div>
    );
}