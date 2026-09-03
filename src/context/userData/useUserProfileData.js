import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../../lib/networkState';
import { CACHE_KEYS, CACHE_TTL } from '../../config/cacheConfig';
import { getCache, setCache } from '../../utils/cache';
import { fetchCustomerAndAddresses } from './userDataQueries';
import {
    EMPTY_PROFILE_DATA,
    isNetworkError,
    isValidCustomer,
} from './userDataUtils';

export const useUserProfileData = ({ phone, customerId, isCustomerLoading }) => {
    const [profileData, setProfileData] = useState(EMPTY_PROFILE_DATA);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const customerRef = useRef(null);
    const addressesRef = useRef([]);
    const requestIdRef = useRef(0);

    const infoCacheKey = `${CACHE_KEYS.USER_INFO}-${phone}`;
    const ordersCacheKey = `${CACHE_KEYS.USER_ORDERS}-${phone}`;

    const syncProfileRefs = useCallback((nextProfileData) => {
        customerRef.current = nextProfileData.customer;
        addressesRef.current = nextProfileData.addresses;
    }, []);

    const resetProfileData = useCallback(() => {
        syncProfileRefs(EMPTY_PROFILE_DATA);
        setProfileData(EMPTY_PROFILE_DATA);
    }, [syncProfileRefs]);

    const invalidateProfileCache = useCallback(() => {
        localStorage.removeItem(infoCacheKey);
    }, [infoCacheKey]);

    const fetchAndCacheProfile = useCallback(async (phoneNumber, expectedCustomerId, { background = false } = {}) => {
        const requestId = ++requestIdRef.current;

        if (!phoneNumber || !expectedCustomerId) {
            resetProfileData();
            invalidateProfileCache();
            setError(null);
            setLoading(!phoneNumber || !expectedCustomerId ? !isCustomerLoading : true);
            return null;
        }

        if (!background) setLoading(true);
        setError(null);

        try {
            const nextProfileData = await fetchCustomerAndAddresses(phoneNumber, expectedCustomerId);
            if (!nextProfileData.customer) {
                resetProfileData();
                invalidateProfileCache();
                setLoading(false);
                return null;
            }

            if (
                requestId !== requestIdRef.current ||
                nextProfileData.customer.id !== customerId
            ) {
                return null;
            }

            syncProfileRefs(nextProfileData);
            setProfileData(nextProfileData);
            setCache(infoCacheKey, nextProfileData, CACHE_TTL.USER_DATA);
            return nextProfileData;
        } catch (fetchError) {
            if (requestId !== requestIdRef.current) return null;

            console.error('Error fetching user profile data:', fetchError);
            if (!isNetworkError(fetchError)) {
                setError(fetchError.message);
                resetProfileData();
                invalidateProfileCache();
            } else {
                // El fallback offline solo es seguro para una identidad ya validada.
                if (!isValidCustomer(customerRef.current, customerId)) {
                    resetProfileData();
                }
                setError(null);
            }
            return null;
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [
        customerId,
        infoCacheKey,
        invalidateProfileCache,
        isCustomerLoading,
        resetProfileData,
        syncProfileRefs,
    ]);

    useEffect(() => {
        syncProfileRefs(profileData);
    }, [profileData, syncProfileRefs]);

    useEffect(() => {
        if (isCustomerLoading) {
            setLoading(true);
            resetProfileData();
            return undefined;
        }

        if (!phone || !customerId) {
            ++requestIdRef.current;
            resetProfileData();
            setError(null);
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        const currentRequestId = ++requestIdRef.current;
        const { data: cachedInfo, isStale } = getCache(infoCacheKey, CACHE_TTL.USER_DATA);
        const cacheIdentityValid = isValidCustomer(cachedInfo?.customer, customerId);
        const cacheValid = cacheIdentityValid && !isStale;

        if (!cacheIdentityValid || isStale) {
            localStorage.removeItem(infoCacheKey);
        }

        if (cacheValid) {
            const cachedProfileData = {
                customer: cachedInfo.customer,
                addresses: Array.isArray(cachedInfo.addresses) ? cachedInfo.addresses : [],
            };
            syncProfileRefs(cachedProfileData);
            setProfileData(cachedProfileData);
            setError(null);
        } else {
            resetProfileData();
        }

        if (!cacheValid) {
            fetchAndCacheProfile(phone, customerId).catch(() => { });
        } else if (!cancelled) {
            setLoading(false);
        }

        return () => {
            cancelled = true;
            if (requestIdRef.current === currentRequestId) requestIdRef.current += 1;
        };
    }, [
        customerId,
        fetchAndCacheProfile,
        infoCacheKey,
        isCustomerLoading,
        phone,
        resetProfileData,
        syncProfileRefs,
    ]);

    useEffect(() => {
        if (!customerId || isCustomerLoading) return undefined;

        const handleAddressChange = () => {
            fetchAndCacheProfile(phone, customerId, { background: true }).catch(() => { });
        };

        const handleCustomerUpdate = (payload) => {
            if (payload.new?.id !== customerId) return;
            const currentCustomer = customerRef.current;
            if (!currentCustomer) return;

            const newCustomerData = { ...currentCustomer, ...payload.new };
            if (!isValidCustomer(newCustomerData, customerId)) return;

            const nextProfileData = {
                customer: newCustomerData,
                addresses: addressesRef.current,
            };
            syncProfileRefs(nextProfileData);
            setProfileData(nextProfileData);
            setCache(infoCacheKey, nextProfileData, CACHE_TTL.USER_DATA);
            localStorage.removeItem(ordersCacheKey);
        };

        const channel = supabase.channel(`public:user-profile:${customerId}`);

        channel.on('postgres_changes', {
            event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${customerId}`,
        }, handleAddressChange);
        channel.on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'customers', filter: `id=eq.${customerId}`,
        }, handleCustomerUpdate);

        channel.subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [
        customerId,
        fetchAndCacheProfile,
        infoCacheKey,
        isCustomerLoading,
        ordersCacheKey,
        phone,
        syncProfileRefs,
    ]);

    useEffect(() => {
        const reconcileOnFocus = () => {
            if (document.visibilityState !== 'visible' || !phone || !customerId || isCustomerLoading) return;
            fetchAndCacheProfile(phone, customerId, { background: true }).catch(() => { });
        };

        document.addEventListener('visibilitychange', reconcileOnFocus);
        window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
        return () => {
            document.removeEventListener('visibilitychange', reconcileOnFocus);
            window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
        };
    }, [customerId, fetchAndCacheProfile, isCustomerLoading, phone]);

    const logout = useCallback(() => {
        ++requestIdRef.current;
        invalidateProfileCache();
        resetProfileData();
        setError(null);
        setLoading(false);
    }, [invalidateProfileCache, resetProfileData]);

    const refetch = useCallback(
        () => fetchAndCacheProfile(phone, customerId),
        [customerId, fetchAndCacheProfile, phone]
    );

    return {
        ...profileData,
        loading,
        error,
        refetch,
        logout,
    };
};
