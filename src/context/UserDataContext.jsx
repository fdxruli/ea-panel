// src/context/UserDataContext.jsx
import React, {
    createContext,
    useState,
    useContext,
    useEffect,
    useCallback,
    useRef,
} from 'react';
import { supabase } from '../lib/supabaseClient';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../lib/networkState';
import { useCustomer } from './CustomerContext';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL, CACHE_LIMITS } from '../config/cacheConfig';

const UserDataContext = createContext();

export const useUserData = () => useContext(UserDataContext);

const EMPTY_USER_DATA = {
    customer: null,
    addresses: [],
    orders: [],
};

const isValidCustomer = (customer, canonicalCustomerId) => (
    !!customer?.id &&
    !!canonicalCustomerId &&
    customer.id === canonicalCustomerId
);

const areValidOrders = (orders, canonicalCustomerId) => (
    Array.isArray(orders) &&
    orders.every(order => order?.customer_id === canonicalCustomerId)
);

export const UserDataProvider = ({ children }) => {
    const { phone, customer: canonicalCustomer, isCustomerLoading } = useCustomer();
    const canonicalCustomerId = canonicalCustomer?.id || null;
    const [userData, setUserData] = useState(EMPTY_USER_DATA);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const customerRef = useRef(null);
    const addressesRef = useRef([]);
    const ordersRef = useRef([]);
    const requestIdRef = useRef(0);

    const INFO_CACHE_KEY = `${CACHE_KEYS.USER_INFO}-${phone}`;
    const ORDERS_CACHE_KEY = `${CACHE_KEYS.USER_ORDERS}-${phone}`;

    const syncUserDataRefs = useCallback((nextUserData) => {
        customerRef.current = nextUserData.customer;
        addressesRef.current = nextUserData.addresses;
        ordersRef.current = nextUserData.orders;
    }, []);

    const resetUserData = useCallback(() => {
        syncUserDataRefs(EMPTY_USER_DATA);
        setUserData(EMPTY_USER_DATA);
    }, [syncUserDataRefs]);

    const invalidateIdentityCaches = useCallback(() => {
        localStorage.removeItem(INFO_CACHE_KEY);
        localStorage.removeItem(ORDERS_CACHE_KEY);
    }, [INFO_CACHE_KEY, ORDERS_CACHE_KEY]);

    const fetchCustomerAndAddresses = useCallback(async (phoneNumber, expectedCustomerId) => {
        const { data: customerData, error: customerError } = await supabase
            .from('customers')
            .select('id, name, phone, created_at, referral_code, referrer_id, referral_count')
            .eq('phone', phoneNumber)
            .maybeSingle();

        if (customerError) throw customerError;
        if (!customerData) return { customer: null, addresses: [] };
        if (expectedCustomerId && customerData.id !== expectedCustomerId) {
            const identityError = new Error('Canonical customer changed while loading user data.');
            identityError.code = 'CANONICAL_ID_CHANGED';
            throw identityError;
        }

        const { data: addressesData, error: addressesError } = await supabase
            .from('customer_addresses')
            .select('*')
            .eq('customer_id', customerData.id)
            .order('is_default', { ascending: false });

        if (addressesError) throw addressesError;

        return { customer: customerData, addresses: addressesData || [] };
    }, []);

    const fetchOrders = useCallback(async (customerId) => {
        const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select('*, order_items(*, products(*))')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false });

        if (ordersError) throw ordersError;
        return ordersData || [];
    }, []);

    const fetchAndCacheUserData = useCallback(async (phoneNumber, expectedCustomerId) => {
        const requestId = ++requestIdRef.current;

        if (!phoneNumber || !expectedCustomerId) {
            resetUserData();
            invalidateIdentityCaches();
            setLoading(!phoneNumber || !expectedCustomerId ? !isCustomerLoading : true);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { customer, addresses } = await fetchCustomerAndAddresses(phoneNumber, expectedCustomerId);
            if (!customer) {
                resetUserData();
                invalidateIdentityCaches();
                setLoading(false);
                return;
            }

            const fetchedOrders = await fetchOrders(customer.id);
            if (!areValidOrders(fetchedOrders, customer.id)) {
                throw new Error('Fresh order response contains an invalid customer identity.');
            }

            if (requestId !== requestIdRef.current || customer.id !== canonicalCustomerId) return;

            const userInfo = { customer, addresses };
            const limitedOrdersForCache = fetchedOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS);
            const nextUserData = { customer, addresses, orders: fetchedOrders };

            syncUserDataRefs(nextUserData);
            setUserData(nextUserData);
            setCache(INFO_CACHE_KEY, userInfo, CACHE_TTL.USER_DATA);
            setCache(ORDERS_CACHE_KEY, limitedOrdersForCache, CACHE_TTL.USER_ORDERS);
        } catch (err) {
            if (requestId !== requestIdRef.current) return;
            console.error('Error fetching user data:', err);

            const isNetworkError = err instanceof TypeError ||
                /failed to fetch|networkerror|network request failed|load failed|fetch|timeout/i.test(err.message || '');

            if (!isNetworkError) {
                setError(err.message);
                resetUserData();
                invalidateIdentityCaches();
            } else {
                // Do not resurrect an unverified cache after an identity mismatch.
                // Offline fallback is only safe while the currently published identity
                // is already canonical and was previously validated.
                if (!isValidCustomer(customerRef.current, canonicalCustomerId)) {
                    resetUserData();
                }
                setError(null);
            }
        } finally {
            if (requestId === requestIdRef.current) setLoading(false);
        }
    }, [
        canonicalCustomerId,
        fetchCustomerAndAddresses,
        fetchOrders,
        INFO_CACHE_KEY,
        ORDERS_CACHE_KEY,
        invalidateIdentityCaches,
        isCustomerLoading,
        resetUserData,
        syncUserDataRefs,
    ]);

    useEffect(() => {
        syncUserDataRefs(userData);
    }, [userData, syncUserDataRefs]);

    useEffect(() => {
        if (isCustomerLoading) {
            setLoading(true);
            resetUserData();
            return undefined;
        }

        if (!phone || !canonicalCustomerId) {
            ++requestIdRef.current;
            resetUserData();
            setLoading(false);
            return undefined;
        }

        let cancelled = false;
        const currentRequestId = ++requestIdRef.current;

        const { data: cachedInfo, isStale: isInfoStale } = getCache(INFO_CACHE_KEY, CACHE_TTL.USER_DATA);
        const { data: cachedOrders, isStale: isOrdersStale } = getCache(ORDERS_CACHE_KEY, CACHE_TTL.USER_ORDERS);
        const cacheIdentityValid = isValidCustomer(cachedInfo?.customer, canonicalCustomerId);
        const cacheOrdersIdentityValid = areValidOrders(cachedOrders, canonicalCustomerId);
        const infoCacheValid = cacheIdentityValid && !isInfoStale;
        const ordersCacheValid = infoCacheValid && cacheOrdersIdentityValid && !isOrdersStale;

        // Legacy caches use the v1 namespace and are therefore never read here.
        // A v2 cache with B is also rejected as a complete snapshot; B is never
        // rewritten to A.
        if (!cacheIdentityValid || isInfoStale) {
            localStorage.removeItem(INFO_CACHE_KEY);
            localStorage.removeItem(ORDERS_CACHE_KEY);
        }

        if (cacheIdentityValid && !isInfoStale) {
            const nextUserData = {
                customer: cachedInfo.customer,
                addresses: Array.isArray(cachedInfo.addresses) ? cachedInfo.addresses : [],
                orders: ordersCacheValid ? cachedOrders : [],
            };
            syncUserDataRefs(nextUserData);
            setUserData(nextUserData);
        } else {
            resetUserData();
        }

        if (!infoCacheValid || !ordersCacheValid) {
            fetchAndCacheUserData(phone, canonicalCustomerId);
        } else if (!cancelled) {
            setLoading(false);
        }

        return () => {
            cancelled = true;
            if (requestIdRef.current === currentRequestId) ++requestIdRef.current;
        };
    }, [
        phone,
        canonicalCustomerId,
        isCustomerLoading,
        fetchAndCacheUserData,
        INFO_CACHE_KEY,
        ORDERS_CACHE_KEY,
        resetUserData,
        syncUserDataRefs,
    ]);

    useEffect(() => {
        const customerId = canonicalCustomerId;
        if (!customerId || isCustomerLoading) return undefined;

        const handleOrderOrAddressChange = () => {
            fetchAndCacheUserData(phone, customerId);
        };

        const handleCustomerUpdate = (payload) => {
            if (payload.new?.id !== customerId) return;
            const currentCustomer = customerRef.current;
            if (!currentCustomer) return;

            const newCustomerData = { ...currentCustomer, ...payload.new };
            if (!isValidCustomer(newCustomerData, customerId)) return;

            const nextUserData = {
                customer: newCustomerData,
                addresses: addressesRef.current,
                orders: ordersRef.current,
            };
            syncUserDataRefs(nextUserData);
            setUserData(nextUserData);
            setCache(INFO_CACHE_KEY, {
                customer: newCustomerData,
                addresses: addressesRef.current,
            }, CACHE_TTL.USER_DATA);
            localStorage.removeItem(ORDERS_CACHE_KEY);
        };

        const handleOrderUpdate = (payload) => {
            if (payload.new?.customer_id !== customerId) return;
            const currentOrders = ordersRef.current;
            if (!currentOrders.some(order => order.id === payload.new.id)) return;

            const updatedOrders = currentOrders.map(order =>
                order.id === payload.new.id ? { ...order, ...payload.new } : order
            );
            if (!areValidOrders(updatedOrders, customerId)) return;

            ordersRef.current = updatedOrders;
            setUserData(prev => ({ ...prev, orders: updatedOrders }));
            setCache(ORDERS_CACHE_KEY, updatedOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS), CACHE_TTL.USER_ORDERS);

            window.setTimeout(() => {
                window.dispatchEvent(new CustomEvent('order-status-updated', {
                    detail: {
                        orderCode: payload.new.order_code,
                        status: payload.new.status,
                    },
                }));
            }, 0);
        };

        const channel = supabase.channel(`public:user-data:${customerId}`);

        channel.on('postgres_changes', {
            event: 'INSERT', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}`,
        }, handleOrderOrAddressChange);
        channel.on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}`,
        }, handleOrderUpdate);
        channel.on('postgres_changes', {
            event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${customerId}`,
        }, handleOrderOrAddressChange);
        channel.on('postgres_changes', {
            event: 'UPDATE', schema: 'public', table: 'customers', filter: `id=eq.${customerId}`,
        }, handleCustomerUpdate);

        channel.subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [
        canonicalCustomerId,
        fetchAndCacheUserData,
        INFO_CACHE_KEY,
        isCustomerLoading,
        ORDERS_CACHE_KEY,
        phone,
        syncUserDataRefs,
    ]);

    useEffect(() => {
        const reconcileOnFocus = () => {
            if (document.visibilityState !== 'visible' || !phone || !canonicalCustomerId || isCustomerLoading) return;
            // CustomerContext performs the canonical phone -> UUID reconciliation.
            // Re-running this effect when its canonical ID changes causes the cache
            // namespace to be evaluated again before any identity is published.
            fetchAndCacheUserData(phone, canonicalCustomerId);
        };

        document.addEventListener('visibilitychange', reconcileOnFocus);
        window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
        return () => {
            document.removeEventListener('visibilitychange', reconcileOnFocus);
            window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
        };
    }, [canonicalCustomerId, fetchAndCacheUserData, isCustomerLoading, phone]);

    const logout = useCallback(() => {
        ++requestIdRef.current;
        invalidateIdentityCaches();
        resetUserData();
    }, [invalidateIdentityCaches, resetUserData]);

    const value = {
        ...userData,
        loading,
        error,
        refetch: () => fetchAndCacheUserData(phone, canonicalCustomerId),
        logout,
    };

    return (
        <UserDataContext.Provider value={value}>
            {children}
        </UserDataContext.Provider>
    );
};
