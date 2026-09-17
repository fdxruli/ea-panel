import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import styles from './Cart.module.css';
import { useAlert } from '../context/AlertContext';
import ShoppingCartIcon from '../assets/icons/shopping-cart.svg?react';
import ImageWithFallback from '../components/ImageWithFallback';
import ConfirmModal from '../components/ConfirmModal';
import { NETWORK_STATUS } from '../lib/networkState';
import { useSettings } from '../context/SettingsContext';
import { supabase } from '../lib/supabaseClient';

const EmptyCartIcon = () => (
    <svg width="68" height="68" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.emptyCartSvg}>
        <circle cx="9" cy="21" r="1" />
        <circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
);

const TrashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
    </svg>
);

export default function Cart({ networkState }) {
    const { showAlert } = useAlert();
    const location = useLocation();
    const navigate = useNavigate();
    const isMenuRoute = location.pathname === '/';

    const {
        cartItems, updateQuantity, removeFromCart, clearCart, subtotal, total, discount,
        applyDiscount, removeDiscount, isCartOpen, toggleCart,
        cartNotification, clearCartNotification
    } = useCart();

    const { setCheckoutModalOpen, setPhoneModalOpen } = useCustomer();
    const { customer, loading: userLoading } = useUserData();
    const {
        status: networkStatus,
        isChecking,
        hasResolvedOnce,
    } = networkState;

    // ❌ Ya no necesitamos estado local para el modal
    // const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);

    const { getSetting } = useSettings();
    const welcomeReward = getSetting('welcome_reward');

    const welcomeCode = React.useMemo(() => {
        if (customer?.has_made_first_purchase) {
            localStorage.removeItem('ACTIVE_WELCOME_DISCOUNT');
            return null;
        }
        const stored = localStorage.getItem('ACTIVE_WELCOME_DISCOUNT');
        if (stored) return stored;
        if (customer?.referrer_id && !customer?.has_made_first_purchase && (welcomeReward?.enabled ?? true)) {
            return welcomeReward?.discount_code || 'AMIGONUEVO';
        }
        return null;
    }, [customer?.has_made_first_purchase, customer?.referrer_id, welcomeReward]);

    const [discountCode, setDiscountCode] = useState('');
    const [discountMessage, setDiscountMessage] = useState('');
    const [isAnimating, setIsAnimating] = useState(false);
    const [isDiscountVisible, setDiscountVisible] = useState(false);
    const [isClearModalOpen, setClearModalOpen] = useState(false);
    const [availableCoupons, setAvailableCoupons] = useState([]);
    const [loadingCoupons, setLoadingCoupons] = useState(false);
    const closeTimerRef = useRef(null);

    const fetchAvailableCoupons = useCallback(async () => {
        if (!customer?.id) {
            setAvailableCoupons([]);
            return;
        }
        setLoadingCoupons(true);
        try {
            const { data: customerDiscounts, error: discErr } = await supabase
                .from('discounts')
                .select('*')
                .eq('specific_customer_id', customer.id)
                .eq('is_active', true);

            if (discErr || !customerDiscounts || customerDiscounts.length === 0) {
                setAvailableCoupons([]);
                return;
            }

            const { data: usages } = await supabase
                .from('customer_discount_usage')
                .select('discount_id')
                .eq('customer_id', customer.id);

            const usedIds = new Set((usages || []).map((u) => u.discount_id));
            const activeUnused = customerDiscounts.filter((d) => !usedIds.has(d.id));
            setAvailableCoupons(activeUnused);
        } catch (err) {
            console.error('Error al cargar cupones disponibles:', err);
        } finally {
            setLoadingCoupons(false);
        }
    }, [customer?.id]);

    useEffect(() => {
        if (isCartOpen && customer?.id) {
            fetchAvailableCoupons();
        }
    }, [isCartOpen, customer?.id, fetchAvailableCoupons]);

    const handleEmptyStateAction = () => {
        handleClose();
        if (!isMenuRoute) {
            navigate('/');
        }
    };

    const handleConfirmClear = () => {
        clearCart();
        setClearModalOpen(false);
    };

    const isInitialVerification = !hasResolvedOnce && isChecking;
    const isNetworkBlocked = !hasResolvedOnce || networkStatus !== NETWORK_STATUS.ONLINE;
    const checkoutButtonLabel = isInitialVerification
        ? 'Verificando conexión...'
        : isNetworkBlocked
            ? 'Esperando conexión estable...'
            : 'Realizar Pedido';

    useEffect(() => {
        if (isCartOpen) {
            const timer = setTimeout(() => setIsAnimating(true), 10);
            return () => clearTimeout(timer);
        } else {
             setIsAnimating(false);
             setDiscountVisible(false);
             if (closeTimerRef.current) {
                 clearTimeout(closeTimerRef.current);
                 closeTimerRef.current = null;
             }
             return undefined;
        }
    }, [isCartOpen]);

    useEffect(() => () => {
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    }, []);

    const handleClose = useCallback(() => {
        setIsAnimating(false);
        if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
        closeTimerRef.current = window.setTimeout(() => {
            closeTimerRef.current = null;
            toggleCart();
        }, 600);
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

    const handleApplyWelcomeCode = async (codeToApply) => {
        if (!codeToApply) return;
        setDiscountCode(codeToApply);
        if (userLoading) {
            setDiscountMessage('Cargando información...');
            return;
        }
        if (!customer?.id) {
            setDiscountMessage('Debes iniciar sesión para usar un código.');
            return;
        }
        const result = await applyDiscount(codeToApply, customer.id);
        setDiscountMessage(result.message);
        if (result.success || result.message !== 'Debes iniciar sesión para usar un código.') {
            setTimeout(() => setDiscountMessage(''), 3000);
        }
    };

    const handleRemoveDiscount = () => {
        removeDiscount(); setDiscountCode(''); setDiscountMessage('');
    };

    const handleProceedToCheckout = () => {
        if (isNetworkBlocked) {
            return;
        }

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
                    <div className={styles.cartHeaderLeft}>
                        <h2 className={styles.cartTitle}><ShoppingCartIcon /> Tu Pedido</h2>
                        {cartItems.length > 0 && (
                            <button
                                type="button"
                                onClick={() => setClearModalOpen(true)}
                                className={styles.clearCartBtn}
                                title="Vaciar todo el carrito"
                            >
                                Vaciar
                            </button>
                        )}
                    </div>
                    <button onClick={handleClose} className={styles.closeButton} aria-label="Cerrar carrito">×</button>
                </div>

                {cartNotification && (
                    <div className={styles.cartNotification}>
                        <p>{cartNotification}</p>
                        <button onClick={clearCartNotification}>&times;</button>
                    </div>
                )}

                {cartItems.length === 0 ? (
                    <div className={styles.cartBody}>
                        <div className={styles.emptyStateContainer}>
                            <EmptyCartIcon />
                            <h3 className={styles.emptyStateTitle}>Tu carrito está vacío</h3>
                            <p className={styles.emptyStateText}>
                                ¡Agrega unas deliciosas alitas crujientes, boneless o tus complementos favoritos para comenzar!
                            </p>
                            <button
                                type="button"
                                className={styles.emptyStateBtn}
                                onClick={handleEmptyStateAction}
                            >
                                {isMenuRoute ? 'Cerrar y elegir platillos' : 'Explorar Menú'}
                            </button>
                        </div>
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
                                            <div className={styles.itemPriceRow}>
                                                <span className={styles.itemUnitPrice}>${Number(item.price).toFixed(2)} c/u</span>
                                                {item.quantity > 1 && (
                                                    <span className={styles.itemLineTotal}>
                                                        Total: ${(Number(item.price) * item.quantity).toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className={styles.itemActions}>
                                            {item.quantity === 1 ? (
                                                <button
                                                    type="button"
                                                    onClick={() => removeFromCart(item.id)}
                                                    className={`${styles.quantityButton} ${styles.deleteButton}`}
                                                    title="Eliminar producto"
                                                >
                                                    <TrashIcon />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                                    className={styles.quantityButton}
                                                    title="Disminuir cantidad"
                                                >
                                                    -
                                                </button>
                                            )}
                                            <span className={styles.quantityDisplay}>{item.quantity}</span>
                                            <button
                                                type="button"
                                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                className={styles.quantityButton}
                                                title="Aumentar cantidad"
                                            >
                                                +
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={styles.cartFooter}>
                            {welcomeCode && !discount && (
                                <div className={styles.welcomeDiscountBanner}>
                                    <div className={styles.welcomeDiscountText}>
                                        🍗 Cupón de bienvenida disponible: <strong>{welcomeCode}</strong>
                                    </div>
                                    {customer?.id ? (
                                        <button
                                            type="button"
                                            className={styles.applyWelcomeButton}
                                            onClick={() => handleApplyWelcomeCode(welcomeCode)}
                                        >
                                            Aplicar
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            className={styles.applyWelcomeButton}
                                            onClick={() => {
                                                handleClose();
                                                setPhoneModalOpen(true);
                                            }}
                                        >
                                            Iniciar Sesión
                                        </button>
                                    )}
                                </div>
                            )}

                            {/* Cupones desbloqueados para clientes registrados */}
                            {customer?.id && availableCoupons.length > 0 && !discount && (
                                <div className={styles.availableCouponsSection}>
                                    <span className={styles.availableCouponsTitle}>
                                        🎁 Tus Cupones Disponibles ({availableCoupons.length}):
                                    </span>
                                    <div className={styles.availableCouponsList}>
                                        {availableCoupons.map((coupon) => (
                                            <div key={coupon.id} className={styles.couponChip}>
                                                <div className={styles.couponChipInfo}>
                                                    <strong className={styles.couponCode}>{coupon.code}</strong>
                                                    <span className={styles.couponDesc}>
                                                        {coupon.discount_mode === 'fixed' ? `$${coupon.value}` : `${coupon.value}%`} de descuento
                                                    </span>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={styles.applyCouponChipBtn}
                                                    onClick={() => handleApplyWelcomeCode(coupon.code)}
                                                >
                                                    Usar
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className={styles.discountAccordion}>
                                {!discount && (
                                    <button onClick={() => setDiscountVisible(!isDiscountVisible)} className={styles.discountToggleButton}>
                                        ¿Tienes un código? {isDiscountVisible ? '▲' : '▼'}
                                    </button>
                                )}
                                <div className={`${styles.discountAccordionContent} ${isDiscountVisible || discount ? styles.open : ''}`}>
                                    {!discount && (
                                        <div className={styles.discountSection}>
                                            <input
                                                type="text"
                                                placeholder="Código"
                                                value={discountCode}
                                                onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                                                className={styles.discountInput}
                                            />
                                            <button onClick={handleApplyDiscount} className={styles.applyButton}>Aplicar</button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {discountMessage && (
                                <div className={styles.discountMessageWrapper}>
                                    <p className={styles.discountMessage}>{discountMessage}</p>
                                    {!customer?.id && discountMessage.includes('iniciar sesión') && (
                                        <button
                                            type="button"
                                            className={styles.loginFromCartBtn}
                                            onClick={() => {
                                                handleClose();
                                                setPhoneModalOpen(true);
                                            }}
                                        >
                                            Iniciar Sesión ahora
                                        </button>
                                    )}
                                </div>
                            )}

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

                            <button
                                onClick={handleProceedToCheckout}
                                className={`${styles.whatsappButton} ${isNetworkBlocked ? styles.whatsappButtonBlocked : ''}`}
                                disabled={isNetworkBlocked}
                            >
                                {checkoutButtonLabel}
                            </button>
                        </div>
                    </>
                )}
            </div>

            <ConfirmModal
                isOpen={isClearModalOpen}
                onClose={() => setClearModalOpen(false)}
                onConfirm={handleConfirmClear}
                title="¿Vaciar tu carrito?"
            >
                ¿Estás seguro de que deseas eliminar todos los productos seleccionados de tu pedido?
            </ConfirmModal>
        </>
    );
}
