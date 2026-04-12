/**
 * CheckoutSelection.jsx
 * Presentation component: lets the user choose between guest checkout
 * or logging in as a registered customer.
 */
import React from 'react';
import styles from '../../components/CheckoutModal.module.css';

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ color: '#10b981' }}
  >
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

export default function CheckoutSelection({
  total,
  rememberGuest,
  onRememberGuestChange,
  onGuestCheckout,
  onLoginCheckout,
  onResetGuestPreference,
  isSubmitLocked,
  isNetworkBlocked,
  isSubmitting,
  onClose,
  isGuestPreferenceRemembered,
  statusNotices,
  getSubmitButtonLabel,
  getActionButtonClassName,
}) {
  return (
    <div className={styles.selectionRoot}>
      <div className={styles.header}>
        <h3>¿Cómo prefieres pedir?</h3>
        <button
          onClick={onClose}
          className={styles.closeButton}
          disabled={isSubmitting}
        >
          ×
        </button>
      </div>

      <div
        className={`${styles.selectionContainer} ${isNetworkBlocked ? styles.blockedContent : ''}`}
      >
        {statusNotices}

        {/* Guest Option */}
        <div className={`${styles.optionCard} ${styles.guestCard}`}>
          <div className={styles.guestContent}>
            <div className={styles.guestInfo}>
              <span className={styles.guestLabel}>Pedido Rápido</span>
              <span className={styles.guestTotal}>
                Total: ${total.toFixed(2)}
              </span>
            </div>

            <button
              className={getActionButtonClassName(styles.btnGuest)}
              onClick={onGuestCheckout}
              disabled={isSubmitLocked}
            >
              {getSubmitButtonLabel('Pedir sin registrarse')}
            </button>

            {!isNetworkBlocked && (
              <div className={styles.rememberChoice}>
                <input
                  type="checkbox"
                  id="chkRememberGuest"
                  checked={rememberGuest}
                  onChange={(e) => onRememberGuestChange(e.target.checked)}
                  disabled={isSubmitting}
                />
                <label htmlFor="chkRememberGuest">Recordar mi elección</label>
              </div>
            )}
          </div>
        </div>

        <div className={styles.dividerText}>
          <span>o ingresa tu numero</span>
        </div>

        {/* Member Option */}
        <div className={`${styles.optionCard} ${styles.memberCard}`}>
          <div className={styles.cardBadge}>Recomendado</div>
          <h4 className={styles.cardTitle}>Soy Cliente Frecuente</h4>

          <ul className={styles.benefitsList}>
            <li>
              <CheckIcon />{' '}
              <span>
                Guarda tus <strong>direcciones</strong> (Casa, Trabajo)
              </span>
            </li>
            <li>
              <CheckIcon />{' '}
              <span>
                Realiza pedidos en <strong>segundos</strong>
              </span>
            </li>
            <li>
              <CheckIcon />{' '}
              <span>
                Accede a <strong>promociones</strong> exclusivas
              </span>
            </li>
          </ul>

          {!isNetworkBlocked && (
            <button
              className={styles.btnAuth}
              onClick={onLoginCheckout}
              disabled={isSubmitting}
            >
              Ingresar con mi número
            </button>
          )}
        </div>

        {isGuestPreferenceRemembered && !isNetworkBlocked && (
          <button
            onClick={onResetGuestPreference}
            className={styles.textButton}
            disabled={isSubmitting}
          >
            ¿Quieres registrarte o iniciar sesión?
          </button>
        )}
      </div>
    </div>
  );
}
