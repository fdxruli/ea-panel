// src/pages/Products.jsx (ACTUALIZADO CON DOMPURIFY)
import React, { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Products.module.css";
import { useAlert } from "../context/AlertContext";
import ManageImagesModal from "../components/ManageImagesModal";
import ManageCategoriesModal from "../components/ManageCategoriesModal";
import DOMPurify from 'dompurify'; // <-- 1. IMPORTADO

// ... (El componente ProductCard no cambia) ...
const ProductCard = ({ product, categoryName, onToggle, onEdit, onManageImages }) => (
    <div className={`${styles.productCard} ${!product.is_active ? styles.inactive : ''}`}>
        <div className={styles.imageContainer}>
            <img src={product.image_url || 'https://placehold.co/300x200'} alt={product.name} />
            <span className={styles.imageCount}>{1 + (product.product_images?.length || 0)} 📸</span>
        </div>
        <div className={styles.cardContent}>
            <span className={styles.categoryTag}>{categoryName}</span>
            <h3 className={styles.productName}>{product.name}</h3>
            <p className={styles.productDescription}>{product.description || 'Sin descripción'}</p>
            <div className={styles.priceInfo}>
                <span className={styles.price}>${product.price.toFixed(2)}</span>
                <span className={styles.cost}>Costo: ${product.cost.toFixed(2)}</span>
            </div>
            <div className={styles.cardActions}>
                <button onClick={() => onEdit(product)} className={styles.editButton}>Editar</button>
                <button onClick={() => onManageImages(product)} className={styles.manageButton}>Imágenes</button>
                <button onClick={() => onToggle(product.id, product.is_active)} className={styles.toggleButton}>
                    {product.is_active ? "Desactivar" : "Activar"}
                </button>
            </div>
        </div>
    </div>
);


const ProductFormModal = ({ isOpen, onClose, onSave, categories, product: initialProduct }) => {
    const { showAlert } = useAlert();
    const [formData, setFormData] = useState({ name: "", description: "", price: "", cost: "", category_id: "" });
    const [imageFile, setImageFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (initialProduct) {
            const { product_images, ...productData } = initialProduct;
            setFormData(productData);
        } else {
            setFormData({ name: "", description: "", price: "", cost: "", category_id: "", image_url: "" });
        }
        setImageFile(null);
    }, [initialProduct, isOpen]);

    if (!isOpen) return null;

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setImageFile(e.target.files[0]);
        }
    };

    const uploadImage = async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `products/${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from('images')
            .upload(filePath, file);

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
            
            // --- 👇 2. SANITIZACIÓN DE DATOS ---
            const dataToSave = { 
                ...formData, 
                name: DOMPurify.sanitize(formData.name),
                description: DOMPurify.sanitize(formData.description),
                image_url: imageUrl 
            };
            // --- 👆 FIN DE LA SANITIZACIÓN ---

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
                        <input id="name" name="name" value={formData.name} onChange={handleChange} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="description">Descripción</label>
                        <textarea id="description" name="description" value={formData.description} onChange={handleChange} />
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
                        <label htmlFor="imageFile">Imagen Principal</label>
                        <input id="imageFile" name="imageFile" type="file" onChange={handleFileChange} accept="image/*" />
                        {formData.image_url && !imageFile && <img src={formData.image_url} alt="preview" className={styles.imagePreview} />}
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


// ... (El resto del componente Products no cambia) ...
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

  const fetchData = async () => {
    // No reseteamos el loading aquí para una recarga más suave
    const { data: productsData, error: productsError } = await supabase.from("products").select(`*, product_images(*)`).order("name");
    const { data: categoriesData, error: categoriesError } = await supabase.from("categories").select("*");

    if (productsError || categoriesError) {
        console.error(productsError || categoriesError);
    } else {
        setProducts(productsData);
        setCategories(categoriesData);
    }
    setLoading(false);
  };

  useEffect(() => {
      fetchData();
  }, []);

  const handleSaveProduct = async (productData) => {
    const { product_images, ...dataToUpsert } = productData;
    const { error } = await supabase.from('products').upsert(dataToUpsert.id ? dataToUpsert : [dataToUpsert]).select();

    if (error) {
        showAlert(`Error: ${error.message}`);
    } else {
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

  const categoryMap = useMemo(() => categories.reduce((acc, cat) => ({...acc, [cat.id]: cat.name}), {}), [categories]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Catálogo de Productos</h1>
        <div className={styles.headerActions}>
            <button onClick={() => setCategoriesModalOpen(true)} className={styles.manageButton}>
                Administrar Categorías
            </button>
            <button onClick={() => openFormModal(null)} className={styles.addButton}>
                + Añadir Producto
            </button>
        </div>
      </div>

      <div className={styles.filters}>
        <input type="text" placeholder="Buscar producto..." onChange={(e) => setSearchTerm(e.target.value)} className={styles.searchInput}/>
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