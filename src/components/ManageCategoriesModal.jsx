// src/components/ManageCategoriesModal.jsx (CORREGIDO)
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageCategoriesModal.module.css';
import { useAlert } from '../context/AlertContext';
import LoadingSpinner from './LoadingSpinner';

export default function ManageCategoriesModal({ isOpen, onClose, onCategoriesUpdate }) {
    const { showAlert } = useAlert();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    // Estado para el formulario (puede ser para crear o editar)
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

        const dataToSave = {
            name: formData.name,
            description: formData.description
        };

        let error;
        if (formData.id) {
            // Actualizar existente
            ({ error } = await supabase.from('categories').update(dataToSave).eq('id', formData.id));
        } else {
            // Crear nueva
            ({ error } = await supabase.from('categories').insert(dataToSave));
        }

        if (error) {
            showAlert(`Error al guardar: ${error.message}`);
        } else {
            showAlert(`Categoría ${formData.id ? 'actualizada' : 'creada'} con éxito.`);
            resetForm();
            fetchCategories(); // Recargar la lista en el modal
            onCategoriesUpdate(); // Avisar a la página de Productos para que se actualice
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
                    {/* Columna Izquierda: Lista de Categorías */}
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

                    {/* Columna Derecha: Formulario */}
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