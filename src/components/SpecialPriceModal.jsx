/* src/components/SpecialPriceModal.jsx (Fase 2 - Modal Flotante Modernizado) */

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './SpecialPriceModal.module.css';
import { useAlert } from '../context/AlertContext';
import { getLocalDateString, calculateProductSavings, calculateCategoryImpact } from '../lib/specialPriceCalculations';
import {
  X,
  Save,
  Search,
  AlertTriangle,
  Info,
  TrendingDown,
  Crown,
  Users,
  Sparkles,
  Layers,
  CheckCircle,
  Tag
} from 'lucide-react';

export default function SpecialPriceModal({
  isOpen,
  onClose,
  initialData,
  onSubmit,
  products = [],
  categories = [],
  customers = []
}) {
  const { showAlert } = useAlert();

  const [targetType, setTargetType] = useState('product');
  const [targetId, setTargetId] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [isSearchingProduct, setIsSearchingProduct] = useState(false);

  const [overridePrice, setOverridePrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isActive, setIsActive] = useState(true);

  const [appliesTo, setAppliesTo] = useState('everyone');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [loadingSegment, setLoadingSegment] = useState(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const modalRef = useRef(null);

  // Inicialización al abrir o cambiar initialData
  useEffect(() => {
    if (!isOpen) return;

    if (initialData) {
      const type = initialData.product_id ? 'product' : 'category';
      setTargetType(type);
      setTargetId(initialData.product_id || initialData.category_id || '');
      setOverridePrice(initialData.override_price !== undefined ? String(initialData.override_price) : '');
      setStartDate(initialData.start_date || '');
      setEndDate(initialData.end_date || '');
      setReason(initialData.reason || '');
      setIsActive(initialData.is_active !== undefined ? Boolean(initialData.is_active) : true);

      if (initialData.target_customer_ids && initialData.target_customer_ids.length > 0) {
        setAppliesTo('specific');
        setSelectedCustomerIds(initialData.target_customer_ids);
      } else {
        setAppliesTo('everyone');
        setSelectedCustomerIds([]);
      }
    } else {
      const today = getLocalDateString();
      const nextWeekDate = new Date();
      nextWeekDate.setDate(nextWeekDate.getDate() + 7);
      const nextWeek = getLocalDateString(nextWeekDate);

      setTargetType('product');
      setTargetId('');
      setOverridePrice('');
      setStartDate(today);
      setEndDate(nextWeek);
      setReason('');
      setIsActive(true);
      setAppliesTo('everyone');
      setSelectedCustomerIds([]);
    }

    setProductSearch('');
    setIsSearchingProduct(false);
    setCustomerSearch('');
    setLoadingSegment(null);
  }, [isOpen, initialData]);

  // Bloqueo de scroll y tecla Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose]);

  // Producto seleccionado actualmente
  const selectedProduct = useMemo(() => {
    if (targetType !== 'product' || !targetId) return null;
    return products.find(p => p.id === targetId) || null;
  }, [targetType, targetId, products]);

  // Lista de productos filtrados para búsqueda
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products.slice(0, 15);
    const query = productSearch.toLowerCase();
    return products.filter(p =>
      p.name?.toLowerCase().includes(query) ||
      p.description?.toLowerCase().includes(query)
    ).slice(0, 15);
  }, [productSearch, products]);

  // Previsualización de Ahorro y Margen de Producto
  const priceImpact = useMemo(() => {
    if (!selectedProduct || !overridePrice || isNaN(parseFloat(overridePrice))) return null;
    return calculateProductSavings(
      selectedProduct.price,
      overridePrice,
      selectedProduct.cost || selectedProduct.effective_cost || 0
    );
  }, [selectedProduct, overridePrice]);

  // Impacto en Categoría
  const categoryImpact = useMemo(() => {
    if (targetType !== 'category' || !targetId) return null;
    return calculateCategoryImpact(products, targetId, overridePrice);
  }, [targetType, targetId, overridePrice, products]);

  // Búsqueda de Clientes Específicos
  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const query = customerSearch.toLowerCase();
    return customers.filter(c =>
      !selectedCustomerIds.includes(c.id) &&
      (c.name?.toLowerCase().includes(query) || (c.phone && c.phone.includes(customerSearch)))
    ).slice(0, 8);
  }, [customerSearch, customers, selectedCustomerIds]);

  const handleAddCustomer = (id) => {
    if (!selectedCustomerIds.includes(id)) {
      setSelectedCustomerIds(prev => [...prev, id]);
    }
    setCustomerSearch('');
  };

  const handleRemoveCustomer = (id) => {
    setSelectedCustomerIds(prev => prev.filter(cId => cId !== id));
  };

  // Carga rápida por Segmentos CRM (VIP, Frecuentes, Nuevos)
  const handleAddSegment = async (segmentKey) => {
    setLoadingSegment(segmentKey);
    try {
      const { data, error } = await supabase.rpc('get_admin_customers_directory', {
        p_segment: segmentKey,
        p_limit: 300,
      });

      if (error) throw error;

      if (!data || !data.length) {
        showAlert(`No se encontraron clientes en el segmento "${segmentKey.toUpperCase()}".`);
        return;
      }

      const segmentIds = data.map(c => c.id);
      setSelectedCustomerIds(prev => {
        const set = new Set([...prev, ...segmentIds]);
        return Array.from(set);
      });

      showAlert(`Se añadieron ${segmentIds.length} clientes del segmento "${segmentKey.toUpperCase()}".`, 'success');
    } catch (err) {
      console.error('Error fetching customer segment:', err);
      showAlert(`Error al cargar segmento: ${err.message}`);
    } finally {
      setLoadingSegment(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (endDate && startDate && endDate < startDate) {
      showAlert('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }

    const priceNum = parseFloat(overridePrice);
    if (isNaN(priceNum) || priceNum < 0) {
      showAlert('El precio especial debe ser un número mayor o igual a 0.');
      return;
    }

    if (!targetId) {
      showAlert('Debes seleccionar un Producto o una Categoría.');
      return;
    }

    if (appliesTo === 'specific' && selectedCustomerIds.length === 0) {
      showAlert('Selecciona al menos un cliente específico o elige "Todos los Clientes".');
      return;
    }

    setIsSubmitting(true);

    const specialPricePayload = {
      id: initialData?.id || undefined,
      product_id: targetType === 'product' ? targetId : null,
      category_id: targetType === 'category' ? targetId : null,
      override_price: priceNum,
      start_date: startDate,
      end_date: endDate,
      reason: reason ? reason.trim() : null,
      is_active: isActive,
      target_customer_ids: appliesTo === 'specific' ? selectedCustomerIds : null,
    };

    try {
      const { error } = await supabase.rpc('admin_save_special_price', {
        p_special_price: specialPricePayload
      });

      if (error) throw error;

      showAlert(`Promoción ${initialData ? 'actualizada' : 'creada'} con éxito.`, 'success');
      onSubmit?.();
      onClose?.();
    } catch (err) {
      console.error('[SpecialPriceModal] Error al guardar:', err);
      showAlert(`Error al guardar la promoción: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal} ref={modalRef}>
        {/* Header */}
        <div className={styles.header}>
          <h2 className={styles.headerTitle}>
            <Tag size={18} /> {initialData ? 'Editar Promoción' : 'Crear Nueva Promoción'}
          </h2>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Cerrar modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className={styles.body}>
          <div className={styles.grid}>
            {/* Tipo de Objetivo */}
            <div className={styles.formGroup}>
              <label htmlFor="modalTargetType">Aplicar Promoción a:</label>
              <select
                id="modalTargetType"
                value={targetType}
                onChange={(e) => {
                  setTargetType(e.target.value);
                  setTargetId('');
                  setProductSearch('');
                }}
              >
                <option value="product">Producto Específico</option>
                <option value="category">Categoría Completa</option>
              </select>
            </div>

            {/* Selector de Producto o Categoría */}
            <div className={styles.formGroup}>
              <label>
                {targetType === 'product' ? 'Seleccionar Producto:' : 'Seleccionar Categoría:'}
              </label>

              {targetType === 'product' ? (
                selectedProduct && !isSearchingProduct ? (
                  <div className={styles.selectedProductBanner}>
                    <div className={styles.selectedProductInfo}>
                      <span className={styles.selectedProductName}>{selectedProduct.name}</span>
                      <span className={styles.selectedProductDetails}>
                        Precio regular: ${parseFloat(selectedProduct.price).toFixed(2)}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.changeProductBtn}
                      onClick={() => setIsSearchingProduct(true)}
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className={styles.searchableSelect}>
                    <Search size={15} className={styles.searchIcon} />
                    <input
                      type="text"
                      className={styles.productSearchInput}
                      placeholder="Buscar producto por nombre..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      autoFocus={isSearchingProduct}
                    />
                    <ul className={styles.productResultsDropdown}>
                      {filteredProducts.map(p => (
                        <li
                          key={p.id}
                          className={styles.productResultItem}
                          onClick={() => {
                            setTargetId(p.id);
                            setIsSearchingProduct(false);
                            setProductSearch('');
                          }}
                          role="button"
                        >
                          <span>{p.name}</span>
                          <span className={styles.productResultPrice}>
                            ${parseFloat(p.price).toFixed(2)}
                          </span>
                        </li>
                      ))}
                      {filteredProducts.length === 0 && (
                        <li className={styles.productResultItem} style={{ color: 'var(--text-secondary)' }}>
                          No se encontraron productos coincidentes.
                        </li>
                      )}
                    </ul>
                  </div>
                )
              ) : (
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  required
                >
                  <option value="">Selecciona una categoría</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Precio Promocional */}
            <div className={styles.formGroup}>
              <label htmlFor="modalOverridePrice">Nuevo Precio Promocional ($):</label>
              <input
                id="modalOverridePrice"
                type="number"
                step="0.01"
                min="0"
                value={overridePrice}
                onChange={(e) => setOverridePrice(e.target.value)}
                placeholder="Ej: 99.00"
                required
              />
            </div>

            {/* Motivo Opcional */}
            <div className={styles.formGroup}>
              <label htmlFor="modalReason">Motivo o Campaña (Opcional):</label>
              <input
                id="modalReason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ej: Promo de Fin de Semana"
              />
            </div>
          </div>

          {/* Previsualización Financiera de Producto */}
          {targetType === 'product' && selectedProduct && priceImpact && (
            <div className={styles.pricePreviewCard}>
              <div className={styles.previewItem}>
                <span className={styles.previewLabel}>Precio Regular</span>
                <span className={styles.previewValue}>${priceImpact.originalPrice.toFixed(2)}</span>
              </div>

              <div className={styles.previewItem}>
                <span className={styles.previewLabel}>Precio Especial</span>
                <span className={styles.previewValue} style={{ color: 'var(--color-primary)' }}>
                  ${priceImpact.overridePrice.toFixed(2)}
                </span>
              </div>

              {!priceImpact.isIncrease && priceImpact.savingsAmount > 0 && (
                <div className={styles.previewItem}>
                  <span className={styles.previewLabel}>Ahorro Cliente</span>
                  <span className={styles.savingsBadge}>
                    <TrendingDown size={14} /> ${priceImpact.savingsAmount.toFixed(2)} ({priceImpact.savingsPercent.toFixed(0)}%)
                  </span>
                </div>
              )}

              {priceImpact.isIncrease && (
                <div className={styles.priceNotice}>
                  <Info size={15} /> El precio especial supera el precio regular de catálogo.
                </div>
              )}

              {priceImpact.isBelowCost && (
                <div className={styles.priceWarning}>
                  <AlertTriangle size={15} /> ¡Atención! El precio especial está por debajo del costo (${(selectedProduct.cost || selectedProduct.effective_cost).toFixed(2)}).
                </div>
              )}
            </div>
          )}

          {/* Desglose de Impacto en Categoría */}
          {targetType === 'category' && categoryImpact && (
            <div className={styles.categoryImpactCard}>
              <div className={styles.categoryImpactHeader}>
                <span><Layers size={15} /> Impacto en Categoría</span>
                <span>{categoryImpact.count} productos incluidos</span>
              </div>
              <div>
                Rango actual de precios en catálogo: <strong>${categoryImpact.minPrice.toFixed(2)}</strong> a <strong>${categoryImpact.maxPrice.toFixed(2)}</strong>
              </div>
              {overridePrice && !isNaN(parseFloat(overridePrice)) && (
                <div className={styles.categoryImpactStats}>
                  {categoryImpact.cheaperCount > 0 && (
                    <span className={`${styles.impactPill} ${styles.impactPillCheaper}`}>
                      ↓ {categoryImpact.cheaperCount} productos bajan de precio
                    </span>
                  )}
                  {categoryImpact.moreExpensiveCount > 0 && (
                    <span className={`${styles.impactPill} ${styles.impactPillExpensive}`}>
                      ↑ {categoryImpact.moreExpensiveCount} productos subirían de precio
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Fechas y Vigencia */}
          <div className={styles.grid}>
            <div className={styles.formGroup}>
              <label htmlFor="modalStartDate">Fecha de Inicio:</label>
              <input
                id="modalStartDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="modalEndDate">Fecha de Fin:</label>
              <input
                id="modalEndDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Audiencia */}
          <div className={styles.formGroup}>
            <label htmlFor="modalAppliesTo">Audiencia:</label>
            <select
              id="modalAppliesTo"
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value)}
            >
              <option value="everyone">Toda la tienda (Público general)</option>
              <option value="specific">Clientes Específicos (Exclusivo)</option>
            </select>
          </div>

          {/* Asignación y Segmentos CRM */}
          {appliesTo === 'specific' && (
            <div className={styles.formGroup}>
              <label>Asignar por Segmentos CRM o Búsqueda Individual:</label>
              <div className={styles.segmentActions}>
                <button
                  type="button"
                  className={styles.segmentBtn}
                  onClick={() => handleAddSegment('vip')}
                  disabled={loadingSegment !== null}
                >
                  <Crown size={14} color="#f39c12" /> + VIPs {loadingSegment === 'vip' ? '...' : ''}
                </button>
                <button
                  type="button"
                  className={styles.segmentBtn}
                  onClick={() => handleAddSegment('frecuente')}
                  disabled={loadingSegment !== null}
                >
                  <Users size={14} color="#3498db" /> + Frecuentes {loadingSegment === 'frecuente' ? '...' : ''}
                </button>
                <button
                  type="button"
                  className={styles.segmentBtn}
                  onClick={() => handleAddSegment('nuevo')}
                  disabled={loadingSegment !== null}
                >
                  <Sparkles size={14} color="#2ecc71" /> + Nuevos {loadingSegment === 'nuevo' ? '...' : ''}
                </button>
                {selectedCustomerIds.length > 0 && (
                  <button
                    type="button"
                    className={styles.clearSegmentBtn}
                    onClick={() => setSelectedCustomerIds([])}
                  >
                    Limpiar selección ({selectedCustomerIds.length})
                  </button>
                )}
              </div>

              {/* Búsqueda Individual de Clientes */}
              <div style={{ position: 'relative', marginTop: '0.6rem' }}>
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre o teléfono..."
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                {customerSearch && filteredCustomers.length > 0 && (
                  <ul className={styles.customerSearchResults}>
                    {filteredCustomers.map(c => (
                      <li
                        key={c.id}
                        className={styles.customerSearchItem}
                        onClick={() => handleAddCustomer(c.id)}
                        role="button"
                      >
                        <strong>{c.name}</strong>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {c.phone || 'Sin teléfono'}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Chips de Clientes Seleccionados */}
              <div className={styles.selectedCustomersList}>
                {selectedCustomerIds.length > 0 ? (
                  selectedCustomerIds.map(id => {
                    const cust = customers.find(c => c.id === id);
                    return (
                      <span key={id} className={styles.selectedCustomerTag}>
                        {cust?.name || `Cliente (${id.substring(0, 6)})`}
                        <button
                          type="button"
                          className={styles.removeCustomerBtn}
                          onClick={() => handleRemoveCustomer(id)}
                          aria-label="Quitar cliente"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })
                ) : (
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                    Ningún cliente específico seleccionado aún.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Toggle Activo / Pausado */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem' }}>
            <input
              id="modalIsActive"
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              style={{ width: '17px', height: '17px', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
            />
            <label htmlFor="modalIsActive" style={{ cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600 }}>
              {isActive ? 'Promoción activa inmediatamente' : 'Guardar pausada (inactiva)'}
            </label>
          </div>

          {/* Footer Actions */}
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={isSubmitting}
            >
              <Save size={16} />
              {isSubmitting ? 'Guardando...' : (initialData ? 'Actualizar Promoción' : 'Crear Promoción')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
