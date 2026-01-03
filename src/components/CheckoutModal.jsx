// src/components/CheckoutModal.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCart } from '../context/CartContext';
import styles from './CheckoutModal.module.css';
import { useAlert } from '../context/AlertContext';
import { useUserData } from '../context/UserDataContext';
import { useBusinessHours } from '../context/BusinessHoursContext';

const GUEST_CUSTOMER_ID = '68491ec0-3198-4aca-89e4-8034ebe1e35f';

export default function CheckoutModal({ phone, onClose, setPhone }) { // Asumo que setPhone viene del padre si decides pedirlo
    const { showAlert } = useAlert();
    const { cartItems, total, subtotal, discount, clearCart, toggleCart } = useCart();
    const { customer, refetch: refetchUserData } = useUserData(); // Ya no necesitamos addresses obligatoriamente
    const { isOpen: isBusinessOpen } = useBusinessHours();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [mode, setMode] = useState('selection'); // 'selection', 'phone_input', 'guest_confirm'

    // Si ya hay un usuario logueado (customer real), saltamos al modo de confirmación normal
    useEffect(() => {
        if (customer) {
            setMode('logged_user_confirm');
        }
    }, [customer]);

    const handlePlaceOrder = async (isGuest) => {
        // 1. Validaciones previas
        if (!isBusinessOpen) {
            showAlert("El negocio está cerrado ahora.");
            return;
        }

        setIsSubmitting(true);

        try {
            const targetCustomerId = isGuest ? GUEST_CUSTOMER_ID : customer.id;

            // 2. Preparar items para la RPC
            const p_cart_items = cartItems.map(item => ({
                product_id: item.id,
                quantity: item.quantity,
                price: item.price,
                cost: item.cost || 0
            }));

            // 3. Llamar a la RPC
            const { data: orderData, error: rpcError } = await supabase.rpc('create_order_with_stock_check', {
                p_customer_id: targetCustomerId,
                p_total_amount: total,
                p_scheduled_for: null, // Asumiendo inmediato por ahora, o pasa tu variable scheduledTime si existe
                p_cart_items: p_cart_items
            });

            if (rpcError) throw rpcError;
            const newOrder = orderData[0];

            // 4. Lógica de Descuentos (Solo aplica si NO es invitado y hay descuento)
            if (!isGuest && discount && discount.details?.is_single_use) {
                await supabase.rpc('record_discount_usage_and_deactivate', {
                    p_customer_id: customer.id,
                    p_discount_id: discount.details.id
                });
            }

            // ==========================================
            // 5. CONSTRUCCIÓN DEL MENSAJE (DIFERENCIADO)
            // ==========================================

            let message = "";

            if (isGuest) {
                // --- CASO A: INVITADO (Minimalista) ---
                message = `Hola, quiero hacer el siguiente pedido:\n`;
                message += `*Pedido N°: ${newOrder.order_code}*\n\n`;

                cartItems.forEach(item => {
                    message += `• ${item.quantity}x ${item.name}\n`;
                });

                message += `\n*Total: $${total.toFixed(2)}*`;

                // ¡Listo! Nada de ubicación, nombres, ni saludos extras.

            } else {
                // --- CASO B: REGISTRADO (Tu formato detallado original) ---
                message = `¡Hola! 👋 Quiero confirmar mi pedido:\n`;
                message += `*Pedido N°: ${newOrder.order_code}*\n\n`;

                // Detalle items
                cartItems.forEach(item => {
                    message += `• ${item.quantity}x ${item.name}\n`;
                });

                // Detalle Financiero Completo
                if (discount) {
                    message += `\n*Subtotal:* $${subtotal.toFixed(2)}`;
                    message += `\n*Descuento (${discount.code}):* -$${discount.amount.toFixed(2)}`;
                    message += `\n*Total a pagar: $${total.toFixed(2)}*\n`;
                } else {
                    message += `\n*Total a pagar: $${total.toFixed(2)}*\n`;
                }
            }

            // 6. Enviar a WhatsApp y Limpiar
            const businessNumber = import.meta.env.VITE_BUSINESS_PHONE;
            const whatsappUrl = `https://api.whatsapp.com/send?phone=${businessNumber}&text=${encodeURIComponent(message)}`;

            // Pequeño delay para feedback visual antes de redirigir
            setTimeout(() => {
                window.open(whatsappUrl, '_blank');
                clearCart();
                toggleCart();
                onClose();
                // Solo recargamos datos si es usuario registrado para actualizar historial
                if (!isGuest) refetchUserData();
                setIsSubmitting(false);
            }, 1000);

        } catch (error) {
            console.error(error);
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
        // MODO 1: Selección inicial (¿Quieres dar tu número o no?)
        if (mode === 'selection' && !customer) {
            return (
                <div className={styles.selectionContainer}>
                    <h3>¿Cómo quieres continuar?</h3>
                    <p>Puedes agregar tu número para acumular puntos o pedir directamente.</p>

                    <button
                        className={styles.btnGuest}
                        onClick={() => setMode('guest_confirm')}
                    >
                        🚀 Enviar directo a WhatsApp (Rápido)
                    </button>

                    <button
                        className={styles.btnAuth}
                        onClick={() => onClose(true)} // Asumo que onClose(true) abre el modal de Login/Teléfono en el padre
                    >
                        📱 Ingresar mi número (Ganar Puntos)
                    </button>
                </div>
            );
        }

        // MODO 2: Confirmación para INVITADOS (Sin dirección, sin mapa)
        if (mode === 'guest_confirm') {
            return (
                <div className={styles.confirmContainer}>
                    <h3>Confirmar Pedido Rápido</h3>
                    <div className={styles.summaryCompact}>
                        <p>Total a pagar: <strong>${total.toFixed(2)}</strong></p>
                        <p className={styles.helperText}>
                            Al dar clic en enviar, se abrirá WhatsApp.
                            <strong>Por favor envíanos el mensaje para confirmar tu ubicación.</strong>
                        </p>
                    </div>
                    <button
                        className={styles.confirmButton}
                        onClick={() => handlePlaceOrder(true)}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Procesando...' : 'Enviar Pedido por WhatsApp 🟢'}
                    </button>
                    <button className={styles.backButton} onClick={() => setMode('selection')}>Atrás</button>
                </div>
            );
        }

        // MODO 3: Confirmación para USUARIOS REGISTRADOS (Tu flujo normal simplificado)
        if (mode === 'logged_user_confirm') {
            return (
                <div className={styles.confirmContainer}>
                    <h3>Hola {customer?.name}</h3>
                    {/* Aquí puedes poner tu selector de dirección si quieres mantenerlo para los registrados */}
                    <div className={styles.summaryCompact}>
                        <p>Total a pagar: <strong>${total.toFixed(2)}</strong></p>
                    </div>
                    <button
                        className={styles.confirmButton}
                        onClick={() => handlePlaceOrder(false)}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Procesando...' : 'Confirmar Pedido'}
                    </button>
                </div>
            );
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={() => onClose(false)}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <button onClick={() => onClose(false)} className={styles.closeButton}>×</button>
                </div>
                {renderContent()}
            </div>
        </div>
    );
}