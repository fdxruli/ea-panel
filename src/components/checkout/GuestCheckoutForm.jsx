/**
 * GuestCheckoutForm.jsx
 * Presentation component: confirms a guest order and shows the
 * WhatsApp fallback button if the automatic redirect was blocked.
 */
import React from 'react';
import styles from '../../components/CheckoutModal.module.css';

export default function GuestCheckoutForm({
  total,
  onPlaceOrder,
  onBack,
  onResetGuestPreference,
  isSubmitLocked,
  isNetworkBlocked,
  isSubmitting,
  onClose,
  statusNotices,
  getSubmitButtonLabel,
  getActionButtonClassName,
  isGuestPreferenceRemembered,
  whatsappFallback,
  onClearWhatsappFallback,
}) {
  return (
    <div className={styles.confirmContainer}>
      <div className={styles.header}>
        <h3>Confirmar Pedido Rápido</h3>
        <button
          onClick={onClose}
          className={styles.closeButton}
          disabled={isSubmitting}
        >
          ×
        </button>
      </div>

      <div
        className={`${styles.summaryCompact} ${isNetworkBlocked ? styles.blockedContent : ''}`}
      >
        {statusNotices}
        <p>
          Total a pagar: <strong>${total.toFixed(2)}</strong>
        </p>
        <p className={styles.helperText}>
          Al enviar, se abrirá WhatsApp con los detalles de tu pedido.
        </p>
      </div>

      {/* WhatsApp Fallback: shown when window.open was blocked */}
      {whatsappFallback && (
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
      )}

      {!whatsappFallback && (
        <div className={styles.footer}>
          <button
            className={getActionButtonClassName(styles.confirmButton)}
            onClick={onPlaceOrder}
            disabled={isSubmitLocked}
          >
            {getSubmitButtonLabel('Enviar Pedido por WhatsApp')}
          </button>

          {!isNetworkBlocked && (
            <div className={styles.secondaryActions}>
              <button
                className={styles.backButton}
                onClick={onBack}
                disabled={isSubmitting}
              >
                Atrás
              </button>

              {isGuestPreferenceRemembered && (
                <button
                  onClick={onResetGuestPreference}
                  className={styles.textButton}
                  disabled={isSubmitting}
                >
                  ¿Quieres registrarte o iniciar sesión?
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
