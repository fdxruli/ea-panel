/* src/components/ProductFormModal.jsx (ACTUALIZADO CON PESTAÑA DE RECETA) */
import React, { useEffect, useState, memo, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAlert } from "../context/AlertContext";
import DOMPurify from 'dompurify';
import imageCompression from "browser-image-compression";
import styles from "../pages/Products.module.css"; // Sigue usando el CSS de Products
import LoadingSpinner from "./LoadingSpinner"; // Usaremos un spinner

// --- Iconos para la Receta ---
const AddIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;
const DeleteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>;
// ---

const ProductFormModal = memo(({ isOpen, onClose, onSave, categories, product: initialProduct }) => {
    const { showAlert } = useAlert();
    
    // --- Pestaña activa ---
    const [activeTab, setActiveTab] = useState('info'); // 'info' o 'recipe'

    // --- Estado del formulario principal ---
    const [formData, setFormData] = useState({ name: "", description: "", price: "", cost: "0", category_id: "", image_url: "" });
    const [imageFile, setImageFile] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // --- NUEVO ESTADO PARA RECETAS ---
    const [trackStock, setTrackStock] = useState(false); // El toggle principal
    const [recipeItems, setRecipeItems] = useState([]); // Los ingredientes de la receta
    const [allIngredients, setAllIngredients] = useState([]); // Lista de ingredientes de la BD
    const [loadingRecipe, setLoadingRecipe] = useState(false);
    
    // Cargar todos los ingredientes disponibles para el dropdown
    const fetchAllIngredients = async () => {
      const { data, error } = await supabase.from('ingredients').select('*').order('name');
      if (error) {
        showAlert('Error al cargar la lista de ingredientes', 'error');
      } else {
        setAllIngredients(data || []);
      }
    };

    // Cargar la receta existente de un producto cuando se abre el modal
    const fetchExistingRecipe = async (productId) => {
      setLoadingRecipe(true);
      // Hacemos un JOIN para obtener el nombre, costo y unidad del ingrediente
      const { data, error } = await supabase
        .from('product_recipes')
        .select(`
          ingredient_id,
          quantity_used,
          deduct_stock_automatically,
          ingredients ( name, base_unit, average_cost )
        `)
        .eq('product_id', productId);
      
      if (error) {
        showAlert('Error al cargar la receta del producto', 'error');
      } else {
        const formattedRecipe = data.map(item => ({
          ingredient_id: item.ingredient_id,
          quantity_used: item.quantity_used,
          deduct_stock_automatically: item.deduct_stock_automatically,
          name: item.ingredients.name,
          base_unit: item.ingredients.base_unit,
          cost_per_unit: item.ingredients.average_cost
        }));
        setRecipeItems(formattedRecipe);
      }
      setLoadingRecipe(false);
    };

    // --- Lógica de Costo y Ganancia ---
    const calculatedCost = useMemo(() => {
      if (!trackStock) {
        // Si no se rastrea, el costo es el manual
        return parseFloat(formData.cost) || 0;
      }
      // Si se rastrea, se calcula de la receta
      return recipeItems.reduce((sum, item) => {
        return sum + (item.cost_per_unit * item.quantity_used);
      }, 0);
    }, [recipeItems, trackStock, formData.cost]);

    const profitMargin = useMemo(() => {
      const price = parseFloat(formData.price) || 0;
      if (price === 0) return 0;
      const profit = price - calculatedCost;
      return (profit / price) * 100;
    }, [formData.price, calculatedCost]);

    // --- Efecto principal para poblar el modal ---
    useEffect(() => {
        if (isOpen) {
            fetchAllIngredients();
            if (initialProduct) {
                // 1. Poblar formulario de Info
                const { product_images, ...productData } = initialProduct;
                setFormData(productData);
                setPreviewImage(productData.image_url);
                
                // 2. Poblar formulario de Receta
                setTrackStock(initialProduct.track_stock || false);
                if (initialProduct.track_stock) {
                  fetchExistingRecipe(initialProduct.id);
                } else {
                  setRecipeItems([]); // Limpiar receta si no se rastrea
                }
            } else {
                // Resetear todo para un producto nuevo
                setFormData({ name: "", description: "", price: "", cost: "0", category_id: "", image_url: "" });
                setImageFile(null);
                setPreviewImage(null);
                setTrackStock(false);
                setRecipeItems([]);
            }
            setActiveTab('info'); // Siempre empezar en la pestaña de info
            setUploadProgress(0);
        }
    }, [initialProduct, isOpen]);

    // --- Handlers del Formulario de Receta ---
    const handleAddIngredient = (ingredientId) => {
      if (!ingredientId || recipeItems.some(item => item.ingredient_id === ingredientId)) {
        return; // No añadir si está vacío o ya existe
      }
      const ing = allIngredients.find(i => i.id === ingredientId);
      if (ing) {
        setRecipeItems(prev => [
          ...prev,
          {
            ingredient_id: ing.id,
            name: ing.name,
            base_unit: ing.base_unit,
            cost_per_unit: ing.average_cost,
            quantity_used: 1, // Cantidad por defecto
            deduct_stock_automatically: ing.track_inventory // Por defecto, si el ingrediente se rastrea, se descuenta
          }
        ]);
      }
    };

    const handleRecipeChange = (index, field, value) => {
      setRecipeItems(prev => prev.map((item, i) => {
        if (i === index) {
          return { ...item, [field]: value };
        }
        return item;
      }));
    };

    const handleRemoveIngredient = (index) => {
      setRecipeItems(prev => prev.filter((_, i) => i !== index));
    };

    // Ingredientes disponibles (que no están ya en la receta)
    const availableIngredients = useMemo(() => {
      const usedIds = new Set(recipeItems.map(item => item.ingredient_id));
      return allIngredients.filter(ing => !usedIds.has(ing.id));
    }, [allIngredients, recipeItems]);

    // --- Handlers del Formulario Principal ---
    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = async (e) => {
      // (Lógica de compresión de imagen sin cambios)
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
      // (Lógica de subida de imagen sin cambios)
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

    // --- handleSubmit ACTUALIZADO ---
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // 1. Validaciones
        const price = parseFloat(formData.price);
        if (!price || price <= 0) {
            showAlert('El precio debe ser mayor a 0.', 'error');
            setActiveTab('info');
            return;
        }
        if (price < calculatedCost) {
            const confirm = window.confirm('El precio es menor que el costo de la receta. ¿Deseas continuar?');
            if (!confirm) return;
        }
        if (trackStock && recipeItems.length === 0) {
          const confirm = window.confirm('Has marcado "Rastrear Stock" pero no has añadido ingredientes a la receta. El costo será $0. ¿Continuar?');
          if (!confirm) return;
        }
        
        setIsSubmitting(true);
        setUploadProgress(0);
        
        try {
            // 2. Manejar imagen
            let imageUrl = formData.image_url;
            if (imageFile) {
                imageUrl = await uploadImageWithRetry(imageFile);
            }

            // 3. Preparar datos del PRODUCTO
            const productData = {
                ...formData,
                id: initialProduct?.id, // Asegurarse de incluir el ID si es una edición
                name: DOMPurify.sanitize(formData.name.trim()),
                description: DOMPurify.sanitize(formData.description.trim()),
                price: price,
                cost: calculatedCost, // ¡Usar el costo calculado!
                image_url: imageUrl,
                track_stock: trackStock // ¡Guardar el estado del rastreo!
            };

            // 4. Preparar datos de la RECETA
            const recipeData = trackStock ? recipeItems.map(item => ({
                // product_id se añadirá en el handler del padre
                ingredient_id: item.ingredient_id,
                quantity_used: Number(item.quantity_used) || 0,
                deduct_stock_automatically: item.deduct_stock_automatically
            })) : []; // Enviar array vacío si no se rastrea

            // 5. Llamar a onSave con ambos paquetes de datos
            await onSave({ productData, recipeData });
            
        } catch (error) {
            console.error('Submit error:', error);
            showAlert(`Error: ${error.message}`, 'error');
        } finally {
            setIsSubmitting(false);
            setUploadProgress(0);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={`${styles.modalContent} ${styles.productFormModalLarge}`} onClick={(e) => e.stopPropagation()}>
                <h2>{initialProduct ? 'Editar' : 'Crear'} Producto</h2>

                {/* --- PESTAÑAS --- */}
                <div className={styles.modalTabs}>
                  <button 
                    type="button"
                    className={`${styles.tabButton} ${activeTab === 'info' ? styles.active : ''}`}
                    onClick={() => setActiveTab('info')}
                  >
                    Información
                  </button>
                  <button 
                    type="button"
                    className={`${styles.tabButton} ${activeTab === 'recipe' ? styles.active : ''}`}
                    onClick={() => setActiveTab('recipe')}
                  >
                    Receta e Inventario
                  </button>
                </div>

                <form onSubmit={handleSubmit} className={styles.productForm}>
                    
                    {/* --- CONTENIDO PESTAÑA 1: INFORMACIÓN --- */}
                    <div className={`${styles.tabContent} ${activeTab === 'info' ? styles.active : ''}`}>
                        <div className={styles.formGroup}><label htmlFor="name">Nombre del Producto *</label><input id="name" name="name" className={styles.formInput} value={formData.name} onChange={handleChange} required maxLength={100} /></div>
                        <div className={styles.formGroup}><label htmlFor="description">Descripción *</label><textarea id="description" name="description" className={styles.formTextarea} value={formData.description} onChange={handleChange} required maxLength={500} rows={4} /></div>
                        
                        <div className={styles.formGroup}>
                          <label htmlFor="category_id">Categoría *</label>
                          <select id="category_id" name="category_id" className={styles.formSelect} value={formData.category_id} onChange={handleChange} required>
                              <option value="">Selecciona una Categoría</option>
                              {categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                          </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Imagen Principal</label>
                            {/* (Lógica de subida de imagen sin cambios) */}
                            <div className={styles.fileInputWrapper}>
                                <input id="mainImage" name="mainImage" type="file" accept="image/*" onChange={handleFileChange} className={styles.fileInput} disabled={isSubmitting} />
                                <label htmlFor="mainImage" className={styles.fileInputLabel}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg> {imageFile ? 'Cambiar imagen' : 'Seleccionar imagen'}</label>
                            </div>
                            {previewImage && (<div className={styles.previewContainer}><img src={previewImage} alt="Vista previa" className={styles.imagePreview} /></div>)}
                            {uploadProgress > 0 && uploadProgress < 100 && (<div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} /><span>{uploadProgress}%</span></div>)}
                        </div>
                    </div>
                    
                    {/* --- CONTENIDO PESTAÑA 2: RECETA --- */}
                    <div className={`${styles.tabContent} ${activeTab === 'recipe' ? styles.active : ''}`}>
                        <div className={styles.formGroup}>
                          <label className={styles.checkboxLabel}>
                            <input
                              type="checkbox"
                              checked={trackStock}
                              onChange={(e) => setTrackStock(e.target.checked)}
                              disabled={isSubmitting}
                            />
                            Rastrear Stock de Inventario para este producto
                          </label>
                          <p className={styles.formHelp}>
                            Si marcas esto, el costo se calculará de la receta y se descontará el stock al vender.
                          </p>
                        </div>
                        
                        {loadingRecipe ? <LoadingSpinner /> : (
                          trackStock && (
                            <div className={styles.recipeBuilder}>
                              <div className={styles.formGroup}>
                                <label htmlFor="add-ingredient">Añadir Ingrediente a la Receta</label>
                                <select 
                                  id="add-ingredient" 
                                  className={styles.formSelect}
                                  onChange={(e) => handleAddIngredient(e.target.value)}
                                  value=""
                                >
                                  <option value="">Selecciona un ingrediente...</option>
                                  {availableIngredients.map(ing => (
                                    <option key={ing.id} value={ing.id}>
                                      {ing.name} ({ing.base_unit})
                                    </option>
                                  ))}
                                </select>
                              </div>
                              
                              {recipeItems.length > 0 && (
                                <div className={styles.recipeList}>
                                  {recipeItems.map((item, index) => (
                                    <div key={item.ingredient_id} className={styles.recipeItem}>
                                      <div className={styles.recipeItemInfo}>
                                        <strong>{item.name}</strong>
                                        <small>Costo: ${item.cost_per_unit.toFixed(4)} / {item.base_unit}</small>
                                      </div>
                                      <input
                                        type="number"
                                        step="any"
                                        className={styles.recipeQuantityInput}
                                        value={item.quantity_used}
                                        onChange={(e) => handleRecipeChange(index, 'quantity_used', e.target.value)}
                                      />
                                      <span className={styles.recipeUnit}>{item.base_unit}</span>
                                      <label className={styles.recipeDeductToggle} title="Descontar del stock automáticamente">
                                        <input 
                                          type="checkbox"
                                          checked={item.deduct_stock_automatically}
                                          onChange={(e) => handleRecipeChange(index, 'deduct_stock_automatically', e.target.checked)}
                                        />
                                        <span className={styles.recipeDeductSlider}></span>
                                      </label>
                                      <button 
                                        type="button" 
                                        className={styles.recipeDeleteButton}
                                        onClick={() => handleRemoveIngredient(index)}
                                      >
                                        <DeleteIcon />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        )}
                    </div>
                    
                    {/* --- PRECIO Y COSTO (MOVIDOS FUERA DE LAS PESTAÑAS) --- */}
                    <div className={styles.pricingSection}>
                      <div className={styles.formGrid}>
                          <div className={styles.formGroup}>
                            <label htmlFor="price">Precio de Venta *</label>
                            <input id="price" name="price" type="number" step="0.01" min="0.01" value={formData.price} onChange={handleChange} required />
                          </div>
                          <div className={styles.formGroup}>
                            <label htmlFor="cost">
                              {trackStock ? "Costo (Calculado)" : "Costo (Manual) *"}
                            </label>
                            <input 
                              id="cost" 
                              name="cost" 
                              type="number" 
                              step="0.01" 
                              min="0" 
                              value={trackStock ? calculatedCost.toFixed(4) : formData.cost} 
                              onChange={handleChange} 
                              required 
                              readOnly={trackStock}
                            />
                          </div>
                      </div>
                      <div className={styles.costSummary}>
                        <span>Margen de Ganancia:</span>
                        <strong className={profitMargin < 0 ? styles.negativeProfit : ''}>
                          {profitMargin.toFixed(1)}%
                        </strong>
                      </div>
                    </div>

                    {/* --- BOTONES DE ACCIÓN --- */}
                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.cancelButton} disabled={isSubmitting}>Cancelar</button>
                        <button type="submit" className={styles.saveButton} disabled={isSubmitting}>
                          {isSubmitting ? 'Guardando...' : (initialProduct ? 'Guardar Cambios' : 'Crear Producto')}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
});

ProductFormModal.displayName = 'ProductFormModal';

export default ProductFormModal;