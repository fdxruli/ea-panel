/* src/components/ProductFormModal.jsx (ACTUALIZADO CON PESTAÑAS DE RECETA Y AUDIENCIA) */
import React, { useEffect, useState, memo, useMemo, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAlert } from "../context/AlertContext";
import DOMPurify from 'dompurify';
import imageCompression from "browser-image-compression";
import styles from "../pages/Products.module.css";
import LoadingSpinner from "./LoadingSpinner";
import { useCustomersBasicCache } from "../hooks/useCustomersBasicCache";
import { Globe, Sparkles, Search, X, UserCheck, Users, Lock, Crown, Star, Plus, Trash2, Check } from "lucide-react";

// --- Iconos para la Receta ---
const AddIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
    <line x1="12" y1="5" x2="12" y2="19"></line>
    <line x1="5" y1="12" x2="19" y2="12"></line>
  </svg>
);
const DeleteIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="3 6 5 6 21 6"></polyline>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
  </svg>
);

const ProductFormModal = memo(({ isOpen, onClose, onSave, categories, product: initialProduct }) => {
    const { showAlert } = useAlert();

    // --- Pestaña activa ---
    const [activeTab, setActiveTab] = useState('info'); // 'info' | 'recipe' | 'audience' | 'modifiers'

    // --- Estado del formulario principal ---
    const [formData, setFormData] = useState({ name: "", description: "", price: "", cost: "0", category_id: "", image_url: "" });
    const [imageFile, setImageFile] = useState(null);
    const [previewImage, setPreviewImage] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    // --- ESTADO PARA RECETAS ---
    const [trackStock, setTrackStock] = useState(false);
    const [recipeItems, setRecipeItems] = useState([]);
    const [allIngredients, setAllIngredients] = useState([]);
    const [loadingRecipe, setLoadingRecipe] = useState(false);

    // --- ESTADO PARA AUDIENCIA Y VISIBILIDAD ---
    const { data: customersData, isLoading: loadingCustomers } = useCustomersBasicCache();
    const allCustomers = useMemo(() => customersData || [], [customersData]);
    const [audienceType, setAudienceType] = useState('public'); // 'public' | 'tiers' | 'customers'
    const [selectedCustomerTiers, setSelectedCustomerTiers] = useState([]);
    const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
    const [customerSearchQuery, setCustomerSearchQuery] = useState('');
    const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);
    const customerSearchContainerRef = useRef(null);

    // --- ESTADO PARA COMPLEMENTOS Y MODIFICADORES ---
    const [modifierGroups, setModifierGroups] = useState([]);

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
          name: item.ingredients?.name || 'Ingrediente',
          base_unit: item.ingredients?.base_unit || 'pza',
          cost_per_unit: item.ingredients?.average_cost || 0
        }));
        setRecipeItems(formattedRecipe);
      }
      setLoadingRecipe(false);
    };

    // --- Lógica de Costo y Ganancia ---
    const calculatedCost = useMemo(() => {
      if (!trackStock) {
        return parseFloat(formData.cost) || 0;
      }
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
                setTrackStock(Boolean(initialProduct.track_stock));
                if (initialProduct.track_stock) {
                  fetchExistingRecipe(initialProduct.id);
                } else {
                  setRecipeItems([]);
                }

                // 3. Poblar formulario de Audiencia
                if (initialProduct.target_customer_tiers && initialProduct.target_customer_tiers.length > 0) {
                  setAudienceType('tiers');
                  setSelectedCustomerTiers([...initialProduct.target_customer_tiers]);
                  setSelectedCustomerIds([]);
                } else if (initialProduct.target_customer_ids && initialProduct.target_customer_ids.length > 0) {
                  setAudienceType('customers');
                  setSelectedCustomerIds([...initialProduct.target_customer_ids]);
                  setSelectedCustomerTiers([]);
                } else {
                  setAudienceType('public');
                  setSelectedCustomerTiers([]);
                  setSelectedCustomerIds([]);
                }
                setCustomerSearchQuery('');
                setIsCustomerDropdownOpen(false);

                // 4. Poblar formulario de Complementos (Modifiers)
                if (Array.isArray(initialProduct.modifiers) && initialProduct.modifiers.length > 0) {
                  setModifierGroups(JSON.parse(JSON.stringify(initialProduct.modifiers)));
                } else {
                  setModifierGroups([]);
                }
            } else {
                // Resetear todo para un producto nuevo
                setFormData({ name: "", description: "", price: "", cost: "0", category_id: "", image_url: "" });
                setImageFile(null);
                setPreviewImage(null);
                setTrackStock(false);
                setRecipeItems([]);
                setAudienceType('public');
                setSelectedCustomerTiers([]);
                setSelectedCustomerIds([]);
                setModifierGroups([]);
                setCustomerSearchQuery('');
                setIsCustomerDropdownOpen(false);
            }
            setActiveTab('info');
            setUploadProgress(0);
        }
    }, [initialProduct, isOpen]);

    // Cerrar dropdown de clientes al hacer clic fuera
    useEffect(() => {
      const handleClickOutside = (e) => {
        if (customerSearchContainerRef.current && !customerSearchContainerRef.current.contains(e.target)) {
          setIsCustomerDropdownOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // --- Handlers de Audiencia ---
    const filteredCustomers = useMemo(() => {
      if (!customerSearchQuery || customerSearchQuery.trim().length === 0) return [];
      const query = customerSearchQuery.trim().toLowerCase();
      return allCustomers
        .filter((c) => {
          if (selectedCustomerIds.includes(c.id)) return false;
          const matchName = c.name && c.name.toLowerCase().includes(query);
          const matchPhone = c.phone && c.phone.includes(query);
          return matchName || matchPhone;
        })
        .slice(0, 10);
    }, [allCustomers, customerSearchQuery, selectedCustomerIds]);

    const selectedCustomersList = useMemo(() => {
      const customerMap = new Map(allCustomers.map(c => [c.id, c]));
      return selectedCustomerIds.map(id => {
        const found = customerMap.get(id);
        return found || { id, name: 'Cliente (' + id.slice(0, 8) + '...)', phone: '' };
      });
    }, [selectedCustomerIds, allCustomers]);

    const handleToggleTier = (tier) => {
      setSelectedCustomerTiers(prev => 
        prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]
      );
    };

    const handleAddCustomer = (customer) => {
      if (!selectedCustomerIds.includes(customer.id)) {
        setSelectedCustomerIds(prev => [...prev, customer.id]);
      }
      setCustomerSearchQuery('');
      setIsCustomerDropdownOpen(false);
    };

    const handleRemoveCustomer = (customerId) => {
      setSelectedCustomerIds(prev => prev.filter(id => id !== customerId));
    };

    // --- Handlers de Complementos / Modificadores ---
    const handleAddModifierGroup = (name = 'Complementos') => {
      const newGroup = {
        id: `mod_grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name,
        required: false,
        options: [
          {
            id: `opt_${Date.now()}_1`,
            name: '',
            price_delta: 0
          }
        ]
      };
      setModifierGroups(prev => [...prev, newGroup]);
    };

    const handleDeleteModifierGroup = (groupId) => {
      setModifierGroups(prev => prev.filter(g => g.id !== groupId));
    };

    const handleModifierGroupChange = (groupId, field, value) => {
      setModifierGroups(prev => prev.map(g => {
        if (g.id === groupId) {
          return { ...g, [field]: value };
        }
        return g;
      }));
    };

    const handleAddModifierOption = (groupId) => {
      setModifierGroups(prev => prev.map(g => {
        if (g.id === groupId) {
          const newOption = {
            id: `opt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            name: '',
            price_delta: 0
          };
          return { ...g, options: [...g.options, newOption] };
        }
        return g;
      }));
    };

    const handleDeleteModifierOption = (groupId, optionId) => {
      setModifierGroups(prev => prev.map(g => {
        if (g.id === groupId) {
          return { ...g, options: g.options.filter(o => o.id !== optionId) };
        }
        return g;
      }));
    };

    const handleModifierOptionChange = (groupId, optionId, field, value) => {
      setModifierGroups(prev => prev.map(g => {
        if (g.id === groupId) {
          return {
            ...g,
            options: g.options.map(o => {
              if (o.id === optionId) {
                return { 
                  ...o, 
                  [field]: field === 'price_delta' ? (parseFloat(value) || 0) : value 
                };
              }
              return o;
            })
          };
        }
        return g;
      }));
    };

    const handleLoadModifierPreset = () => {
      const presetGroup = {
        id: `mod_grp_${Date.now()}`,
        name: 'Personalización y Extras',
        required: false,
        options: [
          { id: `opt_${Date.now()}_1`, name: 'Extra porción / pollo', price_delta: 25 },
          { id: `opt_${Date.now()}_2`, name: 'Doble queso', price_delta: 15 },
          { id: `opt_${Date.now()}_3`, name: 'Sin cebolla', price_delta: 0 },
          { id: `opt_${Date.now()}_4`, name: 'Sin salsa picante', price_delta: 0 }
        ]
      };
      setModifierGroups(prev => [...prev, presetGroup]);
      showAlert('Plantilla de complementos agregada. Puedes personalizar nombres y precios.', 'success');
    };

    // --- Handlers del Formulario de Receta ---
    const handleAddIngredient = (ingredientId) => {
      if (!ingredientId || recipeItems.some(item => item.ingredient_id === ingredientId)) {
        return;
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
            quantity_used: 1,
            deduct_stock_automatically: ing.track_inventory
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
                  await new Promise(resolve => {
                    setTimeout(resolve, 1000 * attempt);
                  });
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
        if (audienceType === 'tiers' && selectedCustomerTiers.length === 0) {
          showAlert('Has marcado "Por categoría" pero no has seleccionado ninguna categoría (ej. VIP). Selecciona al menos una.', 'warning');
          setActiveTab('audience');
          return;
        }
        if ((audienceType === 'customers' || audienceType === 'special') && selectedCustomerIds.length === 0) {
          showAlert('Has marcado "Clientes especiales" pero no has seleccionado ningún cliente. Selecciona al menos uno o elige "Público en general".', 'warning');
          setActiveTab('audience');
          return;
        }

        setIsSubmitting(true);
        setUploadProgress(0);

        try {
            // 2. Manejar imagen
            let imageUrl = formData.image_url;
            if (imageFile) {
                imageUrl = await uploadImageWithRetry(imageFile);
            }

            // 3. Preparar complementos / modificadores limpios
            const cleanedModifiers = modifierGroups
              .filter(g => g.name && g.name.trim().length > 0)
              .map(g => ({
                id: g.id || `mod_grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                name: g.name.trim(),
                required: Boolean(g.required),
                options: (g.options || [])
                  .filter(o => o.name && o.name.trim().length > 0)
                  .map(o => ({
                    id: o.id || `opt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                    name: o.name.trim(),
                    price_delta: Number(o.price_delta) || 0
                  }))
              }))
              .filter(g => g.options.length > 0);

            // 4. Preparar datos del PRODUCTO con Audiencia y Modificadores
            const productData = {
                ...formData,
                id: initialProduct?.id,
                name: DOMPurify.sanitize(formData.name.trim()),
                description: DOMPurify.sanitize(formData.description.trim()),
                price: price,
                cost: calculatedCost,
                image_url: imageUrl,
                track_stock: trackStock,
                target_customer_ids: (audienceType === 'customers' || audienceType === 'special') ? selectedCustomerIds : null,
                target_customer_tiers: audienceType === 'tiers' ? selectedCustomerTiers : null,
                modifiers: cleanedModifiers
            };

            // 5. Preparar datos de la RECETA
            const recipeData = trackStock ? recipeItems.map(item => ({
                ingredient_id: item.ingredient_id,
                quantity_used: Number(item.quantity_used) || 0,
                deduct_stock_automatically: item.deduct_stock_automatically
            })) : [];

            // 6. Llamar a onSave
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
                  <button
                    type="button"
                    className={`${styles.tabButton} ${activeTab === 'audience' ? styles.active : ''}`}
                    onClick={() => setActiveTab('audience')}
                  >
                    Audiencia
                    {audienceType === 'tiers' && (
                      <span className={styles.tabBadge}>VIP</span>
                    )}
                    {(audienceType === 'customers' || audienceType === 'special') && selectedCustomerIds.length > 0 && (
                      <span className={styles.tabBadge}>{selectedCustomerIds.length}</span>
                    )}
                  </button>
                  <button
                    type="button"
                    className={`${styles.tabButton} ${activeTab === 'modifiers' ? styles.active : ''}`}
                    onClick={() => setActiveTab('modifiers')}
                  >
                    Complementos
                    {modifierGroups.length > 0 && (
                      <span className={styles.tabBadge}>{modifierGroups.reduce((acc, g) => acc + (g.options?.length || 0), 0)}</span>
                    )}
                  </button>
                </div>

                <form onSubmit={handleSubmit} className={styles.productForm}>

                    {/* --- CONTENIDO PESTAÑA 1: INFORMACIÓN --- */}
                    <div className={`${styles.tabContent} ${activeTab === 'info' ? styles.active : ''}`}>
                        <div className={styles.formGroup}>
                          <label htmlFor="name">Nombre del Producto *</label>
                          <input id="name" name="name" className={styles.formInput} value={formData.name} onChange={handleChange} required maxLength={100} />
                        </div>
                        <div className={styles.formGroup}>
                          <label htmlFor="description">Descripción *</label>
                          <textarea id="description" name="description" className={styles.formTextarea} value={formData.description} onChange={handleChange} required maxLength={500} rows={4} />
                        </div>

                        <div className={styles.formGroup}>
                          <label htmlFor="category_id">Categoría *</label>
                          <select id="category_id" name="category_id" className={styles.formSelect} value={formData.category_id} onChange={handleChange} required>
                              <option value="">Selecciona una Categoría</option>
                              {categories.map(cat => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}
                          </select>
                        </div>

                        <div className={styles.formGroup}>
                            <label>Imagen Principal</label>
                            <div className={styles.fileInputWrapper}>
                                <input id="mainImage" name="mainImage" type="file" accept="image/*" onChange={handleFileChange} className={styles.fileInput} disabled={isSubmitting} />
                                <label htmlFor="mainImage" className={styles.fileInputLabel}>
                                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                                  {imageFile ? 'Cambiar imagen' : 'Seleccionar imagen'}
                                </label>
                            </div>
                            {previewImage && (
                              <div className={styles.previewContainer}>
                                <img src={previewImage} alt="Vista previa" className={styles.imagePreview} />
                              </div>
                            )}
                            {uploadProgress > 0 && uploadProgress < 100 && (
                              <div className={styles.progressBar}>
                                <div className={styles.progressFill} style={{ width: `${uploadProgress}%` }} />
                                <span>{uploadProgress}%</span>
                              </div>
                            )}
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

                    {/* --- CONTENIDO PESTAÑA 3: AUDIENCIA Y VISIBILIDAD --- */}
                    <div className={`${styles.tabContent} ${activeTab === 'audience' ? styles.active : ''}`}>
                      <div className={styles.audienceTabSection}>
                        <div className={styles.audienceRadioGrid} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                          {/* Opción 1: Público en general */}
                          <div 
                            className={`${styles.audienceRadioCard} ${audienceType === 'public' ? styles.audienceRadioCardActive : ''}`}
                            onClick={() => setAudienceType('public')}
                          >
                            <div className={styles.audienceRadioTitle}>
                              <Globe size={18} />
                              Público general
                            </div>
                            <p className={styles.audienceRadioDesc}>
                              Visible y disponible para todos los clientes y visitantes del menú.
                            </p>
                          </div>

                          {/* Opción 2: Categorías de clientes (VIP) */}
                          <div 
                            className={`${styles.audienceRadioCard} ${audienceType === 'tiers' ? styles.audienceRadioCardTiersActive : ''}`}
                            onClick={() => setAudienceType('tiers')}
                          >
                            <div className={styles.audienceRadioTitle}>
                              <Crown size={18} style={{ color: '#eab308' }} />
                              Por Categoría (VIP)
                            </div>
                            <p className={styles.audienceRadioDesc}>
                              Exclusivo para clientes que alcanzan nivel VIP o Frecuente.
                            </p>
                          </div>

                          {/* Opción 3: Clientes específicos */}
                          <div 
                            className={`${styles.audienceRadioCard} ${(audienceType === 'customers' || audienceType === 'special') ? styles.audienceRadioCardSpecialActive : ''}`}
                            onClick={() => setAudienceType('customers')}
                          >
                            <div className={styles.audienceRadioTitle}>
                              <Sparkles size={18} />
                              Clientes específicos
                            </div>
                            <p className={styles.audienceRadioDesc}>
                              Visible únicamente para clientes individuales asignados a mano.
                            </p>
                          </div>
                        </div>

                        {/* Selector de categorías cuando es tiers */}
                        {audienceType === 'tiers' && (
                          <div className={styles.audienceTiersPicker}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '0.9rem', color: '#fde047' }}>
                                Categorías Asignadas ({selectedCustomerTiers.length})
                              </strong>
                              <span style={{ fontSize: '0.8rem', color: '#eab308' }}>
                                <Lock size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                Exclusivo por Lealtad
                              </span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                              {/* VIP Row */}
                              <div
                                className={`${styles.audienceTierRow} ${selectedCustomerTiers.includes('vip') ? styles.audienceTierRowActive : ''}`}
                                onClick={() => handleToggleTier('vip')}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <Crown size={20} style={{ color: '#eab308' }} />
                                  <div>
                                    <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Cliente VIP</div>
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                      Consumo &gt; $3,000 o &gt; 15 pedidos completados en los últimos 90 días.
                                    </div>
                                  </div>
                                </div>
                                <div style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '6px',
                                  border: '2px solid var(--border-color)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: selectedCustomerTiers.includes('vip') ? '#eab308' : 'transparent',
                                  borderColor: selectedCustomerTiers.includes('vip') ? '#eab308' : 'var(--border-color)',
                                  color: '#0f172a'
                                }}>
                                  {selectedCustomerTiers.includes('vip') && <Check size={14} />}
                                </div>
                              </div>

                              {/* Frecuente Row */}
                              <div
                                className={`${styles.audienceTierRow} ${selectedCustomerTiers.includes('frecuente') ? styles.audienceTierRowActive : ''}`}
                                onClick={() => handleToggleTier('frecuente')}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                  <Star size={20} style={{ color: '#38bdf8' }} />
                                  <div>
                                    <div style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>Cliente Frecuente</div>
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                                      Consumo &gt; $750 o &gt; 3 pedidos completados en los últimos 90 días.
                                    </div>
                                  </div>
                                </div>
                                <div style={{
                                  width: '20px',
                                  height: '20px',
                                  borderRadius: '6px',
                                  border: '2px solid var(--border-color)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  backgroundColor: selectedCustomerTiers.includes('frecuente') ? '#eab308' : 'transparent',
                                  borderColor: selectedCustomerTiers.includes('frecuente') ? '#eab308' : 'var(--border-color)',
                                  color: '#0f172a'
                                }}>
                                  {selectedCustomerTiers.includes('frecuente') && <Check size={14} />}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Selector de clientes cuando es especial/customers */}
                        {(audienceType === 'customers' || audienceType === 'special') && (
                          <div className={styles.audienceSpecialPicker}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '0.9rem', color: '#c4b5fd' }}>
                                Clientes Asignados ({selectedCustomerIds.length})
                              </strong>
                              {selectedCustomerIds.length > 0 && (
                                <span style={{ fontSize: '0.8rem', color: '#a78bfa' }}>
                                  <Lock size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                                  Acceso Exclusivo
                                </span>
                              )}
                            </div>

                            {/* Input de búsqueda predictiva */}
                            <div className={styles.audienceSearchContainer} ref={customerSearchContainerRef}>
                              <Search size={16} className={styles.audienceSearchIcon} />
                              <input
                                type="text"
                                placeholder="Buscar cliente por nombre o teléfono..."
                                value={customerSearchQuery}
                                onChange={(e) => {
                                  setCustomerSearchQuery(e.target.value);
                                  setIsCustomerDropdownOpen(true);
                                }}
                                onFocus={() => setIsCustomerDropdownOpen(true)}
                                className={styles.audienceSearchInput}
                              />

                              {isCustomerDropdownOpen && customerSearchQuery.trim().length > 0 && (
                                <div className={styles.audienceDropdown}>
                                  {filteredCustomers.length > 0 ? (
                                    filteredCustomers.map((customer) => (
                                      <div
                                        key={customer.id}
                                        className={styles.audienceDropdownRow}
                                        onClick={() => handleAddCustomer(customer)}
                                      >
                                        <div>
                                          <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{customer.name}</div>
                                          {customer.phone && (
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{customer.phone}</div>
                                          )}
                                        </div>
                                        <span style={{ color: '#a78bfa', fontWeight: '600', fontSize: '0.8rem' }}>+ Agregar</span>
                                      </div>
                                    ))
                                  ) : (
                                    <div style={{ padding: '0.8rem', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                      {loadingCustomers ? 'Cargando clientes...' : 'No se encontraron clientes'}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Chips de clientes seleccionados */}
                            <div className={styles.audienceChipsBox}>
                              {selectedCustomersList.length > 0 ? (
                                selectedCustomersList.map((customer) => (
                                  <div key={customer.id} className={styles.audienceChip}>
                                    <UserCheck size={13} style={{ color: '#a78bfa' }} />
                                    <span>{customer.name}</span>
                                    {customer.phone && (
                                      <span style={{ fontSize: '0.75rem', color: '#a78bfa' }}>({customer.phone})</span>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveCustomer(customer.id)}
                                      className={styles.audienceChipRemove}
                                      title="Quitar cliente"
                                    >
                                      <X size={13} />
                                    </button>
                                  </div>
                                ))
                              ) : (
                                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', margin: '0.5rem 0' }}>
                                  Usa el buscador arriba para seleccionar qué clientes tendrán acceso a este producto.
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* --- CONTENIDO PESTAÑA 4: COMPLEMENTOS / MODIFICADORES --- */}
                    <div className={`${styles.tabContent} ${activeTab === 'modifiers' ? styles.active : ''}`}>
                      <div className={styles.modifiersContainer}>
                        <div className={styles.modifierTopBar}>
                          <div>
                            <h4 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                              Complementos y Opciones del Producto
                            </h4>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              Permite al cliente agregar extras (+ costo), quitar ingredientes ($0) o aplicar ajustes de precio.
                            </p>
                          </div>
                          <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                              type="button"
                              className={styles.presetTemplateBtn}
                              onClick={handleLoadModifierPreset}
                              title="Carga una lista con ejemplos comunes de extras"
                            >
                              <Sparkles size={14} /> + Plantilla Rápida
                            </button>
                            <button
                              type="button"
                              className={styles.addModifierGroupBtn}
                              onClick={() => handleAddModifierGroup('Complementos')}
                            >
                              <Plus size={15} /> + Grupo de Opciones
                            </button>
                          </div>
                        </div>

                        {modifierGroups.length === 0 ? (
                          <div className={styles.emptyModifiersBox}>
                            <Sparkles size={32} style={{ color: 'var(--color-primary)', opacity: 0.8 }} />
                            <div className={styles.emptyModifiersTitle}>Sin complementos configurados</div>
                            <p className={styles.emptyModifiersDesc}>
                              Los clientes no verán opciones adicionales para este producto. Agrega un grupo de complementos para que puedan elegir ingredientes extra como salsa, porciones adicionales o modificaciones.
                            </p>
                            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                              <button
                                type="button"
                                className={styles.addModifierGroupBtn}
                                onClick={() => handleAddModifierGroup('Complementos')}
                              >
                                <Plus size={14} /> Crear Primer Grupo
                              </button>
                              <button
                                type="button"
                                className={styles.presetTemplateBtn}
                                onClick={handleLoadModifierPreset}
                              >
                                <Sparkles size={14} /> Usar Plantilla Rápida
                              </button>
                            </div>
                          </div>
                        ) : (
                          modifierGroups.map((group, gIndex) => (
                            <div key={group.id || gIndex} className={styles.modifierGroupCard}>
                              <div className={styles.modifierGroupHeader}>
                                <input
                                  type="text"
                                  className={styles.modifierGroupNameInput}
                                  value={group.name}
                                  onChange={(e) => handleModifierGroupChange(group.id, 'name', e.target.value)}
                                  placeholder="Nombre del grupo (ej: Complementos, Extras)"
                                />
                                <div className={styles.modifierGroupActions}>
                                  <label className={styles.modifierRequiredToggle}>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(group.required)}
                                      onChange={(e) => handleModifierGroupChange(group.id, 'required', e.target.checked)}
                                    />
                                    <span>¿Selección obligatoria?</span>
                                  </label>
                                  <button
                                    type="button"
                                    className={styles.modifierDeleteGroupBtn}
                                    onClick={() => handleDeleteModifierGroup(group.id)}
                                    title="Eliminar este grupo"
                                  >
                                    <Trash2 size={13} /> Eliminar Grupo
                                  </button>
                                </div>
                              </div>

                              <div className={styles.modifierOptionsList}>
                                {group.options.map((option, oIndex) => (
                                  <div key={option.id || oIndex} className={styles.modifierOptionRow}>
                                    <input
                                      type="text"
                                      className={styles.modifierOptionNameInput}
                                      value={option.name}
                                      onChange={(e) => handleModifierOptionChange(group.id, option.id, 'name', e.target.value)}
                                      placeholder="Nombre de la opción (ej: Extra pollo, Sin cebolla)"
                                    />
                                    <div className={styles.modifierOptionPriceWrapper}>
                                      <span className={styles.modifierOptionPricePrefix}>Precio: $</span>
                                      <input
                                        type="number"
                                        step="0.5"
                                        className={styles.modifierOptionPriceInput}
                                        value={option.price_delta}
                                        onChange={(e) => handleModifierOptionChange(group.id, option.id, 'price_delta', e.target.value)}
                                        placeholder="0.00"
                                        title="Ajuste al precio: positivo (+), cero ($0) o negativo (-)"
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      className={styles.modifierOptionDeleteBtn}
                                      onClick={() => handleDeleteModifierOption(group.id, option.id)}
                                      title="Eliminar opción"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                ))}

                                <button
                                  type="button"
                                  className={styles.addOptionBtn}
                                  onClick={() => handleAddModifierOption(group.id)}
                                >
                                  <Plus size={13} /> + Añadir Opción a este grupo
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* --- PRECIO Y COSTO (FUERA DE LAS PESTAÑAS) --- */}
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
