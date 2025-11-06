// src/components/CheckoutModal.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import styles from './CheckoutModal.module.css';
// --- 👇 OPTIMIZACIÓN: Cambiamos los imports del mapa ---
import StaticMap from './StaticMap'; // <-- AÑADIDO
// import DynamicMapPicker from './DynamicMapPicker'; // <-- ELIMINADO
// import ClientOnly from './ClientOnly'; // <-- ELIMINADO
// --- FIN OPTIMIZACIÓN ---
import { useAlert } from '../context/AlertContext';
import { useUserData } from '../context/UserDataContext';
import AddressModal from './AddressModal';
import { useBusinessHours } from '../context/BusinessHoursContext';
import DOMPurify from 'dompurify';

// ... (Iconos y lógica del componente sin cambios hasta el return) ...

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

export default function CheckoutModal({ phone, onClose, mode = 'checkout' }) {
    // ... (Toda la lógica interna de useState, useEffect, placeOrder, etc. se mantiene igual) ...
    const { showAlert } = useAlert();
    const { cartItems, total, subtotal, discount, clearCart, toggleCart } = useCart();
    const { customer, addresses, refetch: refetchUserData } = useUserData();
    const { isOpen: isBusinessOpen } = useBusinessHours();

    const [selectedAddress, setSelectedAddress] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddressModalOpen, setAddressModalOpen] = useState(false);
    const [addressToEdit, setAddressToEdit] = useState(null);
    const [justSavedAddressId, setJustSavedAddressId] = useState(null);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [isScheduling, setIsScheduling] = useState(false);
    const [scheduledTime, setScheduledTime] = useState(null);
    const [scheduleDetails, setScheduleDetails] = useState({
        date: '',
        hour: '00',
        minute: '00',
        period: 'pm'
    });

    // ... (toda la lógica de useEffect y handlers se mantiene igual) ...
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

    useEffect(() => {
        if (customer && addresses) {
            if (addresses.length > 0) {
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
            setIsLoading(false);
        } else if (!customer && phone) {
            setIsLoading(false);
        }
    }, [customer, addresses, phone, justSavedAddressId, selectedAddress]);

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
                response = await supabase.from('customer_addresses').update(dataToSave).eq('id', addressId).select().single();
            } else {
                 dataToSave.is_default = addresses.length === 0;
                response = await supabase.from('customer_addresses').insert(dataToSave).select().single();
            }

            if (response.error) {
                 showAlert(`Error al guardar: ${response.error.message}`);
                 throw new Error(response.error.message);
            } else {
                showAlert(`Dirección ${addressId ? 'actualizada' : 'guardada'} con éxito.`);
                refetchUserData();
                setSelectedAddress(response.data);
            }
        } else {
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

    const handleCreateProfile = async (e) => {
        e.preventDefault();
        if (!newCustomerName.trim()) {
            showAlert("Por favor, ingresa tu nombre.");
            return;
        }
        setIsSubmitting(true);
        try {
            const { error } = await supabase
                .from('customers')
                .insert({ name: newCustomerName, phone: phone });

            if (error) throw error;

            showAlert("¡Bienvenido! Tu perfil ha sido creado.");
            refetchUserData();

        } catch (error) {
            showAlert(`Error al crear tu perfil: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const placeOrder = async () => {
        if (!isBusinessOpen) {
            showAlert("Lo sentimos, el negocio está cerrado y no podemos procesar tu pedido ahora.");
            return;
        }
        if (!selectedAddress) {
            showAlert("Por favor, selecciona o añade una dirección de entrega.");
            return;
        }
        if (isScheduling && !scheduledTime) {
            showAlert("Por favor, selecciona una fecha y hora válidas para programar tu pedido.");
            return;
        }

        setIsSubmitting(true);
        try {
            const { data: orderData, error: orderError } = await supabase
                .from('orders').insert({
                    customer_id: customer.id,
                    total_amount: total,
                    status: 'pendiente',
                    scheduled_for: scheduledTime
                }).select().single();
            if (orderError) throw orderError;

            const orderItemsToInsert = cartItems.map(item => ({ order_id: orderData.id, product_id: item.id, quantity: item.quantity, price: item.price }));
            const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);
            if (itemsError) throw itemsError;

            if (discount && discount.details.is_single_use) {
                const { error: usageError } = await supabase.rpc('record_discount_usage_and_deactivate', {
                    p_customer_id: customer.id,
                    p_discount_id: discount.details.id
                });

                if (usageError) {
                    console.error("Error al registrar y desactivar el descuento:", usageError);
                }
            }

            let message = `¡Hola! 👋 Quiero hacer el siguiente pedido:\n\n*Pedido N°: ${orderData.order_code}*\n\n`;
            cartItems.forEach(item => {
                message += `• ${item.quantity}x ${item.name}\n`;
            });
            message += `\n*Total a pagar: $${total.toFixed(2)}*\n`;

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

            const businessNumber = import.meta.env.VITE_BUSINESS_PHONE;
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${businessNumber}&text=${encodeURIComponent(message)}`;

            showAlert(
                "¡Pedido guardado! Serás redirigido a WhatsApp para confirmar.",
                'info',
                () => {
                    window.open(whatsappUrl, '_blank');
                    clearCart();
                    toggleCart();
                    onClose();
                    refetchUserData();
                }
            );

        } catch (error) {
            console.error("Error al procesar el pedido:", error);
            showAlert(`Hubo un error al crear tu pedido: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleScheduleChange = (e) => {
        const { name, value } = e.target;
        setScheduleDetails(prev => ({...prev, [name]: value}));
    }


    if (isLoading) {
        // ... (spinner sin cambios) ...
    }
    if ((mode === 'profile' || !customer) && phone && !customer) {
        // ... (form de crear perfil sin cambios) ...
    }
    if (customer && addresses.length === 0) {
        // ... (lógica de forzar primera dirección sin cambios) ...
    }

    // Esta variable se mantiene igual
    const mapInitialPosition = selectedAddress ? { lat: selectedAddress.latitude, lng: selectedAddress.longitude } : null;

    return (
        <>
            <div className={styles.modalOverlay} onClick={onClose}>
                <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.header}>
                        <h3>Confirmar Pedido</h3>
                        <button onClick={onClose} className={styles.closeButton}>×</button>
                    </div>

                    {/* --- 👇 OPTIMIZACIÓN AQUÍ --- */}
                    {mapInitialPosition && (
                        <div className={styles.mapDisplay}>
                            {/* Reemplazamos el DynamicMapPicker interactivo... */}
                            {/* <ClientOnly key={`${selectedAddress?.id}-${selectedAddress?.latitude}`}>
                                <DynamicMapPicker
                                    initialPosition={mapInitialPosition}
                                    isDraggable={false}
                                />
                            </ClientOnly> 
                            */}
                            
                            {/* ...por nuestro nuevo StaticMap ligero */}
                            <StaticMap
                              latitude={mapInitialPosition.lat}
                              longitude={mapInitialPosition.lng}
                              height={220} // La altura está definida por el CSS
                            />
                            
                            <div className={styles.mapOverlay}></div>
                        </div>
                    )}
                    {/* --- FIN OPTIMIZACIÓN --- */}


                    <div className={styles.scrollableContent}>
                        {/* ... (Resto del modal: detalles, acciones, scheduling, summary) ... */}
                        <div className={styles.detailsGroup}>
                            <div className={styles.detailItem}>
                                <MapPinIcon />
                                <div>
                                    <strong>{selectedAddress?.label}</strong>
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
                            {addresses.length > 1 && (
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
                                        min={new Date().toISOString().split('T')[0]}
                                    />
                                    {/* ... (selects de hora) ... */}
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
                        <button onClick={placeOrder} className={styles.confirmButton} disabled={isSubmitting || !isBusinessOpen}>
                            {isSubmitting ? 'Procesando...' : (isBusinessOpen ? `Confirmar y Pagar $${(total || 0).toFixed(2)}` : 'Estamos Cerrados')}
                        </button>
                    </div>
                </div>
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
        </>
    );
}