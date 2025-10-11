import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './EditReferralCountModal.module.css';
import { useAlert } from '../context/AlertContext';

export default function EditReferralCountModal({ customer, isOpen, onClose, onUpdate }) {
    const { showAlert } = useAlert();
    const [newCount, setNewCount] = useState(customer?.referral_count || 0);

    const handleSave = async () => {
        const { error } = await supabase.rpc('set_customer_referral_count', {
            customer_id_to_update: customer.customer_id,
            new_count: newCount
        });

        if (error) {
            showAlert(`Error al actualizar: ${error.message}`);
        } else {
            showAlert('Contador de referidos actualizado.');
            onUpdate();
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className={styles.closeButton}>×</button>
                <h3>Editando Referidos de:</h3>
                <h2>{customer.customer_name}</h2>
                <div className={styles.formGroup}>
                    <label htmlFor="ref-count">Nuevo total de referidos:</label>
                    <input
                        id="ref-count"
                        type="number"
                        value={newCount}
                        onChange={e => setNewCount(parseInt(e.target.value) || 0)}
                    />
                </div>
                <div className={styles.actions}>
                    <button onClick={onClose} className="admin-button-secondary">Cancelar</button>
                    <button onClick={handleSave} className="admin-button-primary">Guardar</button>
                </div>
            </div>
        </div>
    );
}