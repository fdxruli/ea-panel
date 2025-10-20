import React, { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Orders.module.css";
import DeliveryInfoModal from "../components/DeliveryInfoModal";
import { useAdminAuth } from "../context/AdminAuthContext";
import EditOrderModal from "../components/EditOrderModal";

const OrderCard = ({ order, onUpdateStatus, onShowDeliveryInfo, onEditOrder }) => {
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const { hasPermission } = useAdminAuth();
  const canEdit = hasPermission('pedidos.edit');

  // Simplificado: usamos los items que ya vienen con el pedido.
  useEffect(() => {
    if (order.order_items) {
      setItems(order.order_items);
    }
  }, [order.order_items]);

const formatScheduledTime = (isoString) => {
    if (!isoString) return null;
    try {
      const date = new Date(isoString);
      // Opciones para mostrar fecha y hora de forma legible
      const dateOptions = { year: 'numeric', month: 'short', day: 'numeric' };
      const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
      return `${date.toLocaleDateString('es-MX', dateOptions)} ${date.toLocaleTimeString('es-MX', timeOptions)}`;
    } catch (e) {
      return "Fecha inválida";
    }
  };
  
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

        {order.scheduled_for && (
          <div className={styles.infoSection}>
             <p className={styles.scheduledTime}> {/* Reutiliza el estilo o crea uno nuevo */}
               <strong>Programado:</strong> {formatScheduledTime(order.scheduled_for)}
             </p>
          </div>
        )}
        
        <div className={styles.infoSection}>
          <h4>Productos</h4>
            <ul className={styles.productsList}>
              {items.map((item, index) => (
                <li key={index}>
                  <span className={styles.productName}>{item.products.name}</span>
                  <span className={styles.productQuantity}>{item.quantity} x ${item.price}</span>
                </li>
              ))}
            </ul>
        </div>
      </div>
      <div className={styles.cardFooter}>
        <span className={styles.totalAmount}>${order.total_amount.toFixed(2)}</span>
        <div className={styles.actionButtons}>
          <button onClick={() => onShowDeliveryInfo(order)} className={styles.deliveryButton}>
            Ver Envío
          </button>
          
          {canEdit && (order.status === 'pendiente' || order.status === 'en_proceso') && (
            <button onClick={() => onEditOrder(order)} className={styles.editButton}>
              Editar
            </button>
          )}

          {canEdit && order.status === 'pendiente' && (
            <button onClick={() => onUpdateStatus(order.id, "en_proceso")} className={styles.processButton}>
              Procesar
            </button>
          )}
          {canEdit && order.status === 'en_proceso' && (
            <button onClick={() => onUpdateStatus(order.id, "en_envio")} className={styles.processButton}>
              Enviar
            </button>
          )}
          {canEdit && order.status === 'en_envio' && (
            <button onClick={() => onUpdateStatus(order.id, "completado")} className={styles.completeButton}>
              Completar
            </button>
          )}
          {canEdit && order.status !== 'completado' && order.status !== 'cancelado' && (
            <button onClick={() => onUpdateStatus(order.id, "cancelado")} className={styles.cancelButton}>
              Cancelar
            </button>
          )}
      </div>
      </div>
    </div>
  );
};


export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("activos");
  const [isDeliveryModalOpen, setIsDeliveryModalOpen] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);

  const fetchOrders = useCallback(async () => {
    const { data, error } = await supabase
      .from("orders")
      .select(`*, customers(name, phone), order_items(*, products(*))`)
      .order("created_at", { ascending: false });

    if (error) console.error(error);
    else setOrders(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();
    const channel = supabase.channel('public:orders:admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchOrders())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchOrders]);

  const updateStatus = async (orderId, newStatus) => {
    let updateData = { status: newStatus };
    if (newStatus === 'cancelado') {
      const reason = prompt("Motivo de la cancelación (opcional):");
      if (reason === null) return;
      updateData.cancellation_reason = reason || 'Cancelado por administrador.';
    }
    await supabase.from("orders").update(updateData).eq("id", orderId);
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const matchesSearch = o.order_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        o.customers?.name.toLowerCase().includes(searchTerm.toLowerCase());

      if (statusFilter === 'todos') return matchesSearch;
      if (statusFilter === 'activos') return (o.status === 'pendiente' || o.status === 'en_proceso' || o.status === 'en_envio') && matchesSearch;
      return o.status === statusFilter && matchesSearch;
    });
  }, [orders, searchTerm, statusFilter]);

  const handleShowDeliveryInfo = async (order) => {
    const { data: address, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('customer_id', order.customer_id)
      .eq('is_default', true)
      .maybeSingle();

    if (error) {
      console.error("Error fetching address:", error);
      return;
    }

    setDeliveryInfo({
      customer: order.customers,
      address: address
    });
    setIsDeliveryModalOpen(true);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Gestión de Pedidos</h1>
      </div>
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
      {filteredOrders.length === 0 && <p>No se encontraron pedidos con los filtros actuales.</p>}
      
      {editingOrder && (
          <EditOrderModal
              order={editingOrder}
              onClose={() => setEditingOrder(null)} // Cierra el modal
              onOrderUpdated={() => {
                  fetchOrders(); // Refresca la lista explícitamente si la suscripción falla
                  setEditingOrder(null); // Cierra modal después de guardar exitoso (opcional, EditOrderModal ya lo hace)
              }}
          />
      )}

      <DeliveryInfoModal
        isOpen={isDeliveryModalOpen}
        onClose={() => setIsDeliveryModalOpen(false)}
        deliveryInfo={deliveryInfo}
      />
    </div>
  );
}
