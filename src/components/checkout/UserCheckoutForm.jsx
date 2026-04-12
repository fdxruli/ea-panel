/**
 * UserCheckoutForm.jsx
 * Presentation component: logged-in user checkout with address selection,
 * map display, scheduling, and order summary.
 */
import React from 'react';
import styles from '../../components/CheckoutModal.module.css';
import StaticMap from '../StaticMap';
import AddressModal from '../AddressModal';

const MapPinIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
    <circle cx="12" cy="10" r="3"></circle>
  </svg>
);

const UserIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
    <circle cx="12" cy="7" r="4"></circle>
  </svg>
);

const EditIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
  </svg>
);

export default function UserCheckoutForm({
  customer,
  selectedAddress,
  addresses,
  onAddressSelect,
  onOpenAddressModal,
  isScheduling,
  scheduleDetails,
  onToggleScheduling,
  onScheduleChange,
  subtotal,
  discount,
  total,
  isBusinessOpen,
  onPlaceOrder,
  isSubmitLocked,
  isNetworkBlocked,
  isSubmitting,
  onClose,
  statusNotices,
  getSubmitButtonLabel,
  getActionButtonClassName,
  whatsappFallback,
  onClearWhatsappFallback,
}) {
  const mapInitialPosition =
    selectedAddress
      ? { lat: selectedAddress.latitude, lng: selectedAddress.longitude }
      : null;

  return (
    <div className={styles.robustContainer}>
      <div className={styles.header}>
        <h3>Confirmar Pedido</h3>
        <button
          onClick={onClose}
          className={styles.closeButton}
          disabled={isSubmitting}
        >
          ×
        </button>
      </div>

      {mapInitialPosition && (
        <div className={styles.mapDisplay}>
          <StaticMap
            latitude={mapInitialPosition.lat}
            longitude={mapInitialPosition.lng}
            height={220}
          />
          <div className={styles.mapOverlay}></div>
        </div>
      )}

      <div
        className={`${styles.scrollableContent} ${isNetworkBlocked ? styles.blockedContent : ''}`}
      >
        {statusNotices}

        {/* Address & Customer Details */}
        <div className={styles.detailsGroup}>
          <div className={styles.detailItem}>
            <MapPinIcon />
            <div>
              <strong>{selectedAddress?.label || 'Selecciona una dirección'}</strong>
              <p>{selectedAddress?.address_reference || 'Sin referencia'}</p>
            </div>
          </div>
          <div className={styles.detailItem}>
            <UserIcon />
            <div>
              <strong>Recibe:</strong>
              <p>{customer?.name || '...'}</p>
            </div>
          </div>
        </div>

        {/* Address Actions */}
        <div className={styles.addressActions}>
          {addresses && addresses.length > 1 && (
            <select
              className={styles.addressSelector}
              onChange={(e) =>
                onAddressSelect(addresses.find((a) => a.id === e.target.value))
              }
              value={selectedAddress?.id || ''}
              disabled={isSubmitLocked}
            >
              {addresses.map((addr) => (
                <option key={addr.id} value={addr.id}>
                  {addr.label} -{' '}
                  {addr.address_reference
                    ? addr.address_reference.substring(0, 20) + '...'
                    : ''}
                </option>
              ))}
            </select>
          )}

          {!isNetworkBlocked && (
            <>
              <button
                onClick={() => onOpenAddressModal(selectedAddress)}
                className={styles.editAddressButton}
                disabled={isSubmitting}
              >
                <EditIcon /> Editar
              </button>
              <button
                onClick={() => onOpenAddressModal(null)}
                className={styles.addNewAddressButton}
                disabled={isSubmitting}
              >
                + Añadir Nueva
              </button>
            </>
          )}
        </div>

        {/* Delivery Options */}
        <div className={styles.detailsGroup}>
          <h4>¿Cuándo lo quieres recibir?</h4>
          <div className={styles.deliveryOptions}>
            <button
              className={!isScheduling ? styles.activeOption : ''}
              onClick={() => onToggleScheduling(false)}
              disabled={isSubmitLocked}
            >
              Lo antes posible
            </button>
            <button
              className={isScheduling ? styles.activeOption : ''}
              onClick={() => onToggleScheduling(true)}
              disabled={isSubmitLocked}
            >
              Programar
            </button>
          </div>

          {isScheduling && (
            <div className={styles.schedulePickerContainer}>
              <input
                type="date"
                name="date"
                className={styles.datePicker}
                value={scheduleDetails.date}
                onChange={onScheduleChange}
                min={scheduleDetails.date ? undefined : undefined}
                disabled={isSubmitLocked}
              />
              <div className={styles.timePicker}>
                <select
                  name="hour"
                  value={scheduleDetails.hour}
                  onChange={onScheduleChange}
                  disabled={isSubmitLocked}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <option key={h} value={h < 10 ? `0${h}` : h}>
                      {h}
                    </option>
                  ))}
                </select>
                <span>:</span>
                <select
                  name="minute"
                  value={scheduleDetails.minute}
                  onChange={onScheduleChange}
                  disabled={isSubmitLocked}
                >
                  {['00', '15', '30', '45'].map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <select
                  name="period"
                  value={scheduleDetails.period}
                  onChange={onScheduleChange}
                  disabled={isSubmitLocked}
                >
                  <option value="am">AM</option>
                  <option value="pm">PM</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Order Summary */}
        <div className={styles.summary}>
          <h4>Resumen del pedido</h4>
          <div className={styles.summaryLine}>
            <span>Subtotal</span> <span>${subtotal.toFixed(2)}</span>
          </div>
          {discount && (
            <div className={`${styles.summaryLine} ${styles.discount}`}>
              <span>
                Descuento ({discount.code})
              </span>
              <span>-${discount.amount.toFixed(2)}</span>
            </div>
          )}
          <div className={`${styles.summaryLine} ${styles.total}`}>
            <strong>Total</strong> <strong>${total.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {/* Footer */}
      {whatsappFallback ? (
        <div className={styles.footer}>
          <a
            href={whatsappFallback.url}
            target="_blank"
            rel="noopener noreferrer"
            className={getActionButtonClassName(styles.confirmButton)}
            onClick={() => {
              onClearWhatsappFallback();
              onClose();
            }}
          >
            Haz clic aquí para enviar por WhatsApp
          </a>
        </div>
      ) : (
        <div className={styles.footer}>
          <button
            onClick={onPlaceOrder}
            className={getActionButtonClassName(styles.confirmButton)}
            disabled={isSubmitLocked || !isBusinessOpen}
          >
            {getSubmitButtonLabel(
              isBusinessOpen
                ? `Confirmar y Pagar $${(total || 0).toFixed(2)}`
                : 'Estamos Cerrados'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
