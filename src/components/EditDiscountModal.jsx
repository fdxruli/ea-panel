import React, { useState, useEffect, useMemo, useCallback } from 'react';
import styles from './EditDiscountModal.module.css';
import DiscountImpactSimulator from './DiscountImpactSimulator';
import { X, Save, Search, User, Check } from 'lucide-react';

export default function EditDiscountModal({
  isOpen,
  onClose,
  discount,
  onSave,
  products = [],
  categories = [],
  customers = []
}) {
  const [formData, setFormData] = useState({
    code: '',
    type: 'global',
    value: '',
    discount_mode: 'percentage',
    target_id: null,
    start_date: '',
    end_date: '',
    is_active: true,
    is_single_use: false,
    specific_customer_id: null
  });

  const [customerSearch, setCustomerSearch] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (discount) {
      setFormData({
        id: discount.id,
        code: discount.code || '',
        type: discount.type || 'global',
        value: discount.value !== undefined ? String(discount.value) : '',
        discount_mode: discount.discount_mode || 'percentage',
        target_id: discount.target_id || null,
        start_date: discount.start_date || '',
        end_date: discount.end_date || '',
        is_active: discount.is_active !== false,
        is_single_use: !!discount.is_single_use,
        specific_customer_id: discount.specific_customer_id || null
      });
      setError('');
      setCustomerSearch('');
    }
  }, [discount]);

  const selectedCustomer = useMemo(() => {
    if (!formData.specific_customer_id) return null;
    return customers.find(c => c.id === formData.specific_customer_id) || {
      id: formData.specific_customer_id,
      name: discount?.customer_name || 'Cliente asignado',
      phone: discount?.customer_phone || ''
    };
  }, [formData.specific_customer_id, customers, discount]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) return [];
    const lower = customerSearch.toLowerCase();
    return customers
      .filter(c =>
        (c.name && c.name.toLowerCase().includes(lower)) ||
        (c.phone && c.phone.includes(customerSearch))
      )
      .slice(0, 6);
  }, [customerSearch, customers]);

  const targetOptions = useMemo(() => {
    if (formData.type === 'category') return categories;
    if (formData.type === 'product') return products;
    return [];
  }, [formData.type, categories, products]);

  const handleChange = useCallback((field, val) => {
    setFormData(prev => {
      const updated = { ...prev, [field]: val };
      if (field === 'type' && val === 'global') {
        updated.target_id = null;
      }
      return updated;
    });
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const val = parseFloat(formData.value);
    if (isNaN(val) || val <= 0) {
      setError('El valor del descuento debe ser mayor a 0.');
      return;
    }

    if (formData.discount_mode === 'percentage' && val > 100) {
      setError('El porcentaje no puede ser mayor al 100%.');
      return;
    }

    if (formData.type !== 'global' && !formData.target_id) {
      setError('Debes seleccionar un objetivo para el descuento.');
      return;
    }

    if (formData.start_date && formData.end_date && formData.end_date < formData.start_date) {
      setError('La fecha de fin no puede ser anterior a la de inicio.');
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        ...formData,
        value: val,
        code: formData.code.toUpperCase().trim()
      });
      onClose();
    } catch (err) {
      setError(err.message || 'Error al guardar los cambios.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !discount) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Editar Descuento: <code>{discount.code}</code></h2>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {error && <div className={styles.errorMessage}>{error}</div>}

        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label htmlFor="edit-code">Código</label>
              <input
                id="edit-code"
                type="text"
                value={formData.code}
                onChange={(e) => handleChange('code', e.target.value.toUpperCase())}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label>Tipo de Valor</label>
              <div className={styles.modeToggleGroup}>
                <button
                  type="button"
                  className={`${styles.modeBtn} ${formData.discount_mode === 'percentage' ? styles.activeMode : ''}`}
                  onClick={() => handleChange('discount_mode', 'percentage')}
                >
                  % Porcentaje
                </button>
                <button
                  type="button"
                  className={`${styles.modeBtn} ${formData.discount_mode === 'fixed' ? styles.activeMode : ''}`}
                  onClick={() => handleChange('discount_mode', 'fixed')}
                >
                  $ Monto Fijo
                </button>
              </div>
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="edit-value">
                {formData.discount_mode === 'fixed' ? 'Monto a Descontar ($) *' : 'Porcentaje de Descuento (%) *'}
              </label>
              <input
                id="edit-value"
                type="number"
                step={formData.discount_mode === 'fixed' ? '0.5' : '1'}
                min="0.01"
                max={formData.discount_mode === 'percentage' ? '100' : undefined}
                value={formData.value}
                onChange={(e) => handleChange('value', e.target.value)}
                required
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="edit-type">Alcance / Objetivo</label>
              <select
                id="edit-type"
                value={formData.type}
                onChange={(e) => handleChange('type', e.target.value)}
              >
                <option value="global">Global (Toda la tienda)</option>
                <option value="category">Por Categoría</option>
                <option value="product">Por Producto</option>
              </select>
            </div>

            {formData.type !== 'global' && (
              <div className={styles.formGroup}>
                <label htmlFor="edit-target">
                  {formData.type === 'category' ? 'Categoría *' : 'Producto *'}
                </label>
                <select
                  id="edit-target"
                  value={formData.target_id || ''}
                  onChange={(e) => handleChange('target_id', e.target.value)}
                  required
                >
                  <option value="">Seleccionar...</option>
                  {targetOptions.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name} {opt.price ? `($${parseFloat(opt.price).toFixed(2)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.formGroup}>
              <label htmlFor="edit-start">Fecha Inicio</label>
              <input
                id="edit-start"
                type="date"
                value={formData.start_date}
                onChange={(e) => handleChange('start_date', e.target.value)}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="edit-end">Fecha Fin</label>
              <input
                id="edit-end"
                type="date"
                value={formData.end_date}
                min={formData.start_date || undefined}
                onChange={(e) => handleChange('end_date', e.target.value)}
              />
            </div>

            {/* Audiencia */}
            <div className={`${styles.formGroup} ${styles.fullWidth}`}>
              <label>Audiencia del Descuento</label>
              <div className={styles.audienceSelection}>
                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="edit-audience"
                    checked={!formData.specific_customer_id}
                    onChange={() => handleChange('specific_customer_id', null)}
                  />
                  <span>Público / Todos los clientes</span>
                </label>

                <label className={styles.radioLabel}>
                  <input
                    type="radio"
                    name="edit-audience"
                    checked={!!formData.specific_customer_id}
                    onChange={() => {
                      if (!formData.specific_customer_id && customers.length > 0) {
                        setCustomerSearch('');
                      }
                    }}
                  />
                  <span>Cliente Específico (Personal)</span>
                </label>
              </div>

              {formData.specific_customer_id ? (
                <div className={styles.selectedCustomerCard}>
                  <User size={16} className={styles.customerIcon} />
                  <div className={styles.customerInfo}>
                    <strong>{selectedCustomer?.name}</strong>
                    <span>{selectedCustomer?.phone || 'Sin teléfono'}</span>
                  </div>
                  <button
                    type="button"
                    className={styles.removeCustomerBtn}
                    onClick={() => handleChange('specific_customer_id', null)}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                formData.specific_customer_id !== null || customerSearch ? (
                  <div className={styles.customerSearchBox}>
                    <div className={styles.searchBarWrapper}>
                      <Search size={15} />
                      <input
                        type="text"
                        placeholder="Buscar por nombre o teléfono del cliente..."
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                      />
                    </div>
                    {filteredCustomers.length > 0 && (
                      <div className={styles.customerResultsList}>
                        {filteredCustomers.map(cust => (
                          <div
                            key={cust.id}
                            className={styles.customerResultItem}
                            onClick={() => {
                              handleChange('specific_customer_id', cust.id);
                              setCustomerSearch('');
                            }}
                          >
                            <span><strong>{cust.name}</strong> ({cust.phone || 'S/T'})</span>
                            <Check size={14} />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null
              )}
            </div>

            {/* Checkboxes */}
            <div className={`${styles.checkboxesRow} ${styles.fullWidth}`}>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.is_single_use}
                  onChange={(e) => handleChange('is_single_use', e.target.checked)}
                />
                <span>Uso único por cliente</span>
              </label>

              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => handleChange('is_active', e.target.checked)}
                />
                <span>Cupón Activo</span>
              </label>
            </div>
          </div>

          {/* SIMULADOR EN VIVO DENTRO DEL MODAL */}
          <DiscountImpactSimulator
            discount={formData}
            products={products}
            categories={categories}
          />

          <div className={styles.modalActions}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
              disabled={isSaving}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={styles.saveBtn}
              disabled={isSaving || !formData.code || !formData.value}
            >
              <Save size={16} /> {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
