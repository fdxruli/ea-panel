import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { MENU_LAYOUT_STORAGE_KEY } from '../menuConstants';

const DEFAULT_CATEGORY_LABEL = 'Todo el menu';

export const useMenuFilters = ({ products, categories }) => {
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [layout, setLayout] = useState(() => (
        localStorage.getItem(MENU_LAYOUT_STORAGE_KEY) || 'grid'
    ));

    const deferredSearchQuery = useDeferredValue(searchQuery);
    const normalizedSearchQuery = deferredSearchQuery.trim().toLocaleLowerCase('es-MX');

    useEffect(() => {
        localStorage.setItem(MENU_LAYOUT_STORAGE_KEY, layout);
    }, [layout]);

    const productSearchIndex = useMemo(() => (
        products.map((product) => ({
            product,
            name: String(product.name || '').toLocaleLowerCase('es-MX'),
            description: String(product.description || '').toLocaleLowerCase('es-MX'),
        }))
    ), [products]);

    const filteredProducts = useMemo(() => {
        if (!selectedCategory && !normalizedSearchQuery) {
            return products;
        }

        return productSearchIndex
            .filter(({ product, name, description }) => {
                const matchesCategory = selectedCategory
                    ? product.category_id === selectedCategory
                    : true;

                if (!matchesCategory || !normalizedSearchQuery) {
                    return matchesCategory;
                }

                return name.includes(normalizedSearchQuery)
                    || description.includes(normalizedSearchQuery);
            })
            .map(({ product }) => product);
    }, [normalizedSearchQuery, productSearchIndex, products, selectedCategory]);

    const selectedCategoryData = useMemo(() => (
        selectedCategory
            ? categories.find((category) => category.id === selectedCategory) || null
            : null
    ), [categories, selectedCategory]);

    const selectedCategoryLabel = selectedCategoryData?.name || DEFAULT_CATEGORY_LABEL;

    const heroDescription = useMemo(() => {
        if (!selectedCategory) {
            return 'Preparados al momento, bañados en tus salsas favoritas y listos para llevar hasta tu puerta.';
        }

        if (selectedCategoryData?.description && selectedCategoryData.description.trim() !== '') {
            return selectedCategoryData.description.trim();
        }

        return `Descubre nuestra selección de ${selectedCategoryLabel.toLowerCase()}. Elige tus favoritos y nosotros nos encargamos del resto.`;
    }, [selectedCategory, selectedCategoryData, selectedCategoryLabel]);

    const handleSelectCategory = useCallback((categoryId) => {
        setSelectedCategory(categoryId);
    }, []);

    const clearSearch = useCallback(() => {
        setSearchQuery('');
    }, []);

    const handleSearchChange = useCallback((event) => {
        setSearchQuery(event.target.value);
    }, []);

    const toggleLayout = useCallback(() => {
        setLayout((currentLayout) => (currentLayout === 'list' ? 'grid' : 'list'));
    }, []);

    return {
        selectedCategory,
        searchQuery,
        setSearchQuery,
        layout,
        normalizedSearchQuery,
        filteredProducts,
        selectedCategoryLabel,
        heroDescription,
        hasCategoryFilter: Boolean(selectedCategory),
        hasSearchFilter: Boolean(normalizedSearchQuery),
        handleSelectCategory,
        handleSearchChange,
        clearSearch,
        toggleLayout,
    };
};
