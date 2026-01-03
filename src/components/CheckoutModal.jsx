// src/components/CheckoutModal.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import styles from './CheckoutModal.module.css';
import StaticMap from './StaticMap';
import { useAlert } from '../context/AlertContext';
import { useUserData } from '../context/UserDataContext';
import AddressModal from './AddressModal';
import { useBusinessHours } from '../context/BusinessHoursContext';
import { GUEST_CUSTOMER_ID, BUSINESS_PHONE } from '../config/constantes';
import DOMPurify from 'dompurify';

// --- ICONOS ---
const MapPinIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
        <circle cx="12" cy="10" r="3"></circle>
    </svg>
);
const UserIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
        <circle cx="12" cy="7" r="4"></circle>
    </svg>
);
const EditIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
);

export default function CheckoutModal({ phone, onClose }) {
    // --- CONTEXTOS ---
    const { showAlert } = useAlert();
    const { cartItems, total, subtotal, discount, clearCart, toggleCart, closeCart } = useCart();
    const { customer, addresses, refetch: refetchUserData } = useUserData();
    const { isOpen: isBusinessOpen } = useBusinessHours();

    // --- ESTADOS DE FLUJO ---
    // 'selection': Pantalla inicial (¿Invitado o Login?)
    // 'guest_confirm': Pantalla simple para invitados
    // 'logged_user_confirm': Pantalla robusta para usuarios (Mapas, Direcciones, Horarios)
    const [mode, setMode] = useState('selection');

    // --- ESTADOS DE LA LÓGICA ROBUSTA (Solo se usan si hay customer) ---
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAddressModalOpen, setAddressModalOpen] = useState(false);
    const [addressToEdit, setAddressToEdit] = useState(null);
    const [justSavedAddressId, setJustSavedAddressId] = useState(null);

    // Scheduling
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduledTime, setScheduledTime] = useState(null);
    const [scheduleDetails, setScheduleDetails] = useState({
        date: '',
        hour: '00',
        minute: '00',
        period: 'pm'
    });

    // --- EFECTO: DETECTAR USUARIO LOGUEADO ---
    // Si entra un usuario ya registrado, saltamos directo al modo robusto
    useEffect(() => {
        if (customer) {
            setMode('logged_user_confirm');
        }
    }, [customer]);

    // --- EFECTO: GESTIÓN DE DIRECCIONES (Lógica Robusta) ---
    useEffect(() => {
        if (customer && addresses && addresses.length > 0) {
            if (justSavedAddressId) {
                const newlySavedAddress = addresses.find(a => a.id === justSavedAddressId);
                if (newlySavedAddress) {
                    setSelectedAddress(newlySavedAddress);
                    setJustSavedAddressId(null);
                }
            } else if (!selectedAddress) {
                const defaultAddress = addresses.find(a => a.is_default) || addresses[0];
                setSelectedAddress(defaultAddress);
            }
        }
    }, [customer, addresses, justSavedAddressId, selectedAddress]);

    // --- EFECTO: CALCULAR FECHA PROGRAMADA (Lógica Robusta) ---
    useEffect(() => {
        if (isScheduling) {
            const { date, hour, minute, period } = scheduleDetails;
            if (!date) {
                setScheduledTime(null);
                return;
            };

            let twentyFourHour = parseInt(hour, 10);
            if (period === 'pm' && twentyFourHour < 12) {
                twentyFourHour += 12;
            }
            if (period === 'am' && twentyFourHour === 12) {
                twentyFourHour = 0;
            }

            const finalDate = new Date(`${date}T00:00:00`);
            finalDate.setHours(twentyFourHour, parseInt(minute, 10));

            setScheduledTime(finalDate.toISOString());
        } else {
            setScheduledTime(null);
        }
    }, [isScheduling, scheduleDetails]);

    // --- HANDLERS (Lógica Robusta) ---
    const handleToggleScheduling = (shouldSchedule) => {
        setIsScheduling(shouldSchedule);
        if (shouldSchedule && !scheduleDetails.date) {
            const now = new Date();
            if (now.getHours() >= 19) {
                now.setDate(now.getDate() + 1);
            }
            const defaultDate = now.toISOString().split('T')[0];
            setScheduleDetails(prev => ({ ...prev, date: defaultDate }));
        }
    };

    const handleScheduleChange = (e) => {
        const { name, value } = e.target;
        setScheduleDetails(prev => ({ ...prev, [name]: value }));
    };

    const openAddressModal = (address) => {
        setAddressToEdit(address);
        setAddressModalOpen(true);
    };

    const handleSaveAddress = async (addressData, shouldSave, addressId) => {
        if (shouldSave) {
            let response;
            const dataToSave = {
                customer_id: customer.id,
                label: DOMPurify.sanitize(addressData.label),
                address_reference: DOMPurify.sanitize(addressData.address_reference),
                latitude: addressData.latitude,
                longitude: addressData.longitude
            };

            if (addressId) {
                // Actualizar existente
                response = await supabase.from('customer_addresses').update(dataToSave).eq('id', addressId).select().single();
            } else {
                // Insertar nueva
                dataToSave.is_default = addresses.length === 0;
                response = await supabase.from('customer_addresses').insert(dataToSave).select().single();
            }

            if (response.error) {
                showAlert(`Error al guardar: ${response.error.message}`);
                throw new Error(response.error.message);
            } else {
                showAlert(`Dirección ${addressId ? 'actualizada' : 'guardada'} con éxito.`);

                // --- CORRECCIÓN AQUÍ ---
                // 1. Actualizamos inmediatamente la dirección seleccionada con la respuesta del servidor.
                // Esto hace que el cambio sea visualmente instantáneo sin esperar al "refetch".
                if (response.data) {
                    setSelectedAddress(response.data);
                    setJustSavedAddressId(response.data.id); // Mantenemos esto para asegurar consistencia cuando llegue el refetch
                }

                // 2. Pedimos refrescar la lista en segundo plano
                await refetchUserData();
            }
        } else {
            // Dirección temporal (sin cambios aquí)
            const temporaryAddress = {
                id: `temp_${Date.now()}`,
                ...addressData,
                isTemporary: true
            };
            setSelectedAddress(temporaryAddress);
            showAlert('Dirección temporal seleccionada para este pedido.');
        }
        setAddressModalOpen(false);
        setAddressToEdit(null);
    };

    // --- PROCESAR PEDIDO (UNIFICADO) ---
    const handlePlaceOrder = async (isGuest) => {
        // 1. Validaciones Generales
        if (!isBusinessOpen) {
            showAlert("Lo sentimos, el negocio está cerrado y no podemos procesar tu pedido ahora.");
            return;
        }

        // 2. Validaciones Específicas de Usuario Registrado
        if (!isGuest) {
            if (!selectedAddress) {
                showAlert("Por favor, selecciona o añade una dirección de entrega.");
                return;
            }
            if (isScheduling && !scheduledTime) {
                showAlert("Por favor, selecciona una fecha y hora válidas para programar tu pedido.");
                return;
            }
        }

        setIsSubmitting(true);

        try {
            const targetCustomerId = isGuest ? GUEST_CUSTOMER_ID : customer.id;

            // 3. Preparar items para RPC
            const p_cart_items = cartItems.map(item => ({
                product_id: item.id,
                quantity: item.quantity,
                price: item.price,
                cost: item.cost || 0
            }));

            // 4. Llamar a la RPC (Gestión de Stock Centralizada)
            const { data: orderData, error: rpcError } = await supabase.rpc('create_order_with_stock_check', {
                p_customer_id: targetCustomerId,
                p_total_amount: total,
                p_scheduled_for: (!isGuest && scheduledTime) ? scheduledTime : null,
                p_cart_items: p_cart_items
            });

            if (rpcError) throw rpcError;
            const newOrder = orderData[0];

            // 5. Lógica de Descuentos (Solo Registrados)
            if (!isGuest && discount && discount.details?.is_single_use) {
                await supabase.rpc('record_discount_usage_and_deactivate', {
                    p_customer_id: customer.id,
                    p_discount_id: discount.details.id
                });
            }

            // ==========================================
            // 6. CONSTRUCCIÓN DEL MENSAJE DE WHATSAPP
            // ==========================================
            let message = "";

            if (isGuest) {
                // --- FORMATO SIMPLE (INVITADO) ---
                message = `Hola, quiero hacer el siguiente pedido:\n`;
                message += `*Pedido N°: ${newOrder.order_code}*\n\n`;

                cartItems.forEach(item => {
                    message += `• ${item.quantity}x ${item.name}\n`;
                });

                message += `\n*Total: $${total.toFixed(2)}*`;

            } else {
                // --- FORMATO ROBUSTO (REGISTRADO) ---
                message = `¡Hola! 👋 Quiero confirmar mi pedido:\n`;
                message += `*Pedido N°: ${newOrder.order_code}*\n\n`;

                // Detalle Items
                cartItems.forEach(item => {
                    message += `• ${item.quantity}x ${item.name}\n`;
                });

                // Detalle Financiero
                if (discount) {
                    message += `\n*Subtotal:* $${subtotal.toFixed(2)}`;
                    message += `\n*Descuento (${discount.code}):* -$${discount.amount.toFixed(2)}`;
                    message += `\n*Total a pagar: $${total.toFixed(2)}*\n`;
                } else {
                    message += `\n*Total a pagar: $${total.toFixed(2)}*\n`;
                }

                // Programación
                if (scheduledTime) {
                    const scheduledDate = new Date(scheduledTime);
                    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
                    const formattedDate = `${scheduledDate.toLocaleDateString('es-MX', dateOptions)} a las ${scheduledDate.toLocaleTimeString('es-MX', timeOptions)}`;
                    message += `\n\n*Programado para entregar:*\n${formattedDate}\n`;
                }

                // Datos de Entrega
                message += `\n*Datos del cliente:*\n*Nombre:* ${customer?.name}\n`;
                if (selectedAddress?.address_reference) {
                    message += `*Referencia de domicilio:* ${selectedAddress.address_reference}`;
                }
            }

            // 7. Enviar y Limpiar
            const businessNumber = BUSINESS_PHONE;
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${businessNumber}&text=${encodeURIComponent(message)}`;

            showAlert(
                "¡Pedido creado! Serás redirigido a WhatsApp.",
                'success', // Cambiado a success para feedback positivo
                () => {
                    window.open(whatsappUrl, '_blank');
                    clearCart();
                    if (closeCart) closeCart();
                    onClose();
                    if (!isGuest) refetchUserData();
                }
            );

        } catch (error) {
            console.error("Error al procesar el pedido:", error);
            setIsSubmitting(false);
            if (error.message && error.message.includes('Stock insuficiente')) {
                showAlert(`¡Oops! Algo se agotó mientras pedías.`, 'error');
            } else {
                showAlert(`Error: ${error.message}`, 'error');
            }
        }
    };

    // --- RENDERIZADO DEL CONTENIDO ---

    const renderContent = () => {
        // MODO 1: SELECCIÓN (Solo si no hay usuario logueado)
        if (mode === 'selection' && !customer) {
            return (
                <div className={styles.selectionContainer}>
                    <h3>¿Cómo quieres continuar?</h3>
                    <p>Puedes agregar tu número para acumular puntos, guardar direcciones y pedir más rápido.</p>

                    <div className={styles.selectionButtons}>
                        <button
                            className={styles.btnGuest}
                            onClick={() => setMode('guest_confirm')}
                        >
                            Pedir como Invitado (Rápido)
                        </button>

                        <button
                            className={styles.btnAuth}
                            onClick={() => onClose(true)} // onClose(true) indica al padre abrir Login
                        >
                            Ingresar mi número (Ganar Puntos)
                        </button>
                    </div>
                </div>
            );
        }

        // MODO 2: CONFIRMACIÓN INVITADO (Simple y Rápida)
        if (mode === 'guest_confirm') {
            return (
                <div className={styles.confirmContainer}>
                    <div className={styles.header}>
                        <h3>Confirmar Pedido Rápido</h3>
                        <button onClick={onClose} className={styles.closeButton}>×</button>
                    </div>

                    <div className={styles.summaryCompact}>
                        <p>Total a pagar: <strong>${total.toFixed(2)}</strong></p>
                        <p className={styles.helperText}>
                            Al enviar, se abrirá WhatsApp con los detalles de tu pedido.
                        </p>
                    </div>

                    <div className={styles.footer}>
                        <button
                            className={styles.confirmButton}
                            onClick={() => handlePlaceOrder(true)} // true = isGuest
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Procesando...' : 'Enviar Pedido por WhatsApp'}
                        </button>
                        <button className={styles.backButton} onClick={() => setMode('selection')}>Atrás</button>
                    </div>
                </div>
            );
        }

        // MODO 3: CONFIRMACIÓN USUARIO REGISTRADO (Robusta y Completa)
        if (mode === 'logged_user_confirm') {
            const mapInitialPosition = selectedAddress ? { lat: selectedAddress.latitude, lng: selectedAddress.longitude } : null;

            return (
                <div className={styles.robustContainer}>
                    <div className={styles.header}>
                        <h3>Confirmar Pedido</h3>
                        <button onClick={() => onClose()} className={styles.closeButton}>×</button>
                    </div>

                    {/* --- MAPA ESTÁTICO (Optimización) --- */}
                    {mapInitialPosition && (
                        <div className={styles.mapDisplay}>
                            <StaticMap
                                latitude={mapInitialPosition.lat}
                                longitude={mapInitialPosition.lng}
                                height={220}
                            />
                            <div className={styles.mapOverlay}></div>
                        </div>
                    )}

                    <div className={styles.scrollableContent}>
                        {/* --- DETALLES DE ENTREGA --- */}
                        <div className={styles.detailsGroup}>
                            <div className={styles.detailItem}>
                                <MapPinIcon />
                                <div>
                                    <strong>{selectedAddress?.label || "Selecciona una dirección"}</strong>
                                    <p>{selectedAddress?.address_reference || "Sin referencia"}</p>
                                </div>
                            </div>
                            <div className={styles.detailItem}>
                                <UserIcon />
                                <div>
                                    <strong>Recibe:</strong>
                                    <p>{customer?.name || '...'}</p>
                                </div>
                            </div>
                        </div>

                        {/* --- SELECTOR DE DIRECCIONES --- */}
                        <div className={styles.addressActions}>
                            {addresses && addresses.length > 1 && (
                                <select
                                    className={styles.addressSelector}
                                    onChange={(e) => setSelectedAddress(addresses.find(a => a.id === e.target.value))}
                                    value={selectedAddress?.id || ''}
                                >
                                    {addresses.map(addr => (
                                        <option key={addr.id} value={addr.id}>
                                            {addr.label} - {addr.address_reference ? addr.address_reference.substring(0, 20) + '...' : ''}
                                        </option>
                                    ))}
                                </select>
                            )}
                            <button onClick={() => openAddressModal(selectedAddress)} className={styles.editAddressButton}>
                                <EditIcon /> Editar
                            </button>
                            <button onClick={() => openAddressModal(null)} className={styles.addNewAddressButton}>
                                + Añadir Nueva
                            </button>
                        </div>

                        {/* --- PROGRAMACIÓN DE PEDIDO --- */}
                        <div className={styles.detailsGroup}>
                            <h4>¿Cuándo lo quieres recibir?</h4>
                            <div className={styles.deliveryOptions}>
                                <button
                                    className={!isScheduling ? styles.activeOption : ''}
                                    onClick={() => handleToggleScheduling(false)}>
                                    Lo antes posible
                                </button>
                                <button
                                    className={isScheduling ? styles.activeOption : ''}
                                    onClick={() => handleToggleScheduling(true)}>
                                    Programar
                                </button>
                            </div>

                            {isScheduling && (
                                <div className={styles.schedulePickerContainer}>
                                    <input
                                        type="date"
                                        name="date"
                                        className={styles.datePicker}
                                        value={scheduleDetails.date}
                                        onChange={handleScheduleChange}
                                        min={new Date().toISOString().split('T')[0]}
                                    />
                                    <div className={styles.timePicker}>
                                        <select name="hour" value={scheduleDetails.hour} onChange={handleScheduleChange}>
                                            {Array.from({ length: 12 }, (_, i) => i + 1).map(h => (
                                                <option key={h} value={h < 10 ? `0${h}` : h}>{h}</option>
                                            ))}
                                        </select>
                                        <span>:</span>
                                        <select name="minute" value={scheduleDetails.minute} onChange={handleScheduleChange}>
                                            {['00', '15', '30', '45'].map(m => (
                                                <option key={m} value={m}>{m}</option>
                                            ))}
                                        </select>
                                        <select name="period" value={scheduleDetails.period} onChange={handleScheduleChange}>
                                            <option value="am">AM</option>
                                            <option value="pm">PM</option>
                                        </select>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* --- RESUMEN FINANCIERO COMPLETO --- */}
                        <div className={styles.summary}>
                            <h4>Resumen del pedido</h4>
                            <div className={styles.summaryLine}><span>Subtotal</span> <span>${subtotal.toFixed(2)}</span></div>
                            {discount && (
                                <div className={`${styles.summaryLine} ${styles.discount}`}>
                                    <span>Descuento ({discount.code})</span>
                                    <span>-${discount.amount.toFixed(2)}</span>
                                </div>
                            )}
                            <div className={`${styles.summaryLine} ${styles.total}`}><strong>Total</strong> <strong>${total.toFixed(2)}</strong></div>
                        </div>
                    </div>

                    <div className={styles.footer}>
                        <button
                            onClick={() => handlePlaceOrder(false)} // false = isGuest (es decir, es User)
                            className={styles.confirmButton}
                            disabled={isSubmitting || !isBusinessOpen}
                        >
                            {isSubmitting ? 'Procesando...' : (isBusinessOpen ? `Confirmar y Pagar $${(total || 0).toFixed(2)}` : 'Estamos Cerrados')}
                        </button>
                    </div>
                </div>
            );
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={() => onClose()}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                {renderContent()}
            </div>

            {/* Modal de Direcciones (Solo se renderiza si es necesario) */}
            {isAddressModalOpen && (
                <AddressModal
                    isOpen={isAddressModalOpen}
                    onClose={() => { setAddressModalOpen(false); setAddressToEdit(null); }}
                    onSave={handleSaveAddress}
                    address={addressToEdit}
                    customerId={customer?.id}
                    showSaveOption={true}
                />
            )}
        </div>
    );
}