import React, { memo, useEffect, useMemo, useRef } from 'react';
import ImageWithFallback from '../../components/ImageWithFallback';
import { getThumbnailUrl } from '../../utils/imageUtils';
import styles from '../Menu.module.css';
import { CloseIcon, GridIcon, ListIcon, SearchIcon } from './MenuIcons';
import {
    getCategoryFallback,
    getFirstAvailableProductImage,
    hasSpecialPrice,
} from './menuUtils';

const EMPTY_PRODUCTS = [];
const CATEGORY_IMAGE_SIZES = [120, 180, 240];

const MenuFilters = memo(({
    products,
    categories,
    defaultCatalogImage,
    selectedCategory,
    selectedCategoryLabel,
    onSelectCategory,
    searchQuery,
    onSearchChange,
    onClearSearch,
    layout,
    onToggleLayout,
}) => {
    const categoryRailRef = useRef(null);

    const categoryVisuals = useMemo(() => {
        const productsByCategory = new Map();

        products.forEach((product) => {
            const categoryProducts = productsByCategory.get(product.category_id);
            if (categoryProducts) {
                categoryProducts.push(product);
            } else {
                productsByCategory.set(product.category_id, [product]);
            }
        });

        const visualCategories = categories.map((category) => {
            const categoryProducts = productsByCategory.get(category.id) || EMPTY_PRODUCTS;

            return {
                id: category.id,
                key: category.id,
                name: category.name,
                imageUrl: getFirstAvailableProductImage(categoryProducts),
                fallback: getCategoryFallback(category.name),
                hasOffer: categoryProducts.some(hasSpecialPrice),
            };
        });

        return [
            {
                id: null,
                key: 'all',
                name: 'Todos',
                imageUrl: defaultCatalogImage,
                fallback: 'EA',
                hasOffer: visualCategories.some((category) => category.hasOffer),
            },
            ...visualCategories,
        ];
    }, [categories, defaultCatalogImage, products]);

    useEffect(() => {
        const activeElement = categoryRailRef.current?.querySelector('[data-active-category="true"]');

        if (activeElement) {
            activeElement.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'center',
            });
        }
    }, [selectedCategory, categoryVisuals.length]);

    return (
        <div className={styles.filters}>
            <div className={styles.filterHeader}>
                <div>
                    <p className={styles.filterEyebrow}>Categorias</p>
                    <h2>{selectedCategoryLabel}</h2>
                </div>

                <div className={styles.layoutToggle}>
                    <button
                        type="button"
                        onClick={onToggleLayout}
                        title={layout === 'list' ? 'Cambiar a vista de cuadrícula' : 'Cambiar a vista de lista'}
                        aria-label={layout === 'list' ? 'Cambiar a vista de cuadrícula' : 'Cambiar a vista de lista'}
                    >
                        {layout === 'list' ? <GridIcon /> : <ListIcon />}
                    </button>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.65rem',
                    width: '100%',
                    marginBottom: '0.85rem',
                    padding: '0.7rem 0.85rem',
                    border: '1px solid var(--border-color)',
                    borderRadius: '999px',
                    background: 'var(--bg-secondary)',
                    boxSizing: 'border-box',
                }}
            >
                <SearchIcon />
                <input
                    type="search"
                    value={searchQuery}
                    onChange={onSearchChange}
                    placeholder="Buscar por nombre o descripción"
                    aria-label="Buscar productos del menú"
                    enterKeyHint="search"
                    autoComplete="off"
                    style={{
                        flex: 1,
                        minWidth: 0,
                        border: 0,
                        outline: 'none',
                        background: 'transparent',
                        color: 'var(--text-primary)',
                        fontSize: '0.95rem',
                    }}
                />
                {searchQuery && (
                    <button
                        type="button"
                        onClick={onClearSearch}
                        aria-label="Limpiar búsqueda"
                        title="Limpiar búsqueda"
                        style={{
                            width: 34,
                            height: 34,
                            display: 'grid',
                            placeItems: 'center',
                            flexShrink: 0,
                            border: 0,
                            borderRadius: '50%',
                            background: 'transparent',
                            color: 'var(--text-secondary)',
                            cursor: 'pointer',
                        }}
                    >
                        <CloseIcon />
                    </button>
                )}
            </div>

            <div ref={categoryRailRef} className={styles.categoryRail} aria-label="Categorias del menu">
                {categoryVisuals.map((category) => {
                    const isActive = selectedCategory === category.id;

                    return (
                        <button
                            key={category.key}
                            type="button"
                            className={`${styles.categoryButton} ${isActive ? styles.categoryButtonActive : ''}`}
                            onClick={() => onSelectCategory(category.id)}
                            aria-pressed={isActive}
                            data-active-category={isActive ? 'true' : 'false'}
                        >
                            <span className={styles.categoryCircle}>
                                {category.imageUrl ? (
                                    <ImageWithFallback
                                        src={getThumbnailUrl(category.imageUrl, 180, 180)}
                                        alt={`Categoria ${category.name}`}
                                        className={styles.categoryImage}
                                        imageSizes={CATEGORY_IMAGE_SIZES}
                                        sizes="76px"
                                    />
                                ) : (
                                    <span className={styles.categoryFallback}>{category.fallback}</span>
                                )}
                                {category.hasOffer && <span className={styles.categoryOfferBadge}>Oferta</span>}
                            </span>
                            <span className={styles.categoryName}>{category.name}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
});

MenuFilters.displayName = 'MenuFilters';

export default MenuFilters;
