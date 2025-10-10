// src/pages/Referrals.jsx (ACTUALIZADO CON EDITOR DE RECOMPENSA)

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import styles from './Referrals.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ManageReferralLevelsModal from '../components/ManageReferralLevelsModal';
import EditReferralCountModal from '../components/EditReferralCountModal';

const TrophyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9 9h6l-3-7zM9 9H2l3 7h2M15 9h7l-3 7h-2M12 22l-3-3m3 3l3-3"/></svg>;
const UserPlusIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>;
const GiftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>;

const WelcomeRewardEditor = ({ showAlert, onUpdate }) => {
    // ... (estados existentes)
    const [reward, setReward] = useState({ enabled: true, message: '', discount_code: '' });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReward = async () => {
            const { data, error } = await supabase.from('settings').select('value').eq('key', 'welcome_reward').single();
            if (data) {
                setReward(data.value);
            }
            setLoading(false);
        };
        fetchReward();
    }, []);

    const handleSave = async () => {
        // --- 👇 LÓGICA DE GUARDADO ACTUALIZADA ---
        try {
            // Primero, busca el descuento por su código
            const { data: discount, error: findError } = await supabase
                .from('discounts')
                .select('id')
                .eq('code', reward.discount_code)
                .single();

            if (findError) {
                showAlert(`Error: El código de descuento "${reward.discount_code}" no existe. Por favor, créalo primero en la sección de Descuentos.`);
                return;
            }

            // Si existe, actualízalo para que requiera el estado de referido
            const { error: updateError } = await supabase
                .from('discounts')
                .update({ requires_referred_status: true, is_single_use: true }) // Lo forzamos a ser de un solo uso
                .eq('id', discount.id);
            
            if (updateError) throw updateError;

            // Finalmente, guarda la configuración del mensaje
            const { error: settingsError } = await supabase.from('settings').update({ value: reward }).eq('key', 'welcome_reward');
            if (settingsError) throw settingsError;

            showAlert('Recompensa de bienvenida actualizada. El código ahora es de un solo uso y solo para referidos.');
            onUpdate();

        } catch (error) {
            showAlert(`Error al guardar: ${error.message}`);
        }
    };

    if (loading) return <p>Cargando editor...</p>;

    return (
        <div className={styles.editorContainer}>
            <div className={styles.formGroup}>
                <label>Mensaje para el nuevo invitado:</label>
                <textarea
                    rows="4"
                    value={reward.message}
                    onChange={e => setReward({ ...reward, message: e.target.value })}
                    placeholder="Ej: ¡Bienvenido! Usa el código {CODE} para un descuento."
                />
                <small>Usa `&#123;CODE&#125;` donde quieras que aparezca el código.</small>
            </div>
            <div className={styles.formGroup}>
                <label>Código de descuento a aplicar:</label>
                <input
                    type="text"
                    value={reward.discount_code}
                    onChange={e => setReward({ ...reward, discount_code: e.target.value.toUpperCase() })}
                />
                <small>Este código debe existir en la sección "Descuentos" y será de un solo uso.</small>
            </div>
            <button onClick={handleSave} className="admin-button-primary">Guardar y Aplicar Reglas</button>
        </div>
    );
};


export default function Referrals() {
    const { showAlert } = useAlert();
    const [loading, setLoading] = useState(true);
    const [referralData, setReferralData] = useState([]);
    const [levels, setLevels] = useState([]);
    const [rewards, setRewards] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedCustomerId, setExpandedCustomerId] = useState(null);
    const [isLevelsModalOpen, setIsLevelsModalOpen] = useState(false);
    const [customerToEdit, setCustomerToEdit] = useState(null);

    const fetchData = useCallback(async () => {
        try {
            const { data: refData, error: refError } = await supabase.rpc('get_detailed_referral_info');
            if (refError) throw refError;
            const { data: levelsData, error: levelsError } = await supabase.from('referral_levels').select('*').order('min_referrals');
            if (levelsError) throw levelsError;
            const { data: rewardsData, error: rewardsError } = await supabase.from('rewards').select('*');
            if (rewardsError) throw rewardsError;
            setReferralData(refData);
            setLevels(levelsData);
            setRewards(rewardsData);
        } catch (error) {
            showAlert(`Error al cargar los datos: ${error.message}`);
        }
        setLoading(false);
    }, [showAlert]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const topReferrers = useMemo(() => referralData.filter(c => c.referral_count > 0).slice(0, 5), [referralData]);
    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return referralData;
        return referralData.filter(c => 
            c.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            c.referral_code.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [referralData, searchTerm]);

    const toggleDetails = (customerId) => setExpandedCustomerId(prev => prev === customerId ? null : customerId);

    if (loading) return <LoadingSpinner />;

    return (
        <>
            <div className={styles.container}>
                <h1><UserPlusIcon /> Sistema de Referidos</h1>
                <div className={styles.mainGrid}>
                    <div className={styles.sideColumn}>
                        <div className={styles.card}>
                            <div className={styles.cardHeader}>
                                <h3><TrophyIcon /> Niveles y Recompensas</h3>
                                <button onClick={() => setIsLevelsModalOpen(true)} className="admin-button-secondary">Gestionar</button>
                            </div>
                            <div className={styles.levelsContainer}>
                                {levels.length > 0 ? levels.map(level => (
                                     <div key={level.id} className={styles.levelCard}><h4>{level.name} ({level.min_referrals}+ refs)</h4></div>
                                )) : <p>Crea tu primer nivel.</p>}
                            </div>
                        </div>

                        <div className={styles.card}>
                            <h3><GiftIcon /> Recompensa de Bienvenida</h3>
                            <WelcomeRewardEditor showAlert={showAlert} onUpdate={fetchData} />
                        </div>
                        
                        <div className={styles.card}>
                            <h3>⭐ Top 5 Referidores</h3>
                            <ul className={styles.topList}>
                                {topReferrers.length > 0 ? topReferrers.map((customer, index) => (
                                    <li key={customer.customer_id}><span className={styles.rank}>{index + 1}</span><div className={styles.customerInfo}><span>{customer.customer_name}</span><small>{customer.level_name || 'Novato'}</small></div><span className={styles.refCount}>{customer.referral_count} refs</span></li>
                                )) : <p>Nadie ha referido aún.</p>}
                            </ul>
                        </div>
                    </div>

                    <div className={styles.mainColumn}>
                        <div className={styles.card}>
                            <h3>Todos los Clientes</h3>
                            <input type="text" placeholder="Buscar por nombre o código..." className={styles.searchInput} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                            <div className="table-wrapper">
                                <table className="products-table">
                                    <thead><tr><th>Cliente</th><th>Código</th><th>Referidos</th><th>Nivel</th><th>Acciones</th></tr></thead>
                                    <tbody>
                                        {filteredCustomers.map(customer => (
                                            <React.Fragment key={customer.customer_id}>
                                                <tr><td>{customer.customer_name}</td><td>{customer.referral_code}</td><td>{customer.referral_count}</td><td>{customer.level_name || 'Novato'}</td><td><div className={styles.actionsCell}><button onClick={() => setCustomerToEdit(customer)} className={styles.editButton}>Editar</button><button onClick={() => toggleDetails(customer.customer_id)} disabled={!customer.referred_customers} className={styles.viewButton}>{expandedCustomerId === customer.customer_id ? 'Ocultar' : 'Ver'}</button></div></td></tr>
                                                {expandedCustomerId === customer.customer_id && (
                                                    <tr className={styles.detailsRow}><td colSpan="5"><div className={styles.detailsContent}><h4>Clientes referidos por {customer.customer_name}:</h4>{customer.referred_customers?.length > 0 ? (<ul>{customer.referred_customers.map(ref => (<li key={ref.phone}><span>{ref.name} ({ref.phone})</span><small>Registrado: {new Date(ref.registered_at).toLocaleDateString()}</small></li>))}</ul>) : <p>Sin referidos aún.</p>}</div></td></tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <ManageReferralLevelsModal isOpen={isLevelsModalOpen} onClose={() => setIsLevelsModalOpen(false)} onUpdate={fetchData} levels={levels} rewards={rewards} />
            <EditReferralCountModal isOpen={!!customerToEdit} onClose={() => setCustomerToEdit(null)} onUpdate={fetchData} customer={customerToEdit} />
        </>
    );
}