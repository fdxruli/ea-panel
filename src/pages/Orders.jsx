// src/pages/Orders.jsx
import React, { useEffect, useState, useMemo, useCallback, useRef, memo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Orders.module.css";
import DeliveryInfoModal from "../components/DeliveryInfoModal";
import { useAdminAuth } from "../context/AdminAuthContext";
import EditOrderModal from "../components/EditOrderModal";
import { GUEST_CUSTOMER_ID } from "../config/constantes";
import { subscribeToTableChanges } from "../lib/sharedAdminRealtime";

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

const OrderCard = memo(({ order, onUpdateStatus, onShowDeliveryInfo, onEditOrder, updatingStatusId }) => {
  const { hasPermission } = useAdminAuth();
  const canEdit = hasPermission('pedidos.edit');

  // Detectar si es pedido de invitado
  const isGuest = order.customer_id === GUEST_CUSTOMER_ID;

  // ✅ MEJORA: Verificar si este pedido está siendo actualizado
  const isUpdating = updatingStatusId === order.id;

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
    <div className={`${styles.orderCard} ${isUpdating ? styles.updating : ''}`}>
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
            {/* ✅ Lógica visual diferenciada para Invitados */}
            {isGuest ? (
              <span>
                <strong style={{ color: '#25D366' }}>👋 Invitado (WhatsApp)</strong>
                <br />
                <small style={{ color: '#666' }}>Revisar chat para dirección</small>
              </span>
            ) : (
              <>
                <span>{order.customers?.name || 'N/A'}</span>
                ({order.customers?.phone || 'N/A'})
              </>
            )}
          </p>
        </div>

        {scheduledTimeFormatted && (
          <div className={styles.infoSection}>
            <p className={styles.scheduledTime}>
              <strong>Programado:</strong> {scheduledTimeFormatted}
            </p>
          </div>
        )}

        {order.notes && (
          <div className={styles.infoSection}>
            <h4>Notas</h4>
            <p className={styles.orderNotes}>
              {order.notes}
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
              disabled={isUpdating}
              className={styles.processButton}
            >
              {isUpdating ? '⏳' : 'Procesar'}
            </button>
          )}
          {canEdit && order.status === 'en_proceso' && (
            <button
              onClick={() => onUpdateStatus(order.id, "en_envio")}
              disabled={isUpdating}
              className={styles.processButton}
            >
              {isUpdating ? '⏳' : 'Enviar'}
            </button>
          )}
          {canEdit && order.status === 'en_envio' && (
            <button
              onClick={() => onUpdateStatus(order.id, "completado")}
              disabled={isUpdating}
              className={styles.completeButton}
            >
              {isUpdating ? '⏳' : 'Completar'}
            </button>
          )}
          {canEdit && order.status !== 'completado' && order.status !== 'cancelado' && (
            <button
              onClick={() => onUpdateStatus(order.id, "cancelado")}
              disabled={isUpdating}
              className={styles.cancelButton}
            >
              {isUpdating ? '⏳' : 'Cancelar'}
            </button>
          )}
          {canEdit && (order.status === 'pendiente' || order.status === 'en_proceso') && (
            <button
              onClick={() => onEditOrder(order)}
              disabled={isUpdating}
              className={styles.editButton}
            >
              Editar
            </button>
          )}

          <button
            onClick={() => onShowDeliveryInfo(order)}
            disabled={isUpdating}
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
    prevProps.order.order_items?.length === nextProps.order_items?.length &&
    prevProps.order.updated_at === nextProps.order.updated_at &&
    prevProps.updatingStatusId === nextProps.updatingStatusId
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
  // ✅ MEJORA: Separar loading inicial del de operaciones
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("activos");
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [cancellingOrderId, setCancellingOrderId] = useState(null);
  // ✅ Estados para feedback visual en operaciones
  const [updatingStatusId, setUpdatingStatusId] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Caché de direcciones
  const addressCache = useRef(new Map());

  // Paginación
  const ITEMS_PER_PAGE = 20;
  const currentPage = useRef(1);

  // ✅ Debounce de búsqueda
  const debouncedSearchTerm = useDebounce(searchTerm, 700);

  // Ref para mantener los filtros actuales y usarlos en Realtime sin tener que
  // re-suscribir el websocket cada vez que el usuario escribe.
  const filtersRef = useRef({ search: debouncedSearchTerm, status: statusFilter });
  useEffect(() => {
    filtersRef.current = { search: debouncedSearchTerm, status: statusFilter };
  }, [debouncedSearchTerm, statusFilter]);

  // ✅ OPTIMIZACIÓN: Fetch con paginación
  const fetchOrders = useCallback(async (page = 1, append = false, search = "", status = "activos") => {
    try {
      // ✅ MEJORA: Solo setLoading en la primera carga
      if (page === 1 && !append) {
        setInitialLoading(true);
      } else {
        setLoadingMore(true);
      }

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
          notes,
          created_at,
          updated_at,
          cancellation_reason,
          customers!inner(id, name, phone),
          order_items(id, product_id, quantity, price, products(id, name, image_url))
      `, { count: 'exact' });

      // 1. Filtrado por Estado en el Servidor
      // IMPORTANTE: Si hay búsqueda activa, ignoramos el filtro de estado
      // para que el usuario pueda encontrar pedidos completados, cancelados, etc.
      if (!search) {
        if (status === 'activos') {
          query = query.in('status', ['pendiente', 'en_proceso', 'en_envio']);
        } else if (status !== 'todos') {
          query = query.eq('status', status);
        }
      }

      // 2. Filtrado por Búsqueda en el Servidor
      if (search) {
        const cleanSearch = search.trim();
        // Búsqueda por código de orden (case-insensitive)
        query = query.ilike('order_code', `%${cleanSearch}%`);
      }

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, error, count } = await query;

      if (error) throw error;

      if (append) {
        setOrders(prev => {
          // Evitar duplicados si realtime ya insertó el pedido
          const newItems = data.filter(d => !prev.some(p => p.id === d.id));
          return [...prev, ...newItems];
        });
      } else {
        setOrders(data || []);
      }

      setHasMore(count ? (page * ITEMS_PER_PAGE) < count : false);
      currentPage.current = page;

    } catch (error) {
      console.error('Error fetching orders:', error);
      setActionError(`Error al cargar pedidos: ${error.message}`);
    } finally {
      // ✅ MEJORA: Solo clear initialLoading en primera carga
      setInitialLoading(false);
      setLoadingMore(false);
    }
  }, []);

  // Carga inicial y Refetch automático cuando cambian los filtros
  useEffect(() => {
    fetchOrders(1, false, debouncedSearchTerm, statusFilter);
  }, [fetchOrders, debouncedSearchTerm, statusFilter]);

  // ✅ OPTIMIZACIÓN: Realtime con actualización selectiva
  useEffect(() => {
    const unsubscribe = subscribeToTableChanges('orders', (payload) => {
      console.log('Order change detected:', payload);

      if (payload.eventType === 'INSERT') {
        // Nuevo pedido: recargar primera página usando los filtros actuales
        fetchOrders(1, false, filtersRef.current.search, filtersRef.current.status);
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
    });

    return () => unsubscribe();
  }, [fetchOrders]);

  // Handler para cargar más pedidos
  const loadMoreOrders = useCallback(() => {
    if (!loadingMore && hasMore) {
      fetchOrders(currentPage.current + 1, true, debouncedSearchTerm, statusFilter);
    }
  }, [loadingMore, hasMore, fetchOrders, debouncedSearchTerm, statusFilter]);

  // ✅ Handler de actualización de estado con feedback visual mejorado
  const updateStatus = async (orderId, newStatus) => {
    let updateData = { status: newStatus };
    if (newStatus === 'cancelado') {
      const reason = prompt("Motivo de la cancelación (opcional):");
      if (reason === null) return;
      updateData.cancellation_reason = reason || 'Cancelado por administrador.';
    }

    // ✅ MEJORA: Marcar pedido como "actualizando" para feedback visual
    setUpdatingStatusId(orderId);
    setActionError(null);

    try {
      // Agregar .select() para esperar confirmación
      const { error } = await supabase
        .from("orders")
        .update(updateData)
        .eq("id", orderId)
        .select();

      if (error) {
        console.error("Error al actualizar:", error);
        setActionError(`Error al actualizar el pedido: ${error.message}`);
      }
    } catch (err) {
      setActionError('Error de conexión al actualizar el pedido');
    } finally {
      // ✅ MEJORA: Quitar indicador después de un breve delay para UX
      setTimeout(() => setUpdatingStatusId(null), 500);
    }
  };

  // Handler de confirmación de cancelación con feedback visual
  const handleCancelConfirm = useCallback(async (reason) => {
    if (!cancellingOrderId) return;

    // ✅ MEJORA: Marcar como actualizando
    setUpdatingStatusId(cancellingOrderId);
    setActionError(null);

    try {
      // Reemplazar la actualización directa por una llamada RPC atómica
      const { error } = await supabase.rpc('cancel_order_and_restore_stock', {
        p_order_id: cancellingOrderId,
        p_reason: reason || 'Cancelado por administrador.'
      });

      if (error) throw error;

      // ✅ MEJORA: Feedback visual de éxito implícito (el pedido se actualiza via realtime)
      setCancellingOrderId(null);
    } catch (error) {
      console.error('Error cancelling order:', error);
      setActionError('Error al cancelar el pedido. Revisa tu conexión.');
    } finally {
      setTimeout(() => setUpdatingStatusId(null), 500);
    }
  }, [cancellingOrderId]);

  // ✅ OPTIMIZACIÓN: Caché de direcciones (CON SOPORTE PARA GUEST)
  const handleShowDeliveryInfo = useCallback(async (order) => {
    try {
      // 1. CASO INVITADO: No buscamos en BD, creamos info manual.
      if (order.customer_id === GUEST_CUSTOMER_ID) {
        setDeliveryInfo({
          customer: {
            name: "Invitado (Vía WhatsApp)",
            phone: "Ver WhatsApp"
          },
          address: {
            street: "Dirección a coordinar por WhatsApp",
            city: "Revisar chat",
            postal_code: "---",
            reference: "Este es un pedido rápido de invitado. La dirección se encuentra en el mensaje de confirmación de WhatsApp."
          }
        });
        setIsDeliveryModalOpen(true);
        return;
      }

      // 2. CASO USUARIO REGISTRADO: Verificar caché primero
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
    // Refrescar solo si es necesario (sin loading spinner)
    fetchOrders(currentPage.current, false, filtersRef.current.search, filtersRef.current.status);
    setEditingOrder(null);
  }, [fetchOrders]);

  // ✅ MEJORA: Spinner solo en carga inicial
  if (initialLoading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      {/* ✅ Banner de errores de acciones */}
      {actionError && (
        <div className={styles.errorBanner}>
          <span>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} className={styles.dismissButton}>✕</button>
        </div>
      )}

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
        {orders.map(order => (
          <OrderCard
            key={order.id}
            order={order}
            onUpdateStatus={updateStatus}
            onShowDeliveryInfo={handleShowDeliveryInfo}
            onEditOrder={setEditingOrder}
            updatingStatusId={updatingStatusId}
          />
        ))}
      </div>

      {/* Mensajes de estado */}
      {orders.length === 0 && (
        <p className={styles.emptyMessage}>
          No se encontraron pedidos con los filtros actuales.
        </p>
      )}

      {/* Botón Load More */}
      {hasMore && (
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
