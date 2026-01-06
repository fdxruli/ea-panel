/* src/components/ProductCard.jsx */
import React, { memo } from "react";
import styles from "../pages/Products.module.css"; // Ajusta la ruta si es necesario
import { useAdminAuth } from "../context/AdminAuthContext";
import ImageWithFallback from './ImageWithFallback';

// --- ICONOS MOVIDOS AQUÍ ---
const StarIcon = memo(() => ( <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#ffc107" stroke="#ffc107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>));
StarIcon.displayName = 'StarIcon';

const HeartIcon = memo(() => ( <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>));
HeartIcon.displayName = 'HeartIcon';
// --- FIN ICONOS ---

const ProductCard = memo(({ product, categoryName, onToggle, onEdit, onManageImages }) => {
    const { hasPermission } = useAdminAuth();
    return (
        <div className={`${styles.productCard} ${!product.is_active ? styles.inactive : ''}`}>
            <div className={styles.imageContainer}>
                <ImageWithFallback src={product.image_url || 'https://placehold.co/300x200'} alt={product.name} />
                <span className={styles.imageCount}>{1 + (product.product_images?.length || 0)} 📸</span>
            </div>
            <div className={styles.cardContent}>
                <span className={styles.categoryTag}>{categoryName}</span>
                <h3 className={styles.productName}>{product.name}</h3>
                <div className={styles.productStats}>
                    <div className={styles.statItem}><strong>{product.total_sold || 0}</strong><span>Vendidos</span></div>
                    <div className={styles.statItem}><strong>${(product.total_revenue || 0).toFixed(2)}</strong><span>Ingresos</span></div>
                    <div className={styles.statItem}><div className={styles.iconStat}><StarIcon /><strong>{product.avg_rating?.toFixed(1) || 'N/A'}</strong></div><span>({product.reviews_count || 0} reseñas)</span></div>
                    <div className={styles.statItem}><div className={styles.iconStat}><HeartIcon /><strong>{product.favorites_count || 0}</strong></div><span>Favoritos</span></div>
                </div>
                <div className={styles.priceInfo}>
                    <span className={styles.price}>Precio: ${product.price.toFixed(2)}</span>
                    <span className={styles.cost}>Costo: ${product.cost.toFixed(2)}</span>
                </div>
            </div>
            <div className={styles.cardActions}>
                {hasPermission('productos.edit') && (
                    <>
                        <button onClick={() => onEdit(product)} className={styles.editButton}>Editar</button>
                        <button onClick={() => onManageImages(product)} className={styles.manageButton}>Imágenes</button>
                        <button onClick={() => onToggle(product.id, product.is_active)} className={styles.toggleButton}>
                            {product.is_active ? "Desactivar" : "Activar"}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
});
ProductCard.displayName = 'ProductCard';

export default ProductCard;