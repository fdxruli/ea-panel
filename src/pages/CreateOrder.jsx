import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import styles from './CreateOrder.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ImageWithFallback from '../components/ImageWithFallback';
import { useAdminAuth } from '../context/AdminAuthContext';
import DOMPurify from 'dompurify'; // Asegúrate de importar DOMPurify si aún no lo has hecho

// --- Iconos (sin cambios) ---
const UserPlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="17" y1="11" x2="23" y2="11"></line></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const TrashIcon = () => ( // Añadido ícono de basura para el carrito
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);


export default function CreateOrder() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth();
    const [step, setStep] = useState(1);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });

    // --- ESTADOS DE PRODUCTOS MODIFICADOS ---
    const [allProducts, setAllProducts] = useState([]); // Todos los productos base
    const [productsWithPrices, setProductsWithPrices] = useState([]); // Productos con precios ajustados para el cliente
    const [categories, setCategories] = useState([]);
    const [productSearch, setProductSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    // --- FIN DE ESTADOS DE PRODUCTOS MODIFICADOS ---

    const [cart, setCart] = useState([]);
    const [loadingCustomers, setLoadingCustomers] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(false); // Nuevo estado de carga para productos
    const [isSubmitting, setIsSubmitting] = useState(false);

    const canEdit = hasPermission('crear-pedido.edit');

    // --- OBTENER CLIENTES Y CATEGORÍAS INICIALMENTE ---
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoadingCustomers(true);
            try {
                const customersPromise = supabase.from('customers').select('*').order('name');
                const categoriesPromise = supabase.from('categories').select('*').order('name');
                const productsPromise = supabase.from('products').select('*').eq('is_active', true); // Obtener productos base una vez

                const [customersRes, categoriesRes, productsRes] = await Promise.all([customersPromise, categoriesPromise, productsPromise]);

                if (customersRes.error) throw customersRes.error;
                if (categoriesRes.error) throw categoriesRes.error;
                if (productsRes.error) throw productsRes.error;

                setCustomers(customersRes.data || []);
                setCategories(categoriesRes.data || []);
                setAllProducts(productsRes.data || []); // Guardar productos base

            } catch (error) {
                showAlert(`Error al cargar datos iniciales: ${error.message}`);
            } finally {
                setLoadingCustomers(false);
            }
        };
        fetchInitialData();
    }, [showAlert]);

    // --- NUEVA FUNCIÓN PARA OBTENER PRODUCTOS CON PRECIOS ESPECIALES ---
    const fetchProductsWithSpecialPrices = useCallback(async (customerId) => {
        if (!customerId) {
            // Si no hay cliente, usar precios base
            setProductsWithPrices(allProducts);
            setLoadingProducts(false);
            return;
        }
        setLoadingProducts(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            // Obtener precios especiales aplicables (globales o específicos del cliente)
            const { data: specialPrices, error: specialPricesError } = await supabase
                .from('special_prices')
                .select('*')
                .lte('start_date', today)
                .gte('end_date', today)
                .or(`target_customer_ids.is.null,target_customer_ids.cs.{"${customerId}"}`); // Condición clave

            if (specialPricesError) throw specialPricesError;

            // Mapear productos base y aplicar precios especiales
            const customerSpecificProducts = allProducts.map(product => {
                const productPrice = specialPrices.find(p => p.product_id === product.id);
                const categoryPrice = specialPrices.find(p => p.category_id === product.category_id && !p.product_id); // Asegurar que sea solo de categoría

                let specialPriceInfo = productPrice || categoryPrice; // Priorizar precio de producto

                // Aplicar el precio especial si existe y es válido para este cliente
                if (specialPriceInfo && (specialPriceInfo.target_customer_ids === null || specialPriceInfo.target_customer_ids.includes(customerId))) {
                    return {
                        ...product,
                        original_price: product.price, // Guardar el original opcionalmente
                        price: parseFloat(specialPriceInfo.override_price) // Aplicar precio especial
                    };
                }
                // Si no hay precio especial aplicable, devolver el producto con su precio normal
                return product;
            });

            setProductsWithPrices(customerSpecificProducts);

        } catch (error) {
            showAlert(`Error al cargar precios especiales para el cliente: ${error.message}`);
            setProductsWithPrices(allProducts); // Fallback a precios normales en caso de error
        } finally {
            setLoadingProducts(false);
        }
    }, [allProducts, showAlert]); // Depende de allProducts y showAlert

    // --- EFECTO PARA CARGAR PRODUCTOS CUANDO CAMBIA EL CLIENTE ---
    useEffect(() => {
        if (selectedCustomer) {
            fetchProductsWithSpecialPrices(selectedCustomer.id);
        } else {
            setProductsWithPrices([]); // Limpiar si no hay cliente seleccionado
        }
    }, [selectedCustomer, fetchProductsWithSpecialPrices]);
    // --- FIN DE CAMBIOS EN OBTENCIÓN DE PRODUCTOS ---


    const filteredCustomers = useMemo(() => {
        if (!customerSearch) return [];
        const lowerSearch = customerSearch.toLowerCase();
        return customers.filter(c =>
            c.name.toLowerCase().includes(lowerSearch) ||
            (c.phone && c.phone.includes(customerSearch))
        ).slice(0, 5);
    }, [customers, customerSearch]);

    // --- USAR productsWithPrices PARA FILTRAR ---
    const filteredProducts = useMemo(() => {
        return productsWithPrices.filter(p => {
            const matchesCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
            const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [productsWithPrices, productSearch, categoryFilter]); // Ahora depende de productsWithPrices
    // --- FIN DE CAMBIOS EN FILTRADO ---

    const handleCreateCustomer = async () => {
        if (!canEdit) return;
        const cleanName = DOMPurify.sanitize(newCustomer.name.trim());
        const cleanPhone = DOMPurify.sanitize(newCustomer.phone.trim().replace(/\D/g, '')); // Limpiar teléfono

        if (!cleanName || !cleanPhone) {
            showAlert('El nombre y el teléfono son obligatorios.');
            return;
        }
        if (cleanPhone.length !== 10) {
            showAlert('El teléfono debe tener 10 dígitos.');
             return;
        }

        setIsSubmitting(true);
        try {
            // Verificar si el teléfono ya existe
            const { data: existingCustomer, error: checkError } = await supabase
                .from('customers')
                .select('id')
                .eq('phone', cleanPhone)
                .maybeSingle();

            if (checkError) throw checkError;
            if (existingCustomer) {
                showAlert('Ya existe un cliente con este número de teléfono.');
                setIsSubmitting(false);
                return;
            }

            // Insertar nuevo cliente
            const { data, error } = await supabase
                .from('customers')
                .insert({ name: cleanName, phone: cleanPhone }) // Usar datos limpios
                .select()
                .single();
            if (error) throw error;

            showAlert('Cliente creado con éxito.');
            setCustomers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name))); // Añadir y ordenar
            setSelectedCustomer(data);
            setStep(2);
            setIsCreatingCustomer(false);
            setNewCustomer({ name: '', phone: '' }); // Resetear formulario
        } catch (error) {
             showAlert(`Error al crear cliente: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const addToCart = (product) => {
        if (!canEdit || !selectedCustomer) return; // No añadir si no hay cliente
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                // Incrementar cantidad si ya existe
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            // Añadir nuevo item al carrito, asegurándose de usar el precio correcto (que ya incluye el especial)
            return [...prev, {
                ...product, // Contiene toda la info del producto, incluido el precio ajustado
                quantity: 1
            }];
        });
    };

    const updateQuantity = (productId, newQuantityStr) => {
        if (!canEdit) return;
        const newQuantity = parseInt(newQuantityStr, 10); // Convertir a número

        if (isNaN(newQuantity) || newQuantity <= 0) {
            // Eliminar si la cantidad es inválida o cero
            setCart(prev => prev.filter(item => item.id !== productId));
        } else {
            // Actualizar cantidad
            setCart(prev => prev.map(item => item.id === productId ? { ...item, quantity: newQuantity } : item));
        }
    };

    const removeFromCart = (productId) => {
        if (!canEdit) return;
        setCart(prev => prev.filter(item => item.id !== productId));
    };


    const cartTotal = useMemo(() => {
        // Calcular total basado en los precios del carrito (que ya son los correctos)
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [cart]);


    const handlePlaceOrder = async () => {
        if (!canEdit) return;
        if (!selectedCustomer || cart.length === 0) {
            showAlert('Debes seleccionar un cliente y añadir al menos un producto.');
            return;
        }
        setIsSubmitting(true);
        try {
            // Crear la orden
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    customer_id: selectedCustomer.id,
                    total_amount: cartTotal, // Usar el total calculado
                    status: 'pendiente' // Estado inicial
                })
                .select()
                .single();
            if (orderError) throw orderError;

            // Crear los items de la orden
            const orderItems = cart.map(item => ({
                order_id: orderData.id,
                product_id: item.id,
                quantity: item.quantity,
                price: item.price // Usar el precio del item en el carrito (puede ser especial)
            }));
            const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
            if (itemsError) {
                 // Intentar eliminar la orden si falla la inserción de items (rollback manual básico)
                 await supabase.from('orders').delete().eq('id', orderData.id);
                 throw itemsError;
            }


            // --- Notificación por WhatsApp (sin cambios) ---
            let message = `¡Hola, ${selectedCustomer.name}! 👋 Te confirmamos tu pedido en ENTRE ALAS:\n\n*Pedido N°: ${orderData.order_code}*\n\n`;
            cart.forEach(item => {
                message += `• ${item.quantity}x ${item.name}\n`;
            });
            message += `\n*Total a pagar: $${cartTotal.toFixed(2)}*`;
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${selectedCustomer.phone}&text=${encodeURIComponent(message)}`;

            showAlert(
                `¡Pedido #${orderData.order_code} creado! Serás redirigido a WhatsApp para notificar al cliente.`,
                'info',
                () => {
                    window.open(whatsappUrl, '_blank');
                    // Resetear estado
                    setStep(1);
                    setSelectedCustomer(null);
                    setCart([]);
                    setCustomerSearch('');
                    setProductSearch('');
                    setCategoryFilter('all');
                    setProductsWithPrices([]); // Limpiar productos con precios específicos
                }
            );

        } catch (error) {
            showAlert(`Error al crear el pedido: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Renderizado Condicional de Carga ---
    if (loadingCustomers) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <h1>Crear Nuevo Pedido</h1>

            <div className={styles.mainGrid}>
                <div className={styles.workflowColumn}>
                    {/* --- PASO 1: SELECCIONAR CLIENTE (sin cambios significativos) --- */}
                    <div className={`${styles.stepCard} ${step >= 1 ? styles.active : ''}`}>
                        <div className={styles.stepHeader}>
                            <span className={styles.stepNumber}>1</span>
                            <h2>Seleccionar Cliente</h2>
                        </div>
                        {selectedCustomer ? (
                            <div className={styles.selectedCustomer}>
                                <p><strong>Cliente:</strong> {selectedCustomer.name}</p>
                                <p><strong>Teléfono:</strong> {selectedCustomer.phone}</p>
                                {/* Botón para cambiar cliente */}
                                <button onClick={() => { if(canEdit) {setSelectedCustomer(null); setStep(1); setCart([]); setProductsWithPrices([]);}}} className={styles.changeButton} disabled={!canEdit}>Cambiar Cliente</button>
                            </div>
                        ) : (
                            <div className={styles.customerSearch}>
                                <div className={styles.searchInput}>
                                    <SearchIcon />
                                    <input
                                        type="text"
                                        placeholder="Buscar por nombre o teléfono..."
                                        value={customerSearch}
                                        onChange={(e) => setCustomerSearch(e.target.value)}
                                        disabled={!canEdit}
                                    />
                                </div>
                                {customerSearch && filteredCustomers.length > 0 && (
                                    <ul className={styles.customerResults}>
                                        {filteredCustomers.map(c => (
                                            <li key={c.id} onClick={() => { if(canEdit) {setSelectedCustomer(c); setStep(2); setCustomerSearch(''); }}}>
                                                {c.name} - {c.phone || 'Sin teléfono'}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                 {customerSearch && !filteredCustomers.length && <p className={styles.noResults}>No se encontraron clientes.</p>}
                                <p className={styles.orText}>o</p>
                                <button onClick={() => setIsCreatingCustomer(true)} className={styles.createCustomerButton} disabled={!canEdit}>
                                    <UserPlusIcon /> Crear Nuevo Cliente
                                </button>
                            </div>
                        )}
                    </div>

                    {/* --- PASO 2: AÑADIR PRODUCTOS (modificado) --- */}
                    <div className={`${styles.stepCard} ${step === 2 ? styles.active : ''}`}>
                         <div className={styles.stepHeader}>
                            <span className={styles.stepNumber}>2</span>
                            <h2>Añadir Productos</h2>
                        </div>
                        {/* Filtros de productos */}
                        <div className={styles.productFilters}>
                             <div className={styles.searchInput}>
                                <SearchIcon />
                                <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    disabled={!selectedCustomer || !canEdit} // Deshabilitado si no hay cliente
                                />
                             </div>
                            <select onChange={(e) => setCategoryFilter(e.target.value)} disabled={!selectedCustomer || !canEdit} value={categoryFilter}>
                                <option value="all">Todas las categorías</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        {/* Lista de productos */}
                        <div className={styles.productList}>
                            {!selectedCustomer ? (
                                 <p className={styles.disabledText}>Selecciona un cliente para ver los productos.</p>
                            ) : loadingProducts ? (
                                <LoadingSpinner />
                            ) : filteredProducts.length === 0 ? (
                                <p className={styles.disabledText}>No se encontraron productos con los filtros actuales.</p>
                            ) : (
                                filteredProducts.map(p => (
                                <div key={p.id} className={styles.productItem} onClick={() => addToCart(p)} role="button">
                                    <ImageWithFallback src={p.image_url || 'https://placehold.co/100'} alt={p.name} />
                                    <div className={styles.productInfo}>
                                        <strong>{p.name}</strong>
                                        {/* Mostrar precio original tachado si hay precio especial */}
                                        {p.original_price && p.original_price !== p.price ? (
                                            <>
                                                <span className={styles.originalPrice}>${p.original_price.toFixed(2)}</span>
                                                <span className={styles.specialPrice}>${p.price.toFixed(2)}</span>
                                            </>
                                         ) : (
                                             <span className={styles.price}>${p.price.toFixed(2)}</span>
                                         )}
                                    </div>
                                </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* --- COLUMNA RESUMEN (carrito modificado) --- */}
                <div className={styles.summaryColumn}>
                    <div className={styles.summaryCard}>
                        <h3>Resumen del Pedido</h3>
                        {cart.length === 0 ? (
                            <p className={styles.emptyCart}>Añade productos al carrito.</p>
                        ) : (
                            <>
                                <ul className={styles.cartList}>
                                    {cart.map(item => (
                                        <li key={item.id}>
                                            <ImageWithFallback src={item.image_url || 'https://placehold.co/50'} alt={item.name} className={styles.cartItemImage}/>
                                            <div className={styles.cartItemInfo}>
                                                <span>{item.name}</span>
                                                {/* Mostrar precio original si es diferente */}
                                                <small>
                                                     {item.original_price && item.original_price !== item.price
                                                        ? <>
                                                            <span className={styles.originalPriceSmall}>${item.original_price.toFixed(2)}</span> ${item.price.toFixed(2)}
                                                          </>
                                                        : `$${item.price.toFixed(2)}`
                                                     } c/u
                                                </small>
                                            </div>
                                            <div className={styles.quantityControl}>
                                                <button onClick={() => updateQuantity(item.id, item.quantity - 1)} disabled={!canEdit}>-</button>
                                                {/* Input number con validación */}
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={item.quantity}
                                                    onChange={(e) => updateQuantity(item.id, e.target.value)} // Pasa el string directamente
                                                    disabled={!canEdit}
                                                    aria-label={`Cantidad de ${item.name}`}
                                                 />
                                                <button onClick={() => updateQuantity(item.id, item.quantity + 1)} disabled={!canEdit}>+</button>
                                                <button onClick={() => removeFromCart(item.id)} className={styles.removeButton} disabled={!canEdit} aria-label={`Quitar ${item.name}`}>
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                            <strong>${(item.price * item.quantity).toFixed(2)}</strong>
                                        </li>
                                    ))}
                                </ul>
                                <div className={styles.total}>
                                    <span>Total</span>
                                    <strong>${cartTotal.toFixed(2)}</strong>
                                </div>
                            </>
                        )}
                        <button
                            className={styles.placeOrderButton}
                            onClick={handlePlaceOrder}
                            disabled={isSubmitting || cart.length === 0 || !selectedCustomer || !canEdit}
                        >
                            {isSubmitting ? 'Creando...' : (canEdit ? 'Crear Pedido y Notificar' : 'No tienes permiso')}
                        </button>
                    </div>
                </div>
            </div>

            {/* --- MODAL CREAR CLIENTE (sin cambios significativos, añadido DOMPurify) --- */}
            {isCreatingCustomer && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h2>Crear Nuevo Cliente</h2>
                        <form onSubmit={(e) => { e.preventDefault(); handleCreateCustomer(); }}>
                            <div className={styles.formGroup}>
                                <label htmlFor="new-customer-name">Nombre Completo</label>
                                <input
                                    id="new-customer-name"
                                    type="text"
                                    value={newCustomer.name}
                                    onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                                    required
                                />
                            </div>
                             <div className={styles.formGroup}>
                                <label htmlFor="new-customer-phone">Número de Teléfono (10 dígitos)</label>
                                <input
                                    id="new-customer-phone"
                                    type="tel"
                                    maxLength="10"
                                    pattern="\d{10}"
                                    title="Ingresa 10 dígitos numéricos"
                                    value={newCustomer.phone}
                                    onChange={e => setNewCustomer({...newCustomer, phone: e.target.value.replace(/\D/g, '')})} // Permitir solo números
                                    required
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button type="button" onClick={() => { setIsCreatingCustomer(false); setNewCustomer({ name: '', phone: '' }); }} className="admin-button-secondary">Cancelar</button>
                                <button type="submit" className="admin-button-primary" disabled={isSubmitting}>
                                    {isSubmitting ? 'Guardando...' : 'Guardar Cliente'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
