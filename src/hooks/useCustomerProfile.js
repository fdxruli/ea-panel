import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';

export function useCustomerProfile() {
    const { customer: canonicalCustomer, isAuthenticated, isLinked } = useCustomer();
    const [name, setName] = useState('');
    const [initialName, setInitialName] = useState('');
    const [phone, setPhone] = useState('');
    const [referralCode, setReferralCode] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        if (canonicalCustomer) {
            const currentName = canonicalCustomer.name || '';
            setName(currentName);
            setInitialName(currentName);
            setPhone(canonicalCustomer.phone || '');
            setReferralCode(canonicalCustomer.referral_code || '');
            setError(null);
        } else {
            setName('');
            setInitialName('');
            setPhone('');
            setReferralCode('');
            setError(null);
        }
    }, [canonicalCustomer]);

    const isDirty = name.trim() !== initialName.trim();

    const updateName = useCallback(async (newName) => {
        const cleanName = (newName ?? name).trim();
        if (!cleanName || cleanName.length < 2) {
            throw new Error('El nombre debe tener al menos 2 caracteres.');
        }

        const currentRequestId = ++requestIdRef.current;
        setIsSaving(true);
        setError(null);

        try {
            const { data, error: rpcError } = await supabase.rpc('update_my_customer_profile', {
                p_name: cleanName,
            });

            if (rpcError) throw rpcError;

            if (currentRequestId === requestIdRef.current) {
                const updated = Array.isArray(data) ? data[0] : data;
                if (updated?.name) {
                    setName(updated.name);
                    setInitialName(updated.name);
                } else {
                    setName(cleanName);
                    setInitialName(cleanName);
                }
            }
            return { ok: true };
        } catch (err) {
            if (currentRequestId === requestIdRef.current) {
                setError(err.message || 'Error al actualizar el perfil.');
            }
            throw err;
        } finally {
            if (currentRequestId === requestIdRef.current) {
                setIsSaving(false);
            }
        }
    }, [name]);

    const resetForm = useCallback(() => {
        setName(initialName);
        setError(null);
    }, [initialName]);

    return {
        name,
        setName,
        phone,
        referralCode,
        isDirty,
        isSaving,
        error,
        updateName,
        resetForm,
        isAuthenticated,
        isLinked,
        canonicalCustomerId: canonicalCustomer?.id || null,
    };
}
