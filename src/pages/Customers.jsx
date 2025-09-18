import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner"; // <-- Importa el spinner
import { useAlert } from "../context/AlertContext";

export default function Customers() {
    const { showAlert } = useAlert();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCustomer, setEditingCustomer] = useState(null);

  // Traer clientes
  const fetchCustomers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    else setCustomers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  // Guardar cambios
  const saveCustomer = async () => {
    if (!editingCustomer.name || !editingCustomer.phone || !editingCustomer.address) {
      showAlert("Nombre, teléfono y dirección son obligatorios.");
      return;
    }

    const { error } = await supabase
      .from("customers")
      .update({
        name: editingCustomer.name,
        phone: editingCustomer.phone,
        address: editingCustomer.address,
        references: editingCustomer.references
      })
      .eq("id", editingCustomer.id);

    if (error) console.error(error);
    else {
      setEditingCustomer(null);
      fetchCustomers();
    }
  };

  // Traer historial de pedidos de un cliente
  const getCustomerOrders = async (customerId) => {
    const { data, error } = await supabase
      .from("orders")
      .select("order_code, status, total_amount, created_at")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    return data || [];
  };

  if (loading) return <LoadingSpinner />; // <-- Usa el spinner

  return (
    <div>
      <h1>Clientes</h1>

      {editingCustomer && (
        <div className="form-container">
          <h3>Editar cliente</h3>
          <input
            type="text"
            placeholder="Nombre"
            value={editingCustomer.name}
            onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
          />
          <input
            type="text"
            placeholder="Teléfono"
            value={editingCustomer.phone}
            onChange={(e) => setEditingCustomer({ ...editingCustomer, phone: e.target.value })}
          />
          <input
            type="text"
            placeholder="Dirección"
            value={editingCustomer.address}
            onChange={(e) => setEditingCustomer({ ...editingCustomer, address: e.target.value })}
          />
          <input
            type="text"
            placeholder="Referencias"
            value={editingCustomer.references || ""}
            onChange={(e) => setEditingCustomer({ ...editingCustomer, references: e.target.value })}
          />
          <button onClick={saveCustomer}>Guardar</button>
          <button onClick={() => setEditingCustomer(null)}>Cancelar</button>
        </div>
      )}

      <table className="products-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Teléfono</th>
            <th>Dirección</th>
            <th>Referencias</th>
            <th>Historial pedidos</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.phone}</td>
              <td>{c.address}</td>
              <td>{c.references || "N/A"}</td>
              <td>
                <CustomerOrders customerId={c.id} />
              </td>
              <td>
                <button onClick={() => setEditingCustomer(c)}>Editar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Componente para mostrar pedidos resumidos de un cliente
function CustomerOrders({ customerId }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("order_code, status, total_amount, created_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false });
      if (error) console.error(error);
      else setOrders(data || []);
      setLoading(false);
    };
    fetchOrders();
  }, [customerId]);

  if (loading) return <p>Cargando...</p>;
  if (orders.length === 0) return <p>Sin pedidos</p>;

  return (
    <ul style={{ paddingLeft: "10px" }}>
      {orders.map((o) => (
        <li key={o.order_code}>
          {o.order_code} - ${o.total_amount} ({o.status})
        </li>
      ))}
    </ul>
  );
}