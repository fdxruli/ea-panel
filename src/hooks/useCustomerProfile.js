import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';

export function useCustomerProfile() {
    const { customer: canonicalCustomer, isAuthenticated, isLinked } = useCustomer();
    const [name, setName] = useState('');
    const [initialName, setInitialName] = useState('');
    const [birthdate, setBirthdate] = useState('');
    const [initialBirthdate, setInitialBirthdate] = useState('');
    const [phone, setPhone] = useState('');
    const [referralCode, setReferralCode] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState(null);
    const requestIdRef = useRef(0);

    useEffect(() => {
        if (canonicalCustomer) {
            const currentName = canonicalCustomer.name || '';
            const currentBirthdate = canonicalCustomer.birthdate || '';
            setName(currentName);
            setInitialName(currentName);
            setBirthdate(currentBirthdate);
            setInitialBirthdate(currentBirthdate);
            setPhone(canonicalCustomer.phone || '');
            setReferralCode(canonicalCustomer.referral_code || '');
            setError(null);
        } else {
            setName('');
            setInitialName('');
            setBirthdate('');
            setInitialBirthdate('');
            setPhone('');
            setReferralCode('');
            setError(null);
        }
    }, [canonicalCustomer]);

    const isDirty = name.trim() !== initialName.trim() || birthdate !== initialBirthdate;

    const updateProfile = useCallback(async ({ newName, newBirthdate } = {}) => {
        const cleanName = (newName ?? name).trim();
        if (!cleanName || cleanName.length < 2) {
            throw new Error('El nombre debe tener al menos 2 caracteres.');
        }

        const targetBirthdate = newBirthdate !== undefined ? newBirthdate : birthdate;
        const cleanBirthdate = targetBirthdate ? targetBirthdate : null;

        const currentRequestId = ++requestIdRef.current;
        setIsSaving(true);
        setError(null);

        try {
            const { data, error: rpcError } = await supabase.rpc('update_my_customer_profile', {
                p_name: cleanName,
                p_birthdate: cleanBirthdate,
            });

            if (rpcError) throw rpcError;

            if (currentRequestId === requestIdRef.current) {
                const updated = Array.isArray(data) ? data[0] : data;
                const nextName = updated?.name ?? cleanName;
                const nextBirthdate = updated?.birthdate ?? (cleanBirthdate || '');

                setName(nextName);
                setInitialName(nextName);
                setBirthdate(nextBirthdate);
                setInitialBirthdate(nextBirthdate);
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
    }, [birthdate, name]);

    const updateName = useCallback((newName) => {
        return updateProfile({ newName });
    }, [updateProfile]);

    const resetForm = useCallback(() => {
        setName(initialName);
        setBirthdate(initialBirthdate);
        setError(null);
    }, [initialBirthdate, initialName]);

    return {
        name,
        setName,
        birthdate,
        setBirthdate,
        phone,
        referralCode,
        isDirty,
        isSaving,
        error,
        updateProfile,
        updateName,
        resetForm,
        isAuthenticated,
        isLinked,
        canonicalCustomerId: canonicalCustomer?.id || null,
    };
}
