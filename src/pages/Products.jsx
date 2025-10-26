import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Products.module.css";
import { useAlert } from "../context/AlertContext";
import ManageImagesModal from "../components/ManageImagesModal";
import ManageCategoriesModal from "../components/ManageCategoriesModal";
import DOMPurify from 'dompurify';
import { useAdminAuth } from "../context/AdminAuthContext";
import imageCompression from "browser-image-compression";
import ImageWithFallback from '../components/ImageWithFallback'; // <-- AÑADE ESTA LÍNEA

const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#ffc107" stroke="#ffc107" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>;
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#e74c3c" stroke="#e74c3c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;

const ProductCard = ({ product, categoryName, onToggle, onEdit, onManageImages }) => {
    const { hasPermission } = useAdminAuth();
    return (
        <div className={`${styles.productCard} ${!product.is_active ? styles.inactive : ''}`}>
            <div className={styles.imageContainer}>
                <ImageWithFallback
                    src={product.image_url || 'https://placehold.co/300x200'}
                    alt={product.name}
                />
                <span className={styles.imageCount}>{1 + (product.product_images?.length || 0)} 📸</span>
            </div>
            <div className={styles.cardContent}>
                <span className={styles.categoryTag}>{categoryName}</span>
                <h3 className={styles.productName}>{product.name}</h3>

                <div className={styles.productStats}>
                    <div className={styles.statItem}>
                        <strong>{product.total_sold || 0}</strong>
                        <span>Vendidos</span>
                    </div>
                    <div className={styles.statItem}>
                        <strong>${(product.total_revenue || 0).toFixed(2)}</strong>
                        <span>Ingresos</span>
                    </div>
                    <div className={styles.statItem}>
                        <div className={styles.iconStat}>
                            <StarIcon />
                            <strong>{product.avg_rating?.toFixed(1) || 'N/A'}</strong>
                        </div>
                        <span>({product.reviews_count || 0} reseñas)</span>
                    </div>
                    <div className={styles.statItem}>
                        <div className={styles.iconStat}>
                            <HeartIcon />
                            <strong>{product.favorites_count || 0}</strong>
                        </div>
                        <span>Favoritos</span>
                    </div>
                </div>

                <div className={styles.priceInfo}>
                    <span className={styles.price}>Precio: ${product.price.toFixed(2)}</span>
                    <span className={styles.cost}>Costo: ${product.cost.toFixed(2)}</span>
                </div>

            </div>
            <div className={styles.cardActions}>
                {hasPermission('productos.edit') && <button onClick={() => onEdit(product)} className={styles.editButton}>Editar</button>}
                {hasPermission('productos.edit') && <button onClick={() => onManageImages(product)} className={styles.manageButton}>Imágenes</button>}
                {hasPermission('productos.edit') && <button onClick={() => onToggle(product.id, product.is_active)} className={styles.toggleButton}>
                    {product.is_active ? "Desactivar" : "Activar"}
                </button>}
            </div>
        </div>
    );
};

const ProductFormModal = ({ isOpen, onClose, onSave, categories, product: initialProduct }) => {
    const { showAlert } = useAlert();
    const [formData, setFormData] = useState({ name: "", description: "", price: "", cost: "", category_id: "" });
    const [imageFile, setImageFile] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (initialProduct) {
            const { productimages, ...productData } = initialProduct;
            setFormData(productData);
        } else {
            setFormData({
                name: "",
                description: "",
                price: "",
                cost: "",
                categoryid: "",
                imageurl: ""
            });
            setImageFile(null);
            setPreviewImage(null); // ⬅️ AGREGA ESTA LÍNEA
        }
    }, [initialProduct, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const options = {
            maxSizeMB: 1,
            maxWidthOrHeight: 1024,
            useWebWorker: true,
            fileType: 'image/webp',
            initialQuality: 0.8
        };

        try {
            showAlert("Comprimiendo imagen, por favor espera...");
            const compressedFile = await imageCompression(file, options);
            setImageFile(compressedFile);

            // ⬅️ AGREGA ESTAS LÍNEAS PARA LA VISTA PREVIA
            const reader = new FileReader();
            reader.onloadend = () => {
                setPreviewImage(reader.result);
            };
            reader.readAsDataURL(compressedFile);

            showAlert("Imagen lista para subir!");
        } catch (error) {
            console.error(error);
            showAlert("Hubo un error al comprimir la imagen. Intenta con otra.");
            setImageFile(null);
            setPreviewImage(null); // ⬅️ TAMBIÉN LIMPIA LA VISTA PREVIA
        }
    };

    const uploadImage = async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.webp`;
        const filePath = `products/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(filePath, file, { contentType: 'image/webp' });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('images')
            .getPublicUrl(filePath);

        return publicUrl;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            let imageUrl = formData.image_url;
            if (imageFile) {
                imageUrl = await uploadImage(imageFile);
            }

            const dataToSave = {
                ...formData,
                name: DOMPurify.sanitize(formData.name),
                description: DOMPurify.sanitize(formData.description),
                image_url: imageUrl
            };

            await onSave(dataToSave);
        } catch (error) {
            showAlert(`Error al subir la imagen: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <h2>{initialProduct ? 'Editar' : 'Crear'} Producto</h2>
                <form onSubmit={handleSubmit} className={styles.productForm}>
                    <div className={styles.formGroup}>
                        <label htmlFor="name">Nombre del Producto</label>
                        <input id="name" name="name" className={styles.formInput} value={formData.name} onChange={handleChange} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="description">Descripción</label>
                        <textarea id="description" name="description" value={formData.description} onChange={handleChange} required />
                    </div>
                    <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                            <label htmlFor="price">Precio</label>
                            <input id="price" name="price" type="number" step="0.01" value={formData.price} onChange={handleChange} required />
                        </div>
                        <div className={styles.formGroup}>
                            <label htmlFor="cost">Costo</label>
                            <input id="cost" name="cost" type="number" step="0.01" value={formData.cost} onChange={handleChange} required />
                        </div>
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="category_id">Categoría</label>
                        <select id="category_id" name="category_id" value={formData.category_id} onChange={handleChange} required>
                            <option value="">Selecciona una Categoría</option>
                            {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                    </div>
                    <div className={styles.formGroup}>
                        <label>Imagen Principal</label>
                        <div className={styles.fileInputWrapper}>
                            <input
                                id="mainImage"
                                name="mainImage"
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className={styles.fileInput}
                            />
                            <label htmlFor="mainImage" className={styles.fileInputLabel}>
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                {formData.mainImage ? 'Cambiar imagen' : 'Seleccionar imagen'}
                            </label>
                            {formData.mainImage && (
                                <div className={styles.fileName}>
                                    {typeof formData.mainImage === 'string'
                                        ? 'Imagen actual'
                                        : formData.mainImage.name}
                                </div>
                            )}
                        </div>
                        {previewImage && (
                            <img
                                src={previewImage}
                                alt="Vista previa"
                                className={styles.imagePreview}
                            />
                        )}
                    </div>
                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.cancelButton}>Cancelar</button>
                        <button type="submit" className={styles.saveButton} disabled={isSubmitting}>
                            {isSubmitting ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// ... El resto del componente 'Products' no cambia ...
export default function Products() {
    const { showAlert } = useAlert();
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isFormModalOpen, setFormModalOpen] = useState(false);
    const [isImagesModalOpen, setImagesModalOpen] = useState(false);
    const [isCategoriesModalOpen, setCategoriesModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [statusFilter, setStatusFilter] = useState("all");
    const { hasPermission } = useAdminAuth();

    const fetchData = useCallback(async () => {
        const { data: productsData, error: productsError } = await supabase.rpc('get_product_stats');
        const { data: categoriesData, error: categoriesError } = await supabase.from("categories").select("*");

        if (productsError || categoriesError) {
            console.error(productsError || categoriesError);
            showAlert("Error al cargar los datos de los productos.");
        } else {
            setProducts(productsData);
            setCategories(categoriesData);
        }
        setLoading(false);
    }, [showAlert]);

    useEffect(() => {
        fetchData();
        const channel = supabase.channel('public:products_admin')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_images' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'product_reviews' }, fetchData)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_favorites' }, fetchData)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [fetchData]);

    const handleSaveProduct = async (productData) => {
        const { total_sold, total_revenue, avg_rating, reviews_count, favorites_count, product_images, ...dataToUpsert } = productData;
        const { error } = await supabase.from('products').upsert(dataToUpsert.id ? dataToUpsert : [dataToUpsert]).select();
        if (error) showAlert(`Error: ${error.message}`);
        else {
            showAlert(`Producto ${dataToUpsert.id ? 'actualizado' : 'creado'} con éxito.`);
            fetchData();
            setFormModalOpen(false);
            setSelectedProduct(null);
        }
    };

    const toggleActive = async (id, isActive) => {
        const { error } = await supabase.from("products").update({ is_active: !isActive }).eq("id", id);
        if (error) showAlert(`Error: ${error.message}`);
        else fetchData();
    };

    const openFormModal = (product = null) => {
        setSelectedProduct(product);
        setFormModalOpen(true);
    }

    const openImagesModal = (product) => {
        setSelectedProduct(product);
        setImagesModalOpen(true);
    }

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesCategory = selectedCategory === 'all' || p.category_id === selectedCategory;
            const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesStatus = statusFilter === 'all' || (statusFilter === 'active' ? p.is_active : !p.is_active);
            return matchesCategory && matchesSearch && matchesStatus;
        });
    }, [products, searchTerm, selectedCategory, statusFilter]);

    const categoryMap = useMemo(() => categories.reduce((acc, cat) => ({ ...acc, [cat.id]: cat.name }), {}), [categories]);

    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Catálogo de Productos</h1>
                <div className={styles.headerActions}>
                    {hasPermission('productos.edit') && <button onClick={() => setCategoriesModalOpen(true)} className={styles.manageButton}>
                        Administrar Categorías
                    </button>}
                    {hasPermission('productos.edit') && <button onClick={() => openFormModal(null)} className={styles.addButton}>
                        + Añadir Producto
                    </button>}
                </div>
            </div>
            <div className={styles.filters}>
                <input type="text" placeholder="Buscar producto..." onChange={(e) => setSearchTerm(e.target.value)} className={styles.searchInput} />
                <select onChange={(e) => setSelectedCategory(e.target.value)} className={styles.categorySelect}>
                    <option value="all">Todas las categorías</option>
                    {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
                <select onChange={(e) => setStatusFilter(e.target.value)} className={styles.statusSelect}>
                    <option value="all">Todos los estados</option>
                    <option value="active">Activos</option>
                    <option value="inactive">Inactivos</option>
                </select>
            </div>
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
            <ProductFormModal
                isOpen={isFormModalOpen}
                onClose={() => { setFormModalOpen(false); setSelectedProduct(null); }}
                onSave={handleSaveProduct}
                categories={categories}
                product={selectedProduct}
            />
            {selectedProduct && (
                <ManageImagesModal
                    product={selectedProduct}
                    isOpen={isImagesModalOpen}
                    onClose={() => { setImagesModalOpen(false); setSelectedProduct(null); }}
                    onImagesUpdate={fetchData}
                />
            )}
            <ManageCategoriesModal
                isOpen={isCategoriesModalOpen}
                onClose={() => setCategoriesModalOpen(false)}
                onCategoriesUpdate={fetchData}
            />
        </div>
    );
}
