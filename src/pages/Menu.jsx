// src/pages/Menu.jsx (CORREGIDO)

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import styles from './Menu.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ProductModal from '../components/ProductModal';

export default function Menu() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { addToCart } = useCart();
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [toastMessage, setToastMessage] = useState('');

    // Estado para controlar el modal
    const [selectedProduct, setSelectedProduct] = useState(null);
    
    useEffect(() => {
        const fetchProductsAndCategories = async () => {
            try {
                setLoading(true);
                const { data: productsData, error: productsError } = await supabase
                    .from('products')
                    .select(`
                        *, 
                        product_images ( id, image_url ) 
                    `)
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

    // --- AQUÍ ESTÁ LA CORRECCIÓN ---
    // La función ahora acepta un segundo argumento "quantity".
    // Cuando se llama desde el botón "Añadir", quantity es undefined y el contexto usa 1 por defecto.
    // Cuando se llama desde el modal, quantity tiene el valor seleccionado.
    const handleAddToCart = (product, quantity) => {
        addToCart(product, quantity);
        const quantityAdded = quantity || 1;
        setToastMessage(`${quantityAdded} x ${product.name} añadido(s) al carrito!`);
        setTimeout(() => {
            setToastMessage('');
        }, 3000);
    };

    const filteredProducts = products
        .filter(product => selectedCategory ? product.category_id === selectedCategory : true)
        .filter(product => product.name.toLowerCase().includes(searchTerm.toLowerCase()));

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
            </div>

            <div className={styles.productList}>
                {filteredProducts.length > 0 ? filteredProducts.map(product => (
                    <div key={product.id} className={styles.productCard}>
                        
                        {/* Este div abre el modal al hacer clic en la imagen o el texto */}
                        <div onClick={() => setSelectedProduct(product)} style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
                            <img src={product.image_url || 'https://via.placeholder.com/150'} alt={product.name} />
                            <div className={styles.cardContent}>
                                <h3>{product.name}</h3>
                            </div>
                        </div>
                        
                        {/* El footer con el botón "Añadir" que agrega 1 producto */}
                        <div className={styles.cardFooter}>
                            <span className={styles.price}>${product.price.toFixed(2)}</span>
                            <button onClick={() => handleAddToCart(product)}>Añadir</button>
                        </div>
                    </div>
                )) : <p>No se encontraron productos.</p>}
            </div>
            
            {toastMessage && (
                <div className={styles.toast}>
                    {toastMessage}
                </div>
            )}

            {/* Renderiza el modal y le pasa la función handleAddToCart corregida */}
            <ProductModal 
                product={selectedProduct} 
                onClose={() => setSelectedProduct(null)}
                onAddToCart={handleAddToCart}
            />
        </div>
    );
}