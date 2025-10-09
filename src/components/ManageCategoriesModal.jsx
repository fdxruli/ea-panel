import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageCategoriesModal.module.css';
import { useAlert } from '../context/AlertContext';
import LoadingSpinner from './LoadingSpinner';
import ConfirmModal from './ConfirmModal';
import ReassignProductsModal from './ReassignProductsModal';
import DOMPurify from 'dompurify';

export default function ManageCategoriesModal({ isOpen, onClose, onCategoriesUpdate }) {
    const { showAlert } = useAlert();
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [formData, setFormData] = useState({ id: null, name: '', description: '' });
    const [categoryToDelete, setCategoryToDelete] = useState(null);
    
    const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
    const [productsInCateogryCount, setProductsInCategoryCount] = useState(0);

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
        } else {
            setCategories(data);
        }
        setLoading(false);
    };

    const handleEditClick = (category) => {
        setFormData({ id: category.id, name: category.name, description: category.description || '' });
    };

    const handleDeleteClick = async (category) => {
        const { count, error } = await supabase
            .from('products')
            .select('id', { count: 'exact' })
            .eq('category_id', category.id);

        if (error) {
            showAlert('No se pudo verificar los productos de la categoría.');
            return;
        }

        setCategoryToDelete(category);

        if (count > 0) {
            setProductsInCategoryCount(count);
            setIsReassignModalOpen(true);
        } else {
            setIsReassignModalOpen(false);
        }
    };

    const confirmSimpleDelete = async () => {
        if (!categoryToDelete) return;

        const { error } = await supabase.from('categories').delete().eq('id', categoryToDelete.id);
        if (error) {
            showAlert(`Error al eliminar: ${error.message}`);
        } else {
            showAlert('Categoría eliminada con éxito.');
        }
        setCategoryToDelete(null);
        fetchCategories();
        onCategoriesUpdate();
    };
    
    const confirmReassignAndDelete = async (newCategoryId) => {
        if (!categoryToDelete) return;
        
        const { error: updateError } = await supabase
            .from('products')
            .update({ category_id: newCategoryId })
            .eq('category_id', categoryToDelete.id);

        if (updateError) {
            showAlert(`Error al reasignar productos: ${updateError.message}`);
            return;
        }

        const { error: deleteError } = await supabase
            .from('categories')
            .delete()
            .eq('id', categoryToDelete.id);

        if (deleteError) {
            showAlert(`Productos reasignados, pero hubo un error al eliminar la categoría: ${deleteError.message}`);
        } else {
            showAlert('Productos reasignados y categoría eliminada con éxito.');
        }
        
        setIsReassignModalOpen(false);
        setCategoryToDelete(null);
        fetchCategories();
        onCategoriesUpdate();
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
            name: DOMPurify.sanitize(formData.name),
            description: DOMPurify.sanitize(formData.description)
        };
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

    const otherCategories = categories.filter(cat => cat.id !== categoryToDelete?.id);

    return (
        <>
            <div className={styles.overlay} onClick={onClose}>
                <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                    <button onClick={onClose} className={styles.closeButton}>×</button>
                    <h2>Administrar Categorías</h2>
                    <div className={styles.mainLayout}>
                        <div className={styles.formSection}>
                             <h3>{formData.id ? 'Editar Categoría' : 'Crear Nueva'}</h3>
                            <form onSubmit={handleSubmit}>
                                <div className={styles.formGroup}>
                                    <label htmlFor="category-name">Nombre</label>
                                    <input id="category-name" type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="Ej: Bebidas" required />
                                </div>
                                <div className={styles.formGroup}>
                                    <label htmlFor="category-desc">Descripción (Opcional)</label>
                                    <textarea id="category-desc" rows="3" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Ej: Bebidas frías y calientes" />
                                </div>
                                <div className={styles.formActions}>
                                    {formData.id && <button type="button" onClick={resetForm} className={styles.cancelButton}>Cancelar Edición</button>}
                                    <button type="submit" disabled={isSubmitting} className={styles.saveButton}>{isSubmitting ? 'Guardando...' : (formData.id ? 'Actualizar' : 'Crear')}</button>
                                </div>
                            </form>
                        </div>
                        <div className={styles.categoryListSection}>
                            <h3>Categorías Existentes</h3>
                            {loading ? <LoadingSpinner /> : (
                                <div className={styles.categoryList}>
                                    {categories.map(cat => (
                                        <div key={cat.id} className={styles.categoryItem}>
                                            <span className={styles.categoryName}>{cat.name}</span>
                                            <div className={styles.categoryActions}>
                                                <button onClick={() => handleEditClick(cat)} className={styles.editButton}>Editar</button>
                                                <button onClick={() => handleDeleteClick(cat)} className={styles.deleteButton}>Eliminar</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            
            <ConfirmModal
                isOpen={!!categoryToDelete && !isReassignModalOpen}
                onClose={() => setCategoryToDelete(null)}
                onConfirm={confirmSimpleDelete}
                title="¿Eliminar Categoría?"
            >
                Estás a punto de eliminar la categoría "{categoryToDelete?.name}". Esta acción no se puede deshacer.
            </ConfirmModal>

            <ReassignProductsModal
                isOpen={isReassignModalOpen}
                onClose={() => setIsReassignModalOpen(false)}
                onConfirm={confirmReassignAndDelete}
                categoryToDelete={categoryToDelete}
                otherCategories={otherCategories}
                productsCount={productsInCateogryCount}
            />
        </>
    );
}