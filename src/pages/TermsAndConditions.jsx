import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import styles from './TermsAndConditions.module.css'; // Crearemos este archivo a continuación

export default function TermsAndConditions() {
    const [terms, setTerms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editingTerm, setEditingTerm] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [termToDelete, setTermToDelete] = useState(null);

    const fetchTerms = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('terms_and_conditions')
            .select('*')
            .order('version', { ascending: false });
        if (error) {
            console.error('Error fetching terms:', error);
            alert(error.message);
        } else {
            setTerms(data);
        }
        setLoading(false);
    };

    useEffect(() => {
        fetchTerms();
    }, []);

    const handleSave = async () => {
        if (!editingTerm?.content || !editingTerm?.version) {
            alert('La versión y el contenido no pueden estar vacíos.');
            return;
        }

        // Si es una nueva versión (no tiene id)
        if (!editingTerm.id) {
            const { error } = await supabase
                .from('terms_and_conditions')
                .insert({
                    version: editingTerm.version,
                    content: editingTerm.content
                });
            if (error) {
                 alert('Error al crear la nueva versión: ' + error.message);
            }
        } else { // Si está editando una existente
             const { error } = await supabase
                .from('terms_and_conditions')
                .update({
                    version: editingTerm.version,
                    content: editingTerm.content
                })
                .eq('id', editingTerm.id);
             if (error) {
                alert('Error al actualizar la versión: ' + error.message);
            }
        }
        
        setIsModalOpen(false);
        setEditingTerm(null);
        fetchTerms();
    };

    const openModal = (term = null) => {
        if (term) {
            setEditingTerm(term);
        } else {
            const latestVersion = terms.length > 0 ? terms[0].version : 0;
            setEditingTerm({ id: null, version: latestVersion + 1, content: '' });
        }
        setIsModalOpen(true);
    };
    
    const handleDelete = async () => {
        if (!termToDelete) return;

        const { error } = await supabase
            .from('terms_and_conditions')
            .delete()
            .eq('id', termToDelete.id);
        
        if (error) {
            alert('Error al eliminar: ' + error.message);
        }
        setTermToDelete(null);
        fetchTerms();
    };


    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <h1>Gestionar Términos y Condiciones</h1>

            <button onClick={() => openModal()} className={styles.addButton}>
                + Crear Nueva Versión
            </button>

            <table className="products-table">
                <thead>
                    <tr>
                        <th>Versión</th>
                        <th>Publicado el</th>
                        <th>Acciones</th>
                    </tr>
                </thead>
                <tbody>
                    {terms.map(term => (
                        <tr key={term.id}>
                            <td>{term.version}</td>
                            <td>{new Date(term.published_at).toLocaleString()}</td>
                            <td>
                                <button onClick={() => openModal(term)}>Editar</button>
                                <button onClick={() => setTermToDelete(term)} className={styles.deleteButton}>Eliminar</button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {isModalOpen && (
                <div className={styles.modalOverlay}>
                    <div className={styles.modalContent}>
                        <h2>{editingTerm.id ? 'Editar' : 'Nueva'} Versión</h2>
                        <label>Versión (número):</label>
                        <input
                            type="number"
                            value={editingTerm.version}
                            onChange={(e) => setEditingTerm({ ...editingTerm, version: parseInt(e.target.value, 10) })}
                        />
                        <label>Contenido (Texto completo):</label>
                        <textarea
                            rows="15"
                            value={editingTerm.content}
                            onChange={(e) => setEditingTerm({ ...editingTerm, content: e.target.value })}
                        />
                        <div className={styles.modalActions}>
                            <button onClick={() => setIsModalOpen(false)}>Cancelar</button>
                            <button onClick={handleSave}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}
            
            <ConfirmModal
                isOpen={!!termToDelete}
                onClose={() => setTermToDelete(null)}
                onConfirm={handleDelete}
                title="¿Confirmar Eliminación?"
            >
                Estás a punto de eliminar la versión {termToDelete?.version}. Esta acción no se puede deshacer.
            </ConfirmModal>

        </div>
    );
}