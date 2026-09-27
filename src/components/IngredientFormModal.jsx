import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import { useCacheAdmin } from '../context/CacheAdminContext';
import DOMPurify from 'dompurify';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import {
  normalizeIngredientName,
  normalizeBaseUnit,
  findDuplicateIngredient,
  formatDuplicateErrorMessage,
  isDuplicateIngredientError
} from '../utils/ingredientValidation';
import styles from './Modal.module.css';

export default function IngredientFormModal({
  isOpen,
  onClose,
  onSave,
  ingredient,
  allIngredients = [],
  onSelectExisting
}) {
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
        name: ingredient.name || '',
        base_unit: ingredient.base_unit || '',
        track_inventory: Boolean(ingredient.track_inventory),
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

  // Detección proactiva de nombres duplicados
  const duplicateIngredient = useMemo(() => {
    return findDuplicateIngredient(formData.name, allIngredients, ingredient?.id);
  }, [formData.name, allIngredients, ingredient]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanName = DOMPurify.sanitize(normalizeIngredientName(formData.name));
    const cleanBaseUnit = DOMPurify.sanitize(normalizeBaseUnit(formData.base_unit));

    if (!cleanName || !cleanBaseUnit) {
      showAlert('El nombre y la unidad base son obligatorios.', 'error');
      return;
    }

    if (duplicateIngredient) {
      showAlert(formatDuplicateErrorMessage(duplicateIngredient.name), 'error');
      return;
    }

    setIsSubmitting(true);

    const dataToSave = {
      name: cleanName,
      base_unit: cleanBaseUnit,
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

      if (error) {
        if (isDuplicateIngredientError(error)) {
          throw new Error(formatDuplicateErrorMessage(cleanName));
        }
        throw error;
      }

      showAlert(`Ingrediente ${ingredient ? 'actualizado' : 'creado'} con éxito.`, 'success');
      invalidate('ingredients:all');
      invalidate('ingredients');
      onSave();
      onClose();
    } catch (error) {
      const errorMsg = isDuplicateIngredientError(error)
        ? formatDuplicateErrorMessage(cleanName)
        : (error.message || 'Error al guardar el ingrediente');
      showAlert(errorMsg, 'error');
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
          <button onClick={onClose} className={styles.closeButton} aria-label="Cerrar">×</button>
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
              autoFocus
            />

            {/* Aviso visual en tiempo real de ingrediente duplicado */}
            {duplicateIngredient && (
              <div className={styles.duplicateWarning}>
                <div className={styles.duplicateWarningHeader}>
                  <AlertTriangle size={17} />
                  <span>Ingrediente ya registrado</span>
                </div>
                <p className={styles.duplicateWarningText}>
                  Ya existe <strong>"{duplicateIngredient.name}"</strong> en el inventario con{' '}
                  <strong>{duplicateIngredient.current_stock} {duplicateIngredient.base_unit}</strong> de stock
                  (Costo prom: ${Number(duplicateIngredient.average_cost || 0).toFixed(4)} / {duplicateIngredient.base_unit}).
                </p>
                {onSelectExisting && (
                  <button
                    type="button"
                    className={styles.duplicateWarningAction}
                    onClick={() => onSelectExisting(duplicateIngredient)}
                  >
                    <span>Editar "{duplicateIngredient.name}" directamente</span>
                    <ExternalLink size={13} />
                  </button>
                )}
              </div>
            )}
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
              min="0"
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
              Rastrear Stock (Desmarcar para insumos no contables, ej: Servilletas)
            </label>
          </div>

          <div className={styles.modalFooter}>
            <button type="button" onClick={onClose} className={styles.cancelButton}>
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || Boolean(duplicateIngredient)}
              className={styles.saveButton}
            >
              {isSubmitting
                ? 'Guardando...'
                : (duplicateIngredient ? 'Nombre ya registrado' : 'Guardar')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}