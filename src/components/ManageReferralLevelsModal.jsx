/* src/components/ManageReferralLevelsModal.jsx (Migrado) */

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageReferralLevelsModal.module.css';
import { useAlert } from '../context/AlertContext';
import DOMPurify from 'dompurify';
import LoadingSpinner from './LoadingSpinner';

// --- (PASO A) AÑADIR IMPORT ---
import { useCacheAdmin } from '../context/CacheAdminContext';
// --- FIN PASO A ---

// Componente LevelRewards (sin cambios)
const LevelRewards = ({ levelId }) => {
  const { showAlert } = useAlert();
  const [rewards, setRewards] = useState([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rewardCode, setRewardCode] = useState('');
  const [loadingRewards, setLoadingRewards] = useState(false);

  const fetchRewards = useCallback(async () => {
    setLoadingRewards(true);
    const { data, error } = await supabase
      .from('rewards')
      .select('*')
      .eq('level_id', levelId);
    if (error) showAlert('Error al cargar recompensas: ' + error.message);
    setRewards(data || []);
    setLoadingRewards(false);
  }, [levelId, showAlert]);

  useEffect(() => {
    if (levelId) fetchRewards();
  }, [levelId, fetchRewards]);

  const handleAddReward = async () => {
    if (!title.trim() && !description.trim()) {
      showAlert('El nombre o la descripción de la opción son obligatorios.');
      return;
    }
    const sanitizedTitle = DOMPurify.sanitize(title.trim() || description.trim());
    const sanitizedDesc = DOMPurify.sanitize(description.trim() || title.trim());
    const sanitizedCode = rewardCode.trim() ? DOMPurify.sanitize(rewardCode.toUpperCase()) : null;

    const { error } = await supabase
      .from('rewards')
      .insert({
        level_id: levelId,
        title: sanitizedTitle,
        description: sanitizedDesc,
        reward_code: sanitizedCode,
      });
    if (error) {
      showAlert('Hubo un error al añadir la recompensa: ' + error.message);
      return;
    }
    showAlert('Recompensa añadida con éxito.', 'success');
    setTitle('');
    setDescription('');
    setRewardCode('');
    fetchRewards();
  };

  const handleDeleteReward = async (rewardId) => {
    if (!window.confirm('¿Eliminar esta recompensa?')) return;
    const { error } = await supabase
      .from('rewards')
      .delete()
      .eq('id', rewardId);
    if (error) {
      showAlert('Error al eliminar: ' + error.message);
      return;
    }
    showAlert('Recompensa eliminada', 'success');
    fetchRewards();
  };

  return (
    <div className={styles.rewardsSection}>
      <h4>Recompensas de este nivel</h4>
      <p style={{ margin: '0 0 0.8rem 0', fontSize: '0.82rem', color: 'var(--text-secondary, #6b7280)', lineHeight: '1.35' }}>
        💡 Si agregas 2 o más recompensas, el cliente podrá elegir <strong>1 sola opción</strong> entre las disponibles.
      </p>
      <div className={styles.addRewardForm}>
        <input
          type="text"
          placeholder="Nombre de la opción (ej: Papas Fritas 200g)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          type="text"
          placeholder="Descripción (ej: Crujientes papas fritas corte delgado gratis)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          type="text"
          placeholder="Código Promoción / Cupón (ej: REWARD-PAPAS)"
          value={rewardCode}
          onChange={(e) => setRewardCode(e.target.value)}
        />
        <button onClick={handleAddReward}>
          Añadir opción de recompensa
        </button>
      </div>
      {loadingRewards ? (
        <LoadingSpinner />
      ) : (
        rewards.length === 0 ? <p>No hay recompensas para este nivel.</p> : (
          <ul className={styles.rewardsList}>
            {rewards.map((reward) => (
              <li key={reward.id} className={styles.rewardItemCard}>
                <div className={styles.rewardItemInfo}>
                  <strong className={styles.rewardItemTitle}>🎁 {reward.title || reward.description}</strong>
                  {reward.description && reward.title && reward.description !== reward.title && (
                    <p className={styles.rewardItemDesc}>{reward.description}</p>
                  )}
                  <div className={styles.rewardItemCode}>
                    <span>Cupón: </span>
                    <code>{reward.reward_code || 'Sin código'}</code>
                  </div>
                </div>
                <button onClick={() => handleDeleteReward(reward.id)} className={styles.deleteRewardBtn}>
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
};


// Componente Principal
export default function ManageReferralLevelsModal({ isOpen, onClose }) {
  const { showAlert } = useAlert();

  // --- (PASO B) AÑADIR HOOK ---
  const { invalidate } = useCacheAdmin();
  // --- FIN PASO B ---

  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', min_referrals: '' });

  const fetchLevels = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('referral_levels')
        .select('*, rewards(*)')
        .order('min_referrals', { ascending: true });
      if (error) throw error;
      setLevels(data || []);
    } catch (error) {
      showAlert(`Error al cargar niveles: ${error.message}`);
      setLevels([]);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    if (isOpen) fetchLevels();
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

  // --- (PASO C) INVALIDAR EN HANDLESAVE ---
  const handleSave = useCallback(async (levelId) => {
    const cleanName = DOMPurify.sanitize(formData.name.trim());
    const minReferrals = parseInt(formData.min_referrals);
    if (!cleanName) {
      showAlert('El nombre es obligatorio.');
      return;
    }
    if (isNaN(minReferrals) || minReferrals < 0) {
      showAlert('El número de referidos debe ser válido.');
      return;
    }
    try {
      const { error } = await supabase
        .from('referral_levels')
        .update({ name: cleanName, min_referrals: minReferrals })
        .eq('id', levelId);
      if (error) throw error;
      showAlert('Nivel actualizado con éxito.', 'success');
      invalidate('referral_levels'); // <-- AÑADIDO
      handleCancel();
      fetchLevels();
    } catch (error) {
      showAlert(`Error: ${error.message}`);
    }
  }, [formData, showAlert, handleCancel, fetchLevels, invalidate]); // <-- Añadido a dependencias

  // --- (PASO C) INVALIDAR EN HANDLECREATE ---
  const handleCreate = useCallback(async () => {
    const cleanName = DOMPurify.sanitize(formData.name.trim());
    const minReferrals = parseInt(formData.min_referrals);
    if (!cleanName) {
      showAlert('El nombre es obligatorio.');
      return;
    }
    if (isNaN(minReferrals) || minReferrals < 0) {
      showAlert('El número de referidos debe ser válido.');
      return;
    }
    try {
      const { error } = await supabase
        .from('referral_levels')
        .insert({ name: cleanName, min_referrals: minReferrals });
      if (error) throw error;
      showAlert('Nivel creado con éxito.', 'success');
      invalidate('referral_levels'); // <-- AÑADIDO
      setFormData({ name: '', min_referrals: '' });
      fetchLevels();
    } catch (error) {
      showAlert(`Error: ${error.message}`);
    }
  }, [formData, showAlert, fetchLevels, invalidate]); // <-- Añadido a dependencias

  // --- (PASO C) INVALIDAR EN HANDLEDELETE ---
  const handleDelete = useCallback(async (levelId, levelName, associatedRewardsCount) => {
      let confirmationMessage = `¿Estás seguro de que deseas eliminar el nivel "${levelName}"?`;
      if (associatedRewardsCount > 0) {
          confirmationMessage += `\n\n⚠️ ¡Atención! Este nivel tiene ${associatedRewardsCount} recompensa(s) asociada(s). Si continúas, TAMBIÉN SE ELIMINARÁN las recompensas.`;
      }

      if (!window.confirm(confirmationMessage)) return;

      try {
          if (associatedRewardsCount > 0) {
              const { error: rewardsError } = await supabase
                  .from('rewards')
                  .delete()
                  .eq('level_id', levelId);

              if (rewardsError) {
                  throw new Error(`Error al eliminar recompensas asociadas: ${rewardsError.message}`);
              }
          }

          const { error: levelError } = await supabase
              .from('referral_levels')
              .delete()
              .eq('id', levelId);

          if (levelError) throw levelError;

          showAlert('Nivel y sus recompensas (si las había) eliminados con éxito.', 'success');
          invalidate('referral_levels'); // <-- AÑADIDO
          fetchLevels();

      } catch (error) {
          console.error("Error en handleDelete:", error);
          showAlert(`Error al eliminar: ${error.message}`);
      }
  }, [showAlert, fetchLevels, invalidate]); // <-- Añadido a dependencias
  // --- FIN PASO C ---


  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalBox}>
        <button className={styles.closeButton} onClick={onClose}>×</button>
        <h2>Gestionar niveles de referidos</h2>

        {/* Formulario (sin cambios) */}
        <div className={styles.formSection}>
             <input
            type="text"
            placeholder="Nombre del nivel"
            value={formData.name}
            onChange={e => setFormData({ ...formData, name: e.target.value })}
          />
          <input
            type="number"
            placeholder="Referidos mínimos"
            value={formData.min_referrals}
            onChange={e => setFormData({ ...formData, min_referrals: e.target.value })}
          />
          {editingId ? (
            <>
              <button onClick={() => handleSave(editingId)}>Guardar</button>
              <button onClick={handleCancel}>Cancelar</button>
            </>
          ) : (
            <button onClick={handleCreate}>Crear nivel</button>
          )}
        </div>

        {/* Lista de Niveles (sin cambios) */}
        {loading ? <LoadingSpinner /> : (
          levels.length === 0 ? (
            <div className={styles.emptyState}>Aún no hay niveles creados.</div>
          ) : (
            levels.map(level => (
              <div key={level.id} className={styles.levelCard}>
                <div><b>{level.name}</b> — {level.min_referrals} referidos mínimos</div>
                <button onClick={() => handleEdit(level)}>Editar Nivel</button>
                <button onClick={() => handleDelete(level.id, level.name, level.rewards?.length || 0)}>
                    Eliminar Nivel
                </button>
                <LevelRewards levelId={level.id} />
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}