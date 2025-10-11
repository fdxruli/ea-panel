// src/components/ManageReferralLevelsModal.jsx (ACTUALIZADO)

import React, { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './ManageReferralLevelsModal.module.css';
import { useAlert } from '../context/AlertContext';
import DOMPurify from 'dompurify';

const RewardItem = ({ reward, onDelete }) => (
    <div className={styles.rewardItem}>
        <div className={styles.rewardInfo}>
            <span>🎁 {reward.description}</span>
            {reward.reward_code && <small>Código: <code>{reward.reward_code}</code></small>}
        </div>
        <button onClick={() => onDelete(reward.id)} className={styles.deleteRewardButton}>×</button>
    </div>
);

const LevelItem = ({ level, rewards, onDeleteLevel, onUpdate }) => {
    const { showAlert } = useAlert();
    const [description, setDescription] = useState('');
    const [rewardCode, setRewardCode] = useState(''); // <-- Nuevo estado para el código

    const handleAddReward = async () => {
        if (!description.trim()) {
            showAlert('La descripción de la recompensa no puede estar vacía.');
            return;
        }
        const { error } = await supabase.from('rewards').insert({
            level_id: level.id,
            description: DOMPurify.sanitize(description),
            reward_code: DOMPurify.sanitize(rewardCode.toUpperCase()) || null // <-- Guardar el código
        });
        if (error) {
            showAlert(`Error al añadir recompensa: ${error.message}`);
        } else {
            setDescription('');
            setRewardCode(''); // <-- Limpiar el campo
            onUpdate();
        }
    };

    const handleDeleteReward = async (rewardId) => {
        const { error } = await supabase.from('rewards').delete().eq('id', rewardId);
        if (error) {
            showAlert(`Error al eliminar recompensa: ${error.message}`);
        } else {
            onUpdate();
        }
    };

    return (
        <div className={styles.levelItem}>
            <div className={styles.levelHeader}>
                <span><strong>{level.name}</strong> (desde {level.min_referrals} referidos)</span>
                <button onClick={() => onDeleteLevel(level.id)} className={styles.deleteButton}>Eliminar Nivel</button>
            </div>
            <div className={styles.rewardsList}>
                {rewards.map(reward => (
                    <RewardItem key={reward.id} reward={reward} onDelete={handleDeleteReward} />
                ))}
            </div>
            <div className={styles.addRewardForm}>
                <input
                    type="text"
                    placeholder="Descripción pública (ej: 10% Descuento)"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Código (ej: PROMO10)"
                    value={rewardCode}
                    onChange={e => setRewardCode(e.target.value)}
                />
                <button onClick={handleAddReward}>Añadir</button>
            </div>
        </div>
    );
};

// ... (El resto del componente ManageReferralLevelsModal no cambia)
export default function ManageReferralLevelsModal({ levels, rewards, isOpen, onClose, onUpdate }) {
    const { showAlert } = useAlert();
    const [levelName, setLevelName] = useState('');
    const [minReferrals, setMinReferrals] = useState(0);

    const handleAddLevel = async () => {
        if (!levelName || minReferrals < 0) {
            showAlert('El nombre y un número de referidos válido son necesarios.');
            return;
        }
        const { error } = await supabase.from('referral_levels').insert({ name: levelName, min_referrals: minReferrals });
        if (error) { showAlert(`Error: ${error.message}`); }
        else { showAlert('Nivel creado con éxito.'); setLevelName(''); setMinReferrals(0); onUpdate(); }
    };

    const handleDeleteLevel = async (levelId) => {
        if (!window.confirm('¿Seguro que quieres eliminar este nivel y todas sus recompensas asociadas?')) return;
        const { error } = await supabase.rpc('delete_referral_level', { level_id_to_delete: levelId });
        if (error) { showAlert(`Error: ${error.message}`); }
        else { showAlert('Nivel eliminado.'); onUpdate(); }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <button onClick={onClose} className={styles.closeButton}>×</button>
                <h2>Gestionar Niveles y Recompensas</h2>
                
                <div className={styles.formSection}>
                    <h3>Crear Nuevo Nivel</h3>
                    <div className={styles.formGrid}>
                        <input type="text" placeholder="Nombre del nivel (Ej: Experto)" value={levelName} onChange={e => setLevelName(e.target.value)} />
                        <input type="number" placeholder="Referidos necesarios" value={minReferrals} onChange={e => setMinReferrals(parseInt(e.target.value) || 0)} />
                        <button onClick={handleAddLevel} className={styles.addButton}>Añadir Nivel</button>
                    </div>
                </div>

                <div className={styles.listSection}>
                    <h3>Niveles Actuales</h3>
                    {levels.length > 0 ? (
                        levels.map(level => (
                            <LevelItem
                                key={level.id}
                                level={level}
                                rewards={rewards.filter(r => r.level_id === level.id)}
                                onDeleteLevel={handleDeleteLevel}
                                onUpdate={onUpdate}
                            />
                        ))
                    ) : <p>Aún no hay niveles creados.</p>}
                </div>
            </div>
        </div>
    );
}