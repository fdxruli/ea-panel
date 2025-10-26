import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import styles from './CreateOrder.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ImageWithFallback from '../components/ImageWithFallback';
import { useAdminAuth } from '../context/AdminAuthContext';
import DOMPurify from 'dompurify';

// --- Iconos ---
const UserPlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="17" y1="11" x2="23" y2="11"></line></svg>;
const SearchIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>;
const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);
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

    // Estado para programación
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');

    const canEdit = hasPermission('crear-pedido.edit'); // Assuming edit permission covers creation

    // Obtener clientes y categorías inicialmente
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

    // Función para obtener precios especiales según el cliente
    const fetchProductsWithSpecialPrices = useCallback(async (customerId) => {
        if (!customerId) {
            setProductsWithPrices(allProducts); // Usa todos los productos si no hay cliente (o manejar diferente)
            setLoadingProducts(false);
            return;
        }
        setLoadingProducts(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            // Obtiene precios especiales activos para todos o para este cliente específico
            const { data: specialPrices, error: specialPricesError } = await supabase
                .from('special_prices')
                .select('*')
                .lte('start_date', today)
                .gte('end_date', today)
                .or(`target_customer_ids.is.null,target_customer_ids.cs.{"${customerId}"}`);

            if (specialPricesError) throw specialPricesError;

            // Mapea los productos para aplicar precios especiales encontrados
            const customerSpecificProducts = allProducts.map(product => {
                const productPrice = specialPrices.find(p => p.product_id === product.id);
                const categoryPrice = specialPrices.find(p => p.category_id === product.category_id && !p.product_id);
                let specialPriceInfo = productPrice || categoryPrice; // Prioridad al precio de producto

                // Verifica que el precio encontrado sea aplicable
                if (specialPriceInfo && (specialPriceInfo.target_customer_ids === null || specialPriceInfo.target_customer_ids.includes(customerId))) {
                    return { ...product, original_price: product.price, price: parseFloat(specialPriceInfo.override_price) };
                }
                return product; // Devuelve el producto con precio original si no hay especial aplicable
            });
            setProductsWithPrices(customerSpecificProducts);
        } catch (error) {
            showAlert(`Error al cargar precios especiales: ${error.message}`);
            setProductsWithPrices(allProducts); // Fallback a precios normales si hay error
        } finally {
            setLoadingProducts(false);
        }
    }, [allProducts, showAlert]);

    // Efecto para cargar productos con precios cuando cambia el cliente seleccionado
    useEffect(() => {
        if (selectedCustomer) {
            fetchProductsWithSpecialPrices(selectedCustomer.id);
        } else {
            // Limpia la lista de productos si no hay cliente seleccionado
            setProductsWithPrices([]);
        }
    }, [selectedCustomer, fetchProductsWithSpecialPrices]);

    // --- Filtros ---
    // Filtra clientes para la búsqueda
    const filteredCustomers = useMemo(() => {
        if (!customerSearch) return [];
        const lowerSearch = customerSearch.toLowerCase();
        return customers.filter(c =>
            c.name.toLowerCase().includes(lowerSearch) ||
            (c.phone && c.phone.includes(customerSearch))
        ).slice(0, 5); // Limita a 5 resultados
    }, [customers, customerSearch]);

    // Filtra productos según categoría y término de búsqueda
    const filteredProducts = useMemo(() => {
        return productsWithPrices.filter(p => {
            const matchesCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
            const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [productsWithPrices, productSearch, categoryFilter]);

    // --- Manejo de Cliente ---
    // Función para crear un nuevo cliente
    const handleCreateCustomer = async () => {
        if (!canEdit) return; // Verifica permiso
        // Sanitiza y valida datos
        const cleanName = DOMPurify.sanitize(newCustomer.name.trim());
        const cleanPhone = DOMPurify.sanitize(newCustomer.phone.trim().replace(/\D/g, '')); // Solo números

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
            // Verifica si ya existe un cliente con ese teléfono
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

            // Inserta el nuevo cliente
            const { data, error } = await supabase
                .from('customers')
                .insert({ name: cleanName, phone: cleanPhone }) // Aquí podrías añadir referral_code si lo gestionas
                .select()
                .single();
            if (error) throw error;

            showAlert('Cliente creado con éxito.');
            // Actualiza la lista de clientes localmente y ordena
            setCustomers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
            setSelectedCustomer(data); // Selecciona al nuevo cliente
            setStep(2); // Avanza al siguiente paso
            setIsCreatingCustomer(false); // Cierra el modal de creación
            setNewCustomer({ name: '', phone: '' }); // Limpia el formulario
        } catch (error) {
             showAlert(`Error al crear cliente: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- Manejo del Carrito ---
    // Añade un producto al carrito o incrementa su cantidad
    const addToCart = (product) => {
        if (!canEdit || !selectedCustomer) return; // Verifica permiso y cliente
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                // Si ya existe, incrementa cantidad
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            // Si es nuevo, lo añade con cantidad 1
            return [...prev, { ...product, quantity: 1 }];
        });
    };
    // Actualiza la cantidad de un producto en el carrito
    const updateQuantity = (productId, newQuantityStr) => {
        if (!canEdit) return;
        const newQuantity = parseInt(newQuantityStr, 10);

        if (isNaN(newQuantity) || newQuantity <= 0) {
            // Si la cantidad no es válida o es 0 o menos, elimina el item
            removeFromCart(productId);
        } else {
            // Actualiza la cantidad del item específico
            setCart(prev => prev.map(item => item.id === productId ? { ...item, quantity: newQuantity } : item));
        }
    };
    // Elimina un producto del carrito
    const removeFromCart = (productId) => {
        if (!canEdit) return;
        setCart(prev => prev.filter(item => item.id !== productId));
    };
    // Calcula el total del carrito
    const cartTotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [cart]);

    // --- Función para Crear Pedido ---
    const handlePlaceOrder = async () => {
        if (!canEdit) return;
        if (!selectedCustomer || cart.length === 0) {
            showAlert('Debes seleccionar un cliente y añadir al menos un producto.');
            return;
        }

        // --- Validación y Formato de Fecha/Hora Programada ---
        let scheduledTimestamp = null;
        if (scheduleDate || scheduleTime) {
            const datePart = scheduleDate || new Date().toISOString().split('T')[0];
            const timePart = scheduleTime || '00:00';
            const dateTimeString = `${datePart}T${timePart}:00`;
            const scheduledDateObj = new Date(dateTimeString);

            if (isNaN(scheduledDateObj.getTime())) {
                showAlert('La fecha u hora de programación no es válida.');
                return;
            }
            // Opcional: Impedir programar en el pasado
            // const now = new Date();
            // now.setMinutes(now.getMinutes() - 5); // Dar un margen de 5 minutos
            // if (scheduledDateObj < now) {
            //     showAlert('No puedes programar un pedido para una fecha/hora pasada.');
            //     return;
            // }

            scheduledTimestamp = scheduledDateObj.toISOString();
        }
        // --- Fin Validación ---

        setIsSubmitting(true);
        try {
            // 1. Insertar la orden principal
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    customer_id: selectedCustomer.id,
                    total_amount: cartTotal,
                    status: 'pendiente', // Estado inicial
                    scheduled_for: scheduledTimestamp // Guardar timestamp ISO o null
                })
                .select() // Pide que devuelva los datos insertados
                .single(); // Espera un solo resultado
            if (orderError) throw orderError;

            // 2. Insertar los items del pedido
            const orderItems = cart.map(item => ({
                order_id: orderData.id, // ID de la orden recién creada
                product_id: item.id,
                quantity: item.quantity,
                price: item.price // Precio al momento de la compra
            }));
            const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
            // Si falla la inserción de items, borra la orden principal (rollback manual básico)
            if (itemsError) {
                 await supabase.from('orders').delete().eq('id', orderData.id);
                 throw itemsError;
            }

            // --- Construcción del Mensaje WhatsApp ---
            let message = `Te confirmamos tu pedido en ENTRE ALAS:\n\n*Pedido N°: ${orderData.order_code}*\n\n`;
            cart.forEach(item => {
                message += `• ${item.quantity}x ${item.name}\n`;
            });
            message += `\n*Total a pagar: $${cartTotal.toFixed(2)}*`;

            // Añadir info de programación si existe
            if (scheduledTimestamp) {
                const scheduledDateObj = new Date(scheduledTimestamp);
                const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
                const formattedDate = `${scheduledDateObj.toLocaleDateString('es-MX', dateOptions)} a las ${scheduledDateObj.toLocaleTimeString('es-MX', timeOptions)}`;
                message += `\n\n*Programado para entregar:*\n${formattedDate}\n`;
            }

            // ---- MODIFICACIÓN DEL ENLACE ----
            // Construye la URL específica usando el order_code obtenido de orderData
            const clientSpecificOrderUrl = `https://ea-panel.vercel.app/mis-pedidos/${orderData.order_code}`;
            message += `\n\nPuedes ver el estado de tu pedido aquí:\n${clientSpecificOrderUrl}`;
            // ---- FIN MODIFICACIÓN DEL ENLACE ----

            // Construye la URL de WhatsApp para enviar el mensaje AL CLIENTE
            // Usamos el número del cliente como destino
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${selectedCustomer.phone}&text=${encodeURIComponent(message)}`;

            // Muestra alerta y abre WhatsApp en nueva pestaña al confirmar
            showAlert(
                `¡Pedido #${orderData.order_code} creado! Serás redirigido a WhatsApp para notificar al cliente.`,
                'info',
                () => {
                    window.open(whatsappUrl, '_blank');
                    // Resetea el estado para un nuevo pedido
                    setStep(1);
                    setSelectedCustomer(null);
                    setCart([]);
                    setCustomerSearch('');
                    setProductSearch('');
                    setCategoryFilter('all');
                    setProductsWithPrices([]);
                    setScheduleDate('');
                    setScheduleTime('');
                }
            );

        } catch (error) {
            showAlert(`Error al crear el pedido: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    // --- Fin handlePlaceOrder ---

    if (loadingCustomers) return <LoadingSpinner />;

    // --- Renderizado del Componente ---
    return (
        <div className={styles.container}>
            <h1>Crear Nuevo Pedido</h1>

            <div className={styles.mainGrid}>
                {/* Columna Izquierda: Pasos de Selección */}
                <div className={styles.workflowColumn}>
                    {/* PASO 1: SELECCIONAR CLIENTE */}
                    <div className={`${styles.stepCard} ${step >= 1 ? styles.active : ''}`}>
                        <div className={styles.stepHeader}>
                            <span className={styles.stepNumber}>1</span>
                            <h2>Seleccionar Cliente</h2>
                        </div>
                        {selectedCustomer ? (
                            // Muestra info del cliente seleccionado y botón para cambiar
                            <div className={styles.selectedCustomer}>
                                <p><strong>Cliente:</strong> {selectedCustomer.name}</p>
                                <p><strong>Teléfono:</strong> {selectedCustomer.phone}</p>
                                <button
                                    onClick={() => { if(canEdit) {setSelectedCustomer(null); setStep(1); setCart([]); setProductsWithPrices([]); setScheduleDate(''); setScheduleTime('');}}}
                                    className={styles.changeButton}
                                    disabled={!canEdit}
                                >
                                    Cambiar Cliente
                                </button>
                            </div>
                        ) : (
                            // Muestra buscador y opción de crear nuevo cliente
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
                                {/* Muestra resultados de búsqueda */}
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
                                {/* Botón para abrir modal de creación */}
                                <button onClick={() => setIsCreatingCustomer(true)} className={styles.createCustomerButton} disabled={!canEdit}>
                                    <UserPlusIcon /> Crear Nuevo Cliente
                                </button>
                            </div>
                        )}
                    </div>

                    {/* PASO 2: AÑADIR PRODUCTOS */}
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
                                    disabled={!selectedCustomer || !canEdit} // Deshabilitado si no hay cliente o permiso
                                />
                             </div>
                            <select onChange={(e) => setCategoryFilter(e.target.value)} disabled={!selectedCustomer || !canEdit} value={categoryFilter}>
                                <option value="all">Todas las categorías</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </div>
                        {/* Lista de productos disponibles */}
                        <div className={styles.productList}>
                            {!selectedCustomer ? (
                                 <p className={styles.disabledText}>Selecciona un cliente para ver los productos.</p>
                            ) : loadingProducts ? (
                                <LoadingSpinner />
                            ) : filteredProducts.length === 0 ? (
                                <p className={styles.disabledText}>No se encontraron productos con los filtros actuales.</p>
                            ) : (
                                // Mapea y muestra cada producto filtrado
                                filteredProducts.map(p => (
                                <div key={p.id} className={styles.productItem} onClick={() => addToCart(p)} role="button">
                                    <ImageWithFallback src={p.image_url || 'https://placehold.co/100'} alt={p.name} />
                                    <div className={styles.productInfo}>
                                        <strong>{p.name}</strong>
                                        {/* Muestra precio especial si existe */}
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

                {/* Columna Derecha: Resumen del Pedido */}
                <div className={styles.summaryColumn}>
                    <div className={styles.summaryCard}>
                        <h3>Resumen del Pedido</h3>
                        {cart.length === 0 ? (
                            <p className={styles.emptyCart}>Añade productos al carrito.</p>
                        ) : (
                            // Muestra items del carrito si no está vacío
                            <>
                                <ul className={styles.cartList}>
                                    {cart.map(item => (
                                         <li key={item.id}>
                                            <ImageWithFallback src={item.image_url || 'https://placehold.co/50'} alt={item.name} className={styles.cartItemImage}/>
                                            <div className={styles.cartItemInfo}>
                                                <span>{item.name}</span>
                                                <small>
                                                     {/* Muestra precio original tachado si hay especial */}
                                                     {item.original_price && item.original_price !== item.price
                                                        ? <>
                                                            <span className={styles.originalPriceSmall}>${item.original_price.toFixed(2)}</span> ${item.price.toFixed(2)}
                                                          </>
                                                        : `$${item.price.toFixed(2)}`
                                                     } c/u
                                                </small>
                                            </div>
                                            {/* Controles de cantidad */}
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
                                                {/* Botón para eliminar item */}
                                                <button onClick={() => removeFromCart(item.id)} className={styles.removeButton} disabled={!canEdit} aria-label={`Quitar ${item.name}`}>
                                                    <TrashIcon />
                                                </button>
                                            </div>
                                            {/* Precio total del item */}
                                            <strong>${(item.price * item.quantity).toFixed(2)}</strong>
                                        </li>
                                    ))}
                                </ul>
                                {/* Muestra el total del carrito */}
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
                                {/* Botón para limpiar fecha/hora */}
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

                        {/* Botón para crear el pedido */}
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

            {/* MODAL PARA CREAR CLIENTE */}
            {isCreatingCustomer && (
                 <div className={styles.modalOverlay}>
                     <div className={styles.modalContent}>
                        <h2>Crear Nuevo Cliente</h2>
                        <form onSubmit={(e) => { e.preventDefault(); handleCreateCustomer(); }}>
                            {/* Campos del formulario */}
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
                                    pattern="\d{10}" // Valida 10 dígitos
                                    title="Ingresa 10 dígitos numéricos"
                                    value={newCustomer.phone}
                                    onChange={e => setNewCustomer({...newCustomer, phone: e.target.value.replace(/\D/g, '')})}
                                    required
                                />
                            </div>
                            {/* Botones de acción del modal */}
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