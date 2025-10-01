// src/pages/Customers.jsx (FINAL)

import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Customers.module.css"; 

// --- Iconos para la UI ---
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>;
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>;


export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [searchTerm, setSearchTerm] = useState(""); // <-- NUEVO ESTADO PARA EL BUSCADOR

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select(`
        *,
        addresses:customer_addresses ( id, label, address_reference, is_default ),
        favorites:customer_favorites ( product_id ),
        orders ( id, order_code, total_amount, status, created_at )
      `)
      .order("created_at", { ascending: false })
      .order('created_at', { foreignTable: 'orders', ascending: false });

    if (error) {
      console.error("Error fetching customers:", error);
    } else {
      setCustomers(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const toggleDetails = (customerId) => {
    setExpandedCustomerId(prevId => (prevId === customerId ? null : customerId));
  };

  // --- 👇 LÓGICA PARA FILTRAR CLIENTES ---
  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <h1><UserIcon /> Clientes ({filteredCustomers.length})</h1>

      {/* --- 👇 INPUT DEL BUSCADOR --- */}
      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Buscar cliente por nombre o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {filteredCustomers.length > 0 ? (
        <div className={styles.customerGrid}>
          {filteredCustomers.map((customer) => (
            <div
              key={customer.id}
              className={`${styles.customerCard} ${expandedCustomerId === customer.id ? styles.open : ""}`}
            >
              <div className={styles.cardHeader} onClick={() => toggleDetails(customer.id)}>
                <div>
                  <h3 className={styles.customerName}>{customer.name}</h3>
                  <span className={styles.customerPhone}>{customer.phone}</span>
                </div>
                <button className={styles.toggleButton}>
                  {expandedCustomerId === customer.id ? '−' : '+'}
                </button>
              </div>

              <div className={styles.detailsContent}>
                <div className={styles.infoSection}>
                  <h4><MapPinIcon /> Direcciones ({customer.addresses.length})</h4>
                  {customer.addresses.length > 0 ? (
                    <ul>
                      {customer.addresses.map(addr => (
                        <li key={addr.id}>
                          {addr.label} {addr.is_default && <span>(Predeterminada)</span>}
                          <p>{addr.address_reference || "Sin referencia"}</p>
                        </li>
                      ))}
                    </ul>
                  ) : <p>No hay direcciones guardadas.</p>}
                </div>

                <div className={styles.infoSection}>
                  <h4><ClipboardIcon /> Historial de Pedidos ({customer.orders.length})</h4>
                  {customer.orders.length > 0 ? (
                    <ul className={styles.orderList}>
                      {customer.orders.slice(0, 5).map(order => (
                        <li key={order.id}>
                          <span>#{order.order_code}</span>
                          <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
                          <span>${order.total_amount.toFixed(2)}</span>
                          <span>{new Date(order.created_at).toLocaleDateString()}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p>No ha realizado ningún pedido.</p>}
                </div>
                
                <div className={styles.infoSection}>
                   <h4><HeartIcon/> Favoritos ({customer.favorites.length})</h4>
                   <p>{customer.favorites.length > 0 ? `Tiene ${customer.favorites.length} producto(s) en sus favoritos.` : 'No tiene productos favoritos.'}</p>
                </div>

              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.noResults}>No se encontraron clientes que coincidan con la búsqueda.</p>
      )}
    </div>
  );
}