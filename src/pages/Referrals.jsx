/* src/pages/Referrals.jsx (Migrado) */

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAlert } from '../context/AlertContext';
import styles from './Referrals.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ManageReferralLevelsModal from '../components/ManageReferralLevelsModal';
import EditReferralCountModal from '../components/EditReferralCountModal';
import { useAdminAuth } from '../context/AdminAuthContext';

// --- (PASO A) AÑADIR IMPORT ---
import { useReferralLevelsCache } from '../hooks/useReferralLevelsCache';
// --- FIN PASO A ---

// ==================== ICONOS MEMOIZADOS (Sin cambios) ====================
const TrophyIcon = memo(() => ( /* ... (código SVG) ... */ <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>));
TrophyIcon.displayName = 'TrophyIcon';
const UserPlusIcon = memo(() => ( /* ... (código SVG) ... */ <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><line x1="19" y1="8" x2="19" y2="14"></line><line x1="22" y1="11" x2="16" y2="11"></line></svg>));
UserPlusIcon.displayName = 'UserPlusIcon';
const GiftIcon = memo(() => ( /* ... (código SVG) ... */ <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 12 20 22 4 22 4 12"></polyline><rect x="2" y="7" width="20" height="5"></rect><line x1="12" y1="22" x2="12" y2="7"></line><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path></svg>));
GiftIcon.displayName = 'GiftIcon';

// ==================== COMPONENTE: WELCOME REWARD EDITOR (Sin cambios) ====================
const WelcomeRewardEditor = memo(({ showAlert, onUpdate }) => {
    // ... (código existente de WelcomeRewardEditor) ...
    const { hasPermission } = useAdminAuth();
    const canEdit = hasPermission('referidos.edit');

    const [reward, setReward] = useState({
        enabled: true,
        message: '',
        discount_code: ''
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        const fetchReward = async () => {
            try {
                const { data, error } = await supabase
                    .from('settings')
                    .select('value')
                    .eq('key', 'welcome_reward')
                    .single();

                if (error) throw error;
                if (data) setReward(data.value);
            } catch (error) {
                console.error('Error fetching reward:', error);
            } finally {
                setLoading(false);
            }
        };
        fetchReward();
    }, []);

    const handleSave = useCallback(async () => {
        if (!canEdit) return;

        setSaving(true);
        try {
            const { data: discount, error: findError } = await supabase
                .from('discounts')
                .select('id')
                .eq('code', reward.discount_code)
                .single();

            if (findError) {
                showAlert(`Error: El código "${reward.discount_code}" no existe. Créalo primero en Descuentos.`);
                return;
            }

            const { error: updateError } = await supabase
                .from('discounts')
                .update({
                    requires_referred_status: true,
                    is_single_use: true
                })
                .eq('id', discount.id);

            if (updateError) throw updateError;

            const { error: settingsError } = await supabase
                .from('settings')
                .update({ value: reward })
                .eq('key', 'welcome_reward');

            if (settingsError) throw settingsError;

            showAlert('Recompensa actualizada con éxito.', 'success');
            onUpdate();
        } catch (error) {
            showAlert(`Error: ${error.message}`);
        } finally {
            setSaving(false);
        }
    }, [canEdit, reward, showAlert, onUpdate]);

    if (loading) return <div className={styles.loadingEditor}>Cargando editor...</div>;

    return (
        <div className={styles.rewardEditor}>
            <h3><GiftIcon /> Recompensa de Bienvenida para Referidos</h3>
            <div className={styles.formGroup}>
                <label>
                    <input
                        type="checkbox"
                        checked={reward.enabled}
                        onChange={(e) => setReward(prev => ({ ...prev, enabled: e.target.checked }))}
                        disabled={!canEdit}
                    />
                    <span>Habilitar recompensa de bienvenida</span>
                </label>
            </div>
            {reward.enabled && (
                <>
                    <div className={styles.formGroup}>
                    <small>Usa " &#123;CODE&#125; " donde quieras que aparezca el código.</small>
                        <label htmlFor="message">Mensaje de Bienvenida</label>
                        <textarea
                            id="message"
                            rows="3"
                            value={reward.message}
                            onChange={(e) => setReward(prev => ({ ...prev, message: e.target.value }))}
                            placeholder="¡Gracias por unirte! Aquí está tu recompensa..."
                            disabled={!canEdit}
                        />
                    </div>
                    <div className={styles.formGroup}>
                        <label htmlFor="discount_code">Código de Descuento</label>
                        <input
                            id="discount_code"
                            type="text"
                            value={reward.discount_code}
                            onChange={(e) => setReward(prev => ({ ...prev, discount_code: e.target.value.toUpperCase() }))}
                            placeholder="BIENVENIDA10"
                            disabled={!canEdit}
                        />
                        <small>Este código debe existir en la sección de Descuentos</small>
                    </div>
                    {canEdit && (
                        <button
                            onClick={handleSave}
                            className={styles.saveButton}
                            disabled={saving}
                        >
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    )}
                </>
            )}
        </div>
    );
});
WelcomeRewardEditor.displayName = 'WelcomeRewardEditor';

// ==================== COMPONENTE: REFERRAL ROW (Sin cambios) ====================
const ReferralRow = memo(({ customer, onEdit, canEdit }) => {
    // ... (código existente de ReferralRow) ...
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <>
            <tr onClick={() => setIsExpanded(!isExpanded)} className={styles.clickableRow}>
                <td>{customer.customer_name}</td>
                <td>
                    <code className={styles.referralCode}>{customer.referral_code}</code>
                </td>
                <td>
                    <span className={styles.countBadge}>{customer.referral_count}</span>
                </td>
                <td>
                    <span className={styles.levelBadge}>{customer.level_name || 'Novato'}</span>
                </td>
                {canEdit && (
                    <td>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit(customer);
                            }}
                            className={styles.editButton}
                        >
                            ✏️ Editar
                        </button>
                    </td>
                )}
            </tr>

            {isExpanded && (
                <tr className={styles.expandedRow}>
                    <td colSpan={canEdit ? 5 : 4}>
                        <div className={styles.referredList}>
                            <h4>Clientes referidos por {customer.customer_name}:</h4>
                            {customer.referred_customers?.length > 0 ? (
                                <ul>
                                    {customer.referred_customers.map((referred, idx) => (
                                        <li key={idx}>
                                            {referred.name} ({referred.phone})
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className={styles.emptyState}>Sin referidos aún.</p>
                            )}
                        </div>
                    </td>
                </tr>
            )}
        </>
    );
}, (prevProps, nextProps) => {
    return (
        prevProps.customer.id === nextProps.customer.id &&
        prevProps.customer.referral_count === nextProps.customer.referral_count &&
        prevProps.customer.level_name === nextProps.customer.level_name &&
        prevProps.canEdit === nextProps.canEdit
    );
});
ReferralRow.displayName = 'ReferralRow';

// ==================== COMPONENTE PRINCIPAL ====================

export default function Referrals() {
    const { showAlert } = useAlert();
    const { hasPermission } = useAdminAuth();

    const [customersWithReferrals, setCustomersWithReferrals] = useState([]);
    
    // --- (PASO B) REEMPLAZAR ESTADO ---
    // const [referralLevels, setReferralLevels] = useState([]); // <-- Eliminado
    const { 
        data: referralLevelsData, 
        isLoading: loadingLevels, 
        invalidate: invalidateLevels 
    } = useReferralLevelsCache();
    // Corrección para evitar error en null.filter/.sort
    const referralLevels = useMemo(() => referralLevelsData || [], [referralLevelsData]);
    // --- FIN PASO B ---

    const [loading, setLoading] = useState(true);
    const [isLevelsModalOpen, setIsLevelsModalOpen] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const canView = hasPermission('referidos.view');
    const canEdit = hasPermission('referidos.edit');

    // --- (PASO C) ELIMINAR FETCH DE NIVELES ---
    const fetchData = useCallback(async () => {
        if (!canView) return;

        setLoading(true);
        try {
            // Solo fetchear clientes
            const customersRes = await supabase
                .from('customers')
                .select(`
                    id,
                    name,
                    phone,
                    referral_code,
                    referral_count,
                    referrer_id
                `)
                .not('referral_code', 'is', null)
                .order('referral_count', { ascending: false });
            
            // levelsRes (eliminado)

            if (customersRes.error) throw customersRes.error;
            // levelsRes.error (eliminado)

            const customers = customersRes.data || [];
            const levels = referralLevels; // <-- Obtener niveles del hook
            // setReferralLevels(levels); // <-- Eliminado

            // Fetch referidos para cada cliente
            const customersWithDetails = await Promise.all(
                customers.map(async (customer) => {
                    const { data: referred } = await supabase
                        .from('customers')
                        .select('name, phone')
                        .eq('referrer_id', customer.id);

                    const level = levels
                        .filter(l => customer.referral_count >= l.min_referrals)
                        .sort((a, b) => b.min_referrals - a.min_referrals)[0] || { name: 'Novato' };

                    return {
                        ...customer,
                        customer_name: customer.name,
                        level_name: level.name,
                        referred_customers: referred || []
                    };
                })
            );

            setCustomersWithReferrals(customersWithDetails);
            // setReferralLevels(levels); // <-- Ya estaba eliminado antes, pero lo confirmo

        } catch (error) {
            console.error('Fetch error:', error);
            showAlert(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    }, [canView, showAlert, referralLevels]); // <-- Añadir referralLevels como dependencia
    // --- FIN PASO C ---

    useEffect(() => {
        // Solo fetchear si los niveles ya cargaron (o si referralLevels es [])
        if (!loadingLevels) {
            fetchData();
        }
    }, [fetchData, loadingLevels]); // Añadir loadingLevels

    // --- (PASO D) ACTUALIZAR LISTENER DE REALTIME ---
    useEffect(() => {
        if (!canView) return;

        const channel = supabase
            .channel('referrals-changes')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'customers'
            }, () => fetchData()) // <-- Esto se mantiene
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'referral_levels'
            }, () => {
                console.log('[Referrals] Cambio en niveles detectado, invalidando caché.');
                invalidateLevels(); // <-- Solo invalida el caché
            })
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [canView, fetchData, invalidateLevels]); // <-- Añadir invalidateLevels
    // --- FIN PASO D ---

    // ... (filteredCustomers, stats, handleEditCustomer, handleCloseEditModal sin cambios) ...
    const filteredCustomers = useMemo(() => {
        if (!searchTerm) return customersWithReferrals;
        const lowerSearch = searchTerm.toLowerCase();
        return customersWithReferrals.filter(c =>
            c.customer_name.toLowerCase().includes(lowerSearch) ||
            c.referral_code.toLowerCase().includes(lowerSearch) ||
            c.phone.includes(searchTerm)
        );
    }, [customersWithReferrals, searchTerm]);

    const stats = useMemo(() => {
        const totalReferrers = customersWithReferrals.length;
        const totalReferrals = customersWithReferrals.reduce((sum, c) => sum + c.referral_count, 0);
        const avgReferralsPerCustomer = totalReferrers > 0
            ? (totalReferrals / totalReferrers).toFixed(1)
            : 0;
        return { totalReferrers, totalReferrals, avgReferralsPerCustomer };
    }, [customersWithReferrals]);

    const handleEditCustomer = useCallback((customer) => {
        setEditingCustomer(customer);
    }, []);

    const handleCloseEditModal = useCallback(() => {
        setEditingCustomer(null);
        fetchData();
    }, [fetchData]);


    // --- (PASO E) AJUSTAR LOADING ---
    if (loading || loadingLevels) return <LoadingSpinner />;
    // --- FIN PASO E ---

    if (!canView) {
        return (
            <div className={styles.container}>
                <div className={styles.noPermission}>
                    <p>No tienes permisos para ver esta sección.</p>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h1><TrophyIcon /> Sistema de Referidos</h1>
                    <p className={styles.subtitle}>
                        {stats.totalReferrers} clientes refiriendo • {stats.totalReferrals} referidos totales •
                        Promedio {stats.avgReferralsPerCustomer} referidos/cliente
                    </p>
                </div>
                {canEdit && (
                    <button
                        className={styles.manageLevelsButton}
                        onClick={() => setIsLevelsModalOpen(true)}
                    >
                        <TrophyIcon /> Gestionar Niveles
                    </button>
                )}
            </div>

            {/* Welcome Reward Editor */}
            <WelcomeRewardEditor showAlert={showAlert} onUpdate={fetchData} />

            {/* Niveles de Referido */}
            <div className={styles.levelsSection}>
                <h2>Niveles de Referido</h2>
                {referralLevels.length === 0 ? ( // <-- 'referralLevels' ahora viene del hook
                    <div className={styles.emptyState}>
                        <p>No hay niveles configurados.</p>
                        {canEdit && (
                            <button
                                onClick={() => setIsLevelsModalOpen(true)}
                                className={styles.createFirstButton}
                            >
                                Crea tu primer nivel
                            </button>
                        )}
                    </div>
                ) : (
                    <div className={styles.levelsGrid}>
                        {referralLevels.map(level => ( // <-- 'referralLevels' del hook
                            <div key={level.id} className={styles.levelCard}>
                                <h3>{level.name}</h3>
                                <p className={styles.levelRequirement}>
                                    {level.min_referrals} referidos requeridos
                                </p>
                                {level.reward_description && (
                                    <p className={styles.levelReward}>
                                        🎁 {level.reward_description}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Búsqueda */}
            <div className={styles.searchBar}>
                <input
                    type="text"
                    placeholder="Buscar por nombre, código o teléfono..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className={styles.searchInput}
                />
            </div>

            {/* Tabla de Clientes con Referidos */}
            <div className={styles.tableSection}>
                <h2><UserPlusIcon /> Clientes con Referidos</h2>

                {filteredCustomers.length === 0 ? (
                    <div className={styles.emptyState}>
                        <p>Nadie ha referido aún.</p>
                    </div>
                ) : (
                    <div className={styles.tableWrapper}>
                        <table className={styles.referralsTable}>
                            <thead>
                                <tr>
                                    <th>Cliente</th>
                                    <th>Código</th>
                                    <th>Referidos</th>
                                    <th>Nivel</th>
                                    {canEdit && <th>Acciones</th>}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredCustomers.map(customer => (
                                    <ReferralRow
                                        key={customer.id}
                                        customer={customer}
                                        onEdit={handleEditCustomer}
                                        canEdit={canEdit}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modales */}
            {isLevelsModalOpen && (
                <ManageReferralLevelsModal
                    isOpen={isLevelsModalOpen}
                    onClose={() => {
                        setIsLevelsModalOpen(false);
                        // No es necesario fetchData(), el listener invalidará el hook
                        // y el hook se actualizará solo.
                    }}
                />
            )}

            {editingCustomer && (
                <EditReferralCountModal
                    isOpen={!!editingCustomer}
                    onClose={handleCloseEditModal}
                    customer={editingCustomer}
                />
            )}
        </div>
    );
}