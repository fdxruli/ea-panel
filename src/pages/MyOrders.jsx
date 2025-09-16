// src/pages/MyOrders.jsx (MODIFICADO PARA TIEMPO REAL)

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import styles from './MyOrders.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import EditOrderModal from '../components/EditOrderModal';
import ConfirmModal from '../components/ConfirmModal';
import CancellationRequestModal from '../components/CancellationRequestModal';

export default function MyOrders() {
    const { phone, setPhoneModalOpen } = useCustomer();
    const [customer, setCustomer] = useState(null);
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [isRequestingCancel, setIsRequestingCancel] = useState(false);

    // Usamos useCallback para estabilizar la función y usarla como dependencia en useEffect
    const fetchCustomerAndOrders = useCallback(async (currentPhone) => {
        if (!currentPhone) return;

        setLoading(true);
        setError('');
        try {
            // Obtenemos el cliente
            const { data: customerData, error: customerError } = await supabase
                .from('customers').select('id, name').eq('phone', currentPhone).single();
            
            if (customerError || !customerData) {
                // Si no se encuentra el cliente, limpiamos los datos
                setCustomer(null);
                setOrders([]);
                throw new Error("No se encontró un cliente con este número.");
            }
            setCustomer(customerData);

            // Obtenemos sus pedidos
            const { data: ordersData, error: ordersError } = await supabase
                .from('orders').select('*, order_items(*, products(*))')
                .eq('customer_id', customerData.id).order('created_at', { ascending: false });
            if (ordersError) throw new Error("Error al cargar los pedidos.");

            setOrders(ordersData || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    // useEffect para la carga inicial y la suscripción
    useEffect(() => {
        if (phone) {
            fetchCustomerAndOrders(phone);
        } else {
            setCustomer(null);
            setOrders([]);
        }

        // Si no tenemos un cliente, no podemos suscribirnos
        if (!customer) return;

        // Suscripción a cambios en los pedidos de ESTE cliente
        const ordersChannel = supabase.channel(`my-orders-${customer.id}`)
          .on(
            'postgres_changes',
            { 
              event: '*', 
              schema: 'public', 
              table: 'orders',
              filter: `customer_id=eq.${customer.id}` // ¡Filtro clave para no recibir todos los pedidos!
            },
            (payload) => {
              console.log(`Cambio recibido para el pedido del cliente ${customer.name}`, payload);
              // Cuando hay un cambio, volvemos a cargar los datos del cliente
              fetchCustomerAndOrders(phone);
            }
          )
          .subscribe();
        
        // Limpieza al desmontar el componente o cuando el cliente cambie
        return () => {
            supabase.removeChannel(ordersChannel);
        };

    }, [phone, customer, fetchCustomerAndOrders]); // Dependemos de customer para crear la suscripción

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
            // No es necesario llamar a fetch, Realtime lo hará
        }
        setOrderToCancel(null);
    };

    const handleOrderUpdated = useCallback(() => { fetchCustomerAndOrders(phone); }, [fetchCustomerAndOrders, phone]);
    const handleCloseModal = useCallback(() => { setEditingOrder(null); }, []);

    const renderOrder = (order, isLatest = false) => (
        // ... (el JSX para renderizar un pedido no cambia) ...
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
    // ... (el resto del JSX del return no cambia) ...
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
                    {loading && orders.length === 0 && <LoadingSpinner />}
                    {error && <p className={styles.error}>{error}</p>}

                    {customer && (
                        <div className={styles.ordersSection}>
                            <h2>¡Hola, {customer.name}!</h2>
                            <p>Mostrando pedidos para el número: <strong>{phone}</strong></p>
                            {latestOrder && (
                                <div className={styles.latestOrderContainer}>
                                    <h3>Último Pedido</h3>
                                    {renderOrder(latestOrder, true)}
                                </div>
                            )}
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
