// src/pages/Cart.jsx (COMPLETO Y CORREGIDO)

import React, { useState } from 'react';
import { useCart } from '../context/CartContext';
import { useCustomer } from '../context/CustomerContext';
import styles from './Cart.module.css';
import CheckoutModal from '../components/CheckoutModal';

export default function Cart() {
    const {
        cartItems,
        updateQuantity,
        removeFromCart,
        subtotal,
        total,
        discount,
        applyDiscount,
        removeDiscount,
        isCartOpen,
        toggleCart,
        cartNotification,
        clearCartNotification
    } = useCart();

    const { phone, setPhoneModalOpen } = useCustomer();
    const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
    const [discountCode, setDiscountCode] = useState('');
    const [discountMessage, setDiscountMessage] = useState('');

    // --- LÓGICA QUE FALTABA ---
    const handleApplyDiscount = async () => {
        if (!discountCode.trim()) return;
        const result = await applyDiscount(discountCode);
        setDiscountMessage(result.message);
        // Limpia el mensaje después de 3 segundos
        setTimeout(() => setDiscountMessage(''), 3000);
    };

    // --- LÓGICA QUE FALTABA ---
    const handleRemoveDiscount = () => {
        removeDiscount();
        setDiscountCode('');
        setDiscountMessage('');
    };

    // --- LÓGICA QUE FALTABA ---
    const handleProceedToCheckout = () => {
        if (cartItems.length === 0) {
            alert("Tu carrito está vacío.");
            return;
        }
        if (cartItems.some(item => !item.quantity || item.quantity <= 0)) {
            alert("Por favor, revisa que todos los productos tengan una cantidad válida.");
            return;
        }

        if (!phone) {
            setPhoneModalOpen(true);
            return;
        }

        setCheckoutModalOpen(true);
    };


    if (!isCartOpen) return null;

    return (
        <>
            <div className={styles.overlay} onClick={toggleCart}></div>

            <div className={`${styles.cartSidebar} ${isCartOpen ? styles.open : ''}`}>
                <div className={styles.cartHeader}>
                    <h2>🛒 Tu Pedido</h2>
                    <button onClick={toggleCart} className={styles.closeButton}>×</button>
                </div>

                {cartNotification && (
                    <div className={styles.cartNotification}>
                        <p>{cartNotification}</p>
                        <button onClick={clearCartNotification}>&times;</button>
                    </div>
                )}
                {cartItems.length === 0 ? (
                    <p className={styles.emptyMessage}>Tu carrito está vacío. ¡Añade unas alitas!</p>
                ) : (
                    <div className={styles.cartBody}>
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
                            {!discount && (
                                <div className={styles.discountSection}>
                                    <input
                                        type="text"
                                        placeholder="Código de descuento"
                                        value={discountCode}
                                        onChange={(e) => setDiscountCode(e.target.value)}
                                        className={styles.discountInput}
                                    />
                                    <button onClick={handleApplyDiscount} className={styles.applyButton}>
                                        Aplicar
                                    </button>
                                </div>
                            )}
                            
                            {discountMessage && <p className={styles.discountMessage}>{discountMessage}</p>}

                            <div className={styles.totals}>
                                <p>Subtotal: <span>${subtotal.toFixed(2)}</span></p>
                                {discount && (
                                    <p className={styles.discountApplied}>
                                        Descuento ({discount.code}): <span>-${discount.amount.toFixed(2)}</span>
                                        <button onClick={handleRemoveDiscount}>Quitar</button>
                                    </p>
                                )}
                                <h3 className={styles.total}>Total: <span>${total.toFixed(2)}</span></h3>
                            </div>

                            <button onClick={handleProceedToCheckout} className={styles.whatsappButton}>
                                {phone ? 'Continuar con mi Pedido' : 'Ingresa tu número para continuar'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {isCheckoutModalOpen && (
                <CheckoutModal
                    phone={phone}
                    onClose={() => setCheckoutModalOpen(false)}
                />
            )}
        </>
    );
}