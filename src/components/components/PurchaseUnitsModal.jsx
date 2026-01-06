import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import DOMPurify from 'dompurify';
import styles from './Modal.module.css';
import LoadingSpinner from './LoadingSpinner';

export default function PurchaseUnitsModal({ isOpen, onClose, ingredient }) {
  const { showAlert } = useAlert();
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({ name: '', factor: '' });

  const fetchUnits = useCallback(async () => {
    if (!ingredient) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('ingredient_purchase_units')
      .select('*')
      .eq('ingredient_id', ingredient.id)
      .order('purchase_unit_name');
    
    if (error) showAlert(error.message, 'error');
    else setUnits(data);
    setLoading(false);
  }, [ingredient, showAlert]);

  useEffect(() => {
    if (isOpen) fetchUnits();
  }, [isOpen, fetchUnits]);

  const handleAddUnit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.factor || Number(formData.factor) <= 0) {
      showAlert('El nombre y un factor de conversión positivo son obligatorios.', 'error');
      return;
    }
    setIsSubmitting(true);
    
    const { error } = await supabase.from('ingredient_purchase_units').insert({
      ingredient_id: ingredient.id,
      purchase_unit_name: DOMPurify.sanitize(formData.name),
      base_units_per_purchase_unit: Number(formData.factor)
    });

    if (error) {
      showAlert(error.message, 'error');
    } else {
      showAlert('Formato de compra añadido.', 'success');
      setFormData({ name: '', factor: '' });
      fetchUnits();
    }
    setIsSubmitting(false);
  };

  const handleDeleteUnit = async (unitId) => {
    if (!window.confirm('¿Seguro que quieres eliminar este formato de compra?')) return;
    
    const { error } = await supabase
      .from('ingredient_purchase_units')
      .delete()
      .eq('id', unitId);
    
    if (error) showAlert(error.message, 'error');
    else fetchUnits();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2>Formatos de Compra: {ingredient.name}</h2>
          <button onClick={onClose} className={styles.closeButton}>×</button>
        </div>
        <div className={styles.modalBody}>
          <form onSubmit={handleAddUnit} className={styles.subForm}>
            <p>
              Define cómo compras este ingrediente. La unidad base es <strong>{ingredient.base_unit}</strong>.
            </p>
            <div className={styles.formGrid}>
              <input
                type="text"
                placeholder="Nombre del formato (Ej: Garrafa 4.3kg)"
                value={formData.name}
                onChange={(e) => setFormData(p => ({ ...p, name: e.target.value }))}
                required
              />
              <input
                type="number"
                step="any"
                placeholder={`Equivale a (ej: 3500) ${ingredient.base_unit}`}
                value={formData.factor}
                onChange={(e) => setFormData(p => ({ ...p, factor: e.target.value }))}
                required
              />
            </div>
            <button type="submit" disabled={isSubmitting} className={styles.saveButton}>
              {isSubmitting ? 'Añadiendo...' : 'Añadir Formato'}
            </button>
          </form>

          <div className={styles.listContainer}>
            <h4>Formatos Existentes</h4>
            {loading ? <LoadingSpinner /> : (
              units.length === 0 ? <p>No hay formatos de compra para este ingrediente.</p> :
              <ul className={styles.itemList}>
                {units.map(unit => (
                  <li key={unit.id}>
                    <span>
                      <strong>{unit.purchase_unit_name}</strong> = {unit.base_units_per_purchase_unit} {ingredient.base_unit}
                    </span>
                    <button onClick={() => handleDeleteUnit(unit.id)} className={styles.deleteButton}>×</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}