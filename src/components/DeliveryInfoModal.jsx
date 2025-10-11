import React from 'react';
import styles from './DeliveryInfoModal.module.css';
import DynamicMapPicker from './DynamicMapPicker';
import ClientOnly from './ClientOnly';

const DeliveryInfoModal = ({ isOpen, onClose, deliveryInfo }) => {
    if (!isOpen || !deliveryInfo) return null;

    const { customer, address } = deliveryInfo;
    const mapPosition = address ? { lat: address.latitude, lng: address.longitude } : null;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3>Detalles de Entrega</h3>
                    <button onClick={onClose} className={styles.closeButton}>×</button>
                </div>
                <div className={styles.body}>
                    <div className={styles.customerDetails}>
                        <h4>Cliente</h4>
                        <p><strong>Nombre:</strong> {customer?.name || 'N/A'}</p>
                        <p><strong>Teléfono:</strong> {customer?.phone || 'N/A'}</p>
                    </div>
                    <div className={styles.addressDetails}>
                        <h4>Dirección</h4>
                        {address ? (
                            <>
                                <p><strong>Etiqueta:</strong> {address.label}</p>
                                <p><strong>Referencia:</strong> {address.address_reference || 'Sin referencia'}</p>
                            </>
                        ) : (
                            <p>El cliente no tiene una dirección predeterminada guardada.</p>
                        )}
                    </div>
                    <div className={styles.mapContainer}>
                        {mapPosition ? (
                            <ClientOnly>
                                <DynamicMapPicker
                                    initialPosition={mapPosition}
                                    isDraggable={false}
                                />
                            </ClientOnly>
                        ) : (
                            <div className={styles.noMap}>
                                <p>No hay ubicación para mostrar.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DeliveryInfoModal;