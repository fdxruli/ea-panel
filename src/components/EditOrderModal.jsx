import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './EditOrderModal.module.css';
import LoadingSpinner from './LoadingSpinner';
import { useAlert } from '../context/AlertContext';
import ImageWithFallback from './ImageWithFallback';
import DeliveryInfoModal from './DeliveryInfoModal';

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
);
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>;

const getLocalYYYYMMDD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const formatDateForInput = (isoString) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        return getLocalYYYYMMDD(date);
    } catch (e) { return ''; }
};

const formatTimeForInput = (isoString) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    } catch (e) { return ''; }
};

const getItemsSignature = (items) => {
    if (!items || items.length === 0) return '';
    return items
        .map(i => `${i.product_id}-${i.quantity}-${i.price}`)
        .sort()
        .join('|');
};

export default function EditOrderModal({ order, onClose, onOrderUpdated }) {
    const { showAlert } = useAlert();
    const [orderItems, setOrderItems] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [customerAddresses, setCustomerAddresses] = useState([]);
    const [selectedAddressId, setSelectedAddressId] = useState('');
    const [initialAddressId, setInitialAddressId] = useState('');
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState('current');
    const [searchTerm, setSearchTerm] = useState('');
    const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
    const [deliveryInfo, setDeliveryInfo] = useState(null);
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    const [originalItemsSignature, setOriginalItemsSignature] = useState('');

    // ➕ NUEVO: Estado para controlar el acordeón (inicia cerrado para ahorrar espacio)
    const [isDeliveryOpen, setIsDeliveryOpen] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const productsPromise = supabase.from('products').select('*').eq('is_active', true);
                const addressesPromise = supabase.from('customer_addresses').select('*').eq('customer_id', order.customer_id);
                const [productsRes, addressesRes] = await Promise.all([productsPromise, addressesPromise]);

                if (productsRes.error) throw productsRes.error;
                if (addressesRes.error) throw addressesRes.error;

                setAllProducts((productsRes.data || []).filter(p => {
                    return p.id && p.name && p.price !== null && p.price !== undefined;
                }));

                setCustomerAddresses(addressesRes.data || []);
                const defaultAddress = addressesRes.data.find(a => a.is_default) || addressesRes.data[0];
                const currentAddressId = defaultAddress?.id || '';
                setSelectedAddressId(currentAddressId);
                setInitialAddressId(currentAddressId);

                const initialItems = order.order_items.map(item => ({
                    product_id: item.product_id,
                    id: item.product_id,
                    name: item.products?.name || 'Producto Desconocido',
                    price: Number(item.price) || 0,
                    image_url: item.products?.image_url || '', quantity: item.quantity,
                    original_item_id: item.id,
                }));

                setOrderItems(initialItems);
                setOriginalItemsSignature(getItemsSignature(initialItems));
                setScheduleDate(formatDateForInput(order.scheduled_for));
                setScheduleTime(formatTimeForInput(order.scheduled_for));
            } catch (error) {
                console.error("Error fetching data:", error);
                showAlert('Hubo un error al cargar los datos para la edición.');
                onClose();
            } finally {
                setLoading(false);
            }
        };

        if (order) {
            fetchData();
        }
    }, [order, onClose, showAlert]);

    useEffect(() => {
        const newTotal = orderItems.reduce((sum, item) => {
            const price = item.price || 0;
            return sum + (price * item.quantity);
        }, 0);
        setTotal(newTotal);
    }, [orderItems]);

    const handleShowDeliveryInfo = () => {
        const selectedAddress = customerAddresses.find(addr => addr.id === selectedAddressId);
        if (selectedAddress && order.customers) {
            setDeliveryInfo({
                customer: order.customers,
                address: selectedAddress
            });
            setIsDeliveryModalOpen(true);
        } else {
            showAlert("No se encontró la dirección o los datos del cliente.");
        }
    };

    const updateQuantity = (productId, newQuantity) => {
        const numQuantity = parseInt(newQuantity, 10);
        if (isNaN(numQuantity) || numQuantity <= 0) {
            removeItem(productId);
            return;
        }
        setOrderItems(prevItems => prevItems.map(item => item.product_id === productId ? { ...item, quantity: numQuantity } : item
        ));
    };

    const removeItem = (productId) => {
        setOrderItems(prevItems => prevItems.filter(item => item.product_id !== productId));
    };

    const addProduct = (product) => {
        const existingItem = orderItems.find(item => item.product_id === product.id);
        if (existingItem) {
            setOrderItems(prevItems =>
                prevItems.map(item =>
                    item.product_id === product.id
                        ? { ...item, quantity: item.quantity + 1 }
                        : item
                )
            );
        } else {
            setOrderItems(prevItems => [...prevItems, {
                product_id: product.id,
                id: product.id,
                name: product.name,
                price: product.price,
                image_url: product.image_url,
                quantity: 1,
            }]);
            showAlert(`${product.name} añadido al pedido.`, 'success');
        }
        // En móvil regresamos a la pestaña actual después de añadir
        if (window.innerWidth < 768) setActiveTab('current');
    };

    const handleUpdateOrder = async () => {
        if (orderItems.length === 0) {
            showAlert("No puedes dejar el pedido vacío. Cancélalo si es necesario.");
            return;
        }

        let scheduledTimestamp = null;
        if (scheduleDate || scheduleTime) {
            if (!scheduleDate || !scheduleTime) {
                showAlert("Debes seleccionar tanto fecha como hora si deseas programar.");
                return;
            }
            const dateTimeString = `${scheduleDate}T${scheduleTime}:00`;
            const scheduledDateObj = new Date(dateTimeString);
            if (isNaN(scheduledDateObj.getTime())) {
                showAlert('La fecha u hora de programación no es válida.');
                return;
            }
            const now = new Date();
            if (scheduledDateObj <= now) {
                showAlert('La hora programada debe ser posterior a la hora actual.');
                return;
            }
            scheduledTimestamp = scheduledDateObj.toISOString();
        } else {
            scheduledTimestamp = null;
        }

        setIsSubmitting(true);
        try {
            if (selectedAddressId && selectedAddressId !== initialAddressId) {
                await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', order.customer_id);
                await supabase.from('customer_addresses').update({ is_default: true }).eq('id', selectedAddressId);
                setInitialAddressId(selectedAddressId);
            }

            const currentSignature = getItemsSignature(orderItems);
            const itemsChanged = currentSignature !== originalItemsSignature;

            if (itemsChanged) {
                await supabase.from('order_items').delete().eq('order_id', order.id);
                const newOrderItems = orderItems.map(item => {
                    if (!item.product_id) throw new Error(`Error de integridad: Producto sin ID detectado (${item.name})`);
                    return {
                        order_id: order.id,
                        product_id: item.product_id,
                        quantity: item.quantity,
                        price: item.price,
                    };
                });
                const { error: insertError } = await supabase.from('order_items').insert(newOrderItems);
                if (insertError) throw insertError;
            }

            await supabase.from('orders').update({
                total_amount: total,
                scheduled_for: scheduledTimestamp
            }).eq('id', order.id);

            showAlert("¡Pedido actualizado con éxito!", 'success');
            onOrderUpdated();
            onClose();
        } catch (error) {
            showAlert(`Error al actualizar: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const availableProducts = useMemo(() => {
        const currentIds = new Set(orderItems.map(i => i.product_id));
        return allProducts
            .filter(p => !currentIds.has(p.id) && p.price != null)
            .filter(p => p.name?.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [allProducts, orderItems, searchTerm]);

    return (
        <>
            <div className={styles.modalOverlay}>
                <div className={`${styles.modalContent} ${activeTab === 'add' ? styles.addMode : ''}`}>
                    <div className={styles.header}>
                        <h2>Editando Pedido #{order.order_code}</h2>
                        <button onClick={onClose} className={styles.closeButton}>×</button>
                    </div>

                    {loading ? <LoadingSpinner /> : (
                        <>
                            {/* ➕ NUEVO: Estructura del Acordeón */}
                            <div className={styles.deliveryAccordion}>
                                <button
                                    type="button"
                                    className={styles.accordionTrigger}
                                    onClick={() => setIsDeliveryOpen(!isDeliveryOpen)}
                                >
                                    <span>Dirección y Programación</span>
                                    <svg className={`${styles.chevron} ${isDeliveryOpen ? styles.open : ''}`} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="6 9 12 15 18 9"></polyline>
                                    </svg>
                                </button>

                                <div className={`${styles.accordionContent} ${isDeliveryOpen ? styles.open : ''}`}>
                                    {/* Tu contenedor original va aquí dentro */}
                                    <div className={styles.infoCardsContainer}>
                                        <div className={styles.infoCard}>
                                            <label htmlFor="address-select"><MapPinIcon /> Dirección</label>
                                            <div className={styles.deliveryInfoControls}>
                                                <select
                                                    id="address-select"
                                                    value={selectedAddressId}
                                                    onChange={(e) => setSelectedAddressId(e.target.value)}
                                                    disabled={customerAddresses.length === 0}
                                                >
                                                    {customerAddresses.length > 0 ? (
                                                        customerAddresses.map(addr => (
                                                            <option key={addr.id} value={addr.id}>
                                                                {addr.label} - {addr.address_reference || 'Sin ref'}
                                                            </option>))
                                                    ) : (
                                                        <option value="">Sin direcciones</option>
                                                    )}
                                                </select>
                                                <button type="button" onClick={handleShowDeliveryInfo} className={styles.viewAddressButton} disabled={!selectedAddressId}>
                                                    Mapa
                                                </button>
                                            </div>
                                        </div>
                                        <div className={styles.infoCard}>
                                            <label><ClockIcon /> Programación</label>
                                            <div className={styles.scheduleInputs}>
                                                <input
                                                    type="date"
                                                    value={scheduleDate}
                                                    onChange={e => setScheduleDate(e.target.value)}
                                                    min={getLocalYYYYMMDD(new Date())}
                                                />
                                                <input
                                                    type="time"
                                                    value={scheduleTime}
                                                    onChange={e => setScheduleTime(e.target.value)}
                                                />
                                            </div>
                                            {(scheduleDate || scheduleTime) && (
                                                <button type="button" onClick={() => { setScheduleDate(''); setScheduleTime(''); }} className={styles.clearScheduleButton}>
                                                    Quitar programación
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className={styles.tabs}>
                                <button onClick={() => setActiveTab('current')} className={activeTab === 'current' ? styles.active : ''}>
                                    Detalle ({orderItems.length})
                                </button>
                                <button onClick={() => setActiveTab('add')} className={activeTab === 'add' ? styles.active : ''}>
                                    + Añadir
                                </button>
                            </div>

                            <div className={styles.contentBody}>
                                <div className={styles.itemsList}>
                                    {orderItems.length > 0 ? orderItems.map(item => (
                                        <div key={item.id || item.original_item_id} className={styles.cartItem}>
                                            <ImageWithFallback src={item.image_url || 'https://placehold.co/80'} alt={item.name} />
                                            <div className={styles.itemInfo}>                        <span className={styles.itemName}>{item.name}</span>
                                                <span className={styles.itemPrice}>${(item.price || 0).toFixed(2)}</span>
                                            </div>
                                            <div className={styles.itemActions}>
                                                {item.quantity <= 1 ? (
                                                    <button onClick={() => removeItem(item.product_id)} className={`${styles.quantityButton} ${styles.deleteButton}`}>
                                                        <TrashIcon />
                                                    </button>
                                                ) : (
                                                    <button onClick={() => updateQuantity(item.product_id, item.quantity - 1)} className={styles.quantityButton}>-</button>
                                                )}
                                                <span className={styles.quantityDisplay}>{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.product_id, item.quantity + 1)} className={styles.quantityButton}>+</button>
                                            </div>
                                        </div>
                                    )) : <p className={styles.emptyMessage}>El pedido está vacío.</p>}
                                </div>
                                <div className={styles.addProductSection}>
                                    <input type="text" placeholder="Buscar producto para añadir..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={styles.searchInput} />
                                    <div className={styles.productList}>
                                        {availableProducts.length > 0 ? availableProducts.map(product => (
                                            <div key={product.id} className={styles.productCard} onClick={() => addProduct(product)} role="button">
                                                <ImageWithFallback src={product.image_url || 'https://placehold.co/150'} alt={product.name} />
                                                <div className={styles.productInfo}>
                                                    <span>{product.name}</span>
                                                    <strong>${(product.price || 0).toFixed(2)}</strong>
                                                </div>
                                            </div>
                                        )) : <p className={styles.emptyMessage}>No hay productos disponibles.</p>}
                                    </div>
                                </div>
                            </div>

                            <div className={styles.footer}>
                                <div className={styles.totalContainer}>
                                    <span>Total Pedido</span>
                                    <strong>${total.toFixed(2)}</strong>
                                </div>
                                <button onClick={handleUpdateOrder} disabled={isSubmitting} className={styles.updateButton}>
                                    {isSubmitting ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {isDeliveryModalOpen && (
                <DeliveryInfoModal
                    isOpen={isDeliveryModalOpen} onClose={() => setIsDeliveryModalOpen(false)}
                    deliveryInfo={deliveryInfo}
                />
            )}
        </>
    );
}
