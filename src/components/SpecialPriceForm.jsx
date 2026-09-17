/* src/components/SpecialPriceForm.jsx */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './SpecialPriceForm.module.css';
import { useAlert } from '../context/AlertContext';
import { useCategoriesCache } from '../hooks/useCategoriesCache';
import { useCustomersBasicCache } from '../hooks/useCustomersBasicCache';
import { useAdminProductsBasic } from '../hooks/useAdminProductsBasic';
import LoadingSpinner from './LoadingSpinner';
import { calculateProductSavings } from '../lib/specialPriceCalculations';
import { AlertTriangle, Info, TrendingDown, TrendingUp, CheckCircle, X } from 'lucide-react';

const SpecialPriceForm = ({ products: propsProducts, onClose, onSubmit, initialData }) => {
  const { showAlert } = useAlert();

  // Categorías del hook
  const { data: categoriesData, isLoading: loadingCategories } = useCategoriesCache();
  const categories = useMemo(() => categoriesData || [], [categoriesData]);

  // Productos del hook (o props)
  const { data: productsData } = useAdminProductsBasic();
  const products = useMemo(() => propsProducts || productsData || [], [propsProducts, productsData]);

  // Clientes del hook
  const { data: customersData } = useCustomersBasicCache();
  const allCustomers = useMemo(() => customersData || [], [customersData]);

  const [targetType, setTargetType] = useState('product');
  const [targetId, setTargetId] = useState('');
  const [overridePrice, setOverridePrice] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [appliesTo, setAppliesTo] = useState('everyone');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const searchDropdownRef = useRef(null);

  // Inicialización o reseteo
  useEffect(() => {
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
      setTargetType('product');
      setTargetId('');
      setOverridePrice('');
      setStartDate('');
      setEndDate('');
      setReason('');
      setIsActive(true);
      setAppliesTo('everyone');
      setSelectedCustomerIds([]);
    }
  }, [initialData]);

  // Producto seleccionado actualmente
  const selectedProduct = useMemo(() => {
    if (targetType !== 'product' || !targetId) return null;
    return products.find(p => p.id === targetId) || null;
  }, [targetType, targetId, products]);

  // Cálculo en vivo del impacto financiero
  const priceImpact = useMemo(() => {
    if (!selectedProduct || !overridePrice || isNaN(parseFloat(overridePrice))) return null;
    return calculateProductSavings(
      selectedProduct.price,
      overridePrice,
      selectedProduct.cost || selectedProduct.effective_cost || 0
    );
  }, [selectedProduct, overridePrice]);

  // Filtro de búsqueda de clientes
  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    const lowerSearch = customerSearch.toLowerCase();
    return allCustomers.filter(c =>
      !selectedCustomerIds.includes(c.id) &&
      (c.name.toLowerCase().includes(lowerSearch) || (c.phone && c.phone.includes(customerSearch)))
    ).slice(0, 10);
  }, [customerSearch, allCustomers, selectedCustomerIds]);

  const handleAddCustomer = (customerId) => {
    if (!selectedCustomerIds.includes(customerId)) {
      setSelectedCustomerIds(prev => [...prev, customerId]);
    }
    setCustomerSearch('');
  };

  const handleRemoveCustomer = (customerId) => {
    setSelectedCustomerIds(prev => prev.filter(id => id !== customerId));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (endDate && startDate && endDate < startDate) {
      showAlert('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }

    const priceNum = parseFloat(overridePrice);
    if (isNaN(priceNum) || priceNum < 0) {
      showAlert('Por favor ingresa un precio válido mayor o igual a 0.');
      return;
    }

    if (!targetId) {
      showAlert('Debes seleccionar un Producto o una Categoría.');
      return;
    }

    if (appliesTo === 'specific' && selectedCustomerIds.length === 0) {
      showAlert('Por favor, selecciona al menos un cliente específico o elige "Todos los Clientes".');
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
      // Uso de la nueva RPC administrativa segura
      const { error } = await supabase.rpc('admin_save_special_price', {
        p_special_price: specialPricePayload
      });

      if (error) {
        throw error;
      }

      showAlert(`Promoción ${initialData ? 'actualizada' : 'creada'} con éxito.`, 'success');
      onSubmit?.();
    } catch (error) {
      console.error('[SpecialPriceForm] Error al guardar:', error);
      showAlert(`Error al guardar la promoción: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const options = targetType === 'product' ? products : categories;

  if (loadingCategories && !categories.length) {
    return (
      <div className={styles.form}>
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      {/* Tipo de Objetivo */}
      <div className={styles.formGroup}>
        <label htmlFor="targetType">Aplicar a:</label>
        <select
          id="targetType"
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value);
            setTargetId('');
          }}
        >
          <option value="product">Producto Específico</option>
          <option value="category">Categoría Completa</option>
        </select>
      </div>

      {/* Selector de Producto o Categoría */}
      <div className={styles.formGroup}>
        <label htmlFor="targetId">{targetType === 'product' ? 'Producto' : 'Categoría'}:</label>
        <select
          id="targetId"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          required
        >
          <option value="">Selecciona una opción</option>
          {options.map(option => (
            <option key={option.id} value={option.id}>
              {option.name} {targetType === 'product' && option.price ? `($${parseFloat(option.price).toFixed(2)})` : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Nuevo Precio */}
      <div className={styles.formGroup}>
        <label htmlFor="overridePrice">Nuevo Precio Promocional ($):</label>
        <input
          id="overridePrice"
          type="number"
          step="0.01"
          min="0"
          value={overridePrice}
          onChange={(e) => setOverridePrice(e.target.value)}
          placeholder="Ej: 89.90"
          required
        />
      </div>

      {/* Motivo Opcional */}
      <div className={styles.formGroup}>
        <label htmlFor="reason">Motivo / Campaña (Opcional):</label>
        <input
          id="reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ej: Jueves de Alitas, Aniversario"
        />
      </div>

      {/* Previsualización Financiera si es Producto */}
      {selectedProduct && priceImpact && (
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
              <Info size={16} /> El precio especial es superior al precio regular de catálogo.
            </div>
          )}

          {priceImpact.isBelowCost && (
            <div className={styles.priceWarning}>
              <AlertTriangle size={16} /> ¡Atención! El precio especial está por debajo del costo estimado (${(selectedProduct.cost || selectedProduct.effective_cost).toFixed(2)}).
            </div>
          )}
        </div>
      )}

      {/* Fecha Inicio */}
      <div className={styles.formGroup}>
        <label htmlFor="startDate">Fecha de Inicio:</label>
        <input
          id="startDate"
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          required
        />
      </div>

      {/* Fecha Fin */}
      <div className={styles.formGroup}>
        <label htmlFor="endDate">Fecha de Fin:</label>
        <input
          id="endDate"
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          required
        />
      </div>

      {/* Toggle Activo / Pausado */}
      <div className={styles.formGroup}>
        <label>Estado Inicial:</label>
        <div className={styles.statusToggleGroup}>
          <input
            id="isActiveToggle"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          <label htmlFor="isActiveToggle">
            {isActive ? 'Activo (Disponible según fechas)' : 'Pausado temporalmente'}
          </label>
        </div>
      </div>

      {/* Audiencia */}
      <div className={`${styles.formGroup} ${styles.fullWidth}`}>
        <label htmlFor="appliesTo">Visible Para:</label>
        <select
          id="appliesTo"
          value={appliesTo}
          onChange={(e) => setAppliesTo(e.target.value)}
        >
          <option value="everyone">Todos los Clientes (Público)</option>
          <option value="specific">Clientes Específicos (Exclusivo)</option>
        </select>
      </div>

      {/* Búsqueda de clientes específicos */}
      {appliesTo === 'specific' && (
        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
          <label htmlFor="customerSearchInput">Buscar y Añadir Clientes:</label>
          <div className={styles.customerSearchWrapper} ref={searchDropdownRef}>
            <input
              id="customerSearchInput"
              type="text"
              placeholder="Escribe nombre o teléfono del cliente..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              disabled={!allCustomers.length}
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
                    <span className={styles.customerSearchPhone}>{c.phone || 'Sin teléfono'}</span>
                  </li>
                ))}
              </ul>
            )}
            {customerSearch && !filteredCustomers.length && (
              <p className={styles.noResults}>No se encontraron clientes coincidentes.</p>
            )}
          </div>

          <div className={styles.selectedCustomersSection}>
            <label>Clientes Seleccionados ({selectedCustomerIds.length}):</label>
            <div className={styles.selectedCustomersList}>
              {selectedCustomerIds.length > 0 ? (
                selectedCustomerIds.map(id => {
                  const customer = allCustomers.find(c => c.id === id);
                  return (
                    <div key={id} className={styles.selectedCustomerTag}>
                      <span>{customer?.name || `ID: ${id.substring(0, 6)}...`}</span>
                      <button
                        type="button"
                        className={styles.removeCustomerBtn}
                        onClick={() => handleRemoveCustomer(id)}
                        aria-label={`Quitar ${customer?.name || 'cliente'}`}
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className={styles.noResults}>Ningún cliente seleccionado aún.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Botones de acción */}
      <div className={styles.formActions}>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className={styles.cancelButton}
            disabled={isSubmitting}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className={styles.submitButton}
        >
          {isSubmitting ? (
            'Guardando...'
          ) : (
            initialData ? 'Actualizar Promoción' : 'Crear Promoción'
          )}
        </button>
      </div>
    </form>
  );
};

export default SpecialPriceForm;