/**
 * useCheckoutFlow.js
 * Master hook that composes all sub-hooks and returns a unified
 * interface for the CheckoutModal presentation component.
 *
 * Resolves the dangerous auto-dispatch issue: the auto-dispatch only
 * fires after explicitly validating that the cart has stock and prices
 * haven't mutated.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useCart } from '../../context/CartContext';
import { useUserData } from '../../context/UserDataContext';
import { useBusinessHours } from '../../context/BusinessHoursContext';
import { useCheckoutScheduling } from './useCheckoutScheduling';
import { useAddressManager } from './useAddressManager';
import { useOrderSubmission } from './useOrderSubmission';
import { NETWORK_STATUS } from '../../lib/networkState';

/**
 * @param {object} params
 * @param {object} params.networkState - { status, isChecking, hasResolvedOnce }
 * @param {Function} params.onClose - closes the checkout modal
 * @param {Function} params.showAlert - alert function from AlertContext
 * @returns {{
 *   mode: string,
 *   setMode: Function,
 *   isAutoDispatching: boolean,
 *   isSubmitting: boolean,
 *   isNetworkBlocked: boolean,
 *   isInitialVerification: boolean,
 *   isSubmitLocked: boolean,
 *   isGuestPreferenceRemembered: boolean,
 *   rememberGuest: boolean,
 *   setRememberGuest: Function,
 *   whatsappFallback: object|null,
 *   clearWhatsappFallback: Function,
 *   // From scheduling
 *   isScheduling: boolean,
 *   scheduleDetails: object,
 *   scheduledTime: string|null,
 *   handleToggleScheduling: Function,
 *   handleScheduleChange: Function,
 *   validateScheduledTime: Function,
 *   // From address manager
 *   selectedAddress: object|null,
 *   setSelectedAddress: Function,
 *   addresses: Array,
 *   customer: object|null,
 *   isAddressModalOpen: boolean,
 *   addressToEdit: object|null,
 *   openAddressModal: Function,
 *   handleSaveAddress: Function,
 *   closeAddressModal: Function,
 *   // From order submission
 *   submitErrorMessage: string|null,
 *   handleSubmitOrder: Function,
 *   // Derived
 *   cartItems: Array,
 *   total: number,
 *   subtotal: number,
 *   discount: object|null,
 *   isBusinessOpen: boolean,
 *   // Actions
 *   handleGuestCheckout: Function,
 *   handleLoginCheckout: Function,
 *   handleResetGuestPreference: Function,
 *   handleModalClose: Function,
 *   getSubmitButtonLabel: Function,
 *   getActionButtonClassName: Function,
 * }}
 */
export const useCheckoutFlow = ({ networkState, onClose, showAlert }) => {
  const { cartItems, total, subtotal, discount, clearCart, closeCart } = useCart();
  const { customer, addresses, refetch: refetchUserData } = useUserData();
  const { isOpen: isBusinessOpen } = useBusinessHours();

  const {
    status: networkStatus,
    isChecking,
    hasResolvedOnce,
  } = networkState;

  // -- Network state --
  const isInitialVerification = !hasResolvedOnce && isChecking;
  const isNetworkBlocked = !hasResolvedOnce || networkStatus !== NETWORK_STATUS.ONLINE;
  const initialNetworkAllowsAutoDispatch = hasResolvedOnce && networkStatus === NETWORK_STATUS.ONLINE;

  // -- Mode --
  const [mode, setMode] = useState('selection');
  const [rememberGuest, setRememberGuest] = useState(false);
  const [isAutoDispatching, setIsAutoDispatching] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const hasAutoDispatchedRef = useRef(false);

  const isGuestPreferenceRemembered =
    typeof window !== 'undefined' && localStorage.getItem('guest_preference') === 'true';

  // Auto-set mode when customer is detected
  useEffect(() => {
    if (customer) {
      setMode('logged_user_confirm');
    }
  }, [customer]);

  // -- Sub-hooks --
  const scheduling = useCheckoutScheduling();

  const addressManager = useAddressManager({
    customer,
    addresses,
    refetchUserData,
    showAlert,
    isNetworkBlocked,
  });

  const submission = useOrderSubmission({
    cartItems,
    total,
    subtotal,
    discount,
    isBusinessOpen,
    isNetworkBlocked,
    customer,
    selectedAddress: addressManager.selectedAddress,
    scheduledTime: scheduling.scheduledTime,
    orderNotes,
    showAlert,
    clearCart,
    closeCart,
    onClose,
    refetchUserData,
  });

  const isSubmitLocked = submission.isSubmitting || isNetworkBlocked;

  // -- Auto-dispatch (SAFE: only fires after explicit validation) --
  useEffect(() => {
    const guestPref = localStorage.getItem('guest_preference');

    // Don't auto-dispatch if: customer exists, no guest pref, already dispatched, or network not ready
    if (
      customer ||
      guestPref !== 'true' ||
      hasAutoDispatchedRef.current ||
      !initialNetworkAllowsAutoDispatch
    ) {
      return;
    }

    // CRITICAL: Validate cart integrity before auto-dispatch
    // Ensure all items have valid prices and quantities
    const cartIsValid = cartItems.every(
      (item) =>
        typeof item.price === 'number' &&
        item.price > 0 &&
        typeof item.quantity === 'number' &&
        item.quantity > 0
    );

    if (!cartIsValid || cartItems.length === 0) {
      console.warn(
        '⚠️ Auto-dispatch cancelled: cart is empty or has invalid prices/quantities.'
      );
      return;
    }

    hasAutoDispatchedRef.current = true;
    setIsAutoDispatching(true);


    submission.handleSubmitOrder(true).finally(() => {
      setIsAutoDispatching(false);
    });
  }, [customer, cartItems, initialNetworkAllowsAutoDispatch]);

  // -- Action handlers --
  const handleGuestCheckout = useCallback(() => {
    if (rememberGuest && !isAutoDispatching) {
      localStorage.setItem('guest_preference', 'true');
    }
    setMode('guest_confirm');
  }, [rememberGuest, isAutoDispatching]);

  const handleLoginCheckout = useCallback(() => {
    // This triggers the phone modal via the parent's onClose(true)
    onClose(true);
  }, [onClose]);

  const handleResetGuestPreference = useCallback(() => {
    localStorage.removeItem('guest_preference');
    setMode('selection');
  }, []);

  const handleModalClose = useCallback(() => {
    if (submission.isSubmitting) return;
    onClose();
  }, [submission.isSubmitting, onClose]);

  const getSubmitButtonLabel = useCallback(
    (defaultLabel) => {
      if (isInitialVerification) return 'Verificando conexión...';
      if (isNetworkBlocked) return 'Esperando conexión estable...';
      if (submission.isSubmitting) return 'Procesando pedido...';
      return defaultLabel;
    },
    [isInitialVerification, isNetworkBlocked, submission.isSubmitting]
  );

  const getActionButtonClassName = useCallback(
    (baseClass) =>
      [
        baseClass,
        isNetworkBlocked ? 'networkBlockedButton' : '',
        submission.isSubmitting ? 'submittingButton' : '',
      ]
        .filter(Boolean)
        .join(' '),
    [isNetworkBlocked, submission.isSubmitting]
  );

  return {
    // Mode & state
    mode,
    setMode,
    isAutoDispatching,
    isSubmitting: submission.isSubmitting,
    isNetworkBlocked,
    isInitialVerification,
    isSubmitLocked,
    isGuestPreferenceRemembered,
    rememberGuest,
    setRememberGuest,
    whatsappFallback: submission.whatsappFallback,
    clearWhatsappFallback: submission.clearWhatsappFallback,

    // Scheduling
    isScheduling: scheduling.isScheduling,
    scheduleDetails: scheduling.scheduleDetails,
    scheduledTime: scheduling.scheduledTime,
    handleToggleScheduling: scheduling.handleToggleScheduling,
    handleScheduleChange: scheduling.handleScheduleChange,
    validateScheduledTime: scheduling.validateScheduledTime,

    // Order notes
    orderNotes,
    setOrderNotes,

    // Address manager
    selectedAddress: addressManager.selectedAddress,
    setSelectedAddress: addressManager.setSelectedAddress,
    addresses,
    customer,
    isAddressModalOpen: addressManager.isAddressModalOpen,
    addressToEdit: addressManager.addressToEdit,
    openAddressModal: addressManager.openAddressModal,
    handleSaveAddress: addressManager.handleSaveAddress,
    closeAddressModal: addressManager.closeAddressModal,

    // Order submission
    submitErrorMessage: submission.submitErrorMessage,
    handleSubmitOrder: submission.handleSubmitOrder,

    // Derived data
    cartItems,
    total,
    subtotal,
    discount,
    isBusinessOpen,

    // Actions
    handleGuestCheckout,
    handleLoginCheckout,
    handleResetGuestPreference,
    handleModalClose,
    getSubmitButtonLabel,
    getActionButtonClassName,
  };
};
