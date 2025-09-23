// src/components/AddressModal.jsx (MODIFICADO)

import React, { useState, useEffect, useCallback } from 'react';
import styles from './AddressModal.module.css';
import ClientOnly from './ClientOnly';
import DynamicMapPicker from './DynamicMapPicker';
import { useAlert } from '../context/AlertContext';

export default function AddressModal({ isOpen, onClose, onSave, address = null, customerId, showSaveOption = false }) {
    const { showAlert } = useAlert();
    const [formData, setFormData] = useState({
        label: '',
        address_reference: '',
        coords: null
    });
    const [shouldSave, setShouldSave] = useState(true); // Estado para el checkbox
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (address) {
            setFormData({
                label: address.label || '',
                address_reference: address.address_reference || '',
                coords: { lat: address.latitude, lng: address.longitude }
            });
            // Si editamos una dirección existente, siempre la guardamos
            setShouldSave(true);
        } else {
             setFormData({ label: 'Casa', address_reference: '', coords: null });
             // Por defecto, la opción de guardar está marcada
             setShouldSave(true);
        }
    }, [address, isOpen]);

    const handleLocationSelect = useCallback((coords) => {
        setFormData(prev => ({ ...prev, coords }));
    }, []);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.coords) {
            showAlert("Por favor, selecciona una ubicación en el mapa.");
            return;
        }
        setIsSubmitting(true);
        try {
            const addressData = {
                customer_id: customerId,
                label: formData.label,
                address_reference: formData.address_reference,
                latitude: formData.coords.lat,
                longitude: formData.coords.lng
            };
            // Si el checkbox no es visible (ej. desde "Mi Perfil"), siempre se guarda.
            // Si es visible, se respeta la decisión del usuario.
            const savePermanently = showSaveOption ? shouldSave : true;
            await onSave(addressData, savePermanently, address?.id);
            onClose();
        } catch (error) {
            showAlert(`Error al procesar la dirección: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;
    
    const mapInitialPosition = address ? { lat: address.latitude, lng: address.longitude } : null;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <button onClick={onClose} className={styles.closeButton}>×</button>
                <h2>{address ? 'Editar Dirección' : 'Nueva Dirección'}</h2>
                
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.mapContainer}>
                       <ClientOnly>
                           <DynamicMapPicker
                                onLocationSelect={handleLocationSelect}
                                initialPosition={mapInitialPosition}
                           />
                       </ClientOnly>
                    </div>

                    <label htmlFor="label">Etiqueta (ej: Casa, Oficina):</label>
                    <input id="label" name="label" type="text" value={formData.label} onChange={handleChange} required />

                    <label htmlFor="address_reference">Referencia (ej: portón rojo):</label>
                    <input id="address_reference" name="address_reference" type="text" value={formData.address_reference} onChange={handleChange} />

                    {/* --- 👇 AQUÍ APARECE EL CHECKBOX CONDICIONALMENTE --- */}
                    {showSaveOption && !address && (
                        <div className={styles.saveOption}>
                            <input
                                type="checkbox"
                                id="shouldSave"
                                checked={shouldSave}
                                onChange={(e) => setShouldSave(e.target.checked)}
                            />
                            <label htmlFor="shouldSave">
                                Guardar esta dirección para futuros pedidos.
                            </label>
                        </div>
                    )}
                    {/* --- 👆 FIN DEL CHECKBOX --- */}


                    <button type="submit" disabled={isSubmitting} className={styles.saveButton}>
                        {isSubmitting ? 'Procesando...' : (address ? 'Guardar Cambios' : 'Usar esta Dirección')}
                    </button>
                </form>
            </div>
        </div>
    );
}