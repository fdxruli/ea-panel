import React, { useState, useEffect, useCallback, useRef } from 'react';
import styles from './AddressModal.module.css';
import ClientOnly from './ClientOnly';
import DynamicMapPicker from './DynamicMapPicker';
import { useAlert } from '../context/AlertContext';
import DOMPurify from 'dompurify';

export default function AddressModal({ isOpen, onClose, onSave, address = null, customerId, showSaveOption = false }) {
    const { showAlert } = useAlert();
    const [formData, setFormData] = useState({
        label: '',
        address_reference: '',
        coords: null
    });
    const [shouldSave, setShouldSave] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const mapPickerRef = useRef(null);

    useEffect(() => {
        if (address) {
            setFormData({
                label: address.label || '',
                address_reference: address.address_reference || '',
                coords: { lat: address.latitude, lng: address.longitude }
            });
            setShouldSave(true);
        } else {
             setFormData({ label: 'Casa', address_reference: '', coords: null });
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

    const handleAutoLocation = () => {
        if (mapPickerRef.current) {
            mapPickerRef.current.locateUser();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!formData.coords) {
            showAlert("Por favor, selecciona una ubicación en el mapa.");
            return;
        }
        
        setIsSubmitting(true);
        
        try {
            // 🔧 CAMBIO CRÍTICO: Simplificar y dejar que CheckoutModal maneje la DB
            const addressData = {
                label: DOMPurify.sanitize(formData.label.trim()),
                address_reference: DOMPurify.sanitize(formData.address_reference.trim()),
                latitude: formData.coords.lat,
                longitude: formData.coords.lng
            };
            
            const savePermanently = showSaveOption ? shouldSave : true;
            
            // 🔧 CAMBIO CRÍTICO: Esperar a que termine onSave
            await onSave(addressData, savePermanently, address?.id);
            
            // Solo cerrar si todo salió bien
            onClose();
            
        } catch (error) {
            console.error('[AddressModal] Error:', error);
            showAlert(`Error al procesar la dirección: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;
    
    const mapInitialPosition = address ? { lat: address.latitude, lng: address.longitude } : null;

    return (
        <div className={styles.modalOverlay} onClick={(e) => {
            // Prevenir cierre al hacer clic en el overlay si están enviando
            if (!isSubmitting) onClose();
        }}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <button 
                    onClick={onClose} 
                    className={styles.closeButton}
                    disabled={isSubmitting}
                >
                    ×
                </button>
                
                <h2>{address ? 'Editar Dirección' : 'Nueva Dirección'}</h2>
                
                <div className={styles.contentWrapper}>
                    <div className={styles.mapContainer}>
                       <ClientOnly>
                           <DynamicMapPicker
                                ref={mapPickerRef}
                                onLocationSelect={handleLocationSelect}
                                initialPosition={mapInitialPosition}
                           />
                       </ClientOnly>
                    </div>

                    <form onSubmit={handleSubmit} className={styles.form}>
                        <button 
                            type="button" 
                            onClick={handleAutoLocation} 
                            className={styles.locationButton}
                            disabled={isSubmitting}
                        >
                            Ubicarme automáticamente
                        </button>

                        <label htmlFor="label">Etiqueta (ej: Casa, Oficina):</label>
                        <input 
                            id="label" 
                            name="label" 
                            type="text" 
                            value={formData.label} 
                            onChange={handleChange} 
                            required 
                            disabled={isSubmitting}
                            maxLength={50}
                        />

                        <label htmlFor="address_reference">Referencia (ej: portón rojo):</label>
                        <input 
                            id="address_reference" 
                            name="address_reference" 
                            type="text" 
                            value={formData.address_reference} 
                            onChange={handleChange}
                            disabled={isSubmitting}
                            maxLength={200}
                        />

                        {showSaveOption && !address && (
                            <div className={styles.saveOption}>
                                <input
                                    type="checkbox"
                                    id="shouldSave"
                                    checked={shouldSave}
                                    onChange={(e) => setShouldSave(e.target.checked)}
                                    disabled={isSubmitting}
                                />
                                <label htmlFor="shouldSave">
                                    Guardar esta dirección para futuros pedidos.
                                </label>
                            </div>
                        )}

                        <button 
                            type="submit" 
                            disabled={isSubmitting || !formData.coords} 
                            className={styles.saveButton}
                        >
                            {isSubmitting ? 'Procesando...' : (address ? 'Guardar Cambios' : 'Usar esta Dirección')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}