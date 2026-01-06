import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import styles from './Modal.module.css';

export default function PurchaseFormModal({ isOpen, onClose, onSave, allIngredients }) {
  const { showAlert } = useAlert();
  const [formData, setFormData] = useState({
    ingredient_id: '',
    purchase_unit_id: '',
    quantity_purchased: 1,
    total_cost: '',
    purchase_date: new Date().toISOString().split('T')[0],
    expiration_date: ''
  });
  const [purchaseUnits, setPurchaseUnits] = useState([]);
  const [loadingUnits, setLoadingUnits] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cargar formatos de compra cuando el ingrediente cambia
  useEffect(() => {
    const fetchPurchaseUnits = async () => {
      if (!formData.ingredient_id) {
        setPurchaseUnits([]);
        setFormData(p => ({ ...p, purchase_unit_id: '' }));
        return;
      }
      setLoadingUnits(true);
      const { data, error } = await supabase
        .from('ingredient_purchase_units')
        .select('*')
        .eq('ingredient_id', formData.ingredient_id);
      
      if (error) showAlert(error.message, 'error');
      else setPurchaseUnits(data);
      setLoadingUnits(false);
    };
    fetchPurchaseUnits();
  }, [formData.ingredient_id, showAlert]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.ingredient_id || !formData.purchase_unit_id || !formData.total_cost) {
      showAlert('Debes seleccionar un ingrediente, formato y costo total.', 'error');
      return;
    }
    setIsSubmitting(true);
    
    // El frontend solo inserta. El Trigger de Fase 2 hará la magia.
    const { error } = await supabase.from('ingredient_purchases').insert({
      ingredient_id: formData.ingredient_id,
      purchase_unit_id: formData.purchase_unit_id,
      quantity_purchased: Number(formData.quantity_purchased),
      total_cost: Number(formData.total_cost),
      purchase_date: formData.purchase_date,
      expiration_date: formData.expiration_date || null,
      // 'total_base_units_added' y 'cost_per_base_unit' son calculados por el Trigger
      total_base_units_added: 0, // Temporal, el trigger lo corregirá
      cost_per_base_unit: 0   // Temporal, el trigger lo corregirá
    });

    if (error) {
      showAlert(error.message, 'error');
    } else {
      showAlert('Compra registrada con éxito. El stock y costo han sido actualizados.', 'success');
      onSave();
      onClose();
    }
    setIsSubmitting(false);
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Registrar Compra de Ingredientes</h2>
          <button onClick={onClose} className={styles.closeButton}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label htmlFor="ingredient_id">Ingrediente</label>
            <select
              id="ingredient_id"
              value={formData.ingredient_id}
              onChange={(e) => setFormData(p => ({ ...p, ingredient_id: e.target.value }))}
              required
            >
              <option value="">Selecciona un ingrediente...</option>
              {allIngredients.map(ing => (
                <option key={ing.id} value={ing.id}>{ing.name}</option>
              ))}
            </select>
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="purchase_unit_id">Formato de Compra</label>
            <select
              id="purchase_unit_id"
              value={formData.purchase_unit_id}
              onChange={(e) => setFormData(p => ({ ...p, purchase_unit_id: e.target.value }))}
              required
              disabled={loadingUnits || purchaseUnits.length === 0}
            >
              <option value="">{loadingUnits ? 'Cargando...' : 'Selecciona un formato...'}</option>
              {purchaseUnits.map(unit => (
                <option key={unit.id} value={unit.id}>{unit.purchase_unit_name}</option>
              ))}
            </select>
          </div>
          
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label htmlFor="quantity_purchased">Cantidad Comprada</label>
              <input
                id="quantity_purchased"
                type="number"
                step="any"
                min="0.01"
                value={formData.quantity_purchased}
                onChange={(e) => setFormData(p => ({ ...p, quantity_purchased: e.target.value }))}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="total_cost">Costo Total (del Lote)</label>
              <input
                id="total_cost"
                type="number"
                step="0.01"
                min="0"
                placeholder="Ej: 221.00"
                value={formData.total_cost}
                onChange={(e) => setFormData(p => ({ ...p, total_cost: e.target.value }))}
                required
              />
            </div>
          </div>
          
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label htmlFor="purchase_date">Fecha de Compra</label>
              <input
                id="purchase_date"
                type="date"
                value={formData.purchase_date}
                onChange={(e) => setFormData(p => ({ ...p, purchase_date: e.target.value }))}
                required
              />
            </div>
            <div className={styles.formGroup}>
              <label htmlFor="expiration_date">Fecha de Caducidad (Opc.)</label>
              <input
                id="expiration_date"
                type="date"
                value={formData.expiration_date}
                onChange={(e) => setFormData(p => ({ ...p, expiration_date: e.target.value }))}
              />
            </div>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className={styles.saveButton}>
              {isSubmitting ? 'Registrando...' : 'Registrar Compra'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}