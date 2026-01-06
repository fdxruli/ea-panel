import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import styles from './Modal.module.css';

export default function StockAdjustmentModal({ isOpen, onClose, onSave, ingredient }) {
  const { showAlert } = useAlert();
  const [adjustmentType, setAdjustmentType] = useState('add');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = Number(quantity);
    if (!amount || amount <= 0) {
      showAlert('La cantidad debe ser un número positivo.', 'error');
      return;
    }
    if (!reason.trim()) {
      showAlert('Debes especificar un motivo para el ajuste.', 'error');
      return;
    }

    setIsSubmitting(true);
    const adjustmentAmount = adjustmentType === 'add' ? amount : -amount;

    try {
      // Llamamos a la función RPC que creamos
      const { error } = await supabase.rpc('adjust_ingredient_stock', {
        p_ingredient_id: ingredient.id,
        p_adjustment_amount: adjustmentAmount,
        p_reason: reason
      });

      if (error) throw error;

      showAlert('Stock ajustado correctamente.', 'success');
      onSave();
      onClose();
    } catch (error) {
      showAlert(`Error al ajustar stock: ${error.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Ajustar Stock: {ingredient.name}</h2>
          <button onClick={onClose} className={styles.closeButton}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalBody}>
          <p>
            Stock actual: <strong>{ingredient.current_stock} {ingredient.base_unit}</strong>
          </p>
          
          <div className={styles.formGroup}>
            <label>Tipo de Ajuste</label>
            <div className={styles.radioGroup}>
              <label>
                <input
                  type="radio"
                  name="adjustmentType"
                  value="add"
                  checked={adjustmentType === 'add'}
                  onChange={() => setAdjustmentType('add')}
                />
                Añadir a Stock (Ej: Devolución, Corrección)
              </label>
              <label>
                <input
                  type="radio"
                  name="adjustmentType"
                  value="subtract"
                  checked={adjustmentType === 'subtract'}
                  onChange={() => setAdjustmentType('subtract')}
                />
                Restar de Stock (Ej: Merma, Caducado, Contenedor extra)
              </label>
            </div>
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="quantity">Cantidad a {adjustmentType === 'add' ? 'Añadir' : 'Restar'} (en {ingredient.base_unit})</label>
            <input
              id="quantity"
              type="number"
              step="any"
              min="0.01"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
            />
          </div>
          
          <div className={styles.formGroup}>
            <label htmlFor="reason">Motivo del Ajuste (Obligatorio)</label>
            <input
              id="reason"
              type="text"
              placeholder="Ej: Merma, Caducado, Conteo erróneo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className={styles.saveButton}>
              {isSubmitting ? 'Ajustando...' : 'Confirmar Ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}