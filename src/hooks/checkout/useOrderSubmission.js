/**
 * useOrderSubmission.js
 * Orchestrator hook for order submission.
 * Calls orderService, then whatsappService, and manages isSubmitting/error states.
 *
 * Resolves the orphaned orders issue: separates order creation from WhatsApp
 * redirection, providing a fallback UI if window.open is blocked.
 */
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { createOrder, deactivateSingleUseDiscount, isNetworkRequestError, NETWORK_BLOCKED_MESSAGE, NETWORK_SUBMIT_ERROR_MESSAGE } from '../../services/orderService';
import { buildOrderMessage, getWhatsAppUrl } from '../../services/whatsappService';
import { GUEST_CUSTOMER_ID } from '../../config/constantes';

/**
 * @param {object} params
 * @param {Array} params.cartItems
 * @param {number} params.total
 * @param {number} params.subtotal
 * @param {object|null} params.discount
 * @param {boolean} params.isBusinessOpen
 * @param {boolean} params.isNetworkBlocked
 * @param {object|null} params.customer
 * @param {object|null} params.selectedAddress
 * @param {string|null} params.scheduledTime
 * @param {string|null} params.orderNotes
 * @param {Function} params.showAlert
 * @param {Function} params.clearCart
 * @param {Function} params.closeCart
 * @param {Function} params.onClose
 * @param {Function} params.refetchUserData
 * @returns {{
 *   isSubmitting: boolean,
 *   submitErrorMessage: string|null,
 *   whatsappFallback: { url: string|null, orderCode: string|null }|null,
 *   clearWhatsappFallback: () => void,
 *   handleSubmitOrder: (isGuest: boolean) => Promise<void>,
 * }}
 */
export const useOrderSubmission = ({
  cartItems,
  total,
  subtotal,
  discount,
  isBusinessOpen,
  isNetworkBlocked,
  customer,
  selectedAddress,
  scheduledTime,
  orderNotes,
  showAlert,
  clearCart,
  closeCart,
  onClose,
  refetchUserData,
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitErrorMessage, setSubmitErrorMessage] = useState(null);
  const [whatsappFallback, setWhatsappFallback] = useState(null);

  const clearWhatsappFallback = useCallback(() => {
    setWhatsappFallback(null);
  }, []);

  const handleSubmitOrder = useCallback(
    async (isGuest) => {
      if (isSubmitting || isNetworkBlocked) return;

      if (!isBusinessOpen) {
        showAlert(
          'Lo sentimos, el negocio está cerrado y no podemos procesar tu pedido ahora.'
        );
        return;
      }

      setSubmitErrorMessage(null);
      setWhatsappFallback(null);

      // Validate logged-in user requirements
      if (!isGuest) {
        if (!customer) {
          showAlert('Error: No se detectó tu sesión. Por favor, recarga la página.');
          return;
        }
        if (!selectedAddress) {
          showAlert('Por favor, selecciona o añade una dirección de entrega.');
          return;
        }
        if (scheduledTime) {
          // 2-hour validation should already be done by useCheckoutScheduling
          const scheduledDate = new Date(scheduledTime);
          const now = new Date();
          const minTimeInMs = 2 * 60 * 60 * 1000;
          if (scheduledDate - now < minTimeInMs) {
            showAlert(
              'Para pedidos inmediatos, es mejor elegir la opción "Lo antes posible". La programación requiere al menos 2 horas de anticipación.',
              'warning'
            );
            return;
          }
        }
      }

      setIsSubmitting(true);

      try {
        const targetCustomerId = isGuest ? GUEST_CUSTOMER_ID : customer.id;

        // STEP 1: Create order in Supabase (separate from WhatsApp redirect)
        const { ok, order, error } = await createOrder(supabase, {
          customerId: targetCustomerId,
          totalAmount: total,
          scheduledFor: !isGuest && scheduledTime ? scheduledTime : null,
          cartItems,
          notes: orderNotes?.trim() || null,
        });

        if (!ok || !order) {
          throw error || new Error('No se pudo crear el pedido.');
        }

        // STEP 2: Handle single-use discount deactivation
        if (!isGuest && discount?.details?.is_single_use) {
          await deactivateSingleUseDiscount(supabase, {
            customerId: customer.id,
            discountId: discount.details.id,
          });
        }

        // STEP 3: Build WhatsApp message and URL
        const message = buildOrderMessage({
          isGuest,
          orderCode: order.order_code,
          cartItems,
          subtotal,
          total,
          discount: discount ? { code: discount.code, amount: discount.amount } : null,
          scheduledISO: scheduledTime,
          notes: orderNotes,
          customer,
          address: selectedAddress,
        });

        const whatsappUrl = getWhatsAppUrl(message);

        // STEP 4: Attempt WhatsApp redirect with fallback
        // Instead of immediately closing the modal, we store the URL
        // so the UI can show a fallback button if window.open is blocked.
        setWhatsappFallback({ url: whatsappUrl, orderCode: order.order_code });

        // Try to open WhatsApp
        const opened = window.open(whatsappUrl, '_blank');

        if (opened) {
          // Success: clear cart and close
          clearCart();
          if (closeCart) closeCart();
          onClose();
          if (!isGuest) refetchUserData();
        } else {
          // Blocked: keep the modal open with a fallback button
          showAlert(
            '¡Pedido creado! Haz clic en el botón para enviar por WhatsApp.',
            'success'
          );
        }
      } catch (error) {
        console.error('Error processing order:', error);
        setIsSubmitting(false);

        if (isNetworkRequestError(error)) {
          setSubmitErrorMessage(NETWORK_SUBMIT_ERROR_MESSAGE);
          showAlert(NETWORK_SUBMIT_ERROR_MESSAGE, 'error');
          return;
        }

        if (error?.message && error.message.includes('Stock insuficiente')) {
          showAlert('¡Oops! Algo se agotó mientras pedías.', 'error');
        } else {
          showAlert(`Error: ${error?.message || 'Error desconocido'}`, 'error');
        }
      }
    },
    [
      cartItems,
      clearCart,
      closeCart,
      customer,
      discount,
      isBusinessOpen,
      isNetworkBlocked,
      isSubmitting,
      onClose,
      orderNotes,
      refetchUserData,
      scheduledTime,
      selectedAddress,
      showAlert,
      subtotal,
      total,
    ]
  );

  return {
    isSubmitting,
    submitErrorMessage,
    whatsappFallback,
    clearWhatsappFallback,
    handleSubmitOrder,
  };
};
