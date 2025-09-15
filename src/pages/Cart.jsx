// src/pages/Cart.jsx (MODIFICADO)

import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import styles from './Cart.module.css';
import CheckoutModal from '../components/CheckoutModal';

export default function Cart() {
    const { cartItems, updateQuantity, removeFromCart, total, isCartOpen, toggleCart } = useCart();
    
    // 1. Estados para el modal y el número de teléfono
    const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
    const [customerPhone, setCustomerPhone] = useState('');

    const handleProceedToCheckout = () => {
        // Validación del carrito
        if (cartItems.length === 0) {
            alert("Tu carrito está vacío.");
            return;
        }
        if (cartItems.some(item => !item.quantity || item.quantity <= 0)) {
            alert("Por favor, revisa que todos los productos tengan una cantidad válida.");
            return;
        }
        // Validación del teléfono
        if (!/^\d{10,12}$/.test(customerPhone)) {
            alert("Por favor, ingresa un número de WhatsApp válido (10-12 dígitos) para continuar.");
            return;
        }
        
        setCheckoutModalOpen(true); // Abre el modal de checkout
    };
    
    if (!isCartOpen) return null;
    
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
                                            onChange={(e) => updateQuantity(item.id, e.target.value)}
                                            min="1"
                                        />
                                        <button onClick={() => removeFromCart(item.id)}>🗑️</button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={styles.cartFooter}>
                            <h3 className={styles.total}>Total: ${total.toFixed(2)}</h3>
                            
                            {/* 2. Formulario simplificado solo para el teléfono */}
                            <div className={styles.checkoutForm}>
                                <h4>Ingresa tu WhatsApp para continuar</h4>
                                <input 
                                    type="tel" 
                                    name="phone" 
                                    placeholder="Tu número de WhatsApp" 
                                    value={customerPhone}
                                    onChange={(e) => setCustomerPhone(e.target.value)} 
                                />
                            </div>
                            <button onClick={handleProceedToCheckout} className={styles.whatsappButton}>
                                Continuar con mi Pedido
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* 3. Se pasa el teléfono al modal para que maneje la lógica */}
            {isCheckoutModalOpen && (
                <CheckoutModal 
                    phone={customerPhone}
                    onClose={() => setCheckoutModalOpen(false)} 
                />
            )}
        </>
    );
}