// src/pages/Cart.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useCart } from '../context/CartContext';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import styles from './Cart.module.css';
import { useAlert } from '../context/AlertContext';
import ShoppingCartIcon from '../assets/icons/shopping-cart.svg?react';
import ImageWithFallback from '../components/ImageWithFallback';

// Nota: Ya NO importamos CheckoutModal aquí
// import CheckoutModal from '../components/CheckoutModal'; 

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
);

export default function Cart() {
    const { showAlert } = useAlert();
    const {
        cartItems, updateQuantity, removeFromCart, subtotal, total, discount,
        applyDiscount, removeDiscount, isCartOpen, toggleCart,
        cartNotification, clearCartNotification
    } = useCart();

    // ✅ Traemos setCheckoutModalOpen del contexto global
    const { setCheckoutModalOpen } = useCustomer();
    const { customer, loading: userLoading } = useUserData();

    // ❌ Ya no necesitamos estado local para el modal
    // const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
    
    const [discountCode, setDiscountCode] = useState('');
    const [discountMessage, setDiscountMessage] = useState('');
    const [isAnimating, setIsAnimating] = useState(false);
    const [isDiscountVisible, setDiscountVisible] = useState(false);

    useEffect(() => {
        if (isCartOpen) {
            const timer = setTimeout(() => setIsAnimating(true), 10);
            return () => clearTimeout(timer);
        } else {
             setIsAnimating(false);
             setDiscountVisible(false);
        }
    }, [isCartOpen]);

    const handleClose = useCallback(() => {
        setIsAnimating(false);
        setTimeout(toggleCart, 600);
    }, [toggleCart]);

    const handleApplyDiscount = async () => {
        if (!discountCode.trim()) return;
        if (userLoading) {
            setDiscountMessage('Cargando información...');
            return;
        }
        if (!customer?.id) {
            setDiscountMessage('Debes iniciar sesión para usar un código.');
            return;
        }
        const result = await applyDiscount(discountCode, customer.id);
        setDiscountMessage(result.message);
        if (result.success || result.message !== 'Debes iniciar sesión para usar un código.') {
            setTimeout(() => setDiscountMessage(''), 3000);
        }
    };

    const handleRemoveDiscount = () => {
        removeDiscount(); setDiscountCode(''); setDiscountMessage('');
    };

    const handleProceedToCheckout = () => {
        if (cartItems.length === 0) { showAlert("Tu carrito está vacío."); return; }
        if (cartItems.some(item => !item.quantity || item.quantity <= 0)) {
            showAlert("Revisa las cantidades de tus productos."); return;
        }
        
        // ✅ 1. Cerramos el carrito para que no estorbe visualmente
        toggleCart();
        
        // ✅ 2. Abrimos el Checkout Modal GLOBAL (que vive en ClientLayout)
        setCheckoutModalOpen(true);
    };

    if (!isCartOpen) return null;

    return (
        <>
            <div className={`${styles.overlay} ${isCartOpen && isAnimating ? styles.open : ''}`} onClick={handleClose}></div>

            <div className={`${styles.cartSidebar} ${isCartOpen && isAnimating ? styles.open : ''}`}>
                <div className={styles.cartHeader}>
                    <h2 className={styles.cartTitle}><ShoppingCartIcon /> Tu Pedido</h2>
                    <button onClick={handleClose} className={styles.closeButton}>×</button>
                </div>

                 {cartNotification && (
                    <div className={styles.cartNotification}>
                        <p>{cartNotification}</p>
                        <button onClick={clearCartNotification}>&times;</button>
                    </div>
                )}

                {cartItems.length === 0 ? (
                    <div className={styles.cartBody}>
                        <p className={styles.emptyMessage}>Tu carrito está vacío.</p>
                    </div>
                ) : (
                    <>
                        <div className={styles.cartBody}>
                            <div className={styles.cartItemsList}>
                                {cartItems.map(item => (
                                    <div key={item.id} className={styles.cartItem}>
                                        <ImageWithFallback
                                            src={item.image_url}
                                            alt={item.name}
                                        />
                                        <div className={styles.itemInfo}>
                                            <span className={styles.itemName}>{item.name}</span>
                                            <span className={styles.itemPrice}>${item.price.toFixed(2)}</span>
                                        </div>
                                        <div className={styles.itemActions}>
                                            {item.quantity === 1 ? (
                                                <button onClick={() => removeFromCart(item.id)} className={`${styles.quantityButton} ${styles.deleteButton}`}>
                                                    <TrashIcon />
                                                </button>
                                            ) : (
                                                <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className={styles.quantityButton}>
                                                    -
                                                </button>
                                            )}
                                            <span className={styles.quantityDisplay}>{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className={styles.quantityButton}>
                                                +
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={styles.cartFooter}>
                             <div className={styles.discountAccordion}>
                                {!discount && (
                                    <button onClick={() => setDiscountVisible(!isDiscountVisible)} className={styles.discountToggleButton}>
                                        ¿Tienes un código? {isDiscountVisible ? '▲' : '▼'}
                                    </button>
                                )}
                                <div className={`${styles.discountAccordionContent} ${isDiscountVisible || discount ? styles.open : ''}`}>
                                    {!discount && (
                                        <div className={styles.discountSection}>
                                            <input type="text" placeholder="Código" value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} className={styles.discountInput} />
                                            <button onClick={handleApplyDiscount} className={styles.applyButton}>Aplicar</button>
                                        </div>
                                    )}
                                </div>
                            </div>

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
                                Realizar Pedido
                            </button>
                        </div>
                    </>
                )}
            </div>
            
            {/* ❌ ELIMINADO: Ya no renderizamos el modal localmente */}
        </>
    );
}