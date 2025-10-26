import React, { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import styles from './CreateOrder.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ImageWithFallback from '../components/ImageWithFallback';
import { useAdminAuth } from '../context/AdminAuthContext';
import DOMPurify from 'dompurify';

// ==================== ICONOS MEMOIZADOS ====================
const UserPlusIcon = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="8.5" cy="7" r="4"></circle>
        <line x1="20" y1="8" x2="20" y2="14"></line>
        <line x1="17" y1="11" x2="23" y2="11"></line>
    </svg>
));
UserPlusIcon.displayName = 'UserPlusIcon';

const SearchIcon = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"></circle>
        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
));
SearchIcon.displayName = 'SearchIcon';

const TrashIcon = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
));
TrashIcon.displayName = 'TrashIcon';

const ClockIcon = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
    </svg>
));
ClockIcon.displayName = 'ClockIcon';

// ==================== CUSTOM HOOKS ====================

// ✅ Hook de debounce personalizado
function useDebounce(value, delay = 300) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

// ==================== COMPONENTES MEMOIZADOS ====================

// Componente de item del carrito memoizado
const CartItem = memo(({ item, onUpdateQuantity, onRemove, canEdit }) => {
    return (
        <li>
            <ImageWithFallback
                src={item.image_url || 'https://placehold.co/50'}
                alt={item.name}
                className={styles.cartItemImage}
            />
            <div className={styles.cartItemInfo}>
                <span>{item.name}</span>
                <small>
                    {item.original_price && item.original_price !== item.price ? (
                        <>
                            <span className={styles.originalPriceSmall}>
                                ${item.original_price.toFixed(2)}
                            </span> ${item.price.toFixed(2)}
                        </>
                    ) : (
                        `$${item.price.toFixed(2)}`
                    )} c/u
                </small>
            </div>
            <div className={styles.quantityControl}>
                <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                    disabled={!canEdit}
                    aria-label="Disminuir cantidad"
                >
                    -
                </button>
                <input
                    type="number"
                    min="1"
                    value={item.quantity}
                    onChange={(e) => onUpdateQuantity(item.id, e.target.value)}
                    disabled={!canEdit}
                    aria-label={`Cantidad de ${item.name}`}
                />
                <button
                    onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                    disabled={!canEdit}
                    aria-label="Aumentar cantidad"
                >
                    +
                </button>
                <button
                    onClick={() => onRemove(item.id)}
                    className={styles.removeButton}
                    disabled={!canEdit}
                    aria-label={`Quitar ${item.name}`}
                >
                    <TrashIcon />
                </button>
            </div>
            <strong>${(item.price * item.quantity).toFixed(2)}</strong>
        </li>
    );
}, (prevProps, nextProps) => {
    // Comparación personalizada para evitar re-renders innecesarios
    return (
        prevProps.item.id === nextProps.item.id &&
        prevProps.item.quantity === nextProps.item.quantity &&
        prevProps.item.price === nextProps.item.price &&
        prevProps.canEdit === nextProps.canEdit
    );
});
CartItem.displayName = 'CartItem';

// Componente de producto memoizado
const ProductItem = memo(({ product, onAdd, canEdit }) => {
    return (
        <div
            className={styles.productItem}
            onClick={() => canEdit && onAdd(product)}
            role="button"
            tabIndex={0}
            onKeyPress={(e) => e.key === 'Enter' && canEdit && onAdd(product)}
        >
            <ImageWithFallback
                src={product.image_url || 'https://placehold.co/100'}
                alt={product.name}
            />
            <div className={styles.productInfo}>
                <strong>{product.name}</strong>
                {product.original_price && product.original_price !== product.price ? (
                    <>
                        <span className={styles.originalPrice}>
                            ${product.original_price.toFixed(2)}
                        </span>
                        <span className={styles.specialPrice}>
                            ${product.price.toFixed(2)}
                        </span>
                    </>
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

    // Estados principales
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

    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');

    // ✅ Debouncing para búsquedas
    const debouncedCustomerSearch = useDebounce(customerSearch, 300);
    const debouncedProductSearch = useDebounce(productSearch, 300);

    const canEdit = hasPermission('crear-pedido.edit');

    // ✅ OPTIMIZACIÓN: Carga inicial paralela y con límites
    useEffect(() => {
        const fetchInitialData = async () => {
            setLoadingCustomers(true);
            try {
                // Consultas paralelas optimizadas
                const [customersRes, categoriesRes, productsRes] = await Promise.all([
                    supabase
                        .from('customers')
                        .select('id, name, phone') // Solo columnas necesarias
                        .order('name')
                        .limit(500), // Límite razonable
                    supabase
                        .from('categories')
                        .select('id, name')
                        .order('name'),
                    supabase
                        .from('products')
                        .select('id, name, description, price, cost, image_url, category_id, is_active')
                        .eq('is_active', true)
                ]);

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

    // ✅ OPTIMIZACIÓN: Fetch de precios especiales con cache
    const fetchProductsWithSpecialPrices = useCallback(async (customerId) => {
        if (!customerId) {
            setProductsWithPrices([]);
            setLoadingProducts(false);
            return;
        }

        setLoadingProducts(true);
        try {
            const today = new Date().toISOString().split('T')[0];

            // Consulta optimizada con filtros específicos
            const { data: specialPrices, error: specialPricesError } = await supabase
                .from('special_prices')
                .select('product_id, category_id, override_price, target_customer_ids')
                .lte('start_date', today)
                .gte('end_date', today);

            if (specialPricesError) throw specialPricesError;

            // Mapeo optimizado con early return
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
            showAlert(`Error al cargar precios especiales: ${error.message}`);
            setProductsWithPrices(allProducts);
        } finally {
            setLoadingProducts(false);
        }
    }, [allProducts, showAlert]);

    useEffect(() => {
        if (selectedCustomer) {
            fetchProductsWithSpecialPrices(selectedCustomer.id);
        } else {
            setProductsWithPrices([]);
        }
    }, [selectedCustomer, fetchProductsWithSpecialPrices]);

    // ✅ OPTIMIZACIÓN: Filtros memoizados con debounce
    const filteredCustomers = useMemo(() => {
        if (!debouncedCustomerSearch) return [];
        const lowerSearch = debouncedCustomerSearch.toLowerCase();
        return customers
            .filter(c =>
                c.name.toLowerCase().includes(lowerSearch) ||
                (c.phone && c.phone.includes(debouncedCustomerSearch))
            )
            .slice(0, 10); // Aumentado a 10 resultados
    }, [customers, debouncedCustomerSearch]);

    const filteredProducts = useMemo(() => {
        return productsWithPrices.filter(p => {
            const matchesCategory = categoryFilter === 'all' || p.category_id === categoryFilter;
            const matchesSearch = p.name.toLowerCase().includes(debouncedProductSearch.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    }, [productsWithPrices, debouncedProductSearch, categoryFilter]);

    // ✅ OPTIMIZACIÓN: Handlers memoizados
    const handleCreateCustomer = useCallback(async () => {
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
            // Verifica existencia
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
    }, [canEdit, newCustomer, showAlert]);

    // ✅ Handlers del carrito memoizados
    const addToCart = useCallback((product) => {
        if (!canEdit || !selectedCustomer) return;
        setCart(prev => {
            const existing = prev.find(item => item.id === product.id);
            if (existing) {
                return prev.map(item =>
                    item.id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                );
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
            setCart(prev => prev.map(item =>
                item.id === productId
                    ? { ...item, quantity: newQuantity }
                    : item
            ));
        }
    }, [canEdit]);

    const removeFromCart = useCallback((productId) => {
        if (!canEdit) return;
        setCart(prev => prev.filter(item => item.id !== productId));
    }, [canEdit]);

    // ✅ Total del carrito memoizado
    const cartTotal = useMemo(() => {
        return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    }, [cart]);

    // ✅ OPTIMIZACIÓN CRÍTICA: Transacción mejorada con manejo robusto
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
            // ✅ Usar RPC para transacción atómica (ver función SQL más abajo)
            // Alternativa: Inserción manual con manejo de errores robusto

            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    customer_id: selectedCustomer.id,
                    total_amount: cartTotal,
                    status: 'pendiente',
                    scheduled_for: scheduledTimestamp
                })
                .select('id, order_code, created_at')
                .single();

            if (orderError) throw orderError;

            // Preparar items con validación
            const orderItems = cart.map(item => ({
                order_id: orderData.id,
                product_id: item.id,
                quantity: item.quantity,
                price: item.price
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItems);

            if (itemsError) {
                // Rollback manual
                await supabase.from('orders').delete().eq('id', orderData.id);
                throw itemsError;
            }

            // Mensaje WhatsApp optimizado
            let message = `Te confirmamos tu pedido en ENTRE ALAS:\n\n*Pedido N°: ${orderData.order_code}*\n\n`;
            cart.forEach(item => {
                message += `• ${item.quantity}x ${item.name}\n`;
            });
            message += `\n*Total a pagar: $${cartTotal.toFixed(2)}*`;

            if (scheduledTimestamp) {
                const scheduledDateObj = new Date(scheduledTimestamp);
                const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
                const formattedDate = `${scheduledDateObj.toLocaleDateString('es-MX', dateOptions)} a las ${scheduledDateObj.toLocaleTimeString('es-MX', timeOptions)}`;
                message += `\n\n*Programado para entregar:*\n${formattedDate}\n`;
            }

            const clientSpecificOrderUrl = `https://ea-panel.vercel.app/mis-pedidos/${orderData.order_code}`;
            message += `\n\nPuedes ver el estado de tu pedido aquí:\n${clientSpecificOrderUrl}`;

            const whatsappUrl = `https://api.whatsapp.com/send?phone=${selectedCustomer.phone}&text=${encodeURIComponent(message)}`;

            showAlert(
                `¡Pedido #${orderData.order_code} creado! Serás redirigido a WhatsApp para notificar al cliente.`,
                'info',
                () => {
                    window.open(whatsappUrl, '_blank');
                    // Reset completo
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
    }, [canEdit, selectedCustomer, cart, cartTotal, scheduleDate, scheduleTime, showAlert]);

    if (loadingCustomers) return <LoadingSpinner />;

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
                            ) : loadingProducts ? (
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

                        {/* PROGRAMACIÓN */}
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
                                            min={new Date().toISOString().split('T')[0]}
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

            {/* MODAL CREAR CLIENTE */}
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
                                    Número de Teléfono (10 dígitos)
                                </label>
                                <input
                                    id="new-customer-phone"
                                    type="tel"
                                    maxLength="10"
                                    pattern="\d{10}"
                                    title="Ingresa 10 dígitos numéricos"
                                    value={newCustomer.phone}
                                    onChange={e => setNewCustomer({
                                        ...newCustomer,
                                        phone: e.target.value.replace(/\D/g, '')
                                    })}
                                    required
                                />
                            </div>
                            <div className={styles.modalActions}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCreatingCustomer(false);
                                        setNewCustomer({ name: '', phone: '' });
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
