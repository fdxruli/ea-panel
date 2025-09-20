// src/pages/Products.jsx (VERSIÓN FINAL CON FUNCIÓN 'toggleActive' RESTAURADA)

import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import ManageImagesModal from "../components/ManageImagesModal";
import { useAlert } from "../context/AlertContext";

export default function Products() {
    const { showAlert } = useAlert();
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [newProduct, setNewProduct] = useState({
        name: "",
        description: "",
        price: "",
        cost: "",
        category_id: "",
        image_url: ""
    });
    
    const [mainImageFile, setMainImageFile] = useState(null);
    const mainImageInputRef = useRef(null);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);

    const fetchProducts = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from("products")
            .select(`*, product_images(*)`)
            .order("created_at", { ascending: false });
      
        if (error) console.error(error);
        else setProducts(data);
        setLoading(false);
    };

    const fetchCategories = async () => {
        const { data, error } = await supabase
            .from("categories")
            .select("*")
            .order("name", { ascending: true });
        if (error) console.error(error);
        else setCategories(data);
    };

    useEffect(() => {
        fetchCategories();
        fetchProducts();
    }, []);

    const validateProduct = () => {
        if (!newProduct.name || !newProduct.price || !newProduct.cost || !newProduct.category_id) {
            showAlert("Por favor completa todos los campos obligatorios (Nombre, Precio, Costo y Categoría).");
            return false;
        }
        if (parseFloat(newProduct.price) < parseFloat(newProduct.cost)) {
            showAlert("El precio no puede ser menor al costo.");
            return false;
        }
        if (!mainImageFile) {
            showAlert("Por favor, selecciona una imagen principal para el producto.");
            return false;
        }
        return true;
    };
  
    const addProduct = async () => {
        if (!validateProduct()) return;
        
        setIsSubmitting(true);

        try {
            const fileExt = mainImageFile.name.split('.').pop();
            const fileName = `main-${Date.now()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('imagenes-productos')
                .upload(filePath, mainImageFile);
            if (uploadError) throw uploadError;

            const { data } = supabase.storage.from('imagenes-productos').getPublicUrl(filePath);
            const productToInsert = { ...newProduct, image_url: data.publicUrl };
            const { error: insertError } = await supabase.from("products").insert([productToInsert]);
            if (insertError) throw insertError;

            setNewProduct({ name: "", description: "", price: "", cost: "", category_id: "", image_url: "" });
            setMainImageFile(null);
            if (mainImageInputRef.current) mainImageInputRef.current.value = '';
            
            showAlert("¡Producto agregado con éxito!");
            await fetchProducts();

        } catch (error) {
            showAlert(`Error al agregar el producto: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleMainImageChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            setMainImageFile(e.target.files[0]);
        }
    };

    // --- 👇 AQUÍ ESTÁ LA FUNCIÓN QUE FALTABA 👇 ---
    const toggleActive = async (id, isActive) => {
        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from("products")
                .update({ is_active: !isActive })
                .eq("id", id);

            if (error) throw error;
            await fetchProducts(); // Recargamos los productos para ver el cambio
        } catch (error) {
            showAlert(`Error al cambiar el estado: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    // --- 👆 FIN DE LA FUNCIÓN RESTAURADA 👆 ---

    const deleteProduct = async (productToDelete) => {
        if (!window.confirm(`¿Estás seguro de que quieres eliminar "${productToDelete.name}"? Esta acción no se puede deshacer y borrará todas sus imágenes.`)) return;
        setIsSubmitting(true);
        try {
            const imageUrls = [productToDelete.image_url, ...productToDelete.product_images.map(img => img.image_url)].filter(Boolean);
            const fileNames = imageUrls.map(url => url.split('/').pop());
            if (fileNames.length > 0) {
                await supabase.storage.from('imagenes-productos').remove(fileNames);
            }
            await supabase.from('products').delete().eq('id', productToDelete.id);
            showAlert(`Producto "${productToDelete.name}" eliminado con éxito.`);
            await fetchProducts();
        } catch (error) {
            showAlert(`Error al eliminar el producto: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const openImageManager = (product) => {
        setSelectedProduct(product);
        setIsModalOpen(true);
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div>
            <h1>Productos</h1>
            <div className="form-container">
                <h3>Agregar nuevo producto</h3>
                <input type="text" placeholder="Nombre del Producto" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} />
                <input type="text" placeholder="Descripción" value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} />
                <input type="number" placeholder="Precio de Venta ($)" value={newProduct.price} onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })} />
                <input type="number" placeholder="Costo ($)" value={newProduct.cost} onChange={(e) => setNewProduct({ ...newProduct, cost: e.target.value })} />
                <select value={newProduct.category_id} onChange={(e) => setNewProduct({ ...newProduct, category_id: e.target.value })}>
                    <option value="">-- Selecciona una Categoría --</option>
                    {categories.map(category => (<option key={category.id} value={category.id}>{category.name}</option>))}
                </select>
                
                <div style={{display: 'flex', flexDirection: 'column', gap: '5px'}}>
                    <label htmlFor="main-image-input" style={{fontSize: '0.8rem', color: '#666'}}>Imagen Principal (Portada)</label>
                    <input 
                        id="main-image-input"
                        type="file"
                        accept="image/png, image/jpeg, image/webp"
                        onChange={handleMainImageChange}
                        ref={mainImageInputRef}
                    />
                </div>
                
                <button onClick={addProduct} disabled={isSubmitting}>
                    {isSubmitting ? 'Agregando...' : 'Agregar Producto'}
                </button>
            </div>

            <table className="products-table">
                <thead>
                    <tr>
                        <th>Nombre</th>
                        <th>Descripción</th>
                        <th>Categoría</th>
                        <th>Precio</th>
                        <th>Costo</th>
                        <th>Imágenes</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {products.map((p) => (
                        <tr key={p.id}>
                            <td>{p.name}</td>
                            <td>{p.description || 'N/A'}</td>
                            <td>{categories.find(c => c.id === p.category_id)?.name || 'N/A'}</td>
                            <td>${p.price}</td>
                            <td>${p.cost}</td>
                            <td>
                                Principal + {p.product_images.length}
                                <button onClick={() => openImageManager(p)} style={{marginLeft: '10px'}}>
                                    Gestionar
                                </button>
                            </td>
                            <td>
                                <button onClick={() => toggleActive(p.id, p.is_active)} disabled={isSubmitting}>
                                    {p.is_active ? "Desactivar" : "Activar"}
                                </button>
                                <button onClick={() => deleteProduct(p)} disabled={isSubmitting} style={{backgroundColor: '#e74c3c', color: 'white', marginLeft: '10px'}}>
                                    Eliminar
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {isModalOpen && (
                <ManageImagesModal
                    product={selectedProduct}
                    onClose={() => setIsModalOpen(false)}
                    onImagesUpdate={fetchProducts}
                />
            )}
        </div>
    );
}