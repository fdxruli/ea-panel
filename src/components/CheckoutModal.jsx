// src/components/CheckoutModal.jsx (CORREGIDO)

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import styles from './CheckoutModal.module.css';
import DynamicMapPicker from './DynamicMapPicker';
import ClientOnly from './ClientOnly';
import { useAlert } from '../context/AlertContext';
import { useUserData } from '../context/UserDataContext';
import AddressModal from './AddressModal';

// --- Iconos ---
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
    const { showAlert } = useAlert();
    const { cartItems, total, subtotal, discount, clearCart, toggleCart } = useCart();
    const { customer, addresses, refetch: refetchUserData } = useUserData();
    
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isAddressModalOpen, setAddressModalOpen] = useState(false);
    const [addressToEdit, setAddressToEdit] = useState(null);
    const [justSavedAddressId, setJustSavedAddressId] = useState(null);

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
            setIsLoading(false);
        } else if (customer && addresses.length === 0) {
            setIsLoading(false); 
        } else if (!customer && phone) {
            setIsLoading(false); 
        }
    }, [customer, addresses, phone, justSavedAddressId, selectedAddress]);

    const openAddressModal = (address) => {
        setAddressToEdit(address);
        setAddressModalOpen(true);
    };

    const handleSaveAddress = async (addressData, addressId) => {
        let response;
        if (addressId) {
            response = await supabase.from('customer_addresses').update(addressData).eq('id', addressId).select().single();
        } else {
            response = await supabase.from('customer_addresses').insert(addressData).select().single();
        }
        if (response.error) throw new Error(response.error.message);

        setJustSavedAddressId(response.data.id); 

        showAlert(`Dirección ${addressId ? 'actualizada' : 'guardada'} con éxito.`);
        refetchUserData(); 
        setAddressModalOpen(false);
        setAddressToEdit(null);
    };

    const placeOrder = async () => {
        if (!selectedAddress) {
            showAlert("Por favor, selecciona o añade una dirección de entrega.");
            return;
        }

        setIsSubmitting(true);
        try {
            const { data: orderData, error: orderError } = await supabase
                .from('orders').insert({ customer_id: customer.id, total_amount: total, status: 'pendiente' }).select().single();
            if (orderError) throw orderError;

            const orderItemsToInsert = cartItems.map(item => ({ order_id: orderData.id, product_id: item.id, quantity: item.quantity, price: item.price }));
            const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);
            if (itemsError) throw itemsError;
            
            const mapLink = `https://www.google.com/maps/search/?api=1&query=${selectedAddress?.latitude},${selectedAddress?.longitude}`;
            let message = `¡Hola! 👋 Pedido *${orderData.order_code}*.\n\n*Mi Pedido:*\n`;
            cartItems.forEach(item => { message += `- ${item.quantity}x ${item.name}\n`; });
            message += `\n*Total: $${total.toFixed(2)}*\n\n*Entregar a:*\n*Nombre:* ${customer?.name}\n*Ubicación:* ${mapLink}\n`;
            if (selectedAddress?.address_reference) message += `*Referencia:* ${selectedAddress.address_reference}`;

            const businessNumber = '9633870587';
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${businessNumber}&text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');

            showAlert("¡Pedido guardado! Serás redirigido a WhatsApp para confirmar.");
            clearCart();
            toggleCart();
            onClose();
            refetchUserData();

        } catch (error) {
            console.error("Error al procesar el pedido:", error);
            showAlert(`Hubo un error al crear tu pedido: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    if (isLoading) {
        return (
            <div className={styles.modalOverlay}>
                <div className={styles.spinner}></div>
            </div>
        );
    }
    
    if (!customer || addresses.length === 0) {
        return (
             <AddressModal
                isOpen={true}
                onClose={onClose}
                onSave={handleSaveAddress}
                address={null}
                customerId={customer?.id}
            />
        )
    }

    const mapInitialPosition = selectedAddress ? { lat: selectedAddress.latitude, lng: selectedAddress.longitude } : null;

    return (
        <>
            <div className={styles.modalOverlay} onClick={onClose}>
                <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.header}>
                        <h3>Confirmar Pedido</h3>
                        <button onClick={onClose} className={styles.closeButton}>×</button>
                    </div>

                    {mapInitialPosition && (
                        <div className={styles.mapDisplay}>
                            {/* --- 👇 AQUÍ ESTÁ LA CORRECCIÓN CLAVE --- */}
                            {/* Al cambiar el 'key', React desmontará el componente anterior y montará uno nuevo */}
                            <ClientOnly key={selectedAddress?.id}>
                                <DynamicMapPicker initialPosition={mapInitialPosition} />
                            </ClientOnly>
                            {/* --- 👆 FIN DE LA CORRECCIÓN --- */}
                            <div className={styles.mapOverlay}></div>
                        </div>
                    )}

                    <div className={styles.scrollableContent}>
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
                        <button onClick={placeOrder} className={styles.confirmButton} disabled={isSubmitting}>
                            {isSubmitting ? 'Procesando...' : `Confirmar y Pagar $${total.toFixed(2)}`}
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
                />
            )}
        </>
    );
}