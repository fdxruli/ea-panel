import React from 'react';
import styles from './ProductSkeleton.module.css';

const ProductSkeleton = ({ layout = 'grid' }) => {
  const cardClassName = `${styles.skeletonCard} ${layout === 'list' ? styles.listCard : ''}`;
  const shimmerClass = styles.shimmerContent;

  return (
    <article className={cardClassName} aria-hidden="true" data-testid="product-skeleton">
      <div className={styles.innerContent}>
        <div className={`${styles.imageContainer} ${layout === 'list' ? styles.listImageContainer : ''}`}>
          <div className={`${styles.imageSkeleton} ${shimmerClass}`} />
        </div>

        <div className={styles.cardContent}>
          <div className={`${styles.titleSkeleton} ${shimmerClass}`} />
          <div className={`${styles.descSkeleton} ${shimmerClass}`} />
          <div className={`${styles.descSkeletonShort} ${shimmerClass}`} />
        </div>
      </div>

      <div className={styles.cardFooter}>
        <div className={`${styles.priceSkeleton} ${shimmerClass}`} />
        <div className={styles.actionsSlot}>
          <div className={`${styles.buttonSkeleton} ${shimmerClass}`} />
        </div>
      </div>
    </article>
  );
};

export default ProductSkeleton;
