import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);

  // Traer pedidos
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

  // Traer detalles de un pedido
  const fetchOrderItems = async (orderId) => {
    const { data, error } = await supabase
      .from("order_items")
      .select(`quantity, price, products(name)`)
      .eq("order_id", orderId);

    if (error) console.error(error);
    else setOrderItems(data);
  };

  // Cambiar estado de pedido
  const updateStatus = async (orderId, newStatus) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: newStatus })
      .eq("id", orderId);

    if (error) console.error(error);
    else fetchOrders();
  };

  if (loading) return <p>Cargando pedidos...</p>;

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
              <td>{o.status}</td>
              <td>{new Date(o.created_at).toLocaleString()}</td>
              <td>
                <button onClick={() => {
                  setSelectedOrder(o.id);
                  fetchOrderItems(o.id);
                }}>
                  Ver detalle
                </button>
                {o.status !== "completado" && (
                  <>
                    <button onClick={() => updateStatus(o.id, "en_proceso")}>En proceso</button>
                    <button onClick={() => updateStatus(o.id, "completado")}>Completado</button>
                    <button onClick={() => updateStatus(o.id, "cancelado")}>Cancelar</button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Detalle de pedido */}
      {selectedOrder && (
        <div className="form-container">
          <h3>Detalle del pedido</h3>
          <table className="products-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {orderItems.map((item, idx) => (
                <tr key={idx}>
                  <td>{item.products.name}</td>
                  <td>{item.quantity}</td>
                  <td>${item.price}</td>
                  <td>${(item.price * item.quantity).toFixed(2)}</td>
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
