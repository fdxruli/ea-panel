/**
 * useAddressManager.js
 * Custom hook that manages address selection, saving (Supabase),
 * and temporary address fallback for guest-like checkout.
 *
 * Resolves the race condition: the locally returned address from
 * insert/update is the immediate source of truth, avoiding dependency
 * on refetch timing.
 */
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

/**
 * @param {object} params
 * @param {object|null} params.customer - Current customer from context
 * @param {Array} params.addresses - Addresses list from context
 * @param {Function} params.refetchUserData - Refetch function from context
 * @param {Function} params.showAlert - Alert function from context
 * @param {boolean} params.isNetworkBlocked - Whether network is blocked
 * @returns {{
 *   selectedAddress: object|null,
 *   isAddressModalOpen: boolean,
 *   addressToEdit: object|null,
 *   openAddressModal: (address?: object|null) => void,
 *   handleSaveAddress: (addressData: object, shouldSave: boolean, addressId?: string) => Promise<object>,
 *   closeAddressModal: () => void,
 * }}
 */
export const useAddressManager = ({
  customer,
  addresses,
  refetchUserData,
  showAlert,
  isNetworkBlocked,
}) => {
  const [selectedAddress, setSelectedAddress] = useState(null);
  const [isAddressModalOpen, setAddressModalOpen] = useState(false);
  const [addressToEdit, setAddressToEdit] = useState(null);
  const [justSavedAddressId, setJustSavedAddressId] = useState(null);

  // Auto-select default/first address when addresses load
  useEffect(() => {
    if (!customer) return;
    if (!addresses || addresses.length === 0) {
      setSelectedAddress(null);
      return;
    }

    // If a just-saved address ID exists, prioritize it
    if (justSavedAddressId) {
      const newlySaved = addresses.find((a) => a.id === justSavedAddressId);
      if (newlySaved) {
        setSelectedAddress(newlySaved);
        setJustSavedAddressId(null);
        return;
      }
    }

    // Otherwise select default or first
    if (!selectedAddress) {
      const defaultAddr = addresses.find((a) => a.is_default) || addresses[0];
      setSelectedAddress(defaultAddr);
    }
  }, [customer, addresses, justSavedAddressId, selectedAddress]);

  // Close address modal if network becomes blocked
  useEffect(() => {
    if (isNetworkBlocked && isAddressModalOpen) {
      setAddressModalOpen(false);
      setAddressToEdit(null);
    }
  }, [isAddressModalOpen, isNetworkBlocked]);

  const openAddressModal = useCallback((address) => {
    setAddressToEdit(address || null);
    setAddressModalOpen(true);
  }, []);

  const closeAddressModal = useCallback(() => {
    setAddressModalOpen(false);
    setAddressToEdit(null);
  }, []);

  const handleSaveAddress = useCallback(
    async (addressData, shouldSave, addressId) => {
      const NETWORK_BLOCKED_MESSAGE =
        'Se necesita una conexión estable para continuar con tu pedido.';

      try {
        if (isNetworkBlocked) {
          throw new Error(NETWORK_BLOCKED_MESSAGE);
        }

        if (shouldSave) {
          if (!customer?.id) {
            throw new Error('No se detectó tu sesión de usuario.');
          }

          const dataToSave = {
            customer_id: customer.id,
            label: addressData.label,
            address_reference: addressData.address_reference,
            latitude: addressData.latitude,
            longitude: addressData.longitude,
          };

          let response;

          if (addressId) {
            // Update existing address
            response = await supabase
              .from('customer_addresses')
              .update(dataToSave)
              .eq('id', addressId)
              .select()
              .single();
          } else {
            // Insert new address, mark as default if first
            dataToSave.is_default = (addresses?.length || 0) === 0;

            response = await supabase
              .from('customer_addresses')
              .insert(dataToSave)
              .select()
              .single();
          }

          if (response.error) {
            throw new Error(response.error.message);
          }

          if (!response.data) {
            throw new Error('No se recibieron datos de la dirección guardada.');
          }

          // IMMEDIATE source of truth: use the returned data directly
          // This avoids the race condition where refetch hasn't completed yet.
          const savedAddress = response.data;
          setSelectedAddress(savedAddress);
          setJustSavedAddressId(savedAddress.id);

          // Refetch in background (non-blocking)
          refetchUserData().catch((err) => {
            console.warn('⚠️ Address refetch failed (non-critical):', err);
          });

          showAlert(
            `Dirección ${addressId ? 'actualizada' : 'guardada'} con éxito.`,
            'success'
          );
        } else {
          // Temporary address for this order only
          const temporaryAddress = {
            id: `temp_${Date.now()}`,
            label: addressData.label,
            address_reference: addressData.address_reference,
            latitude: addressData.latitude,
            longitude: addressData.longitude,
            isTemporary: true,
          };

          setSelectedAddress(temporaryAddress);
          showAlert('Dirección temporal seleccionada para este pedido.', 'info');
        }

        setAddressModalOpen(false);
        setAddressToEdit(null);
      } catch (error) {
        console.error('💥 Error saving address:', error);
        showAlert(`Error al guardar: ${error.message}`, 'error');
        throw error;
      }
    },
    [customer, addresses, isNetworkBlocked, refetchUserData, showAlert]
  );

  return {
    selectedAddress,
    setSelectedAddress,
    isAddressModalOpen,
    addressToEdit,
    openAddressModal,
    handleSaveAddress,
    closeAddressModal,
  };
};
