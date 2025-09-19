// src/components/CheckoutModal.jsx (CORREGIDO Y AHORA CONTEXTUAL)

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import styles from './CheckoutModal.module.css';
import DynamicMapPicker from './DynamicMapPicker';
import ClientOnly from './ClientOnly';
import { useAlert } from '../context/AlertContext';
import { useUserData } from '../context/UserDataContext';

export default function CheckoutModal({ phone, onClose, mode = 'checkout' }) {
    const { showAlert } = useAlert();
    const { cartItems, total, clearCart, toggleCart } = useCart();
    const { refetch: refetchUserData } = useUserData();
    
    const [customer, setCustomer] = useState(null);
    const [addresses, setAddresses] = useState([]);
    const [selectedAddress, setSelectedAddress] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const [newLocation, setNewLocation] = useState({
        coords: null,
        label: 'Casa',
        reference: '',
        saveAddress: true
    });

    const [customerName, setCustomerName] = useState('');

    useEffect(() => {
        const findCustomer = async () => {
            if (!phone) {
                setIsLoading(false);
                return;
            };

            const { data } = await supabase
                .from('customers')
                .select(`*, customer_addresses(*)`)
                .eq('phone', phone)
                .maybeSingle();

            if (data) {
                setCustomer(data);
                setAddresses(data.customer_addresses || []);
                setCustomerName(data.name);
                if (data.customer_addresses && data.customer_addresses.length > 0) {
                    setSelectedAddress(data.customer_addresses[0]);
                }
            } else {
                setCustomer(null);
                setAddresses([]);
            }
            setIsLoading(false);
        };

        findCustomer();
    }, [phone]);

    const handleLocationSelect = useCallback((coords) => {
        setNewLocation(prev => ({ ...prev, coords }));
    }, []);

    const handleFormChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name === 'name') {
            setCustomerName(value);
        } else {
            setNewLocation(prev => ({
                ...prev,
                [name]: type === 'checkbox' ? checked : value
            }));
        }
    };

    // --- 👇 LA LÓGICA DE GUARDADO AHORA ES CONTEXTUAL ---
    const handleSubmit = async () => {
        const finalName = customer ? customer.name : customerName;
        if (!finalName) {
            showAlert("Por favor, dinos tu nombre.");
            return;
        }

        // En modo 'profile', la ubicación no es obligatoria.
        if (mode === 'checkout' && !selectedAddress && !newLocation.coords) {
            showAlert("Por favor, selecciona tu ubicación en el mapa para la entrega.");
            return;
        }

        setIsSubmitting(true);
        try {
            // Paso 1: Crear o actualizar el cliente (común para ambos modos).
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .upsert({ phone: phone, name: finalName }, { onConflict: 'phone' })
                .select()
                .single();
            if (customerError) throw customerError;

            // Paso 2: Si se añadió una nueva ubicación, guardarla.
            if (!selectedAddress && newLocation.coords && newLocation.saveAddress) {
                await supabase.from('customer_addresses').insert({
                    customer_id: customerData.id,
                    latitude: newLocation.coords.lat,
                    longitude: newLocation.coords.lng,
                    label: newLocation.label,
                    address_reference: newLocation.reference
                });
            }

            // Paso 3: Si estamos en modo 'checkout', procesar el pedido.
            if (mode === 'checkout') {
                await placeOrder(customerData);
            } else {
                // Si solo estamos en modo 'profile', mostramos éxito y cerramos.
                showAlert("¡Perfil guardado con éxito!");
                refetchUserData(); // Actualiza los datos en toda la app.
                onClose();
            }

        } catch (error) {
            console.error("Error al procesar:", error);
            showAlert(`Hubo un error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const placeOrder = async (customerData) => {
        let finalAddressDetails = selectedAddress;
        if (!selectedAddress) {
            finalAddressDetails = {
                latitude: newLocation.coords.lat,
                longitude: newLocation.coords.lng,
                address_reference: newLocation.reference
            };
        }

        const { data: orderData, error: orderError } = await supabase
            .from('orders').insert({ customer_id: customerData.id, total_amount: total, status: 'pendiente' }).select().single();
        if (orderError) throw orderError;

        const orderItemsToInsert = cartItems.map(item => ({ order_id: orderData.id, product_id: item.id, quantity: item.quantity, price: item.price }));
        const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);
        if (itemsError) throw itemsError;
        
        const mapLink = `https://www.google.com/maps?q=${finalAddressDetails.latitude},${finalAddressDetails.longitude}`;
        let message = `¡Hola! 👋 Pedido *${orderData.order_code}*.\n\n*Mi Pedido:*\n`;
        cartItems.forEach(item => { message += `- ${item.quantity}x ${item.name}\n`; });
        message += `\n*Total: $${total.toFixed(2)}*\n\n*Entregar a:*\n*Nombre:* ${customerData.name}\n*Ubicación:* ${mapLink}\n`;
        if (finalAddressDetails.address_reference) message += `*Referencia:* ${finalAddressDetails.address_reference}`;

        const businessNumber = '9633870587';
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${businessNumber}&text=${encodeURIComponent(message)}`;
        window.open(whatsappUrl, '_blank');

        showAlert("¡Pedido guardado! Serás redirigido a WhatsApp para confirmar.");
        clearCart();
        toggleCart();
        onClose();
    };
    // --- 👆 FIN DE LA LÓGICA CONTEXTUAL ---

    const renderStepContent = () => {
        if (isLoading) return <div className={styles.spinner}></div>;

        const isCheckout = mode === 'checkout';
        
        return (
            <div>
                <h3>{isCheckout ? `Hola, ${customerName || '¿dónde entregamos?'}` : 'Completa tu Perfil'}</h3>
                {!isCheckout && <p>Guarda tus datos para que tus futuros pedidos sean más rápidos.</p>}

                {addresses.length > 0 && (
                    <div className={styles.addressList}>
                        <p>Selecciona una ubicación guardada:</p>
                        {addresses.map(addr => (
                            <div key={addr.id} className={`${styles.addressItem} ${selectedAddress?.id === addr.id ? styles.selected : ''}`}
                                onClick={() => setSelectedAddress(addr)}>
                                <strong>{addr.label}</strong>
                                <p>Ubicación guardada.</p>
                                {addr.address_reference && <span>Ref: {addr.address_reference}</span>}
                            </div>
                        ))}
                        <button onClick={() => setSelectedAddress(null)} className={styles.buttonSecondary}>
                            + Usar una nueva ubicación
                        </button>
                    </div>
                )}

                {(addresses.length === 0 || !selectedAddress) && (
                    <div className={styles.formNewAddress}>
                         <ClientOnly>
                            <DynamicMapPicker onLocationSelect={handleLocationSelect} />
                        </ClientOnly>

                        {!customer && (
                            <input type="text" name="name" placeholder="Tu nombre completo" value={customerName} onChange={handleFormChange} className={styles.input} />
                        )}
                        <input type="text" name="reference" placeholder="Referencia (ej: casa azul, portón rojo)" value={newLocation.reference} onChange={handleFormChange} className={styles.input} />
                        <input type="text" name="label" placeholder="Etiqueta para esta ubicación (ej: Casa)" value={newLocation.label} onChange={handleFormChange} className={styles.input} />
                        
                        <div className={styles.checkboxContainer}>
                            <input type="checkbox" id="saveAddress" name="saveAddress" checked={newLocation.saveAddress} onChange={handleFormChange} />
                            <label htmlFor="saveAddress">Guardar esta ubicación para futuros pedidos.</label>
                        </div>
                    </div>
                )}

                <div className={styles.actions}>
                    <button onClick={onClose} className={styles.buttonSecondary}>Cancelar</button>
                    <button onClick={handleSubmit} className={styles.buttonPrimary} disabled={isSubmitting}>
                        {isSubmitting ? 'Procesando...' : 
                         isCheckout ? `Confirmar y Pagar $${total.toFixed(2)}` : 'Guardar Información'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <button onClick={onClose} className={styles.closeButton}>×</button>
                {renderStepContent()}
            </div>
        </div>
    );
}