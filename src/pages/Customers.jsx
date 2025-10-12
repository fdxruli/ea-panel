<<<<<<< HEAD
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Customers.module.css"; 
import { useAlert } from "../context/AlertContext";
import DOMPurify from 'dompurify';
import { useAdminAuth } from "../context/AdminAuthContext";

const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>;

const OrderHistory = ({ orders }) => {
    const [filter, setFilter] = useState('activos');
    const [expandedOrderId, setExpandedOrderId] = useState(null);
    const [orderItems, setOrderItems] = useState({});
    const [loadingItems, setLoadingItems] = useState(false);

    const filteredOrders = useMemo(() => {
        if (filter === 'activos') {
            return orders.filter(o => o.status === 'pendiente' || o.status === 'en_proceso');
        }
        if (filter === 'completados') {
            return orders.filter(o => o.status === 'completado');
        }
        return orders;
    }, [orders, filter]);

    const toggleOrderDetails = async (orderId) => {
        const newExpandedId = expandedOrderId === orderId ? null : orderId;
        setExpandedOrderId(newExpandedId);

        if (newExpandedId && !orderItems[newExpandedId]) {
            setLoadingItems(true);
            const { data, error } = await supabase
                .from('order_items')
                .select('*, products(name)')
                .eq('order_id', newExpandedId);
            
            if (error) {
                console.error("Error fetching order items:", error);
            } else {
                setOrderItems(prev => ({ ...prev, [newExpandedId]: data }));
            }
            setLoadingItems(false);
        }
    };
    
    if (orders.length === 0) {
        return <p>Este cliente no ha realizado ningún pedido.</p>;
    }

    return (
        <div className={styles.orderHistoryContainer}>
            <div className={styles.orderFilter}>
                <button onClick={() => setFilter('activos')} className={filter === 'activos' ? styles.activeFilter : ''}>Activos</button>
                <button onClick={() => setFilter('completados')} className={filter === 'completados' ? styles.activeFilter : ''}>Completados</button>
                <button onClick={() => setFilter('todos')} className={filter === 'todos' ? styles.activeFilter : ''}>Todos</button>
            </div>
            
            <div className={styles.orderAccordion}>
                {filteredOrders.length > 0 ? filteredOrders.map(order => (
                    <div key={order.id} className={`${styles.orderItem} ${expandedOrderId === order.id ? styles.open : ''}`}>
                        <div className={styles.orderHeader} onClick={() => toggleOrderDetails(order.id)}>
                             <span>#{order.order_code} - {new Date(order.created_at).toLocaleDateString()}</span>
                             <div className={styles.orderHeaderInfo}>
                                <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
                                <span className={styles.orderToggle}>+</span>
                             </div>
                        </div>
                        <div className={styles.orderDetails}>
                            {loadingItems && expandedOrderId === order.id ? <LoadingSpinner /> : (
                                <>
                                    <ul>
                                        {orderItems[order.id]?.map(item => (
                                            <li key={item.id}>
                                                <span>{item.quantity}x {item.products?.name || 'Producto no disponible'}</span>
                                                <span>${(item.price * item.quantity).toFixed(2)}</span>
                                            </li>
                                        ))}
                                        <li className={styles.orderTotal}>
                                            <strong>Total:</strong>
                                            <strong>${order.total_amount.toFixed(2)}</strong>
                                        </li>
                                    </ul>
                                    {order.status === 'cancelado' && order.cancellation_reason && (
                                        <p className={styles.cancellationReason}>
                                            <strong>Motivo:</strong> {order.cancellation_reason}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )) : <p className={styles.noResults}>No hay pedidos que coincidan con el filtro.</p>}
            </div>
        </div>
    );
};

const CreateCustomerModal = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        await onSave({ name: DOMPurify.sanitize(name), phone: DOMPurify.sanitize(phone) });
        setIsSubmitting(false);
        setName('');
        setPhone('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <h2>Crear Nuevo Cliente</h2>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label htmlFor="name">Nombre Completo</label>
                        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="phone">Teléfono (10 dígitos)</label>
                        <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} maxLength="10" required />
                    </div>
                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.cancelButton}>Cancelar</button>
                        <button type="submit" className={styles.saveButton} disabled={isSubmitting}>
                            {isSubmitting ? 'Guardando...' : 'Guardar Cliente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();


  const fetchCustomers = useCallback(async () => {
    const { data, error } = await supabase
      .from("customers")
      .select(`
        *,
        addresses:customer_addresses ( id, label, address_reference, is_default ),
        favorites:customer_favorites ( product_id ),
        orders ( id, order_code, total_amount, status, created_at, cancellation_reason )
      `)
      .order("created_at", { ascending: false })
      .order('created_at', { foreignTable: 'orders', ascending: false });

    if (error) {
      console.error("Error fetching customers:", error);
      showAlert(`Error al cargar clientes: ${error.message}`);
    } else {
      setCustomers(data);
    }
    setLoading(false);
  }, [showAlert]);

  useEffect(() => {
    fetchCustomers();
    const channel = supabase.channel('public:customers_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchCustomers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_addresses' }, fetchCustomers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchCustomers)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCustomers]);
  
  const handleSaveCustomer = async (customerData) => {
      if (!customerData.name || !customerData.phone) {
          showAlert('El nombre y el teléfono son obligatorios.');
          return;
      }
       if (customerData.phone.length !== 10) {
          showAlert('El número de teléfono debe tener 10 dígitos.');
          return;
      }
      
      const { error } = await supabase.from('customers').insert(customerData);
      
      if (error) {
          showAlert(`Error al crear cliente: ${error.message}`);
      } else {
          showAlert('¡Cliente creado con éxito!');
          fetchCustomers();
      }
  };

  const toggleDetails = (customerId) => {
    setExpandedCustomerId(prevId => (prevId === customerId ? null : customerId));
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  const customerStats = useMemo(() => {
    const stats = {};
    if (expandedCustomerId) {
        const customer = customers.find(c => c.id === expandedCustomerId);
        if (customer) {
            stats.lifetimeValue = customer.orders
                .filter(o => o.status === 'completado')
                .reduce((sum, order) => sum + order.total_amount, 0);
            stats.lastOrderDate = customer.orders.length > 0
                ? new Date(customer.orders[0].created_at).toLocaleDateString()
                : 'N/A';
        }
    }
    return stats;
  }, [expandedCustomerId, customers]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1><UserIcon /> Clientes ({filteredCustomers.length})</h1>
         {hasPermission('clientes.edit') && (
          <button onClick={() => setCreateModalOpen(true)} className={styles.addButton}>
            + Añadir Cliente
          </button>
        )}
      </div>

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
                
                <div className={styles.statsSection}>
                    <div className={styles.statItem}>
                        <span>Valor Total</span>
                        <strong>${customerStats.lifetimeValue?.toFixed(2) || '0.00'}</strong>
                    </div>
                    <div className={styles.statItem}>
                        <span>Total Pedidos</span>
                        <strong>{customer.orders.length}</strong>
                    </div>
                     <div className={styles.statItem}>
                        <span>Último Pedido</span>
                        <strong>{customerStats.lastOrderDate || 'N/A'}</strong>
                    </div>
                    <div className={styles.statItem}>
                        <span>Favoritos</span>
                        <strong>{customer.favorites.length}</strong>
                    </div>
                </div>

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
                  <OrderHistory orders={customer.orders} />
                </div>

              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.noResults}>No se encontraron clientes que coincidan con la búsqueda.</p>
      )}
      
      <CreateCustomerModal 
        isOpen={isCreateModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSave={handleSaveCustomer}
      />
    </div>
  );
=======
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Customers.module.css"; 
import { useAlert } from "../context/AlertContext";
import DOMPurify from 'dompurify';
import { useAdminAuth } from "../context/AdminAuthContext";

const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>;

const OrderHistory = ({ orders }) => {
    const [filter, setFilter] = useState('activos');
    const [expandedOrderId, setExpandedOrderId] = useState(null);
    const [orderItems, setOrderItems] = useState({});
    const [loadingItems, setLoadingItems] = useState(false);

    const filteredOrders = useMemo(() => {
        if (filter === 'activos') {
            return orders.filter(o => o.status === 'pendiente' || o.status === 'en_proceso');
        }
        if (filter === 'completados') {
            return orders.filter(o => o.status === 'completado');
        }
        return orders;
    }, [orders, filter]);

    const toggleOrderDetails = async (orderId) => {
        const newExpandedId = expandedOrderId === orderId ? null : orderId;
        setExpandedOrderId(newExpandedId);

        if (newExpandedId && !orderItems[newExpandedId]) {
            setLoadingItems(true);
            const { data, error } = await supabase
                .from('order_items')
                .select('*, products(name)')
                .eq('order_id', newExpandedId);
            
            if (error) {
                console.error("Error fetching order items:", error);
            } else {
                setOrderItems(prev => ({ ...prev, [newExpandedId]: data }));
            }
            setLoadingItems(false);
        }
    };
    
    if (orders.length === 0) {
        return <p>Este cliente no ha realizado ningún pedido.</p>;
    }

    return (
        <div className={styles.orderHistoryContainer}>
            <div className={styles.orderFilter}>
                <button onClick={() => setFilter('activos')} className={filter === 'activos' ? styles.activeFilter : ''}>Activos</button>
                <button onClick={() => setFilter('completados')} className={filter === 'completados' ? styles.activeFilter : ''}>Completados</button>
                <button onClick={() => setFilter('todos')} className={filter === 'todos' ? styles.activeFilter : ''}>Todos</button>
            </div>
            
            <div className={styles.orderAccordion}>
                {filteredOrders.length > 0 ? filteredOrders.map(order => (
                    <div key={order.id} className={`${styles.orderItem} ${expandedOrderId === order.id ? styles.open : ''}`}>
                        <div className={styles.orderHeader} onClick={() => toggleOrderDetails(order.id)}>
                             <span>#{order.order_code} - {new Date(order.created_at).toLocaleDateString()}</span>
                             <div className={styles.orderHeaderInfo}>
                                <span className={`${styles.status} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
                                <span className={styles.orderToggle}>+</span>
                             </div>
                        </div>
                        <div className={styles.orderDetails}>
                            {loadingItems && expandedOrderId === order.id ? <LoadingSpinner /> : (
                                <>
                                    <ul>
                                        {orderItems[order.id]?.map(item => (
                                            <li key={item.id}>
                                                <span>{item.quantity}x {item.products?.name || 'Producto no disponible'}</span>
                                                <span>${(item.price * item.quantity).toFixed(2)}</span>
                                            </li>
                                        ))}
                                        <li className={styles.orderTotal}>
                                            <strong>Total:</strong>
                                            <strong>${order.total_amount.toFixed(2)}</strong>
                                        </li>
                                    </ul>
                                    {order.status === 'cancelado' && order.cancellation_reason && (
                                        <p className={styles.cancellationReason}>
                                            <strong>Motivo:</strong> {order.cancellation_reason}
                                        </p>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )) : <p className={styles.noResults}>No hay pedidos que coincidan con el filtro.</p>}
            </div>
        </div>
    );
};

const CreateCustomerModal = ({ isOpen, onClose, onSave }) => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        await onSave({ name: DOMPurify.sanitize(name), phone: DOMPurify.sanitize(phone) });
        setIsSubmitting(false);
        setName('');
        setPhone('');
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <h2>Crear Nuevo Cliente</h2>
                <form onSubmit={handleSubmit}>
                    <div className={styles.formGroup}>
                        <label htmlFor="name">Nombre Completo</label>
                        <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="phone">Teléfono (10 dígitos)</label>
                        <input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} maxLength="10" required />
                    </div>
                    <div className={styles.modalActions}>
                        <button type="button" onClick={onClose} className={styles.cancelButton}>Cancelar</button>
                        <button type="submit" className={styles.saveButton} disabled={isSubmitting}>
                            {isSubmitting ? 'Guardando...' : 'Guardar Cliente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCustomerId, setExpandedCustomerId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();


  const fetchCustomers = useCallback(async () => {
    const { data, error } = await supabase
      .from("customers")
      .select(`
        *,
        addresses:customer_addresses ( id, label, address_reference, is_default ),
        favorites:customer_favorites ( product_id ),
        orders ( id, order_code, total_amount, status, created_at, cancellation_reason )
      `)
      .order("created_at", { ascending: false })
      .order('created_at', { foreignTable: 'orders', ascending: false });

    if (error) {
      console.error("Error fetching customers:", error);
      showAlert(`Error al cargar clientes: ${error.message}`);
    } else {
      setCustomers(data);
    }
    setLoading(false);
  }, [showAlert]);

  useEffect(() => {
    fetchCustomers();
    const channel = supabase.channel('public:customers_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, fetchCustomers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_addresses' }, fetchCustomers)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, fetchCustomers)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCustomers]);
  
  const handleSaveCustomer = async (customerData) => {
      if (!customerData.name || !customerData.phone) {
          showAlert('El nombre y el teléfono son obligatorios.');
          return;
      }
       if (customerData.phone.length !== 10) {
          showAlert('El número de teléfono debe tener 10 dígitos.');
          return;
      }
      
      const { error } = await supabase.from('customers').insert(customerData);
      
      if (error) {
          showAlert(`Error al crear cliente: ${error.message}`);
      } else {
          showAlert('¡Cliente creado con éxito!');
          fetchCustomers();
      }
  };

  const toggleDetails = (customerId) => {
    setExpandedCustomerId(prevId => (prevId === customerId ? null : customerId));
  };

  const filteredCustomers = customers.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  const customerStats = useMemo(() => {
    const stats = {};
    if (expandedCustomerId) {
        const customer = customers.find(c => c.id === expandedCustomerId);
        if (customer) {
            stats.lifetimeValue = customer.orders
                .filter(o => o.status === 'completado')
                .reduce((sum, order) => sum + order.total_amount, 0);
            stats.lastOrderDate = customer.orders.length > 0
                ? new Date(customer.orders[0].created_at).toLocaleDateString()
                : 'N/A';
        }
    }
    return stats;
  }, [expandedCustomerId, customers]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1><UserIcon /> Clientes ({filteredCustomers.length})</h1>
         {hasPermission('clientes.edit') && (
          <button onClick={() => setCreateModalOpen(true)} className={styles.addButton}>
            + Añadir Cliente
          </button>
        )}
      </div>

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
                
                <div className={styles.statsSection}>
                    <div className={styles.statItem}>
                        <span>Valor Total</span>
                        <strong>${customerStats.lifetimeValue?.toFixed(2) || '0.00'}</strong>
                    </div>
                    <div className={styles.statItem}>
                        <span>Total Pedidos</span>
                        <strong>{customer.orders.length}</strong>
                    </div>
                     <div className={styles.statItem}>
                        <span>Último Pedido</span>
                        <strong>{customerStats.lastOrderDate || 'N/A'}</strong>
                    </div>
                    <div className={styles.statItem}>
                        <span>Favoritos</span>
                        <strong>{customer.favorites.length}</strong>
                    </div>
                </div>

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
                  <OrderHistory orders={customer.orders} />
                </div>

              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className={styles.noResults}>No se encontraron clientes que coincidan con la búsqueda.</p>
      )}
      
      <CreateCustomerModal 
        isOpen={isCreateModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSave={handleSaveCustomer}
      />
    </div>
  );
>>>>>>> 901f8aa95ca640c871ec1f2bf6437b2b2a625efc
}