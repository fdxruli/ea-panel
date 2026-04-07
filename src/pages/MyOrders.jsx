import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import { useCart } from '../context/CartContext';
import { useNavigate } from 'react-router-dom';
import styles from './MyOrders.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import EditOrderModal from '../components/EditOrderModal';
import ConfirmModal from '../components/ConfirmModal';
import CancellationRequestModal from '../components/CancellationRequestModal';
import AuthPrompt from '../components/AuthPrompt';
import SEO from '../components/SEO';
import { useSettings } from '../context/SettingsContext';

const ORDERS_PER_PAGE = 5;

export default function MyOrders() {
    const { phone, setCheckoutModalOpen } = useCustomer();
    const { cartItems, replaceCart, toggleCart, showToast } = useCart();
    const navigate = useNavigate();

    const { customer, orders, loading: userLoading, error, refetch } = useUserData();
    const { settings, loading: settingsLoading } = useSettings();
    const visibilitySettings = settings['client_visibility'] || {};

    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [isRequestingCancel, setIsRequestingCancel] = useState(false);
    const [orderToReorder, setOrderToReorder] = useState(null);
    const [openOrderIds, setOpenOrderIds] = useState([]);

    const [activePage, setActivePage] = useState(1);
    const [pastPage, setPastPage] = useState(1);

    const loading = userLoading || settingsLoading;

    const { activeOrders, pastOrders } = useMemo(() => {
        if (!orders) return { activeOrders: [], pastOrders: [] };
        const active = orders.filter(o => ['pendiente', 'en_proceso', 'en_envio'].includes(o.status));
        const past = orders.filter(o => !['pendiente', 'en_proceso', 'en_envio'].includes(o.status));
        return { activeOrders: active, pastOrders: past };
    }, [orders]);

    const { displayedActiveOrders, activeTotalPages } = useMemo(() => {
        const totalPages = Math.ceil(activeOrders.length / ORDERS_PER_PAGE);
        const startIndex = (activePage - 1) * ORDERS_PER_PAGE;
        const endIndex = startIndex + ORDERS_PER_PAGE;
        return {
            displayedActiveOrders: activeOrders.slice(startIndex, endIndex),
            activeTotalPages: totalPages,
        };
    }, [activeOrders, activePage]);

    const { displayedPastOrders, pastTotalPages } = useMemo(() => {
        const totalPages = Math.ceil(pastOrders.length / ORDERS_PER_PAGE);
        const startIndex = (pastPage - 1) * ORDERS_PER_PAGE;
        const endIndex = startIndex + ORDERS_PER_PAGE;
        return {
            displayedPastOrders: pastOrders.slice(startIndex, endIndex),
            pastTotalPages: totalPages,
        };
    }, [pastOrders, pastPage]);

    useEffect(() => {
        setActivePage(1);
        setPastPage(1);
    }, [orders]);

    useEffect(() => {
        const handleStatusUpdate = (e) => {
            const { orderCode, status } = e.detail;
            const statusText = status.replace('_', ' ').toUpperCase();
            showToast(`Tu pedido #${orderCode} ahora está: ${statusText}`);
        };

        window.addEventListener('order-status-updated', handleStatusUpdate);

        return () => {
            window.removeEventListener('order-status-updated', handleStatusUpdate);
        };
    }, [showToast]);

    useEffect(() => {
        if (activePage > activeTotalPages && activeTotalPages > 0) {
            setActivePage(activeTotalPages);
        } else if (activeTotalPages === 0) {
            setActivePage(1);
        }
    }, [activeTotalPages, activePage]);

    useEffect(() => {
        if (pastPage > pastTotalPages && pastTotalPages > 0) {
            setPastPage(pastTotalPages);
        } else if (pastTotalPages === 0) {
            setPastPage(1);
        }
    }, [pastTotalPages, pastPage]);

    const handleToggleOrder = (orderId) => {
        setOpenOrderIds(prevIds =>
            prevIds.includes(orderId)
                ? prevIds.filter(id => id !== orderId)
                : [...prevIds, orderId]
        );
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
        const { error } = await supabase
            .from('orders')
            .update({ status: 'cancelado', cancellation_reason: 'Cancelado por el cliente.' })
            .eq('id', orderToCancel.id);
        if (error) {
            showToast('Error al cancelar el pedido.');
        } else {
            showToast('Pedido cancelado con éxito.');
            refetch();
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

    const performReorder = (order) => {
        const newCartItems = order.order_items
            .filter(item => item.products)
            .map(item => ({ ...item.products, quantity: item.quantity }));

        replaceCart(newCartItems);
        showToast('¡Pedido añadido al carrito!');
        navigate('/');
        setTimeout(toggleCart, 500);
    };

    const confirmReorder = () => {
        if (!orderToReorder) return;
        performReorder(orderToReorder);
        setOrderToReorder(null);
    };

    const handleOrderUpdated = useCallback(() => { refetch(); }, [refetch]);
    const handleCloseModal = useCallback(() => { setEditingOrder(null); }, []);

    const handlePageChange = (type, direction) => {
        if (type === 'active') {
            setActivePage(prev => Math.max(1, Math.min(prev + direction, activeTotalPages)));
        } else if (type === 'past') {
            setPastPage(prev => Math.max(1, Math.min(prev + direction, pastTotalPages)));
        }
    };

    const renderOrderDetails = (order, isActionable = false) => (
        <>
            <div className={styles.itemList}>
                {order.order_items.map(item => (
                    <div key={item.id} className={styles.itemRow}>
                        <span className={styles.itemQuantity}>{item.quantity}x</span>
                        <span className={styles.itemName}>{item.products?.name || 'Producto no disponible'}</span>
                    </div>
                ))}
            </div>

            {order.status === 'cancelado' && order.cancellation_reason && (
                <div className={styles.cancellationReason}>
                    <strong>Motivo de cancelación:</strong>
                    <p>{order.cancellation_reason}</p>
                </div>
            )}

            <div className={styles.orderFooter}>
                <div className={styles.totalRow}>
                    <span>Total del pedido</span>
                    <strong>${order.total_amount.toFixed(2)}</strong>
                </div>

                <div className={styles.actionsContainer}>
                    {isActionable && order.status === 'pendiente' &&
                        <button className={`${styles.actionBtn} ${styles.editBtn}`} onClick={() => setEditingOrder(order)}>
                            Modificar
                        </button>
                    }
                    {isActionable && (order.status === 'pendiente' || order.status === 'en_proceso') && (
                        <button className={`${styles.actionBtn} ${styles.cancelBtn}`} onClick={() => handleCancelClick(order)}>
                            Cancelar Pedido
                        </button>
                    )}
                    {order.status === 'completado' && (
                        <button className={`${styles.actionBtn} ${styles.reorderBtn}`} onClick={() => handleReorder(order)}>
                            Volver a Pedir
                        </button>
                    )}
                </div>
            </div>
        </>
    );

    const PaginationControls = ({ currentPage, totalPages, onPageChange, type }) => {
        if (totalPages <= 1) return null;
        return (
            <div className={styles.paginationControls}>
                <button onClick={() => onPageChange(type, -1)} disabled={currentPage === 1} className={styles.pageBtn}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </button>
                <span>Página {currentPage} de {totalPages}</span>
                <button onClick={() => onPageChange(type, 1)} disabled={currentPage === totalPages} className={styles.pageBtn}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                </button>
            </div>
        );
    };

    // Función auxiliar para renderizar cada tarjeta de pedido
    // Función auxiliar para renderizar cada tarjeta de pedido
    const renderOrderCard = (order, isActive) => {
        const dateObj = new Date(order.created_at);
        const formattedDate = dateObj.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
        const formattedTime = dateObj.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

        // Verifica si hay una hora programada (Asegúrate de que 'scheduled_time' coincida con tu base de datos)
        const isScheduled = !!order.scheduled_time;

        return (
            <div key={order.id} className={`${styles.orderCard} ${openOrderIds.includes(order.id) ? styles.open : ''}`}>
                <button className={styles.cardHeader} onClick={() => handleToggleOrder(order.id)}>
                    <div className={styles.headerMain}>
                        <span className={styles.orderId}>Pedido #{order.order_code}</span>
                        <span className={styles.orderDate}>{formattedDate} • {formattedTime}</span>

                        {/* --- Insignia de Pedido Programado --- */}
                        {isScheduled && (
                            <span className={styles.scheduledBadge}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                                Programado: {order.scheduled_time}
                            </span>
                        )}
                    </div>
                    <div className={styles.headerRight}>
                        <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                            {order.status.replace('_', ' ')}
                        </span>
                        <div className={styles.chevronIcon}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </div>
                    </div>
                </button>
                <div className={styles.orderDetails}>
                    <div className={styles.detailsInner}>
                        {renderOrderDetails(order, isActive)}
                    </div>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        if (!phone) return <AuthPrompt />;
        if (loading) return <LoadingSpinner />;
        if (error) return <div className={styles.prompt}><h2>Error Inesperado</h2><p>No pudimos cargar tus datos.</p></div>;
        if (visibilitySettings.my_orders_page === false) return <div className={styles.prompt}><h2>Sección no disponible</h2><p>Esta sección está temporalmente desactivada.</p></div>;
        if (!customer) return <div className={styles.prompt}><h2>¡Bienvenido!</h2><p>Completa tu perfil para que podamos registrar tus pedidos.</p><button onClick={() => setCheckoutModalOpen(true, 'profile')} className={styles.actionButton}>Completar mi perfil</button></div>;

        return (
            <>
                {orders.length > 0 ? (
                    <>
                        {activeOrders.length > 0 && (
                            <section className={styles.sectionContainer}>
                                <h3 className={styles.sectionTitle}>Pedidos en curso</h3>
                                <div className={styles.ordersListContainer}>
                                    {displayedActiveOrders.map(order => renderOrderCard(order, true))}
                                </div>
                                <PaginationControls currentPage={activePage} totalPages={activeTotalPages} onPageChange={handlePageChange} type="active" />
                            </section>
                        )}

                        {pastOrders.length > 0 && (
                            <section className={styles.sectionContainer}>
                                <h3 className={styles.sectionTitle}>Historial</h3>
                                <div className={styles.ordersListContainer}>
                                    {displayedPastOrders.map(order => renderOrderCard(order, false))}
                                </div>
                                <PaginationControls currentPage={pastPage} totalPages={pastTotalPages} onPageChange={handlePageChange} type="past" />
                            </section>
                        )}
                    </>
                ) : (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>🛍️</div>
                        <h2>Aún no hay pedidos</h2>
                        <p>Cuando realices tu primer pedido, aparecerá aquí para que puedas darle seguimiento.</p>
                        <button onClick={() => navigate('/menu')} className={styles.primaryBtn}>Ver Menú</button>
                    </div>
                )}
            </>
        );
    };

    return (
        <>
            <SEO title="Mis Pedidos - Entre Alas" description="Consulta el estado de tus pedidos, editalos o vuelve a pedir tus favoritos." type="website" noindex />
            <div className={styles.container}>
                <h1 className={styles.pageTitle}>Mis Pedidos</h1>
                {renderContent()}

                {editingOrder && <EditOrderModal order={editingOrder} onClose={handleCloseModal} onOrderUpdated={handleOrderUpdated} />}
                <ConfirmModal isOpen={!!orderToCancel && !isRequestingCancel} onClose={() => setOrderToCancel(null)} onConfirm={confirmDirectCancel} title="¿Confirmar Cancelación?">Estás a punto de cancelar tu pedido. Esta acción no se puede deshacer.</ConfirmModal>
                <ConfirmModal isOpen={!!orderToReorder} onClose={() => setOrderToReorder(null)} onConfirm={confirmReorder} title="¿Reemplazar Carrito?">Tu carrito ya tiene productos. ¿Deseas vaciarlo y agregar los productos de este pedido?</ConfirmModal>
                {isRequestingCancel && orderToCancel && <CancellationRequestModal order={orderToCancel} onClose={() => { setIsRequestingCancel(false); setOrderToCancel(null); }} />}
            </div>
        </>
    );
}