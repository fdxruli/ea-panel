import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageReferralLevelsModal.module.css';
import { useAlert } from '../context/AlertContext';
import DOMPurify from 'dompurify';
import LoadingSpinner from './LoadingSpinner';

const LevelRewards = ({ levelId }) => {
  const { showAlert } = useAlert();
  const [rewards, setRewards] = useState([]);
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
    if (!description.trim()) {
      showAlert('La descripción es obligatoria.');
      return;
    }
    if (!rewardCode.trim()) {
      showAlert('El código de promoción es obligatorio.');
      return;
    }
    const { error } = await supabase
      .from('rewards')
      .insert({
        level_id: levelId,
        description: DOMPurify.sanitize(description),
        reward_code: DOMPurify.sanitize(rewardCode.toUpperCase()),
      });
    if (error) {
      showAlert('Hubo un error al añadir la recompensa: ' + error.message);
      return;
    }
    showAlert('Recompensa añadida con éxito.', 'success');
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
      <div className={styles.addRewardForm}>
        <input
          type="text"
          placeholder="Descripción de la recompensa"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <input
          type="text"
          placeholder="Código de promoción"
          value={rewardCode}
          onChange={(e) => setRewardCode(e.target.value)}
        />
        <button onClick={handleAddReward}>
          Añadir recompensa
        </button>
      </div>
      {loadingRewards ? (
        <LoadingSpinner />
      ) : (
        <ul>
          {rewards.map((reward) => (
            <li key={reward.id}>
              {reward.description} | <b>{reward.reward_code}</b>
              <button onClick={() => handleDeleteReward(reward.id)} style={{ marginLeft: 8 }}>
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default function ManageReferralLevelsModal({ isOpen, onClose }) {
  const { showAlert } = useAlert();
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({ name: '', min_referrals: '' });

  const fetchLevels = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('referral_levels')
        .select('*')
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
      handleCancel();
      fetchLevels();
    } catch (error) {
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
      showAlert('El número de referidos debe ser válido.');
      return;
    }
    try {
      const { error } = await supabase
        .from('referral_levels')
        .insert({ name: cleanName, min_referrals: minReferrals });
      if (error) throw error;
      showAlert('Nivel creado con éxito.', 'success');
      setFormData({ name: '', min_referrals: '' });
      fetchLevels();
    } catch (error) {
      showAlert(`Error: ${error.message}`);
    }
  }, [formData, showAlert, fetchLevels]);

  const handleDelete = useCallback(async (levelId) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este nivel?')) return;
    try {
      const { error } = await supabase
        .from('referral_levels')
        .delete()
        .eq('id', levelId);
      if (error) throw error;
      showAlert('Nivel eliminado con éxito.', 'success');
      fetchLevels();
    } catch (error) {
      showAlert(`Error: ${error.message}`);
    }
  }, [showAlert, fetchLevels]);

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalBox}>
        <button className={styles.closeButton} onClick={onClose}>
          ×
        </button>
        <h2>Gestionar niveles de referidos</h2>
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

        {loading ? <LoadingSpinner /> : (
          levels.length === 0 ? (
            <p>Aún no hay niveles creados.</p>
          ) : (
            levels.map(level => (
              <div key={level.id} className={styles.levelCard}>
                <div>
                  <b>{level.name}</b> — {level.min_referrals} referidos mínimos
                </div>
                <button onClick={() => handleEdit(level)}>Editar</button>
                <button onClick={() => handleDelete(level.id)}>Eliminar</button>
                {/* Sección de recompensas */}
                <LevelRewards levelId={level.id} />
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
}
