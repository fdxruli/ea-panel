/* src/pages/Products.jsx (Refactorizado con hooks básicos + stats) */

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
// useProductStats no se usa aquí directamente, sino en el 'enrich' (PASO D)
// --- FIN PASO A ---


// ==================== CUSTOM HOOKS (Solo useDebounce) ====================

function useDebounce(value, delay = 300) {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

// --- (PASO C) useCache local ELIMINADO ---

// ==================== ICONOS MEMOIZADOS (Sin cambios) ====================
const StarIcon = memo(() => ( /* ... (código SVG) ... */ <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#ffc107" stroke="#ffc107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>));
StarIcon.displayName = 'StarIcon';
const HeartIcon = memo(() => ( /* ... (código SVG) ... */ <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>));
HeartIcon.displayName = 'HeartIcon';

// ==================== COMPONENTE PRODUCTCARD MEMOIZADO (Sin cambios) ====================
const ProductCard = memo(({ product, categoryName, onToggle, onEdit, onManageImages }) => {
    // ... (código existente de ProductCard) ...
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

// ==================== MODAL DE FORMULARIO OPTIMIZADO (Sin cambios) ====================
const ProductFormModal = memo(({ isOpen, onClose, onSave, categories, product: initialProduct }) => {
    // ... (código existente de ProductFormModal, omitido por brevedad) ...
    const { showAlert } = useAlert();
    const [formData, setFormData] = useState({ name: "", description: "", price: "", cost: "", category_id: "", image_url: "" });
    const [imageFile, setImageFile] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        if (initialProduct) {
            const { product_images, ...productData } = initialProduct;
            setFormData(productData);
            setPreviewImage(productData.image_url);
        } else {
            setFormData({ name: "", description: "", price: "", cost: "", category_id: "", image_url: "" });
            setImageFile(null);
            setPreviewImage(null);
        }
        setUploadProgress(0);
    }, [initialProduct, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showAlert('Por favor selecciona un archivo de imagen válido.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            showAlert('La imagen es demasiado grande. Máximo 5MB.');
            return;
        }
        const options = { maxSizeMB: 1, maxWidthOrHeight: 1024, useWebWorker: true, fileType: 'image/webp', initialQuality: 0.8 };
        try {
            showAlert("Comprimiendo imagen...", 'info');
            const compressedFile = await imageCompression(file, options);
            setImageFile(compressedFile);
            const reader = new FileReader();
            reader.onloadend = () => { setPreviewImage(reader.result); };
            reader.readAsDataURL(compressedFile);
            showAlert("Imagen lista para subir!", 'success');
        } catch (error) {
            console.error('Compression error:', error);
            showAlert("Error al comprimir la imagen. Intenta con otra.");
            setImageFile(null);
            setPreviewImage(null);
        }
    };

    const uploadImageWithRetry = async (file, maxRetries = 3) => {
        const fileExt = 'webp';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `products/${fileName}`;
        let lastError;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                setUploadProgress((attempt / maxRetries) * 50);
                const { error: uploadError } = await supabase.storage.from('images').upload(filePath, file, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
                if (uploadError) throw uploadError;
                setUploadProgress(75);
                const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(filePath);
                setUploadProgress(100);
                return publicUrl;
            } catch (error) {
                lastError = error;
                console.error(`Upload attempt ${attempt} failed:`, error);
                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
            }
        }
        throw lastError;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (parseFloat(formData.price) <= 0 || parseFloat(formData.cost) < 0) {
            showAlert('El precio debe ser mayor a 0 y el costo no puede ser negativo.');
            return;
        }
        if (parseFloat(formData.price) < parseFloat(formData.cost)) {
            const confirm = window.confirm('El precio es menor que el costo. ¿Deseas continuar?');
            if (!confirm) return;
        }
        setIsSubmitting(true);
        setUploadProgress(0);
        try {
            let imageUrl = formData.image_url;
            if (imageFile) {
                imageUrl = await uploadImageWithRetry(imageFile);
            }
            const dataToSave = { ...formData, name: DOMPurify.sanitize(formData.name.trim()), description: DOMPurify.sanitize(formData.description.trim()), price: parseFloat(formData.price), cost: parseFloat(formData.cost), image_url: imageUrl };
            await onSave(dataToSave);
        } catch (error) {
            console.error('Submit error:', error);
            showAlert(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
            setUploadProgress(0);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <h2>{initialProduct ? 'Editar' : 'Crear'} Producto</h2>
                <form onSubmit={handleSubmit} className={styles.productForm}>
                    <div className={styles.formGroup}><label htmlFor="name">Nombre del Producto *</label><input id="name" name="name" className={styles.formInput} value={formData.name} onChange={handleChange} required maxLength={100} /></div>
                    <div className={styles.formGroup}><label htmlFor="description">Descripción *</label><textarea id="description" name="description" value={formData.description} onChange={handleChange} required maxLength={500} rows={4} /></div>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}><label htmlFor="price">Precio *</label><input id="price" name="price" type="number" step="0.01" min="0.01" value={formData.price} onChange={handleChange} required /></div>
                        <div className={styles.formGroup}><label htmlFor="cost">Costo *</label><input id="cost" name="cost" type="number" step="0.01" min="0" value={formData.cost} onChange={handleChange} required /></div>
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="category_id">Categoría *</label>
                        <select id="category_id" name="category_id" value={formData.category_id} onChange={handleChange} required>
                            <option value="">Selecciona una Categoría</option>
                            {categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                        </select>
                    </div>
                    <div className={styles.formGroup}>
                        <label>Imagen Principal</label>
                        <div className={styles.fileInputWrapper}>
                            <input id="mainImage" name="mainImage" type="file" accept="image/*" onChange={handleFileChange} className={styles.fileInput} disabled={isSubmitting} />
                            <label htmlFor="mainImage" className={styles.fileInputLabel}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> {imageFile ? 'Cambiar imagen' : 'Seleccionar imagen'}</label>
                        </div>
                        {previewImage && (<div className={styles.previewContainer}><img src={previewImage} alt="Vista previa" className={styles.imagePreview} /></div>)}
                        {uploadProgress > 0 && uploadProgress < 100 && (<div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} /><span>{uploadProgress}%</span></div>)}
                    </div>
                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.cancelButton} disabled={isSubmitting}>Cancelar</button>
                        <button type="submit" className={styles.saveButton} disabled={isSubmitting}>{isSubmitting ? 'Guardando...' : 'Guardar'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
});
ProductFormModal.displayName = 'ProductFormModal';

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

    // --- (PASO C) ELIMINADO: Refs de paginación, useCache local, fetchData, y useEffect(fetchData) ---
    // const currentPage = useRef(1);
    // const ITEMS_PER_PAGE = 20;
    // const productCache = useCache('products', 60000);
    // const fetchData = useCallback(...) // <-- ELIMINADO
    // useEffect(() => { fetchData(1, false); }, [fetchData]); // <-- ELIMINADO

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

        // *** NOTA DE IMPLEMENTACIÓN DE (I) ***
        // Si quieres cargar TODOS (como dice PASO I):
        // enrichProductsWithStats(basicProducts); 
        // Pero esto hará N+1 llamadas a la DB y puede ser lento.
        // Sigo la instrucción del PASO E (.slice(0, 20)) por ahora.

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
    const handleSaveProduct = useCallback(async (productData) => {
        try {
            const { total_sold, total_revenue, avg_rating, reviews_count, favorites_count, product_images, ...dataToUpsert } = productData;

            const { error } = await supabase
                .from('products')
                .upsert(dataToUpsert)
                .select();

            if (error) throw error;

            showAlert(`Producto ${dataToUpsert.id ? 'actualizado' : 'creado'} con éxito.`, 'success');

            // Invalidar caché (Realtime lo manejará automáticamente)
            invalidate('products:basic');

            setFormModalOpen(false);
            setSelectedProduct(null);

        } catch (error) {
            console.error('Save error:', error);
            showAlert(`Error: ${error.message}`);
        }
    }, [showAlert, invalidate]); // <-- Dependencias actualizadas
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