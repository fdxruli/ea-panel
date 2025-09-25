// src/pages/MyOrders.jsx (MODIFICADO)

import React, { useState, useCallback } from 'react';
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

export default function MyOrders() {
    const { phone, setPhoneModalOpen, setCheckoutModalOpen } = useCustomer();
    const { cartItems, replaceCart, toggleCart, showToast } = useCart();
    const navigate = useNavigate();

    const { customer, orders, loading, error, refetch } = useUserData();

    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [isRequestingCancel, setIsRequestingCancel] = useState(false);
    const [orderToReorder, setOrderToReorder] = useState(null);


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

    const renderOrder = (order, isLatest = false) => (
        <div key={order.id} className={isLatest ? styles.latestOrderCard : styles.orderCard}>
            <div className={styles.orderHeader}>
                <h3>Pedido #{order.order_code}</h3>
                <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
            </div>
            <p><strong>Fecha:</strong> {new Date(order.created_at).toLocaleString()}</p>
            <ul>
                {order.order_items.map(item => ( <li key={item.id}>{item.quantity}x {item.products?.name || 'Producto no disponible'}</li> ))}
            </ul>
            {/* --- 👇 AQUÍ ESTÁ LA LÓGICA PARA MOSTRAR EL MOTIVO --- */}
            {order.status === 'cancelado' && order.cancellation_reason && (
                <p className={styles.cancellationReason}>
                    <strong>Motivo:</strong> {order.cancellation_reason}
                </p>
            )}
            {/* --- 👆 FIN DE LA LÓGICA --- */}
            <div className={styles.orderFooter}>
                <strong>Total: ${order.total_amount.toFixed(2)}</strong>
                <div className={styles.actionsContainer}>
                    {isLatest && order.status === 'pendiente' &&
                        <button className={styles.editButton} onClick={() => setEditingOrder(order)}>✏️ Editar</button>
                    }
                    {isLatest && (order.status === 'pendiente' || order.status === 'en_proceso') && (
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
        </div>
    );
    
    const renderContent = () => {
        if (!phone) {
            return (
                <div className={styles.prompt}>
                    <h2>Ingresa tu número para ver tus pedidos</h2>
                    <p>Para buscar tu historial de pedidos, necesitamos tu número de WhatsApp.</p>
                    <button onClick={() => setPhoneModalOpen(true)} className={styles.searchButton}>
                        Ingresar Número
                    </button>
                </div>
            );
        }

        if (loading) return <LoadingSpinner />;

        if (error) {
            return (
                <div className={styles.prompt}>
                    <h2>Error Inesperado</h2>
                    <p>No pudimos cargar tus datos. Por favor, intenta de nuevo más tarde.</p>
                </div>
            );
        }

        if (!customer) {
            return (
                 <div className={styles.prompt}>
                    <h2>¡Bienvenido!</h2>
                    <p>Parece que eres nuevo por aquí. Completa tu perfil para que podamos registrar tus pedidos.</p>
                    <button onClick={() => setCheckoutModalOpen(true, 'profile')} className={styles.searchButton}>
                        Completar mi perfil
                    </button>
                </div>
            );
        }

        if (customer) {
            const latestOrder = orders.length > 0 ? orders[0] : null;
            const pastOrders = orders.length > 1 ? orders.slice(1) : [];
            return (
                 <div className={styles.ordersSection}>
                    {orders.length > 0 ? (
                        <>
                            {latestOrder && (
                                <div className={styles.latestOrderContainer}>
                                    <h3>Último Pedido</h3>
                                    {renderOrder(latestOrder, true)}
                                </div>
                            )}
                            {pastOrders.length > 0 && (
                                <div className={styles.historyContainer}>
                                    <h3>Historial de Pedidos</h3>
                                    {pastOrders.map(order => renderOrder(order, false))}
                                </div>
                            )}
                        </>
                    ) : (
                         <div className={styles.prompt}>
                            <h2>No tienes pedidos</h2>
                            <p>Parece que aún no has realizado ningún pedido con este número.</p>
                         </div>
                    )}
                </div>
            );
        }
        
        return null;
    };


    return (
        <div className={styles.container}>
            <h1>Mis Pedidos</h1>
            {renderContent()}

            {editingOrder && <EditOrderModal order={editingOrder} onClose={handleCloseModal} onOrderUpdated={handleOrderUpdated} />}
            
            <ConfirmModal isOpen={!!orderToCancel && !isRequestingCancel} onClose={() => setOrderToCancel(null)} onConfirm={confirmDirectCancel} title="¿Confirmar Cancelación?">
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

            {isRequestingCancel && orderToCancel && <CancellationRequestModal order={orderToCancel} onClose={() => { setIsRequestingCancel(false); setOrderToCancel(null); }} />}
        </div>
    );
}