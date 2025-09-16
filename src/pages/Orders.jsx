// src/pages/Orders.jsx (MODIFICADO)

import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);

  const fetchOrders = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_code,
        customer_id,
        status,
        total_amount,
        created_at,
        cancellation_reason,
        customers(name, phone)
      `)
      .order("created_at", { ascending: false });

    if (error) console.error(error);
    else setOrders(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrderItems = async (orderId) => {
    const { data, error } = await supabase
      .from("order_items")
      .select(`quantity, price, products(name)`)
      .eq("order_id", orderId);

    if (error) console.error(error);
    else setOrderItems(data);
  };

  // --- 👇 FUNCIÓN DE ACTUALIZAR ESTADO MODIFICADA ---
  const updateStatus = async (orderId, newStatus) => {
    let updateData = { status: newStatus };
    
    if (newStatus === 'cancelado') {
      const reason = prompt("Por favor, introduce el motivo de la cancelación:");
      // Si el admin presiona "Cancelar" en el prompt, no hacemos nada.
      if (reason === null) return;
      updateData.cancellation_reason = reason || 'Cancelado por el administrador.';
    }

    const { error } = await supabase
      .from("orders")
      .update(updateData)
      .eq("id", orderId);

    if (error) console.error(error);
    else fetchOrders();
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
            <th>Fecha</th>
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
            {/* ... (contenido del detalle del pedido sin cambios) ... */}
          </table>
          <button onClick={() => setSelectedOrder(null)}>Cerrar detalle</button>
        </div>
      )}
    </div>
  );
}