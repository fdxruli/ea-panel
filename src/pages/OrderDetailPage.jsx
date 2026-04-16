import React, { useState, useEffect, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import { useCart } from '../context/CartContext';
import { supabase } from '../lib/supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import ImageWithFallback from '../components/ImageWithFallback';
import SEO from '../components/SEO';
import ConfirmModal from '../components/ConfirmModal';
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

    // Resolución del pedido en contexto
    const contextOrder = useMemo(() => {
        return orders?.find(o => o.order_code === orderCode);
    }, [orders, orderCode]);

    // Efecto de Obtención y Sincronización
    useEffect(() => {
        if (isCustomerLoading) return;

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

                    // Suscripción al socket para invitados
                    const channel = supabase.channel(`guest-order-${data.id}`)
                        .on('postgres_changes',
                            { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${data.id}` },
                            (payload) => setLocalOrder(prev => ({ ...prev, ...payload.new }))
                        ).subscribe();

                    // Store channel reference for cleanup
                    return { channel };
                } catch (_err) {
                    setError(_err.message);
                    return null;
                } finally {
                    setLocalLoading(false);
                }
            };

            fetchOrderStandalone();
        }
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
            // Actualizar orden local o contexto
            if (phone) {
                navigate('/my-orders');
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
                        <button onClick={() => navigate('/')} className={styles.errorButton}>
                            Volver al Inicio
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
                        <button onClick={() => navigate('/')} className={styles.errorButton}>
                            Volver al Inicio
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
    const isActionable = phone || !phone; // Permitir acciones en ambos casos si corresponde

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
                    <button className={styles.backButton} onClick={() => navigate(-1)}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="m15 18-6-6 6-6" />
                        </svg>
                        Atrás
                    </button>
                    <h1 className={styles.pageTitle}>Detalles del Pedido</h1>
                </div>

                {/* Tarjeta principal */}
                <div className={styles.orderCard}>
                    {/* Encabezado de tarjeta */}
                    <div className={styles.cardHeader}>
                        <div className={styles.headerContent}>
                            <div className={styles.orderId}>Pedido #{order.order_code}</div>
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
                            {order.status.replace('_', ' ')}
                        </span>
                    </div>

                    {/* Sección de detalles */}
                    <div className={styles.detailsSection}>
                        {/* Productos */}
                        <div>
                            <h3 className={styles.sectionTitle}>Productos</h3>
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
                        {(order.address || order.notes) && (
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

                        {/* Motivo de cancelación */}
                        {order.status === 'cancelado' && order.cancellation_reason && (
                            <div className={styles.cancellationReason}>
                                <p className={styles.cancellationLabel}>Motivo de cancelación</p>
                                <p className={styles.cancellationText}>{order.cancellation_reason}</p>
                            </div>
                        )}

                        {/* Resumen y total */}
                        <div className={styles.orderSummary}>
                            <div className={`${styles.summaryRow} ${styles.subtotal}`}>
                                <span>Subtotal</span>
                                <span>${order.total_amount.toFixed(2)}</span>
                            </div>
                            <div className={`${styles.summaryRow} ${styles.total}`}>
                                <span>Total</span>
                                <span>${order.total_amount.toFixed(2)}</span>
                            </div>
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
                            <li>Recibir notificaciones de tus pedidos.</li>
                            <li>Guardar tus direcciones, favoritos y reseñas a nuestros productos.</li>
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
            </div>
        </>
    );
}
