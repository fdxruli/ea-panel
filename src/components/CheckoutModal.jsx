// src/components/CheckoutModal.jsx (CORREGIDO)

import React, { useState, useEffect, useCallback } from 'react'; // <-- 1. Importa useCallback
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import styles from './CheckoutModal.module.css';
import DynamicMapPicker from './DynamicMapPicker';
import ClientOnly from './ClientOnly';

export default function CheckoutModal({ phone, onClose }) {
    // ... (el resto del código del modal no cambia)
    const { cartItems, total, clearCart, toggleCart } = useCart();
    const [step, setStep] = useState(2);
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
                .single();

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

    // --- 👇 AQUÍ ESTÁ EL CAMBIO PRINCIPAL ---
    const handleLocationSelect = useCallback((coords) => {
        setNewLocation(prev => ({ ...prev, coords }));
    }, []); // <-- 2. Usa un array de dependencias vacío
    // -----------------------------------------

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

    const handlePlaceOrder = async () => {
        const finalName = customer ? customer.name : customerName;
        if (!finalName) {
            alert("Por favor, dinos tu nombre.");
            return;
        }
        if (!selectedAddress && !newLocation.coords) {
            alert("Por favor, selecciona tu ubicación en el mapa.");
            return;
        }

        setIsSubmitting(true);
        try {
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .upsert({ phone: phone, name: finalName }, { onConflict: 'phone' })
                .select()
                .single();
            if (customerError) throw customerError;

            const { data: latestTerms, error: termsError } = await supabase
                .from('terms_and_conditions')
                .select('id')
                .order('version', { ascending: false })
                .limit(1)
                .single();

            if (termsError || !latestTerms) throw new Error("No se pudieron cargar los términos y condiciones.");

            const { error: acceptanceError } = await supabase
                .from('customer_terms_acceptances')
                .insert({
                    customer_id: customerData.id,
                    terms_version_id: latestTerms.id
                });

            if (acceptanceError && acceptanceError.code !== '23505') {
                throw acceptanceError;
            }

            let finalAddressDetails = selectedAddress;

            if (!selectedAddress) {
                const newAddr = {
                    customer_id: customerData.id,
                    latitude: newLocation.coords.lat,
                    longitude: newLocation.coords.lng,
                    label: newLocation.label,
                    address_reference: newLocation.reference
                };
                if (newLocation.saveAddress) {
                    const { data: newAddressData, error: addressError } = await supabase
                        .from('customer_addresses')
                        .insert(newAddr)
                        .select()
                        .single();
                    if (addressError) throw addressError;
                    finalAddressDetails = newAddressData;
                } else {
                    finalAddressDetails = newAddr;
                }
            }

            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({ customer_id: customerData.id, total_amount: total, status: 'pendiente' })
                .select().single();
            if (orderError) throw orderError;

            const orderItemsToInsert = cartItems.map(item => ({
                order_id: orderData.id, product_id: item.id, quantity: item.quantity, price: item.price
            }));
            const { error: itemsError } = await supabase.from('order_items').insert(orderItemsToInsert);
            if (itemsError) throw itemsError;

            const mapLink = `http://googleusercontent.com/maps.google.com/5{finalAddressDetails.latitude},${finalAddressDetails.longitude}`;
            let message = `¡Hola! 👋 Pedido *${orderData.order_code}*.\n\n*Mi Pedido:*\n`;
            cartItems.forEach(item => {
                message += `- ${item.quantity}x ${item.name}\n`;
            });
            message += `\n*Total: $${total.toFixed(2)}*\n\n`;
            message += `*Entregar a:*\n`;
            message += `*Nombre:* ${customerData.name}\n`;
            message += `*Ubicación:* ${mapLink}\n`;
            if (finalAddressDetails.address_reference) message += `*Referencia:* ${finalAddressDetails.address_reference}`;

            const tuNumeroDeWhatsApp = '9633870587';
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${tuNumeroDeWhatsApp}&text=${encodeURIComponent(message)}`;
            window.open(whatsappUrl, '_blank');

            alert("¡Pedido guardado! Serás redirigido a WhatsApp para confirmar.");
            clearCart();
            toggleCart();
            onClose();

        } catch (error) {
            console.error("Error al procesar el pedido:", error);
            alert(`Hubo un error al procesar tu pedido: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStepContent = () => {
        if (isLoading) {
            return (
                <div>
                    <h3>Buscando tu información...</h3>
                    <div className={styles.spinner}></div>
                </div>
            );
        }

        return (
            <div>
                <h3>Hola, {customerName || '¿dónde entregamos?'}</h3>

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
                    <button onClick={handlePlaceOrder} className={styles.buttonPrimary} disabled={isSubmitting}>
                        {isSubmitting ? 'Procesando...' : `Confirmar y Pagar $${total.toFixed(2)}`}
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