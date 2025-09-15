import React, { useState, useEffect, useCallback } from 'react';
import styles from './AddressModal.module.css';
import ClientOnly from './ClientOnly';
import DynamicMapPicker from './DynamicMapPicker';

export default function AddressModal({ isOpen, onClose, onSave, address = null, customerId }) {
    const [formData, setFormData] = useState({
        label: '',
        address_reference: '',
        coords: null
    });
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (address) {
            setFormData({
                label: address.label || '',
                address_reference: address.address_reference || '',
                coords: { lat: address.latitude, lng: address.longitude }
            });
        } else {
             setFormData({ label: 'Casa', address_reference: '', coords: null });
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
            alert("Por favor, selecciona una ubicación en el mapa.");
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
            await onSave(addressData, address?.id); // Pasa los datos y el ID (si existe)
            onClose();
        } catch (error) {
            alert(`Error al guardar la dirección: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <button onClick={onClose} className={styles.closeButton}>×</button>
                <h2>{address ? 'Editar Dirección' : 'Nueva Dirección'}</h2>
                
                <form onSubmit={handleSubmit} className={styles.form}>
                    <div className={styles.mapContainer}>
                       <ClientOnly>
                           <DynamicMapPicker onLocationSelect={handleLocationSelect} />
                       </ClientOnly>
                    </div>

                    <label htmlFor="label">Etiqueta (ej: Casa, Oficina):</label>
                    <input
                        id="label"
                        name="label"
                        type="text"
                        value={formData.label}
                        onChange={handleChange}
                        required
                    />

                    <label htmlFor="address_reference">Referencia (ej: portón rojo):</label>
                    <input
                        id="address_reference"
                        name="address_reference"
                        type="text"
                        value={formData.address_reference}
                        onChange={handleChange}
                    />

                    <button type="submit" disabled={isSubmitting} className={styles.saveButton}>
                        {isSubmitting ? 'Guardando...' : 'Guardar Dirección'}
                    </button>
                </form>
            </div>
        </div>
    );
}