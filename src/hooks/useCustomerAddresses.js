import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';

export function useCustomerAddresses() {
    const { customer: canonicalCustomer, isAuthenticated } = useCustomer();
    const customerId = canonicalCustomer?.id || null;

    const [addresses, setAddresses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    const fetchIdRef = useRef(0);

    const fetchAddresses = useCallback(async () => {
        if (!customerId || !isAuthenticated) {
            setAddresses([]);
            setLoading(false);
            return;
        }

        const currentFetchId = ++fetchIdRef.current;
        setLoading(true);
        setError(null);

        try {
            const { data, error: fetchError } = await supabase
                .from('customer_addresses')
                .select('*')
                .eq('customer_id', customerId)
                .order('is_default', { ascending: false })
                .order('created_at', { ascending: false });

            if (fetchError) throw fetchError;

            if (currentFetchId === fetchIdRef.current) {
                setAddresses(data || []);
            }
        } catch (err) {
            if (currentFetchId === fetchIdRef.current) {
                setError(err.message || 'Error al cargar direcciones.');
            }
        } finally {
            if (currentFetchId === fetchIdRef.current) {
                setLoading(false);
            }
        }
    }, [customerId, isAuthenticated]);

    useEffect(() => {
        fetchAddresses();
    }, [fetchAddresses]);

    const setDefaultAddress = useCallback(async (addressId) => {
        if (!addressId || !customerId) return false;
        setActionLoading(true);
        try {
            const { error: rpcError } = await supabase.rpc('set_my_default_customer_address', {
                p_address_id: addressId,
            });
            if (rpcError) throw rpcError;

            // Optimistic update with certainty
            setAddresses((prev) =>
                prev.map((addr) => ({
                    ...addr,
                    is_default: addr.id === addressId,
                }))
            );
            return true;
        } catch (err) {
            console.error('[useCustomerAddresses] Error fijando predeterminada:', err);
            await fetchAddresses(); // Revert/sync with server
            throw err;
        } finally {
            setActionLoading(false);
        }
    }, [customerId, fetchAddresses]);

    const saveAddress = useCallback(async (addressData, addressId = null) => {
        if (!customerId) throw new Error('Cliente no autenticado.');
        setActionLoading(true);
        try {
            const isFirstAddress = addresses.length === 0;
            const payload = {
                customer_id: customerId,
                label: addressData.label,
                address_reference: addressData.address_reference,
                latitude: addressData.latitude,
                longitude: addressData.longitude,
            };

            let response;
            if (addressId) {
                response = await supabase
                    .from('customer_addresses')
                    .update(payload)
                    .eq('id', addressId)
                    .select()
                    .single();
            } else {
                response = await supabase
                    .from('customer_addresses')
                    .insert({ ...payload, is_default: isFirstAddress })
                    .select()
                    .single();
            }

            if (response.error) throw response.error;

            await fetchAddresses();
            return response.data;
        } catch (err) {
            console.error('[useCustomerAddresses] Error guardando dirección:', err);
            throw err;
        } finally {
            setActionLoading(false);
        }
    }, [addresses.length, customerId, fetchAddresses]);

    const deleteAddress = useCallback(async (addressId) => {
        if (!addressId || !customerId) return false;
        setActionLoading(true);
        try {
            const { error: delError } = await supabase
                .from('customer_addresses')
                .delete()
                .eq('id', addressId);

            if (delError) throw delError;

            await fetchAddresses();
            return true;
        } catch (err) {
            console.error('[useCustomerAddresses] Error eliminando dirección:', err);
            throw err;
        } finally {
            setActionLoading(false);
        }
    }, [customerId, fetchAddresses]);

    return {
        addresses,
        loading,
        error,
        actionLoading,
        refetch: fetchAddresses,
        setDefaultAddress,
        saveAddress,
        deleteAddress,
    };
}
