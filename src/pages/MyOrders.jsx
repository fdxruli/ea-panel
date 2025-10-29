import React, { useState, useCallback, useEffect, useMemo } from 'react'; // <-- Added useMemo
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

// Define how many orders to show per page
const ORDERS_PER_PAGE = 5; // <-- Puedes ajustar este número

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

    // --- ✅ PAGINATION STATE ---
    const [activePage, setActivePage] = useState(1);
    const [pastPage, setPastPage] = useState(1);
    // --- END PAGINATION STATE ---

    const loading = userLoading || settingsLoading;

    // --- Filter orders (no change needed here) ---
    const { activeOrders, pastOrders } = useMemo(() => {
        if (!orders) return { activeOrders: [], pastOrders: [] };
        const active = orders.filter(o => ['pendiente', 'en_proceso', 'en_envio'].includes(o.status));
        const past = orders.filter(o => !['pendiente', 'en_proceso', 'en_envio'].includes(o.status));
        return { activeOrders: active, pastOrders: past };
    }, [orders]);

    // --- ✅ Calculate displayed orders and pagination info ---
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

    // --- Reset pages if orders change significantly (e.g., after refetch) ---
    useEffect(() => {
        setActivePage(1);
        setPastPage(1);
    }, [orders]); // Reset page on order list change

    // --- Handlers (many unchanged) ---
    const handleToggleOrder = (orderId) => { /* ... (unchanged) ... */
        setOpenOrderIds(prevIds =>
            prevIds.includes(orderId)
                ? prevIds.filter(id => id !== orderId)
                : [...prevIds, orderId]
        );
    };
    const handleCancelClick = (order) => { /* ... (unchanged) ... */
        if (order.status === 'pendiente') {
            setOrderToCancel(order);
        } else if (order.status === 'en_proceso') {
            setIsRequestingCancel(true);
            setOrderToCancel(order);
        }
    };
    const confirmDirectCancel = async () => { /* ... (unchanged) ... */
        if (!orderToCancel) return;
        const { error } = await supabase
            .from('orders')
            .update({ status: 'cancelado', cancellation_reason: 'Cancelado por el cliente.' })
            .eq('id', orderToCancel.id);
        if (error) {
            showToast('Error al cancelar el pedido.');
        } else {
            showToast('Pedido cancelado con éxito.');
            refetch(); // Refetch will reset pagination via useEffect
        }
        setOrderToCancel(null);
    };
    const handleReorder = (orderToRepeat) => { /* ... (unchanged) ... */
         if (!orderToRepeat || !orderToRepeat.order_items) return;
        if (cartItems.length > 0) {
            setOrderToReorder(orderToRepeat);
        } else {
            performReorder(orderToRepeat);
        }
    };
    const performReorder = (order) => { /* ... (unchanged) ... */
        const newCartItems = order.order_items
            .filter(item => item.products)
            .map(item => ({ ...item.products, quantity: item.quantity }));

        replaceCart(newCartItems);
        showToast('¡Pedido añadido al carrito!');
        navigate('/');
        setTimeout(toggleCart, 500);
    };
    const confirmReorder = () => { /* ... (unchanged) ... */
        if (!orderToReorder) return;
        performReorder(orderToReorder);
        setOrderToReorder(null);
    };
    const handleOrderUpdated = useCallback(() => { refetch(); }, [refetch]);
    const handleCloseModal = useCallback(() => { setEditingOrder(null); }, []);

    // --- ✅ PAGINATION HANDLERS ---
    const handlePageChange = (type, direction) => {
        if (type === 'active') {
            setActivePage(prev => Math.max(1, Math.min(prev + direction, activeTotalPages)));
        } else if (type === 'past') {
            setPastPage(prev => Math.max(1, Math.min(prev + direction, pastTotalPages)));
        }
    };
    // --- END PAGINATION HANDLERS ---

    const renderOrderDetails = (order, isActionable = false) => ( /* ... (unchanged) ... */
        <>
            <p><strong>Fecha:</strong> {new Date(order.created_at).toLocaleString()}</p>
            <ul>
                {order.order_items.map(item => (<li key={item.id}>{item.quantity}x {item.products?.name || 'Producto no disponible'}</li>))}
            </ul>
            {order.status === 'cancelado' && order.cancellation_reason && (
                <p className={styles.cancellationReason}>
                    <strong>Motivo:</strong> {order.cancellation_reason}
                </p>
            )}
            <div className={styles.orderFooter}>
                <strong>Total: ${order.total_amount.toFixed(2)}</strong>
                <div className={styles.actionsContainer}>
                    {isActionable && order.status === 'pendiente' &&
                        <button className={styles.editButton} onClick={() => setEditingOrder(order)}>Editar</button>
                    }
                    {isActionable && (order.status === 'pendiente' || order.status === 'en_proceso') && (
                        <button className={styles.cancelButton} onClick={() => handleCancelClick(order)}>
                            Cancelar Pedido
                        </button>
                    )}
                    {order.status === 'completado' && (
                        <button className={styles.reorderButton} onClick={() => handleReorder(order)}>
                            Volver a Pedir
                        </button>
                    )}
                </div>
            </div>
        </>
    );

    // --- ✅ Pagination Controls Component ---
    const PaginationControls = ({ currentPage, totalPages, onPageChange, type }) => {
        if (totalPages <= 1) return null;
        return (
            <div className={styles.paginationControls}>
                <button
                    onClick={() => onPageChange(type, -1)}
                    disabled={currentPage === 1}
                >
                    &lt; Anterior
                </button>
                <span>Página {currentPage} de {totalPages}</span>
                <button
                    onClick={() => onPageChange(type, 1)}
                    disabled={currentPage === totalPages}
                >
                    Siguiente &gt;
                </button>
            </div>
        );
    };
    // --- END Pagination Controls Component ---

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
                            <div className={styles.activeOrdersContainer}>
                                <h3>Pedidos Activos</h3>
                                {/* --- ✅ REMOVED CAROUSEL WRAPPER --- */}
                                {/* Replaced horizontal container with simple div */}
                                <div className={styles.ordersListContainer}>
                                    {displayedActiveOrders.map(order => (
                                        <div key={order.id} className={`${styles.orderCard} ${openOrderIds.includes(order.id) ? styles.open : ''}`}>
                                            <button className={styles.cardHeader} onClick={() => handleToggleOrder(order.id)}>
                                                <span>Pedido #{order.order_code}</span>
                                                <div className={styles.headerInfo}>
                                                    <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
                                                    <span className={styles.toggleIcon}>{openOrderIds.includes(order.id) ? '✕' : '+'}</span>
                                                </div>
                                            </button>
                                            <div className={styles.orderDetails}>
                                                {renderOrderDetails(order, true)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {/* --- ✅ ADDED PAGINATION CONTROLS --- */}
                                <PaginationControls
                                    currentPage={activePage}
                                    totalPages={activeTotalPages}
                                    onPageChange={handlePageChange}
                                    type="active"
                                />
                            </div>
                        )}

                        {pastOrders.length > 0 && (
                            <div className={styles.historyContainer}>
                                <h3>Historial de Pedidos</h3>
                                {/* --- ✅ REMOVED CAROUSEL WRAPPER --- */}
                                <div className={styles.ordersListContainer}>
                                    {displayedPastOrders.map(order => (
                                        <div key={order.id} className={`${styles.orderCard} ${openOrderIds.includes(order.id) ? styles.open : ''}`}>
                                            <button className={styles.cardHeader} onClick={() => handleToggleOrder(order.id)}>
                                                <span>Pedido #{order.order_code}</span>
                                                <div className={styles.headerInfo}>
                                                    <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
                                                    <span className={styles.toggleIcon}>{openOrderIds.includes(order.id) ? '✕' : '+'}</span>
                                                </div>
                                            </button>
                                            <div className={styles.orderDetails}>
                                                {renderOrderDetails(order, false)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {/* --- ✅ ADDED PAGINATION CONTROLS --- */}
                                <PaginationControls
                                    currentPage={pastPage}
                                    totalPages={pastTotalPages}
                                    onPageChange={handlePageChange}
                                    type="past"
                                />
                            </div>
                        )}
                    </>
                ) : (
                    <div className={styles.prompt}>
                        <h2>No tienes pedidos</h2>
                        <p>Parece que aún no has realizado ningún pedido con este número.</p>
                    </div>
                )}
            </>
        );
    };

    return (
        <>
            <SEO title="Mis Pedidos - Entre Alas" description="Consulta el estado de tus pedidos, edítalos o vuelve a pedir tus favoritos en Entre Alas." name="Entre Alas" type="website" />
            <div className={styles.container}>
                {renderContent()}
                {editingOrder && <EditOrderModal order={editingOrder} onClose={handleCloseModal} onOrderUpdated={handleOrderUpdated} />}
                <ConfirmModal isOpen={!!orderToCancel && !isRequestingCancel} onClose={() => setOrderToCancel(null)} onConfirm={confirmDirectCancel} title="¿Confirmar Cancelación?">Estás a punto de cancelar tu pedido. Esta acción no se puede deshacer.</ConfirmModal>
                <ConfirmModal isOpen={!!orderToReorder} onClose={() => setOrderToReorder(null)} onConfirm={confirmReorder} title="¿Reemplazar Carrito?">Tu carrito ya tiene productos. ¿Deseas vaciarlo y agregar los productos de este pedido?</ConfirmModal>
                {isRequestingCancel && orderToCancel && <CancellationRequestModal order={orderToCancel} onClose={() => { setIsRequestingCancel(false); setOrderToCancel(null); }} />}
            </div>
        </>
    );
}