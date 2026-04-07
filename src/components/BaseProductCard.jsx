/* src/components/BaseProductCard.jsx */
import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import ImageWithFallback from './ImageWithFallback';
import styles from './BaseProductCard.module.css';

/**
 * Función de comparación estricta para asegurar que React.memo funcione
 * correctamente incluso si las referencias de las render props cambian por accidente.
 * Nos basamos en la inmutabilidad del objeto product y el layout.
 */
const areEqual = (prevProps, nextProps) => {
  return prevProps.product.id === nextProps.product.id &&
    prevProps.product.updated_at === nextProps.product.updated_at &&
    prevProps.layout === nextProps.layout &&
    prevProps.inactive === nextProps.inactive &&
    // Debes comparar las render props para reaccionar a los cambios de estado global
    prevProps.renderActions === nextProps.renderActions &&
    prevProps.renderPriceSection === nextProps.renderPriceSection &&
    prevProps.renderImageOverlay === nextProps.renderImageOverlay &&
    prevProps.renderContentBody === nextProps.renderContentBody &&
    prevProps.renderContentTop === nextProps.renderContentTop;
};

const BaseProductCard = memo(({
  product,
  layout = 'grid',
  inactive = false,
  linkUrl = null,
  imagePriority = false,
  thumbnailSize = '720, 520',
  // Slots (Render Props)
  renderImageOverlay,
  renderContentTop,
  renderContentBody,
  renderPriceSection,
  renderActions,
}) => {
  const cardClassName = `${styles.baseCard} ${layout === 'list' ? styles.listCard : ''} ${inactive ? styles.inactive : ''}`;
  const imageSizes = layout === 'list'
    ? '(max-width: 767px) 100vw, 48vw'
    : '(max-width: 430px) 100vw, (max-width: 767px) 50vw, 33vw';

  const imageUrl = product?.image_url || product?.product_images?.[0]?.image_url || '';

  const InnerContent = () => (
    <div className={styles.innerContent}>
      <div className={`${styles.imageContainer} ${layout === 'list' ? styles.listImageContainer : ''}`}>
        {renderImageOverlay && (
          <div className={styles.overlaySlot}>
            {renderImageOverlay(product)}
          </div>
        )}
        <ImageWithFallback
          src={imageUrl} // Si tienes el util getThumbnailUrl, aplícalo aquí o en el renderOverlay
          alt={`Imagen de ${product.name}`}
          className={styles.productImage}
          sizes={imageSizes}
          priority={imagePriority}
        />
      </div>

      <div className={styles.cardContent}>
        {renderContentTop && renderContentTop(product)}
        <h3 className={styles.productName}>{product.name}</h3>
        {renderContentBody && renderContentBody(product)}
      </div>
    </div>
  );

  return (
    <article className={cardClassName}>
      {linkUrl ? (
        <Link to={linkUrl} className={styles.productLink}>
          <InnerContent />
        </Link>
      ) : (
        <InnerContent />
      )}

      {(renderPriceSection || renderActions) && (
        <div className={styles.cardFooter}>
          {renderPriceSection && renderPriceSection(product)}
          {renderActions && (
            <div className={styles.actionsSlot}>
              {renderActions(product)}
            </div>
          )}
        </div>
      )}
    </article>
  );
}, areEqual);

BaseProductCard.displayName = 'BaseProductCard';

export default BaseProductCard;