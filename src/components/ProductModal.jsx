// src/components/ProductModal.jsx (CORREGIDO Y RESTAURADO)

import React, { useState, useEffect } from 'react';
import styles from './ProductModal.module.css';

export default function ProductModal({ product, onClose, onAddToCart }) {
    const [quantity, setQuantity] = useState(1);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);

    // Combina la imagen principal con las de la galería
    const galleryImages = [
        product?.image_url,
        ...(product?.product_images?.map(img => img.image_url) || [])
    ].filter(Boolean); // Filtra para eliminar URLs nulas o vacías

    // Resetea la cantidad y la imagen cuando el producto cambia
    useEffect(() => {
        setQuantity(1);
        setCurrentImageIndex(0);
    }, [product]);

    if (!product) {
        return null;
    }

    const handleNextImage = () => {
        setCurrentImageIndex((prevIndex) => (prevIndex + 1) % galleryImages.length);
    };

    const handlePrevImage = () => {
        setCurrentImageIndex((prevIndex) => (prevIndex - 1 + galleryImages.length) % galleryImages.length);
    };

    const handleAddToCartClick = () => {
        onAddToCart(product, quantity);
        onClose(); // Cierra el modal después de agregar
    };

    const incrementQuantity = () => setQuantity(q => q + 1);
    const decrementQuantity = () => setQuantity(q => (q > 1 ? q - 1 : 1));

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                
                <div className={styles.galleryContainer}>
                    <img
                        src={galleryImages[currentImageIndex] || 'https://via.placeholder.com/500x300'}
                        alt={product.name}
                        className={styles.productImage}
                    />
                    {galleryImages.length > 1 && (
                        <>
                            <button onClick={handlePrevImage} className={`${styles.navButton} ${styles.prev}`}>&#10094;</button>
                            <button onClick={handleNextImage} className={`${styles.navButton} ${styles.next}`}>&#10095;</button>
                        </>
                    )}
                     <button onClick={onClose} className={styles.closeButton}>×</button>
                </div>

                <div className={styles.productDetails}>
                    <h2 className={styles.productName}>{product.name}</h2>
                    <p className={styles.productDescription}>
                        {product.description || 'Descripción no disponible.'}
                    </p>
                    
                    <div className={styles.footer}>
                        <div className={styles.quantitySelector}>
                            <button onClick={decrementQuantity}>-</button>
                            <span>{quantity}</span>
                            <button onClick={incrementQuantity}>+</button>
                        </div>
                        <button onClick={handleAddToCartClick} className={styles.addButton}>
                            Añadir por ${ (product.price * quantity).toFixed(2) }
                        </button>
                    </div>
                </div>

            </div>
        </div>
    );
}