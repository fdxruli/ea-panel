<<<<<<< HEAD
import React, { useState, useCallback, useEffect } from 'react';
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

export default function MyOrders() {
    const { phone, setCheckoutModalOpen } = useCustomer();
    const { cartItems, replaceCart, toggleCart, showToast } = useCart();
    const navigate = useNavigate();

    const { customer, orders, loading, error, refetch } = useUserData();

    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [isRequestingCancel, setIsRequestingCancel] = useState(false);
    const [orderToReorder, setOrderToReorder] = useState(null);

    const [openOrderIds, setOpenOrderIds] = useState([]);

    useEffect(() => {
        const isDesktop = window.innerWidth >= 768;
        if (isDesktop && orders.length > 0) {
            setOpenOrderIds(orders.map(o => o.id));
        }
    }, [orders]);

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

    const renderOrderDetails = (order, isActionable = false) => (
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

    const renderContent = () => {
        if (!phone) {
            return (
                <AuthPrompt/>
            );
        }

        if (loading) return <LoadingSpinner />;

        if (error) {
            return (<div className={styles.prompt}> <h2>Error Inesperado</h2> <p>No pudimos cargar tus datos. Por favor, intenta de nuevo más tarde.</p> </div>);
        }

        if (!customer) {
            return (
                <div className={styles.prompt}>
                    <h2>¡Bienvenido!</h2>
                    <p>Parece que eres nuevo por aquí. Completa tu perfil para que podamos registrar tus pedidos.</p>
                    <button onClick={() => setCheckoutModalOpen(true, 'profile')} className={styles.actionButton}>
                        Completar mi perfil
                    </button>
                </div>
            );
        }

        if (customer) {
            const activeOrders = orders.filter(o => o.status === 'pendiente' || o.status === 'en_proceso');
            const pastOrders = orders.filter(o => o.status !== 'pendiente' && o.status !== 'en_proceso');

            return (
                <>
                    {orders.length > 0 ? (
                        <>
                            {activeOrders.length > 0 && (
                                <div className={styles.activeOrdersContainer}>
                                    <h3>Pedidos Activos</h3>
                                    <div className={styles.ordersContainer}>
                                        {activeOrders.map(order => (
                                            <div key={order.id} className={`${styles.orderCard} ${openOrderIds.includes(order.id) ? styles.open : ''}`}>
                                                <button className={styles.cardHeader} onClick={() => handleToggleOrder(order.id)}>
                                                    <span>Pedido #{order.order_code}</span>
                                                    <div className={styles.headerInfo}>
                                                        <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
                                                        <span className={styles.toggleIcon}>{openOrderIds.includes(order.id) ? '−' : '+'}</span>
                                                    </div>
                                                </button>
                                                <div className={styles.orderDetails}>
                                                    {renderOrderDetails(order, true)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {pastOrders.length > 0 && (
                                <div className={styles.historyContainer}>
                                    <h3>Historial de Pedidos</h3>
                                    <div className={styles.ordersContainer}>
                                        {pastOrders.map(order => (
                                            <div key={order.id} className={`${styles.orderCard} ${openOrderIds.includes(order.id) ? styles.open : ''}`}>
                                                <button className={styles.cardHeader} onClick={() => handleToggleOrder(order.id)}>
                                                    <span>Pedido #{order.order_code}</span>
                                                    <div className={styles.headerInfo}>
                                                        <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
                                                        <span className={styles.toggleIcon}>{openOrderIds.includes(order.id) ? '−' : '+'}</span>
                                                    </div>
                                                </button>
                                                <div className={styles.orderDetails}>
                                                    {renderOrderDetails(order, false)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
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
        }

        return null;
    };


    return (
        <>
        <SEO
            title="Mis Pedidos - Entre Alas"
            description="Consulta el estado de tus pedidos, edítalos o vuelve a pedir tus favoritos en Entre Alas."
            name="Entre Alas"
            type="website"
        />
        <div className={styles.container}>
            {renderContent()}

            {editingOrder && <EditOrderModal order={editingOrder} onClose={handleCloseModal} onOrderUpdated={handleOrderUpdated} />}

            <ConfirmModal isOpen={!!orderToCancel && !isRequestingCancel} onClose={() => setOrderToCancel(null)} onConfirm={confirmDirectCancel} title="¿Confirmar Cancelación?">
                Estás a punto de cancelar tu pedido. Esta acción no se puede deshacer.
            </ConfirmModal>

            <ConfirmModal isOpen={!!orderToReorder} onClose={() => setOrderToReorder(null)} onConfirm={confirmReorder} title="¿Reemplazar Carrito?">
                Tu carrito ya tiene productos. ¿Deseas vaciarlo y agregar los productos de este pedido?
            </ConfirmModal>

            {isRequestingCancel && orderToCancel && <CancellationRequestModal order={orderToCancel} onClose={() => { setIsRequestingCancel(false); setOrderToCancel(null); }} />}
        </div>
        </>
    );
=======
import React, { useState, useCallback, useEffect } from 'react';
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

export default function MyOrders() {
    const { phone, setCheckoutModalOpen } = useCustomer();
    const { cartItems, replaceCart, toggleCart, showToast } = useCart();
    const navigate = useNavigate();

    const { customer, orders, loading, error, refetch } = useUserData();

    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [isRequestingCancel, setIsRequestingCancel] = useState(false);
    const [orderToReorder, setOrderToReorder] = useState(null);

    const [openOrderIds, setOpenOrderIds] = useState([]);

    useEffect(() => {
        const isDesktop = window.innerWidth >= 768;
        if (isDesktop && orders.length > 0) {
            setOpenOrderIds(orders.map(o => o.id));
        }
    }, [orders]);

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

    const renderOrderDetails = (order, isActionable = false) => (
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

    const renderContent = () => {
        if (!phone) {
            return (
                <AuthPrompt/>
            );
        }

        if (loading) return <LoadingSpinner />;

        if (error) {
            return (<div className={styles.prompt}> <h2>Error Inesperado</h2> <p>No pudimos cargar tus datos. Por favor, intenta de nuevo más tarde.</p> </div>);
        }

        if (!customer) {
            return (
                <div className={styles.prompt}>
                    <h2>¡Bienvenido!</h2>
                    <p>Parece que eres nuevo por aquí. Completa tu perfil para que podamos registrar tus pedidos.</p>
                    <button onClick={() => setCheckoutModalOpen(true, 'profile')} className={styles.actionButton}>
                        Completar mi perfil
                    </button>
                </div>
            );
        }

        if (customer) {
            const activeOrders = orders.filter(o => o.status === 'pendiente' || o.status === 'en_proceso');
            const pastOrders = orders.filter(o => o.status !== 'pendiente' && o.status !== 'en_proceso');

            return (
                <>
                    {orders.length > 0 ? (
                        <>
                            {activeOrders.length > 0 && (
                                <div className={styles.activeOrdersContainer}>
                                    <h3>Pedidos Activos</h3>
                                    <div className={styles.ordersContainer}>
                                        {activeOrders.map(order => (
                                            <div key={order.id} className={`${styles.orderCard} ${openOrderIds.includes(order.id) ? styles.open : ''}`}>
                                                <button className={styles.cardHeader} onClick={() => handleToggleOrder(order.id)}>
                                                    <span>Pedido #{order.order_code}</span>
                                                    <div className={styles.headerInfo}>
                                                        <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
                                                        <span className={styles.toggleIcon}>{openOrderIds.includes(order.id) ? '−' : '+'}</span>
                                                    </div>
                                                </button>
                                                <div className={styles.orderDetails}>
                                                    {renderOrderDetails(order, true)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {pastOrders.length > 0 && (
                                <div className={styles.historyContainer}>
                                    <h3>Historial de Pedidos</h3>
                                    <div className={styles.ordersContainer}>
                                        {pastOrders.map(order => (
                                            <div key={order.id} className={`${styles.orderCard} ${openOrderIds.includes(order.id) ? styles.open : ''}`}>
                                                <button className={styles.cardHeader} onClick={() => handleToggleOrder(order.id)}>
                                                    <span>Pedido #{order.order_code}</span>
                                                    <div className={styles.headerInfo}>
                                                        <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
                                                        <span className={styles.toggleIcon}>{openOrderIds.includes(order.id) ? '−' : '+'}</span>
                                                    </div>
                                                </button>
                                                <div className={styles.orderDetails}>
                                                    {renderOrderDetails(order, false)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
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
        }

        return null;
    };


    return (
        <>
        <SEO
            title="Mis Pedidos - Entre Alas"
            description="Consulta el estado de tus pedidos, edítalos o vuelve a pedir tus favoritos en Entre Alas."
            name="Entre Alas"
            type="website"
        />
        <div className={styles.container}>
            {renderContent()}

            {editingOrder && <EditOrderModal order={editingOrder} onClose={handleCloseModal} onOrderUpdated={handleOrderUpdated} />}

            <ConfirmModal isOpen={!!orderToCancel && !isRequestingCancel} onClose={() => setOrderToCancel(null)} onConfirm={confirmDirectCancel} title="¿Confirmar Cancelación?">
                Estás a punto de cancelar tu pedido. Esta acción no se puede deshacer.
            </ConfirmModal>

            <ConfirmModal isOpen={!!orderToReorder} onClose={() => setOrderToReorder(null)} onConfirm={confirmReorder} title="¿Reemplazar Carrito?">
                Tu carrito ya tiene productos. ¿Deseas vaciarlo y agregar los productos de este pedido?
            </ConfirmModal>

            {isRequestingCancel && orderToCancel && <CancellationRequestModal order={orderToCancel} onClose={() => { setIsRequestingCancel(false); setOrderToCancel(null); }} />}
        </div>
        </>
    );
>>>>>>> 901f8aa95ca640c871ec1f2bf6437b2b2a625efc
}