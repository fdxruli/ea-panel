import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';
import { subscribeToOrderBroadcast } from '../lib/broadcastRealtime';
import LoadingSpinner from '../components/LoadingSpinner';
import ImageWithFallback from '../components/ImageWithFallback';
import SEO from '../components/SEO';
import ConfirmModal from '../components/ConfirmModal';
import CancellationRequestModal from '../components/CancellationRequestModal';
import OrderStatusStepper from '../components/OrderStatusStepper';
import { getWhatsAppUrl } from '../services/whatsappService';
import styles from './OrderDetailPage.module.css';

export default function OrderDetailPage() {
    const { orderCode } = useParams();
    const navigate = useNavigate();

    // Contextos
    const { phone, setPhoneModalOpen, isCustomerLoading } = useCustomer();
    const { orders, loading: userLoading } = useUserData();
    const { cartItems, replaceCart, toggleCart, showToast } = useCart();

    // Estados locales
    const [localOrder, setLocalOrder] = useState(null);
    const [localLoading, setLocalLoading] = useState(true);
    const [error, setError] = useState(null);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [isRequestingCancel, setIsRequestingCancel] = useState(false);
    const [orderToReorder, setOrderToReorder] = useState(null);
    const [isCopied, setIsCopied] = useState(false);

    // Resolución del pedido en contexto
    const contextOrder = useMemo(() => {
        return orders?.find(o => o.order_code === orderCode);
    }, [orders, orderCode]);

    // Efecto de Obtención y Sincronización
    useEffect(() => {
        if (isCustomerLoading) return;

        let unsubBroadcast = null;
        if (orderCode) {
            unsubBroadcast = subscribeToOrderBroadcast(orderCode, (orderPayload) => {
                setLocalOrder(prev => prev ? { ...prev, ...orderPayload } : orderPayload);
            });
        }

        if (phone) {
            setLocalLoading(false);
            if (!userLoading && !contextOrder) {
                setError('Pedido no encontrado en tu historial.');
            }
        } else if (orderCode) {
            const fetchOrderStandalone = async () => {
                try {
                    setLocalLoading(true);
                    const { data, error: fetchError } = await supabase
                        .from('orders')
                        .select('*, order_items(*, products(*))')
                        .eq('order_code', orderCode)
                        .maybeSingle();

                    if (fetchError) throw fetchError;
                    if (!data) throw new Error('Pedido no encontrado.');

                    setLocalOrder(data);

                    // Suscripción al socket para invitados (Postgres CDC)
                    const channel = supabase.channel(`guest-order-${data.id}`)
                        .on('postgres_changes',
                            { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${data.id}` },
                            (payload) => setLocalOrder(prev => ({ ...prev, ...payload.new }))
                        ).subscribe();

                    return () => {
                        supabase.removeChannel(channel);
                    };
                } catch (_err) {
                    setError(_err.message);
                    return null;
                } finally {
                    setLocalLoading(false);
                }
            };

            fetchOrderStandalone();
        }

        return () => {
            if (unsubBroadcast) unsubBroadcast();
        };
    }, [orderCode, phone, isCustomerLoading, userLoading, contextOrder]);

    // Variables derivadas
    const isPageLoading = phone ? (isCustomerLoading || userLoading) : localLoading;
    const finalOrder = phone ? contextOrder : localOrder;

    // Funciones auxiliares
    const formatDate = (isoString) => {
        if (!isoString) return null;
        try {
            const date = new Date(isoString);
            return date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
        } catch (_e) {
            return 'Fecha inválida';
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return null;
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
        } catch (_e) {
            return 'Hora inválida';
        }
    };

    const formatScheduledTime = (isoString) => {
        if (!isoString) return null;
        try {
            const date = new Date(isoString);
            return `${date.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })} a las ${date.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true })}`;
        } catch (_e) {
            return 'Fecha inválida';
        }
    };

    const handleCopyCode = () => {
        if (orderCode && navigator.clipboard) {
            navigator.clipboard.writeText(orderCode);
            setIsCopied(true);
            showToast(`Código #${orderCode} copiado al portapapeles`);
            setTimeout(() => setIsCopied(false), 2500);
        }
    };

    const performReorder = (order) => {
        const newCartItems = order.order_items
            .filter(item => item.products)
            .map(item => ({ ...item.products, quantity: item.quantity }));

        replaceCart(newCartItems);
        showToast('¡Pedido añadido al carrito!');
        navigate('/');
        setTimeout(toggleCart, 500);
    };

    const handleCancelClick = (order) => {
        if (order.status === 'pendiente') {
            setOrderToCancel(order);
        } else if (order.status === 'en_proceso') {
            setIsRequestingCancel(true);
            setOrderToCancel(order);
        }
    };

    const confirmDirectCancel = async () => {
        if (!orderToCancel) return;
        const { error: updateError } = await supabase
            .from('orders')
            .update({ status: 'cancelado', cancellation_reason: 'Cancelado por el cliente.' })
            .eq('id', orderToCancel.id);
        if (updateError) {
            showToast('Error al cancelar el pedido.');
        } else {
            showToast('Pedido cancelado con éxito.');
            if (phone) {
                navigate('/mis-pedidos');
            } else {
                setLocalOrder(prev => ({ ...prev, status: 'cancelado', cancellation_reason: 'Cancelado por el cliente.' }));
            }
        }
        setOrderToCancel(null);
    };

    const handleReorder = (orderToRepeat) => {
        if (!orderToRepeat || !orderToRepeat.order_items) return;
        if (cartItems.length > 0) {
            setOrderToReorder(orderToRepeat);
        } else {
            performReorder(orderToRepeat);
        }
    };

    const confirmReorder = () => {
        if (!orderToReorder) return;
        performReorder(orderToReorder);
        setOrderToReorder(null);
    };

    // Renderizado condicional
    if (isPageLoading) {
        return <LoadingSpinner />;
    }

    if (error) {
        return (
            <>
                <SEO title="Error al Cargar Pedido" description="No se pudo cargar la información del pedido" noindex />
                <div className={styles.errorContainer}>
                    <div className={styles.errorBox}>
                        <div className={styles.errorIcon}>⚠️</div>
                        <h1 className={styles.errorTitle}>Error al Cargar Pedido</h1>
                        <p className={styles.errorMessage}>{error}</p>
                        <button onClick={() => navigate('/mis-pedidos')} className={styles.errorButton}>
                            Volver a Mis Pedidos
                        </button>
                    </div>
                </div>
            </>
        );
    }

    if (!finalOrder) {
        return (
            <>
                <SEO title="Pedido No Encontrado" description="El pedido solicitado no existe" noindex />
                <div className={styles.errorContainer}>
                    <div className={styles.errorBox}>
                        <div className={styles.errorIcon}>🔍</div>
                        <h1 className={styles.errorTitle}>Pedido No Encontrado</h1>
                        <p className={styles.errorMessage}>No pudimos encontrar los detalles para el pedido {orderCode}.</p>
                        <button onClick={() => navigate('/mis-pedidos')} className={styles.errorButton}>
                            Volver a Mis Pedidos
                        </button>
                    </div>
                </div>
            </>
        );
    }

    const order = finalOrder;
    const formattedScheduledTime = formatScheduledTime(order.scheduled_for || order.scheduled_time);
    const orderDate = formatDate(order.created_at);
    const orderTime = formatTime(order.created_at);
    const isActive = ['pendiente', 'en_proceso', 'en_envio'].includes(order.status);

    const whatsappHelpUrl = getWhatsAppUrl(
        `¡Hola Entre Alas! 👋 Tengo una duda sobre mi pedido #${order.order_code}. ¿Podrían ayudarme?`
    );

    return (
        <>
            <SEO
                title={`Detalles Pedido #${order.order_code} - Entre Alas`}
                description={`Consulta el estado y los detalles de tu pedido #${order.order_code} en Entre Alas.`}
                type="website"
                noindex
            />
            <div className={styles.container}>
                {/* Encabezado con botón de regreso */}
                <div className={styles.pageHeader}>
                    <Link to="/mis-pedidos" className={styles.backButton}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Volver a Mis Pedidos
                    </Link>
                    <h1 className={styles.pageTitle}>Detalle del Pedido</h1>
                </div>

                {/* Tarjeta principal */}
                <div className={styles.orderCard}>
                    {/* Encabezado de tarjeta */}
                    <div className={styles.cardHeader}>
                        <div className={styles.headerContent}>
                            <div className={styles.orderIdRow}>
                                <span className={styles.orderId}>Pedido #{order.order_code}</span>
                                <button
                                    type="button"
                                    onClick={handleCopyCode}
                                    className={styles.copyBtn}
                                    title="Copiar código de pedido"
                                >
                                    {isCopied ? (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                            <polyline points="20 6 9 17 4 12" />
                                        </svg>
                                    ) : (
                                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                        </svg>
                                    )}
                                </button>
                            </div>
                            <div className={styles.orderMeta}>
                                <div className={styles.metaRow}>
                                    <span className={styles.metaIcon}>📅</span>
                                    <span>{orderDate} • {orderTime}</span>
                                </div>
                                {formattedScheduledTime && (
                                    <div className={styles.metaRow} style={{ color: 'var(--color-primary)' }}>
                                        <span className={styles.metaIcon}>⏰</span>
                                        <span><strong>Programado:</strong> {formattedScheduledTime}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                        <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                            {isActive && <span className={styles.statusDot}></span>}
                            {order.status.replace('_', ' ')}
                        </span>
                    </div>

                    {/* Stepper visual de progreso en vivo */}
                    <div className={styles.stepperContainer}>
                        <OrderStatusStepper
                            status={order.status}
                            cancellationReason={order.cancellation_reason}
                            compact={false}
                        />
                    </div>

                    {/* Sección de detalles */}
                    <div className={styles.detailsSection}>
                        {/* Productos */}
                        <div>
                            <h3 className={styles.sectionTitle}>Productos del Pedido</h3>
                            <div className={styles.productsContainer}>
                                {order.order_items && order.order_items.length > 0 ? (
                                    order.order_items.map(item => (
                                        <div key={item.id} className={styles.productItem}>
                                            <div className={styles.productInfo}>
                                                <ImageWithFallback
                                                    src={item.products?.image_url || ''}
                                                    alt={item.products?.name || 'Producto'}
                                                    className={styles.productImage}
                                                />
                                                <div className={styles.productDetails}>
                                                    <span className={styles.productQuantity}>{item.quantity}x</span>
                                                    <span className={styles.productName}>
                                                        {item.products?.name || 'Producto no disponible'}
                                                    </span>
                                                </div>
                                            </div>
                                            <span className={styles.productPrice}>
                                                ${(item.price * item.quantity).toFixed(2)}
                                            </span>
                                        </div>
                                    ))
                                ) : (
                                    <p style={{ color: 'var(--text-secondary)' }}>
                                        No se encontraron los productos de este pedido.
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Información de entrega */}
                        {(order.address || order.phone) && (
                            <div>
                                <h3 className={styles.sectionTitle}>Entrega</h3>
                                <div className={styles.deliveryInfo}>
                                    {order.address && (
                                        <div className={styles.infoBox}>
                                            <label className={styles.infoLabel}>Dirección</label>
                                            <p className={styles.infoValue}>{order.address}</p>
                                        </div>
                                    )}
                                    {order.phone && (
                                        <div className={styles.infoBox}>
                                            <label className={styles.infoLabel}>Contacto</label>
                                            <p className={styles.infoValue}>{order.phone}</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Notas del pedido */}
                        {order.notes && (
                            <div className={styles.orderNotes}>
                                <p className={styles.notesLabel}>Notas del pedido</p>
                                <p className={styles.notesText}>{order.notes}</p>
                            </div>
                        )}

                        {/* Resumen y total */}
                        <div className={styles.orderSummary}>
                            <div className={`${styles.summaryRow} ${styles.subtotal}`}>
                                <span>Subtotal</span>
                                <span>${order.total_amount.toFixed(2)}</span>
                            </div>
                            <div className={`${styles.summaryRow} ${styles.total}`}>
                                <span>Total del pedido</span>
                                <span>${order.total_amount.toFixed(2)}</span>
                            </div>
                        </div>

                        {/* Barra de Acciones */}
                        <div className={styles.actionsBar}>
                            {/* Soporte por WhatsApp */}
                            <a
                                href={whatsappHelpUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`${styles.actionBtn} ${styles.whatsappBtn}`}
                            >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.667-.699c.974.531 1.848.815 2.793.815 3.182 0 5.769-2.587 5.77-5.768 0-3.181-2.587-5.769-5.77-5.769zm3.376 8.212c-.144.405-.837.774-1.17.824-.312.045-.698.077-2.146-.523-1.722-.714-2.825-2.457-2.91-2.571-.086-.114-.691-.919-.691-1.753 0-.834.437-1.244.593-1.413.155-.17.34-.212.453-.212.113 0 .227 0 .326.005.106.005.248-.04.388.297.144.35.493 1.2.535 1.286.043.085.071.185.014.298-.056.113-.085.184-.17.284-.085.099-.179.222-.256.298-.085.085-.174.177-.075.347.099.17.441.727.947 1.177.652.58 1.202.76 1.372.845.17.085.27.071.37-.042.099-.114.425-.496.538-.666.114-.17.227-.142.383-.085.156.057.99.467 1.16.552.17.085.284.127.326.198.043.071.043.411-.101.816z"/>
                                </svg>
                                Ayuda con mi pedido
                            </a>

                            {/* Cancelar si está pendiente o en proceso */}
                            {(order.status === 'pendiente' || order.status === 'en_proceso') && (
                                <button
                                    type="button"
                                    onClick={() => handleCancelClick(order)}
                                    className={`${styles.actionBtn} ${styles.cancelBtn}`}
                                >
                                    Cancelar Pedido
                                </button>
                            )}

                            {/* Volver a pedir si está completado */}
                            {order.status === 'completado' && (
                                <button
                                    type="button"
                                    onClick={() => handleReorder(order)}
                                    className={`${styles.actionBtn} ${styles.reorderBtn}`}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="1 4 1 10 7 10" />
                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                    Volver a Pedir
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Prompt de autenticación para usuarios invitados */}
                {!phone && (
                    <div className={styles.authPrompt}>
                        <h2 className={styles.promptTitle}>¡Crea tu cuenta con solo tu número!</h2>
                        <p className={styles.promptDescription}>Al ingresar tu número podrás:</p>
                        <ul className={styles.promptBenefits}>
                            <li>Hacer pedidos futuros más rápido.</li>
                            <li>Ganar recompensas y descuentos.</li>
                            <li>Recibir notificaciones en vivo de tus pedidos.</li>
                            <li>Guardar tus direcciones, favoritos y reseñas.</li>
                        </ul>
                        <button
                            onClick={() => setPhoneModalOpen(true)}
                            className={styles.promptButton}
                        >
                            Ingresar mi número
                        </button>
                    </div>
                )}

                {/* Modales */}
                <ConfirmModal
                    isOpen={!!orderToCancel && !isRequestingCancel}
                    onClose={() => setOrderToCancel(null)}
                    onConfirm={confirmDirectCancel}
                    title="¿Confirmar Cancelación?"
                >
                    Estás a punto de cancelar tu pedido. Esta acción no se puede deshacer.
                </ConfirmModal>

                <ConfirmModal
                    isOpen={!!orderToReorder}
                    onClose={() => setOrderToReorder(null)}
                    onConfirm={confirmReorder}
                    title="¿Reemplazar Carrito?"
                >
                    Tu carrito ya tiene productos. ¿Deseas vaciarlo y agregar los productos de este pedido?
                </ConfirmModal>

                {isRequestingCancel && orderToCancel && (
                    <CancellationRequestModal
                        order={orderToCancel}
                        onClose={() => {
                            setIsRequestingCancel(false);
                            setOrderToCancel(null);
                        }}
                    />
                )}
            </div>
        </>
    );
}
