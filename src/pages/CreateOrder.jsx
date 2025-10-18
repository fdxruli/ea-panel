import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import styles from './CreateOrder.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ImageWithFallback from '../components/ImageWithFallback';
import { useAdminAuth } from '../context/AdminAuthContext';
import DOMPurify from 'dompurify';

// --- Iconos (sin cambios) ---
const UserPlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="17" y1="11" x2="23" y2="11"></line></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);
// --- NUEVO ÍCONO ---
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>;


export default function CreateOrder() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth();
    const [step, setStep] = useState(1);
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });

    const [allProducts, setAllProducts] = useState([]);
    const [productsWithPrices, setProductsWithPrices] = useState([]);
    const [categories, setCategories] = useState([]);
    const [productSearch, setProductSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    const [cart, setCart] = useState([]);
    const [loadingCustomers, setLoadingCustomers] = useState(true);
    const [loadingProducts, setLoadingProducts] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // --- NUEVO ESTADO PARA PROGRAMACIÓN ---
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    // --- FIN NUEVO ESTADO ---

    const canEdit = hasPermission('crear-pedido.edit');

    // --- OBTENER CLIENTES Y CATEGORÍAS INICIALMENTE (sin cambios) ---
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoadingCustomers(true);
            try {
                const customersPromise = supabase.from('customers').select('*').order('name');
                const categoriesPromise = supabase.from('categories').select('*').order('name');
                const productsPromise = supabase.from('products').select('*').eq('is_active', true);

                const [customersRes, categoriesRes, productsRes] = await Promise.all([customersPromise, categoriesPromise, productsPromise]);

                if (customersRes.error) throw customersRes.error;
                if (categoriesRes.error) throw categoriesRes.error;
                if (productsRes.error) throw productsRes.error;

                setCustomers(customersRes.data || []);
                setCategories(categoriesRes.data || []);
                setAllProducts(productsRes.data || []);

            } catch (error) {
                showAlert(`Error al cargar datos iniciales: ${error.message}`);
            } finally {
                setLoadingCustomers(false);
            }
        };
        fetchInitialData();
    }, [showAlert]);

    // --- FUNCIÓN PARA OBTENER PRECIOS ESPECIALES (sin cambios) ---
    const fetchProductsWithSpecialPrices = useCallback(async (customerId) => {
        if (!customerId) {
            setProductsWithPrices(allProducts);
            setLoadingProducts(false);
            return;
        }
        setLoadingProducts(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const { data: specialPrices, error: specialPricesError } = await supabase
                .from('special_prices')
                .select('*')
                .lte('start_date', today)
                .gte('end_date', today)
                .or(`target_customer_ids.is.null,target_customer_ids.cs.{"${customerId}"}`);

            if (specialPricesError) throw specialPricesError;

            const customerSpecificProducts = allProducts.map(product => {
                const productPrice = specialPrices.find(p => p.product_id === product.id);
                const categoryPrice = specialPrices.find(p => p.category_id === product.category_id && !p.product_id);
                let specialPriceInfo = productPrice || categoryPrice;

                if (specialPriceInfo && (specialPriceInfo.target_customer_ids === null || specialPriceInfo.target_customer_ids.includes(customerId))) {
                    return { ...product, original_price: product.price, price: parseFloat(specialPriceInfo.override_price) };
                }
                return product;
            });
            setProductsWithPrices(customerSpecificProducts);
        } catch (error) {
            showAlert(`Error al cargar precios especiales: ${error.message}`);
            setProductsWithPrices(allProducts);
        } finally {
            setLoadingProducts(false);
        }
    }, [allProducts, showAlert]);

    // --- EFECTO PARA CARGAR PRODUCTOS AL CAMBIAR CLIENTE (sin cambios) ---
    useEffect(() => {
        if (selectedCustomer) {
            fetchProductsWithSpecialPrices(selectedCustomer.id);
        } else {
            setProductsWithPrices([]);
        }
    }, [selectedCustomer, fetchProductsWithSpecialPrices]);

    // --- FILTROS (sin cambios) ---
    const filteredCustomers = useMemo(() => {
        // ... (lógica existente)
         if (!customerSearch) return [];
        const lowerSearch = customerSearch.toLowerCase();
        return customers.filter(c =>
            c.name.toLowerCase().includes(lowerSearch) ||
            (c.phone && c.phone.includes(customerSearch))
        ).slice(0, 5);
    }, [customers, customerSearch]);

    const filteredProducts = useMemo(() => {
        // ... (lógica existente usando productsWithPrices)
         return productsWithPrices.filter(p => {
            const matchesCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
            const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [productsWithPrices, productSearch, categoryFilter]);

    // --- MANEJO DE CLIENTE (sin cambios significativos) ---
    const handleCreateCustomer = async () => {
        // ... (lógica existente)
        if (!canEdit) return;
        const cleanName = DOMPurify.sanitize(newCustomer.name.trim());
        const cleanPhone = DOMPurify.sanitize(newCustomer.phone.trim().replace(/\D/g, ''));

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

            const { data, error } = await supabase
                .from('customers')
                .insert({ name: cleanName, phone: cleanPhone })
                .select()
                .single();
            if (error) throw error;

            showAlert('Cliente creado con éxito.');
            setCustomers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            setSelectedCustomer(data);
            setStep(2);
            setIsCreatingCustomer(false);
            setNewCustomer({ name: '', phone: '' });
        } catch (error) {
             showAlert(`Error al crear cliente: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- MANEJO DEL CARRITO (sin cambios significativos) ---
    const addToCart = (product) => {
        // ... (lógica existente)
        if (!canEdit || !selectedCustomer) return;
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    };
    const updateQuantity = (productId, newQuantityStr) => {
        // ... (lógica existente)
        if (!canEdit) return;
        const newQuantity = parseInt(newQuantityStr, 10);

        if (isNaN(newQuantity) || newQuantity <= 0) {
            removeFromCart(productId);
        } else {
            setCart(prev => prev.map(item => item.id === productId ? { ...item, quantity: newQuantity } : item));
        }
    };
    const removeFromCart = (productId) => {
        // ... (lógica existente)
         if (!canEdit) return;
        setCart(prev => prev.filter(item => item.id !== productId));
    };
    const cartTotal = useMemo(() => {
        // ... (lógica existente)
         return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [cart]);

    // --- FUNCIÓN PARA CREAR PEDIDO (MODIFICADA) ---
    const handlePlaceOrder = async () => {
        if (!canEdit) return;
        if (!selectedCustomer || cart.length === 0) {
            showAlert('Debes seleccionar un cliente y añadir al menos un producto.');
            return;
        }

        // --- VALIDACIÓN Y FORMATO DE FECHA/HORA ---
        let scheduledTimestamp = null;
        if (scheduleDate || scheduleTime) {
            const datePart = scheduleDate || new Date().toISOString().split('T')[0]; // Usa hoy si no hay fecha
            const timePart = scheduleTime || '00:00'; // Usa medianoche si no hay hora

            // Combinar y validar
            const dateTimeString = `${datePart}T${timePart}:00`;
            const scheduledDateObj = new Date(dateTimeString);

            // Validar si la fecha/hora combinada es válida y no está en el pasado
            if (isNaN(scheduledDateObj.getTime())) {
                showAlert('La fecha u hora de programación no es válida.');
                return;
            }
            // Opcional: Impedir programar en el pasado (descomentar si es necesario)
            // const now = new Date();
            // if (scheduledDateObj < now) {
            //     showAlert('No puedes programar un pedido para una fecha/hora pasada.');
            //     return;
            // }

            scheduledTimestamp = scheduledDateObj.toISOString();
        }
        // --- FIN VALIDACIÓN Y FORMATO ---


        setIsSubmitting(true);
        try {
            // Crear la orden con el campo scheduled_for
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    customer_id: selectedCustomer.id,
                    total_amount: cartTotal,
                    status: 'pendiente',
                    scheduled_for: scheduledTimestamp // <-- AÑADIDO AQUÍ (será null si no se especificó)
                })
                .select()
                .single();
            if (orderError) throw orderError;

            // Crear los items (sin cambios)
            const orderItems = cart.map(item => ({
                order_id: orderData.id,
                product_id: item.id,
                quantity: item.quantity,
                price: item.price
            }));
            const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
            if (itemsError) {
                 await supabase.from('orders').delete().eq('id', orderData.id);
                 throw itemsError;
            }

            // --- MENSAJE WHATSAPP (MODIFICADO) ---
            let message = `¡Hola, ${selectedCustomer.name}! 👋 Te confirmamos tu pedido en ENTRE ALAS:\n\n*Pedido N°: ${orderData.order_code}*\n\n`;
            cart.forEach(item => {
                message += `• ${item.quantity}x ${item.name}\n`;
            });
            message += `\n*Total a pagar: $${cartTotal.toFixed(2)}*`;

            // Añadir información de programación al mensaje si existe
            if (scheduledTimestamp) {
                const scheduledDateObj = new Date(scheduledTimestamp);
                const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
                const formattedDate = `${scheduledDateObj.toLocaleDateString('es-MX', dateOptions)} a las ${scheduledDateObj.toLocaleTimeString('es-MX', timeOptions)}`;
                message += `\n\n*Programado para entregar:*\n${formattedDate}\n`;
            }
            // --- FIN MENSAJE WHATSAPP ---

            const whatsappUrl = `https://api.whatsapp.com/send?phone=${selectedCustomer.phone}&text=${encodeURIComponent(message)}`;

            showAlert(
                `¡Pedido #${orderData.order_code} creado! Serás redirigido a WhatsApp para notificar al cliente.`,
                'info',
                () => {
                    window.open(whatsappUrl, '_blank');
                    // Resetear estado completo
                    setStep(1);
                    setSelectedCustomer(null);
                    setCart([]);
                    setCustomerSearch('');
                    setProductSearch('');
                    setCategoryFilter('all');
                    setProductsWithPrices([]);
                    setScheduleDate(''); // <-- Resetear fecha
                    setScheduleTime(''); // <-- Resetear hora
                }
            );

        } catch (error) {
            showAlert(`Error al crear el pedido: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    // --- FIN FUNCIÓN CREAR PEDIDO ---

    if (loadingCustomers) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <h1>Crear Nuevo Pedido</h1>

            <div className={styles.mainGrid}>
                <div className={styles.workflowColumn}>
                    {/* PASO 1: SELECCIONAR CLIENTE */}
                    <div className={`${styles.stepCard} ${step >= 1 ? styles.active : ''}`}>
                       {/* ... (contenido paso 1 sin cambios) ... */}
                        <div className={styles.stepHeader}>
                            <span className={styles.stepNumber}>1</span>
                            <h2>Seleccionar Cliente</h2>
                        </div>
                        {selectedCustomer ? (
                            <div className={styles.selectedCustomer}>
                                <p><strong>Cliente:</strong> {selectedCustomer.name}</p>
                                <p><strong>Teléfono:</strong> {selectedCustomer.phone}</p>
                                <button onClick={() => { if(canEdit) {setSelectedCustomer(null); setStep(1); setCart([]); setProductsWithPrices([]); setScheduleDate(''); setScheduleTime('');}}} className={styles.changeButton} disabled={!canEdit}>Cambiar Cliente</button>
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

                    {/* PASO 2: AÑADIR PRODUCTOS */}
                    <div className={`${styles.stepCard} ${step === 2 ? styles.active : ''}`}>
                        {/* ... (contenido paso 2 con precios especiales) ... */}
                        <div className={styles.stepHeader}>
                            <span className={styles.stepNumber}>2</span>
                            <h2>Añadir Productos</h2>
                        </div>
                        <div className={styles.productFilters}>
                             <div className={styles.searchInput}>
                                <SearchIcon />
                                <input
                                    type="text"
                                    placeholder="Buscar producto..."
                                    value={productSearch}
                                    onChange={(e) => setProductSearch(e.target.value)}
                                    disabled={!selectedCustomer || !canEdit}
                                />
                             </div>
                            <select onChange={(e) => setCategoryFilter(e.target.value)} disabled={!selectedCustomer || !canEdit} value={categoryFilter}>
                                <option value="all">Todas las categorías</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
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

                {/* COLUMNA RESUMEN */}
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
                                                <input
                                                    type="number"
                                                    min="1"
                                                    value={item.quantity}
                                                    onChange={(e) => updateQuantity(item.id, e.target.value)}
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

                        {/* --- SECCIÓN DE PROGRAMACIÓN --- */}
                        {selectedCustomer && cart.length > 0 && canEdit && (
                            <div className={styles.scheduleSection}>
                                <h4><ClockIcon /> Programar Entrega (Opcional)</h4>
                                <div className={styles.scheduleInputs}>
                                    <div className={styles.formGroup}>
                                        <label htmlFor="schedule-date">Fecha</label>
                                        <input
                                            type="date"
                                            id="schedule-date"
                                            value={scheduleDate}
                                            onChange={(e) => setScheduleDate(e.target.value)}
                                            min={new Date().toISOString().split('T')[0]} // Mínimo hoy
                                        />
                                    </div>
                                    <div className={styles.formGroup}>
                                        <label htmlFor="schedule-time">Hora</label>
                                        <input
                                            type="time"
                                            id="schedule-time"
                                            value={scheduleTime}
                                            onChange={(e) => setScheduleTime(e.target.value)}
                                        />
                                    </div>
                                </div>
                                {(scheduleDate || scheduleTime) && (
                                    <button
                                        type="button"
                                        onClick={() => { setScheduleDate(''); setScheduleTime(''); }}
                                        className={styles.clearScheduleButton}
                                    >
                                        Limpiar Programación
                                    </button>
                                )}
                            </div>
                        )}
                        {/* --- FIN SECCIÓN PROGRAMACIÓN --- */}

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

            {/* MODAL CREAR CLIENTE */}
            {isCreatingCustomer && (
                 <div className={styles.modalOverlay}>
                    {/* ... (contenido del modal sin cambios) ... */}
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
