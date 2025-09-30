// src/pages/Orders.jsx (MODIFICADO)

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);

  // MODIFICADO: La consulta ahora pide explícitamente la columna 'scheduled_for'
  const fetchOrders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id, order_code, customer_id, status, total_amount, created_at,
        cancellation_reason, scheduled_for, customers(name, phone)
      `)
      .order("created_at", { ascending: false });

    if (error) console.error(error);
    else setOrders(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchOrders();

    const channel = supabase
      .channel('public:orders:admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        (payload) => {
          console.log('Cambio detectado en pedidos (admin), actualizando...', payload);
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchOrders]);


  const fetchOrderItems = async (orderId) => {
    const { data, error } = await supabase
      .from("order_items")
      .select(`quantity, price, products(name)`)
      .eq("order_id", orderId);

    if (error) console.error(error);
    else setOrderItems(data);
  };
  
  const updateStatus = async (orderId, newStatus) => {
    let updateData = { status: newStatus };
    
    if (newStatus === 'cancelado') {
      const reason = prompt("Por favor, introduce el motivo de la cancelación:");
      if (reason === null) return;
      updateData.cancellation_reason = reason || 'Cancelado por el administrador.';
    }

    const { error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId);

    if (error) console.error(error);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      <h1>Pedidos</h1>

      <table className="products-table">
        <thead>
          <tr>
            <th>Código</th>
            <th>Cliente</th>
            <th>Teléfono</th>
            <th>Total</th>
            <th>Estado</th>
            <th>Fecha del Pedido</th>
            {/* NUEVO: Columna para la fecha de entrega */}
            <th>Fecha de Entrega</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.order_code}</td>
              <td>{o.customers?.name}</td>
              <td>{o.customers?.phone}</td>
              <td>${o.total_amount}</td>
              <td>
                {o.status}
                {o.status === 'cancelado' && o.cancellation_reason && (
                  <small style={{display: 'block', color: '#777'}}>Motivo: {o.cancellation_reason}</small>
                )}
              </td>
              <td>{new Date(o.created_at).toLocaleString()}</td>
              {/* NUEVO: Celda que muestra la fecha de entrega */}
              <td>
                {o.scheduled_for ? (
                  <strong style={{ color: '#e74c3c' }}>
                    {new Date(o.scheduled_for).toLocaleString()}
                  </strong>
                ) : (
                  'Inmediato'
                )}
              </td>
              <td>
                <button onClick={() => {
                  setSelectedOrder(o.id);
                  fetchOrderItems(o.id);
                }}>
                  Ver detalle
                </button>
                {o.status !== "completado" && o.status !== "cancelado" && (
                  <>
                    <button onClick={() => updateStatus(o.id, "en_proceso")}>En proceso</button>
                    <button onClick={() => updateStatus(o.id, "completado")}>Completado</button>
                  </>
                )}
                {o.status !== "cancelado" &&
                    <button onClick={() => updateStatus(o.id, "cancelado")}>Cancelar</button>
                }
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedOrder && (
        <div className="form-container">
          <h3>Detalle del pedido</h3>
          <table className="products-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio Unitario</th>
              </tr>
            </thead>
            <tbody>
              {orderItems.map((item, index) => (
                <tr key={index}>
                  <td>{item.products.name}</td>
                  <td>{item.quantity}</td>
                  <td>${item.price}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setSelectedOrder(null)}>Cerrar detalle</button>
        </div>
      )}
    </div>
  );
}