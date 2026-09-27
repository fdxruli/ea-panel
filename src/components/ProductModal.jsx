import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './ProductModal.module.css';
import { useProducts } from '../context/ProductContext';
import { useCustomer } from '../context/CustomerContext';
import { useProductExtras } from '../context/ProductExtrasContext';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import DOMPurify from 'dompurify';
import ImageWithFallback from './ImageWithFallback';
import { animateToCart } from '../utils/cartAnimation';
import { broadcastStoreChange } from '../lib/broadcastRealtime';


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
const ShareIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="18" cy="5" r="3"></circle><circle cx="6" cy="12" r="3"></circle><circle cx="18" cy="19" r="3"></circle><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
    </svg>
);

const AverageRating = ({ reviews }) => {
    if (!reviews || reviews.length === 0) {
        return <p className={styles.noRating}>Aún no hay calificaciones. ¡Sé el primero en calificar!</p>;
    }

    const totalRating = reviews.reduce((sum, review) => sum + review.rating, 0);
    const average = totalRating / reviews.length;
    const fullStars = Math.floor(average);
    const decimalPart = average % 1;
    const emptyStars = 5 - fullStars - (decimalPart > 0.05 ? 1 : 0);

    return (
        <div className={styles.averageRatingContainer}>
            <div className={styles.stars}>
                {[...Array(fullStars)].map((_, i) => <span key={`full-${i}`} className={styles.starIcon}>★</span>)}
                {decimalPart > 0.05 && (
                    <span className={styles.partialStarContainer}>
                        <span className={styles.starIcon}>☆</span>
                        <span className={styles.partialStarFill} style={{ width: `${decimalPart * 100}%` }}>
                            <span className={styles.starIcon}>★</span>
                        </span>
                    </span>
                )}
                {[...Array(emptyStars)].map((_, i) => <span key={`empty-${i}`} className={styles.starIcon}>☆</span>)}
            </div>
            <span className={styles.ratingText}>{average.toFixed(1)} de 5 estrellas</span>
        </div>
    );
};

export default function ProductModal({ product, onClose, onAddToCart }) {
    const { showAlert } = useAlert();
    const [quantity, setQuantity] = useState(1);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [wasAdded, setWasAdded] = useState(false);
    const [activeTab, setActiveTab] = useState('details');
    const [selectedModifiers, setSelectedModifiers] = useState([]);
    const [itemNotes, setItemNotes] = useState('');

    const { reviews: allReviews, favorites, customerId, refetch: refetchExtras } = useProductExtras();

    const [productReviews, setProductReviews] = useState([]);
    const [isFavorite, setIsFavorite] = useState(false);
    const [hasUserReviewed, setHasUserReviewed] = useState(false);

    const [userRating, setUserRating] = useState(0);
    const [userComment, setUserComment] = useState('');
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const { products: liveProducts } = useProducts();
    const { phone, setPhoneModalOpen } = useCustomer();
    const [isReviewFormVisible, setIsReviewFormVisible] = useState(false);

    const [isAnimating, setIsAnimating] = useState(false);

    const intervalRef = useRef(null);
    const galleryImages = product ? [
        product.image_url,
        ...(product.product_images?.map(img => img.image_url) || [])
    ].filter(Boolean) : [];

    const isVip = Boolean(product?.is_vip_exclusive || product?.target_customer_tiers?.includes('vip'));
    const isSpecialAudience = Boolean(
        isVip ||
        (Array.isArray(product?.target_customer_tiers) && product.target_customer_tiers.length > 0) ||
        (Array.isArray(product?.target_customer_ids) && product.target_customer_ids.length > 0)
    );
    const modifierGroups = useMemo(() => Array.isArray(product?.modifiers) ? product.modifiers : [], [product?.modifiers]);
    const hasModifiers = modifierGroups.length > 0;

    const modifierDeltaSum = useMemo(() => {
        return selectedModifiers.reduce((sum, mod) => sum + (Number(mod.price_delta) || 0), 0);
    }, [selectedModifiers]);

    const effectiveUnitPrice = useMemo(() => {
        const base = Number(product?.price || 0);
        return Math.max(0, base + modifierDeltaSum);
    }, [product?.price, modifierDeltaSum]);

    const effectiveTotalPrice = effectiveUnitPrice * quantity;

    const handleToggleModifier = useCallback((group, option) => {
        setSelectedModifiers(prev => {
            const isSingle = group.max === 1;
            const exists = prev.some(m => m.option_id === option.id && m.group_id === group.id);

            if (isSingle) {
                if (exists) {
                    return group.required ? prev : prev.filter(m => !(m.group_id === group.id && m.option_id === option.id));
                }
                const withoutGroup = prev.filter(m => m.group_id !== group.id);
                return [
                    ...withoutGroup,
                    {
                        group_id: group.id,
                        group_name: group.name,
                        option_id: option.id,
                        name: option.name,
                        price_delta: Number(option.price_delta) || 0,
                    }
                ];
            } else {
                if (exists) {
                    return prev.filter(m => !(m.option_id === option.id && m.group_id === group.id));
                }
                const currentGroupCount = prev.filter(m => m.group_id === group.id).length;
                if (group.max && currentGroupCount >= group.max) {
                    showAlert(`Solo puedes seleccionar hasta ${group.max} opción(es) en "${group.name}".`);
                    return prev;
                }
                return [
                    ...prev,
                    {
                        group_id: group.id,
                        group_name: group.name,
                        option_id: option.id,
                        name: option.name,
                        price_delta: Number(option.price_delta) || 0,
                    }
                ];
            }
        });
    }, [showAlert]);

    useEffect(() => {
        const timer = setTimeout(() => setIsAnimating(true), 10);
        return () => clearTimeout(timer);
    }, []);

    useEffect(() => {
        if (product) {
            setQuantity(1);
            setCurrentImageIndex(0);
            setWasAdded(false);
            setActiveTab('details');
            setUserRating(0);
            setUserComment('');
            setIsReviewFormVisible(false);
            setSelectedModifiers([]);
            setItemNotes('');
        }
    }, [product?.id]);

    useEffect(() => {
        if (product) {
            const currentProductReviews = allReviews.filter(r => r.products?.id === product.id);
            setProductReviews(currentProductReviews);
        }
    }, [product?.id, allReviews]);

    useEffect(() => {
        if (product && customerId) {
            setIsFavorite(favorites.some(f => f.products?.id === product.id));
            setHasUserReviewed(productReviews.some(r => r.customer_id === customerId));
        } else {
            setIsFavorite(false);
            setHasUserReviewed(false);
        }
    }, [product?.id, favorites, productReviews, customerId]);


    const handleClose = useCallback(() => {
        setIsAnimating(false);
        setTimeout(onClose, 280);
    }, [onClose]);


    const handleNextImage = useCallback(() => {
        setCurrentImageIndex(prev => (prev + 1) % galleryImages.length);
    }, [galleryImages.length]);

    const handlePrevImage = () => {
        setCurrentImageIndex(prev => (prev - 1 + galleryImages.length) % galleryImages.length);
    };

    const handleShare = async () => {
        const url = window.location.href;
        try {
            await navigator.clipboard.writeText(url);
            showAlert("¡Enlace del producto copiado al portapapeles!");
        } catch (err) {
            console.error("Error copiando al portapapeles:", err);
            showAlert("No se pudo copiar el enlace. Por favor, intenta manualmente.");
        }
    }

    const startCarousel = useCallback(() => {
        stopCarousel();
        if (galleryImages.length > 1) {
            intervalRef.current = setInterval(handleNextImage, 4000);
        }
    }, [galleryImages.length, handleNextImage]);

    const stopCarousel = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
    };

    useEffect(() => {
        startCarousel();
        return () => stopCarousel();
    }, [startCarousel]);

    if (!product) return null;

    const handleAddToCartClick = (event) => {
        if (product?.is_out_of_stock) {
            showAlert("Lo sentimos, este producto se encuentra agotado.");
            return;
        }

        const isStillAvailable = liveProducts.some(p => p.id === product.id);
        if (!isStillAvailable) {
            showAlert("Lo sentimos, este producto ya no se encuentra disponible.");
            handleClose();
            return;
        }

        // Validar grupos de complementos requeridos
        for (const group of modifierGroups) {
            if (group.required) {
                const count = selectedModifiers.filter(m => m.group_id === group.id).length;
                const min = group.min || 1;
                if (count < min) {
                    showAlert(`Por favor selecciona al menos ${min} opción(es) en "${group.name}".`);
                    setActiveTab('modifiers');
                    return;
                }
            }
        }

        const customizedProduct = {
            ...product,
            price: effectiveUnitPrice,
            base_price: product.price,
            selected_modifiers: selectedModifiers,
            item_notes: itemNotes?.trim() || null,
        };

        // Bloquea explícitamente la propagación del evento hacia Menu.jsx
        onAddToCart(customizedProduct, quantity, null);

        // Usa el botón actual como origen estricto y la clase CSS correcta
        if (event?.currentTarget) {
            animateToCart({
                originElement: event.currentTarget,
                imgSrc: galleryImages[currentImageIndex],
                className: 'global-fly-to-cart', // Debe coincidir con tu CSS general
                flySize: 48 // Tamaño reducido temporalmente para mitigar el desbordamiento en el botón
            });
        }

        setWasAdded(true);
        setTimeout(() => setWasAdded(false), 2000);
    };

    const handleToggleFavorite = async () => {
        if (!phone || !customerId) {
            showAlert("Para guardar favoritos, primero necesitas ingresar tu número.");
            setPhoneModalOpen(true);
            return;
        }
        const isCurrentlyFavorite = isFavorite;
        setIsFavorite(!isCurrentlyFavorite);
        try {
            if (isCurrentlyFavorite) {
                await supabase.from('customer_favorites').delete().match({ product_id: product.id, customer_id: customerId });
            } else {
                await supabase.from('customer_favorites').insert({ product_id: product.id, customer_id: customerId });
            }
            broadcastStoreChange('favorites_updated', { customerId });
            refetchExtras();
        } catch (error) {
            console.error("Error toggling favorite:", error);
            showAlert("Hubo un error al guardar tu favorito. Por favor, intenta de nuevo.");
            setIsFavorite(isCurrentlyFavorite);
        }
    };

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!phone || !customerId) {
            showAlert("Para dejar una reseña, primero necesitas ingresar tu número.");
            setPhoneModalOpen(true);
            return;
        }
        if (userRating === 0) {
            showAlert("Por favor, selecciona una calificación de estrellas.");
            return;
        }
        setIsSubmittingReview(true);
        const cleanComment = DOMPurify.sanitize(userComment);
        const { error } = await supabase.from('product_reviews').insert({
            product_id: product.id, customer_id: customerId, rating: userRating, comment: cleanComment
        });
        if (error) {
            showAlert("Hubo un error al enviar tu reseña. Es posible que ya hayas calificado este producto.");
        } else {
            setUserRating(0);
            setUserComment('');
            broadcastStoreChange('reviews_updated');
            refetchExtras();
            setIsReviewFormVisible(false);
        }
        setIsSubmittingReview(false);
    };

    const incrementQuantity = () => setQuantity(q => q + 1);
    const decrementQuantity = () => setQuantity(q => (q > 1 ? q - 1 : 1));

    // --- 👇 Definimos los tamaños para la imagen del modal ---
    const modalImageSizes = [400, 800]; // Tamaños medianos/grandes
    const modalSizes = "(max-width: 768px) 100vw, 450px"; // 100% en móvil, 450px en desktop

    return (
        <div className={`${styles.overlay} ${isAnimating ? styles.open : ''}`} onClick={handleClose}>
            <div className={`${styles.modalContent} ${isAnimating ? styles.open : ''} ${isVip ? styles.vipModalContent : ''}`} onClick={(e) => e.stopPropagation()}>
                <div
                    className={styles.galleryContainer}
                    onMouseEnter={stopCarousel}
                    onMouseLeave={startCarousel}
                >
                    {galleryImages.length > 1 && (
                        <>
                            <button onClick={handlePrevImage} className={`${styles.navButton} ${styles.prev}`}>&#10094;</button>
                            <button onClick={handleNextImage} className={`${styles.navButton} ${styles.next}`}>&#10095;</button>
                        </>
                    )}
                    {galleryImages.map((src, index) => (
                        <ImageWithFallback
                            id={`modal-img-${product.id}-${index}`}
                            key={index}
                            src={src || 'https://placehold.co/400'}
                            alt={`${product.name} ${index + 1}`}
                            className={`${styles.productImage} ${index === currentImageIndex ? styles.active : ''}`}

                            // --- 👇 OPTIMIZACIÓN APLICADA ---
                            imageSizes={modalImageSizes}
                            sizes={modalSizes}
                            // Carga prioritaria solo para la primera imagen
                            priority={index === 0}
                        />
                    ))}
                </div>

                <div className={`${styles.productDetails} ${isVip ? styles.vipDetails : ''}`}>
                    <div className={styles.header}>
                        <div className={styles.headerInfo}>
                            <div className={styles.productTitleRow}>
                                <h1 className={styles.productName}>{product.name}</h1>
                                {isVip && (
                                    <span className={styles.vipBadge}>
                                        👑 Exclusivo VIP
                                    </span>
                                )}
                                {!isVip && isSpecialAudience && (
                                    <span className={styles.audienceBadge}>
                                        ⭐ Exclusivo
                                    </span>
                                )}
                            </div>
                            <AverageRating reviews={productReviews} />
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>

                            {/* Botón de Compartir */}
                            <button
                                type="button"
                                onClick={handleShare}
                                className={styles.favoriteButton}
                                title="Copiar enlace del producto"
                            >
                                <ShareIcon />
                            </button>

                            {/* Botón de Favorito (Solo móvil) */}
                            <button
                                type="button"
                                onClick={handleToggleFavorite}
                                className={`${styles.favoriteButton} ${styles.mobileOnly}`}
                            >
                                <HeartIcon isFavorite={isFavorite} />
                            </button>
                        </div>
                    </div>

                    <div className={styles.tabButtons}>
                        <button type="button" onClick={() => setActiveTab('details')} className={activeTab === 'details' ? styles.active : ''}>Detalles</button>
                        {hasModifiers && (
                            <button
                                type="button"
                                onClick={() => setActiveTab('modifiers')}
                                className={`${activeTab === 'modifiers' ? styles.active : ''} ${styles.tabWithCount}`}
                            >
                                Complementos
                                {selectedModifiers.length > 0 && (
                                    <span className={styles.tabBadge}>{selectedModifiers.length}</span>
                                )}
                            </button>
                        )}
                        <button type="button" onClick={() => setActiveTab('reviews')} className={activeTab === 'reviews' ? styles.active : ''}>Reseñas ({productReviews.length})</button>
                    </div>

                    <div className={styles.tabContent}>
                        {activeTab === 'details' && (
                            <div className={styles.tabContentInner}>
                                <p className={styles.productDescription}>{product.description || 'Descripción no disponible.'}</p>
                                {hasModifiers && (
                                    <div className={styles.detailsModifiersCallout} onClick={() => setActiveTab('modifiers')}>
                                        <div className={styles.calloutHeader}>
                                            <span className={styles.calloutIcon}>✨</span>
                                            <div>
                                                <strong>Personaliza con Complementos</strong>
                                                <p>{modifierGroups.map(g => g.name).join(', ')}</p>
                                            </div>
                                        </div>
                                        <button type="button" className={styles.calloutButton}>
                                            {selectedModifiers.length > 0 ? `Elegidos (${selectedModifiers.length})` : 'Personalizar'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        {activeTab === 'modifiers' && hasModifiers && (
                            <div className={styles.tabContentInner}>
                                <div className={styles.modifiersSection}>
                                    {modifierGroups.map(group => {
                                        const groupSelected = selectedModifiers.filter(m => m.group_id === group.id);
                                        return (
                                            <div key={group.id} className={styles.modifierGroupCard}>
                                                <div className={styles.modifierGroupHeader}>
                                                    <div>
                                                        <h4 className={styles.modifierGroupTitle}>{group.name}</h4>
                                                        <span className={styles.modifierGroupSubtitle}>
                                                            {group.max === 1 
                                                                ? 'Selecciona 1 opción' 
                                                                : group.max 
                                                                    ? `Hasta ${group.max} opciones` 
                                                                    : 'Opciones adicionales'}
                                                        </span>
                                                    </div>
                                                    {group.required && (
                                                        <span className={styles.requiredPill}>Requerido</span>
                                                    )}
                                                </div>

                                                <div className={styles.optionsList}>
                                                    {group.options?.map(opt => {
                                                        const isSelected = groupSelected.some(m => m.option_id === opt.id);
                                                        const delta = Number(opt.price_delta) || 0;
                                                        return (
                                                            <div
                                                                key={opt.id}
                                                                role="button"
                                                                tabIndex={0}
                                                                className={`${styles.optionRow} ${isSelected ? styles.optionRowSelected : ''}`}
                                                                onClick={() => handleToggleModifier(group, opt)}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === ' ' || e.key === 'Enter') {
                                                                        e.preventDefault();
                                                                        handleToggleModifier(group, opt);
                                                                    }
                                                                }}
                                                            >
                                                                <div className={styles.optionLeft}>
                                                                    <span className={`${styles.optionIndicator} ${group.max === 1 ? styles.radioIndicator : styles.checkIndicator} ${isSelected ? styles.indicatorActive : ''}`}>
                                                                        {isSelected && (group.max === 1 ? '•' : '✓')}
                                                                    </span>
                                                                    <span className={styles.optionLabel}>{opt.name}</span>
                                                                </div>
                                                                <div className={styles.optionRight}>
                                                                    {delta > 0 && <span className={styles.pricePlus}>+${delta.toFixed(2)}</span>}
                                                                    {delta < 0 && <span className={styles.priceMinus}>-${Math.abs(delta).toFixed(2)}</span>}
                                                                    {delta === 0 && <span className={styles.priceZero}>Sin costo</span>}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}

                                    <div className={styles.instructionsContainer}>
                                        <label htmlFor="product-item-notes" className={styles.instructionsLabel}>
                                            Instrucciones de preparación (opcional):
                                        </label>
                                        <textarea
                                            id="product-item-notes"
                                            rows="2"
                                            className={styles.instructionsTextarea}
                                            placeholder="Ej. salsa aparte, bien crujiente, sin aderezo..."
                                            value={itemNotes}
                                            onChange={(e) => setItemNotes(e.target.value)}
                                            maxLength={200}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        {activeTab === 'reviews' && (
                            <div className={styles.tabContentInner}>
                                <div className={styles.reviewsSection}>
                                    <div className={styles.reviewList}>
                                        {productReviews.length === 0 ? (
                                            <p>Todavía no hay reseñas. ¡Sé el primero!</p>
                                        ) : (
                                            productReviews.map(review => (
                                                <div key={review.id} className={styles.reviewItem}>
                                                    <div className={styles.reviewHeader}>
                                                        <strong>{review.customers?.name || 'Anónimo'}</strong>
                                                        <StarRating rating={review.rating} />
                                                    </div>
                                                    <p>{review.comment}</p>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {(activeTab === 'details' || activeTab === 'modifiers') && (
                        <div className={styles.footer}>
                            <div className={styles.quantitySelector}>
                                <button type="button" onClick={decrementQuantity} disabled={product.is_out_of_stock}>-</button>
                                <span>{quantity}</span>
                                <button type="button" onClick={incrementQuantity} disabled={product.is_out_of_stock}>+</button>
                            </div>
                            <div className={styles.actionButtons}>
                                <button
                                    type="button"
                                    onClick={handleAddToCartClick}
                                    className={`${styles.addButton} ${wasAdded ? styles.added : ''} ${product.is_out_of_stock ? styles.outOfStockButton : ''}`}
                                    disabled={wasAdded || product.is_out_of_stock}
                                >
                                    {product.is_out_of_stock 
                                        ? 'Producto Agotado' 
                                        : wasAdded 
                                            ? '¡Añadido!' 
                                            : `Añadir por $${effectiveTotalPrice.toFixed(2)}${selectedModifiers.length > 0 ? ` (+${selectedModifiers.length})` : ''}`
                                    }
                                </button>
                                <button type="button" onClick={handleToggleFavorite} className={`${styles.favoriteButton} ${styles.desktopOnly}`}>
                                    <HeartIcon isFavorite={isFavorite} />
                                </button>
                            </div>
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