/* src/pages/Products.jsx (Refactorizado con hooks básicos + stats y COMPONENTES EXTRAÍDOS) */

import React, { useEffect, useState, useMemo, useCallback, useRef, memo } from "react";
import { supabase } from "../lib/supabaseClient"; // Mantenido para RPC y realtime
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Products.module.css";
import { useAlert } from "../context/AlertContext";
import ManageImagesModal from "../components/ManageImagesModal";
import ManageCategoriesModal from "../components/ManageCategoriesModal";
import DOMPurify from 'dompurify';
import { useAdminAuth } from "../context/AdminAuthContext";
import imageCompression from "browser-image-compression";
import ImageWithFallback from '../components/ImageWithFallback';

// --- (PASO A) NUEVAS IMPORTACIONES ---
import { useCategoriesCache } from '../hooks/useCategoriesCache';
import { useCacheAdmin } from '../context/CacheAdminContext';
import {
    ADMIN_PRODUCTS_BASIC_CACHE_KEY,
    useAdminProductsBasic
} from '../hooks/useAdminProductsBasic';
import { fetchProductStatsBatch } from '../lib/productQueries';
import { subscribeToTableChanges } from '../lib/sharedAdminRealtime';
import { broadcastStoreChange } from '../lib/broadcastRealtime';

// --- (PASO B) IMPORTAR COMPONENTES EXTRAÍDOS ---
import ProductCard from '../components/ProductCard';
import ProductFormModal from '../components/ProductFormModal';
// --- FIN PASO B ---


// ==================== CUSTOM HOOKS (Solo useDebounce) ====================

function useDebounce(value, delay = 300) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
}

// --- (PASO C) ELIMINAR DEFINICIONES LOCALES DE COMPONENTES ---
// ProductCard, StarIcon, HeartIcon, y ProductFormModal fueron movidos a sus propios archivos.
// --- FIN PASO C ---

// ==================== COMPONENTE PRINCIPAL ====================

export default function Products() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth();

    // --- (PASO F) Importar funciones del caché ---
    const { invalidate, setCached, getCached } = useCacheAdmin();

    // --- (PASO B) Reemplazar estado de Productos ---
    const {
        data: basicProductsData,
        isLoading: loadingBasic,
        refetch: refetchProducts // <-- Incluido como pediste
    } = useAdminProductsBasic();
    // Fix para evitar error en .slice() si basicProductsData es null
    const basicProducts = useMemo(() => basicProductsData || [], [basicProductsData]);

    const [productsWithStats, setProductsWithStats] = useState([]);
    const [loading, setLoading] = useState(false); // Carga de stats
    // --- FIN PASO B ---

    // Categorías (del paso anterior)
    const {
        data: categoriesData,
        isLoading: loadingCategories
    } = useCategoriesCache();
    const categories = useMemo(() => categoriesData || [], [categoriesData]);

    // Estado local (sin cambios)
    const [isFormModalOpen, setFormModalOpen] = useState(false);
    const [isImagesModalOpen, setImagesModalOpen] = useState(false);
    const [isCategoriesModalOpen, setCategoriesModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");

    const debouncedSearchTerm = useDebounce(searchTerm, 400);

    // --- (PASO D) Función Optimizada para Cargar Stats en Batch con Caché ---
    const enrichProductsWithStats = useCallback(async (productsList) => {
        if (!productsList || productsList.length === 0) return [];

        const cachedStatsEntry = getCached('product_stats_map');
        const existingStatsMap = (cachedStatsEntry && !cachedStatsEntry.isExpired)
            ? (cachedStatsEntry.data || {})
            : {};

        // Verificar si todos los productos visibles ya tienen stats en caché
        const missingProductIds = productsList
            .filter(p => !existingStatsMap[p.id])
            .map(p => p.id);

        if (missingProductIds.length === 0 && Object.keys(existingStatsMap).length > 0) {
            // Todos los productos visibles ya están en caché: enriquecer inmediatamente sin llamar a la BD
            const enriched = productsList.map(product => {
                const stat = existingStatsMap[product.id];
                return {
                    ...product,
                    total_sold: Number(stat?.total_sold || 0),
                    total_revenue: Number(stat?.total_revenue || 0),
                    avg_rating: stat?.avg_rating !== null && stat?.avg_rating !== undefined ? Number(stat.avg_rating) : null,
                    reviews_count: Number(stat?.reviews_count || 0),
                    favorites_count: Number(stat?.favorites_count || 0)
                };
            });
            setProductsWithStats(enriched);
            return;
        }

        // Si faltan stats, solo activar loading si no tenemos nada en pantalla
        if (productsWithStats.length === 0) {
            setLoading(true);
        }

        try {
            const productIdsToFetch = missingProductIds.length > 0 ? missingProductIds : productsList.map(p => p.id);
            const statsData = await fetchProductStatsBatch(productIdsToFetch);

            const updatedStatsMap = { ...existingStatsMap };
            if (Array.isArray(statsData)) {
                statsData.forEach(stat => {
                    if (stat && stat.product_id) {
                        updatedStatsMap[stat.product_id] = stat;
                    }
                });
            }

            setCached('product_stats_map', updatedStatsMap, 10 * 60 * 1000); // 10 min TTL

            const enrichedProducts = productsList.map(product => {
                const stat = updatedStatsMap[product.id];
                return {
                    ...product,
                    total_sold: Number(stat?.total_sold || 0),
                    total_revenue: Number(stat?.total_revenue || 0),
                    avg_rating: stat?.avg_rating !== null && stat?.avg_rating !== undefined ? Number(stat.avg_rating) : null,
                    reviews_count: Number(stat?.reviews_count || 0),
                    favorites_count: Number(stat?.favorites_count || 0)
                };
            });

            setProductsWithStats(enrichedProducts);

        } catch (error) {
            console.error('Error enriqueciendo productos con stats en batch:', error);
            showAlert(`Error al cargar estadísticas: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [showAlert, getCached, setCached, productsWithStats.length]);
    // --- FIN PASO D ---

    // --- (PASO G) Filtrar productos básicos ANTES de pedir stats ---
    const filteredBasicProducts = useMemo(() => {
        if (!basicProducts) return [];
        return basicProducts.filter(p => {
            const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
            const matchesSearch = p.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' ? p.is_active : !p.is_active);
            return matchesCategory && matchesSearch && matchesStatus;
        });
    }, [basicProducts, debouncedSearchTerm, selectedCategory, statusFilter]);
    // --- FIN PASO G ---

    // --- (PASO E) NUEVO useEffect para Cargar Stats ---
    const prevIdsRef = useRef('');

    useEffect(() => {
        if (!filteredBasicProducts || filteredBasicProducts.length === 0) {
            setProductsWithStats([]);
            prevIdsRef.current = '';
            return;
        }

        // Tomamos los primeros 50 que coincidan con el filtro
        const visibleProducts = filteredBasicProducts.slice(0, 50);
        const currentIds = visibleProducts.map(p => p.id).join(',');

        if (prevIdsRef.current !== currentIds) {
            // Los resultados del filtro cambiaron, pedir stats
            prevIdsRef.current = currentIds;
            enrichProductsWithStats(visibleProducts);
        } else {
            // Los resultados son los mismos (solo cambiaron datos básicos), actualizamos conservando stats
            setProductsWithStats(prev => {
                return visibleProducts.map(vp => {
                    const existing = prev.find(p => p.id === vp.id);
                    return existing ? { ...existing, ...vp } : vp;
                });
            });
        }
    }, [filteredBasicProducts, enrichProductsWithStats]);
    // --- FIN PASO E ---


    // --- (PASO F) Realtime Compartido para Actualizar Productos y Categorías ---
    useEffect(() => {
        const unsubscribeProducts = subscribeToTableChanges('products', (payload) => {
            console.log('[Products] Cambio detectado (Shared Realtime):', payload.eventType);

            if (payload.eventType === 'INSERT') {
                // Invalidar caché para que refetch incluya el nuevo
                invalidate(ADMIN_PRODUCTS_BASIC_CACHE_KEY);

            } else if (payload.eventType === 'UPDATE') {
                // Actualización quirúrgica del caché
                const cached = getCached(ADMIN_PRODUCTS_BASIC_CACHE_KEY);

                if (cached && Array.isArray(cached.data)) {
                    const updatedProducts = cached.data.map(p =>
                        p.id === payload.new.id
                            ? { ...p, ...payload.new }
                            : p
                    );
                    setCached(ADMIN_PRODUCTS_BASIC_CACHE_KEY, updatedProducts);
                }

                // Si es un producto visible con stats, actualizar también
                setProductsWithStats(prev => prev.map(p =>
                    p.id === payload.new.id
                        ? { ...p, ...payload.new }
                        : p
                ));

            } else if (payload.eventType === 'DELETE') {
                // Remover del caché
                const cached = getCached(ADMIN_PRODUCTS_BASIC_CACHE_KEY);

                if (cached && Array.isArray(cached.data)) {
                    const filteredProducts = cached.data.filter(p => p.id !== payload.old.id);
                    setCached(ADMIN_PRODUCTS_BASIC_CACHE_KEY, filteredProducts);
                }

                // Remover de products con stats
                setProductsWithStats(prev => prev.filter(p => p.id !== payload.old.id));
            }
        });

        const unsubscribeCategories = subscribeToTableChanges('categories', () => {
            console.log('[Products] Cambio en categorías detectado, invalidando caché.');
            invalidate('categories');
        });

        return () => {
            if (unsubscribeProducts) unsubscribeProducts();
            if (unsubscribeCategories) unsubscribeCategories();
        };
    }, [invalidate, getCached, setCached]);
    // --- FIN PASO F ---


    // --- (PASO J) Actualizar handleSaveProduct ---
    const handleSaveProduct = useCallback(async ({ productData, recipeData }) => {
        // 'productData' viene del modal (incluye id, name, price, cost, track_stock, etc.)
        // 'recipeData' es el array de ingredientes (ej: [{ ingredient_id, quantity_used, ... }])

        // ¡LA LÍNEA "setIsSubmitting(true);" SE ELIMINA DE AQUÍ!

        try {
            // 1. Limpiar datos del producto antes de guardar
            const {
                total_sold, total_revenue, avg_rating, reviews_count,
                favorites_count, product_images, ...dataToUpsert
            } = productData;

            // 2. Guardar el producto principal (Crear o Actualizar)
            // .select() es crucial para obtener el ID del producto guardado
            const { data: savedProduct, error: productError } = await supabase
                .from('products')
                .upsert(dataToUpsert)
                .select('id')
                .single();

            if (productError) throw productError;

            const productId = savedProduct.id;

            // 3. Borrar la receta antigua (transacción parte 1)
            const { error: deleteError } = await supabase
                .from('product_recipes')
                .delete()
                .eq('product_id', productId);

            if (deleteError) throw deleteError;

            // 4. Si hay una nueva receta, insertarla (transacción parte 2)
            if (recipeData && recipeData.length > 0) {
                const newRecipeItems = recipeData.map(item => ({
                    product_id: productId,
                    ingredient_id: item.ingredient_id,
                    quantity_used: item.quantity_used,
                    deduct_stock_automatically: item.deduct_stock_automatically
                }));

                const { error: insertRecipeError } = await supabase
                    .from('product_recipes')
                    .insert(newRecipeItems);

                if (insertRecipeError) throw insertRecipeError;
            }

            // 5. Éxito
            showAlert(`Producto ${dataToUpsert.id ? 'actualizado' : 'creado'} con éxito.`, 'success');

            // Invalidar cachés para forzar recarga de datos frescos
            invalidate(ADMIN_PRODUCTS_BASIC_CACHE_KEY);
            invalidate(new RegExp('^product_stats')); // Invalidar todos los stats de productos

            // Emitir broadcast a la app del cliente
            broadcastStoreChange('catalog_updated', { entity: 'products', action: dataToUpsert.id ? 'update' : 'create' });

            setFormModalOpen(false);
            setSelectedProduct(null);

        } catch (error) {
            console.error('Error al guardar el producto y su receta:', error);
            showAlert(`Error: ${error.message}`, 'error');
            throw error;
        }

    }, [showAlert, invalidate, setFormModalOpen, setSelectedProduct]);
    // --- FIN PASO J ---

    // --- (PASO K) Actualizar toggleActive ---
    const toggleActive = useCallback(async (id, isActive) => {
        try {
            const { error } = await supabase
                .from("products")
                .update({ is_active: !isActive })
                .eq("id", id);

            if (error) throw error;

            // Actualización optimista en caché
            const cached = getCached(ADMIN_PRODUCTS_BASIC_CACHE_KEY);
            if (cached) {
                const updated = cached.data.map(p =>
                    p.id === id ? { ...p, is_active: !isActive } : p
                );
                setCached(ADMIN_PRODUCTS_BASIC_CACHE_KEY, updated);
            }

            // También actualizar en productsWithStats
            setProductsWithStats(prev => prev.map(p =>
                p.id === id ? { ...p, is_active: !isActive } : p
            ));

            // Emitir broadcast
            broadcastStoreChange('catalog_updated', { entity: 'products', action: 'toggle_active', id });

        } catch (error) {
            console.error('Toggle error:', error);
            showAlert(`Error: ${error.message}`);
        }
    }, [showAlert, getCached, setCached]); // <-- Dependencias actualizadas
    // --- FIN PASO K ---

    const openFormModal = useCallback((product = null) => {
        setSelectedProduct(product);
        setFormModalOpen(true);
    }, []);

    const openImagesModal = useCallback((product) => {
        setSelectedProduct(product);
        setImagesModalOpen(true);
    }, []);


    const categoryMap = useMemo(() =>
        categories.reduce((acc, cat) => ({ ...acc, [cat.id]: cat.name }), {})
        , [categories]);

    // --- (PASO H) Actualizar Condición de Loading ---
    if ((loadingBasic && basicProducts.length === 0) || (loadingCategories && categories.length === 0) || (loading && productsWithStats.length === 0)) {
        return <LoadingSpinner />;
    }
    // --- FIN PASO H ---

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Catálogo de Productos</h1>
                <p className={styles.subtitle}>
                    {/* (PASO I) Subtítulo actualizado */}
                    {basicProducts.length} productos activos
                </p>
                <div className={styles.headerActions}>
                    {hasPermission('productos.edit') && (
                        <>
                            <button
                                onClick={() => setCategoriesModalOpen(true)}
                                className={styles.manageButton}
                            >
                                Administrar Categorías
                            </button>
                            <button
                                onClick={() => openFormModal(null)}
                                className={styles.addButton}
                            >
                                + Añadir Producto
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Filtros */}
            <div className={styles.filters}>
                <input
                    type="text"
                    placeholder="Buscar producto..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.searchInput}
                />
                <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className={styles.categorySelect}
                >
                    <option value="all">Todas las categorías</option>
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                </select>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className={styles.statusSelect}
                >
                    <option value="all">Todos los estados</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Inactivos</option>
                </select>
            </div>

            {/* Grid de productos */}
            <div className={styles.productGrid}>
                {productsWithStats.map(p => (
                    <ProductCard
                        key={p.id}
                        product={p}
                        categoryName={categoryMap[p.category_id] || 'N/A'}
                        onToggle={toggleActive}
                        onEdit={openFormModal}
                        onManageImages={openImagesModal}
                    />
                ))}
            </div>

            {/* Mensaje vacío (Actualizado) */}
            {!loadingBasic && !loadingCategories && !loading && productsWithStats.length === 0 && (
                <p className={styles.emptyMessage}>
                    No se encontraron productos con los filtros actuales.
                </p>
            )}

            {/* (PASO I) Paginación eliminada */}

            {/* Modales */}
            <ProductFormModal
                isOpen={isFormModalOpen}
                onClose={() => {
                    setFormModalOpen(false);
                    setSelectedProduct(null);
                }}
                onSave={handleSaveProduct}
                categories={categories}
                product={selectedProduct}
            />

            {selectedProduct && (
                <ManageImagesModal
                    product={selectedProduct}
                    isOpen={isImagesModalOpen}
                    onClose={() => {
                        setImagesModalOpen(false);
                        setSelectedProduct(null);
                    }}
                    onImagesUpdate={() => {
                        // Invalidar caché básico, los stats se recargarán
                        invalidate(ADMIN_PRODUCTS_BASIC_CACHE_KEY);
                    }}
                />
            )}

            <ManageCategoriesModal
                isOpen={isCategoriesModalOpen}
                onClose={() => setCategoriesModalOpen(false)}
                onCategoriesUpdate={() => {
                    // El modal ya invalida 'categories'
                    // Invalidamos la lista básica admin por si una categoría cambió de nombre
                    invalidate(ADMIN_PRODUCTS_BASIC_CACHE_KEY);
                }}
            />
        </div>
    );
}
