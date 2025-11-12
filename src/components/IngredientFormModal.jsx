import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import { useCacheAdmin } from '../context/CacheAdminContext';
import DOMPurify from 'dompurify';
import styles from './Modal.module.css'; // Usaremos un CSS genérico

export default function IngredientFormModal({ isOpen, onClose, onSave, ingredient }) {
  const { showAlert } = useAlert();
  const { invalidate } = useCacheAdmin();
  const [formData, setFormData] = useState({
    name: '',
    base_unit: '',
    track_inventory: true,
    low_stock_threshold: 0
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (ingredient) {
      setFormData({
        name: ingredient.name,
        base_unit: ingredient.base_unit,
        track_inventory: ingredient.track_inventory,
        low_stock_threshold: ingredient.low_stock_threshold || 0
      });
    } else {
      setFormData({
        name: '',
        base_unit: '',
        track_inventory: true,
        low_stock_threshold: 0
      });
    }
  }, [ingredient, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.base_unit) {
      showAlert('El nombre y la unidad base son obligatorios.', 'error');
      return;
    }
    setIsSubmitting(true);
    
    const dataToSave = {
      name: DOMPurify.sanitize(formData.name),
      base_unit: DOMPurify.sanitize(formData.base_unit.toLowerCase()),
      track_inventory: formData.track_inventory,
      low_stock_threshold: Number(formData.low_stock_threshold) || 0
    };

    try {
      let error;
      if (ingredient) {
        // Editar
        ({ error } = await supabase.from('ingredients').update(dataToSave).eq('id', ingredient.id));
      } else {
        // Crear
        ({ error } = await supabase.from('ingredients').insert(dataToSave));
      }

      if (error) throw error;

      showAlert(`Ingrediente ${ingredient ? 'actualizado' : 'creado'} con éxito.`, 'success');
      invalidate('ingredients'); // Invalidar caché
      onSave();
      onClose();
    } catch (error) {
      showAlert(`Error: ${error.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>{ingredient ? 'Editar' : 'Nuevo'} Ingrediente</h2>
          <button onClick={onClose} className={styles.closeButton}>×</button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label htmlFor="name">Nombre del Ingrediente</label>
            <input
              id="name"
              type="text"
              placeholder="Ej: Alita Cruda, Salsa BBQ, Contenedor"
              value={formData.name}
              onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="base_unit">Unidad Base (de Uso/Receta)</label>
            <input
              id="base_unit"
              type="text"
              placeholder="Ej: pieza, gramo, ml, unidad"
              value={formData.base_unit}
              onChange={(e) => setFormData(p => ({ ...p, base_unit: e.target.value }))}
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="low_stock_threshold">Alerta de Stock Bajo</label>
            <input
              id="low_stock_threshold"
              type="number"
              value={formData.low_stock_threshold}
              onChange={(e) => setFormData(p => ({ ...p, low_stock_threshold: e.target.value }))}
            />
          </div>
          <div className={styles.checkboxGroup}>
            <input
              id="track_inventory"
              type="checkbox"
              checked={formData.track_inventory}
              onChange={(e) => setFormData(p => ({ ...p, track_inventory: e.target.checked }))}
            />
            <label htmlFor="track_inventory">
              Rastrear Stock (Desmarcar para costos, ej: Servilletas)
            </label>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Cancelar
            </button>
            <button type="submit" disabled={isSubmitting} className={styles.saveButton}>
              {isSubmitting ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}