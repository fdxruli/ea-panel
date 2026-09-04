import React, { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import DeviceManager from '../common/DeviceManager';
import { Info, LockKeyhole } from 'lucide-react';

const BUSINESS_RUBROS = [
    { id: 'food_service', label: 'Restaurante / Cocina' },
    { id: 'abarrotes', label: 'Abarrotes' },
    { id: 'farmacia', label: 'Farmacia' },
    { id: 'verduleria/fruteria', label: 'Frutería / Verdulería' },
    { id: 'apparel', label: 'Ropa / Calzado' },
    { id: 'hardware', label: 'Ferretería' },
];

export default function LicenseSettings() {
    const companyProfile = useAppStore((state) => state.companyProfile);
    const updateCompanyProfile = useAppStore((state) => state.updateCompanyProfile);
    const licenseDetails = useAppStore((state) => state.licenseDetails);
    const logout = useAppStore((state) => state.logout);

    const [businessType, setBusinessType] = useState([]);

    // --- LÓGICA DINÁMICA DE LICENCIA ---
    const licenseFeatures = licenseDetails?.features || {};
    const maxRubrosAllowed = licenseFeatures.max_rubros || 1;
    const allowedRubrosList = licenseFeatures.allowed_rubros || ['*'];
    const isAllAllowed = allowedRubrosList.includes('*');

    useEffect(() => {
        if (companyProfile) {
            let types = companyProfile.business_type || [];
            if (typeof types === 'string') types = types.split(',').map(s => s.trim());
            setBusinessType(types);
        }
    }, [companyProfile]);

    // --- HANDLER CON BLOQUEO ESTRICTO (Recuperado del original) ---
    const handleRubroToggle = async (rubroId) => {
        // 1. Validar si el rubro está permitido específicamente por la licencia
        if (!isAllAllowed && !allowedRubrosList.includes(rubroId)) {
            alert("Tu licencia actual no permite seleccionar este rubro.");
            return;
        }

        // 2. BLOQUEO ESTRICTO PARA TRIAL (Max 1)
        // Si la licencia solo permite 1 rubro Y ya tenemos uno seleccionado...
        if (maxRubrosAllowed === 1 && businessType.length > 0) {
            // Si intenta tocar el que ya tiene seleccionado (intentar quitarlo)
            if (businessType.includes(rubroId)) {
                alert("El rubro está bloqueado por tu licencia de prueba. No puedes deseleccionarlo.");
            } else {
                // Si intenta tocar otro (intentar cambiar)
                alert("Tu licencia de prueba está vinculada al rubro seleccionado inicialmente. Contáctanos para cambiarlo.");
            }
            return; // Detenemos aquí. No se permite cambio.
        }

        // 3. Comportamiento normal (Multirubro o primera selección)
        let newTypes = [];
        if (businessType.includes(rubroId)) {
            newTypes = businessType.filter(id => id !== rubroId);
        } else {
            if (businessType.length >= maxRubrosAllowed) {
                alert(`Has alcanzado el límite de ${maxRubrosAllowed} rubros permitidos por tu licencia.`);
                return;
            }
            newTypes = [...businessType, rubroId];
        }

        setBusinessType(newTypes);

        // Guardar automáticamente en el perfil
        if (companyProfile) {
            await updateCompanyProfile({ ...companyProfile, business_type: newTypes });
        }
    };

    const renderLicenseInfo = () => {
        if (!licenseDetails || !licenseDetails.valid) return <p>No hay licencia activa.</p>;

        return (
            <div className="license-info-container">
                <div className="license-info">
                    <div className="license-detail">
                        <span className="license-label">Producto:</span>
                        <span className="license-value">{licenseDetails.product_name || 'N/A'}</span>
                    </div>
                    <div className="license-detail">
                        <span className="license-label">Estado:</span>
                        {/* CORRECCIÓN: Usar el estado real dinámico en lugar de texto fijo */}
                        <span className={
                            licenseDetails.status === 'active' ? 'license-status-active' :
                                licenseDetails.status === 'grace_period' ? 'license-status-pending' :
                                    'license-status-expired'
                        }>
                            {licenseDetails.status === 'active' ? 'Activa' :
                                licenseDetails.status === 'grace_period' ? 'Periodo de Gracia' :
                                    licenseDetails.status?.toUpperCase() || 'Inactiva'}
                        </span>
                    </div>
                    <div className="license-detail">
                        <span className="license-label">Vence:</span>
                        <span className="license-value">{licenseDetails.expires_at ? new Date(licenseDetails.expires_at).toLocaleDateString() : 'Nunca'}</span>
                    </div>
                    <div className="license-detail">
                        <span className="license-label">Límite de Rubros:</span>
                        <span className="license-value">{maxRubrosAllowed === 999 ? 'Ilimitado' : maxRubrosAllowed}</span>
                    </div>
                </div>

                <h4 className="device-manager-title">Dispositivos Vinculados</h4>
                <DeviceManager licenseKey={licenseDetails.license_key} />

                <button className="btn btn-cancel" style={{ width: 'auto', marginTop: '1rem' }} onClick={logout}>
                    Cerrar Sesión en este dispositivo
                </button>
            </div>
        );
    };

    return (
        <div className="company-form-container">
            <h3 className="subtitle">Configuración de Rubros</h3>

            {/* Mensaje visual de Bloqueo */}
            {maxRubrosAllowed === 1 && (
                <p style={{ fontSize: '0.9rem', color: 'var(--primary-color)', marginBottom: '10px', backgroundColor: '#eff6ff', padding: '10px', borderRadius: '6px', borderLeft: '4px solid var(--primary-color)' }}>
                    <Info size={16} aria-hidden="true" /> <strong>Modo Prueba Activado:</strong> El rubro está vinculado a tu licencia y no se puede cambiar aquí.
                </p>
            )}

            <div className="rubro-selector-grid">
                {BUSINESS_RUBROS.map(rubro => {
                    // Verificar si está permitido por la licencia (General)
                    const isNotAllowedByLicense = !isAllAllowed && !allowedRubrosList.includes(rubro.id);

                    // Verificar si está "Bloqueado" por la regla de Max 1 (Trial)
                    const isTrialLocked = maxRubrosAllowed === 1 && businessType.length > 0;

                    const isSelected = businessType.includes(rubro.id);

                    return (
                        <div
                            key={rubro.id}
                            className={`rubro-box ${isSelected ? 'selected' : ''}`}
                            onClick={() => handleRubroToggle(rubro.id)}
                            style={{
                                // Opacidad visual: Si no está permitido O si es trial y no es el seleccionado
                                opacity: (isNotAllowedByLicense || (isTrialLocked && !isSelected)) ? 0.5 : 1,
                                // Cursor bloqueado
                                cursor: (isNotAllowedByLicense || isTrialLocked) ? 'not-allowed' : 'pointer',
                                position: 'relative'
                            }}
                            title={isTrialLocked ? "Bloqueado por licencia de prueba" : ""}
                        >
                            {rubro.label}

                            {/* Candado si está bloqueado por licencia general o trial */}
                            {(isNotAllowedByLicense || (isTrialLocked && !isSelected)) && (
                                <LockKeyhole size={14} aria-hidden="true" style={{ position: 'absolute', top: 4, right: 5 }} />
                            )}
                            {/* Candado VERDE si es el seleccionado en modo trial (es fijo) */}
                            {(isTrialLocked && isSelected) && (
                                <LockKeyhole size={14} aria-hidden="true" style={{ position: 'absolute', top: 4, right: 5 }} />
                            )}
                        </div>
                    );
                })}
            </div>

            <small className="form-help-text">
                Selecciona los giros de tu negocio para activar funciones especiales.
            </small>

            <h3 className="subtitle" style={{ marginTop: '2rem' }}>Información de Licencia</h3>
            {renderLicenseInfo()}
        </div>
    );
}
