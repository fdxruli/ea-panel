// src/components/ProductModal.jsx (MODIFICADO)

import React, { useState, useEffect } from 'react';
import styles from './ProductModal.module.css';

export default function ProductModal({ product, onClose, onAddToCart }) {
  // --- NUEVO: Estado para la cantidad ---
  const [quantity, setQuantity] = useState(1);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  const images = product ? [product.image_url, ...product.product_images.map(img => img.image_url)].filter(Boolean) : [];

  // Reinicia los estados cuando el producto cambia
  useEffect(() => {
    setCurrentImageIndex(0);
    setQuantity(1); // <-- Resetea la cantidad a 1
  }, [product]);

  if (!product) return null;

  // --- ACTUALIZADO: Pasa la cantidad al añadir al carrito ---
  const handleAddToCart = () => {
    onAddToCart(product, quantity); // <-- Pasa la cantidad seleccionada
    onClose(); 
  };
  
  // --- NUEVO: Funciones para el contador de cantidad ---
  const incrementQuantity = () => setQuantity(prev => prev + 1);
  const decrementQuantity = () => setQuantity(prev => (prev > 1 ? prev - 1 : 1));

  const goToPrevious = () => {
    const isFirstImage = currentImageIndex === 0;
    const newIndex = isFirstImage ? images.length - 1 : currentImageIndex - 1;
    setCurrentImageIndex(newIndex);
  };

  const goToNext = () => {
    const isLastImage = currentImageIndex === images.length - 1;
    const newIndex = isLastImage ? 0 : currentImageIndex + 1;
    setCurrentImageIndex(newIndex);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* CORREGIDO: El botón ahora tiene su propio onClick y funciona correctamente */}
        <button onClick={onClose} className={styles.closeButton}>×</button>
        
        <div className={styles.galleryContainer}>
          {images.length > 1 && <button onClick={goToPrevious} className={`${styles.navButton} ${styles.prev}`}>&#10094;</button>}
          <img src={images[currentImageIndex] || 'https://via.placeholder.com/400x300'} alt={product.name} className={styles.productImage} />
          {images.length > 1 && <button onClick={goToNext} className={`${styles.navButton} ${styles.next}`}>&#10095;</button>}
        </div>
        
        <div className={styles.productDetails}>
          <h2 className={styles.productName}>{product.name}</h2>
          <p className={styles.productDescription}>{product.description}</p>
          
          <div className={styles.footer}>
            <span className={styles.productPrice}>${(product.price * quantity).toFixed(2)}</span>
            
            {/* --- NUEVO: Selector de cantidad --- */}
            <div className={styles.quantitySelector}>
              <button onClick={decrementQuantity}>-</button>
              <span>{quantity}</span>
              <button onClick={incrementQuantity}>+</button>
            </div>
            
            <button onClick={handleAddToCart} className={styles.addButton}>
              Añadir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}