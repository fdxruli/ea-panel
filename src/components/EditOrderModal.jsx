import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './EditOrderModal.module.css';
import LoadingSpinner from './LoadingSpinner';
import { useAlert } from '../context/AlertContext';
import ImageWithFallback from './ImageWithFallback';
import DeliveryInfoModal from './DeliveryInfoModal';

const TrashIcon = () => ( /* ... (icono sin cambios) ... */
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);
// --- NUEVO ÍCONO ---
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>;


// --- Funciones auxiliares para formato de fecha/hora ---
const formatDateForInput = (isoString) => {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        return date.toISOString().split('T')[0];
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
// --- FIN FUNCIONES AUXILIARES ---


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

    const [activeTab, setActiveTab] = useState('current'); // 'current' o 'add'
    const [searchTerm, setSearchTerm] = useState('');

    const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
    const [deliveryInfo, setDeliveryInfo] = useState(null);

    // --- NUEVO ESTADO PARA PROGRAMACIÓN EN EDICIÓN ---
    const [scheduleDate, setScheduleDate] = useState('');
    const [scheduleTime, setScheduleTime] = useState('');
    // --- FIN NUEVO ESTADO ---

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // Fetch products, addresses (sin cambios)
                const productsPromise = supabase.from('products').select('*').eq('is_active', true);
                const addressesPromise = supabase.from('customer_addresses').select('*').eq('customer_id', order.customer_id);

                const [productsRes, addressesRes] = await Promise.all([productsPromise, addressesPromise]);

                if (productsRes.error) throw productsRes.error;
                if (addressesRes.error) throw addressesRes.error;

                setAllProducts(productsRes.data || []);
                setCustomerAddresses(addressesRes.data || []);

                // Set initial address (sin cambios)
                const defaultAddress = addressesRes.data.find(a => a.is_default) || addressesRes.data[0];
                const currentAddressId = defaultAddress?.id || '';
                setSelectedAddressId(currentAddressId);
                setInitialAddressId(currentAddressId);

                // Set initial items (sin cambios)
                const initialItems = order.order_items.map(item => ({
                    ...item.products, // Cuidado: esto podría sobreescribir 'id' si products tiene 'id'
                    original_item_id: item.id, // Guardar el id original del item
                    product_id: item.product_id,
                    quantity: item.quantity,
                    price: item.price,
                }));
                setOrderItems(initialItems);

                // --- INICIALIZAR ESTADO DE PROGRAMACIÓN ---
                setScheduleDate(formatDateForInput(order.scheduled_for));
                setScheduleTime(formatTimeForInput(order.scheduled_for));
                // --- FIN INICIALIZACIÓN ---


            } catch (error) {
                console.error("Error fetching data:", error);
                showAlert('Hubo un error al cargar los datos para la edición.');
                onClose();
            } finally {
                setLoading(false);
            }
        };
        if (order) { // Asegurarse de que 'order' exista antes de fetchear
            fetchData();
        }
    }, [order, onClose, showAlert]); // Dependencia 'order'

    // Calcular total (sin cambios)
    useEffect(() => {
        const newTotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setTotal(newTotal);
    }, [orderItems]);

    // Mostrar info de entrega (sin cambios)
    const handleShowDeliveryInfo = () => {
        const selectedAddress = customerAddresses.find(addr => addr.id === selectedAddressId);
        if (selectedAddress && order.customers) { // Asegurar que customers exista
            setDeliveryInfo({
                customer: order.customers,
                address: selectedAddress
            });
            setIsDeliveryModalOpen(true);
        } else {
             showAlert("No se encontró la dirección o los datos del cliente.");
        }
    };

    // Manejo de items del carrito (updateQuantity, removeItem, addProduct) - sin cambios
    const updateQuantity = (productId, newQuantity) => { /* ... lógica existente ... */
         const numQuantity = parseInt(newQuantity, 10);
        if (isNaN(numQuantity) || numQuantity <= 0) {
            removeItem(productId);
            return;
        };
        setOrderItems(prevItems => prevItems.map(item =>
            item.id === productId ? { ...item, quantity: numQuantity } : item
        ));
    };
    const removeItem = (productId) => { /* ... lógica existente ... */
         setOrderItems(prevItems => prevItems.filter(item => item.id !== productId));
    };
    const addProduct = (product) => { /* ... lógica existente ... */
         const existingItem = orderItems.find(item => item.id === product.id);
        if (existingItem) {
            setOrderItems(prevItems =>
                prevItems.map(item =>
                    item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                )
            );
        } else {
            // Asegurarse de añadir 'product_id' correctamente
            setOrderItems(prevItems => [...prevItems, { ...product, quantity: 1, product_id: product.id }]);
            showAlert(`${product.name} añadido al pedido.`);
        }
        setActiveTab('current'); // Cambiar a la pestaña actual después de añadir
    };

    // --- ACTUALIZAR ORDEN (MODIFICADO) ---
    const handleUpdateOrder = async () => {
        if (orderItems.length === 0) {
            showAlert("No puedes dejar el pedido vacío. Cancélalo si es necesario.");
            return;
        }

        // --- VALIDACIÓN Y FORMATO DE FECHA/HORA ---
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
            // Opcional: Validación de fecha pasada (descomentar si es necesario)
            // const now = new Date();
            // if (scheduledDateObj < now) {
            //     showAlert('No puedes programar un pedido para una fecha/hora pasada.');
            //     return;
            // }
            scheduledTimestamp = scheduledDateObj.toISOString();
        } else {
            // Si ambos campos están vacíos, nos aseguramos de que sea null
            scheduledTimestamp = null;
        }
        // --- FIN VALIDACIÓN Y FORMATO ---

        setIsSubmitting(true);
        try {
            // Actualizar dirección por defecto si cambió (sin cambios)
            if (selectedAddressId && selectedAddressId !== initialAddressId) {
                await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', order.customer_id);
                await supabase.from('customer_addresses').update({ is_default: true }).eq('id', selectedAddressId);
                 // Actualizar la dirección por defecto visualmente para el modal de delivery si se abre de nuevo
                 setInitialAddressId(selectedAddressId);
            }

            // Reemplazar items de la orden (sin cambios)
            await supabase.from('order_items').delete().eq('order_id', order.id);
            const newOrderItems = orderItems.map(item => ({
                order_id: order.id,
                product_id: item.product_id, // Usar product_id guardado
                quantity: item.quantity,
                price: item.price,
            }));
            await supabase.from('order_items').insert(newOrderItems);

            // Actualizar la orden principal con total y scheduled_for
            await supabase.from('orders').update({
                total_amount: total,
                scheduled_for: scheduledTimestamp // <-- AÑADIDO AQUÍ
            }).eq('id', order.id);

            showAlert("¡Pedido actualizado con éxito!");
            onOrderUpdated(); // Refrescar la lista de pedidos
            onClose(); // Cerrar el modal
        } catch (error) {
            console.error("Error al actualizar el pedido:", error);
            showAlert(`Error al actualizar: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    // --- FIN ACTUALIZAR ORDEN ---

    // Productos disponibles para añadir (sin cambios)
    const availableProducts = useMemo(() => {
        const currentIds = new Set(orderItems.map(i => i.id));
        return allProducts
            .filter(p => !currentIds.has(p.id))
            .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [allProducts, orderItems, searchTerm]);

    return (
        <>
            <div className={styles.modalOverlay}>
                <div className={`${styles.modalContent} ${activeTab === 'add' ? styles.addMode : ''}`}> {/* Aplicar clase addMode aquí */}
                    <div className={styles.header}>
                        <h2>Editando Pedido #{order.order_code}</h2>
                        <button onClick={onClose} className={styles.closeButton}>×</button>
                    </div>

                    {loading ? <LoadingSpinner /> : (
                        <>
                            {/* Sección Info Cliente y Dirección (sin cambios) */}
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

                            {/* --- NUEVA SECCIÓN PARA PROGRAMACIÓN --- */}
                            <div className={styles.scheduleSection}>
                                <label><ClockIcon/> Programar Entrega (Opcional)</label>
                                <div className={styles.scheduleInputs}>
                                    <input
                                        type="date"
                                        value={scheduleDate}
                                        onChange={e => setScheduleDate(e.target.value)}
                                        min={new Date().toISOString().split('T')[0]} // Opcional: mínimo hoy
                                        aria-label="Fecha de programación"
                                    />
                                    <input
                                        type="time"
                                        value={scheduleTime}
                                        onChange={e => setScheduleTime(e.target.value)}
                                        aria-label="Hora de programación"
                                    />
                                </div>
                                {/* Botón para limpiar */}
                                {(scheduleDate || scheduleTime) && (
                                     <button type="button" onClick={() => { setScheduleDate(''); setScheduleTime(''); }} className={styles.clearScheduleButton}>
                                         Limpiar Programación
                                     </button>
                                )}
                            </div>
                            {/* --- FIN SECCIÓN PROGRAMACIÓN --- */}


                            {/* Tabs y Contenido (sin cambios visuales mayores) */}
                            <div className={styles.tabs}>
                                <button onClick={() => setActiveTab('current')} className={activeTab === 'current' ? styles.active : ''}>
                                    Pedido Actual ({orderItems.length})
                                </button>
                                <button onClick={() => setActiveTab('add')} className={activeTab === 'add' ? styles.active : ''}>
                                    Añadir Productos
                                </button>
                            </div>
                            <div className={`${styles.contentBody}`}> {/* No necesita addMode aquí */}
                                {/* Lista de items actuales */}
                                <div className={styles.itemsList}>
                                    {orderItems.length > 0 ? orderItems.map(item => (
                                        <div key={item.id || item.original_item_id} className={styles.cartItem}> {/* Usar ID original como fallback */}
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

                                {/* Sección para añadir productos */}
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

                            {/* Footer (sin cambios) */}
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
            {/* Modal Info Entrega (sin cambios) */}
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
