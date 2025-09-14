// src/pages/Cart.jsx (MODIFICADO)

import React, { useState, useEffect } from 'react'; // <-- Importa useEffect
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';
import styles from './Cart.module.css';

export default function Cart() {
    const { cartItems, updateQuantity, removeFromCart, total, clearCart, isCartOpen, toggleCart } = useCart();
    const [customer, setCustomer] = useState({ name: '', phone: '', address: '', address_reference: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [foundCustomer, setFoundCustomer] = useState(null); // <-- NUEVO: Para guardar el cliente encontrado

    // --- NUEVA LÓGICA PARA BUSCAR CLIENTE ---
    useEffect(() => {
        // Se ejecuta cuando el usuario deja de escribir en el campo de teléfono
        const phoneInputTimer = setTimeout(() => {
            if (customer.phone && customer.phone.length >= 10) {
                searchCustomerByPhone(customer.phone);
            } else {
                setFoundCustomer(null); // Limpia si el teléfono es muy corto
            }
        }, 500); // Esperamos 500ms para no buscar en cada pulsación

        return () => clearTimeout(phoneInputTimer);
    }, [customer.phone]);

    // Función para buscar en Supabase por número de teléfono
    const searchCustomerByPhone = async (phone) => {
        const { data, error } = await supabase
            .from('customers')
            .select('*')
            .eq('phone', phone)
            .single(); // Usamos .single() para esperar solo un resultado

        if (data) {
            setFoundCustomer(data);
        } else {
            setFoundCustomer(null);
        }
    };

    // Función para rellenar el formulario con los datos encontrados
    const useLastAddress = () => {
        if (foundCustomer) {
            setCustomer({
                name: foundCustomer.name,
                phone: foundCustomer.phone,
                address: foundCustomer.address,
                address_reference: foundCustomer.address_reference || ''
            });
            setFoundCustomer(null); // Ocultamos el botón una vez usado
        }
    };
    // ------------------------------------------

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setCustomer(prev => ({ ...prev, [name]: value }));
    };

    const handlePlaceOrder = async () => {
        // 1. Validaciones
        if (cartItems.length === 0) {
            alert("Tu carrito está vacío.");
            return;
        }
        if (!customer.name || !customer.phone || !customer.address) {
            alert("Por favor, completa tu nombre, teléfono y dirección.");
            return;
        }
        if (!/^\d{10,12}$/.test(customer.phone)) {
            alert("Por favor, ingresa un número de teléfono válido (entre 10 y 12 dígitos).");
            return;
        }

        setIsSubmitting(true);

        try {
            // 2. Guardar el cliente en Supabase (upsert se encarga de crear o actualizar)
            const { data: customerData, error: customerError } = await supabase
                .from('customers')
                .upsert({ 
                    name: customer.name, 
                    phone: customer.phone, 
                    address: customer.address, 
                    address_reference: customer.address_reference 
                }, { onConflict: 'phone' })
                .select()
                .single();

            if (customerError) throw customerError;

            // ... El resto de la función (crear pedido, items y WhatsApp) sigue igual ...
            // 3. Crear el pedido en la tabla 'orders'
            const { data: orderData, error: orderError } = await supabase
                .from('orders')
                .insert({
                    customer_id: customerData.id,
                    total_amount: total,
                    status: 'pendiente'
                })
                .select()
                .single();

            if (orderError) throw orderError;

            // 4. Guardar los items del pedido en 'order_items'
            const orderItemsToInsert = cartItems.map(item => ({
                order_id: orderData.id,
                product_id: item.id,
                quantity: item.quantity,
                price: item.price
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItemsToInsert);

            if (itemsError) throw itemsError;

            // 5. Construir el mensaje para WhatsApp
            let message = `¡Hola! 👋 Quiero hacer el pedido *${orderData.order_code}*.\n\n*Mi Pedido:*\n`;
            cartItems.forEach(item => {
                message += `- ${item.quantity}x ${item.name}\n`;
            });
            message += `\n*Total a Pagar: $${total.toFixed(2)}*\n\n`;
            message += `*Mis Datos de Entrega:*\n`;
            message += `*Nombre:* ${customer.name}\n`;
            message += `*Dirección:* ${customer.address}\n`;
            if(customer.address_reference) message += `*Referencia:* ${customer.address_reference}`;

            // 6. Redirigir a WhatsApp
            const tuNumeroDeWhatsApp = '9633870587'; 
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${tuNumeroDeWhatsApp}&text=${encodeURIComponent(message)}`;
            
            window.open(whatsappUrl, '_blank');

            // 7. Limpiar y dar retroalimentación
            alert("¡Pedido guardado! Serás redirigido a WhatsApp para confirmar.");
            clearCart();
            toggleCart();

        } catch (error) {
            console.error("Error al procesar el pedido:", error);
            alert(`Hubo un error al procesar tu pedido: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isCartOpen) {
        return null;
    }
    
    return (
        <>
            <div className={styles.overlay} onClick={toggleCart}></div>

            <div className={styles.cartSidebar}>
                <div className={styles.cartHeader}>
                    <h2>🛒 Tu Pedido</h2>
                    <button onClick={toggleCart} className={styles.closeButton}>×</button>
                </div>

                {cartItems.length === 0 ? (
                    <p className={styles.emptyMessage}>Tu carrito está vacío. ¡Añade unas alitas!</p>
                ) : (
                    <>
                        <div className={styles.cartItemsList}>
                            {cartItems.map(item => (
                                <div key={item.id} className={styles.cartItem}>
                                    <img src={item.image_url || 'https://via.placeholder.com/80'} alt={item.name} />
                                    <div className={styles.itemInfo}>
                                        <span className={styles.itemName}>{item.name}</span>
                                        <span className={styles.itemPrice}>${item.price.toFixed(2)}</span>
                                    </div>
                                    <div className={styles.itemActions}>
                                        <input
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => updateQuantity(item.id, parseInt(e.target.value))}
                                            min="1"
                                        />
                                        <button onClick={() => removeFromCart(item.id)}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={styles.cartFooter}>
                            <h3 className={styles.total}>Total: ${total.toFixed(2)}</h3>

                            <div className={styles.checkoutForm}>
                                <h4>Completa tus datos para finalizar</h4>

                                {/* --- NUEVO BOTÓN PARA AUTOCOMPLETAR --- */}
                                {foundCustomer && (
                                    <button onClick={useLastAddress} className={styles.useLastAddressButton}>
                                        ¿Eres {foundCustomer.name}? Usar mi última dirección
                                    </button>
                                )}
                                {/* --------------------------------------- */}

                                <input type="text" name="name" placeholder="Tu nombre completo" value={customer.name} onChange={handleInputChange} />
                                <input type="tel" name="phone" placeholder="Tu número de WhatsApp" value={customer.phone} onChange={handleInputChange} />
                                <input type="text" name="address" placeholder="Tu dirección de entrega" value={customer.address} onChange={handleInputChange} />
                                <input type="text" name="address_reference" placeholder="Referencia (ej: casa azul)" value={customer.address_reference} onChange={handleInputChange} />
                            </div>

                            <button onClick={handlePlaceOrder} className={styles.whatsappButton} disabled={isSubmitting}>
                                {isSubmitting ? 'Procesando...' : 'Confirmar y Enviar por WhatsApp'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
