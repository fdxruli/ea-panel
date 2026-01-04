import React, { useState, useEffect, useMemo, useRef } from 'react'; // Agregamos useRef
import { supabase } from '../lib/supabaseClient';
import styles from './EditOrderModal.module.css';
import LoadingSpinner from './LoadingSpinner';
import { useAlert } from '../context/AlertContext';
import ImageWithFallback from './ImageWithFallback';
import DeliveryInfoModal from './DeliveryInfoModal';

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>;

// Función auxiliar para fecha local (Misma corrección anterior)
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

// --- HELPER PARA DETECTAR CAMBIOS EN PRODUCTOS ---
// Genera una "firma" única de los items para saber si cambiaron
const getItemsSignature = (items) => {
    if (!items || items.length === 0) return '';
    // Ordenamos y concatenamos ID-CANTIDAD-PRECIO para comparar
    return items
        .map(i => `${i.product_id || i.id}-${i.quantity}-${i.price}`)
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

    // Estado para guardar la "firma" original de los items
    const [originalItemsSignature, setOriginalItemsSignature] = useState('');

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const productsPromise = supabase.from('products').select('*').eq('is_active', true);
                const addressesPromise = supabase.from('customer_addresses').select('*').eq('customer_id', order.customer_id);

                const [productsRes, addressesRes] = await Promise.all([productsPromise, addressesPromise]);

                if (productsRes.error) throw productsRes.error;
                if (addressesRes.error) throw addressesRes.error;

                setAllProducts(productsRes.data || []);
                setCustomerAddresses(addressesRes.data || []);

                const defaultAddress = addressesRes.data.find(a => a.is_default) || addressesRes.data[0];
                const currentAddressId = defaultAddress?.id || '';
                setSelectedAddressId(currentAddressId);
                setInitialAddressId(currentAddressId);

                const initialItems = order.order_items.map(item => ({
                    ...item.products,
                    original_item_id: item.id,
                    product_id: item.product_id, // Importante: asegurar este ID
                    quantity: item.quantity,
                    price: item.price,
                }));
                
                setOrderItems(initialItems);
                // Guardamos la firma inicial para comparar después
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
        const newTotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
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
        };
        setOrderItems(prevItems => prevItems.map(item =>
            item.id === productId ? { ...item, quantity: numQuantity } : item
        ));
    };
    
    const removeItem = (productId) => {
         setOrderItems(prevItems => prevItems.filter(item => item.id !== productId));
    };
    
    const addProduct = (product) => {
         const existingItem = orderItems.find(item => item.id === product.id);
        if (existingItem) {
            setOrderItems(prevItems =>
                prevItems.map(item =>
                    item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                )
            );
        } else {
            // Aseguramos que product_id se guarde correctamente
            setOrderItems(prevItems => [...prevItems, { ...product, quantity: 1, product_id: product.id }]);
            showAlert(`${product.name} añadido al pedido.`);
        }
        setActiveTab('current');
    };

    const handleUpdateOrder = async () => {
        if (orderItems.length === 0) {
            showAlert("No puedes dejar el pedido vacío. Cancélalo si es necesario.");
            return;
        }

        // --- VALIDACIÓN FECHA/HORA (Misma lógica corregida) ---
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
            // 1. Actualizar dirección si cambió
            if (selectedAddressId && selectedAddressId !== initialAddressId) {
                await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', order.customer_id);
                await supabase.from('customer_addresses').update({ is_default: true }).eq('id', selectedAddressId);
                setInitialAddressId(selectedAddressId);
            }

            // 2. DETECCIÓN INTELIGENTE DE CAMBIOS EN PRODUCTOS
            const currentSignature = getItemsSignature(orderItems);
            const itemsChanged = currentSignature !== originalItemsSignature;

            if (itemsChanged) {
                console.log('📦 Cambios detectados en productos. Actualizando items...');
                
                // Borrar items anteriores
                await supabase.from('order_items').delete().eq('order_id', order.id);
                
                // Preparar nuevos items con protección de IDs
                const newOrderItems = orderItems.map(item => {
                    const finalProductId = item.product_id || item.id;
                    if (!finalProductId) {
                         throw new Error(`Error de integridad: Producto sin ID detectado (${item.name})`);
                    }
                    return {
                        order_id: order.id,
                        product_id: finalProductId, 
                        quantity: item.quantity,
                        price: item.price,
                    };
                });
                
                // Insertar nuevos items
                const { error: insertError } = await supabase.from('order_items').insert(newOrderItems);
                if (insertError) throw insertError;
                
            } else {
                console.log('⚡ Sin cambios en productos. Saltando actualización de items.');
            }

            // 3. Actualizar datos de la cabecera (Total y Horario)
            // Siempre actualizamos esto por si cambió el horario o el total
            await supabase.from('orders').update({
                total_amount: total,
                scheduled_for: scheduledTimestamp
            }).eq('id', order.id);

            showAlert("¡Pedido actualizado con éxito!", 'success'); // Agregado tipo success
            onOrderUpdated();
            onClose();

        } catch (error) {
            console.error("Error al actualizar el pedido:", error);
            showAlert(`Error al actualizar: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const availableProducts = useMemo(() => {
        const currentIds = new Set(orderItems.map(i => i.id));
        return allProducts
            .filter(p => !currentIds.has(p.id))
            .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
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
                             <div className={styles.deliveryInfoSection}>
                                <label htmlFor="address-select">Dirección de Entrega</label>
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
                                                    {addr.label} - {addr.address_reference || 'Sin referencia'}
                                                </option>
                                            ))
                                        ) : (
                                            <option value="">El cliente no tiene direcciones.</option>
                                        )}
                                    </select>
                                    <button type="button" onClick={handleShowDeliveryInfo} className={styles.viewAddressButton} disabled={!selectedAddressId}>
                                        Ver Mapa
                                    </button>
                                </div>
                            </div>

                            <div className={styles.scheduleSection}>
                                <label><ClockIcon/> Programar Entrega (Opcional)</label>
                                <div className={styles.scheduleInputs}>
                                    <input
                                        type="date"
                                        value={scheduleDate}
                                        onChange={e => setScheduleDate(e.target.value)}
                                        min={getLocalYYYYMMDD(new Date())} 
                                        aria-label="Fecha de programación"
                                    />
                                    <input
                                        type="time"
                                        value={scheduleTime}
                                        onChange={e => setScheduleTime(e.target.value)}
                                        aria-label="Hora de programación"
                                    />
                                </div>
                                {(scheduleDate || scheduleTime) && (
                                     <button type="button" onClick={() => { setScheduleDate(''); setScheduleTime(''); }} className={styles.clearScheduleButton}>
                                         Limpiar Programación
                                     </button>
                                )}
                            </div>

                            <div className={styles.tabs}>
                                <button onClick={() => setActiveTab('current')} className={activeTab === 'current' ? styles.active : ''}>
                                    Pedido Actual ({orderItems.length})
                                </button>
                                <button onClick={() => setActiveTab('add')} className={activeTab === 'add' ? styles.active : ''}>
                                    Añadir Productos
                                </button>
                            </div>
                            <div className={`${styles.contentBody}`}>
                                <div className={styles.itemsList}>
                                    {orderItems.length > 0 ? orderItems.map(item => (
                                        <div key={item.id || item.original_item_id} className={styles.cartItem}>
                                            <ImageWithFallback src={item.image_url || 'https://placehold.co/80'} alt={item.name} />
                                            <div className={styles.itemInfo}>
                                                <span className={styles.itemName}>{item.name}</span>
                                                <span className={styles.itemPrice}>${item.price.toFixed(2)}</span>
                                            </div>
                                            <div className={styles.itemActions}>
                                                {item.quantity <= 1 ? (
                                                    <button onClick={() => removeItem(item.id)} className={`${styles.quantityButton} ${styles.deleteButton}`}>
                                                        <TrashIcon />
                                                    </button>
                                                ) : (
                                                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className={styles.quantityButton}>-</button>
                                                )}
                                                <span className={styles.quantityDisplay}>{item.quantity}</span>
                                                <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className={styles.quantityButton}>+</button>
                                            </div>
                                        </div>
                                    )) : <p className={styles.emptyMessage}>Añade productos al pedido.</p>}
                                </div>

                                <div className={styles.addProductSection}>
                                    <input type="text" placeholder="Buscar producto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={styles.searchInput} />
                                    <div className={styles.productList}>
                                        {availableProducts.length > 0 ? availableProducts.map(product => (
                                            <div key={product.id} className={styles.productCard} onClick={() => addProduct(product)} role="button">
                                                <ImageWithFallback src={product.image_url || 'https://placehold.co/150'} alt={product.name}/>
                                                <div className={styles.productInfo}>
                                                    <span>{product.name}</span>
                                                    <strong>${product.price.toFixed(2)}</strong>
                                                </div>
                                            </div>
                                        )) : <p className={styles.emptyMessage}>No hay más productos disponibles o que coincidan.</p>
                                        }
                                    </div>
                                </div>
                            </div>

                            <div className={styles.footer}>
                                <div className={styles.totalContainer}>
                                    <span>Total</span>
                                    <strong>${total.toFixed(2)}</strong>
                                </div>
                                <button onClick={handleUpdateOrder} disabled={isSubmitting} className={styles.updateButton}>
                                    {isSubmitting ? 'Actualizando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
            {isDeliveryModalOpen && (
                <DeliveryInfoModal
                    isOpen={isDeliveryModalOpen}
                    onClose={() => setIsDeliveryModalOpen(false)}
                    deliveryInfo={deliveryInfo}
                />
            )}
        </>
    );
}