import React, { useEffect, useState, useMemo, useCallback, useRef, memo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Orders.module.css";
import DeliveryInfoModal from "../components/DeliveryInfoModal";
import { useAdminAuth } from "../context/AdminAuthContext";
import EditOrderModal from "../components/EditOrderModal";

// ==================== CUSTOM HOOKS ====================

// Hook de debounce
function useDebounce(value, delay = 300) {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => clearTimeout(handler);
    }, [value, delay]);

    return debouncedValue;
}

// ==================== COMPONENTE ORDERCARD MEMOIZADO ====================

const OrderCard = memo(({ order, onUpdateStatus, onShowDeliveryInfo, onEditOrder }) => {
    const { hasPermission } = useAdminAuth();
    const canEdit = hasPermission('pedidos.edit');

    // Memoizar formato de fecha
    const scheduledTimeFormatted = useMemo(() => {
        if (!order.scheduled_for) return null;
        try {
            const date = new Date(order.scheduled_for);
            const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
            const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
            return `${date.toLocaleDateString('es-MX', dateOptions)} ${date.toLocaleTimeString('es-MX', timeOptions)}`;
        } catch (e) {
            return "Fecha inválida";
        }
    }, [order.scheduled_for]);

    // Los items ya vienen con el pedido
    const items = order.order_items || [];

    return (
        <div className={styles.orderCard}>
            <div className={styles.cardHeader}>
                <h3>Pedido #{order.order_code}</h3>
                <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                    {order.status.replace('_', ' ')}
                </span>
            </div>
            <div className={styles.cardBody}>
                <div className={styles.infoSection}>
                    <h4>Cliente</h4>
                    <p className={styles.customerInfo}>
                        <span>{order.customers?.name || 'N/A'}</span> ({order.customers?.phone || 'N/A'})
                    </p>
                </div>

                {scheduledTimeFormatted && (
                    <div className={styles.infoSection}>
                        <p className={styles.scheduledTime}>
                            <strong>Programado:</strong> {scheduledTimeFormatted}
                        </p>
                    </div>
                )}
                
                <div className={styles.infoSection}>
                    <h4>Productos</h4>
                    <ul className={styles.productsList}>
                        {items.map((item, index) => (
                            <li key={`${item.id || index}`}>
                                <span className={styles.productName}>
                                    {item.products?.name || 'Producto'}
                                </span>
                                <span className={styles.productQuantity}>
                                    {item.quantity} x ${item.price}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <div className={styles.cardFooter}>
                <span className={styles.totalAmount}>
                    ${order.total_amount.toFixed(2)}
                </span>
                <div className={styles.actionButtons}>
                    {canEdit && order.status === 'pendiente' && (
                        <button 
                            onClick={() => onUpdateStatus(order.id, "en_proceso")} 
                            className={styles.processButton}
                        >
                            Procesar
                        </button>
                    )}
                    {canEdit && order.status === 'en_proceso' && (
                        <button 
                            onClick={() => onUpdateStatus(order.id, "en_envio")} 
                            className={styles.processButton}
                        >
                            Enviar
                        </button>
                    )}
                    {canEdit && order.status === 'en_envio' && (
                        <button 
                            onClick={() => onUpdateStatus(order.id, "completado")} 
                            className={styles.completeButton}
                        >
                            Completar
                        </button>
                    )}
                    {canEdit && order.status !== 'completado' && order.status !== 'cancelado' && (
                        <button 
                            onClick={() => onUpdateStatus(order.id, "cancelado")} 
                            className={styles.cancelButton}
                        >
                            Cancelar
                        </button>
                    )}
                    {canEdit && (order.status === 'pendiente' || order.status === 'en_proceso') && (
                        <button 
                            onClick={() => onEditOrder(order)} 
                            className={styles.editButton}
                        >
                            Editar
                        </button>
                    )}

                    <button 
                        onClick={() => onShowDeliveryInfo(order)} 
                        className={styles.deliveryButton}
                    >
                        Ver Envío
                    </button>
                </div>
            </div>
        </div>
    );
}, (prevProps, nextProps) => {
    // Comparación personalizada para evitar re-renders innecesarios
    return (
        prevProps.order.id === nextProps.order.id &&
        prevProps.order.status === nextProps.order.status &&
        prevProps.order.order_items?.length === nextProps.order.order_items?.length &&
        prevProps.order.updated_at === nextProps.order.updated_at
    );
});
OrderCard.displayName = 'OrderCard';

// ==================== MODAL DE CANCELACIÓN ====================

const CancellationModal = memo(({ isOpen, onClose, onConfirm }) => {
    const [reason, setReason] = useState('');

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <h2>Cancelar Pedido</h2>
                <div className={styles.formGroup}>
                    <label htmlFor="cancel-reason">Motivo de cancelación (opcional)</label>
                    <textarea
                        id="cancel-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Ingresa el motivo..."
                        rows="4"
                    />
                </div>
                <div className={styles.modalActions}>
                    <button 
                        type="button" 
                        onClick={onClose} 
                        className="admin-button-secondary"
                    >
                        Cancelar
                    </button>
                    <button 
                        type="button" 
                        onClick={() => onConfirm(reason || 'Cancelado por administrador.')} 
                        className="admin-button-danger"
                    >
                        Confirmar Cancelación
                    </button>
                </div>
            </div>
        </div>
    );
});
CancellationModal.displayName = 'CancellationModal';

// ==================== COMPONENTE PRINCIPAL ====================

export default function Orders() {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [statusFilter, setStatusFilter] = useState("activos");
    const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
    const [deliveryInfo, setDeliveryInfo] = useState(null);
    const [editingOrder, setEditingOrder] = useState(null);
    const [cancellingOrderId, setCancellingOrderId] = useState(null);

    // Caché de direcciones
    const addressCache = useRef(new Map());
    
    // Paginación
    const ITEMS_PER_PAGE = 20;
    const currentPage = useRef(1);

    // ✅ Debounce de búsqueda
    const debouncedSearchTerm = useDebounce(searchTerm, 400);

    // ✅ OPTIMIZACIÓN: Fetch con paginación
    const fetchOrders = useCallback(async (page = 1, append = false) => {
        try {
            if (!append) setLoading(true);
            else setLoadingMore(true);

            // Calcular rango para paginación
            const from = (page - 1) * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            let query = supabase
                .from("orders")
                .select(`
                    id,
                    order_code,
                    customer_id,
                    status,
                    total_amount,
                    scheduled_for,
                    created_at,
                    updated_at,
                    cancellation_reason,
                    customers(id, name, phone),
                    order_items(id, quantity, price, products(name))
                `, { count: 'exact' })
                .order("created_at", { ascending: false })
                .range(from, to);

            const { data, error, count } = await query;

            if (error) throw error;

            if (append) {
                setOrders(prev => [...prev, ...(data || [])]);
            } else {
                setOrders(data || []);
            }

            // Verificar si hay más páginas
            setHasMore(count ? (page * ITEMS_PER_PAGE) < count : false);
            currentPage.current = page;

        } catch (error) {
            console.error('Error fetching orders:', error);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    }, []);

    // Carga inicial
    useEffect(() => {
        fetchOrders(1, false);
    }, [fetchOrders]);

    // ✅ OPTIMIZACIÓN: Realtime con actualización selectiva
    useEffect(() => {
        const channel = supabase
            .channel('orders-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                    // Solo escuchar cambios de columnas específicas
                    select: 'id, status, updated_at, cancellation_reason'
                },
                (payload) => {
                    console.log('Order change detected:', payload);

                    if (payload.eventType === 'INSERT') {
                        // Nuevo pedido: recargar primera página
                        fetchOrders(1, false);
                        currentPage.current = 1;
                    } else if (payload.eventType === 'UPDATE') {
                        // Actualizar pedido existente sin refetch
                        setOrders(prev => prev.map(order => 
                            order.id === payload.new.id 
                                ? { ...order, ...payload.new }
                                : order
                        ));
                    } else if (payload.eventType === 'DELETE') {
                        // Eliminar pedido de la lista
                        setOrders(prev => prev.filter(order => order.id !== payload.old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchOrders]);

    // Handler para cargar más pedidos
    const loadMoreOrders = useCallback(() => {
        if (!loadingMore && hasMore) {
            fetchOrders(currentPage.current + 1, true);
        }
    }, [loadingMore, hasMore, fetchOrders]);

    // ✅ Handler de actualización de estado con modal
    const updateStatus = useCallback(async (orderId, newStatus) => {
        if (newStatus === 'cancelado') {
            setCancellingOrderId(orderId);
            return;
        }

        try {
            const { error } = await supabase
                .from("orders")
                .update({ status: newStatus })
                .eq("id", orderId);

            if (error) throw error;
        } catch (error) {
            console.error('Error updating order status:', error);
            alert('Error al actualizar el estado del pedido');
        }
    }, []);

    // Handler de confirmación de cancelación
    const handleCancelConfirm = useCallback(async (reason) => {
        if (!cancellingOrderId) return;

        try {
            const { error } = await supabase
                .from("orders")
                .update({ 
                    status: 'cancelado',
                    cancellation_reason: reason 
                })
                .eq("id", cancellingOrderId);

            if (error) throw error;

            setCancellingOrderId(null);
        } catch (error) {
            console.error('Error cancelling order:', error);
            alert('Error al cancelar el pedido');
        }
    }, [cancellingOrderId]);

    // ✅ OPTIMIZACIÓN: Filtrado en el cliente con búsqueda debounced
    const filteredOrders = useMemo(() => {
        return orders.filter(o => {
            // Filtro de búsqueda
            const matchesSearch = 
                o.order_code.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
                o.customers?.name.toLowerCase().includes(debouncedSearchTerm.toLowerCase());

            // Filtro de estado
            if (statusFilter === 'todos') return matchesSearch;
            if (statusFilter === 'activos') {
                return (
                    o.status === 'pendiente' || 
                    o.status === 'en_proceso' || 
                    o.status === 'en_envio'
                ) && matchesSearch;
            }
            return o.status === statusFilter && matchesSearch;
        });
    }, [orders, debouncedSearchTerm, statusFilter]);

    // ✅ OPTIMIZACIÓN: Caché de direcciones
    const handleShowDeliveryInfo = useCallback(async (order) => {
        try {
            // Verificar caché primero
            if (addressCache.current.has(order.customer_id)) {
                setDeliveryInfo({
                    customer: order.customers,
                    address: addressCache.current.get(order.customer_id)
                });
                setIsDeliveryModalOpen(true);
                return;
            }

            // Fetch si no está en caché
            const { data: address, error } = await supabase
                .from('customer_addresses')
                .select('*')
                .eq('customer_id', order.customer_id)
                .eq('is_default', true)
                .maybeSingle();

            if (error) throw error;

            // Guardar en caché
            addressCache.current.set(order.customer_id, address);

            setDeliveryInfo({
                customer: order.customers,
                address: address
            });
            setIsDeliveryModalOpen(true);
        } catch (error) {
            console.error("Error fetching address:", error);
            alert('Error al cargar la información de entrega');
        }
    }, []);

    // Handler de pedido actualizado
    const handleOrderUpdated = useCallback(() => {
        // Refrescar solo si es necesario
        fetchOrders(currentPage.current, false);
        setEditingOrder(null);
    }, [fetchOrders]);

    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Gestión de Pedidos</h1>
                <p className={styles.subtitle}>
                    {orders.length} pedidos cargados
                    {hasMore && ' (hay más disponibles)'}
                </p>
            </div>

            {/* Filtros */}
            <div className={styles.filters}>
                <input
                    type="text"
                    placeholder="Buscar por código o cliente..."
                    className={styles.searchInput}
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                />
                <select
                    className={styles.statusFilter}
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                >
                    <option value="activos">Pedidos Activos</option>
                    <option value="pendiente">Pendientes</option>
                    <option value="en_proceso">En Proceso</option>
                    <option value="en_envio">En Envío</option>
                    <option value="completado">Completados</option>
                    <option value="cancelado">Cancelados</option>
                    <option value="todos">Todos los Pedidos</option>
                </select>
            </div>

            {/* Grid de pedidos */}
            <div className={styles.orderGrid}>
                {filteredOrders.map(order => (
                    <OrderCard
                        key={order.id}
                        order={order}
                        onUpdateStatus={updateStatus}
                        onShowDeliveryInfo={handleShowDeliveryInfo}
                        onEditOrder={setEditingOrder}
                    />
                ))}
            </div>

            {/* Mensajes de estado */}
            {filteredOrders.length === 0 && (
                <p className={styles.emptyMessage}>
                    No se encontraron pedidos con los filtros actuales.
                </p>
            )}

            {/* Botón Load More */}
            {hasMore && filteredOrders.length === orders.length && (
                <div className={styles.loadMoreContainer}>
                    <button 
                        onClick={loadMoreOrders} 
                        disabled={loadingMore}
                        className={styles.loadMoreButton}
                    >
                        {loadingMore ? 'Cargando...' : 'Cargar Más Pedidos'}
                    </button>
                </div>
            )}

            {/* Modal de edición */}
            {editingOrder && (
                <EditOrderModal
                    order={editingOrder}
                    onClose={() => setEditingOrder(null)}
                    onOrderUpdated={handleOrderUpdated}
                />
            )}

            {/* Modal de cancelación */}
            <CancellationModal
                isOpen={!!cancellingOrderId}
                onClose={() => setCancellingOrderId(null)}
                onConfirm={handleCancelConfirm}
            />

            {/* Modal de información de entrega */}
            <DeliveryInfoModal
                isOpen={isDeliveryModalOpen}
                onClose={() => setIsDeliveryModalOpen(false)}
                deliveryInfo={deliveryInfo}
            />
        </div>
    );
}
