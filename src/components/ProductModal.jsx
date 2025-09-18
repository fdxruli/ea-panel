// src/components/ProductModal.jsx (ULTRA RÁPIDO CON CONTEXTO)

import React, { useState, useEffect, useCallback } from 'react';
import styles from './ProductModal.module.css';
import { useProducts } from '../context/ProductContext';
import { useCustomer } from '../context/CustomerContext';
import { useProductExtras } from '../context/ProductExtrasContext'; // <-- 1. IMPORTAR
import { supabase } from '../lib/supabaseClient';

// ... (Componentes StarRating, HeartIcon, AverageRating no cambian)

const StarRating = ({ rating, onRatingChange }) => {
    const [hoverRating, setHoverRating] = useState(0);
    return (
        <div className={styles.starRating}>
            {[1, 2, 3, 4, 5].map((star) => (
                <span
                    key={star}
                    className={styles.star}
                    onClick={() => onRatingChange && onRatingChange(star)}
                    onMouseEnter={() => onRatingChange && setHoverRating(star)}
                    onMouseLeave={() => onRatingChange && setHoverRating(0)}
                >
                    {(hoverRating || rating) >= star ? '★' : '☆'}
                </span>
            ))}
        </div>
    );
};
const HeartIcon = ({ isFavorite }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
         fill={isFavorite ? 'var(--color-primary)' : 'none'}
         stroke={isFavorite ? 'var(--color-primary)' : 'currentColor'}
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
    </svg>
);
const AverageRating = ({ reviews }) => {
    if (!reviews || reviews.length === 0) {
        return <p className={styles.noRating}>Aún no hay calificaciones. ¡Sé el primero en calificar!</p>;
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const average = totalRating / reviews.length;
    const fullStars = Math.floor(average);
    const halfStar = average % 1 >= 0.5 ? 1 : 0;
    const emptyStars = 5 - fullStars - halfStar;

    return (
        <div className={styles.averageRatingContainer}>
            <div className={styles.stars}>
                {'★'.repeat(fullStars)}
                {halfStar ? '½' : ''}
                {'☆'.repeat(emptyStars)}
            </div>
            <span className={styles.ratingText}>{average.toFixed(1)} de 5 estrellas</span>
        </div>
    );
};


export default function ProductModal({ product, onClose, onAddToCart }) {
    const [quantity, setQuantity] = useState(1);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [wasAdded, setWasAdded] = useState(false);
    const [activeTab, setActiveTab] = useState('details');
    
    // --- 👇 2. USAR DATOS DEL CONTEXTO ---
    const { reviews: allReviews, favorites: allFavorites, customerId, refetch: refetchExtras } = useProductExtras();
    const [productReviews, setProductReviews] = useState([]);
    const [isFavorite, setIsFavorite] = useState(false);
    const [hasUserReviewed, setHasUserReviewed] = useState(false);
    
    const [userRating, setUserRating] = useState(0);
    const [userComment, setUserComment] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const { products: liveProducts } = useProducts();
    const { phone, setPhoneModalOpen } = useCustomer();
    const [isReviewFormVisible, setIsReviewFormVisible] = useState(false);

    const galleryImages = product ? [
        product.image_url,
        ...(product.product_images?.map(img => img.image_url) || [])
    ].filter(Boolean) : [];

    // --- 👇 3. LÓGICA SIMPLIFICADA PARA ACTUALIZAR EL ESTADO DEL MODAL ---
    useEffect(() => {
        if (product) {
            // Filtra las reseñas para este producto específico desde el contexto
            const currentReviews = allReviews.filter(r => r.products.id === product.id);
            setProductReviews(currentReviews);

            if (customerId) {
                // Comprueba si el producto es favorito desde el contexto
                setIsFavorite(allFavorites.some(f => f.products.id === product.id));
                // Comprueba si el usuario ya ha dejado una reseña desde el contexto
                setHasUserReviewed(currentReviews.some(r => r.customer_id === customerId));
            } else {
                setIsFavorite(false);
                setHasUserReviewed(false);
            }

            // Resetea el estado del formulario y las pestañas
            setQuantity(1);
            setCurrentImageIndex(0);
            setWasAdded(false);
            setActiveTab('details');
            setUserRating(0);
            setUserComment('');
            setIsReviewFormVisible(false);
        }
    }, [product, allReviews, allFavorites, customerId]);


    if (!product) return null;

    const handleNextImage = () => setCurrentImageIndex((prev) => (prev + 1) % galleryImages.length);
    const handlePrevImage = () => setCurrentImageIndex((prev) => (prev - 1 + galleryImages.length) % galleryImages.length);

    const handleAddToCartClick = (event) => {
        const isStillAvailable = liveProducts.some(p => p.id === product.id);
        if (!isStillAvailable) {
            alert("Lo sentimos, este producto ya no se encuentra disponible.");
            onClose();
            return;
        }
        onAddToCart(product, quantity, event);
        setWasAdded(true);
        setTimeout(() => setWasAdded(false), 2000);
    };

    const handleToggleFavorite = async () => {
        if (!phone || !customerId) {
            alert("Para guardar favoritos, primero necesitas ingresar tu número.");
            setPhoneModalOpen(true);
            return;
        }
        const isCurrentlyFavorite = isFavorite;
        setIsFavorite(!isCurrentlyFavorite); // Actualización optimista
        if (isCurrentlyFavorite) {
            await supabase.from('customer_favorites').delete().match({ product_id: product.id, customer_id: customerId });
        } else {
            await supabase.from('customer_favorites').insert({ product_id: product.id, customer_id: customerId });
        }
        refetchExtras(); // Refresca los datos en el contexto
    };

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!phone || !customerId) {
            alert("Para dejar una reseña, primero necesitas ingresar tu número.");
            setPhoneModalOpen(true);
            return;
        }
        if (userRating === 0) {
            alert("Por favor, selecciona una calificación de estrellas.");
            return;
        }
        setIsSubmittingReview(true);
        const { error } = await supabase.from('product_reviews').insert({
            product_id: product.id, customer_id: customerId, rating: userRating, comment: userComment
        });
        if (error) {
            alert("Hubo un error al enviar tu reseña. Es posible que ya hayas calificado este producto.");
        } else {
            setUserRating(0);
            setUserComment('');
            refetchExtras(); // Refresca los datos en el contexto
            setIsReviewFormVisible(false);
        }
        setIsSubmittingReview(false);
    };

    const incrementQuantity = () => setQuantity(q => q + 1);
    const decrementQuantity = () => setQuantity(q => (q > 1 ? q - 1 : 1));

    // --- 👇 4. EL RESTO DEL JSX NO CAMBIA, SOLO USA LAS VARIABLES ACTUALIZADAS ---
    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.galleryContainer}>
                    {galleryImages.length > 1 && (
                      <>
                        <button onClick={handlePrevImage} className={`${styles.navButton} ${styles.prev}`}>&#10094;</button>
                        <button onClick={handleNextImage} className={`${styles.navButton} ${styles.next}`}>&#10095;</button>
                      </>
                    )}
                    <img src={galleryImages[currentImageIndex] || 'https://via.placeholder.com/400'} alt={product.name} className={styles.productImage} />
                    <button onClick={onClose} className={styles.closeButton}>×</button>
                </div>

                <div className={styles.productDetails}>
                    <div className={styles.header}>
                        <div className={styles.headerInfo}>
                            <h2 className={styles.productName}>{product.name}</h2>
                            <AverageRating reviews={productReviews} /> 
                        </div>
                        <button type="button" onClick={handleToggleFavorite} className={styles.favoriteButton}>
                            <HeartIcon isFavorite={isFavorite} />
                        </button>
                    </div>

                    <div className={styles.tabButtons}>
                        <button type="button" onClick={() => setActiveTab('details')} className={activeTab === 'details' ? styles.active : ''}>Detalles</button>
                        <button type="button" onClick={() => setActiveTab('reviews')} className={activeTab === 'reviews' ? styles.active : ''}>Reseñas ({productReviews.length})</button>
                    </div>

                    <div className={styles.tabContent}>
                        {activeTab === 'details' && (
                            <p className={styles.productDescription}>{product.description || 'Descripción no disponible.'}</p>
                        )}
                        {activeTab === 'reviews' && (
                            <div className={styles.reviewsSection}>
                                <div className={styles.reviewList}>
                                    {productReviews.length === 0 ? <p>Todavía no hay reseñas. ¡Sé el primero!</p> :
                                     productReviews.map(review => (
                                        <div key={review.id} className={styles.reviewItem}>
                                            <div className={styles.reviewHeader}>
                                                <strong>{review.customers?.name || 'Anónimo'}</strong>
                                                <StarRating rating={review.rating} />
                                            </div>
                                            <p>{review.comment}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    
                    {activeTab === 'details' && (
                        <div className={styles.footer}>
                            <div className={styles.quantitySelector}>
                                <button type="button" onClick={decrementQuantity}>-</button>
                                <span>{quantity}</span>
                                <button type="button" onClick={incrementQuantity}>+</button>
                            </div>
                            <button type="button" onClick={handleAddToCartClick} className={`${styles.addButton} ${wasAdded ? styles.added : ''}`} disabled={wasAdded}>
                                {wasAdded ? '¡Añadido!' : `Añadir por $${(product.price * quantity).toFixed(2)}`}
                            </button>
                        </div>
                    )}
                    {activeTab === 'reviews' && (
                        <div className={styles.footer}>
                             {!isReviewFormVisible ? (
                                <button 
                                    type="button" 
                                    onClick={() => setIsReviewFormVisible(true)} 
                                    className={styles.showReviewFormButton}
                                    disabled={hasUserReviewed}
                                >
                                    {hasUserReviewed ? 'Ya has dejado una reseña' : 'Escribir una reseña'}
                                </button>
                            ) : (
                                <form onSubmit={handleReviewSubmit} className={styles.reviewForm}>
                                    <StarRating rating={userRating} onRatingChange={setUserRating} />
                                    <textarea rows="3" placeholder="¿Qué te pareció?" value={userComment} onChange={(e) => setUserComment(e.target.value)} />
                                    <div className={styles.formActions}>
                                        <button type="button" onClick={() => setIsReviewFormVisible(false)} className={styles.cancelButton}>
                                            Cancelar
                                        </button>
                                        <button type="submit" className={styles.reviewSubmitButton} disabled={isSubmittingReview}>
                                            {isSubmittingReview ? 'Publicando...' : 'Publicar'}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}