// src/pages/MyOrders.jsx (MODIFICADO)

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import styles from './MyOrders.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import EditOrderModal from '../components/EditOrderModal';
import ConfirmModal from '../components/ConfirmModal'; // Importamos el modal de confirmación
import CancellationRequestModal from '../components/CancellationRequestModal'; // Importamos el nuevo modal

export default function MyOrders() {
    const { phone, setPhoneModalOpen } = useCustomer();
    const [customer, setCustomer] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [editingOrder, setEditingOrder] = useState(null);

    // --- Estados para los modales de cancelación ---
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [isRequestingCancel, setIsRequestingCancel] = useState(false);


    const fetchOrders = useCallback(async (phoneNumber) => {
        if (!phoneNumber) return;

        setLoading(true);
        setError('');
        try {
            const { data: customerData, error: customerError } = await supabase
                .from('customers').select('id, name').eq('phone', phoneNumber).single();
            if (customerError || !customerData) throw new Error("No se encontró un cliente con este número.");
            setCustomer(customerData);

            const { data: ordersData, error: ordersError } = await supabase
                .from('orders').select('*, order_items(*, products(*))')
                .eq('customer_id', customerData.id).order('created_at', { ascending: false });
            if (ordersError) throw new Error("Error al cargar los pedidos.");

            setOrders(ordersData || []);
        } catch (err) {
            setError(err.message);
            setCustomer(null);
            setOrders([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (phone) {
            fetchOrders(phone);
        } else {
            setCustomer(null);
            setOrders([]);
        }
    }, [phone, fetchOrders]);

    // --- Lógica de cancelación ---
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
            alert('Error al cancelar el pedido: ' + error.message);
        } else {
            alert('Pedido cancelado con éxito.');
            fetchOrders(phone);
        }
        setOrderToCancel(null);
    };


    const handleOrderUpdated = useCallback(() => { fetchOrders(phone); }, [fetchOrders, phone]);
    const handleCloseModal = useCallback(() => { setEditingOrder(null); }, []);

    const renderOrder = (order, isLatest = false) => (
        <div key={order.id} className={isLatest ? styles.latestOrderCard : styles.orderCard}>
            <div className={styles.orderHeader}>
                <h3>Pedido #{order.order_code}</h3>
                <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
            </div>
            <p><strong>Fecha:</strong> {new Date(order.created_at).toLocaleString()}</p>
            <ul>
                {order.order_items.map(item => ( <li key={item.id}>{item.quantity}x {item.products.name}</li> ))}
            </ul>
            <div className={styles.orderFooter}>
                <strong>Total: ${order.total_amount.toFixed(2)}</strong>
                {isLatest && (order.status === 'pendiente' || order.status === 'en_proceso') && (
                    <div className={styles.actionsContainer}>
                        {order.status === 'pendiente' &&
                            <button className={styles.editButton} onClick={() => setEditingOrder(order)}>✏️ Editar</button>
                        }
                        <button className={styles.cancelButton} onClick={() => handleCancelClick(order)}>
                            Cancelar Pedido
                        </button>
                    </div>
                )}
            </div>
        </div>
    );

    const latestOrder = orders.length > 0 ? orders[0] : null;
    const pastOrders = orders.length > 1 ? orders.slice(1) : [];

    return (
        <div className={styles.container}>
            <h1>Mis Pedidos</h1>
            
            {!phone ? (
                <div className={styles.prompt}>
                    <h2>Ingresa tu número para ver tus pedidos</h2>
                    <p>Para buscar tu historial de pedidos, necesitamos tu número de WhatsApp.</p>
                    <button onClick={() => setPhoneModalOpen(true)} className={styles.searchButton}>
                        Ingresar Número
                    </button>
                </div>
            ) : (
                <>
                    {loading && <LoadingSpinner />}
                    {error && <p className={styles.error}>{error}</p>}

                    {customer && latestOrder && (
                        <div className={styles.ordersSection}>
                            <h2>¡Hola, {customer.name}!</h2>
                            <p>Mostrando pedidos para el número: <strong>{phone}</strong></p>
                            <div className={styles.latestOrderContainer}>
                                <h3>Último Pedido</h3>
                                {renderOrder(latestOrder, true)}
                            </div>
                            {pastOrders.length > 0 && (
                                <div className={styles.historyContainer}>
                                    <h3>Historial de Pedidos</h3>
                                    {pastOrders.map(order => renderOrder(order))}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {!loading && customer && orders.length === 0 && ( <p>No tienes pedidos registrados con este número.</p> )}
                </>
            )}

            {editingOrder && (
                <EditOrderModal order={editingOrder} onClose={handleCloseModal} onOrderUpdated={handleOrderUpdated} />
            )}

            <ConfirmModal
                isOpen={!!orderToCancel && !isRequestingCancel}
                onClose={() => setOrderToCancel(null)}
                onConfirm={confirmDirectCancel}
                title="¿Confirmar Cancelación?"
            >
                Estás a punto de cancelar tu pedido. Esta acción no se puede deshacer.
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
    );
}