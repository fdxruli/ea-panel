/* src/pages/Customers.jsx (Refactorizado con Fase 2) */

import React, { useEffect, useState, useCallback, useMemo, memo, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Customers.module.css";
import { useAlert } from "../context/AlertContext";
import DOMPurify from 'dompurify';
import { useAdminAuth } from "../context/AdminAuthContext";
import DynamicMapPicker from '../components/DynamicMapPicker';
import ClientOnly from "../components/ClientOnly";

// --- (PASO A) AÑADIR IMPORTS ---
import { useCustomersBasicCache } from '../hooks/useCustomersBasicCache';
import { useCacheAdmin } from '../context/CacheAdminContext';
import { generateKey } from '../utils/cacheAdminUtils';
// --- FIN PASO A ---

// ==================== ICONOS MEMOIZADOS (Sin cambios) ====================
const UserIcon = memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>));
UserIcon.displayName = 'UserIcon';
const MapPinIcon = memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>));
MapPinIcon.displayName = 'MapPinIcon';
const ClipboardIcon = memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>));
ClipboardIcon.displayName = 'ClipboardIcon';
const EditIcon = memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>));
EditIcon.displayName = 'EditIcon';
const PlusIcon = memo(() => (<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>));
PlusIcon.displayName = 'PlusIcon';

// ==================== CUSTOM HOOK (Sin cambios) ====================
function useDebounce(value, delay = 400) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// ==================== COMPONENTE: ORDER HISTORY (PASO H) ====================

const OrderHistory = memo(({ customerId, loadCustomerOrders }) => { // <-- Props cambiadas
  const [filter, setFilter] = useState('activos');
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderItems, setOrderItems] = useState({});
  const [loadingItems, setLoadingItems] = useState(false);

  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true); // <-- Nuevo estado

  // Cargar pedidos completos cuando componente se monta
  useEffect(() => {
    const loadOrders = async () => {
      setLoadingOrders(true);
      const fullOrders = await loadCustomerOrders(customerId);
      setOrders(fullOrders || []);
      setLoadingOrders(false);
    };
    loadOrders();
  }, [customerId, loadCustomerOrders]); // <-- Dependencias actualizadas

  const filteredOrders = useMemo(() => {
    if (filter === 'activos') {
      return orders.filter(o => ['pendiente', 'en_proceso', 'en_envio'].includes(o.status));
    }
    if (filter === 'completados') {
      return orders.filter(o => o.status === 'completado');
    }
    return orders;
  }, [orders, filter]);

  const toggleOrderDetails = useCallback(async (orderId) => {
    const newExpandedId = expandedOrderId === orderId ? null : orderId;
    setExpandedOrderId(newExpandedId);

    if (newExpandedId && !orderItems[newExpandedId]) {
      setLoadingItems(true);
      try {
        const { data, error } = await supabase
          .from('order_items')
          .select('id, quantity, price, products(name)')
          .eq('order_id', newExpandedId);

        if (error) throw error;
        setOrderItems(prev => ({ ...prev, [newExpandedId]: data }));
      } catch (error) {
        console.error("Error:", error);
      } finally {
        setLoadingItems(false);
      }
    }
  }, [expandedOrderId, orderItems]);

  if (loadingOrders) return <LoadingSpinner />; // <-- Mostrar spinner si carga pedidos

  if (orders.length === 0) {
    return (
      <div className={styles.emptyState}>
        <ClipboardIcon />
        <p>Este cliente no ha realizado ningún pedido.</p>
      </div>
    );
  }

  return (
    <div className={styles.orderHistory}>
      <div className={styles.orderFilters}>
        <button
          className={filter === 'todos' ? styles.activeFilter : ''}
          onClick={() => setFilter('todos')}
        >
          Todos ({orders.length})
        </button>
        <button
          className={filter === 'activos' ? styles.activeFilter : ''}
          onClick={() => setFilter('activos')}
        >
          Activos ({orders.filter(o => ['pendiente', 'en_proceso', 'en_envio'].includes(o.status)).length})
        </button>
        <button
          className={filter === 'completados' ? styles.activeFilter : ''}
          onClick={() => setFilter('completados')}
        >
          Completados ({orders.filter(o => o.status === 'completado').length})
        </button>
      </div>

      <div className={styles.ordersList}>
        {filteredOrders.length === 0 ? (
          <p className={styles.emptyMessage}>No hay pedidos que coincidan con el filtro.</p>
        ) : (
          filteredOrders.map(order => (
            <div key={order.id} className={styles.orderItem}>
              <div
                className={styles.orderHeader}
                onClick={() => toggleOrderDetails(order.id)}
              >
                <div className={styles.orderHeaderLeft}>
                  <strong>#{order.order_code}</strong>
                  <span className={`${styles.statusBadge} ${styles[order.status || 'pendiente']}`}>
                    {(order.status || 'pendiente').replace('_', ' ')}
                  </span>
                </div>
                <div className={styles.orderHeaderRight}>
                  <span className={styles.orderAmount}>${order.total_amount.toFixed(2)}</span>
                  <span className={styles.orderDate}>
                    {new Date(order.created_at).toLocaleDateString('es-MX')}
                  </span>
                </div>
              </div>

              {expandedOrderId === order.id && (
                <div className={styles.orderDetails}>
                  {loadingItems ? (
                    <LoadingSpinner />
                  ) : orderItems[order.id] ? (
                    <>
                      <h4>Productos:</h4>
                      <ul>
                        {orderItems[order.id].map((item, idx) => (
                          <li key={item.id || idx}>
                            {item.quantity}x {item.products?.name || 'Producto'} - ${item.price.toFixed(2)}
                          </li>
                        ))}
                      </ul>
                      {order.cancellation_reason && (
                        <div className={styles.cancellationReason}>
                          <strong>Motivo de cancelación:</strong>
                          <p>{order.cancellation_reason}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <p>No se pudieron cargar los detalles.</p>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
});
OrderHistory.displayName = 'OrderHistory';

// ==================== COMPONENTE: CUSTOMER CARD (Actualizado) ====================

const CustomerCard = memo(({ customer, onSelect }) => {
  // Los stats (totalOrders, completedOrders, totalSpent)
  // ahora vienen pre-calculados en el objeto 'customer'
  const stats = {
    totalOrders: customer.totalOrders || 0,
    completedOrders: customer.completedOrders || 0,
    totalSpent: customer.totalSpent || 0
  };

  return (
    <div className={styles.customerCard} onClick={() => onSelect(customer)}>
      <div className={styles.cardHeader}>
        <div className={styles.customerIcon}>
          <UserIcon />
        </div>
        <div className={styles.customerInfo}>
          <h3>{customer.name}</h3>
          <p>{customer.phone}</p>
        </div>
      </div>

      <div className={styles.cardStats}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.totalOrders}</span>
          <span className={styles.statLabel}>Pedidos</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.completedOrders}</span>
          <span className={styles.statLabel}>Completados</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>${stats.totalSpent.toFixed(2)}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
      </div>

      {customer.referral_code && (
        <div className={styles.referralBadge}>
          🎁 Código: {customer.referral_code}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Comparación actualizada
  return (
    prevProps.customer.id === nextProps.customer.id &&
    prevProps.customer.totalOrders === nextProps.customer.totalOrders &&
    prevProps.customer.name === nextProps.customer.name
  );
});
CustomerCard.displayName = 'CustomerCard';

// ==================== MODAL DE FORMULARIO DE CLIENTE (Sin cambios) ====================

const CustomerFormModal = memo(({ isOpen, onClose, onSave, customer = null }) => {
  // ... (código existente, omitido por brevedad) ...
  const { showAlert } = useAlert();
  const [formData, setFormData] = useState({ name: '', phone: '' });
  const [countryCode, setCountryCode] = useState('+52');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (customer) {
      let phone = customer.phone || '';
      let code = '+52';

      // Detectar lada existente para separar en el formulario
      if (phone.startsWith('+52')) {
        code = '+52';
        phone = phone.substring(3);
      } else if (phone.startsWith('+1')) {
        code = '+1';
        phone = phone.substring(2);
      }
      // Si el número antiguo no tiene lada (ej: 10 dígitos), asumimos +52 y dejamos el número tal cual

      setFormData({ name: customer.name || '', phone: phone });
      setCountryCode(code);
    } else {
      setFormData({ name: '', phone: '' });
      setCountryCode('+52');
    }
  }, [customer, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = DOMPurify.sanitize(formData.name.trim());
    // Limpiamos el teléfono de cualquier caracter no numérico
    const cleanPhone = DOMPurify.sanitize(formData.phone.trim().replace(/\D/g, ''));

    if (!cleanName || !cleanPhone) {
      showAlert('El nombre y el teléfono son obligatorios.');
      return;
    }
    if (cleanPhone.length !== 10) {
      showAlert('El número debe tener 10 dígitos (sin contar la lada).');
      return;
    }

    // Combinamos Lada + Número para guardar en la BD
    const finalPhone = `${countryCode}${cleanPhone}`;

    setIsSubmitting(true);
    try {
      if (customer) {
        // Al actualizar, se guardará con el nuevo formato +52...
        const { error } = await supabase.from('customers').update({ name: cleanName, phone: finalPhone }).eq('id', customer.id);
        if (error) throw error;
        showAlert('Cliente actualizado con éxito.', 'success');
      } else {
        const { data: existing } = await supabase.from('customers').select('id').eq('phone', finalPhone).maybeSingle();
        if (existing) {
          showAlert('Ya existe un cliente con este teléfono.');
          setIsSubmitting(false);
          return;
        }
        const { error } = await supabase.from('customers').insert({ name: cleanName, phone: finalPhone });
        if (error) throw error;
        showAlert('Cliente creado con éxito.', 'success');
      }
      onSave();
      onClose();
    } catch (error) {
      showAlert(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.formModal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>✕</button>
        <h2>{customer ? 'Editar Cliente' : 'Nuevo Cliente'}</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label htmlFor="name">Nombre Completo *</label>
            <input id="name" type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} required />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="phone">Teléfono *</label>
            <div style={{ display: 'flex', gap: '10px' }}>
              <select
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value)}
                style={{ width: '110px', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
              >
                <option value="+52">🇲🇽 +52</option>
                <option value="+1">🇺🇸 +1</option>
                {/* Puedes agregar más ladas aquí */}
              </select>
              <input
                id="phone"
                type="tel"
                maxLength="10"
                placeholder="10 dígitos"
                pattern="\d{10}"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value.replace(/\D/g, '') }))}
                required
                style={{ flex: 1 }}
              />
            </div>
            <small style={{ color: '#666', fontSize: '0.85em' }}>Se guardará como: {countryCode}{formData.phone}</small>
          </div>

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>Cancelar</button>
            <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
              {isSubmitting ? 'Guardando...' : (customer ? 'Actualizar' : 'Crear')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
});
CustomerFormModal.displayName = 'CustomerFormModal';

// ==================== MODAL DE DIRECCIÓN (PASO N) ====================

const AddressFormModal = memo(({ isOpen, onClose, onSave, address = null, customerId }) => {
  const { showAlert } = useAlert();
  // --- (PASO N) Añadir invalidación ---
  const { invalidate } = useCacheAdmin();

  const [formData, setFormData] = useState({ label: '', address_reference: '', coords: null });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mapPickerRef = useRef(null);

  const handleLocationSelect = useCallback((coords) => {
    setFormData(prev => ({ ...prev, coords }));
  }, []);

  const mapInitialPosition = useMemo(() => {
    if (address?.latitude && address?.longitude) {
      return { lat: address.latitude, lng: address.longitude };
    }
    return null;
  }, [address]);

  useEffect(() => {
    if (address) {
      setFormData({
        label: address.label || '',
        address_reference: address.address_reference || '',
        coords: address.latitude && address.longitude ? { lat: address.latitude, lng: address.longitude } : null
      });
    } else {
      setFormData({ label: '', address_reference: '', coords: null });
    }
  }, [address, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.coords) {
      showAlert('Por favor, selecciona una ubicación en el mapa.');
      return;
    }
    const cleanLabel = DOMPurify.sanitize(formData.label.trim());
    const cleanReference = DOMPurify.sanitize(formData.address_reference.trim());
    if (!cleanLabel) {
      showAlert('El nombre de la dirección es obligatorio.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { data: existingDefault } = await supabase
        .from('customer_addresses')
        .select('id')
        .eq('customer_id', customerId)
        .eq('is_default', true)
        .maybeSingle();
      const shouldBeDefault = !existingDefault;
      const addressData = {
        customer_id: customerId,
        label: cleanLabel,
        address_reference: cleanReference,
        latitude: formData.coords.lat,
        longitude: formData.coords.lng,
        is_default: shouldBeDefault,
        address: null
      };
      if (address) {
        addressData.is_default = address.is_default;
        const { error } = await supabase.from('customer_addresses').update(addressData).eq('id', address.id);
        if (error) throw error;
        showAlert('Dirección actualizada con éxito.', 'success');
      } else {
        const { error } = await supabase.from('customer_addresses').insert(addressData);
        if (error) throw error;
        showAlert('Dirección creada con éxito.', 'success');
      }

      // --- (PASO N) Invalidar caché de direcciones del cliente ---
      const addressesKey = generateKey('addresses', { customer_id: customerId });
      invalidate(addressesKey);

      onSave();
      onClose();
    } catch (error) {
      console.error('Error:', error);
      showAlert(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      {/* ... (JSX del modal de dirección, sin cambios) ... */}
      <div className={styles.addressFormModal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.closeButton} onClick={onClose}>✕</button>
        <h2>{address ? 'Editar Dirección' : 'Nueva Dirección'}</h2>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}><label htmlFor="label">Nombre de la Dirección *</label><input id="label" type="text" placeholder="Ej: Casa, Oficina, etc." value={formData.label} onChange={(e) => setFormData(prev => ({ ...prev, label: e.target.value }))} required /></div>
          <div className={styles.formGroup}><label htmlFor="reference">Referencias (opcional)</label><textarea id="reference" rows="2" placeholder="Entre qué calles, color de casa, puntos de referencia..." value={formData.address_reference} onChange={(e) => setFormData(prev => ({ ...prev, address_reference: e.target.value }))} /></div>
          <div className={styles.mapSection}>
            <div className={styles.mapHeader}><label>Ubicación en el Mapa *</label></div>
            <div className={styles.mapContainer}>
              <React.Suspense fallback={<div className={styles.mapLoading}>Cargando mapa...</div>}>
                <DynamicMapPicker ref={mapPickerRef} onLocationSelect={handleLocationSelect} initialPosition={mapInitialPosition} isDraggable={true} />
              </React.Suspense>
            </div>
            {formData.coords && (<div className={styles.coordsInfo}>✅ Ubicación seleccionada: {formData.coords.lat.toFixed(6)}, {formData.coords.lng.toFixed(6)}</div>)}
          </div>
          <div className={styles.infoNote}>💡 La primera dirección que agregues será la predeterminada automáticamente. Puedes cambiarla después usando el botón "⭐ Predeterminar".</div>
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>Cancelar</button>
            <button type="submit" className={styles.submitButton} disabled={isSubmitting || !formData.coords}>{isSubmitting ? 'Guardando...' : (address ? 'Actualizar' : 'Crear')}</button>
          </div>
        </form>
      </div>
    </div>
  );
});
AddressFormModal.displayName = 'AddressFormModal';

// ==================== MODAL DE CONFIRMACIÓN (Sin cambios) ====================
const ConfirmDeleteModal = memo(({ isOpen, onClose, onConfirm, title, message }) => {
  // ... (código existente, omitido por brevedad) ...
  if (!isOpen) return null;
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.confirmModal} onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3><p>{message}</p>
        <div className={styles.modalActions}>
          <button onClick={onClose} className={styles.cancelButton}>Cancelar</button>
          <button onClick={onConfirm} className={styles.deleteButton}>Eliminar</button>
        </div>
      </div>
    </div>
  );
});
ConfirmDeleteModal.displayName = 'ConfirmDeleteModal';

// ==================== COMPONENTE PRINCIPAL ====================

export default function Customers() {
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();

  // --- (PASO F/J/N) Importar hooks de caché ---
  const { getCached, setCached, invalidate } = useCacheAdmin();

  // --- (PASO B) Reemplazar Estado de Clientes ---
  const {
    data: customersBasicData,
    isLoading: loadingBasic,
    refetch: refetchCustomers // No se usa pero está disponible
  } = useCustomersBasicCache();
  // Corrección para 'null'
  const customersBasic = useMemo(() => customersBasicData || [], [customersBasicData]);

  const [customersWithStats, setCustomersWithStats] = useState([]);
  const [loading, setLoading] = useState(false); // Para stats y cargas secundarias
  // --- FIN PASO B ---

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [deletingAddress, setDeletingAddress] = useState(null);

  // --- (PASO C) Paginación eliminada ---
  // const currentPage = useRef(1);
  // const ITEMS_PER_PAGE = 20;

  const canView = hasPermission('clientes.view');
  const canEdit = hasPermission('clientes.edit');

  const debouncedSearchTerm = useDebounce(searchTerm, 400);

  // --- (PASO C) fetchCustomers ELIMINADO ---

  // --- (PASO D) Crear Función para Calcular Stats Básicos ---
  const calculateBasicStats = useCallback(async (customersList) => {
    if (!customersList || customersList.length === 0) return [];
    setLoading(true);
    try {
      const statsPromises = customersList.map(async (customer) => {
        try {
          // Usar RPC (get_customer_basic_stats)
          // Query optimizada: Solo COUNT y SUM, no traer todos los pedidos
          const { data: stats, error } = await supabase.rpc('get_customer_basic_stats', {
            p_customer_id: customer.id
          });

          // Si la RPC falla O no devuelve datos (p.ej. no existe), usar fallback
          if (error || !stats) {
            if (error) console.error(`Error en RPC para cliente ${customer.id}:`, error);

            const { data: ordersData, error: ordersError } = await supabase
              .from('orders')
              .select('status, total_amount')
              .eq('customer_id', customer.id);

            if (ordersError) throw ordersError;

            const totalOrders = ordersData?.length || 0;
            const completedOrders = ordersData?.filter(o => o.status === 'completado').length || 0;
            const totalSpent = ordersData
              ?.filter(o => o.status === 'completado')
              .reduce((sum, o) => sum + parseFloat(o.total_amount), 0) || 0;

            return {
              ...customer,
              orders: ordersData || [], // El fallback sí trae 'orders'
              totalOrders,
              completedOrders,
              totalSpent
            };
          }

          // stats es un array, tomamos el primer (y único) objeto
          const statsObject = stats?.[0];

          return {
            ...customer,
            totalOrders: statsObject?.total_orders || 0,
            completedOrders: statsObject?.completed_orders || 0,
            totalSpent: statsObject?.total_spent || 0,
            // Simular 'orders' (para CustomerCard) basado en el conteo de la RPC
            //orders: Array(statsObject?.total_orders || 0).fill({})
          };
        } catch (error) {
          console.error(`Error loading stats for customer ${customer.id}:`, error);
          return { ...customer, totalOrders: 0, completedOrders: 0, totalSpent: 0, orders: [] };
        }
      });
      const enrichedCustomers = await Promise.all(statsPromises);
      setCustomersWithStats(enrichedCustomers);
    } catch (error) {
      console.error('Error calculating stats:', error);
      showAlert(`Error al calcular estadísticas: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);
  // --- FIN PASO D ---

  // --- (PASO E) Cargar Stats Cuando Clientes Cambian ---
  useEffect(() => {
    if (!customersBasic || customersBasic.length === 0) {
      setCustomersWithStats([]);
      return;
    }
    calculateBasicStats(customersBasic);
  }, [customersBasic, calculateBasicStats]);
  // --- FIN PASO E ---

  // --- (PASO J) Actualizar Realtime ---
  useEffect(() => {
    if (!canView) return;
    const channel = supabase
      .channel('customers-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'customers',
          select: 'id, name, phone, referral_code, referral_count'
        },
        (payload) => {
          console.log('[Customers] Cambio detectado:', payload.eventType);

          if (payload.eventType === 'INSERT') {
            invalidate('customers:basic');
          } else if (payload.eventType === 'UPDATE') {
            const cached = getCached('customers:basic');
            if (cached) {
              const updated = cached.data.map(c =>
                c.id === payload.new.id ? { ...c, ...payload.new } : c
              );
              setCached('customers:basic', updated);
            }
            setCustomersWithStats(prev => prev.map(c =>
              c.id === payload.new.id
                ? { ...c, ...payload.new }
                : c
            ));
          } else if (payload.eventType === 'DELETE') {
            const cached = getCached('customers:basic');
            if (cached) {
              const filtered = cached.data.filter(c => c.id !== payload.old.id);
              setCached('customers:basic', filtered);
            }
            setCustomersWithStats(prev => prev.filter(c => c.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [canView, invalidate, getCached, setCached]);
  // --- FIN PASO J ---

  // --- (PASO K) loadMoreCustomers ELIMINADO ---

  // --- (PASO L) Actualizar filteredCustomers ---
  const filteredCustomers = useMemo(() => {
    if (!debouncedSearchTerm) return customersWithStats;
    const lowerSearch = debouncedSearchTerm.toLowerCase();
    return customersWithStats.filter(c =>
      c.name.toLowerCase().includes(lowerSearch) ||
      (c.phone && c.phone.includes(debouncedSearchTerm))
    );
  }, [customersWithStats, debouncedSearchTerm]);
  // --- FIN PASO L ---

  // --- (PASO F) Modificar handleSelectCustomer ---
  const handleSelectCustomer = useCallback(async (customer) => {
    setSelectedCustomer(customer);
    try {
      const addressesKey = generateKey('addresses', { customer_id: customer.id });
      const cachedAddresses = getCached(addressesKey);

      if (cachedAddresses && !cachedAddresses.isExpired) {
        console.log('[Customers] Usando direcciones desde caché');
        setAddresses(cachedAddresses.data);
        // No necesitamos cargar pedidos aquí, OrderHistory lo hará
        return;
      }

      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customer.id)
        .order('is_default', { ascending: false });
      if (error) throw error;

      setCached(addressesKey, data || [], 10 * 60 * 1000); // 10 min TTL
      setAddresses(data || []);

    } catch (error) {
      console.error('Error loading addresses:', error);
      setAddresses([]);
    }
  }, [getCached, setCached]);
  // --- FIN PASO F ---

  // --- (PASO G) Crear Función para Cargar Pedidos Completos (BAJO DEMANDA) ---
  const loadCustomerOrders = useCallback(async (customerId) => {
    const ordersKey = generateKey('customer_orders', { customer_id: customerId });

    const cachedOrders = getCached(ordersKey);
    if (cachedOrders && !cachedOrders.isExpired) {
      console.log('[Customers] Usando pedidos desde caché');
      return cachedOrders.data;
    }

    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          id,
          order_code,
          status,
          total_amount,
          created_at,
          cancellation_reason
        `)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
      //.limit(20);
      if (error) throw error;

      setCached(ordersKey, data, 2 * 60 * 1000); // Cache 2 minutos
      return data;

    } catch (error) {
      console.error('Error loading orders:', error);
      return [];
    }
  }, [getCached, setCached]);
  // --- FIN PASO G ---


  const handleEditCustomer = useCallback((customer) => {
    setEditingCustomer(customer);
    setIsFormOpen(true);
  }, []);

  const handleFormSave = useCallback(() => {
    // refetchCustomers(); // El realtime (Paso J) ya maneja esto
    setEditingCustomer(null);
    setIsFormOpen(false);
  }, []);

  const handleAddAddress = useCallback(() => {
    setEditingAddress(null);
    setIsAddressFormOpen(true);
  }, []);

  const handleEditAddress = useCallback((address) => {
    setEditingAddress(address);
    setIsAddressFormOpen(true);
  }, []);

  const handleDeleteAddress = useCallback((address) => {
    setDeletingAddress(address);
  }, []);

  // --- (PASO N) Invalidar Caché de Direcciones en confirmDeleteAddress ---
  const confirmDeleteAddress = useCallback(async () => {
    if (!deletingAddress) return;
    try {
      const { error } = await supabase
        .from('customer_addresses')
        .delete()
        .eq('id', deletingAddress.id);
      if (error) throw error;

      showAlert('Dirección eliminada con éxito.', 'success');

      // Invalidar caché
      const addressesKey = generateKey('addresses', { customer_id: deletingAddress.customer_id });
      invalidate(addressesKey);

      setAddresses(prev => prev.filter(a => a.id !== deletingAddress.id));
      setDeletingAddress(null);
    } catch (error) {
      showAlert(`Error al eliminar: ${error.message}`);
    }
  }, [deletingAddress, showAlert, invalidate]);
  // --- FIN PASO N ---

  // handleAddressSave es llamado por el modal, que ya invalida
  const handleAddressSave = useCallback(async () => {
    if (selectedCustomer) {
      // El modal invalidó, así que forzamos la recarga en handleSelectCustomer
      handleSelectCustomer(selectedCustomer);
    }
    setIsAddressFormOpen(false);
    setEditingAddress(null);
  }, [selectedCustomer, handleSelectCustomer]);

  const handleSetDefaultAddress = useCallback(async (addressId) => {
    if (!selectedCustomer || !canEdit) return;
    try {
      await supabase
        .from('customer_addresses')
        .update({ is_default: false })
        .eq('customer_id', selectedCustomer.id);
      const { error } = await supabase
        .from('customer_addresses')
        .update({ is_default: true })
        .eq('id', addressId);
      if (error) throw error;
      showAlert('Dirección predeterminada actualizada.', 'success');

      // Invalidar caché
      const addressesKey = generateKey('addresses', { customer_id: selectedCustomer.id });
      invalidate(addressesKey);

      setAddresses(prev => prev.map(addr => ({
        ...addr,
        is_default: addr.id === addressId
      })).sort((a, b) => b.is_default - a.is_default));

    } catch (error) {
      showAlert(`Error: ${error.message}`);
    }
  }, [selectedCustomer, canEdit, showAlert, invalidate]);

  const globalStats = useMemo(() => {
    const totalCustomers = customersWithStats.length;
    const withOrders = customersWithStats.filter(c => c.totalOrders > 0).length;
    const avgOrdersPerCustomer = totalCustomers > 0
      ? (customersWithStats.reduce((sum, c) => sum + c.totalOrders, 0) / totalCustomers).toFixed(1)
      : 0;
    return { totalCustomers, withOrders, avgOrdersPerCustomer };
  }, [customersWithStats]);

  // --- (PASO M) Actualizar Loading ---
  if (loadingBasic || loading) return <LoadingSpinner />;
  // --- FIN PASO M ---

  if (!canView) {
    return (
      <div className={styles.container}>
        <div className={styles.noPermission}><p>No tienes permisos para ver esta sección.</p></div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Clientes</h1>
          <p className={styles.subtitle}>
            {globalStats.totalCustomers} clientes • {globalStats.withOrders} con pedidos •
            Promedio {globalStats.avgOrdersPerCustomer} pedidos/cliente
          </p>
        </div>
        {canEdit && (
          <button
            className={styles.addButton}
            onClick={() => {
              setEditingCustomer(null);
              setIsFormOpen(true);
            }}
          >
            <PlusIcon /> Nuevo Cliente
          </button>
        )}
      </div>

      <div className={styles.searchBar}>
        <input
          type="text"
          placeholder="Buscar por nombre o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      <div className={styles.customersGrid}>
        {filteredCustomers.length === 0 ? (
          <div className={styles.emptyState}><p>No se encontraron clientes.</p></div>
        ) : (
          filteredCustomers.map(customer => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              onSelect={handleSelectCustomer}
            />
          ))
        )}
      </div>

      {/* --- (PASO K) Paginación eliminada --- */}

      {selectedCustomer && (
        <div className={styles.modalOverlay} onClick={() => setSelectedCustomer(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeButton} onClick={() => setSelectedCustomer(null)}>✕</button>

            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <div className={styles.modalIcon}><UserIcon /></div>
                <div>
                  <h2>{selectedCustomer.name}</h2>
                  <p>{selectedCustomer.phone}</p>
                </div>
              </div>
              {canEdit && (
                <button
                  className={styles.editButtonTop}
                  onClick={() => handleEditCustomer(selectedCustomer)}
                >
                  <EditIcon /> Editar
                </button>
              )}
            </div>

            <div className={styles.modalBody}>
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3><MapPinIcon /> Direcciones</h3>
                  {canEdit && (
                    <button
                      className={styles.addSmallButton}
                      onClick={handleAddAddress}
                    >
                      <PlusIcon /> Agregar
                    </button>
                  )}
                </div>

                {addresses.length === 0 ? (
                  <div className={styles.emptyAddresses}>
                    <p>No hay direcciones guardadas.</p>
                    {canEdit && (
                      <button
                        className={styles.addFirstButton}
                        onClick={handleAddAddress}
                      >
                        <PlusIcon /> Agregar Primera Dirección
                      </button>
                    )}
                  </div>
                ) : (
                  <div className={styles.addressesList}>
                    {addresses.map(addr => (
                      <div key={addr.id} className={styles.addressItem}>
                        <div className={styles.addressHeader}>
                          <strong>{addr.label}</strong>
                          <div className={styles.addressBadges}>
                            {addr.is_default && (
                              <span className={styles.defaultBadge}>Predeterminada</span>
                            )}
                          </div>
                        </div>
                        {addr.latitude && addr.longitude && (
                          <div className={styles.addressMapContainer}>
                            <ClientOnly>
                              <DynamicMapPicker
                                initialPosition={{ lat: addr.latitude, lng: addr.longitude }}
                                isDraggable={false}
                              />
                            </ClientOnly>
                          </div>
                        )}
                        {addr.address_reference && (
                          <small className={styles.reference}>
                            📍 {addr.address_reference}
                          </small>
                        )}
                        {canEdit && (
                          <div className={styles.addressActions}>
                            {!addr.is_default && (
                              <button
                                className={styles.setDefaultButton}
                                onClick={() => handleSetDefaultAddress(addr.id)}
                              >
                                ⭐ Predeterminar
                              </button>
                            )}
                            <button
                              className={styles.editAddressButton}
                              onClick={() => handleEditAddress(addr)}
                            >
                              <EditIcon /> Editar
                            </button>
                            <button
                              className={styles.deleteAddressButton}
                              onClick={() => handleDeleteAddress(addr)}
                            >
                              🗑️ Eliminar
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className={styles.section}>
                <h3><ClipboardIcon /> Historial de Pedidos</h3>
                {/* --- (PASO I) Actualizar llamada a OrderHistory --- */}
                <OrderHistory
                  customerId={selectedCustomer.id}
                  loadCustomerOrders={loadCustomerOrders}
                />
                {/* --- FIN PASO I --- */}
              </div>
            </div>
          </div>
        </div>
      )}

      <CustomerFormModal
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingCustomer(null);
        }}
        onSave={handleFormSave}
        customer={editingCustomer}
      />

      <AddressFormModal
        isOpen={isAddressFormOpen}
        onClose={() => {
          setIsAddressFormOpen(false);
          setEditingAddress(null);
        }}
        onSave={handleAddressSave}
        address={editingAddress}
        customerId={selectedCustomer?.id}
      />

      <ConfirmDeleteModal
        isOpen={!!deletingAddress}
        onClose={() => setDeletingAddress(null)}
        onConfirm={confirmDeleteAddress}
        title="Eliminar Dirección"
        message={`¿Estás seguro de que deseas eliminar la dirección "${deletingAddress?.label}"? Esta acción no se puede deshacer.`}
      />
    </div>
  );
}