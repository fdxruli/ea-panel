// src/pages/Menu.jsx

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import styles from './Menu.module.css';
import { useCart } from '../context/CartContext';

export default function Menu() {
  const { addToCart } = useCart();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null); // null para "Todos"

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: productData } = await supabase.from("products").select("*").eq("is_active", true);
      const { data: categoryData } = await supabase.from("categories").select("*").order("name");
      
      setProducts(productData || []);
      setCategories(categoryData || []);
      setLoading(false);
    }
    fetchData();
  }, []);

  // Filtra los productos que se mostrarán
  const filteredProducts = selectedCategory
    ? products.filter(p => p.category_id === selectedCategory)
    : products;

  // Agrupa los productos por categoría solo para la vista
  const groupedMenu = categories.map(category => ({
      ...category,
      products: filteredProducts.filter(p => p.category_id === category.id)
  })).filter(category => category.products.length > 0);


  if (loading) return <p>Cargando menú...</p>;

  return (
    <div className={styles.menuContainer}>
      {/* Navbar de Categorías */}
      <nav className={styles.categoryNav}>
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
      </nav>

      {/* Grid de Productos */}
      <div className={styles.productsGrid}>
        {filteredProducts.map(product => (
          <div key={product.id} className={styles.productCard}>
            <img src={product.image_url || 'https://via.placeholder.com/300'} alt={product.name} className={styles.productImage} />
            <div className={styles.productInfo}>
              <h3 className={styles.productName}>{product.name}</h3>
              <p className={styles.productDescription}>{product.description}</p>
              <div className={styles.productFooter}>
                <span className={styles.productPrice}>${product.price}</span>
                <button 
                  className={styles.addToCartButton}
                  onClick={() => {
                    addToCart(product);
                    alert(`${product.name} ha sido añadido al carrito!`);
                  }}
                >
                  Agregar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}