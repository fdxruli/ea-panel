/* src/pages/Customers.jsx (Refactorizado con Fase 2) */

import React, { useEffect, useState, useCallback, useMemo, memo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from "./Customers.module.css";
import { useAlert } from "../context/AlertContext";
import DOMPurify from 'dompurify';
import { useAdminAuth } from "../context/AdminAuthContext";
import DynamicMapPicker from '../components/DynamicMapPicker';
import ClientOnly from "../components/ClientOnly";

// --- (PASO A) AÑADIR IMPORTS ---
import { useCacheAdmin } from '../context/CacheAdminContext';
import { generateKey } from '../utils/cacheAdminUtils';
import { fetchCustomerDirectory, fetchCustomerGlobalKPIs, fetchCustomerFavoriteProducts } from '../lib/customerQueries';
import { subscribeToTables } from '../lib/sharedAdminRealtime';
import { exportToCSV } from '../utils/exportUtils';
// --- FIN PASO A ---
import { CircleCheck, Gift, Info, Star, Trash2, X, Users, DollarSign, TrendingUp, AlertTriangle, ArrowUpDown, Crown, ShoppingBag, Clock, LayoutGrid, Table as TableIcon, Download, Phone, MessageCircle, Package, Repeat, Sparkles } from 'lucide-react';




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

// ==================== COMPONENTE: PRODUCTOS FAVORITOS (CRM 360) ====================
const CustomerFavoriteProducts = memo(({ customerId }) => {
  const { getCached, setCached } = useCacheAdmin();
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadFavs = async () => {
      if (!customerId) return;
      const cacheKey = generateKey('customer_favorites', { customer_id: customerId });
      const cached = getCached(cacheKey);
      if (cached && !cached.isExpired) {
        setFavorites(cached.data || []);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await fetchCustomerFavoriteProducts(customerId, 6);
        if (isMounted) {
          setFavorites(data || []);
          setCached(cacheKey, data || [], 5 * 60 * 1000);
        }
      } catch (err) {
        console.error('[CustomerFavoriteProducts] Error cargando productos favoritos:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadFavs();
    return () => {
      isMounted = false;
    };
  }, [customerId, getCached, setCached]);

  if (loading) {
    return <LoadingSpinner />;
  }

  if (favorites.length === 0) {
    return (
      <div className={styles.emptyFavorites}>
        <ShoppingBag size={22} className={styles.textMuted} />
        <p>Aún no hay compras completadas suficientes para calcular productos favoritos.</p>
      </div>
    );
  }

  return (
    <div className={styles.favoritesGrid}>
      {favorites.map((fav, index) => (
        <div key={fav.product_id || index} className={styles.favoriteCard}>
          <div className={styles.favoriteRank}>#{index + 1}</div>
          <div className={styles.favoriteDetails}>
            <span className={styles.favoriteName}>{fav.product_name}</span>
            <div className={styles.favoriteStats}>
              <span className={styles.favoriteQty}>
                <Package size={13} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                {fav.total_qty} {fav.total_qty === 1 ? 'ud.' : 'uds.'}
              </span>
              <span className={styles.bulletSeparator}>•</span>
              <span className={styles.favoriteSpent}>${Number(fav.total_spent || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});
CustomerFavoriteProducts.displayName = 'CustomerFavoriteProducts';

const renderSegmentBadge = (segment) => {
  switch (segment) {
    case 'VIP':
      return (
        <span className={`${styles.segmentBadge} ${styles.badgeVip}`}>
          <Crown size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} /> VIP
        </span>
      );
    case 'Frecuente':
      return (
        <span className={`${styles.segmentBadge} ${styles.badgeFrecuente}`}>
          <Repeat size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} /> Frecuente
        </span>
      );
    case 'En Riesgo':
      return (
        <span className={`${styles.segmentBadge} ${styles.badgeEnRiesgo}`}>
          <AlertTriangle size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} /> En Riesgo
        </span>
      );
    case 'Nuevo':
      return (
        <span className={`${styles.segmentBadge} ${styles.badgeNuevo}`}>
          <Sparkles size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} /> Nuevo
        </span>
      );
    default:
      return (
        <span className={`${styles.segmentBadge} ${styles.badgeInactivo}`}>
          <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '3px' }} /> Inactivo
        </span>
      );
  }
};

// ==================== HELPER DE ACCIONES RÁPIDAS (CRM) ====================
const getWhatsAppUrl = (phone, name = '') => {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, '');
  if (!clean) return null;
  const fullPhone = clean.length === 10 ? `52${clean}` : clean;
  const text = name ? `Hola ${name}, te contactamos de El Amigo:` : 'Hola, te contactamos de El Amigo:';
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`;
};

const getTelUrl = (phone) => {
  if (!phone) return null;
  return `tel:${phone.replace(/\s+/g, '')}`;
};

const CustomerCard = memo(({ customer, onSelect, onCreateOrder, canCreateOrder }) => {
  const stats = {
    totalOrders: customer.totalOrders || 0,
    completedOrders: customer.completedOrders || 0,
    totalSpent: customer.totalSpent || 0,
    avgTicket: customer.avgTicket || (customer.completedOrders > 0 ? (customer.totalSpent / customer.completedOrders) : 0)
  };

  const formattedLastOrder = useMemo(() => {
    if (!customer.last_order_date) return null;
    try {
      return new Date(customer.last_order_date).toLocaleDateString('es-MX', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    } catch {
      return null;
    }
  }, [customer.last_order_date]);

  const waUrl = useMemo(() => getWhatsAppUrl(customer.phone, customer.name), [customer.phone, customer.name]);
  const telUrl = useMemo(() => getTelUrl(customer.phone), [customer.phone]);

  return (
    <div className={styles.customerCard} onClick={() => onSelect(customer)}>
      <div className={styles.cardHeaderTop}>
        <div className={styles.cardHeader} style={{ marginBottom: 0 }}>
          <div className={styles.customerIcon}>
            <UserIcon />
          </div>
          <div className={styles.customerInfo}>
            <h3>{customer.name}</h3>
            <p>{customer.phone}</p>
          </div>
        </div>
        {renderSegmentBadge(customer.customer_segment)}
      </div>

      <div className={styles.cardStats}>
        <div className={styles.statItem}>
          <span className={styles.statValue}>{stats.completedOrders}</span>
          <span className={styles.statLabel}>Pedidos</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>${stats.totalSpent.toFixed(2)}</span>
          <span className={styles.statLabel}>Total LTV</span>
        </div>
        <div className={styles.statItem}>
          <span className={styles.statValue}>${stats.avgTicket.toFixed(2)}</span>
          <span className={styles.statLabel}>Promedio</span>
        </div>
      </div>

      {formattedLastOrder && (
        <div className={styles.lastOrderDate}>
          <Clock size={12} style={{ verticalAlign: 'middle', marginRight: '4px' }} /> Última compra: {formattedLastOrder}
        </div>
      )}

      {customer.referral_code && (
        <div className={styles.referralBadge}>
          <Gift size={14} aria-hidden="true" /> Código: {customer.referral_code}
        </div>
      )}

      <div className={styles.cardActions} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cardQuickContact}>
          {waUrl && (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.actionIconButton} ${styles.actionWhatsApp}`}
              title="Enviar WhatsApp"
            >
              <MessageCircle size={15} />
            </a>
          )}
          {telUrl && (
            <a
              href={telUrl}
              className={`${styles.actionIconButton} ${styles.actionCall}`}
              title={`Llamar a ${customer.name}`}
            >
              <Phone size={15} />
            </a>
          )}
        </div>

        <div className={styles.cardMainActions}>
          {canCreateOrder && (
            <button
              type="button"
              className={styles.actionNewOrderButton}
              onClick={(e) => onCreateOrder(customer, e)}
              title="Crear pedido para este cliente"
            >
              <ShoppingBag size={13} /> Pedido
            </button>
          )}
          <button
            type="button"
            className={styles.viewDetailButton}
            onClick={() => onSelect(customer)}
            title="Ver ficha completa"
          >
            Ficha
          </button>
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.customer.id === nextProps.customer.id &&
    prevProps.customer.totalOrders === nextProps.customer.totalOrders &&
    prevProps.customer.totalSpent === nextProps.customer.totalSpent &&
    prevProps.customer.name === nextProps.customer.name &&
    prevProps.customer.phone === nextProps.customer.phone &&
    prevProps.customer.customer_segment === nextProps.customer.customer_segment &&
    prevProps.customer.last_order_date === nextProps.customer.last_order_date &&
    prevProps.canCreateOrder === nextProps.canCreateOrder
  );
});
CustomerCard.displayName = 'CustomerCard';

// ==================== COMPONENTE: CUSTOMER TABLE (CRM) ====================

const CustomerTable = memo(({ customers, onSelect, onSort, currentSort, onCreateOrder, canCreateOrder }) => {
  return (
    <div className={styles.tableResponsive}>
      <table className={styles.customerTable}>
        <thead>
          <tr>
            <th onClick={() => onSort('name_asc')} className={styles.sortableTh}>
              Cliente {currentSort === 'name_asc' ? '▲' : ''}
            </th>
            <th>Segmento</th>
            <th onClick={() => onSort('orders_desc')} className={`${styles.sortableTh} ${styles.textRight}`}>
              Pedidos {currentSort === 'orders_desc' ? '▼' : ''}
            </th>
            <th onClick={() => onSort('spent_desc')} className={`${styles.sortableTh} ${styles.textRight}`}>
              Total LTV {currentSort === 'spent_desc' ? '▼' : ''}
            </th>
            <th className={styles.textRight}>Ticket Prom.</th>
            <th onClick={() => onSort('last_order_desc')} className={styles.sortableTh}>
              Última Compra {currentSort === 'last_order_desc' ? '▼' : ''}
            </th>
            <th className={styles.textCenter}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((c) => {
            const formattedDate = c.last_order_date
              ? new Date(c.last_order_date).toLocaleDateString('es-MX', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
                })
              : 'Sin compras';

            const waUrl = getWhatsAppUrl(c.phone, c.name);
            const telUrl = getTelUrl(c.phone);

            return (
              <tr key={c.id} className={styles.tableRow} onClick={() => onSelect(c)}>
                <td>
                  <div className={styles.tableClientInfo}>
                    <div className={styles.tableAvatar}>
                      <UserIcon />
                    </div>
                    <div>
                      <span className={styles.tableClientName}>{c.name}</span>
                      <span className={styles.tableClientPhone}>{c.phone}</span>
                    </div>
                  </div>
                </td>
                <td>{renderSegmentBadge(c.customer_segment)}</td>
                <td className={`${styles.textRight} ${styles.fontBold}`}>
                  {c.completedOrders}
                </td>
                <td className={`${styles.textRight} ${styles.totalSpentCell}`}>
                  ${c.totalSpent.toFixed(2)}
                </td>
                <td className={`${styles.textRight} ${styles.textMuted}`}>
                  ${(c.avgTicket || 0).toFixed(2)}
                </td>
                <td className={styles.textMuted}>
                  {formattedDate}
                </td>
                <td className={styles.tableActionsCell} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.tableActionGroup}>
                    {waUrl && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${styles.tableIconAction} ${styles.actionWhatsApp}`}
                        title="Enviar WhatsApp"
                      >
                        <MessageCircle size={15} />
                      </a>
                    )}
                    {telUrl && (
                      <a
                        href={telUrl}
                        className={`${styles.tableIconAction} ${styles.actionCall}`}
                        title={`Llamar a ${c.name}`}
                      >
                        <Phone size={15} />
                      </a>
                    )}
                    {canCreateOrder && (
                      <button
                        type="button"
                        className={`${styles.tableIconAction} ${styles.actionOrder}`}
                        onClick={(e) => onCreateOrder(c, e)}
                        title="Crear pedido para este cliente"
                      >
                        <ShoppingBag size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={styles.viewDetailButton}
                      onClick={() => onSelect(c)}
                      title="Ver ficha completa del cliente"
                    >
                      Ficha
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});
CustomerTable.displayName = 'CustomerTable';

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
        <button className={styles.closeButton} onClick={onClose} aria-label="Cerrar">
          <X size={18} aria-hidden="true" />
        </button>
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
                <option value="+52">+52</option>
                <option value="+1">+1</option>
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
        <button className={styles.closeButton} onClick={onClose} aria-label="Cerrar">
          <X size={18} aria-hidden="true" />
        </button>
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
            {formData.coords && (
              <div className={styles.coordsInfo}>
                <CircleCheck size={15} aria-hidden="true" /> Ubicación seleccionada: {formData.coords.lat.toFixed(6)}, {formData.coords.lng.toFixed(6)}
              </div>
            )}
          </div>
          <div className={styles.infoNote}>
            <Info size={16} aria-hidden="true" /> La primera dirección que agregues será la predeterminada automáticamente. Puedes cambiarla después usando el botón "Predeterminar".
          </div>
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

  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 400);

  const [sortBy, setSortBy] = useState("spent_desc");
  const [selectedSegment, setSelectedSegment] = useState("all");

  const [kpis, setKpis] = useState(null);
  const [totalFilteredCount, setTotalFilteredCount] = useState(0);

  const initialCacheKey = generateKey('customers_directory', {
    search: debouncedSearchTerm,
    sort: sortBy,
    segment: selectedSegment,
    page: 0
  });

  const initialCached = getCached(initialCacheKey);

  const [customersWithStats, setCustomersWithStats] = useState(() =>
    (initialCached && !initialCached.isExpired) ? (initialCached.data?.customers || []) : []
  );
  const [loading, setLoading] = useState(() => !initialCached || initialCached.isExpired);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(() => initialCached?.data?.hasMore ?? true);
  const PAGE_SIZE = 50;

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [addresses, setAddresses] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState(null);
  const [deletingAddress, setDeletingAddress] = useState(null);

  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('admin_customers_view_mode') || 'table';
    } catch {
      return 'table';
    }
  });

  const handleViewModeChange = useCallback((mode) => {
    setViewMode(mode);
    try {
      localStorage.setItem('admin_customers_view_mode', mode);
    } catch {
      // ignore
    }
  }, []);

  const handleExportCSV = useCallback(() => {
    if (!customersWithStats || customersWithStats.length === 0) {
      showAlert('No hay clientes para exportar con el filtro actual.', 'info');
      return;
    }

    const exportData = customersWithStats.map(c => ({
      'ID': c.id,
      'Nombre': c.name || '',
      'Teléfono': c.phone || '',
      'Segmento': c.customer_segment || 'Inactivo',
      'Pedidos Completados': c.completedOrders,
      'Total Gastado (MXN)': c.totalSpent,
      'Ticket Promedio (MXN)': Number((c.avgTicket || 0).toFixed(2)),
      'Última Compra': c.last_order_date ? new Date(c.last_order_date).toLocaleDateString('es-MX') : 'Sin compras',
      'Fecha Registro': c.created_at ? new Date(c.created_at).toLocaleDateString('es-MX') : '',
      'Código Referido': c.referral_code || ''
    }));

    const dateStr = new Date().toISOString().split('T')[0];
    const segmentLabel = selectedSegment === 'all' ? 'todos' : selectedSegment;
    exportToCSV(exportData, `reporte_clientes_${segmentLabel}_${dateStr}.csv`);
    showAlert(`Se exportaron ${exportData.length} clientes a CSV.`, 'success');
  }, [customersWithStats, selectedSegment, showAlert]);

  const navigate = useNavigate();
  const canView = hasPermission('clientes.view');
  const canEdit = hasPermission('clientes.edit');
  const canCreateOrder = hasPermission('crear-pedido.view');

  const handleCreateOrder = useCallback((customer, e) => {
    if (e) e.stopPropagation();
    navigate('/admin/crear-pedido', {
      state: {
        preselectedCustomer: {
          id: customer.id,
          name: customer.name,
          phone: customer.phone
        }
      }
    });
  }, [navigate]);

  // --- Cargar KPIs globales reales del negocio ---
  const loadKPIs = useCallback(async (force = false) => {
    const kpiCacheKey = 'customers:global_kpis';
    if (!force) {
      const cached = getCached(kpiCacheKey);
      if (cached && !cached.isExpired) {
        setKpis(cached.data);
        return;
      }
    }
    try {
      const data = await fetchCustomerGlobalKPIs();
      setKpis(data);
      setCached(kpiCacheKey, data, 5 * 60 * 1000);
    } catch (error) {
      console.error('Error cargando KPIs:', error);
    }
  }, [getCached, setCached]);

  useEffect(() => {
    loadKPIs();
  }, [loadKPIs]);

  // --- Fetch paginado con ordenamiento y segmentación en servidor ---
  const fetchCustomers = useCallback(async (isLoadMore = false, forceRefresh = false) => {
    if (!canView) return;

    const currentPage = isLoadMore ? page : 0;
    const cacheKey = generateKey('customers_directory', {
      search: debouncedSearchTerm,
      sort: sortBy,
      segment: selectedSegment,
      page: currentPage
    });

    if (!isLoadMore && !forceRefresh) {
      const cached = getCached(cacheKey);
      if (cached && !cached.isExpired) {
        setCustomersWithStats(cached.data?.customers || []);
        setTotalFilteredCount(cached.data?.totalCount || 0);
        setHasMore(cached.data?.hasMore ?? false);
        setLoading(false);
        setPage(1);
        return;
      }
    }

    if (!isLoadMore && customersWithStats.length === 0) {
      setLoading(true);
    }

    try {
      const { customers: enriched, totalCount } = await fetchCustomerDirectory({
        search: debouncedSearchTerm,
        sortBy,
        segment: selectedSegment,
        limit: PAGE_SIZE,
        offset: currentPage * PAGE_SIZE
      });

      const moreAvailable = (currentPage * PAGE_SIZE + enriched.length) < totalCount;

      if (isLoadMore) {
        setCustomersWithStats(prev => [...prev, ...enriched]);
        setPage(currentPage + 1);
      } else {
        setCustomersWithStats(enriched);
        setTotalFilteredCount(totalCount);
        setPage(1);
        setCached(cacheKey, { customers: enriched, totalCount, hasMore: moreAvailable }, 5 * 60 * 1000);
      }
      setHasMore(moreAvailable);
    } catch (error) {
      console.error('Error fetching customers:', error);
      showAlert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearchTerm, sortBy, selectedSegment, page, canView, showAlert, getCached, setCached, customersWithStats.length]);

  useEffect(() => {
    fetchCustomers(false);
  }, [debouncedSearchTerm, sortBy, selectedSegment, fetchCustomers]);

  // --- Actualizar Realtime mediante Canal Compartido ---
  useEffect(() => {
    if (!canView) return;

    const unsubscribe = subscribeToTables(['customers', 'orders'], () => {
      invalidate(new RegExp('^customers_directory'));
      invalidate('customers:global_kpis');
      fetchCustomers(false, true);
      loadKPIs(true);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [canView, fetchCustomers, loadKPIs, invalidate]);



  const filteredCustomers = customersWithStats; // Ya están filtrados por el servidor

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

  // --- (PASO M) Actualizar Loading ---
  if (loading && customersWithStats.length === 0) return <LoadingSpinner />;
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
          <h1>Directorio de Clientes</h1>
          <p className={styles.subtitle}>
            Administración profesional, análisis de consumo y fidelización (CRM)
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

      {/* KPI CARDS */}
      <div className={styles.kpisContainer}>
        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.kpiIconBlue}`}>
            <Users size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiTitle}>Total Clientes</span>
            <span className={styles.kpiValue}>{kpis ? kpis.total_customers : '-'}</span>
            <span className={styles.kpiSubtitle}>
              {kpis ? `${kpis.active_customers} con compras` : 'Cargando...'}
            </span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.kpiIconGreen}`}>
            <DollarSign size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiTitle}>Facturación LTV</span>
            <span className={styles.kpiValue}>
              {kpis ? `$${Number(kpis.total_revenue || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
            </span>
            <span className={styles.kpiSubtitle}>Histórico acumulado</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.kpiIconGold}`}>
            <TrendingUp size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiTitle}>Ticket Promedio</span>
            <span className={styles.kpiValue}>
              {kpis ? `$${Number(kpis.global_avg_ticket || 0).toFixed(2)}` : '-'}
            </span>
            <span className={styles.kpiSubtitle}>Por compra completada</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={`${styles.kpiIcon} ${styles.kpiIconOrange}`}>
            <AlertTriangle size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiTitle}>En Riesgo</span>
            <span className={styles.kpiValue}>{kpis ? kpis.at_risk_count : '-'}</span>
            <span className={styles.kpiSubtitle}>&gt;45 días sin pedir</span>
          </div>
        </div>
      </div>

      {/* CONTROLS: SEARCH, SORTING & SEGMENT PILLS */}
      <div className={styles.controlsBar}>
        <div className={styles.searchAndSortRow}>
          <div className={styles.searchWrapper}>
            <input
              type="text"
              placeholder="Buscar por nombre o teléfono..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={styles.searchInput}
            />
          </div>

          <div className={styles.sortWrapper}>
            <span className={styles.sortLabel}>
              <ArrowUpDown size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
              Ordenar por:
            </span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className={styles.sortSelect}
              aria-label="Ordenar clientes por"
            >
              <option value="spent_desc">Mayor Consumo (LTV)</option>
              <option value="orders_desc">Más Pedidos Completados</option>
              <option value="last_order_desc">Compra Más Reciente</option>
              <option value="last_order_asc">Mayor Tiempo sin Comprar</option>
              <option value="created_desc">Registro Más Reciente</option>
              <option value="name_asc">Nombre (A - Z)</option>
            </select>
          </div>
        </div>

        {/* SEGMENT PILLS */}
        <div className={styles.segmentPills}>
          <button
            className={`${styles.segmentPill} ${selectedSegment === 'all' ? styles.segmentPillActive : ''}`}
            onClick={() => setSelectedSegment('all')}
          >
            Todos <span className={styles.pillBadge}>{kpis?.total_customers ?? '-'}</span>
          </button>
          <button
            className={`${styles.segmentPill} ${selectedSegment === 'vip' ? styles.segmentPillActive : ''}`}
            onClick={() => setSelectedSegment('vip')}
          >
            <Crown size={14} /> VIP <span className={styles.pillBadge}>{kpis?.vip_count ?? '-'}</span>
          </button>
          <button
            className={`${styles.segmentPill} ${selectedSegment === 'frecuente' ? styles.segmentPillActive : ''}`}
            onClick={() => setSelectedSegment('frecuente')}
          >
            <Repeat size={14} /> Frecuentes <span className={styles.pillBadge}>{kpis?.frequent_count ?? '-'}</span>
          </button>
          <button
            className={`${styles.segmentPill} ${selectedSegment === 'en_riesgo' ? styles.segmentPillActive : ''}`}
            onClick={() => setSelectedSegment('en_riesgo')}
          >
            <AlertTriangle size={14} /> En Riesgo <span className={styles.pillBadge}>{kpis?.at_risk_count ?? '-'}</span>
          </button>
          <button
            className={`${styles.segmentPill} ${selectedSegment === 'nuevo' ? styles.segmentPillActive : ''}`}
            onClick={() => setSelectedSegment('nuevo')}
          >
            <Sparkles size={14} /> Nuevos <span className={styles.pillBadge}>{kpis?.new_count ?? '-'}</span>
          </button>
          <button
            className={`${styles.segmentPill} ${selectedSegment === 'inactivo' ? styles.segmentPillActive : ''}`}
            onClick={() => setSelectedSegment('inactivo')}
          >
            <Clock size={14} /> Inactivos <span className={styles.pillBadge}>{kpis?.inactive_count ?? '-'}</span>
          </button>
        </div>
      </div>


      <div className={styles.resultsSummary}>
        <span>
          Mostrando <strong>{filteredCustomers.length}</strong> de <strong>{totalFilteredCount}</strong> clientes
        </span>
        <div className={styles.summaryActions}>
          <button
            type="button"
            className={styles.exportButton}
            onClick={handleExportCSV}
            title="Exportar clientes a archivo CSV"
          >
            <Download size={15} /> Exportar CSV
          </button>
          <div className={styles.viewToggle} role="group" aria-label="Modo de visualización">
            <button
              type="button"
              className={`${styles.viewToggleButton} ${viewMode === 'table' ? styles.viewToggleButtonActive : ''}`}
              onClick={() => handleViewModeChange('table')}
              title="Vista de Tabla CRM"
              aria-label="Vista de Tabla"
            >
              <TableIcon size={16} />
            </button>
            <button
              type="button"
              className={`${styles.viewToggleButton} ${viewMode === 'grid' ? styles.viewToggleButtonActive : ''}`}
              onClick={() => handleViewModeChange('grid')}
              title="Vista de Tarjetas"
              aria-label="Vista de Tarjetas"
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>
      </div>

      {filteredCustomers.length === 0 ? (
        <div className={styles.emptyState}><p>No se encontraron clientes.</p></div>
      ) : viewMode === 'table' ? (
        <CustomerTable
          customers={filteredCustomers}
          onSelect={handleSelectCustomer}
          onSort={setSortBy}
          currentSort={sortBy}
          onCreateOrder={handleCreateOrder}
          canCreateOrder={canCreateOrder}
        />
      ) : (
        <div className={styles.customersGrid}>
          {filteredCustomers.map(customer => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              onSelect={handleSelectCustomer}
              onCreateOrder={handleCreateOrder}
              canCreateOrder={canCreateOrder}
            />
          ))}
        </div>
      )}


      {hasMore && (
        <div className={styles.loadMoreContainer} style={{ textAlign: 'center', margin: '20px 0' }}>
          <button
            className={styles.primaryButton}
            onClick={() => fetchCustomers(true)}
            disabled={loading}
          >
            {loading ? 'Cargando...' : 'Cargar Más'}
          </button>
        </div>
      )}
      {selectedCustomer && (
        <div className={styles.modalOverlay} onClick={() => setSelectedCustomer(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeButton} onClick={() => setSelectedCustomer(null)} aria-label="Cerrar">
              <X size={18} aria-hidden="true" />
            </button>

            <div className={styles.modalHeader}>
              <div className={styles.modalHeaderLeft}>
                <div className={styles.modalIcon}><UserIcon /></div>
                <div>
                  <h2>{selectedCustomer.name}</h2>
                  <p>{selectedCustomer.phone}</p>
                </div>
              </div>
              <div className={styles.modalHeaderActions}>
                {getWhatsAppUrl(selectedCustomer.phone, selectedCustomer.name) && (
                  <a
                    href={getWhatsAppUrl(selectedCustomer.phone, selectedCustomer.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`${styles.actionIconButton} ${styles.actionWhatsApp}`}
                    title="Enviar WhatsApp"
                  >
                    <MessageCircle size={16} />
                  </a>
                )}
                {getTelUrl(selectedCustomer.phone) && (
                  <a
                    href={getTelUrl(selectedCustomer.phone)}
                    className={`${styles.actionIconButton} ${styles.actionCall}`}
                    title={`Llamar a ${selectedCustomer.name}`}
                  >
                    <Phone size={16} />
                  </a>
                )}
                {canCreateOrder && (
                  <button
                    type="button"
                    className={styles.actionNewOrderButton}
                    onClick={(e) => handleCreateOrder(selectedCustomer, e)}
                    title="Crear un pedido para este cliente"
                  >
                    <ShoppingBag size={14} /> Nuevo Pedido
                  </button>
                )}
                {canEdit && (
                  <button
                    className={styles.editButtonTop}
                    onClick={() => handleEditCustomer(selectedCustomer)}
                  >
                    <EditIcon /> Editar
                  </button>
                )}
              </div>
            </div>

            <div className={styles.modalBody}>
              {/* RESUMEN EJECUTIVO CRM 360 */}
              <div className={styles.metrics360Container}>
                <div className={styles.metric360Item}>
                  <span className={styles.metric360Label}>Segmento</span>
                  <div className={styles.metric360BadgeWrap}>
                    {renderSegmentBadge(selectedCustomer.customer_segment)}
                  </div>
                </div>
                <div className={styles.metric360Item}>
                  <span className={styles.metric360Label}>Facturación LTV</span>
                  <span className={`${styles.metric360Value} ${styles.metricHighlight}`}>
                    ${Number(selectedCustomer.totalSpent || 0).toFixed(2)}
                  </span>
                  <span className={styles.metric360Sub}>Total acumulado</span>
                </div>
                <div className={styles.metric360Item}>
                  <span className={styles.metric360Label}>Pedidos</span>
                  <span className={styles.metric360Value}>
                    {selectedCustomer.completedOrders || 0}
                  </span>
                  <span className={styles.metric360Sub}>de {selectedCustomer.totalOrders || 0} totales</span>
                </div>
                <div className={styles.metric360Item}>
                  <span className={styles.metric360Label}>Ticket Promedio</span>
                  <span className={styles.metric360Value}>
                    ${Number(selectedCustomer.avgTicket || (selectedCustomer.completedOrders > 0 ? (selectedCustomer.totalSpent / selectedCustomer.completedOrders) : 0)).toFixed(2)}
                  </span>
                  <span className={styles.metric360Sub}>Por compra completada</span>
                </div>
                {selectedCustomer.last_order_date && (
                  <div className={styles.metric360Item}>
                    <span className={styles.metric360Label}>Última Compra</span>
                    <span className={styles.metric360Date}>
                      {new Date(selectedCustomer.last_order_date).toLocaleDateString('es-MX', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                    <span className={styles.metric360Sub}>Fecha de orden</span>
                  </div>
                )}
                {selectedCustomer.referral_code && (
                  <div className={styles.metric360Item}>
                    <span className={styles.metric360Label}>Referidos</span>
                    <span className={styles.metric360Value}>
                      <Gift size={13} style={{ verticalAlign: 'middle', marginRight: '3px', color: '#f59e0b' }} />
                      {selectedCustomer.referral_code}
                    </span>
                    <span className={styles.metric360Sub}>
                      {selectedCustomer.referral_count || 0} invitados
                    </span>
                  </div>
                )}
              </div>

              {/* PRODUCTOS FAVORITOS */}
              <div className={styles.section}>
                <div className={styles.sectionHeader}>
                  <h3><Star size={18} style={{ color: '#f59e0b', marginRight: '6px' }} /> Productos Más Comprados</h3>
                </div>
                <CustomerFavoriteProducts customerId={selectedCustomer.id} />
              </div>

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
                            <MapPinIcon /> {addr.address_reference}
                          </small>
                        )}
                        {canEdit && (
                          <div className={styles.addressActions}>
                            {!addr.is_default && (
                              <button
                                className={styles.setDefaultButton}
                                onClick={() => handleSetDefaultAddress(addr.id)}
                              >
                                <Star size={14} aria-hidden="true" /> Predeterminar
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
                              <Trash2 size={14} aria-hidden="true" /> Eliminar
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
