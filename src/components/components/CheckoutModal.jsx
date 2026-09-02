// src/components/CheckoutModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import styles from './CheckoutModal.module.css';
import StaticMap from './StaticMap';
import { useAlert } from '../context/AlertContext';
import { useUserData } from '../context/UserDataContext';
import AddressModal from './AddressModal';
import { useBusinessHours } from '../context/BusinessHoursContext';
import { GUEST_CUSTOMER_ID, BUSINESS_PHONE } from '../config/constantes';
import { broadcastStoreChange } from '../lib/broadcastRealtime';
import DOMPurify from 'dompurify';

// Iconos (sin cambios)
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
const CheckIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#10b981' }}>
        <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
);

const getLocalYYYYMMDD = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export default function CheckoutModal({ phone, onClose }) {
    const { showAlert } = useAlert();
    const { cartItems, total, subtotal, discount, clearCart, toggleCart, closeCart } = useCart();
    const { customer, addresses, refetch: refetchUserData } = useUserData();
    const { isOpen: isBusinessOpen } = useBusinessHours();

    // Estados de flujo
    const [mode, setMode] = useState('selection');

    const [rememberGuest, setRememberGuest] = useState(false);
    const [isAutoDispatching, setIsAutoDispatching] = useState(false);

    // ✅ NUEVO: Ref para evitar doble ejecución del auto-despacho
    const hasAutoDispatchedRef = useRef(false);

    // ✅ CORREGIDO: useEffect con protección contra doble ejecución
    useEffect(() => {
        const guestPref = localStorage.getItem('guest_preference');

        if (!customer &&
            guestPref === 'true' &&
            !isSubmitting &&
            !isAutoDispatching &&
            !hasAutoDispatchedRef.current) { // ← Verificar que no se haya ejecutado

            console.log('🔄 Detectado modo invitado recurrente. Enviando pedido...');
            setIsAutoDispatching(true);
            hasAutoDispatchedRef.current = true; // ← Marcar como ejecutado

            handlePlaceOrder(true)
                .catch(err => {
                    console.error("Error en auto-despacho:", err);
                    setIsAutoDispatching(false);
                    hasAutoDispatchedRef.current = false; // ← Resetear en caso de error
                });
        }
    }, [customer]);

    // Estados para usuarios logueados
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isAddressModalOpen, setAddressModalOpen] = useState(false);
    const [addressToEdit, setAddressToEdit] = useState(null);
    const [justSavedAddressId, setJustSavedAddressId] = useState(null);

    // Si el carrito se vacía mientras el modal está abierto (ej. por stock en realtime), lo cerramos
    useEffect(() => {
        if (cartItems.length === 0) {
            onClose();
        }
    }, [cartItems.length, onClose]);

    // Scheduling
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduledTime, setScheduledTime] = useState(null);
    const [scheduleDetails, setScheduleDetails] = useState({
        date: '',
        hour: '00',
        minute: '00',
        period: 'pm'
    });

    useEffect(() => {
        if (customer) {
            setMode('logged_user_confirm');
        }
    }, [customer]);

    useEffect(() => {
        console.log('🔄 [useEffect-Addresses] Disparado:', {
            hasCustomer: !!customer,
            addressesCount: addresses?.length || 0,
            justSavedAddressId,
            currentSelectedId: selectedAddress?.id
        });

        if (customer && addresses && addresses.length > 0) {
            if (justSavedAddressId) {
                const newlySavedAddress = addresses.find(a => a.id === justSavedAddressId);

                if (newlySavedAddress) {
                    console.log('✅ Seleccionando dirección recién guardada:', newlySavedAddress.label);
                    setSelectedAddress(newlySavedAddress);
                    setJustSavedAddressId(null);
                    return;
                } else {
                    console.warn('⚠️ No se encontró la dirección recién guardada en la lista');
                }
            }

            if (!selectedAddress) {
                const defaultAddress = addresses.find(a => a.is_default) || addresses[0];
                console.log('✅ Seleccionando dirección default/primera:', defaultAddress.label);
                setSelectedAddress(defaultAddress);
            }
        } else if (customer && addresses && addresses.length === 0) {
            console.log('⚠️ Usuario sin direcciones guardadas');
            setSelectedAddress(null);
        }
    }, [customer, addresses, justSavedAddressId]);

    useEffect(() => {
        if (isScheduling) {
            const { date, hour, minute, period } = scheduleDetails;
            if (!date) {
                setScheduledTime(null);
                return;
            }

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

    const handleToggleScheduling = (shouldSchedule) => {
        setIsScheduling(shouldSchedule);

        if (shouldSchedule) {
            const now = new Date();
            const defaultDate = getLocalYYYYMMDD(now);

            // CAMBIO: Sugerir por defecto 2 horas después en lugar de 1
            let nextHour = now.getHours() + 2;
            let period = 'am';

            // Ajuste para cambio de día (ej: 23:00 + 2 = 25 -> 01:00)
            if (nextHour >= 24) {
                nextHour -= 24;
            }

            if (nextHour >= 12) {
                period = 'pm';
                if (nextHour > 12) nextHour -= 12;
            } else if (nextHour === 0) {
                nextHour = 12; // 12 AM
            }

            setScheduleDetails(prev => ({
                ...prev,
                date: defaultDate,
                hour: nextHour.toString().padStart(2, '0'),
                minute: '00',
                period: period
            }));
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
        console.log('🔍 [handleSaveAddress] INICIO:', {
            shouldSave,
            addressId,
            addressData,
            customerIdFromContext: customer?.id
        });

        try {
            if (shouldSave) {
                if (!customer?.id) {
                    throw new Error('No se detectó tu sesión de usuario.');
                }

                const dataToSave = {
                    customer_id: customer.id,
                    label: addressData.label,
                    address_reference: addressData.address_reference,
                    latitude: addressData.latitude,
                    longitude: addressData.longitude
                };

                console.log('📤 [handleSaveAddress] Enviando a Supabase:', dataToSave);

                let response;

                if (addressId) {
                    response = await supabase
                        .from('customer_addresses')
                        .update(dataToSave)
                        .eq('id', addressId)
                        .select()
                        .single();
                } else {
                    dataToSave.is_default = (addresses?.length || 0) === 0;

                    response = await supabase
                        .from('customer_addresses')
                        .insert(dataToSave)
                        .select()
                        .single();
                }

                console.log('📥 [handleSaveAddress] Respuesta de Supabase:', response);

                if (response.error) {
                    console.error('❌ [handleSaveAddress] ERROR:', response.error);
                    throw new Error(response.error.message);
                }

                if (!response.data) {
                    throw new Error('No se recibieron datos de la dirección guardada.');
                }

                console.log('✅ [handleSaveAddress] Actualizando estado local...');

                setSelectedAddress(response.data);
                setJustSavedAddressId(response.data.id);

                console.log('🔄 [handleSaveAddress] Refetch en background...');
                refetchUserData().catch(err => {
                    console.warn('⚠️ Refetch falló (no crítico):', err);
                });

                showAlert(`Dirección ${addressId ? 'actualizada' : 'guardada'} con éxito.`, 'success');

            } else {
                console.log('📍 [handleSaveAddress] Usando dirección temporal');

                const temporaryAddress = {
                    id: `temp_${Date.now()}`,
                    label: addressData.label,
                    address_reference: addressData.address_reference,
                    latitude: addressData.latitude,
                    longitude: addressData.longitude,
                    isTemporary: true
                };

                setSelectedAddress(temporaryAddress);
                showAlert('Dirección temporal seleccionada para este pedido.', 'info');
            }

            setAddressModalOpen(false);
            setAddressToEdit(null);

        } catch (error) {
            console.error('💥 [handleSaveAddress] ERROR CRÍTICO:', error);
            showAlert(`Error al guardar: ${error.message}`, 'error');
            throw error;
        }
    };

    const handleGuestSelection = () => {
        if (rememberGuest) {
            localStorage.setItem('guest_preference', 'true');
        }
        handlePlaceOrder(true);
    };

    const resetGuestPreference = () => {
        localStorage.removeItem('guest_preference');
        setMode('selection');
    };

    // ✅ CORREGIDO: Función de pedido con protección contra guardado duplicado
    const handlePlaceOrder = async (isGuest) => {
        if (!isBusinessOpen) {
            showAlert("Lo sentimos, el negocio está cerrado y no podemos procesar tu pedido ahora.");
            return;
        }

        if (!isGuest) {
            if (!customer) {
                showAlert("Error: No se detectó tu sesión. Por favor, recarga la página.");
                return;
            }

            if (!selectedAddress) {
                showAlert("Por favor, selecciona o añade una dirección de entrega.");
                return;
            }

            if (isScheduling) {
                if (!scheduledTime) {
                    showAlert("Por favor, selecciona una fecha y hora válidas para programar tu pedido.");
                    return;
                }

                const scheduledDate = new Date(scheduledTime);
                const now = new Date();

                const diffInMs = scheduledDate - now;
                const minTimeInMs = 2 * 60 * 60 * 1000;

                if (diffInMs < minTimeInMs) {
                    showAlert(
                        "Para pedidos inmediatos, es mejor elegir la opción 'Lo antes posible'. La programación requiere al menos 2 horas de anticipación.",
                        "warning"
                    );
                    return;
                }
            }
        }

        setIsSubmitting(true);

        try {
            // ✅ CORREGIDO: Solo guardar preferencia si NO está en auto-despacho
            if (isGuest && rememberGuest && !isAutoDispatching) {
                console.log('💾 Guardando preferencia de invitado (desde clic manual)');
                localStorage.setItem('guest_preference', 'true');
            }

            const targetCustomerId = isGuest ? GUEST_CUSTOMER_ID : customer.id;

            const p_cart_items = cartItems.map(item => ({
                product_id: item.id,
                quantity: item.quantity,
                price: item.price,
                cost: item.cost || 0
            }));

            const { data: orderData, error: rpcError } = await supabase.rpc('create_order_with_stock_check', {
                p_customer_id: targetCustomerId,
                p_total_amount: total,
                p_scheduled_for: (!isGuest && scheduledTime) ? scheduledTime : null,
                p_cart_items: p_cart_items
            });

            if (rpcError) throw rpcError;
            const newOrder = orderData[0];

            if (!isGuest && discount && discount.details?.is_single_use) {
                await supabase.rpc('record_discount_usage_and_deactivate', {
                    p_customer_id: customer.id,
                    p_discount_id: discount.details.id
                });
            }

            let message = "";

            if (isGuest) {
                message = `Hola, quiero hacer el siguiente pedido:\n`;
                message += `*Pedido N°: ${newOrder.order_code}*\n\n`;
                cartItems.forEach(item => {
                    message += `• ${item.quantity}x ${item.name}\n`;
                });
                message += `\n*Total: $${total.toFixed(2)}*`;
            } else {
                message = `¡Hola! 👋 Quiero confirmar mi pedido:\n`;
                message += `*Pedido N°: ${newOrder.order_code}*\n\n`;
                cartItems.forEach(item => {
                    message += `• ${item.quantity}x ${item.name}\n`;
                });

                if (discount) {
                    message += `\n*Subtotal:* $${subtotal.toFixed(2)}`;
                    message += `\n*Descuento (${discount.code}):* -$${discount.amount.toFixed(2)}`;
                    message += `\n*Total a pagar: $${total.toFixed(2)}*\n`;
                } else {
                    message += `\n*Total a pagar: $${total.toFixed(2)}*\n`;
                }

                if (scheduledTime) {
                    const scheduledDate = new Date(scheduledTime);
                    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
                    const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
                    const formattedDate = `${scheduledDate.toLocaleDateString('es-MX', dateOptions)} a las ${scheduledDate.toLocaleTimeString('es-MX', timeOptions)}`;
                    message += `\n\n*Programado para entregar:*\n${formattedDate}\n`;
                }

                message += `\n*Datos del cliente:*\n*Nombre:* ${customer?.name}\n`;
                if (selectedAddress?.address_reference) {
                    message += `*Referencia de domicilio:* ${selectedAddress.address_reference}`;
                }
            }

            const businessNumber = BUSINESS_PHONE;
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${businessNumber}&text=${encodeURIComponent(message)}`;

            broadcastStoreChange('order_changed', { orderCode: order.order_code });

            showAlert(
                "¡Pedido creado! Serás redirigido a WhatsApp.",
                'success',
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

            const errMessage = error?.message || error?.error?.message || error?.details || String(error);

            if (errMessage.includes('Stock insuficiente')) {
                const detail = errMessage.replace(/^.*?Stock insuficiente/i, 'Stock insuficiente');
                showAlert(`⚠️ Lo sentimos, un producto o ingrediente se agotó justo antes de completar tu pedido:\n\n${detail}\n\nHemos actualizado el menú y tu carrito.`, 'error');
                broadcastStoreChange('order_changed');
            } else {
                showAlert(`Error: ${errMessage}`, 'error');
            }
        }
    };

    // RENDERIZADO DEL CONTENIDO
    const renderContent = () => {
        if (isAutoDispatching) {
            return (
                <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
                    <div className={styles.spinner} style={{ margin: '0 auto 20px' }}></div>
                    <h3>Conectando con WhatsApp...</h3>
                    <p>Estamos generando tu pedido automáticamente.</p>
                </div>
            );
        }

        if (mode === 'selection' && !customer) {
            return (
                <div className={styles.selectionRoot}>
                    <div className={styles.header}>
                        <h3>¿Cómo prefieres pedir?</h3>
                        <button onClick={() => onClose()} className={styles.closeButton}>×</button>
                    </div>

                    <div className={styles.selectionContainer}>
                        <div className={`${styles.optionCard} ${styles.guestCard}`}>
                            <div className={styles.guestContent}>
                                <div className={styles.guestInfo}>
                                    <span className={styles.guestLabel}>Pedido Rápido</span>
                                    <span className={styles.guestTotal}>Total: ${total.toFixed(2)}</span>
                                </div>

                                {/* ✅ CORREGIDO: Botón con protección contra doble clic */}
                                <button
                                    className={styles.btnGuest}
                                    onClick={() => {
                                        if (isSubmitting) return; // ← Prevenir doble clic
                                        handlePlaceOrder(true);
                                    }}
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Procesando...' : 'Pedir sin registrarse'}
                                </button>

                                <div style={{ margin: '10px 0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', color: '#555' }}>
                                    <input
                                        type="checkbox"
                                        id="chkRememberGuest"
                                        checked={rememberGuest}
                                        onChange={(e) => setRememberGuest(e.target.checked)}
                                        style={{ cursor: 'pointer', accentColor: 'var(--primary-color)' }}
                                    />
                                    <label htmlFor="chkRememberGuest" style={{ cursor: 'pointer', userSelect: 'none' }}>
                                        Recordar mi elección
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div className={styles.dividerText}>
                            <span>o continúa como invitado</span>
                        </div>

                        <div className={`${styles.optionCard} ${styles.memberCard}`}>
                            <div className={styles.cardBadge}>Recomendado</div>
                            <h4 className={styles.cardTitle}>Soy Cliente Frecuente</h4>

                            <ul className={styles.benefitsList}>
                                <li>
                                    <CheckIcon /> <span>Guarda tus <strong>direcciones</strong> (Casa, Trabajo)</span>
                                </li>
                                <li>
                                    <CheckIcon /> <span>Realiza pedidos en <strong>segundos</strong></span>
                                </li>
                                <li>
                                    <CheckIcon /> <span>Accede a <strong>promociones</strong> exclusivas</span>
                                </li>
                            </ul>

                            <button
                                className={styles.btnAuth}
                                onClick={() => onClose(true)}
                            >
                                Ingresar con mi número
                            </button>
                        </div>
                    </div>
                </div>
            );
        }

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
                            onClick={() => handlePlaceOrder(true)}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Procesando...' : 'Enviar Pedido por WhatsApp'}
                        </button>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%' }}>
                            <button className={styles.backButton} onClick={() => setMode('selection')}>
                                Atrás
                            </button>

                            {localStorage.getItem('guest_preference') === 'true' && (
                                <button
                                    onClick={resetGuestPreference}
                                    style={{
                                        background: 'none',
                                        border: 'none',
                                        color: '#666',
                                        textDecoration: 'underline',
                                        fontSize: '0.85rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    ¿Quieres registrarte o iniciar sesión?
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            );
        }

        if (mode === 'logged_user_confirm') {
            const mapInitialPosition = selectedAddress ? { lat: selectedAddress.latitude, lng: selectedAddress.longitude } : null;

            return (
                <div className={styles.robustContainer}>
                    <div className={styles.header}>
                        <h3>Confirmar Pedido</h3>
                        <button onClick={() => onClose()} className={styles.closeButton}>×</button>
                    </div>

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
                                        min={getLocalYYYYMMDD(new Date())}
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
                            onClick={() => handlePlaceOrder(false)}
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