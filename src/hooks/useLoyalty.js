import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getMyLoyaltyCategory } from '../services/loyaltyService';

const loyaltyCache = new Map();

export function clearLoyaltyCache() {
    loyaltyCache.clear();
}

export function useLoyalty() {
    const [state, setState] = useState({ status: 'loading', data: null, error: null });

    const load = useCallback(async (userId) => {
        if (!userId) {
            setState({ status: 'unauthenticated', data: null, error: null });
            return;
        }

        const cached = loyaltyCache.get(userId);
        if (cached) {
            setState({ status: 'ready', data: cached, error: null });
            return;
        }

        setState({ status: 'loading', data: null, error: null });
        const result = await getMyLoyaltyCategory();
        if (result.code === 'ok') {
            loyaltyCache.set(userId, result.data);
            setState({ status: 'ready', data: result.data, error: null });
            return;
        }

        const error = result.error || new Error(result.code);
        setState({ status: result.code === 'customer_not_linked' ? 'unlinked' : 'error', data: null, error });
    }, []);

    const refresh = useCallback(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user?.id) loyaltyCache.delete(user.id);
        await load(user?.id ?? null);
    }, [load]);

    useEffect(() => {
        let mounted = true;

        const initialize = async () => {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (!mounted) return;
            if (error) {
                setState({ status: 'error', data: null, error });
                return;
            }
            await load(user?.id ?? null);
        };

        initialize();

        const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
            const userId = session?.user?.id ?? null;
            if (event === 'SIGNED_OUT' || !userId) {
                clearLoyaltyCache();
                setState({ status: 'unauthenticated', data: null, error: null });
                return;
            }
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                setTimeout(() => {
                    if (mounted) void load(userId);
                }, 0);
            }
        });

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') void refresh();
        };
        const handleOrderCompleted = () => void refresh();

        window.addEventListener('visibilitychange', handleVisibility);
        window.addEventListener('ea:order-completed', handleOrderCompleted);

        return () => {
            mounted = false;
            subscription?.subscription?.unsubscribe?.();
            window.removeEventListener('visibilitychange', handleVisibility);
            window.removeEventListener('ea:order-completed', handleOrderCompleted);
        };
    }, [load, refresh]);

    return { ...state, refresh };
}
