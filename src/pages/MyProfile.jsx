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
import AuthPrompt from '../components/AuthPrompt';
import DOMPurify from 'dompurify';
import SEO from '../components/SEO';
import { useSettings } from '../context/SettingsContext';

// --- 👇 OPTIMIZACIÓN: Cambiamos los imports del mapa ---
import StaticMap from '../components/StaticMap'; // <-- AÑADIDO
// import ClientOnly from '../components/ClientOnly'; // <-- ELIMINADO
// import DynamicMapPicker from '../components/DynamicMapPicker'; // <-- ELIMINADO
// --- FIN OPTIMIZACIÓN ---

export default function MyProfile() {
    const { showAlert } = useAlert();
    const { phone, setPhoneModalOpen, clearPhone, setCheckoutModalOpen } = useCustomer();
    const { customer, addresses, loading: userLoading, error, refetch, logout } = useUserData();
    const { theme, changeTheme } = useTheme();
    const { settings, loading: settingsLoading } = useSettings();
    const visibilitySettings = settings['client_visibility'] || {};

    const [editForm, setEditForm] = useState({ name: '', phone: '' });
    const [isAddressModalOpen, setAddressModalOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [addressToDelete, setAddressToDelete] = useState(null);
    const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);

    const loading = userLoading || settingsLoading;

    useEffect(() => {
        if (customer) {
            setEditForm({ name: customer.name, phone: customer.phone });
        }
    }, [customer]);

    // --- (Toda la lógica de handlers como handleSetDefaultAddress, handleInfoSubmit, etc., permanece sin cambios) ---
    const handleSetDefaultAddress = async (addressId) => {
        await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', customer.id);
        const { error } = await supabase.from('customer_addresses').update({ is_default: true }).eq('id', addressId);
        if (error) showAlert("Error al establecer la dirección predeterminada.");
        else {
            showAlert("Dirección predeterminada actualizada.");
            refetch();
        }
    };

    const handleInfoSubmit = async (e) => {
        e.preventDefault();
        const { error } = await supabase
            .from('customers')
            .update({ name: DOMPurify.sanitize(editForm.name), phone: DOMPurify.sanitize(editForm.phone) })
            .eq('id', customer.id);

        if (error) showAlert("Error al actualizar la información.");
        else {
            showAlert("Información actualizada con éxito.");
            if (editForm.phone !== phone) {
                localStorage.setItem('customer_phone', editForm.phone);
                window.location.reload();
            } else {
                refetch();
            }
        }
    };


    const handleDeleteAddress = async () => {
        if (!addressToDelete) return;
        const { error } = await supabase.from('customer_addresses').delete().eq('id', addressToDelete.id);
        if (error) {
            showAlert('Error al eliminar la dirección.');
            console.error("Error deleting address:", error);
        } else {
            showAlert('Dirección eliminada.');
            refetch();
        }
        setAddressToDelete(null);
    };

    const handleSaveAddress = async (addressData, shouldSave, addressId) => {
        let response;
        const dataToSave = {
            customer_id: customer.id,
            label: DOMPurify.sanitize(addressData.label),
            address_reference: DOMPurify.sanitize(addressData.address_reference),
            latitude: addressData.latitude,
            longitude: addressData.longitude
        };

        if (addressId) {
            response = await supabase.from('customer_addresses').update(dataToSave).eq('id', addressId).select().single();
        } else {
            dataToSave.is_default = addresses.length === 0;
            response = await supabase.from('customer_addresses').insert(dataToSave).select().single();
        }

        if (response.error) {
            showAlert(`Error al guardar: ${response.error.message}`);
            throw new Error(response.error.message);
        } else {
            showAlert(`Dirección ${addressId ? 'actualizada' : 'guardada'} con éxito.`);
            refetch();
            setAddressModalOpen(false);
            setEditingAddress(null);
        }
    };

    const openAddressModal = (address = null) => {
        setEditingAddress(address);
        setAddressModalOpen(true);
    };

    const confirmLogout = () => {
        // 1. Limpiamos datos del usuario (caché de UserDataContext)
        logout();

        // 2. Limpiamos el teléfono (CustomerContext)
        clearPhone();

        // 3. Cerramos el modal
        setLogoutModalOpen(false);

        // 4. ✅ CRÍTICO: Recargamos la página para desmontar TODOS los contextos
        // Esto asegura que no queden datos residuales en memoria
        window.location.href = '/'; // Redirige al inicio y fuerza recarga completa
    };

    const renderContent = () => {
        if (!phone) return <AuthPrompt />;
        if (loading) return <LoadingSpinner />;
        if (error) return <div className={styles.prompt}><h2>Error Inesperado</h2><p>No pudimos cargar tus datos.</p></div>;
        if (!customer) {
            return (
                <div className={styles.prompt}>
                    <h2>¡Bienvenido!</h2>
                    <p>Parece que eres nuevo por aquí. Completa tu perfil para guardar tus datos y direcciones.</p>
                    <button onClick={() => setCheckoutModalOpen(true, 'profile')} className={styles.actionButton}>
                        Completar mi perfil
                    </button>
                </div>
            );
        }

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
                {/* --- (Sección Mis Datos y Apariencia sin cambios) --- */}
                {visibilitySettings.profile_my_data !== false && (
                    <div className={styles.card}>
                        <h2>Mis Datos</h2>
                        <form onSubmit={handleInfoSubmit} className={styles.form}>
                            <label htmlFor="name">Nombre:</label>
                            <input id="name" type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} required />
                            <small> Puedes cambiar tu nombre las veces que quieras</small>
                            <label htmlFor="phone">Número de WhatsApp:</label>
                            <input id="phone" type="tel" value={editForm.phone} readOnly disabled title="Para cambiar tu número, cierra sesión e ingresa con el nuevo." />
                            <small>Para cambiar de numero, cierra sesión e ingresa con el nuevo. </small>
                            <button type="submit" className={styles.actionButton}>Guardar Cambios de Nombre</button>
                        </form>
                    </div>
                )}

                <div className={styles.card}>
                    <h2>Apariencia</h2>
                    <div className={styles.formGroup}>
                        <label htmlFor="theme-select">Tema de la aplicación</label>
                        <select id="theme-select" value={theme} onChange={(e) => changeTheme(e.target.value)} className={styles.themeSelector}>
                            <option value="light">Claro</option>
                            <option value="dark">Oscuro</option>
                            <option value="system">Automático (definido por el sistema)</option>
                        </select>
                    </div>
                </div>
                {/* --- (Fin Secciones Mis Datos y Apariencia) --- */}


                {visibilitySettings.profile_my_addresses !== false && (
                    <div className={styles.card}>
                        <div className={styles.addressHeader}>
                            <h2>Mis Direcciones</h2>
                            <button onClick={() => openAddressModal()} className={styles.addButton}> + Añadir Nueva </button>
                        </div>
                        {addresses.length > 0 ? (
                            <div className={styles.addressCarousel}>
                                {addresses.map((addr) => (
                                    <div key={addr.id} className={`${styles.addressItem} ${addr.is_default ? styles.defaultAddress : ''}`}>

                                        {/* --- 👇 OPTIMIZACIÓN AQUÍ --- */}
                                        {/* Este div faltaba en tu CSS, lo añadiremos en el siguiente paso */}
                                        <div className={styles.addressMapContainer}>
                                            <StaticMap latitude={addr.latitude} longitude={addr.longitude} />
                                        </div>
                                        {/* --- FIN OPTIMIZACIÓN --- */}

                                        <div>
                                            <div className={styles.addressLabelContainer}>
                                                <strong>{addr.label}</strong>
                                                {addr.is_default && <span className={styles.defaultBadge}>Predeterminada</span>}
                                            </div>
                                            <p>{addr.address_reference || 'Sin referencia'}</p>
                                        </div>
                                        <div className={styles.addressActions}>
                                            <button onClick={() => openAddressModal(addr)} className={styles.editButton}>Editar</button>
                                            <button
                                                onClick={() => setAddressToDelete(addr)}
                                                className={styles.deleteButton}
                                                disabled={addresses.length <= 1}
                                                title={addresses.length <= 1 ? "No puedes eliminar tu única dirección" : "Eliminar dirección"}
                                            >
                                                Eliminar
                                            </button>
                                            {!addr.is_default && (
                                                <button onClick={() => handleSetDefaultAddress(addr.id)} className={styles.setDefaultButton}>
                                                    Hacer Predeterminada
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <p>No tienes direcciones guardadas.</p>}
                    </div>
                )}

                <div className={styles.logoutSection}>
                    <button onClick={() => setLogoutModalOpen(true)} className={styles.logoutButton}>
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
                name="Entre Alas"
                type="website"
            />
            <div className={styles.container}>
                {renderContent()}
                <AddressModal
                    isOpen={isAddressModalOpen}
                    onClose={() => { setAddressModalOpen(false); setEditingAddress(null); }}
                    onSave={handleSaveAddress}
                    address={editingAddress}
                    customerId={customer?.id}
                    showSaveOption={true}
                />
                <ConfirmModal isOpen={!!addressToDelete} onClose={() => setAddressToDelete(null)} onConfirm={handleDeleteAddress} title="¿Eliminar Dirección?">
                    Estás a punto de eliminar esta dirección. Esta acción no se puede deshacer.
                </ConfirmModal>
                <ConfirmModal isOpen={isLogoutModalOpen} onClose={() => setLogoutModalOpen(false)} onConfirm={confirmLogout} title="¿Cerrar Sesión?">
                    Tu número se eliminará de este dispositivo y tendrás que volver a ingresarlo para ver tu perfil y pedidos.
                </ConfirmModal>
            </div>
        </>
    );
}