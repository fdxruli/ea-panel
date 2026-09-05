/* src/components/ProductDetailDrawer.jsx */
import React, { useEffect, useState, useMemo, memo } from 'react';
import { fetchAdminProductDetailAnalytics } from '../lib/productAdminQueries';
import LoadingSpinner from './LoadingSpinner';
import styles from './ProductDetailDrawer.module.css';
import { 
  X, 
  DollarSign, 
  TrendingUp, 
  Layers, 
  Users, 
  ShoppingBag, 
  Star, 
  MessageCircle, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  Edit3, 
  Image as ImageIcon,
  Power,
  Globe
} from 'lucide-react';
import ImageWithFallback from './ImageWithFallback';

const getWhatsAppUrl = (phone, customerName = '', productName = '') => {
  if (!phone) return null;
  const clean = phone.replace(/\D/g, '');
  if (!clean) return null;
  const fullPhone = clean.length === 10 ? `52${clean}` : clean;
  const text = `Hola ${customerName || ''}, te contactamos de Entre Alas sobre tu producto favorito (${productName}):`;
  return `https://wa.me/${fullPhone}?text=${encodeURIComponent(text)}`;
};

const renderMatrixBadge = (matrixClass) => {
  switch (matrixClass) {
    case 'star':
      return <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}>⭐ Estrella</span>;
    case 'workhorse':
      return <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: 'rgba(59, 130, 246, 0.15)', color: '#2563eb' }}>🐎 Caballo de Batalla</span>;
    case 'puzzle':
      return <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: 'rgba(168, 85, 247, 0.15)', color: '#7c3aed' }}>🧩 Oportunidad</span>;
    default:
      return <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: 'rgba(239, 68, 68, 0.15)', color: '#dc2626' }}>⚠️ Por Revisar</span>;
  }
};

const renderStockBadge = (status, maxPreparable) => {
  switch (status) {
    case 'out_of_stock':
      return <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: 'rgba(239, 68, 68, 0.15)', color: '#dc2626' }}>🚫 Agotado (0 porc.)</span>;
    case 'low_stock':
      return <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: 'rgba(245, 158, 11, 0.15)', color: '#d97706' }}>⚠️ Stock Bajo ({maxPreparable || 0} porc.)</span>;
    case 'in_stock':
      return <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: 'rgba(34, 197, 94, 0.15)', color: '#16a34a' }}>🟢 En Stock ({maxPreparable !== null ? `${maxPreparable} porc.` : 'Disponible'})</span>;
    default:
      return <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: 'rgba(156, 163, 175, 0.15)', color: '#4b5563' }}>⚪ Sin Insumos</span>;
  }
};

export default memo(function ProductDetailDrawer({ 
  productId, 
  initialProduct = null,
  isOpen, 
  onClose, 
  onEdit, 
  onManageImages, 
  onManageAudience,
  onToggleActive,
  canEdit = true
}) {
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState(null);

  useEffect(() => {
    if (!isOpen || !productId) return;

    let isMounted = true;
    setLoading(true);

    fetchAdminProductDetailAnalytics(productId)
      .then(data => {
        if (isMounted) {
          setAnalyticsData(data);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error('Error cargando analítica de producto:', err);
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [isOpen, productId]);

  // Manejo de tecla Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const product = analyticsData?.product || initialProduct || {};
  const recipe = analyticsData?.recipe || [];
  const topCustomers = analyticsData?.top_customers || [];
  const recentOrders = analyticsData?.recent_orders || [];
  const sales30d = analyticsData?.sales_summary_30d || {};
  const reviews = analyticsData?.reviews || [];

  const price = Number(product.price || 0);
  const cost = Number(product.cost || 0);
  const marginAmount = price - cost;
  const marginPercent = price > 0 ? ((marginAmount / price) * 100).toFixed(1) : 0;

  return (
    <div className={styles.overlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.drawer} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.drawerHeader}>
          <ImageWithFallback 
            src={product.image_url || 'https://placehold.co/100x100'} 
            alt={product.name} 
            className={styles.headerImage} 
          />
          <div className={styles.headerInfo}>
            <h2 className={styles.headerTitle}>{product.name || 'Detalle del Producto'}</h2>
            <div className={styles.headerBadges}>
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'var(--text-secondary)' }}>
                {product.category_name || 'Sin categoría'}
              </span>
              {product.is_exclusive ? (
                <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: 'rgba(139, 92, 246, 0.15)', color: '#8b5cf6', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Users size={11} /> Clientes Especiales ({analyticsData?.assigned_customers?.length || product.target_customers_count || 0})
                </span>
              ) : (
                <span style={{ padding: '3px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '700', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Globe size={11} /> Público General
                </span>
              )}
              {initialProduct?.menu_matrix_class && renderMatrixBadge(initialProduct.menu_matrix_class)}
              {initialProduct?.stock_status && renderStockBadge(initialProduct.stock_status, initialProduct.max_preparable)}
            </div>
          </div>
          <button className={styles.closeButton} onClick={onClose} aria-label="Cerrar panel">
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className={styles.tabsNav}>
          <button 
            className={`${styles.tabButton} ${activeTab === 'overview' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <TrendingUp size={15} /> General
          </button>
          <button 
            className={`${styles.tabButton} ${activeTab === 'recipe' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('recipe')}
          >
            <Layers size={15} /> Insumos ({recipe.length})
          </button>
          <button 
            className={`${styles.tabButton} ${activeTab === 'customers' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('customers')}
          >
            <Users size={15} /> Top Clientes ({topCustomers.length})
          </button>
          <button 
            className={`${styles.tabButton} ${activeTab === 'orders' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('orders')}
          >
            <ShoppingBag size={15} /> Pedidos ({recentOrders.length})
          </button>
          <button 
            className={`${styles.tabButton} ${activeTab === 'reviews' ? styles.tabButtonActive : ''}`}
            onClick={() => setActiveTab('reviews')}
          >
            <Star size={15} /> Reseñas ({reviews.length})
          </button>
        </div>

        {/* Content Area */}
        <div className={styles.drawerContent}>
          {loading ? (
            <LoadingSpinner />
          ) : (
            <>
              {/* TAB 1: OVERVIEW */}
              {activeTab === 'overview' && (
                <>
                  {product.description && (
                    <div style={{ background: 'var(--bg-secondary)', padding: '14px', borderRadius: '8px', fontSize: '13px', lineHeight: '1.5', color: 'var(--text-secondary)' }}>
                      {product.description}
                    </div>
                  )}

                  {/* Financial Metrics */}
                  <div className={styles.financialCard}>
                    <div style={{ fontWeight: '700', fontSize: '14px', marginBottom: '10px', color: 'var(--text-primary)' }}>
                      Estructura Financiera Unitaria
                    </div>
                    <div className={styles.financialRow}>
                      <span>Precio de Venta</span>
                      <strong style={{ fontSize: '15px' }}>${price.toFixed(2)}</strong>
                    </div>
                    <div className={styles.financialRow}>
                      <span>Costo de Preparación</span>
                      <span style={{ color: 'var(--text-secondary)' }}>${cost.toFixed(2)}</span>
                    </div>
                    <div className={styles.financialRow}>
                      <span>Ganancia Neta por Unidad</span>
                      <strong style={{ color: marginAmount >= 0 ? '#16a34a' : '#dc2626' }}>
                        +${marginAmount.toFixed(2)}
                      </strong>
                    </div>
                    <div className={styles.financialRow}>
                      <span>Margen de Ganancia (%)</span>
                      <strong style={{ 
                        color: marginPercent >= 50 ? '#16a34a' : marginPercent >= 35 ? '#d97706' : '#dc2626',
                        fontSize: '15px'
                      }}>
                        {marginPercent}%
                      </strong>
                    </div>
                  </div>

                  {/* Audiencia y Control de Acceso Card */}
                  <div className={styles.financialCard} style={{ marginTop: '12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                      <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {product.is_exclusive ? <Users size={16} color="#8b5cf6" /> : <Globe size={16} color="#10b981" />}
                        Audiencia y Visibilidad
                      </div>
                      {canEdit && (
                        <button
                          onClick={() => onManageAudience && onManageAudience(product)}
                          style={{
                            background: 'rgba(139, 92, 246, 0.12)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            color: '#8b5cf6',
                            padding: '4px 10px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            cursor: 'pointer',
                            fontWeight: '600'
                          }}
                        >
                          Configurar
                        </button>
                      )}
                    </div>
                    {product.is_exclusive ? (
                      <div>
                        <p style={{ fontSize: '13px', color: '#c4b5fd', margin: '0 0 8px 0' }}>
                          🔒 <strong>Acceso Exclusivo:</strong> Este producto solo es visible en el menú digital para los clientes asignados.
                        </p>
                        {analyticsData?.assigned_customers && analyticsData.assigned_customers.length > 0 ? (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
                            {analyticsData.assigned_customers.map((c) => (
                              <span
                                key={c.id}
                                style={{
                                  padding: '4px 10px',
                                  borderRadius: '16px',
                                  fontSize: '12px',
                                  background: 'rgba(139, 92, 246, 0.15)',
                                  border: '1px solid rgba(139, 92, 246, 0.3)',
                                  color: 'var(--text-primary)',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px'
                                }}
                              >
                                👤 {c.name} {c.phone ? `(${c.phone})` : ''}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <small style={{ color: 'var(--text-secondary)' }}>
                            No hay clientes asignados actualmente. El producto estará oculto hasta que selecciones clientes.
                          </small>
                        )}
                      </div>
                    ) : (
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                        🌐 <strong>Público en General:</strong> Visible para todos los comensales y visitantes en el menú digital.
                      </div>
                    )}
                  </div>

                  {/* High Level Sales Metrics */}
                  <div className={styles.metricsGrid}>
                    <div className={styles.metricCard}>
                      <span className={styles.metricLabel}>Ventas Históricas</span>
                      <span className={styles.metricValue}>{initialProduct?.total_sold || 0}</span>
                      <span className={styles.metricNote}>Unidades totales vendidas</span>
                    </div>

                    <div className={styles.metricCard}>
                      <span className={styles.metricLabel}>Facturación Total</span>
                      <span className={styles.metricValue}>
                        ${Number(initialProduct?.total_revenue || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <span className={styles.metricNote}>Ingresos brutos generados</span>
                    </div>

                    <div className={styles.metricCard}>
                      <span className={styles.metricLabel}>Últimos 30 Días</span>
                      <span className={styles.metricValue}>{sales30d.units_sold_30d || 0} uds</span>
                      <span className={styles.metricNote}>
                        ${Number(sales30d.revenue_30d || 0).toFixed(2)} en {sales30d.orders_count_30d || 0} pedidos
                      </span>
                    </div>

                    <div className={styles.metricCard}>
                      <span className={styles.metricLabel}>Favoritos de Clientes</span>
                      <span className={styles.metricValue}>{initialProduct?.favorites_count || 0}</span>
                      <span className={styles.metricNote}>Guardado en favoritos</span>
                    </div>
                  </div>
                </>
              )}

              {/* TAB 2: RECIPE & INGREDIENTS */}
              {activeTab === 'recipe' && (
                <div>
                  {!product.track_stock ? (
                    <div className={styles.emptyState}>
                      <AlertTriangle size={32} style={{ color: '#f59e0b', marginBottom: '8px' }} />
                      <p>Este producto no tiene activado el rastreo de insumos por receta.</p>
                      <small>Puedes activar el rastreo y configurar su receta haciendo clic en "Editar Producto".</small>
                    </div>
                  ) : recipe.length === 0 ? (
                    <div className={styles.emptyState}>
                      <Clock size={32} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                      <p>El producto tiene el rastreo activado pero aún no se han asignado ingredientes a su receta.</p>
                    </div>
                  ) : (
                    <table className={styles.recipeTable}>
                      <thead>
                        <tr>
                          <th>Insumo</th>
                          <th>Uso x Platillo</th>
                          <th>Costo en Platillo</th>
                          <th>Stock Almacén</th>
                          <th>Porciones Disp.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipe.map((ing) => (
                          <tr key={ing.ingredient_id}>
                            <td>
                              <strong>{ing.ingredient_name}</strong>
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                                Costo Base: ${ing.average_cost.toFixed(2)} / {ing.base_unit}
                              </div>
                            </td>
                            <td>{ing.quantity_used} {ing.base_unit}</td>
                            <td>${ing.ingredient_cost_in_dish.toFixed(2)}</td>
                            <td className={ing.is_out_of_stock ? styles.ingredientOutOfStock : ing.is_low_stock ? styles.ingredientLowStock : ''}>
                              {ing.current_stock} {ing.base_unit}
                            </td>
                            <td>
                              {ing.preparable_units !== null ? (
                                <strong style={{ color: ing.preparable_units <= 0 ? '#dc2626' : ing.preparable_units <= 5 ? '#d97706' : '#16a34a' }}>
                                  {ing.preparable_units} porc.
                                </strong>
                              ) : 'N/A'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* TAB 3: TOP CUSTOMERS */}
              {activeTab === 'customers' && (
                <div>
                  {topCustomers.length === 0 ? (
                    <div className={styles.emptyState}>
                      <Users size={32} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                      <p>Aún no hay clientes registrados que hayan comprado este producto.</p>
                    </div>
                  ) : (
                    <div className={styles.customerList}>
                      {topCustomers.map((cust) => {
                        const wa = getWhatsAppUrl(cust.customer_phone, cust.customer_name, product.name);
                        return (
                          <div key={cust.customer_id} className={styles.customerItem}>
                            <div className={styles.customerMain}>
                              <span className={styles.customerName}>{cust.customer_name}</span>
                              <span className={styles.customerStats}>
                                {cust.total_qty} unidades pedidas • ${cust.total_spent.toFixed(2)} acumulados
                              </span>
                            </div>
                            <div className={styles.customerActions}>
                              {wa && (
                                <a 
                                  href={wa} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className={styles.waButton}
                                  title="Contactar por WhatsApp"
                                >
                                  <MessageCircle size={18} />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: RECENT ORDERS */}
              {activeTab === 'orders' && (
                <div>
                  {recentOrders.length === 0 ? (
                    <div className={styles.emptyState}>
                      <ShoppingBag size={32} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                      <p>No se registran pedidos recientes con este producto.</p>
                    </div>
                  ) : (
                    <div className={styles.ordersList}>
                      {recentOrders.map((ord) => (
                        <div key={ord.order_id} className={styles.orderItem}>
                          <div>
                            <span className={styles.orderCode}>{ord.order_code}</span>
                            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {ord.customer_name} • {new Date(ord.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <strong>{ord.quantity}x (${ord.total_item_amount.toFixed(2)})</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* TAB 5: REVIEWS */}
              {activeTab === 'reviews' && (
                <div>
                  {reviews.length === 0 ? (
                    <div className={styles.emptyState}>
                      <Star size={32} style={{ color: '#9ca3af', marginBottom: '8px' }} />
                      <p>Este producto no tiene reseñas de clientes aún.</p>
                    </div>
                  ) : (
                    <div className={styles.reviewsList}>
                      {reviews.map((rev) => (
                        <div key={rev.id} className={styles.reviewItem}>
                          <div className={styles.reviewHeader}>
                            <span style={{ fontWeight: '600', fontSize: '13px' }}>{rev.customer_name}</span>
                            <span className={styles.stars}>
                              ⭐ {rev.rating}/5
                            </span>
                          </div>
                          {rev.comment && (
                            <p className={styles.reviewComment}>"{rev.comment}"</p>
                          )}
                          <small style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                            {new Date(rev.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </small>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Actions */}
        {canEdit && (
          <div className={styles.drawerFooter}>
            <button 
              className={styles.footerButton} 
              onClick={() => onManageImages(product)}
            >
              <ImageIcon size={16} /> Galería
            </button>
            <button 
              className={styles.footerButton} 
              onClick={() => onManageAudience && onManageAudience(product)}
            >
              <Users size={16} /> Audiencia
            </button>
            <button 
              className={styles.footerButton} 
              onClick={() => onToggleActive(product.id, product.is_active)}
            >
              <Power size={16} /> {product.is_active ? 'Desactivar' : 'Activar'}
            </button>
            <button 
              className={`${styles.footerButton} ${styles.footerButtonPrimary}`} 
              onClick={() => {
                onClose();
                onEdit(product);
              }}
            >
              <Edit3 size={16} /> Editar Producto
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
