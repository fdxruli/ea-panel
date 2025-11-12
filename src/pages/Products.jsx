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
import { useProductsBasicCache } from '../hooks/useProductsBasicCache';

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
    } = useProductsBasicCache();
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

    // --- (PASO D) NUEVA FUNCIÓN para Cargar Stats ---
    /**
     * Función que enriquece productos básicos con sus stats.
     * Solo carga stats para productos VISIBLES en pantalla.
     */
    const enrichProductsWithStats = useCallback(async (productsList) => {
        if (!productsList || productsList.length === 0) return [];

        setLoading(true);
        try {
            // Cargar stats de cada producto en paralelo
            const statsPromises = productsList.map(async (product) => {
                try {
                    // Aquí podrías usar useProductStats, pero en un loop es mejor fetch directo
                    const { data: stats, error } = await supabase.rpc('get_product_stats_single', {
                        p_product_id: product.id
                    });

                    if (error) throw error;

                    // stats es un array, tomamos el primer (y único) objeto
                    const statsObject = stats?.[0];

                    return {
                        ...product,
                        total_sold: statsObject?.total_sold || 0,
                        total_revenue: statsObject?.total_revenue || 0,
                        avg_rating: statsObject?.avg_rating || null,
                        reviews_count: statsObject?.reviews_count || 0,
                        favorites_count: statsObject?.favorites_count || 0
                    };
                } catch (error) {
                    console.error(`Error loading stats for ${product.id}:`, error);
                    // Si falla, retornar producto sin stats
                    return {
                        ...product,
                        total_sold: 0,
                        total_revenue: 0,
                        avg_rating: null,
                        reviews_count: 0,
                        favorites_count: 0
                    };
                }
            });

            const enrichedProducts = await Promise.all(statsPromises);
            setProductsWithStats(enrichedProducts);

        } catch (error) {
            console.error('Error enriching products:', error);
            showAlert(`Error al cargar estadísticas: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [showAlert]);
    // --- FIN PASO D ---

    // --- (PASO E) NUEVO useEffect para Cargar Stats ---
    /**
     * Cuando basicProducts cambia (primera carga o refetch),
     * cargar stats solo de los productos VISIBLES.
     */
    useEffect(() => {
        if (!basicProducts || basicProducts.length === 0) {
            setProductsWithStats([]);
            return;
        }

        // TODO: Implementar virtualización para cargar solo los visibles en viewport
        // Por ahora, cargar stats de los primeros 20 (primeros visibles)
        const visibleProducts = basicProducts.slice(0, 20);
        enrichProductsWithStats(visibleProducts);

    }, [basicProducts, enrichProductsWithStats]);
    // --- FIN PASO E ---


    // --- (PASO F) Modificar Realtime para Actualizar Caché ---
    useEffect(() => {
        const channel = supabase
            .channel('products-updates')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'products',
                    select: 'id, name, price, cost, is_active, category_id, image_url'
                },
                (payload) => {
                    console.log('[Products] Cambio detectado:', payload.eventType);

                    if (payload.eventType === 'INSERT') {
                        // Invalidar caché para que refetch incluya el nuevo
                        invalidate('products:basic');

                    } else if (payload.eventType === 'UPDATE') {
                        // Actualización quirúrgica del caché
                        const cached = getCached('products:basic');

                        if (cached) {
                            const updatedProducts = cached.data.map(p =>
                                p.id === payload.new.id
                                    ? { ...p, ...payload.new }
                                    : p
                            );
                            setCached('products:basic', updatedProducts);
                        }

                        // Si es un producto visible con stats, actualizar también
                        setProductsWithStats(prev => prev.map(p =>
                            p.id === payload.new.id
                                ? { ...p, ...payload.new }
                                : p
                        ));

                    } else if (payload.eventType === 'DELETE') {
                        // Remover del caché
                        const cached = getCached('products:basic');

                        if (cached) {
                            const filteredProducts = cached.data.filter(p => p.id !== payload.old.id);
                            setCached('products:basic', filteredProducts);
                        }

                        // Remover de products con stats
                        setProductsWithStats(prev => prev.filter(p => p.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [invalidate, getCached, setCached]);
    // --- FIN PASO F ---

    // Listener de categorías (del paso anterior)
    useEffect(() => {
        const channel = supabase
            .channel('categories-updates-products-page')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'categories' },
                () => {
                    console.log('[Products] Cambio en categorías detectado, invalidando caché.');
                    invalidate('categories');
                }
            )
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [invalidate]);


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
            invalidate('products:basic');
            invalidate(new RegExp('^product_stats')); // Invalidar todos los stats de productos

            setFormModalOpen(false);
            setSelectedProduct(null);

            // Opcional: Refrescar la lista de productos en el estado local si es necesario
            // (Aunque la invalidación de caché debería manejarlo en la próxima carga)
            // refetchProducts(); 

        } catch (error) {
            console.error('Error al guardar el producto y su receta:', error);
            showAlert(`Error: ${error.message}`, 'error');

            // RE-LANZAMOS EL ERROR para que el 'finally' del modal sepa que algo falló
            // y no cierre el modal (permitiendo al usuario reintentar).
            // Opcionalmente, puedes comentar la siguiente línea si prefieres que el modal
            // se quede abierto pero el botón "Guardar" se reactive.
            throw error;
        }
        // ¡EL BLOQUE 'finally { setIsSubmitting(false); }' SE ELIMINA DE AQUÍ!

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
            const cached = getCached('products:basic');
            if (cached) {
                const updated = cached.data.map(p =>
                    p.id === id ? { ...p, is_active: !isActive } : p
                );
                setCached('products:basic', updated);
            }

            // También actualizar en productsWithStats
            setProductsWithStats(prev => prev.map(p =>
                p.id === id ? { ...p, is_active: !isActive } : p
            ));

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

    // --- (PASO G) Actualizar filteredProducts ---
    const filteredProducts = useMemo(() => {
        // Filtrar sobre productsWithStats (los que tienen stats cargados)
        return productsWithStats.filter(p => {
            const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
            const matchesSearch = p.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'all' ||
                (statusFilter === 'active' ? p.is_active : !p.is_active);
            return matchesCategory && matchesSearch && matchesStatus;
        });
    }, [productsWithStats, debouncedSearchTerm, selectedCategory, statusFilter]); // <-- Dependencia actualizada
    // --- FIN PASO G ---

    const categoryMap = useMemo(() =>
        categories.reduce((acc, cat) => ({ ...acc, [cat.id]: cat.name }), {})
        , [categories]);

    // --- (PASO H) Actualizar Condición de Loading ---
    if (loadingBasic || loadingCategories || loading) return <LoadingSpinner />;
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
                {filteredProducts.map(p => (
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
            {!loadingBasic && !loadingCategories && !loading && filteredProducts.length === 0 && (
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
                        invalidate('products:basic');
                    }}
                />
            )}

            <ManageCategoriesModal
                isOpen={isCategoriesModalOpen}
                onClose={() => setCategoriesModalOpen(false)}
                onCategoriesUpdate={() => {
                    // El modal ya invalida 'categories'
                    // Invalidamos 'products:basic' por si una categoría cambió de nombre
                    invalidate('products:basic');
                }}
            />
        </div>
    );
}