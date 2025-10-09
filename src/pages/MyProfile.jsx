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

const ReferralSystem = ({ customer }) => {
    const { showAlert } = useAlert();
    const referralLink = `${window.location.origin}/?ref=${customer.referral_code}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(referralLink).then(() => {
            showAlert('¡Enlace de referido copiado!');
        });
    };

    return (
        <div className={styles.card}>
            <h2>Invita y Gana</h2>
            <p>
                Comparte tu enlace de referido con tus amigos. Cuando se registren, 
                ¡acumularás puntos para subir de nivel y obtener recompensas!
            </p>
            <div className={styles.referralBox}>
                <input type="text" readOnly value={referralLink} />
                <button onClick={handleCopy} className={styles.actionButton}>Copiar Enlace</button>
            </div>
            <div className={styles.referralStats}>
                <p><strong>Amigos Invitados:</strong> {customer.referral_count || 0}</p>
                {/** agregar aqui la logica para mostrar al cliente sus premios. Ya lo hacemos en mi actividad... mejor ver si pasamos esta seccion a mi actividad */}
            </div>
        </div>
    );
};


export default function MyProfile() {
    const { showAlert } = useAlert();
    const { phone, setPhoneModalOpen, clearPhone, setCheckoutModalOpen } = useCustomer();
    const { customer, addresses, loading, error, refetch } = useUserData();
    const { theme, changeTheme } = useTheme();

    const [editForm, setEditForm] = useState({ name: '', phone: '' });
    const [isAddressModalOpen, setAddressModalOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);
    const [addressToDelete, setAddressToDelete] = useState(null);
    const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);

    useEffect(() => {
        if (customer) {
            setEditForm({ name: customer.name, phone: customer.phone });
        }
    }, [customer]);

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
                window.location.reload(); 
            } else {
                refetch();
            }
        }
    };

    const handleDeleteAddress = async () => {
        if (!addressToDelete) return;
        await supabase.from('customer_addresses').delete().eq('id', addressToDelete.id);
        showAlert('Dirección eliminada.');
        setAddressToDelete(null);
        refetch();
    };
    
    const handleSaveAddress = async (addressData, shouldSave, addressId) => {
        let response;
        const dataToSave = { ...addressData, customer_id: customer.id };

        if (addressId) {
            response = await supabase.from('customer_addresses').update(dataToSave).eq('id', addressId);
        } else {
            response = await supabase.from('customer_addresses').insert(dataToSave);
        }
        
        if (response.error) {
            showAlert(`Error al guardar: ${response.error.message}`);
            throw new Error(response.error.message);
        }

        showAlert(`Dirección ${addressId ? 'actualizada' : 'guardada'} con éxito.`);
        refetch();
    };

    const openAddressModal = (address = null) => {
        setEditingAddress(address);
        setAddressModalOpen(true);
    };

    const confirmLogout = () => {
        clearPhone();
        setLogoutModalOpen(false);
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

        return (
            <>
                <div className={styles.card}>
                    <h2>Mis Datos</h2>
                    <form onSubmit={handleInfoSubmit} className={styles.form}>
                        <label htmlFor="name">Nombre:</label>
                        <input id="name" type="text" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        <label htmlFor="phone">Número de WhatsApp:</label>
                        <input id="phone" type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                        <button type="submit" className={styles.actionButton}>Guardar Cambios</button>
                    </form>
                </div>

                {customer.referral_code && <ReferralSystem customer={customer} />}

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

                <div className={styles.card}>
                    <div className={styles.addressHeader}>
                        <h2>Mis Direcciones</h2>
                        <button onClick={() => openAddressModal()} className={styles.addButton}> + Añadir Nueva </button>
                    </div>
                    {addresses.length > 0 ? (
                        <div className={styles.addressCarousel}>
                            {addresses.map(addr => (
                                <div key={addr.id} className={`${styles.addressItem} ${addr.is_default ? styles.defaultAddress : ''}`}>
                                    <div>
                                        <div className={styles.addressLabelContainer}>
                                            <strong>{addr.label}</strong>
                                            {addr.is_default && <span className={styles.defaultBadge}>Predeterminada</span>}
                                        </div>
                                        <p>{addr.address_reference || 'Sin referencia'}</p>
                                    </div>
                                    <div className={styles.addressActions}>
                                        <button onClick={() => openAddressModal(addr)} className={styles.editButton}>Editar</button>
                                        <button onClick={() => setAddressToDelete(addr)} className={styles.deleteButton}>Eliminar</button>
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

                <div className={styles.logoutSection}>
                    <button onClick={() => setLogoutModalOpen(true)} className={styles.logoutButton}>
                        Cerrar Sesión (Cambiar de número)
                    </button>
                </div>
            </>
        );
    };

    return (
        <div className={styles.container}>
            {renderContent()}
            <AddressModal isOpen={isAddressModalOpen} onClose={() => setAddressModalOpen(false)} onSave={handleSaveAddress} address={editingAddress} customerId={customer?.id} />
            <ConfirmModal isOpen={!!addressToDelete} onClose={() => setAddressToDelete(null)} onConfirm={handleDeleteAddress} title="¿Eliminar Dirección?">
                Estás a punto de eliminar esta dirección. Esta acción no se puede deshacer.
            </ConfirmModal>
            <ConfirmModal isOpen={isLogoutModalOpen} onClose={() => setLogoutModalOpen(false)} onConfirm={confirmLogout} title="¿Cerrar Sesión?">
                Tu número se eliminará de este dispositivo y tendrás que volver a ingresarlo para ver tu perfil y pedidos.
            </ConfirmModal>
        </div>
    );
}