import React from 'react';
import ProductSkeleton from './ProductSkeleton';
import styles from '../pages/Menu.module.css';
import { MENU_LAYOUT_STORAGE_KEY } from '../pages/menuConstants';

const DEFAULT_LAYOUT = 'grid';
const SKELETON_CATEGORY_COUNT = 6;
const SKELETON_PRODUCT_COUNT = 8;

const getStoredLayout = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_LAYOUT;
  }

  const storedLayout = window.localStorage.getItem(MENU_LAYOUT_STORAGE_KEY);
  return storedLayout === 'list' ? 'list' : DEFAULT_LAYOUT;
};

const MenuRouteSkeleton = ({ layout, showLeadCapture = false }) => {
  const resolvedLayout = layout === 'list' || layout === 'grid'
    ? layout
    : getStoredLayout();

  return (
    <div
      className={`${styles.menuContainer} ${showLeadCapture ? styles.menuContainerWithLeadCapture : ''}`}
      aria-hidden="true"
      data-testid="menu-route-skeleton"
    >
      <section className={styles.menuHero}>
        <div className={styles.heroCopy}>
          <div className={`${styles.skeletonBlock} ${styles.skeletonHeroTitle}`} />
          <div className={`${styles.skeletonBlock} ${styles.skeletonHeroText}`} />
          <div className={`${styles.skeletonBlock} ${styles.skeletonHeroTextShort}`} />
        </div>

        <div className={styles.heroStats}>
          <div className={`${styles.skeletonBlock} ${styles.skeletonPill} ${styles.skeletonPillWide}`} />
          <div className={`${styles.skeletonBlock} ${styles.skeletonPill} ${styles.skeletonPillMedium}`} />
        </div>
      </section>

      <div className={styles.filters}>
        <div className={styles.filterHeader}>
          <div>
            <div className={`${styles.skeletonBlock} ${styles.skeletonEyebrow}`} />
            <div className={`${styles.skeletonBlock} ${styles.skeletonSectionTitle}`} />
          </div>

          <div className={`${styles.skeletonBlock} ${styles.skeletonToggle}`} />
        </div>

        <div className={styles.categoryRail}>
          {Array.from({ length: SKELETON_CATEGORY_COUNT }).map((_, index) => (
            <div key={`menu-category-skeleton-${index}`} className={styles.categoryButton}>
              <div className={`${styles.categoryCircle} ${styles.skeletonBlock} ${styles.skeletonCategoryCircle}`} />
              <div className={`${styles.skeletonBlock} ${styles.skeletonCategoryName}`} />
            </div>
          ))}
        </div>
      </div>

      <div className={`${styles.productList} ${styles[resolvedLayout]}`}>
        {Array.from({ length: SKELETON_PRODUCT_COUNT }).map((_, index) => (
          <ProductSkeleton key={`menu-product-skeleton-${resolvedLayout}-${index}`} layout={resolvedLayout} />
        ))}
      </div>
    </div>
  );
};

export default MenuRouteSkeleton;
