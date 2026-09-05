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
const areSameProduct = (prevProduct, nextProduct) => {
  if (prevProduct === nextProduct) return true;
  if (!prevProduct || !nextProduct) return prevProduct === nextProduct;

  return prevProduct.id === nextProduct.id &&
    prevProduct.name === nextProduct.name &&
    prevProduct.description === nextProduct.description &&
    prevProduct.price === nextProduct.price &&
    prevProduct.original_price === nextProduct.original_price &&
    prevProduct.image_url === nextProduct.image_url &&
    prevProduct.is_out_of_stock === nextProduct.is_out_of_stock &&
    prevProduct.is_exclusive === nextProduct.is_exclusive &&
    prevProduct.slug === nextProduct.slug &&
    prevProduct.updated_at === nextProduct.updated_at &&
    prevProduct.product_images === nextProduct.product_images;
};

const areEqual = (prevProps, nextProps) => {
  return areSameProduct(prevProps.product, nextProps.product) &&
    prevProps.layout === nextProps.layout &&
    prevProps.inactive === nextProps.inactive &&
    prevProps.linkUrl === nextProps.linkUrl &&
    prevProps.imagePriority === nextProps.imagePriority &&
    prevProps.thumbnailSize === nextProps.thumbnailSize &&
    // Debes comparar las render props para reaccionar a los cambios de estado global
    prevProps.renderActions === nextProps.renderActions &&
    prevProps.renderPriceSection === nextProps.renderPriceSection &&
    prevProps.renderImageOverlay === nextProps.renderImageOverlay &&
    prevProps.renderContentBody === nextProps.renderContentBody &&
    prevProps.renderContentTop === nextProps.renderContentTop;
};

const ProductCardContent = ({
  product,
  layout,
  imageUrl,
  imageWidths,
  imageSizes,
  imagePriority,
  renderImageOverlay,
  renderContentTop,
  renderContentBody,
}) => (
  <div className={styles.innerContent}>
    <div className={`${styles.imageContainer} ${layout === 'list' ? styles.listImageContainer : ''}`}>
      {renderImageOverlay && (
        <div className={styles.overlaySlot}>
          {renderImageOverlay(product)}
        </div>
      )}
      <ImageWithFallback
        src={imageUrl}
        alt={`Imagen de ${product.name}`}
        className={styles.productImage}
        imageSizes={imageWidths}
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
  const parsedThumbnailSizes = typeof thumbnailSize === 'string'
    ? thumbnailSize.split(',').map((value) => Number(value.trim())).filter(Number.isFinite)
    : [];
  const imageWidths = parsedThumbnailSizes.length > 0 ? parsedThumbnailSizes : [360, 540, 720];

  const contentProps = {
    product,
    layout,
    imageUrl,
    imageWidths,
    imageSizes,
    imagePriority,
    renderImageOverlay,
    renderContentTop,
    renderContentBody,
  };

  return (
    <article className={cardClassName}>
      {linkUrl ? (
        <Link to={linkUrl} className={styles.productLink}>
          <ProductCardContent {...contentProps} />
        </Link>
      ) : (
        <ProductCardContent {...contentProps} />
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
