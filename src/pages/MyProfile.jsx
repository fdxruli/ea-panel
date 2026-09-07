import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import styles from './MyProfile.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import AddressModal from '../components/AddressModal';
import ConfirmModal from '../components/ConfirmModal';
import { useAlert } from '../context/AlertContext';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { Navigate } from 'react-router-dom';
import StaticMap from '../components/StaticMap';
import { useLoyalty } from '../hooks/useLoyalty';
import LoyaltyBadge from '../components/LoyaltyBadge';
import DOMPurify from 'dompurify';
import SEO from '../components/SEO';

export default function MyProfile() {
    const { showAlert } = useAlert();
    const { isAuthenticated, isLinked, customer: canonicalCustomer, signOut, setCheckoutModalOpen } = useCustomer();
    const { customer, addresses, loading: userLoading, error, refetch } = useUserData();
    const { theme, changeTheme } = useTheme();
    const { settings, loading: settingsLoading } = useSettings();
    const { status: loyaltyStatus, data: loyalty } = useLoyalty();
    const visibilitySettings = settings.client_visibility || {};
    const [editForm, setEditForm] = useState({ name: '', phone: '' });
    const [isAddressModalOpen, setAddressModalOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [addressToDelete, setAddressToDelete] = useState(null);
    const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);
    const loading = userLoading || settingsLoading;

    useEffect(() => {
        if (customer) setEditForm({ name: customer.name || '', phone: customer.phone || '' });
    }, [customer]);

    const handleSetDefaultAddress = async (addressId) => {
        if (!canonicalCustomer?.id) return;
        await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', canonicalCustomer.id);
        const { error: updateError } = await supabase.from('customer_addresses').update({ is_default: true }).eq('id', addressId);
        if (updateError) showAlert('Error al establecer la dirección predeterminada.');
        else { showAlert('Dirección predeterminada actualizada.'); refetch(); }
    };

    const handleInfoSubmit = async (e) => {
        e.preventDefault();
        if (!canonicalCustomer?.id) return;
        const { error: updateError } = await supabase.from('customers').update({ name: DOMPurify.sanitize(editForm.name) }).eq('id', canonicalCustomer.id);
        if (updateError) showAlert('Error al actualizar la información.');
        else { showAlert('Información actualizada con éxito.'); refetch(); }
    };

    const handleDeleteAddress = async () => {
        if (!addressToDelete) return;
        const { error: deleteError } = await supabase.from('customer_addresses').delete().eq('id', addressToDelete.id);
        if (deleteError) { showAlert('Error al eliminar la dirección.'); console.error('Error deleting address:', deleteError); }
        else { showAlert('Dirección eliminada.'); refetch(); }
        setAddressToDelete(null);
    };

    const handleSaveAddress = async (addressData, shouldSave, addressId) => {
        if (!canonicalCustomer?.id) throw new Error('Sesión de cliente no disponible.');
        const dataToSave = {
            customer_id: canonicalCustomer.id,
            label: DOMPurify.sanitize(addressData.label),
            address_reference: DOMPurify.sanitize(addressData.address_reference),
            latitude: addressData.latitude,
            longitude: addressData.longitude,
        };
        const response = addressId
            ? await supabase.from('customer_addresses').update(dataToSave).eq('id', addressId).select().single()
            : await supabase.from('customer_addresses').insert({ ...dataToSave, is_default: addresses.length === 0 }).select().single();
        if (response.error) { showAlert(`Error al guardar: ${response.error.message}`); throw new Error(response.error.message); }
        showAlert(`Dirección ${addressId ? 'actualizada' : 'guardada'} con éxito.`);
        refetch(); setAddressModalOpen(false); setEditingAddress(null);
    };

    const confirmLogout = async () => {
        await signOut();
        setLogoutModalOpen(false);
        window.location.replace('/');
    };

    const renderContent = () => {
        if (!isAuthenticated) return <Navigate to="/" replace />;
        if (!isLinked || !canonicalCustomer) return <div className={styles.prompt}><h2>Cuenta pendiente</h2><p>Tu teléfono está autenticado pero aún no está vinculado a un cliente.</p></div>;
        if (loading) return <LoadingSpinner />;
        if (error) return <div className={styles.prompt}><h2>Error Inesperado</h2><p>No pudimos cargar tus datos.</p></div>;
        if (visibilitySettings.my_profile_page === false) return <div className={styles.prompt}><h2>Sección no disponible</h2><p>Esta sección está temporalmente desactivada.</p></div>;

        return <>
            {loyaltyStatus === 'ready' && <LoyaltyBadge category={loyalty?.category} />}
            {loyaltyStatus === 'error' && <div className={styles.prompt} role="status">No pudimos cargar tu categoría en este momento.</div>}
            <div className={styles.settingsGroup}>
                {visibilitySettings.profile_my_data !== false && <div className={styles.section}>
                    <h2>Información Personal</h2>
                    <form onSubmit={handleInfoSubmit} className={styles.form}>
                        <div className={styles.inputGroup}><label htmlFor="name">Nombre</label><input id="name" type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required /></div>
                        <div className={styles.inputGroup}><label htmlFor="phone">Número de WhatsApp</label><input id="phone" type="tel" value={editForm.phone} readOnly disabled /><small>Para cambiar de número, debes cerrar sesión y volver a autenticarte.</small></div>
                        <button type="submit" className={styles.actionButton}>Guardar Nombre</button>
                    </form>
                </div>}
                <div className={styles.section}><h2>Preferencias</h2><div className={styles.inputGroup}><label htmlFor="theme-select">Tema de la aplicación</label><select id="theme-select" value={theme} onChange={(e) => changeTheme(e.target.value)} className={styles.themeSelector}><option value="light">Claro</option><option value="dark">Oscuro</option><option value="system">Automático</option></select></div></div>
            </div>

            {visibilitySettings.profile_my_addresses !== false && <div className={styles.addressSection}>
                <div className={styles.sectionHeader}><h2>Mis Direcciones</h2><button onClick={() => { setEditingAddress(null); setAddressModalOpen(true); }} className={styles.addButton}>+ Añadir</button></div>
                {addresses.length > 0 ? <div className={styles.addressGrid}>{addresses.map((addr) => <div key={addr.id} className={`${styles.addressItem} ${addr.is_default ? styles.defaultAddress : ''}`}>
                    <div className={styles.addressMapContainer}><StaticMap latitude={addr.latitude} longitude={addr.longitude} /></div>
                    <div className={styles.addressContent}><div className={styles.addressLabelContainer}><strong>{addr.label}</strong>{addr.is_default && <span className={styles.defaultBadge}>Predeterminada</span>}</div><p>{addr.address_reference || 'Sin referencia'}</p></div>
                    <div className={styles.addressActions}><button onClick={() => { setEditingAddress(addr); setAddressModalOpen(true); }} className={styles.editButton}>Editar</button><button onClick={() => setAddressToDelete(addr)} className={styles.deleteButton} disabled={addresses.length <= 1}>Eliminar</button>{!addr.is_default && <button onClick={() => handleSetDefaultAddress(addr.id)} className={styles.setDefaultButton}>Fijar como predeterminada</button>}</div>
                </div>)}</div> : <p className={styles.emptyState}>No tienes direcciones guardadas.</p>}
            </div>}

            <div className={styles.logoutSection}><button onClick={() => setLogoutModalOpen(true)} className={styles.logoutButton}>Cerrar Sesión (Cambiar de número)</button></div>
        </>;
    };

    return <><SEO title="Mi Perfil - Entre Alas" description="Administra tus datos personales, direcciones de entrega y preferencias de la aplicación." type="website" noindex /><div className={styles.container}>{renderContent()}
        <AddressModal isOpen={isAddressModalOpen} onClose={() => { setAddressModalOpen(false); setEditingAddress(null); }} onSave={handleSaveAddress} address={editingAddress} />
        <ConfirmModal isOpen={!!addressToDelete} onClose={() => setAddressToDelete(null)} onConfirm={handleDeleteAddress} title="¿Eliminar Dirección?">Estás a punto de eliminar esta dirección. Esta acción no se puede deshacer.</ConfirmModal>
        <ConfirmModal isOpen={isLogoutModalOpen} onClose={() => setLogoutModalOpen(false)} onConfirm={confirmLogout} title="¿Cerrar Sesión?">Tu sesión de Auth se cerrará y tendrás que volver a verificar tu teléfono.</ConfirmModal>
    </div></>;
}
