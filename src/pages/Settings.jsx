import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSettings } from '../context/SettingsContext'; // Asegúrate que la ruta sea correcta
import { useAlert } from '../context/AlertContext';
import LoadingSpinner from '../components/LoadingSpinner';
import styles from './Settings.module.css'; // Crearemos este archivo
import { useAdminAuth } from '../context/AdminAuthContext';

// Componente reutilizable para los toggles
const ToggleSwitch = ({ label, checked, onChange, disabled }) => (
    <div className={styles.toggleControl}>
        <label htmlFor={`toggle-${label.replace(/\s+/g, '-')}`}>{label}</label>
        <label className={styles.switch}>
            <input
                id={`toggle-${label.replace(/\s+/g, '-')}`}
                type="checkbox"
                checked={checked}
                onChange={onChange}
                disabled={disabled}
            />
            <span className={styles.slider}></span>
        </label>
    </div>
);

export default function Settings() {
    const { showAlert } = useAlert();
    const { settings, loading: settingsLoading, refetch: refetchSettings } = useSettings(); // Usar el context existente
    const { hasPermission } = useAdminAuth();

    // Estados locales para los valores de configuración
    const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
    const [maintenanceMessage, setMaintenanceMessage] = useState('');
    const [clientVisibility, setClientVisibility] = useState({});

    const [loading, setLoading] = useState(true);
    const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
    const [isSavingVisibility, setIsSavingVisibility] = useState(false);

    const canEdit = hasPermission('configuracion.edit'); // Usaremos 'configuracion' como clave

    // Cargar configuración inicial desde el contexto
    useEffect(() => {
        if (!settingsLoading) {
            const maintenanceMode = settings['maintenance_mode'] || { enabled: false, message: '' };
            const visibility = settings['client_visibility'] || {}; // Usar objeto vacío como fallback

            setMaintenanceEnabled(maintenanceMode.enabled);
            setMaintenanceMessage(maintenanceMode.message);
            setClientVisibility(visibility);
            setLoading(false);
        }
    }, [settingsLoading, settings]);

    // Guardar configuración de Modo Mantenimiento
    const handleSaveMaintenance = async () => {
        if (!canEdit) return;
        setIsSavingMaintenance(true);
        const newValue = { enabled: maintenanceEnabled, message: maintenanceMessage };
        const { error } = await supabase
            .from('settings')
            .update({ value: newValue })
            .eq('key', 'maintenance_mode');

        setIsSavingMaintenance(false);
        if (error) {
            showAlert(`Error al guardar modo mantenimiento: ${error.message}`);
        } else {
            showAlert('Modo mantenimiento actualizado.');
            refetchSettings(); // Refrescar el contexto global
        }
    };

    // Guardar configuración de Visibilidad
    const handleVisibilityChange = (key, value) => {
         if (!canEdit) return;
        setClientVisibility(prev => ({ ...prev, [key]: value }));
    };

    const handleSaveVisibility = async () => {
        if (!canEdit) return;
        setIsSavingVisibility(true);
        const { error } = await supabase
            .from('settings')
            .update({ value: clientVisibility })
            .eq('key', 'client_visibility');

        setIsSavingVisibility(false);
        if (error) {
            showAlert(`Error al guardar la visibilidad: ${error.message}`);
        } else {
            showAlert('Configuración de visibilidad actualizada.');
            refetchSettings(); // Refrescar el contexto global
        }
    };


    if (loading || settingsLoading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <h1>Configuración General</h1>

            {/* Card para Modo Mantenimiento */}
            <div className={styles.card}>
                <h2>Modo Mantenimiento</h2>
                <ToggleSwitch
                    label={maintenanceEnabled ? 'Sitio CERRADO para clientes' : 'Sitio ABIERTO para clientes'}
                    checked={maintenanceEnabled}
                    onChange={(e) => canEdit && setMaintenanceEnabled(e.target.checked)}
                    disabled={!canEdit || isSavingMaintenance}
                />
                <div className={styles.messageControl}>
                    <label htmlFor="maintenance-message">Mensaje a mostrar:</label>
                    <textarea
                        id="maintenance-message"
                        rows="3"
                        value={maintenanceMessage}
                        onChange={(e) => canEdit && setMaintenanceMessage(e.target.value)}
                        disabled={!canEdit || isSavingMaintenance}
                    />
                </div>
                 {canEdit && <button onClick={handleSaveMaintenance} disabled={isSavingMaintenance} className="admin-button-primary">
                    {isSavingMaintenance ? 'Guardando...' : 'Guardar Modo Mantenimiento'}
                </button>}
            </div>

            {/* Card para Visibilidad de Secciones Cliente */}
            <div className={styles.card}>
                <h2>Visibilidad App Cliente</h2>
                <p>Controla qué secciones y componentes pueden ver los clientes.</p>
                <div className={styles.visibilityGrid}>
                    {/* Páginas Principales */}
                    <ToggleSwitch label="Página: Mis Pedidos" checked={clientVisibility.my_orders_page ?? true} onChange={(e) => handleVisibilityChange('my_orders_page', e.target.checked)} disabled={!canEdit || isSavingVisibility} />
                    <ToggleSwitch label="Página: Mi Perfil" checked={clientVisibility.my_profile_page ?? true} onChange={(e) => handleVisibilityChange('my_profile_page', e.target.checked)} disabled={!canEdit || isSavingVisibility} />
                    <ToggleSwitch label="Página: Mi Actividad" checked={clientVisibility.my_stuff_page ?? true} onChange={(e) => handleVisibilityChange('my_stuff_page', e.target.checked)} disabled={!canEdit || isSavingVisibility}/>

                    {/* Componentes Dentro de Mi Perfil */}
                    <h3 className={styles.subHeading}>Dentro de "Mi Perfil":</h3>
                    <ToggleSwitch label="Sección: Mis Datos" checked={clientVisibility.profile_my_data ?? true} onChange={(e) => handleVisibilityChange('profile_my_data', e.target.checked)} disabled={!canEdit || isSavingVisibility || !clientVisibility.my_profile_page}/>
                    <ToggleSwitch label="Sección: Mis Direcciones" checked={clientVisibility.profile_my_addresses ?? true} onChange={(e) => handleVisibilityChange('profile_my_addresses', e.target.checked)} disabled={!canEdit || isSavingVisibility || !clientVisibility.my_profile_page}/>

                    {/* Componentes Dentro de Mi Actividad */}
                     <h3 className={styles.subHeading}>Dentro de "Mi Actividad":</h3>
                    <ToggleSwitch label="Sección: Invita y Gana (Referidos)" checked={clientVisibility.stuff_referrals ?? true} onChange={(e) => handleVisibilityChange('stuff_referrals', e.target.checked)} disabled={!canEdit || isSavingVisibility || !clientVisibility.my_stuff_page}/>
                    <ToggleSwitch label="Sección: Mis Recompensas" checked={clientVisibility.stuff_rewards ?? true} onChange={(e) => handleVisibilityChange('stuff_rewards', e.target.checked)} disabled={!canEdit || isSavingVisibility || !clientVisibility.my_stuff_page}/>
                    <ToggleSwitch label="Sección: Mis Favoritos" checked={clientVisibility.stuff_favorites ?? true} onChange={(e) => handleVisibilityChange('stuff_favorites', e.target.checked)} disabled={!canEdit || isSavingVisibility || !clientVisibility.my_stuff_page}/>
                    <ToggleSwitch label="Sección: Mis Reseñas" checked={clientVisibility.stuff_reviews ?? true} onChange={(e) => handleVisibilityChange('stuff_reviews', e.target.checked)} disabled={!canEdit || isSavingVisibility || !clientVisibility.my_stuff_page}/>
                </div>
                 {canEdit && <button onClick={handleSaveVisibility} disabled={isSavingVisibility} className="admin-button-primary">
                     {isSavingVisibility ? 'Guardando...' : 'Guardar Configuración de Visibilidad'}
                </button>}
            </div>
        </div>
    );
}