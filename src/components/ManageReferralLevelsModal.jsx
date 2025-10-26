import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageReferralLevelsModal.module.css';
import { useAlert } from '../context/AlertContext';
import DOMPurify from 'dompurify';
import LoadingSpinner from './LoadingSpinner';

export default function ManageReferralLevelsModal({ isOpen, onClose }) {
    const { showAlert } = useAlert();
    
    // ✅ Inicializar levels como array vacío
    const [levels, setLevels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        min_referrals: ''
    });

    // ✅ Fetch niveles con useCallback
    const fetchLevels = useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('referral_levels')
                .select('*')
                .order('min_referrals', { ascending: true });

            if (error) throw error;
            
            // ✅ Asegurar que siempre sea un array
            setLevels(data || []);
        } catch (error) {
            console.error('Error fetching levels:', error);
            showAlert(`Error al cargar niveles: ${error.message}`);
            setLevels([]); // ✅ Asegurar array vacío en caso de error
        } finally {
            setLoading(false);
        }
    }, [showAlert]);

    // ✅ Fetch cuando el modal se abre
    useEffect(() => {
        if (isOpen) {
            fetchLevels();
        }
    }, [isOpen, fetchLevels]);

    const handleEdit = useCallback((level) => {
        setEditingId(level.id);
        setFormData({
            name: level.name,
            min_referrals: level.min_referrals.toString()
        });
    }, []);

    const handleCancel = useCallback(() => {
        setEditingId(null);
        setFormData({ name: '', min_referrals: '' });
    }, []);

    const handleSave = useCallback(async (levelId) => {
        const cleanName = DOMPurify.sanitize(formData.name.trim());
        const minReferrals = parseInt(formData.min_referrals);

        if (!cleanName) {
            showAlert('El nombre es obligatorio.');
            return;
        }

        if (isNaN(minReferrals) || minReferrals < 0) {
            showAlert('El número de referidos debe ser válido (mayor o igual a 0).');
            return;
        }

        try {
            const { error } = await supabase
                .from('referral_levels')
                .update({
                    name: cleanName,
                    min_referrals: minReferrals
                })
                .eq('id', levelId);

            if (error) throw error;

            showAlert('Nivel actualizado con éxito.', 'success');
            handleCancel();
            fetchLevels();
        } catch (error) {
            console.error('Error updating level:', error);
            showAlert(`Error: ${error.message}`);
        }
    }, [formData, showAlert, handleCancel, fetchLevels]);

    const handleCreate = useCallback(async () => {
        const cleanName = DOMPurify.sanitize(formData.name.trim());
        const minReferrals = parseInt(formData.min_referrals);

        if (!cleanName) {
            showAlert('El nombre es obligatorio.');
            return;
        }

        if (isNaN(minReferrals) || minReferrals < 0) {
            showAlert('El número de referidos debe ser válido (mayor o igual a 0).');
            return;
        }

        try {
            const { error } = await supabase
                .from('referral_levels')
                .insert({
                    name: cleanName,
                    min_referrals: minReferrals
                });

            if (error) throw error;

            showAlert('Nivel creado con éxito.', 'success');
            setFormData({ name: '', min_referrals: '' });
            fetchLevels();
        } catch (error) {
            console.error('Error creating level:', error);
            showAlert(`Error: ${error.message}`);
        }
    }, [formData, showAlert, fetchLevels]);

    const handleDelete = useCallback(async (levelId) => {
        if (!window.confirm('¿Estás seguro de que deseas eliminar este nivel?')) {
            return;
        }

        try {
            const { error } = await supabase
                .from('referral_levels')
                .delete()
                .eq('id', levelId);

            if (error) throw error;

            showAlert('Nivel eliminado con éxito.', 'success');
            fetchLevels();
        } catch (error) {
            console.error('Error deleting level:', error);
            showAlert(`Error: ${error.message}`);
        }
    }, [showAlert, fetchLevels]);

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeButton} onClick={onClose}>✕</button>

                <h2>Gestionar Niveles de Referidos</h2>

                {loading ? (
                    <LoadingSpinner />
                ) : (
                    <>
                        {/* Formulario para crear nuevo nivel */}
                        <div className={styles.createSection}>
                            <h3>Crear Nuevo Nivel</h3>
                            <div className={styles.formRow}>
                                <input
                                    type="text"
                                    placeholder="Nombre del nivel (Ej: Bronce)"
                                    value={editingId ? '' : formData.name}
                                    onChange={(e) => !editingId && setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    disabled={!!editingId}
                                />
                                <input
                                    type="number"
                                    placeholder="Referidos mínimos"
                                    min="0"
                                    value={editingId ? '' : formData.min_referrals}
                                    onChange={(e) => !editingId && setFormData(prev => ({ ...prev, min_referrals: e.target.value }))}
                                    disabled={!!editingId}
                                />
                                <button 
                                    onClick={handleCreate}
                                    className={styles.createButton}
                                    disabled={!!editingId}
                                >
                                    + Crear
                                </button>
                            </div>
                        </div>

                        {/* Lista de niveles existentes */}
                        <div className={styles.levelsSection}>
                            <h3>Niveles Existentes ({levels.length})</h3>
                            
                            {levels.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <p>Aún no hay niveles creados.</p>
                                    <p className={styles.hint}>
                                        Crea tu primer nivel usando el formulario de arriba.
                                    </p>
                                </div>
                            ) : (
                                <div className={styles.levelsList}>
                                    {levels.map((level) => (
                                        <div key={level.id} className={styles.levelCard}>
                                            {editingId === level.id ? (
                                                // Modo edición
                                                <div className={styles.editMode}>
                                                    <input
                                                        type="text"
                                                        value={formData.name}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                                        placeholder="Nombre"
                                                    />
                                                    <input
                                                        type="number"
                                                        value={formData.min_referrals}
                                                        onChange={(e) => setFormData(prev => ({ ...prev, min_referrals: e.target.value }))}
                                                        placeholder="Mínimo"
                                                        min="0"
                                                    />
                                                    <div className={styles.editActions}>
                                                        <button 
                                                            onClick={() => handleSave(level.id)}
                                                            className={styles.saveButton}
                                                        >
                                                            ✓ Guardar
                                                        </button>
                                                        <button 
                                                            onClick={handleCancel}
                                                            className={styles.cancelButton}
                                                        >
                                                            ✕ Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                // Modo vista
                                                <div className={styles.viewMode}>
                                                    <div className={styles.levelInfo}>
                                                        <h4>{level.name}</h4>
                                                        <p>{level.min_referrals} referidos mínimos</p>
                                                    </div>
                                                    <div className={styles.levelActions}>
                                                        <button 
                                                            onClick={() => handleEdit(level)}
                                                            className={styles.editButton}
                                                        >
                                                            ✏️ Editar
                                                        </button>
                                                        <button 
                                                            onClick={() => handleDelete(level.id)}
                                                            className={styles.deleteButton}
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                <div className={styles.modalFooter}>
                    <button onClick={onClose} className={styles.closeFooterButton}>
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
