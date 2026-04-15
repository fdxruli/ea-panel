// src/components/CheckoutModal.jsx
// REFACTORED: Thin presentation shell that delegates to sub-components and hooks.
import React, { useMemo } from 'react';
import { useAlert } from '../context/AlertContext';
import styles from './CheckoutModal.module.css';

// Hooks
import { useCheckoutFlow } from '../hooks/checkout/useCheckoutFlow';
import { NETWORK_STATUS } from '../lib/networkState';

// Sub-components
import CheckoutSelection from './checkout/CheckoutSelection';
import GuestCheckoutForm from './checkout/GuestCheckoutForm';
import UserCheckoutForm from './checkout/UserCheckoutForm';
import AutoDispatchView from './checkout/AutoDispatchView';
import AddressModal from './AddressModal';

/**
 * Status notices component (network errors, submit errors, etc.)
 */
const StatusNotices = ({ submitErrorMessage, isInitialVerification, isNetworkBlocked, networkWarningMessage }) => (
  <>
    {submitErrorMessage && (
      <div className={`${styles.statusNotice} ${styles.submitError}`} role="alert">
        {submitErrorMessage}
      </div>
    )}
    {isInitialVerification && (
      <div className={`${styles.statusNotice} ${styles.networkWarning}`} role="status" aria-live="polite">
        <span>Estamos verificando la conexión antes de continuar con tu pedido.</span>
      </div>
    )}
    {!isInitialVerification && isNetworkBlocked && (
      <div className={`${styles.statusNotice} ${styles.networkWarning}`} role="status" aria-live="polite">
        <strong>Se necesita una conexión estable para continuar con tu pedido.</strong>
        <span>{networkWarningMessage}</span>
      </div>
    )}
  </>
);

export default function CheckoutModal({ onClose, networkState }) {
  const { showAlert } = useAlert();

  const flow = useCheckoutFlow({ networkState, onClose, showAlert });

  const networkWarningMessage =
    networkState.status === NETWORK_STATUS.SLOW
      ? 'La conexión está demasiado lenta. Espera a que vuelva a ser estable para continuar.'
      : 'No hay conexión con el servidor. Cuando se recupere podrás continuar con tu pedido.';

  const statusNotices = useMemo(
    () => (
      <StatusNotices
        submitErrorMessage={flow.submitErrorMessage}
        isInitialVerification={flow.isInitialVerification}
        isNetworkBlocked={flow.isNetworkBlocked}
        networkWarningMessage={networkWarningMessage}
      />
    ),
    [flow.submitErrorMessage, flow.isInitialVerification, flow.isNetworkBlocked, networkWarningMessage]
  );

  // Route to the correct view
  if (flow.isAutoDispatching) {
    return (
      <div className={styles.modalOverlay} onClick={flow.handleModalClose}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <AutoDispatchView />
        </div>
      </div>
    );
  }

  // Selection mode (guest vs login)
  if (flow.mode === 'selection' && !flow.customer) {
    return (
      <div className={styles.modalOverlay} onClick={flow.handleModalClose}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <CheckoutSelection
            total={flow.total}
            rememberGuest={flow.rememberGuest}
            onRememberGuestChange={flow.setRememberGuest}
            onGuestCheckout={flow.handleGuestCheckout}
            onLoginCheckout={flow.handleLoginCheckout}
            onResetGuestPreference={flow.handleResetGuestPreference}
            isSubmitLocked={flow.isSubmitLocked}
            isNetworkBlocked={flow.isNetworkBlocked}
            isSubmitting={flow.isSubmitting}
            onClose={flow.handleModalClose}
            isGuestPreferenceRemembered={flow.isGuestPreferenceRemembered}
            statusNotices={statusNotices}
            getSubmitButtonLabel={flow.getSubmitButtonLabel}
            getActionButtonClassName={flow.getActionButtonClassName}
          />
        </div>

        {/* Address modal is rendered outside for selection mode edge cases */}
        {flow.isAddressModalOpen && (
          <AddressModal
            isOpen={flow.isAddressModalOpen}
            onClose={flow.closeAddressModal}
            onSave={flow.handleSaveAddress}
            address={flow.addressToEdit}
            customerId={flow.customer?.id}
            showSaveOption={true}
          />
        )}
      </div>
    );
  }

  // Guest confirmation mode
  if (flow.mode === 'guest_confirm') {
    return (
      <div className={styles.modalOverlay} onClick={flow.handleModalClose}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <GuestCheckoutForm
            total={flow.total}
            onPlaceOrder={() => flow.handleSubmitOrder(true)}
            onBack={() => flow.setMode('selection')}
            onResetGuestPreference={flow.handleResetGuestPreference}
            isSubmitLocked={flow.isSubmitLocked}
            isNetworkBlocked={flow.isNetworkBlocked}
            isSubmitting={flow.isSubmitting}
            onClose={flow.handleModalClose}
            statusNotices={statusNotices}
            getSubmitButtonLabel={flow.getSubmitButtonLabel}
            getActionButtonClassName={flow.getActionButtonClassName}
            isGuestPreferenceRemembered={flow.isGuestPreferenceRemembered}
            whatsappFallback={flow.whatsappFallback}
            onClearWhatsappFallback={flow.clearWhatsappFallback}
          />
        </div>
      </div>
    );
  }

  // Logged-in user confirmation
  if (flow.mode === 'logged_user_confirm') {
    return (
      <div className={styles.modalOverlay} onClick={flow.handleModalClose}>
        <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
          <UserCheckoutForm
            customer={flow.customer}
            selectedAddress={flow.selectedAddress}
            addresses={flow.addresses}
            onAddressSelect={flow.setSelectedAddress}
            onOpenAddressModal={flow.openAddressModal}
            isScheduling={flow.isScheduling}
            scheduleDetails={flow.scheduleDetails}
            onToggleScheduling={flow.handleToggleScheduling}
            onScheduleChange={flow.handleScheduleChange}
            subtotal={flow.subtotal}
            discount={flow.discount}
            total={flow.total}
            isBusinessOpen={flow.isBusinessOpen}
            onPlaceOrder={() => {
              // Validate scheduling before submit
              const validation = flow.validateScheduledTime();
              if (!validation.ok) {
                showAlert(validation.error, 'warning');
                return;
              }
              flow.handleSubmitOrder(false);
            }}
            isSubmitLocked={flow.isSubmitLocked}
            isNetworkBlocked={flow.isNetworkBlocked}
            isSubmitting={flow.isSubmitting}
            onClose={flow.handleModalClose}
            statusNotices={statusNotices}
            getSubmitButtonLabel={flow.getSubmitButtonLabel}
            getActionButtonClassName={flow.getActionButtonClassName}
            whatsappFallback={flow.whatsappFallback}
            onClearWhatsappFallback={flow.clearWhatsappFallback}
            orderNotes={flow.orderNotes}
            onOrderNotesChange={flow.setOrderNotes}
          />
        </div>

        {flow.isAddressModalOpen && (
          <AddressModal
            isOpen={flow.isAddressModalOpen}
            onClose={flow.closeAddressModal}
            onSave={flow.handleSaveAddress}
            address={flow.addressToEdit}
            customerId={flow.customer?.id}
            showSaveOption={true}
          />
        )}
      </div>
    );
  }

  // Fallback: shouldn't happen but handle gracefully
  return null;
}
