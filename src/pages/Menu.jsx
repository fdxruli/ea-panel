// src/pages/Menu.jsx

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import styles from './Menu.module.css';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Menu() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { addToCart } = useCart();
    const [categories, setCategories] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    // --- NUEVO: Estado para el mensaje de notificación ---
    const [toastMessage, setToastMessage] = useState('');

    useEffect(() => {
        const fetchProductsAndCategories = async () => {
            try {
                setLoading(true);
                // Obtener productos activos
                const { data: productsData, error: productsError } = await supabase
                    .from('products')
                    .select('*')
                    .eq('is_active', true);
                if (productsError) throw productsError;

                // Obtener categorías
                const { data: categoriesData, error: categoriesError } = await supabase
                    .from('categories')
                    .select('*');
                if (categoriesError) throw categoriesError;

                // Extraer y ordenar categorías únicas de los productos
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

    // --- NUEVO: Lógica para manejar la notificación ---
    const handleAddToCart = (product) => {
        addToCart(product);
        // Muestra el mensaje
        setToastMessage(`${product.name} añadido al carrito!`);
        // Oculta el mensaje después de 3 segundos
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
                        <img src={product.image_url || 'https://via.placeholder.com/150'} alt={product.name} />

                        {/* --- DIV CONTENEDOR PARA EL TEXTO --- */}
                        <div className={styles.cardContent}>
                            <h3>{product.name}</h3>
                            <p>{product.description}</p>

                            {/* --- DIV FOOTER PARA PRECIO Y BOTÓN --- */}
                            <div className={styles.cardFooter}>
                                <span className={styles.price}>${product.price.toFixed(2)}</span>
                                <button onClick={() => handleAddToCart(product)}>Añadir</button>
                            </div>
                        </div>

                    </div>
                )) : <p>No se encontraron productos.</p>}
            </div>

            {/* --- NUEVO: Elemento de la notificación --- */}
            {toastMessage && (
                <div className={styles.toast}>
                    {toastMessage}
                </div>
            )}
        </div>
    );
}