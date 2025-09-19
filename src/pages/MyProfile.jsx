// src/pages/MyProfile.jsx (CORREGIDO)

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import styles from './MyProfile.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import AddressModal from '../components/AddressModal';
import ConfirmModal from '../components/ConfirmModal';
import { useAlert } from '../context/AlertContext';

export default function MyProfile() {
    const { showAlert } = useAlert();
    const { phone, setPhoneModalOpen, clearPhone, savePhone, setCheckoutModalOpen } = useCustomer();
    
    const { customer, addresses, loading, error, refetch } = useUserData();

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


    const handleInfoSubmit = async (e) => {
        e.preventDefault();
        const { error } = await supabase
            .from('customers')
            .update({ name: editForm.name, phone: editForm.phone })
            .eq('id', customer.id);

        if (error) {
            showAlert("Error al actualizar la información.");
        } else {
            showAlert("Información actualizada con éxito.");
            if (editForm.phone !== phone) {
                savePhone(editForm.phone);
            } else {
                refetch();
            }
        }
    };

    const handleDeleteAddress = async () => {
        if (!addressToDelete) return;
        await supabase.from('customer_addresses').delete().eq('id', addressToDelete.id);
        setAddressToDelete(null);
        refetch();
    };

    const handleSaveAddress = async (addressData, addressId) => {
        let response;
        if (addressId) {
            response = await supabase.from('customer_addresses').update(addressData).eq('id', addressId);
        } else {
            response = await supabase.from('customer_addresses').insert(addressData);
        }
        if (response.error) throw new Error(response.error.message);

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
        if (!phone) {
            return (
                <div className={styles.prompt}>
                    <h2>Ingresa tu número para ver tu perfil</h2>
                    <p>Para ver y editar tu información, necesitamos tu número de WhatsApp.</p>
                    <button onClick={() => setPhoneModalOpen(true)} className={styles.actionButton}>
                        Ingresar Número
                    </button>
                </div>
            );
        }

        if (loading) return <LoadingSpinner />;

        if (error) {
            return (
                <div className={styles.prompt}>
                    <h2>Error Inesperado</h2>
                    <p>No pudimos cargar tus datos. Por favor, intenta de nuevo más tarde.</p>
                </div>
            );
        }

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

        if (customer) {
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

                    <div className={styles.card}>
                        <div className={styles.addressHeader}>
                            <h2>Mis Direcciones</h2>
                            <button onClick={() => openAddressModal()} className={styles.addButton}>
                                + Añadir Nueva
                            </button>
                        </div>
                        {addresses.length > 0 ? (
                            addresses.map(addr => (
                                <div key={addr.id} className={styles.addressItem}>
                                    <div>
                                        <strong>{addr.label}</strong>
                                        <p>{addr.address_reference || 'Sin referencia'}</p>
                                    </div>
                                    <div className={styles.addressActions}>
                                        <button onClick={() => openAddressModal(addr)} className={styles.editButton}>Editar</button>
                                        <button onClick={() => setAddressToDelete(addr)} className={styles.deleteButton}>Eliminar</button>
                                    </div>
                                </div>
                            ))
                        ) : <p>No tienes direcciones guardadas.</p>}
                    </div>

                    <div className={styles.logoutSection}>
                        <button onClick={() => setLogoutModalOpen(true)} className={styles.logoutButton}>
                            Cerrar Sesión (Cambiar de número)
                        </button>
                    </div>
                </>
            );
        }

        return null;
    };

    return (
        <div className={styles.container}>
            <h1>Mi Perfil</h1>
            {renderContent()}

            <AddressModal
                isOpen={isAddressModalOpen}
                onClose={() => setAddressModalOpen(false)}
                onSave={handleSaveAddress}
                address={editingAddress}
                customerId={customer?.id}
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
                isOpen={isLogoutModalOpen}
                onClose={() => setLogoutModalOpen(false)}
                onConfirm={confirmLogout}
                title="¿Cerrar Sesión?"
            >
                Tu número se eliminará de este dispositivo y tendrás que volver a ingresarlo para ver tu perfil y pedidos.
            </ConfirmModal>
        </div>
    );
}