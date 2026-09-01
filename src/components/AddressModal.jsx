import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import styles from './AddressModal.module.css';
import ClientOnly from './ClientOnly';
import DynamicMapPicker from './DynamicMapPicker';
import { useAlert } from '../context/AlertContext';
import DOMPurify from 'dompurify';

export default function AddressModal({
  isOpen,
  onClose,
  onSave,
  address = null,
  showSaveOption = false,
}) {
  const { showAlert } = useAlert();
  const [formData, setFormData] = useState({
    label: '',
    address_reference: '',
    coords: null,
  });
  const [shouldSave, setShouldSave] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mapPickerRef = useRef(null);

  useEffect(() => {
    if (address) {
      setFormData({
        label: address.label || '',
        address_reference: address.address_reference || '',
        coords: { lat: address.latitude, lng: address.longitude },
      });
      setShouldSave(true);
    } else {
      setFormData({ label: 'Casa', address_reference: '', coords: null });
      setShouldSave(true);
    }
  }, [address, isOpen]);

  const handleLocationSelect = useCallback((coords) => {
    setFormData((previous) => ({ ...previous, coords }));
  }, []);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((previous) => ({ ...previous, [name]: value }));
  };

  const handleAutoLocation = () => {
    mapPickerRef.current?.locateUser();
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!formData.coords) {
      showAlert('Por favor, selecciona una ubicación en el mapa.');
      return;
    }

    setIsSubmitting(true);

    try {
      const addressData = {
        label: DOMPurify.sanitize(formData.label.trim()),
        address_reference: DOMPurify.sanitize(formData.address_reference.trim()),
        latitude: formData.coords.lat,
        longitude: formData.coords.lng,
      };

      const savePermanently = showSaveOption ? shouldSave : true;
      await onSave(addressData, savePermanently, address?.id);
      onClose();
    } catch (error) {
      console.error('[AddressModal] Error:', error);
      showAlert(`Error al procesar la dirección: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const mapInitialPosition = useMemo(() => (
    address ? { lat: address.latitude, lng: address.longitude } : null
  ), [address]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.modalOverlay}
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onClose();
      }}
    >
      <div
        className={styles.modalContent}
        role="dialog"
        aria-modal="true"
        aria-labelledby="address-modal-title"
        aria-describedby="address-modal-description"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className={styles.closeButton}
          disabled={isSubmitting}
          aria-label="Cerrar edición de dirección"
          title="Cerrar"
        >
          ×
        </button>

        <h2 id="address-modal-title">
          {address ? 'Editar Dirección' : 'Nueva Dirección'}
        </h2>
        <p id="address-modal-description" className={styles.modalIntro}>
          Confirma el punto exacto donde quieres recibir tu pedido.
        </p>

        <button
          type="button"
          onClick={handleAutoLocation}
          className={styles.primaryGpsButton}
          disabled={isSubmitting}
        >
          Usar mi ubicación actual
        </button>

        <div className={styles.contentWrapper}>
          <section className={styles.mapSection} aria-labelledby="address-map-title">
            <div className={styles.sectionHeading}>
              <div>
                <span className={styles.stepLabel}>Paso 1</span>
                <h3 id="address-map-title">Elige la ubicación en el mapa</h3>
              </div>
              <span className={styles.requiredBadge}>Requerido</span>
            </div>
            <p className={styles.mapDescription}>
              Revisa el pin y arrástralo hasta la entrada de tu domicilio.
            </p>

            <div className={styles.mapContainer}>
              <ClientOnly>
                <DynamicMapPicker
                  ref={mapPickerRef}
                  onLocationSelect={handleLocationSelect}
                  initialPosition={mapInitialPosition}
                />
              </ClientOnly>
            </div>
          </section>

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.formHeader}>
              <span className={styles.stepLabel}>Paso 2</span>
              <h3>Completa los datos</h3>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="label">Etiqueta (ej. Casa u Oficina)</label>
              <input
                id="label"
                name="label"
                type="text"
                value={formData.label}
                onChange={handleChange}
                required
                disabled={isSubmitting}
                maxLength={50}
                autoComplete="address-line1"
              />
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="address_reference">Referencia (opcional)</label>
              <input
                id="address_reference"
                name="address_reference"
                type="text"
                value={formData.address_reference}
                onChange={handleChange}
                disabled={isSubmitting}
                maxLength={200}
                placeholder="Ej. portón rojo"
                autoComplete="off"
              />
            </div>

            {showSaveOption && !address && (
              <div className={styles.saveOption}>
                <input
                  type="checkbox"
                  id="shouldSave"
                  checked={shouldSave}
                  onChange={(event) => setShouldSave(event.target.checked)}
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
              className={`${styles.saveButton} ${!formData.coords ? styles.disabledAction : ''}`}
            >
              {isSubmitting
                ? 'Procesando...'
                : address
                  ? 'Guardar cambios'
                  : !formData.coords
                    ? 'Arrastra el pin o usa GPS'
                    : 'Confirmar esta dirección'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
