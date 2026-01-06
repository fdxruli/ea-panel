import React, { useState } from 'react';
import styles from './ReassignProductsModal.module.css';

export default function ReassignProductsModal({ isOpen, onClose, onConfirm, categoryToDelete, otherCategories, productsCount }) {
  const [reassignCategoryId, setReassignCategoryId] = useState(otherCategories[0]?.id || '');

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (!reassignCategoryId) {
      alert('Por favor, selecciona una categoría para reasignar los productos.');
      return;
    }
    onConfirm(reassignCategoryId);
  };

  return (
    <div className={styles.overlay}>
      <div className={styles.modalContent}>
        <h3>Acción Requerida</h3>
        <p>
          No se puede eliminar la categoría <strong>"{categoryToDelete?.name}"</strong> porque tiene <strong>{productsCount}</strong> producto(s) asociado(s).
        </p>
        <p>
          Para continuar, por favor, reasigna estos productos a una nueva categoría.
        </p>
        
        <div className={styles.formGroup}>
            <label htmlFor="reassign-category">Reasignar a:</label>
            <select 
                id="reassign-category" 
                value={reassignCategoryId} 
                onChange={(e) => setReassignCategoryId(e.target.value)}
            >
                {otherCategories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
            </select>
        </div>

        <div className={styles.buttons}>
          <button onClick={onClose} className={styles.cancelButton}>
            Cancelar
          </button>
          <button onClick={handleConfirm} className={styles.confirmButton}>
            Reasignar y Eliminar
          </button>
        </div>
      </div>
    </div>
  );
}