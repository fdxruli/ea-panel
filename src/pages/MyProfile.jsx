import React, { useState, useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useCustomer } from '../context/CustomerContext';
import { useCustomerProfile } from '../hooks/useCustomerProfile';
import { useCustomerAddresses } from '../hooks/useCustomerAddresses';
import { useLoyalty } from '../hooks/useLoyalty';
import { useAlert } from '../context/AlertContext';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import LoadingSpinner from '../components/LoadingSpinner';
import AddressModal from '../components/AddressModal';
import ConfirmModal from '../components/ConfirmModal';
import StaticMap from '../components/StaticMap';
import LoyaltyBadge, { CrownIcon } from '../components/LoyaltyBadge';
import ProfileNotificationCard from '../components/ProfileNotificationCard';
import SEO from '../components/SEO';
import styles from './MyProfile.module.css';

// SVG Icons
const MapPinIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
    </svg>
);

const UserIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
    </svg>
);

const SettingsIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
);

const ShieldIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
);

const WhatsAppIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
);

const PlusIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
);

const ChevronDownIcon = ({ className }) => (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

export default function MyProfile() {
    const { showAlert } = useAlert();
    const { isAuthenticated, isLinked, customer: canonicalCustomer, isCustomerLoading, signOut } = useCustomer();
    const {
        name,
        setName,
        birthdate,
        setBirthdate,
        phone,
        isDirty,
        isSaving: isSavingProfile,
        updateProfile,
        resetForm,
    } = useCustomerProfile();

    const {
        addresses,
        loading: addressesLoading,
        actionLoading: addressActionLoading,
        setDefaultAddress,
        saveAddress,
        deleteAddress,
    } = useCustomerAddresses();

    const { theme, changeTheme } = useTheme();
    const { settings, loading: settingsLoading } = useSettings();
    const { status: loyaltyStatus, data: loyalty, isVip } = useLoyalty();

    const visibilitySettings = settings?.client_visibility || {};

    const [isAddressModalOpen, setAddressModalOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [addressToDelete, setAddressToDelete] = useState(null);
    const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);
    const [isDiscardModalOpen, setDiscardModalOpen] = useState(false);
    const [showOtherAddresses, setShowOtherAddresses] = useState(false);

    const defaultAddress = useMemo(() => {
        if (!addresses || addresses.length === 0) return null;
        return addresses.find((a) => a.is_default) || addresses[0];
    }, [addresses]);

    const otherAddresses = useMemo(() => {
        if (!defaultAddress) return [];
        return addresses.filter((a) => a.id !== defaultAddress.id);
    }, [addresses, defaultAddress]);

    const isInitialLoading = isCustomerLoading || settingsLoading;
    const todayIsoDate = useMemo(() => new Date().toISOString().split('T')[0], []);

    const memberSince = useMemo(() => {
        if (!canonicalCustomer?.created_at) return null;
        try {
            const date = new Date(canonicalCustomer.created_at);
            if (isNaN(date.getTime())) return null;
            const month = date.toLocaleDateString('es-MX', { month: 'long' });
            const year = date.getFullYear();
            return `Cliente desde ${month.charAt(0).toUpperCase() + month.slice(1)} ${year}`;
        } catch {
            return null;
        }
    }, [canonicalCustomer?.created_at]);

    const userInitial = useMemo(() => {
        const candidate = (name?.trim() || canonicalCustomer?.name || '').trim();
        return candidate ? candidate.charAt(0).toUpperCase() : 'U';
    }, [name, canonicalCustomer?.name]);

    const handleInfoSubmit = async (e) => {
        e.preventDefault();
        try {
            await updateProfile({ newName: name, newBirthdate: birthdate });
            showAlert('Información personal guardada con éxito.');
        } catch (err) {
            showAlert(err.message || 'Error al actualizar el perfil.');
        }
    };

    const handleCancelEdit = () => {
        if (isDirty) {
            setDiscardModalOpen(true);
        } else {
            resetForm();
        }
    };

    const confirmDiscard = () => {
        resetForm();
        setDiscardModalOpen(false);
    };

    const handleSetDefaultAddress = async (addressId) => {
        try {
            await setDefaultAddress(addressId);
            showAlert('Dirección predeterminada actualizada.');
        } catch (_err) {
            showAlert('Error al establecer la dirección predeterminada.');
        }
    };

    const handleDeleteAddress = async () => {
        if (!addressToDelete) return;
        try {
            await deleteAddress(addressToDelete.id);
            showAlert('Dirección eliminada.');
        } catch (_err) {
            showAlert('Error al eliminar la dirección.');
        } finally {
            setAddressToDelete(null);
        }
    };

    const handleSaveAddress = async (addressData, shouldSave, addressId) => {
        try {
            await saveAddress(addressData, addressId);
            showAlert(`Dirección ${addressId ? 'actualizada' : 'guardada'} con éxito.`);
            setAddressModalOpen(false);
            setEditingAddress(null);
        } catch (err) {
            showAlert(`Error al guardar: ${err.message}`);
            throw err;
        }
    };

    const confirmLogout = async () => {
        await signOut();
        setLogoutModalOpen(false);
        window.location.replace('/');
    };

    const renderAddressCard = (addr, isDefaultCard = false) => (
        <div
            key={addr.id}
            className={`${styles.addressItem} ${
                isDefaultCard ? styles.defaultAddress : ''
            }`}
        >
            <div className={styles.addressMapContainer}>
                <StaticMap latitude={addr.latitude} longitude={addr.longitude} />
            </div>
            <div className={styles.addressContent}>
                <div className={styles.addressLabelContainer}>
                    <strong>{addr.label}</strong>
                    {isDefaultCard && (
                        <span className={styles.defaultBadge}>
                            Predeterminada
                        </span>
                    )}
                </div>
                <p className={styles.addressReference}>
                    {addr.address_reference || 'Sin referencia registrada'}
                </p>
            </div>
            <div className={styles.addressActions}>
                <button
                    type="button"
                    onClick={() => {
                        setEditingAddress(addr);
                        setAddressModalOpen(true);
                    }}
                    className={styles.editButton}
                    disabled={addressActionLoading}
                >
                    Editar
                </button>
                <button
                    type="button"
                    onClick={() => setAddressToDelete(addr)}
                    className={styles.deleteButton}
                    disabled={addressActionLoading || addresses.length <= 1}
                    title={
                        addresses.length <= 1
                            ? 'Debes conservar al menos una dirección registrada'
                            : 'Eliminar esta dirección'
                    }
                >
                    Eliminar
                </button>
                {!isDefaultCard && (
                    <button
                        type="button"
                        onClick={() => handleSetDefaultAddress(addr.id)}
                        className={styles.setDefaultButton}
                        disabled={addressActionLoading}
                    >
                        Fijar como predeterminada
                    </button>
                )}
            </div>
        </div>
    );

    const renderContent = () => {
        if (!isAuthenticated) return <Navigate to="/" replace />;
        if (!isLinked || !canonicalCustomer) {
            return (
                <div className={styles.prompt}>
                    <h2>Cuenta pendiente</h2>
                    <p>Tu teléfono está autenticado pero aún no está vinculado a un cliente.</p>
                </div>
            );
        }
        if (isInitialLoading) return <LoadingSpinner />;
        if (visibilitySettings.my_profile_page === false) {
            return (
                <div className={styles.prompt}>
                    <h2>Sección no disponible</h2>
                    <p>Esta sección está temporalmente desactivada.</p>
                </div>
            );
        }

        return (
            <>
                {/* 1. HERO CARD DE IDENTIDAD Y LEALTAD */}
                <section className={styles.heroCard} aria-labelledby="hero-profile-name">
                    <div className={styles.heroHeader}>
                        <div className={styles.avatarWrapper}>
                            <div className={styles.avatar}>
                                <span>{userInitial}</span>
                            </div>
                            {isVip && (
                                <div className={styles.avatarCrown} title="Cliente VIP">
                                    <CrownIcon size={13} />
                                </div>
                            )}
                        </div>

                        <div className={styles.heroMeta}>
                            <h1 id="hero-profile-name" className={styles.heroName}>
                                {name || canonicalCustomer.name || 'Mi Perfil'}
                            </h1>
                            <div className={styles.heroSubmeta}>
                                <span className={styles.phoneBadge} title="WhatsApp verificado">
                                    <WhatsAppIcon /> {phone || canonicalCustomer.phone}
                                </span>
                                {memberSince && (
                                    <span className={styles.memberSince}>• {memberSince}</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {loyaltyStatus === 'ready' && loyalty && (
                        <div className={styles.heroLoyaltyBar}>
                            <LoyaltyBadge category={loyalty.category} />
                            <p className={styles.loyaltyBenefit}>{loyalty.benefit_label}</p>
                        </div>
                    )}
                </section>

                {/* 2. LIBRETA DE DIRECCIONES (PRIORIDAD EN DELIVERY) */}
                {visibilitySettings.profile_my_addresses !== false && (
                    <section className={styles.cardSection} aria-labelledby="addresses-title">
                        <div className={styles.sectionHeader}>
                            <h2 id="addresses-title">
                                <MapPinIcon /> Mis Direcciones{' '}
                                <span className={styles.countBadge}>{addresses.length}</span>
                            </h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingAddress(null);
                                    setAddressModalOpen(true);
                                }}
                                className={styles.addButton}
                                disabled={addressActionLoading}
                            >
                                <PlusIcon /> Añadir
                            </button>
                        </div>

                        {addressesLoading ? (
                            <LoadingSpinner />
                        ) : addresses.length > 0 ? (
                            <div className={styles.addressSectionWrapper}>
                                {defaultAddress && (
                                    <div className={styles.defaultAddressContainer}>
                                        {renderAddressCard(defaultAddress, true)}
                                    </div>
                                )}

                                {otherAddresses.length > 0 && (
                                    <div className={styles.otherAddressesSection}>
                                        <button
                                            type="button"
                                            className={styles.accordionToggleBtn}
                                            onClick={() => setShowOtherAddresses((prev) => !prev)}
                                            aria-expanded={showOtherAddresses}
                                        >
                                            <div className={styles.accordionToggleContent}>
                                                <span className={styles.accordionToggleTitle}>
                                                    {showOtherAddresses
                                                        ? 'Ocultar otras direcciones'
                                                        : `Ver mis otras direcciones (${otherAddresses.length})`}
                                                </span>
                                                <span className={styles.accordionToggleSub}>
                                                    {showOtherAddresses
                                                        ? 'Colapsar lista de direcciones secundarias'
                                                        : 'Gestionar o fijar otra como predeterminada'}
                                                </span>
                                            </div>
                                            <ChevronDownIcon
                                                className={`${styles.accordionChevron} ${
                                                    showOtherAddresses ? styles.chevronOpen : ''
                                                }`}
                                            />
                                        </button>

                                        {showOtherAddresses && (
                                            <div className={styles.otherAddressesGrid}>
                                                {otherAddresses.map((addr) => renderAddressCard(addr, false))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className={styles.emptyState}>
                                <p>No tienes direcciones guardadas para entrega.</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditingAddress(null);
                                        setAddressModalOpen(true);
                                    }}
                                    className={styles.addButton}
                                >
                                    <PlusIcon /> Registrar mi primera dirección
                                </button>
                            </div>
                        )}
                    </section>
                )}

                {/* 3. INFORMACIÓN PERSONAL Y CUMPLEAÑOS (DISCRETO) */}
                {visibilitySettings.profile_my_data !== false && (
                    <section className={styles.cardSection} aria-labelledby="personal-data-title">
                        <div className={styles.sectionHeader}>
                            <h2 id="personal-data-title">
                                <UserIcon /> Información Personal
                            </h2>
                        </div>
                        <form onSubmit={handleInfoSubmit} className={styles.form} noValidate>
                            <div className={styles.inputGrid}>
                                <div className={styles.inputGroup}>
                                    <label htmlFor="customer-name">Nombre completo</label>
                                    <input
                                        id="customer-name"
                                        type="text"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        required
                                        minLength={2}
                                        maxLength={100}
                                        disabled={isSavingProfile}
                                        autoComplete="name"
                                    />
                                </div>

                                <div className={styles.inputGroup}>
                                    <label htmlFor="customer-phone">Número de WhatsApp</label>
                                    <input
                                        id="customer-phone"
                                        type="tel"
                                        value={phone}
                                        readOnly
                                        disabled
                                        aria-describedby="phone-helper"
                                    />
                                    <small id="phone-helper" className={styles.inputHelper}>
                                        Vinculado a tu cuenta. Para cambiarlo, debes cerrar sesión.
                                    </small>
                                </div>

                                <div className={styles.inputGroup}>
                                    <label htmlFor="customer-birthdate">Fecha de cumpleaños (opcional)</label>
                                    <input
                                        id="customer-birthdate"
                                        type="date"
                                        value={birthdate || ''}
                                        onChange={(e) => setBirthdate(e.target.value)}
                                        max={todayIsoDate}
                                        disabled={isSavingProfile}
                                        autoComplete="bday"
                                    />
                                </div>
                            </div>

                            <div className={styles.formActions}>
                                <button
                                    type="submit"
                                    className={styles.saveButton}
                                    disabled={isSavingProfile || !isDirty}
                                >
                                    {isSavingProfile ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                                {isDirty && (
                                    <button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        className={styles.cancelButton}
                                        disabled={isSavingProfile}
                                    >
                                        Cancelar
                                    </button>
                                )}
                            </div>
                        </form>
                    </section>
                )}

                {/* 4. PREFERENCIAS Y CENTRO DE NOTIFICACIONES */}
                <section className={styles.cardSection} aria-labelledby="preferences-title">
                    <div className={styles.sectionHeader}>
                        <h2 id="preferences-title">
                            <SettingsIcon /> Preferencias de la Aplicación
                        </h2>
                    </div>

                    <div className={styles.preferencesWrapper}>
                        <div className={styles.themeGroup}>
                            <label htmlFor="theme-select">Tema de la interfaz</label>
                            <select
                                id="theme-select"
                                value={theme}
                                onChange={(e) => changeTheme(e.target.value)}
                                className={styles.themeSelector}
                            >
                                <option value="light">Claro</option>
                                <option value="dark">Oscuro</option>
                                <option value="system">Automático (según tu dispositivo)</option>
                            </select>
                        </div>

                        <ProfileNotificationCard />
                    </div>
                </section>

                {/* 5. CUENTA Y SEGURIDAD */}
                <section className={styles.cardSection} aria-labelledby="security-title">
                    <div className={styles.sectionHeader}>
                        <h2 id="security-title">
                            <ShieldIcon /> Cuenta y Seguridad
                        </h2>
                    </div>

                    <div className={styles.legalRow}>
                        <span>Términos y Condiciones del Servicio</span>
                        <Link to="/terminos" className={styles.legalLink}>
                            Consultar documento →
                        </Link>
                    </div>

                    <button
                        type="button"
                        onClick={() => setLogoutModalOpen(true)}
                        className={styles.logoutButton}
                    >
                        Cerrar Sesión en este dispositivo
                    </button>
                </section>
            </>
        );
    };

    return (
        <>
            <SEO
                title="Mi Perfil - Entre Alas"
                description="Administra tus datos personales, direcciones de entrega y preferencias de la aplicación."
                type="website"
                noindex
            />
            <main className={styles.container}>{renderContent()}</main>

            <AddressModal
                isOpen={isAddressModalOpen}
                onClose={() => {
                    setAddressModalOpen(false);
                    setEditingAddress(null);
                }}
                onSave={handleSaveAddress}
                address={editingAddress}
            />

            <ConfirmModal
                isOpen={!!addressToDelete}
                onClose={() => setAddressToDelete(null)}
                onConfirm={handleDeleteAddress}
                title="¿Eliminar Dirección?"
            >
                Estás a punto de eliminar esta dirección. Esta acción no se puede deshacer.
            </ConfirmModal>

            <ConfirmModal
                isOpen={isDiscardModalOpen}
                onClose={() => setDiscardModalOpen(false)}
                onConfirm={confirmDiscard}
                title="¿Descartar Cambios?"
            >
                Tienes modificaciones pendientes en tus datos personales que no has guardado. ¿Deseas descartarlas?
            </ConfirmModal>

            <ConfirmModal
                isOpen={isLogoutModalOpen}
                onClose={() => setLogoutModalOpen(false)}
                onConfirm={confirmLogout}
                title="¿Cerrar Sesión?"
            >
                Tu sesión se cerrará en este dispositivo y tendrás que volver a autenticarte con tu número de WhatsApp.
            </ConfirmModal>
        </>
    );
}
