// src/components/ManageCategoriesModal.jsx (ACTUALIZADO CON DOMPURIFY)
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageCategoriesModal.module.css';
import { useAlert } from '../context/AlertContext';
import LoadingSpinner from './LoadingSpinner';
import DOMPurify from 'dompurify'; // <-- 1. IMPORTADO

export default function ManageCategoriesModal({ isOpen, onClose, onCategoriesUpdate }) {
    const { showAlert } = useAlert();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [formData, setFormData] = useState({ id: null, name: '', description: '' });

    useEffect(() => {
        if (isOpen) {
            fetchCategories();
        }
    }, [isOpen]);

    const fetchCategories = async () => {
        setLoading(true);
        const { data, error } = await supabase.from('categories').select('*').order('name');
        if (error) {
            showAlert('Error al cargar las categorías.');
            console.error(error);
        } else {
            setCategories(data);
        }
        setLoading(false);
    };

    const handleEditClick = (category) => {
        setFormData({
            id: category.id,
            name: category.name,
            description: category.description || ''
        });
    };

    const resetForm = () => {
        setFormData({ id: null, name: '', description: '' });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name.trim()) {
            showAlert('El nombre de la categoría es obligatorio.');
            return;
        }
        setIsSubmitting(true);

        // --- 👇 2. SANITIZACIÓN DE DATOS ---
        const dataToSave = {
            name: DOMPurify.sanitize(formData.name),
            description: DOMPurify.sanitize(formData.description)
        };
        // --- 👆 FIN DE LA SANITIZACIÓN ---

        let error;
        if (formData.id) {
            ({ error } = await supabase.from('categories').update(dataToSave).eq('id', formData.id));
        } else {
            ({ error } = await supabase.from('categories').insert(dataToSave));
        }

        if (error) {
            showAlert(`Error al guardar: ${error.message}`);
        } else {
            showAlert(`Categoría ${formData.id ? 'actualizada' : 'creada'} con éxito.`);
            resetForm();
            fetchCategories(); 
            onCategoriesUpdate();
        }
        setIsSubmitting(false);
    };
    
    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className={styles.closeButton}>×</button>
                <h2>Administrar Categorías</h2>

                <div className={styles.contentWrapper}>
                    <div className={styles.categoryListSection}>
                        <h3>Categorías Existentes</h3>
                        {loading ? <LoadingSpinner /> : (
                            <div className={styles.categoryList}>
                                {categories.map(cat => (
                                    <div key={cat.id} className={styles.categoryItem}>
                                        <span>{cat.name}</span>
                                        <button onClick={() => handleEditClick(cat)}>Editar</button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className={styles.formSection}>
                        <h3>{formData.id ? 'Editar Categoría' : 'Crear Nueva Categoría'}</h3>
                        <form onSubmit={handleSubmit}>
                            <div className={styles.formGroup}>
                                <label htmlFor="category-name">Nombre</label>
                                <input
                                    id="category-name"
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Ej: Bebidas"
                                    required
                                />
                            </div>
                            <div className={styles.formGroup}>
                                <label htmlFor="category-desc">Descripción (Opcional)</label>
                                <textarea
                                    id="category-desc"
                                    rows="4"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Ej: Bebidas frías y calientes"
                                />
                            </div>
                            <div className={styles.formActions}>
                                {formData.id && <button type="button" onClick={resetForm} className={styles.cancelButton}>Cancelar Edición</button>}
                                <button type="submit" disabled={isSubmitting} className={styles.saveButton}>
                                    {isSubmitting ? 'Guardando...' : (formData.id ? 'Actualizar' : 'Crear')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
}