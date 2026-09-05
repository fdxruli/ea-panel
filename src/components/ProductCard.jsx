/* src/components/ProductCard.jsx */
import React, { memo } from "react";
import styles from "../pages/Products.module.css";
import { useAdminAuth } from "../context/AdminAuthContext";
import ImageWithFallback from './ImageWithFallback';
import { Camera, Layers, TrendingUp } from 'lucide-react';

const StarIcon = memo(() => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#ffc107" stroke="#ffc107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
  </svg>
));
StarIcon.displayName = 'StarIcon';

const HeartIcon = memo(() => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
  </svg>
));
HeartIcon.displayName = 'HeartIcon';

const renderMatrixBadge = (matrixClass) => {
  switch (matrixClass) {
    case 'star':
      return <span className={`${styles.matrixBadge} ${styles.badgeStar}`}>⭐ Estrella</span>;
    case 'workhorse':
      return <span className={`${styles.matrixBadge} ${styles.badgeWorkhorse}`}>🐎 Caballo</span>;
    case 'puzzle':
      return <span className={`${styles.matrixBadge} ${styles.badgePuzzle}`}>🧩 Oportunidad</span>;
    default:
      return <span className={`${styles.matrixBadge} ${styles.badgeDog}`}>⚠️ Por Revisar</span>;
  }
};

const renderStockBadge = (status, maxPreparable) => {
  switch (status) {
    case 'out_of_stock':
      return <span className={`${styles.stockBadge} ${styles.stockOutOfStock}`}>🚫 Agotado</span>;
    case 'low_stock':
      return <span className={`${styles.stockBadge} ${styles.stockLow}`}>⚠️ Quedan {maxPreparable || 0}</span>;
    case 'in_stock':
      return <span className={`${styles.stockBadge} ${styles.stockInStock}`}>🟢 {maxPreparable !== null ? `${maxPreparable} porc.` : 'En Stock'}</span>;
    default:
      return <span className={`${styles.stockBadge} ${styles.stockUntracked}`}>⚪ Sin Receta</span>;
  }
};

const ProductCard = memo(({ product, categoryName, onToggle, onEdit, onManageImages, onSelect }) => {
  const { hasPermission } = useAdminAuth();

  const price = Number(product.price || 0);
  const cost = Number(product.effective_cost ?? product.cost ?? 0);
  const marginPercent = Number(product.margin_percent ?? (price > 0 ? ((price - cost) / price) * 100 : 0));

  const marginClass = marginPercent >= 55 
    ? styles.marginHigh 
    : marginPercent >= 40 
      ? styles.marginMedium 
      : styles.marginLow;

  const handleCardClick = (e) => {
    // Si el clic no provino de un botón o enlace de acción, abrir detalle
    if (!e.target.closest('button') && !e.target.closest('a') && onSelect) {
      onSelect(product);
    }
  };

  return (
    <div 
      className={`${styles.productCard} ${!product.is_active ? styles.inactive : ''}`}
      onClick={handleCardClick}
      title="Haz clic para ver analítica 360°"
    >
      <div className={styles.imageContainer}>
        <ImageWithFallback src={product.image_url || 'https://placehold.co/300x200'} alt={product.name} />
        <span className={styles.imageCount}>
          {product.image_count || 1} <Camera size={13} aria-hidden="true" />
        </span>
        <div className={styles.cardFloatingBadges}>
          {product.stock_status && renderStockBadge(product.stock_status, product.max_preparable)}
        </div>
      </div>

      <div className={styles.cardContent}>
        <div className={styles.categoryRow}>
          <span className={styles.categoryTag}>{categoryName || product.category_name || 'General'}</span>
          {product.menu_matrix_class && renderMatrixBadge(product.menu_matrix_class)}
        </div>

        <h3 className={styles.productName}>{product.name}</h3>

        <div className={styles.productStats}>
          <div className={styles.statItem}>
            <strong>{product.total_sold || 0}</strong>
            <span>Vendidos</span>
          </div>
          <div className={styles.statItem}>
            <strong>${(product.total_revenue || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}</strong>
            <span>Ingresos</span>
          </div>
          <div className={styles.statItem}>
            <div className={styles.iconStat}>
              <StarIcon />
              <strong>{product.avg_rating?.toFixed(1) || '-'}</strong>
            </div>
            <span>({product.reviews_count || 0})</span>
          </div>
          <div className={styles.statItem}>
            <div className={styles.iconStat}>
              <HeartIcon />
              <strong>{product.favorites_count || 0}</strong>
            </div>
            <span>Favoritos</span>
          </div>
        </div>

        <div className={styles.priceAndMarginRow}>
          <div className={styles.priceInfoCol}>
            <span className={styles.price}>${price.toFixed(2)}</span>
            <span className={styles.cost}>Costo: ${cost.toFixed(2)}</span>
          </div>
          <div className={`${styles.marginBadge} ${marginClass}`} title="Margen de Ganancia Bruta">
            <TrendingUp size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
            {marginPercent.toFixed(0)}%
          </div>
        </div>
      </div>

      <div className={styles.cardActions}>
        <button 
          onClick={(e) => { e.stopPropagation(); onSelect && onSelect(product); }}
          className={styles.viewDetailButton}
        >
          Ver 360°
        </button>
        {hasPermission('productos.edit') && (
          <>
            <button 
              onClick={(e) => { e.stopPropagation(); onEdit(product); }} 
              className={styles.editButton}
            >
              Editar
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onManageImages(product); }} 
              className={styles.manageButton}
            >
              Fotos
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onToggle(product.id, product.is_active); }} 
              className={styles.toggleButton}
            >
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
