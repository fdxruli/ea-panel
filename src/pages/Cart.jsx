import React, { useState, useEffect, useCallback } from 'react';
import { useCart } from '../context/CartContext';
import { useCustomer } from '../context/CustomerContext';
// --- ✅ 1. IMPORTAR useUserData ---
import { useUserData } from '../context/UserDataContext';
import styles from './Cart.module.css';
import CheckoutModal from '../components/CheckoutModal';
import { useAlert } from '../context/AlertContext';
import ShoppingCartIcon from '../assets/icons/shopping-cart.svg?react';
import ImageWithFallback from '../components/ImageWithFallback';

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

    const { phone, setPhoneModalOpen } = useCustomer();
    // --- ✅ 2. OBTENER CUSTOMER DE useUserData Y SU ESTADO DE CARGA ---
    const { customer, loading: userLoading } = useUserData(); // <-- Añadir loading

    const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
    const [discountCode, setDiscountCode] = useState('');
    const [discountMessage, setDiscountMessage] = useState('');
    const [isAnimating, setIsAnimating] = useState(false);
    const [isDiscountVisible, setDiscountVisible] = useState(false);

    useEffect(() => {
        if (isCartOpen) {
            const timer = setTimeout(() => setIsAnimating(true), 10);
            return () => clearTimeout(timer);
        } else {
             setIsAnimating(false); // Reset animation state on close
             setDiscountVisible(false); // Hide discount input on close
        }
    }, [isCartOpen]);


    const handleClose = useCallback(() => {
        setIsAnimating(false);
        setTimeout(toggleCart, 600); // Wait for animation
    }, [toggleCart]);


    const handleApplyDiscount = async () => {
        if (!discountCode.trim()) return;

        // --- ✅ 3. VALIDACIÓN ANTES DE LLAMAR A applyDiscount ---
        // Verificar si la información del cliente aún está cargando o no existe
        if (userLoading) {
            setDiscountMessage('Espera, estamos cargando tu información...');
            setTimeout(() => setDiscountMessage(''), 3000);
            return;
        }
        if (!customer?.id) {
            // Este caso es más probable si el usuario no ha iniciado sesión
            setDiscountMessage('Debes iniciar sesión para usar un código.');
            // No limpiar este mensaje automáticamente
            return;
        }
        // --- FIN VALIDACIÓN ---

        // Se usa el ID del cliente del contexto UserData, que es la fuente principal de datos del cliente logueado.
        const result = await applyDiscount(discountCode, customer.id); // Ahora sabemos que customer.id existe
        setDiscountMessage(result.message);

        // Limpiar mensaje después de 3 segundos solo si fue exitoso o inválido, no si requiere login
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
            showAlert("Por favor, revisa que todos los productos tengan una cantidad válida."); return;
        }
        if (!phone) {
             // If phone is missing, open phone modal. On success, it will open checkout.
            setPhoneModalOpen(() => { setCheckoutModalOpen(true); }); return;
        }
         // If phone exists, proceed directly to checkout.
        setCheckoutModalOpen(true);
    };

    // Use isCartOpen directly for rendering check
    if (!isCartOpen) return null;


    return (
        <>
            {/* Overlay */}
            <div className={`${styles.overlay} ${isCartOpen && isAnimating ? styles.open : ''}`} onClick={handleClose}></div>

            {/* Sidebar */}
            <div className={`${styles.cartSidebar} ${isCartOpen && isAnimating ? styles.open : ''}`}>
                {/* Header */}
                <div className={styles.cartHeader}>
                    <h2 className={styles.cartTitle}><ShoppingCartIcon /> Tu Pedido</h2>
                    <button onClick={handleClose} className={styles.closeButton}>×</button>
                </div>

                 {/* Notification Area */}
                 {cartNotification && (
                    <div className={styles.cartNotification}>
                        <p>{cartNotification}</p>
                        <button onClick={clearCartNotification}>&times;</button>
                    </div>
                )}

                {/* Cart Body */}
                {cartItems.length === 0 ? (
                    <div className={styles.cartBody}>
                        <p className={styles.emptyMessage}>Tu carrito está vacío. ¡Añade unas alitas!</p>
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
                                                <button onClick={() => removeFromCart(item.id)} className={`${styles.quantityButton} ${styles.deleteButton}`} aria-label="Eliminar producto">
                                                    <TrashIcon />
                                                </button>
                                            ) : (
                                                <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className={styles.quantityButton} aria-label="Disminuir cantidad">
                                                    -
                                                </button>
                                            )}
                                            <span className={styles.quantityDisplay}>{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className={styles.quantityButton} aria-label="Aumentar cantidad">
                                                +
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Cart Footer */}
                        <div className={styles.cartFooter}>
                             <div className={styles.discountAccordion}>
                                {!discount && (
                                    <button
                                        onClick={() => setDiscountVisible(!isDiscountVisible)}
                                        className={styles.discountToggleButton}
                                    >
                                        ¿Tienes un código? Haz clic aquí {isDiscountVisible ? '▲' : '▼'}
                                    </button>
                                )}

                                <div className={`${styles.discountAccordionContent} ${isDiscountVisible || discount ? styles.open : ''}`}>
                                    {!discount && (
                                        <div className={styles.discountSection}>
                                            <input type="text" placeholder="Código de descuento" value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} className={styles.discountInput} />
                                            <button onClick={handleApplyDiscount} className={styles.applyButton}>Aplicar</button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Discount Message */}
                            {discountMessage && <p className={styles.discountMessage}>{discountMessage}</p>}

                            {/* Totals */}
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

                            {/* Checkout Button */}
                            <button onClick={handleProceedToCheckout} className={styles.whatsappButton}>
                                {phone ? 'Continuar con mi Pedido' : 'Ingresa tu número para continuar'}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* Checkout Modal */}
            {isCheckoutModalOpen && (
                <CheckoutModal
                    phone={phone}
                    onClose={() => setCheckoutModalOpen(false)}
                />
            )}
        </>
    );
}