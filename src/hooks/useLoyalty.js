import { useCallback, useEffect, useState } from 'react';
import { useCustomer } from '../context/CustomerContext';
import { getCustomerLoyaltyCategory } from '../services/loyaltyService';

const loyaltyCache = new Map();

export function clearLoyaltyCache() {
    loyaltyCache.clear();
}

export function useLoyalty() {
    const { customer, customerId } = useCustomer();
    const activeCustomerId = customerId || customer?.id || null;
    const [state, setState] = useState({ status: 'loading', data: null, error: null });

    const load = useCallback(async (id) => {
        if (!id) {
            setState({ status: 'unauthenticated', data: null, error: null });
            return;
        }

        const cached = loyaltyCache.get(id);
        if (cached) {
            setState({ status: 'ready', data: cached, error: null });
            return;
        }

        setState({ status: 'loading', data: null, error: null });
        const result = await getCustomerLoyaltyCategory(id);
        if (result.code === 'ok') {
            loyaltyCache.set(id, result.data);
            setState({ status: 'ready', data: result.data, error: null });
            return;
        }

        const error = result.error || new Error(result.code);
        setState({ status: 'error', data: null, error });
    }, []);

    const refresh = useCallback(async () => {
        if (activeCustomerId) {
            loyaltyCache.delete(activeCustomerId);
            await load(activeCustomerId);
        }
    }, [activeCustomerId, load]);

    useEffect(() => {
        if (!activeCustomerId) {
            clearLoyaltyCache();
            setState({ status: 'unauthenticated', data: null, error: null });
            return;
        }

        load(activeCustomerId);

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') void refresh();
        };
        const handleOrderCompleted = () => void refresh();

        window.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('ea:order-completed', handleOrderCompleted);

        return () => {
            window.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('ea:order-completed', handleOrderCompleted);
        };
    }, [activeCustomerId, load, refresh]);

    return { ...state, isVip: state.data?.category === 'vip', refresh };
}
