import React, { useState } from 'react';
import { useCustomer } from '../context/CustomerContext';
import { useCustomerProfile } from '../hooks/useCustomerProfile';
import { useCustomerAddresses } from '../hooks/useCustomerAddresses';
import { useLoyalty } from '../hooks/useLoyalty';
import { useAlert } from '../context/AlertContext';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { Navigate } from 'react-router-dom';
import LoadingSpinner from '../components/LoadingSpinner';
import AddressModal from '../components/AddressModal';
import ConfirmModal from '../components/ConfirmModal';
import StaticMap from '../components/StaticMap';
import LoyaltyBadge from '../components/LoyaltyBadge';
import SEO from '../components/SEO';
import styles from './MyProfile.module.css';

export default function MyProfile() {
    const { showAlert } = useAlert();
    const { isAuthenticated, isLinked, customer: canonicalCustomer, isCustomerLoading, signOut } = useCustomer();
    const {
        name,
        setName,
        phone,
        referralCode,
        isDirty,
        isSaving: isSavingProfile,
        updateName,
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
    const { status: loyaltyStatus, data: loyalty } = useLoyalty();

    const visibilitySettings = settings?.client_visibility || {};

    const [isAddressModalOpen, setAddressModalOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [addressToDelete, setAddressToDelete] = useState(null);
    const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);
    const [isDiscardModalOpen, setDiscardModalOpen] = useState(false);

    const isInitialLoading = isCustomerLoading || settingsLoading;

    const handleInfoSubmit = async (e) => {
        e.preventDefault();
        try {
            await updateName(name);
            showAlert('Información actualizada con éxito.');
        } catch (err) {
            showAlert(err.message || 'Error al actualizar el nombre.');
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

    const handleCopyReferralLink = () => {
        if (!referralCode) return;
        const link = `${window.location.origin}/?ref=${referralCode}`;
        navigator.clipboard.writeText(link).then(
            () => showAlert('¡Enlace de referido copiado!'),
            () => showAlert('No se pudo copiar el enlace.')
        );
    };

    const confirmLogout = async () => {
        await signOut();
        setLogoutModalOpen(false);
        window.location.replace('/');
    };

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
                {/* 1. Categoría de Lealtad (Limpia, No Monetaria) */}
                {loyaltyStatus === 'ready' && loyalty && (
                    <section className={styles.loyaltyCard} aria-labelledby="loyalty-title">
                        <div className={styles.loyaltyHeader}>
                            <h2 id="loyalty-title">Nivel de Cliente</h2>
                            <LoyaltyBadge category={loyalty.category} />
                        </div>
                        <p className={styles.loyaltyBenefit}>{loyalty.benefit_label}</p>
                    </section>
                )}

                {/* 2. Información Personal y Preferencias */}
                <div className={styles.settingsGroup}>
                    {visibilitySettings.profile_my_data !== false && (
                        <div className={styles.section}>
                            <div className={styles.sectionHeaderRow}>
                                <h2>Información Personal</h2>
                            </div>
                            <form onSubmit={handleInfoSubmit} className={styles.form} noValidate>
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
                                    <small id="phone-helper">
                                        Para cambiar de número, debes cerrar sesión y volver a autenticarte.
                                    </small>
                                </div>
                                <div className={styles.formActions}>
                                    <button
                                        type="submit"
                                        className={styles.actionButton}
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
                        </div>
                    )}

                    <div className={styles.section}>
                        <h2>Preferencias</h2>
                        <div className={styles.inputGroup}>
                            <label htmlFor="theme-select">Tema de la aplicación</label>
                            <select
                                id="theme-select"
                                value={theme}
                                onChange={(e) => changeTheme(e.target.value)}
                                className={styles.themeSelector}
                            >
                                <option value="light">Claro</option>
                                <option value="dark">Oscuro</option>
                                <option value="system">Automático</option>
                            </select>
                        </div>
                    </div>
                </div>

                {/* 3. Código de Referidos Limpio (Sin balances monetarios) */}
                {referralCode && (
                    <section className={styles.referralSection} aria-labelledby="referral-title">
                        <h2 id="referral-title">Tu Código de Invitación</h2>
                        <p className={styles.referralDesc}>
                            Comparte tu código para invitar a tus conocidos a pedir en Entre Alas.
                        </p>
                        <div className={styles.referralBox}>
                            <input
                                type="text"
                                readOnly
                                value={referralCode}
                                className={styles.referralInput}
                                aria-label="Tu código de referido"
                            />
                            <button
                                type="button"
                                onClick={handleCopyReferralLink}
                                className={styles.copyButton}
                            >
                                Copiar Enlace
                            </button>
                        </div>
                    </section>
                )}

                {/* 4. Direcciones Seguras y Atómicas */}
                {visibilitySettings.profile_my_addresses !== false && (
                    <section className={styles.addressSection} aria-labelledby="addresses-title">
                        <div className={styles.sectionHeader}>
                            <h2 id="addresses-title">Mis Direcciones</h2>
                            <button
                                type="button"
                                onClick={() => {
                                    setEditingAddress(null);
                                    setAddressModalOpen(true);
                                }}
                                className={styles.addButton}
                                disabled={addressActionLoading}
                            >
                                + Añadir
                            </button>
                        </div>

                        {addressesLoading ? (
                            <LoadingSpinner />
                        ) : addresses.length > 0 ? (
                            <div className={styles.addressGrid}>
                                {addresses.map((addr) => (
                                    <div
                                        key={addr.id}
                                        className={`${styles.addressItem} ${
                                            addr.is_default ? styles.defaultAddress : ''
                                        }`}
                                    >
                                        <div className={styles.addressMapContainer}>
                                            <StaticMap latitude={addr.latitude} longitude={addr.longitude} />
                                        </div>
                                        <div className={styles.addressContent}>
                                            <div className={styles.addressLabelContainer}>
                                                <strong>{addr.label}</strong>
                                                {addr.is_default && (
                                                    <span className={styles.defaultBadge}>
                                                        Predeterminada
                                                    </span>
                                                )}
                                            </div>
                                            <p>{addr.address_reference || 'Sin referencia'}</p>
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
                                                        ? 'Debes tener al menos una dirección registrada'
                                                        : 'Eliminar esta dirección'
                                                }
                                            >
                                                Eliminar
                                            </button>
                                            {!addr.is_default && (
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
                                ))}
                            </div>
                        ) : (
                            <p className={styles.emptyState}>No tienes direcciones guardadas.</p>
                        )}
                    </section>
                )}

                {/* 5. Cierre de Sesión */}
                <div className={styles.logoutSection}>
                    <button
                        type="button"
                        onClick={() => setLogoutModalOpen(true)}
                        className={styles.logoutButton}
                    >
                        Cerrar Sesión (Cambiar de número)
                    </button>
                </div>
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
                Tienes modificaciones en tu nombre que aún no has guardado. ¿Deseas descartarlas?
            </ConfirmModal>

            <ConfirmModal
                isOpen={isLogoutModalOpen}
                onClose={() => setLogoutModalOpen(false)}
                onConfirm={confirmLogout}
                title="¿Cerrar Sesión?"
            >
                Tu sesión se cerrará y tendrás que volver a ingresar con tu número de teléfono.
            </ConfirmModal>
        </>
    );
}
