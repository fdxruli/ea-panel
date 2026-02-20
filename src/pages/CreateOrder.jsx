/* src/pages/CreateOrder.jsx (Migrado con Clientes/Productos Básicos) */

import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import styles from './CreateOrder.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ImageWithFallback from '../components/ImageWithFallback';
import { useAdminAuth } from '../context/AdminAuthContext';
import DOMPurify from 'dompurify';

// --- (PASO A) AÑADIR IMPORTS ---
import { useCategoriesCache } from '../hooks/useCategoriesCache';
import { useProductsBasicCache } from '../hooks/useProductsBasicCache';
import { useCustomersBasicCache } from '../hooks/useCustomersBasicCache';
// --- FIN PASO A ---

// ==================== ICONOS MEMOIZADOS (Sin cambios) ====================
const UserPlusIcon = memo(() => ( /* ... (código SVG) ... */ <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="17" y1="11" x2="23" y2="11"></line></svg>));
UserPlusIcon.displayName = 'UserPlusIcon';
const SearchIcon = memo(() => ( /* ... (código SVG) ... */ <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>));
SearchIcon.displayName = 'SearchIcon';
const TrashIcon = memo(() => ( /* ... (código SVG) ... */ <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>));
TrashIcon.displayName = 'TrashIcon';
const ClockIcon = memo(() => ( /* ... (código SVG) ... */ <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>));
ClockIcon.displayName = 'ClockIcon';

// ==================== CUSTOM HOOKS (Sin cambios) ====================
function useDebounce(value, delay = 300) {
    // ... (código existente)
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
}

// ==================== COMPONENTES MEMOIZADOS (Sin cambios) ====================
const CartItem = memo(({ item, onUpdateQuantity, onRemove, canEdit }) => {
    return (
        <li>
            <ImageWithFallback src={item.image_url || 'https://placehold.co/50'} alt={item.name} className={styles.cartItemImage} />
            <div className={styles.cartItemInfo}>
                <span>{item.name}</span>
                <small>
                    {item.original_price && item.original_price !== item.price ? (
                        <><span className={styles.originalPriceSmall}>${item.original_price.toFixed(2)}</span> ${item.price.toFixed(2)}</>
                    ) : (`$${item.price.toFixed(2)}`)} c/u
                </small>
            </div>
            <div className={styles.quantityControl}>
                <button onClick={() => onUpdateQuantity(item.id, item.quantity - 1)} disabled={!canEdit} aria-label="Disminuir cantidad">-</button>
                <input type="number" min="1" value={item.quantity} onChange={(e) => onUpdateQuantity(item.id, e.target.value)} disabled={!canEdit} aria-label={`Cantidad de ${item.name}`} />
                <button onClick={() => onUpdateQuantity(item.id, item.quantity + 1)} disabled={!canEdit} aria-label="Aumentar cantidad">+</button>
                <button onClick={() => onRemove(item.id)} className={styles.removeButton} disabled={!canEdit} aria-label={`Quitar ${item.name}`}><TrashIcon /></button>
            </div>
            <strong>${(item.price * item.quantity).toFixed(2)}</strong>
        </li>
    );
});
CartItem.displayName = 'CartItem';

const ProductItem = memo(({ product, onAdd, canEdit }) => {
    // ... (código existente)
    return (
        <div className={styles.productItem} onClick={() => canEdit && onAdd(product)} role="button" tabIndex={0} onKeyPress={(e) => e.key === 'Enter' && canEdit && onAdd(product)}>
            <ImageWithFallback src={product.image_url || 'https://placehold.co/100'} alt={product.name} />
            <div className={styles.productInfo}>
                <strong>{product.name}</strong>
                {product.original_price && product.original_price !== product.price ? (
                    <><span className={styles.originalPrice}>${product.original_price.toFixed(2)}</span><span className={styles.specialPrice}>${product.price.toFixed(2)}</span></>
                ) : (
                    <span className={styles.price}>${product.price.toFixed(2)}</span>
                )}
            </div>
        </div>
    );
});
ProductItem.displayName = 'ProductItem';

// ==================== COMPONENTE PRINCIPAL ====================

export default function CreateOrder() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth();
    const [step, setStep] = useState(1);
    const [newCustomerCountryCode, setNewCustomerCountryCode] = useState('+52');

    const {
        data: allProductsData,
        isLoading: loadingProducts
    } = useProductsBasicCache();

    const {
        data: customersData,
        isLoading: loadingCustomers,
        refetch: refetchCustomers
    } = useCustomersBasicCache();

    // Corrección para evitar 'null'
    const allProducts = useMemo(() => allProductsData || [], [allProductsData]);
    const customers = useMemo(() => customersData || [], [customersData]);

    // Estado local para productos con precios especiales
    const [productsWithPrices, setProductsWithPrices] = useState([]);
    const [loadingSpecialPrices, setLoadingSpecialPrices] = useState(false); // <-- Nuevo estado
    // --- FIN PASO B ---

    // Categorías (de la Fase 1)
    const { data: categoriesData, isLoading: loadingCategories } = useCategoriesCache();
    const categories = useMemo(() => categoriesData || [], [categoriesData]);

    // Resto de estados locales
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [customerSearch, setCustomerSearch] = useState('');
    const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
    const [newCustomer, setNewCustomer] = useState({ name: '', phone: '' });

    const [productSearch, setProductSearch] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');

    const [cart, setCart] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');

    const debouncedCustomerSearch = useDebounce(customerSearch, 300);
    const debouncedProductSearch = useDebounce(productSearch, 300);

    const canEdit = hasPermission('crear-pedido.edit');

    // --- (PASO C) ELIMINADO: useEffect(fetchInitialData, ...) ---

    // --- (PASO D) Modificar fetchProductsWithSpecialPrices ---
    const fetchProductsWithSpecialPrices = useCallback(async (customerId) => {
        if (!customerId) {
            setProductsWithPrices([]);
            setLoadingSpecialPrices(false); // <-- CAMBIADO
            return;
        }
        setLoadingSpecialPrices(true); // <-- CAMBIADO
        try {
            const today = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

            const { data: specialPrices, error: specialPricesError } = await supabase
                .from('special_prices')
                .select('product_id, category_id, override_price, target_customer_ids')
                .lte('start_date', today)
                .gte('end_date', today);

            if (specialPricesError) throw specialPricesError;

            // Mapear sobre allProducts (que viene del caché)
            const customerSpecificProducts = allProducts.map(product => {
                const productPrice = specialPrices?.find(p => p.product_id === product.id);
                const categoryPrice = !productPrice && specialPrices?.find(
                    p => p.category_id === product.category_id && !p.product_id
                );
                const specialPriceInfo = productPrice || categoryPrice;
                if (specialPriceInfo &&
                    (!specialPriceInfo.target_customer_ids ||
                        specialPriceInfo.target_customer_ids.includes(customerId))) {
                    return {
                        ...product,
                        original_price: product.price,
                        price: parseFloat(specialPriceInfo.override_price)
                    };
                }
                return product;
            });
            setProductsWithPrices(customerSpecificProducts);
        } catch (error) {
            console.error('Error fetching special prices:', error);
            showAlert(`Error al cargar precios especiales: ${error.message}`);
            setProductsWithPrices(allProducts); // Fallback
        } finally {
            setLoadingSpecialPrices(false); // <-- CAMBIADO
        }
    }, [allProducts, showAlert]); // <-- 'allProducts' (del useMemo) es la dependencia
    // --- FIN PASO D ---

    useEffect(() => {
        if (selectedCustomer) {
            fetchProductsWithSpecialPrices(selectedCustomer.id);
        } else {
            setProductsWithPrices([]);
        }
    }, [selectedCustomer, fetchProductsWithSpecialPrices]);

    // --- (PASO F) Filtro de clientes (MANTENIDO) ---
    const filteredCustomers = useMemo(() => {
        if (!debouncedCustomerSearch) return [];
        const lowerSearch = debouncedCustomerSearch.toLowerCase();
        return customers
            .filter(c =>
                c.name.toLowerCase().includes(lowerSearch) ||
                (c.phone && c.phone.includes(debouncedCustomerSearch))
            )
            .slice(0, 10);
    }, [customers, debouncedCustomerSearch]);

    // Filtro de productos (sin cambios)
    const filteredProducts = useMemo(() => {
        return productsWithPrices.filter(p => {
            const matchesCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
            const matchesSearch = p.name.toLowerCase().includes(debouncedProductSearch.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [productsWithPrices, debouncedProductSearch, categoryFilter]);

    const handleCreateCustomer = useCallback(async () => {
        if (!canEdit) return;
        const cleanName = DOMPurify.sanitize(newCustomer.name.trim());
        const cleanPhone = DOMPurify.sanitize(newCustomer.phone.trim().replace(/\D/g, ''));

        if (!cleanName || !cleanPhone) {
            showAlert('El nombre y el teléfono son obligatorios.');
            return;
        }
        if (cleanPhone.length < 8 || cleanPhone.length > 15) {
            showAlert('El teléfono debe tener entre 8 y 15 dígitos válidos.');
            return;
        }

        // Combinar Lada + Teléfono
        const finalPhone = `${newCustomerCountryCode}${cleanPhone}`;

        setIsSubmitting(true);
        try {
            // Verificar existencia usando el número completo
            const { data: existingCustomer, error: checkError } = await supabase.from('customers').select('id').eq('phone', finalPhone).maybeSingle();
            if (checkError) throw checkError;

            if (existingCustomer) {
                showAlert('Ya existe un cliente con este número de teléfono.');
                setIsSubmitting(false);
                return;
            }

            // Guardar con Lada
            const { data, error } = await supabase.from('customers').insert({ name: cleanName, phone: finalPhone }).select().single();
            if (error) throw error;

            showAlert('Cliente creado con éxito.');
            refetchCustomers(); // Actualizar caché

            setSelectedCustomer(data);
            setStep(2);
            setIsCreatingCustomer(false);
            setNewCustomer({ name: '', phone: '' });
            setNewCustomerCountryCode('+52'); // Resetear a default
        } catch (error) {
            showAlert(`Error al crear cliente: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    }, [canEdit, newCustomer, newCustomerCountryCode, showAlert, refetchCustomers]);

    const addToCart = useCallback((product) => {
        if (!canEdit || !selectedCustomer) return;
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
            }
            return [...prev, { ...product, quantity: 1 }];
        });
    }, [canEdit, selectedCustomer]);

    const updateQuantity = useCallback((productId, newQuantityStr) => {
        if (!canEdit) return;
        const newQuantity = parseInt(newQuantityStr, 10);
        if (isNaN(newQuantity) || newQuantity <= 0) {
            setCart(prev => prev.filter(item => item.id !== productId));
        } else {
            setCart(prev => prev.map(item => item.id === productId ? { ...item, quantity: newQuantity } : item));
        }
    }, [canEdit]);

    const removeFromCart = useCallback((productId) => {
        if (!canEdit) return;
        setCart(prev => prev.filter(item => item.id !== productId));
    }, [canEdit]);

    const cartTotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [cart]);

    const handlePlaceOrder = useCallback(async () => {
        if (!canEdit || !selectedCustomer || cart.length === 0) {
            showAlert('Debes seleccionar un cliente y añadir al menos un producto.');
            return;
        }

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
            scheduledTimestamp = scheduledDateObj.toISOString();
        }

        setIsSubmitting(true);

        try {
            // --- INICIO DE LA MODIFICACIÓN ---

            // 1. Mapear el carrito al formato que espera la RPC ('cart_item[]')
            const p_cart_items = cart.map(item => ({
                product_id: item.id,
                quantity: item.quantity,
                price: item.price,
                cost: item.cost // El 'cost' se guarda al crear el producto
            }));

            // 2. Llamar a la RPC en lugar de .insert()
            const { data: orderData, error: rpcError } = await supabase.rpc('create_order_with_stock_check', {
                p_customer_id: selectedCustomer.id,
                p_total_amount: cartTotal,
                p_scheduled_for: scheduledTimestamp,
                p_cart_items: p_cart_items
            });

            if (rpcError) {
                // Si la RPC falla (ej: por stock), el error vendrá aquí
                throw rpcError;
            }

            // La RPC nos devuelve el pedido creado, pero en un array
            const newOrder = orderData[0];
            if (!newOrder) {
                throw new Error('La RPC no devolvió la información del pedido creado.');
            }

            // 3. El resto de la lógica (notificación por WhatsApp)
            let message = `Te confirmamos tu pedido en *ENTRE ALAS*:\n\n*Pedido N°: ${newOrder.order_code}*\n\n*Detalle del pedido:*\n`;
            
            cart.forEach(item => { 
                const subtotal = item.quantity * item.price;
                message += `• ${item.name}\n`;
                message += `  ${item.quantity} x $${item.price.toFixed(2)} = $${subtotal.toFixed(2)}\n`; 
            });

            // Cálculo de la comisión de Clip (3.6% + 16% IVA = 4.176%)
            const clipCommission = cartTotal * 0.04176;
            const totalWithCard = cartTotal + clipCommission;

            message += `\n*Total en Efectivo / Transferencia: $${cartTotal.toFixed(2)}*`;

            if (scheduledTimestamp) {
                const scheduledDateObj = new Date(scheduledTimestamp);
                const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
                const formattedDate = `${scheduledDateObj.toLocaleDateString('es-MX', dateOptions)} a las ${scheduledDateObj.toLocaleTimeString('es-MX', timeOptions)}`;
                message += `\n\n*Programado para entregar:*\n${formattedDate}\n`;
            }

            // Leyenda clara y objetiva al final
            message += `\n\n*Métodos de pago aceptados:*\n`;
            message += `💵 Efectivo\n`;
            message += `📱 Transferencia\n`;
            message += `💳 Tarjeta (Incluye 4.18% de cargo por servicio).`;
            message += `\n*Total pagando con Tarjeta: $${totalWithCard.toFixed(2)}*`;

            const clientSpecificOrderUrl = `https://ea-panel.vercel.app/mis-pedidos/${newOrder.order_code}`;
            message += `\n\nPuedes ver el estado de tu pedido aquí:\n${clientSpecificOrderUrl}`;

            const whatsappUrl = `https://api.whatsapp.com/send?phone=${selectedCustomer.phone}&text=${encodeURIComponent(message)}`;

            showAlert(
                `¡Pedido #${newOrder.order_code} creado! Serás redirigido a WhatsApp para notificar al cliente.`,
                'info',
                () => {
                    window.open(whatsappUrl, '_blank');
                    // Resetear el formulario
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
            // ¡Aquí capturamos el error de stock!
            if (error.message.includes('Stock insuficiente')) {
                showAlert(`Error de Stock: ${error.message}`, 'error');
            } else {
                showAlert(`Error al crear el pedido: ${error.message}`, 'error');
            }
        } finally {
            setIsSubmitting(false);
        }
    }, [canEdit, selectedCustomer, cart, cartTotal, scheduleDate, scheduleTime, showAlert, categories]); // Asegúrate de que 'categories' esté si 'allProducts' depende de él.

    // --- (PASO E) AJUSTAR LOADING ---
    if (loadingCustomers || loadingProducts || loadingCategories) return <LoadingSpinner />;

    // ==================== RENDERIZADO ====================
    return (
        <div className={styles.container}>
            <h1>Crear Nuevo Pedido</h1>

            <div className={styles.mainGrid}>
                {/* PASO 1: SELECCIONAR CLIENTE */}
                <div className={styles.workflowColumn}>
                    <div className={`${styles.stepCard} ${step >= 1 ? styles.active : ''}`}>
                        <div className={styles.stepHeader}>
                            <span className={styles.stepNumber}>1</span>
                            <h2>Seleccionar Cliente</h2>
                        </div>
                        {selectedCustomer ? (
                            <div className={styles.selectedCustomer}>
                                <p><strong>Cliente:</strong> {selectedCustomer.name}</p>
                                <p><strong>Teléfono:</strong> {selectedCustomer.phone}</p>
                                <button
                                    onClick={() => {
                                        if (canEdit) {
                                            setSelectedCustomer(null);
                                            setStep(1);
                                            setCart([]);
                                            setProductsWithPrices([]);
                                            setScheduleDate('');
                                            setScheduleTime('');
                                        }
                                    }}
                                    className={styles.changeButton}
                                    disabled={!canEdit}
                                >
                                    Cambiar Cliente
                                </button>
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
                                        {/* 'filteredCustomers' ahora usa 'customers' del hook */}
                                        {filteredCustomers.map(c => (
                                            <li
                                                key={c.id}
                                                onClick={() => {
                                                    if (canEdit) {
                                                        setSelectedCustomer(c);
                                                        setStep(2);
                                                        setCustomerSearch('');
                                                    }
                                                }}
                                            >
                                                {c.name} - {c.phone || 'Sin teléfono'}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                {customerSearch && !filteredCustomers.length && (
                                    <p className={styles.noResults}>No se encontraron clientes.</p>
                                )}
                                <p className={styles.orText}>o</p>
                                <button
                                    onClick={() => setIsCreatingCustomer(true)}
                                    className={styles.createCustomerButton}
                                    disabled={!canEdit}
                                >
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
                            <select
                                onChange={(e) => setCategoryFilter(e.target.value)}
                                disabled={!selectedCustomer || !canEdit}
                                value={categoryFilter}
                            >
                                <option value="all">Todas las categorías</option>
                                {/* 'categories' viene del hook */}
                                {categories.map(c => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className={styles.productList}>
                            {!selectedCustomer ? (
                                <p className={styles.disabledText}>
                                    Selecciona un cliente para ver los productos.
                                </p>
                            ) : loadingSpecialPrices ? ( // <-- Usa el loading de precios
                                <LoadingSpinner />
                            ) : filteredProducts.length === 0 ? (
                                <p className={styles.disabledText}>
                                    No se encontraron productos con los filtros actuales.
                                </p>
                            ) : (
                                filteredProducts.map(p => (
                                    <ProductItem
                                        key={p.id}
                                        product={p}
                                        onAdd={addToCart}
                                        canEdit={canEdit}
                                    />
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* RESUMEN DEL PEDIDO */}
                <div className={styles.summaryColumn}>
                    <div className={styles.summaryCard}>
                        <h3>Resumen del Pedido</h3>
                        {cart.length === 0 ? (
                            <p className={styles.emptyCart}>Añade productos al carrito.</p>
                        ) : (
                            <>
                                <ul className={styles.cartList}>
                                    {cart.map(item => (
                                        <CartItem
                                            key={item.id}
                                            item={item}
                                            onUpdateQuantity={updateQuantity}
                                            onRemove={removeFromCart}
                                            canEdit={canEdit}
                                        />
                                    ))}
                                </ul>
                                <div className={styles.total}>
                                    <span>Total</span>
                                    <strong>${cartTotal.toFixed(2)}</strong>
                                </div>
                            </>
                        )}

                        {/* PROGRAMACIÓN (Sin cambios) */}
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
                                            min={new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0]}
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
                                        onClick={() => {
                                            setScheduleDate('');
                                            setScheduleTime('');
                                        }}
                                        className={styles.clearScheduleButton}
                                    >
                                        Limpiar Programación
                                    </button>
                                )}
                            </div>
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

            {/* MODAL CREAR CLIENTE (Sin cambios) */}
            {isCreatingCustomer && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h2>Crear Nuevo Cliente</h2>
                        <form onSubmit={(e) => {
                            e.preventDefault();
                            handleCreateCustomer();
                        }}>
                            <div className={styles.formGroup}>
                                <label htmlFor="new-customer-name">Nombre Completo</label>
                                <input
                                    id="new-customer-name"
                                    type="text"
                                    value={newCustomer.name}
                                    onChange={e => setNewCustomer({
                                        ...newCustomer,
                                        name: e.target.value
                                    })}
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="new-customer-phone">
                                    Número de Teléfono
                                </label>
                                {/* Usamos la nueva clase contenedora */}
                                <div className={styles.phoneContainer}>
                                    <select
                                        value={newCustomerCountryCode}
                                        onChange={(e) => setNewCustomerCountryCode(e.target.value)}
                                        className={styles.countrySelect} // <--- AQUI aplicamos la clase nueva
                                    >
                                        <option value="+52">🇲🇽 +52</option>
                                        <option value="+1">🇺🇸 +1</option>
                                    </select>

                                    <input
                                        id="new-customer-phone"
                                        type="tel"
                                        maxLength="15"
                                        pattern="\d{8,15}"
                                        placeholder="Ej. 9631234567"
                                        title="Ingresa entre 8 y 15 dígitos numéricos"
                                        value={newCustomer.phone}
                                        onChange={e => setNewCustomer({
                                            ...newCustomer,
                                            phone: e.target.value.replace(/\D/g, '')
                                        })}
                                        required
                                        // Asegúrate que el input tenga su clase si la necesita, o déjalo como estaba
                                        style={{ flex: 1 }}
                                    />
                                </div>
                            </div>
                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCreatingCustomer(false);
                                        setNewCustomer({ name: '', phone: '' });
                                        setNewCustomerCountryCode('+52');
                                    }}
                                    className="admin-button-secondary"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    className="admin-button-primary"
                                    disabled={isSubmitting}
                                >
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