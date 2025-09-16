import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import styles from './MyProfile.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import AddressModal from '../components/AddressModal';
import ConfirmModal from '../components/ConfirmModal'; // <-- 1. IMPORTAMOS EL NUEVO MODAL

export default function MyProfile() {
    const { phone, savePhone, setPhoneModalOpen, clearPhone } = useCustomer();
    const [customer, setCustomer] = useState(null);
    const [addresses, setAddresses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editForm, setEditForm] = useState({ name: '', phone: '' });

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);

    // --- 2. ESTADO PARA CONTROLAR EL MODAL DE CONFIRMACIÓN ---
    const [isConfirmModalOpen, setConfirmModalOpen] = useState(false);

    const fetchCustomerData = useCallback(async () => {
        if (!phone) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const { data, error } = await supabase
                .from('customers')
                .select(`*, customer_addresses(*)`)
                .eq('phone', phone)
                .single();

            if (error || !data) throw new Error("No se pudo cargar tu información.");

            setCustomer(data);
            setAddresses(data.customer_addresses || []);
            setEditForm({ name: data.name, phone: data.phone });

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [phone]);

    useEffect(() => {
        fetchCustomerData();
    }, [fetchCustomerData]);
    
    const handleInfoSubmit = async (e) => {
        e.preventDefault();
        if (editForm.phone !== phone) {
            alert("Has cambiado tu número de teléfono. Esto actualizará tu inicio de sesión.");
        }
        
        const { error } = await supabase
            .from('customers')
            .update({ name: editForm.name, phone: editForm.phone })
            .eq('id', customer.id);

        if (error) {
            setError("Error al actualizar la información.");
        } else {
            alert("Información actualizada con éxito.");
            if(editForm.phone !== phone) {
                savePhone(editForm.phone);
            }
            fetchCustomerData();
        }
    };

    const deleteAddress = async (addressId) => {
        if (window.confirm("¿Estás seguro de que quieres eliminar esta dirección?")) {
            const { error } = await supabase
                .from('customer_addresses')
                .delete()
                .eq('id', addressId);
            
            if (error) {
                alert("Error al eliminar la dirección.");
            } else {
                alert("Dirección eliminada.");
                fetchCustomerData();
            }
        }
    };

    const handleSaveAddress = async (addressData, addressId) => {
        let response;
        if (addressId) {
            response = await supabase
                .from('customer_addresses')
                .update(addressData)
                .eq('id', addressId);
        } else {
            response = await supabase
                .from('customer_addresses')
                .insert(addressData);
        }

        if (response.error) {
            throw new Error(response.error.message);
        }
        
        alert(`Dirección ${addressId ? 'actualizada' : 'guardada'} con éxito.`);
        fetchCustomerData();
    };

    const openAddressModal = (address = null) => {
        setEditingAddress(address);
        setIsModalOpen(true);
    };

    // --- 3. LÓGICA DE CIERRE DE SESIÓN ACTUALIZADA ---
    const handleLogout = () => {
        // Simplemente abre el modal de confirmación
        setConfirmModalOpen(true);
    };

    const confirmLogout = () => {
        // Esta función se ejecuta si el usuario confirma en el modal
        clearPhone();
        setConfirmModalOpen(false);
    };
    // ------------------------------------------------

    if (loading) return <LoadingSpinner />;

    if (!phone) {
        return (
            <div className={styles.container}>
                 <div className={styles.prompt}>
                    <h2>Ingresa tu número para ver tu perfil</h2>
                    <p>Para ver y editar tu información, necesitamos tu número de WhatsApp.</p>
                    <button onClick={() => setPhoneModalOpen(true)} className={styles.actionButton}>
                        Ingresar Número
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h1>Mi Perfil</h1>
            {error && <p className={styles.error}>{error}</p>}
            
            {customer && (
                <>
                    <div className={styles.card}>
                        <h2>Mis Datos</h2>
                        <form onSubmit={handleInfoSubmit} className={styles.form}>
                            <label htmlFor="name">Nombre:</label>
                            <input id="name" type="text" value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} />
                            <label htmlFor="phone">Número de WhatsApp:</label>
                            <input id="phone" type="tel" value={editForm.phone} onChange={(e) => setEditForm({...editForm, phone: e.target.value})} />
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
                                       <button onClick={() => openAddressModal(addr)} className={styles.editButton}>
                                           Editar
                                       </button>
                                       <button onClick={() => deleteAddress(addr.id)} className={styles.deleteButton}>
                                           Eliminar
                                       </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p>No tienes direcciones guardadas.</p>
                        )}
                    </div>

                    <div className={styles.logoutSection}>
                        <button onClick={handleLogout} className={styles.logoutButton}>
                            Cerrar Sesión (Cambiar de número)
                        </button>
                    </div>
                </>
            )}

            <AddressModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSave={handleSaveAddress}
                address={editingAddress}
                customerId={customer?.id}
            />

            {/* --- 4. RENDERIZADO DEL NUEVO MODAL DE CONFIRMACIÓN --- */}
            <ConfirmModal
                isOpen={isConfirmModalOpen}
                onClose={() => setConfirmModalOpen(false)}
                onConfirm={confirmLogout}
                title="¿Cerrar Sesión?"
            >
                Tu número se eliminará de este dispositivo y tendrás que volver a ingresarlo para ver tu perfil y pedidos.
            </ConfirmModal>
        </div>
    );
}