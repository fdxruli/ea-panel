import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import styles from './TermsAndConditions.module.css';
import { useAlert } from '../context/AlertContext';
import { useAdminAuth } from '../context/AdminAuthContext';

export default function TermsAndConditions() {
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingTerm, setEditingTerm] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [termToDelete, setTermToDelete] = useState(null);

  // OPTIMIZACIÓN 1: Memoizar permisos para evitar re-renders
  const canEdit = useMemo(() => hasPermission('terminos.edit'), [hasPermission]);
  const canDelete = useMemo(() => hasPermission('terminos.delete'), [hasPermission]);

  // OPTIMIZACIÓN 2: Memoizar función de fetch
  const fetchTerms = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('terms_and_conditions')
        .select('*')
        .order('version', { ascending: false });

      if (error) throw error;
      setTerms(data);
    } catch (error) {
      console.error('Error fetching terms:', error);
      showAlert(error.message);
    } finally {
      setLoading(false);
    }
  }, []); // Removido showAlert de dependencias

  useEffect(() => {
    fetchTerms();
  }, [fetchTerms]);

  // OPTIMIZACIÓN 3: Memoizar función de guardado
  const handleSave = useCallback(async () => {
    if (!canEdit) return;
    
    if (!editingTerm?.content?.trim() || !editingTerm?.version) {
      showAlert('La versión y el contenido no pueden estar vacíos.');
      return;
    }

    try {
      if (!editingTerm.id) {
        // Crear nueva versión
        const { error } = await supabase
          .from('terms_and_conditions')
          .insert({
            version: editingTerm.version,
            content: editingTerm.content.trim()
          });

        if (error) throw error;
        showAlert('Nueva versión creada exitosamente.');
      } else {
        // Actualizar versión existente
        const { error } = await supabase
          .from('terms_and_conditions')
          .update({
            version: editingTerm.version,
            content: editingTerm.content.trim()
          })
          .eq('id', editingTerm.id);

        if (error) throw error;
        showAlert('Versión actualizada exitosamente.');
      }

      setIsModalOpen(false);
      setEditingTerm(null);
      fetchTerms();
    } catch (error) {
      showAlert(`Error: ${error.message}`);
    }
  }, [canEdit, editingTerm, fetchTerms, showAlert]);

  // OPTIMIZACIÓN 4: Memoizar función de apertura de modal
  const openModal = useCallback((term = null) => {
    if (!canEdit) return;
    
    if (term) {
      setEditingTerm({ ...term });
    } else {
      const latestVersion = terms.length > 0 ? terms[0].version : 0;
      setEditingTerm({ 
        id: null, 
        version: latestVersion + 1, 
        content: '' 
      });
    }
    
    setIsModalOpen(true);
  }, [canEdit, terms]);

  // OPTIMIZACIÓN 5: Memoizar función de eliminación
  const handleDelete = useCallback(async () => {
    if (!canDelete || !termToDelete) return;

    try {
      const { error } = await supabase
        .from('terms_and_conditions')
        .delete()
        .eq('id', termToDelete.id);

      if (error) throw error;
      
      showAlert('Versión eliminada exitosamente.');
      setTermToDelete(null);
      fetchTerms();
    } catch (error) {
      showAlert(`Error al eliminar: ${error.message}`);
    }
  }, [canDelete, termToDelete, fetchTerms, showAlert]);

  // OPTIMIZACIÓN 6: Función para confirmar eliminación
  const confirmDelete = useCallback((term) => {
    if (!canDelete) return;
    setTermToDelete(term);
  }, [canDelete]);

  // OPTIMIZACIÓN 7: Función para cerrar modal
  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setEditingTerm(null);
  }, []);

  // OPTIMIZACIÓN 8: Memoizar cambios en el textarea
  const handleContentChange = useCallback((e) => {
    setEditingTerm(prev => ({
      ...prev,
      content: e.target.value
    }));
  }, []);

  const handleVersionChange = useCallback((e) => {
    setEditingTerm(prev => ({
      ...prev,
      version: parseInt(e.target.value, 10) || 0
    }));
  }, []);

  // OPTIMIZACIÓN 9: Memoizar formato de fecha
  const formatDate = useCallback((dateString) => {
    return new Date(dateString).toLocaleString('es-MX', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1>Términos y Condiciones</h1>
        {canEdit && (
          <button 
            onClick={() => openModal()} 
            className={styles.addButton}
          >
            + Nueva Versión
          </button>
        )}
      </div>

      {terms.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No hay versiones de términos y condiciones publicadas.</p>
          {canEdit && (
            <button 
              onClick={() => openModal()} 
              className={styles.addButton}
            >
              Crear Primera Versión
            </button>
          )}
        </div>
      ) : (
        <div className={styles.termsGrid}>
          {terms.map((term) => (
            <div key={term.id} className={styles.termCard}>
              <div className={styles.termHeader}>
                <span className={styles.version}>Versión {term.version}</span>
                <span className={styles.date}>
                  {formatDate(term.published_at)}
                </span>
              </div>
              
              <div className={styles.termContent}>
                <p>{term.content}</p>
              </div>

              {(canEdit || canDelete) && (
                <div className={styles.termActions}>
                  {canEdit && (
                    <button
                      onClick={() => openModal(term)}
                      className={styles.editButton}
                    >
                      Editar
                    </button>
                  )}
                  {canDelete && (
                    <button
                      onClick={() => confirmDelete(term)}
                      className={styles.deleteButton}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal para editar/crear */}
      {isModalOpen && editingTerm && (
        <div className={styles.modalOverlay} onClick={closeModal}>
          <div 
            className={styles.modalContent} 
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <h2>
                {editingTerm.id ? 'Editar Versión' : 'Nueva Versión'}
              </h2>
              <button 
                onClick={closeModal} 
                className={styles.closeButton}
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              <div className={styles.formGroup}>
                <label htmlFor="version">Versión:</label>
                <input
                  id="version"
                  type="number"
                  min="1"
                  value={editingTerm.version}
                  onChange={handleVersionChange}
                  className={styles.versionInput}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="content">Contenido:</label>
                <textarea
                  id="content"
                  value={editingTerm.content}
                  onChange={handleContentChange}
                  className={styles.contentTextarea}
                  rows={15}
                  placeholder="Escribe los términos y condiciones aquí..."
                />
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button 
                onClick={closeModal} 
                className={styles.cancelButton}
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave} 
                className={styles.saveButton}
              >
                {editingTerm.id ? 'Guardar Cambios' : 'Crear Versión'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación para eliminar */}
      {termToDelete && (
        <ConfirmModal
          isOpen={!!termToDelete}
          onClose={() => setTermToDelete(null)}
          onConfirm={handleDelete}
          title="Eliminar Versión"
          message={`¿Estás seguro de que deseas eliminar la versión ${termToDelete.version}? Esta acción no se puede deshacer.`}
        />
      )}
    </div>
  );
}
