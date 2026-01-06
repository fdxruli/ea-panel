// src/components/EditReferralCountModal.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './EditReferralCountModal.module.css';
import { useAlert } from '../context/AlertContext';
import LoadingSpinner from './LoadingSpinner'; // <-- Asegúrate de importar LoadingSpinner si lo usas

export default function EditReferralCountModal({ customer, isOpen, onClose, onUpdate }) {
    const { showAlert } = useAlert();
    const [newCount, setNewCount] = useState(0);

    // Actualiza el estado inicial cuando el modal se abre o el cliente cambia
    useEffect(() => {
        if (isOpen && customer) {
            setNewCount(customer.referral_count || 0);
        } else if (!isOpen) {
            // Opcional: Resetear al cerrar si prefieres
            // setNewCount(0);
        }
    }, [isOpen, customer]); // Dependencias: isOpen y customer

    const handleSave = async () => {
        // *** VERIFICACIÓN CRUCIAL #1: ¿Cómo se llama el ID en el objeto 'customer'? ***
        // Basado en Referrals.jsx, debería ser 'id'. Si es diferente, ajústalo aquí.
        const customerIdToUpdate = customer?.id;

        // Verifica que el ID exista antes de llamar a la RPC
        if (!customerIdToUpdate) {
             showAlert('Error: No se pudo obtener el ID del cliente.');
             console.error("Objeto 'customer' recibido en EditReferralCountModal:", customer);
             return;
        }

        console.log(`Intentando llamar a RPC: update_customer_referral_count con p_customer_id: ${customerIdToUpdate}, p_new_count: ${newCount}`); // Log antes de la llamada

        // *** VERIFICACIÓN CRUCIAL #2: Nombre de la función y parámetros ***
        const { error } = await supabase.rpc('update_customer_referral_count', { // <--- Nombre NUEVO
            p_customer_id: customerIdToUpdate, // <--- Parámetro 1
            p_new_count: newCount             // <--- Parámetro 2
        });

        if (error) {
            console.error("Error detallado de RPC:", error); // Log del error completo
            // Mostrar el mensaje específico de Supabase si es útil
            showAlert(`Error al actualizar: ${error.message}. Verifica la consola para más detalles.`);
        } else {
            showAlert('Contador de referidos actualizado.');
            if (typeof onUpdate === 'function') {
               onUpdate(); // Refresca la lista en el componente padre
            }
            onClose(); // Cierra el modal
        }
    };

    if (!isOpen) return null;

    // Indicador de carga si el objeto customer no está listo (aunque debería estarlo)
    if (!customer) {
        return (
            <div className={styles.overlay}>
                <div className={styles.modalContent}>
                   <LoadingSpinner />
                </div>
            </div>
        );
     }


    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <button onClick={onClose} className={styles.closeButton}>×</button>
                <h3>Editando Referidos de:</h3>
                {/* Asegúrate de que el nombre se muestre correctamente */}
                <h2>{customer.customer_name || customer.name || 'Cliente desconocido'}</h2>
                <div className={styles.formGroup}>
                    <label htmlFor="ref-count">Nuevo total de referidos:</label>
                    <input
                        id="ref-count"
                        type="number"
                        min="0" // Asegurar que no sea negativo
                        value={newCount}
                        // Convertir a número y asegurar >= 0
                        onChange={e => {
                            const value = parseInt(e.target.value, 10);
                            setNewCount(isNaN(value) || value < 0 ? 0 : value);
                        }}
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