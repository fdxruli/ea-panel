import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSettings } from '../context/SettingsContext';
import { useAlert } from '../context/AlertContext';
import LoadingSpinner from '../components/LoadingSpinner';
import styles from './Settings.module.css';
import { useAdminAuth } from '../context/AdminAuthContext';

// Componente ToggleSwitch (sin cambios)
const ToggleSwitch = memo(({ label, checked, onChange, disabled }) => (
  <div className={styles.toggleItem}>
    <span className={styles.toggleLabel}>{label}</span>
    <label className={styles.switch}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className={styles.switchInput}
      />
      <span className={styles.slider}></span>
    </label>
  </div>
));

ToggleSwitch.displayName = 'ToggleSwitch';

// OPTIMIZACIÓN: Componente de visibilidad con su propio botón
const ClientVisibilitySection = memo(({ visibility, onToggle, onSave, disabled, saving }) => {
  const sections = useMemo(() => [
    { key: 'my_orders_page', label: 'Página "Mis Pedidos"' },
    { key: 'my_profile_page', label: 'Página "Mi Perfil"' },
    { key: 'my_stuff_page', label: 'Página "Mis Cosas"' },
    { key: 'profile_my_data', label: 'Sección "Mis Datos" (Perfil)' },
    { key: 'profile_my_addresses', label: 'Sección "Mis Direcciones" (Perfil)' },
    { key: 'stuff_referrals', label: 'Sección "Referidos" (Mis Cosas)' },
    { key: 'stuff_rewards', label: 'Sección "Recompensas" (Mis Cosas)' },
    { key: 'stuff_favorites', label: 'Sección "Favoritos" (Mis Cosas)' },
    { key: 'stuff_reviews', label: 'Sección "Reseñas" (Mis Cosas)' }
  ], []);

  return (
    <div className={styles.section}>
      <h2>Visibilidad del Cliente</h2>
      <p className={styles.sectionDescription}>
        Controla qué secciones y componentes pueden ver los clientes.
      </p>
      <div className={styles.togglesGrid}>
        {sections.map(section => (
          <ToggleSwitch
            key={section.key}
            label={section.label}
            checked={visibility[section.key] ?? true}
            onChange={() => onToggle(section.key)}
            disabled={disabled || saving}
          />
        ))}
      </div>
      
      {/* Botón de guardado dentro de la sección */}
      {!disabled && (
        <div className={styles.sectionFooter}>
          <button
            onClick={onSave}
            disabled={saving}
            className={styles.saveButton}
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      )}
    </div>
  );
});

ClientVisibilitySection.displayName = 'ClientVisibilitySection';

// OPTIMIZACIÓN: Componente de modo mantenimiento con su propio botón
const MaintenanceModeSection = memo(({ 
  maintenanceMode, 
  onToggle, 
  onMessageChange,
  onSave,
  disabled,
  saving
}) => (
  <div className={styles.section}>
    <h2>Modo Mantenimiento</h2>
    <p className={styles.sectionDescription}>
      Activa el modo mantenimiento para mostrar un mensaje a los clientes cuando
      el sitio no esté disponible.
    </p>
    
    <ToggleSwitch
      label="Activar Modo Mantenimiento"
      checked={maintenanceMode.enabled}
      onChange={onToggle}
      disabled={disabled || saving}
    />

    {maintenanceMode.enabled && (
      <div className={styles.messageBox}>
        <label htmlFor="maintenanceMessage" className={styles.messageLabel}>
          Mensaje de Mantenimiento:
        </label>
        <textarea
          id="maintenanceMessage"
          value={maintenanceMode.message}
          onChange={onMessageChange}
          disabled={disabled || saving}
          className={styles.messageTextarea}
          rows={4}
          placeholder="Escribe el mensaje que verán los clientes..."
        />
      </div>
    )}
    
    {/* Botón de guardado dentro de la sección */}
    {!disabled && (
      <div className={styles.sectionFooter}>
        <button
          onClick={onSave}
          disabled={saving}
          className={styles.saveButton}
        >
          {saving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>
    )}
  </div>
));

MaintenanceModeSection.displayName = 'MaintenanceModeSection';

export default function Settings() {
  const { showAlert } = useAlert();
  const { hasPermission } = useAdminAuth();
  const { refetch: refreshSettings } = useSettings();
  
  const [loading, setLoading] = useState(true);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [savingVisibility, setSavingVisibility] = useState(false);
  
  const [maintenanceMode, setMaintenanceMode] = useState({
    enabled: false,
    message: 'Estamos realizando mejoras en el sitio. Volveremos pronto.'
  });
  
  const [clientVisibility, setClientVisibility] = useState({
    my_orders_page: true,
    my_profile_page: true,
    my_stuff_page: true,
    profile_my_data: true,
    profile_my_addresses: true,
    stuff_referrals: true,
    stuff_rewards: true,
    stuff_favorites: true,
    stuff_reviews: true
  });

  const canEdit = useMemo(
    () => hasPermission('configuracion.edit'),
    [hasPermission]
  );

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const [maintenanceResult, visibilityResult] = await Promise.all([
        supabase
          .from('settings')
          .select('value')
          .eq('key', 'maintenance_mode')
          .single(),
        supabase
          .from('settings')
          .select('value')
          .eq('key', 'client_visibility')
          .single()
      ]);

      if (maintenanceResult.error) throw maintenanceResult.error;
      if (visibilityResult.error) throw visibilityResult.error;

      setMaintenanceMode(maintenanceResult.data.value);
      setClientVisibility(visibilityResult.data.value);
    } catch (error) {
      console.error('Error fetching settings:', error);
      showAlert(`Error al cargar configuración: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleMaintenanceToggle = useCallback(() => {
    setMaintenanceMode(prev => ({
      ...prev,
      enabled: !prev.enabled
    }));
  }, []);

  const handleMessageChange = useCallback((e) => {
    setMaintenanceMode(prev => ({
      ...prev,
      message: e.target.value
    }));
  }, []);

  const handleVisibilityToggle = useCallback((key) => {
    setClientVisibility(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  // OPTIMIZACIÓN: Guardar solo modo mantenimiento
  const handleSaveMaintenance = useCallback(async () => {
    if (!canEdit) return;

    setSavingMaintenance(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update({ value: maintenanceMode })
        .eq('key', 'maintenance_mode');

      if (error) throw error;

      showAlert('Modo mantenimiento guardado exitosamente.');
      refreshSettings();
    } catch (error) {
      showAlert(`Error al guardar modo mantenimiento: ${error.message}`);
    } finally {
      setSavingMaintenance(false);
    }
  }, [maintenanceMode, canEdit, refreshSettings, showAlert]);

  // OPTIMIZACIÓN: Guardar solo visibilidad del cliente
  const handleSaveVisibility = useCallback(async () => {
    if (!canEdit) return;

    setSavingVisibility(true);
    try {
      const { error } = await supabase
        .from('settings')
        .update({ value: clientVisibility })
        .eq('key', 'client_visibility');

      if (error) throw error;

      showAlert('Visibilidad del cliente guardada exitosamente.');
      refreshSettings();
    } catch (error) {
      showAlert(`Error al guardar visibilidad: ${error.message}`);
    } finally {
      setSavingVisibility(false);
    }
  }, [clientVisibility, canEdit, refreshSettings, showAlert]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1>Configuración General</h1>
          <p className={styles.headerDescription}>
            Administra la configuración global de la aplicación del cliente.
          </p>
        </div>
      </div>

      {!canEdit && (
        <div className={styles.alertBanner}>
          <span className={styles.alertIcon}>ℹ️</span>
          <span>Solo tienes permisos de lectura. No puedes modificar la configuración.</span>
        </div>
      )}

      <div className={styles.sectionsContainer}>
        <MaintenanceModeSection
          maintenanceMode={maintenanceMode}
          onToggle={handleMaintenanceToggle}
          onMessageChange={handleMessageChange}
          onSave={handleSaveMaintenance}
          disabled={!canEdit}
          saving={savingMaintenance}
        />

        <ClientVisibilitySection
          visibility={clientVisibility}
          onToggle={handleVisibilityToggle}
          onSave={handleSaveVisibility}
          disabled={!canEdit}
          saving={savingVisibility}
        />
      </div>
    </div>
  );
}
