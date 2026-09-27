// src/context/UserDataContext.jsx
import React, {
    createContext,
    useState,
    useContext,
    useEffect,
    useCallback,
    useMemo,
    useRef,
} from 'react';
import { supabase } from '../lib/supabaseClient';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../lib/networkState';
import { useCustomer } from './CustomerContext';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL, CACHE_LIMITS } from '../config/cacheConfig';
import { subscribeToStoreBroadcast } from '../lib/broadcastRealtime';

const UserDataContext = createContext();

export const useUserData = () => useContext(UserDataContext);

const EMPTY_USER_DATA = {
    customer: null,
    addresses: [],
    orders: [],
};

const isValidCustomer = (customer, canonicalCustomerId) => (
    Boolean(customer?.id) &&
    Boolean(canonicalCustomerId) &&
    customer.id === canonicalCustomerId
);

const areValidOrders = (orders, canonicalCustomerId) => (
    Array.isArray(orders) &&
    orders.every(order => order?.customer_id === canonicalCustomerId)
);

export const UserDataProvider = ({ children }) => {
    const { phone, customer: canonicalCustomer, isCustomerLoading } = useCustomer();
    const canonicalCustomerId = canonicalCustomer?.id || null;

    const INFO_CACHE_KEY = phone ? `${CACHE_KEYS.USER_INFO}-${phone}` : null;
    const ORDERS_CACHE_KEY = phone ? `${CACHE_KEYS.USER_ORDERS}-${phone}` : null;

    // Hidratación síncrona desde caché para evitar pantallas de carga al cambiar de ruta
    const initialCache = useMemo(() => {
        if (!phone || !canonicalCustomerId) return null;
        try {
            const { data: cachedInfo } = getCache(`${CACHE_KEYS.USER_INFO}-${phone}`, CACHE_TTL.USER_DATA);
            const { data: cachedOrders } = getCache(`${CACHE_KEYS.USER_ORDERS}-${phone}`, CACHE_TTL.USER_ORDERS);
            if (isValidCustomer(cachedInfo?.customer, canonicalCustomerId)) {
                return {
                    customer: cachedInfo.customer,
                    addresses: Array.isArray(cachedInfo.addresses) ? cachedInfo.addresses : [],
                    orders: areValidOrders(cachedOrders, canonicalCustomerId) ? cachedOrders : [],
                };
            }
        } catch {
            return null;
        }
        return null;
    }, [canonicalCustomerId, phone]);

    const [userData, setUserData] = useState(() => initialCache || EMPTY_USER_DATA);
    const [loading, setLoading] = useState(() => {
        if (initialCache) return false;
        return Boolean(phone && canonicalCustomerId);
    });
    const [error, setError] = useState(null);

    const customerRef = useRef(initialCache?.customer || null);
    const addressesRef = useRef(initialCache?.addresses || []);
    const ordersRef = useRef(initialCache?.orders || []);
    const requestIdRef = useRef(0);

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
        if (INFO_CACHE_KEY) localStorage.removeItem(INFO_CACHE_KEY);
        if (ORDERS_CACHE_KEY) localStorage.removeItem(ORDERS_CACHE_KEY);
    }, [INFO_CACHE_KEY, ORDERS_CACHE_KEY]);

    const fetchCustomerAndAddresses = useCallback(async (phoneNumber, expectedCustomerId) => {
        let customerData = null;
        try {
            const { data: verifyData, error: verifyError } = await supabase.rpc('verify_customer_by_phone', { p_phone: phoneNumber });
            if (!verifyError && verifyData?.found && verifyData?.customer) {
                customerData = verifyData.customer;
            }
        } catch (err) {
            console.warn('[UserDataContext] Error verificando cliente por RPC:', err);
        }

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

    const fetchAndCacheUserData = useCallback(async (phoneNumber, expectedCustomerId, { background = false } = {}) => {
        const requestId = ++requestIdRef.current;

        if (!phoneNumber || !expectedCustomerId) {
            resetUserData();
            invalidateIdentityCaches();
            setLoading(!phoneNumber || !expectedCustomerId ? !isCustomerLoading : true);
            return;
        }

        const hasExistingData = Boolean(customerRef.current?.id === expectedCustomerId);
        // Solo activar loading si es una carga inicial sin datos en pantalla
        if (!background && !hasExistingData) {
            setLoading(true);
        }
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
            const infoKey = `${CACHE_KEYS.USER_INFO}-${phoneNumber}`;
            const ordersKey = `${CACHE_KEYS.USER_ORDERS}-${phoneNumber}`;
            setCache(infoKey, userInfo, CACHE_TTL.USER_DATA);
            setCache(ordersKey, limitedOrdersForCache, CACHE_TTL.USER_ORDERS);
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
            if (!initialCache) {
                setLoading(true);
                resetUserData();
            }
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
        const infoKey = `${CACHE_KEYS.USER_INFO}-${phone}`;
        const ordersKey = `${CACHE_KEYS.USER_ORDERS}-${phone}`;

        const { data: cachedInfo, isStale: isInfoStale } = getCache(infoKey, CACHE_TTL.USER_DATA);
        const { data: cachedOrders, isStale: isOrdersStale } = getCache(ordersKey, CACHE_TTL.USER_ORDERS);
        const cacheIdentityValid = isValidCustomer(cachedInfo?.customer, canonicalCustomerId);
        const cacheOrdersIdentityValid = areValidOrders(cachedOrders, canonicalCustomerId);
        const infoCacheValid = cacheIdentityValid && !isInfoStale;
        const ordersCacheValid = infoCacheValid && cacheOrdersIdentityValid && !isOrdersStale;

        // Solo descartar la caché si la identidad NO coincide con el cliente logueado
        if (!cacheIdentityValid) {
            localStorage.removeItem(infoKey);
            localStorage.removeItem(ordersKey);
            resetUserData();
        } else {
            // El caché pertenece al cliente actual: mostrarlo inmediatamente sin spinner
            const nextUserData = {
                customer: cachedInfo.customer,
                addresses: Array.isArray(cachedInfo.addresses) ? cachedInfo.addresses : [],
                orders: cacheOrdersIdentityValid ? cachedOrders : (ordersRef.current || []),
            };
            syncUserDataRefs(nextUserData);
            setUserData(nextUserData);
            setLoading(false);
        }

        // Si los datos son viejos o faltan, revalidar silenciosamente en segundo plano
        if (!infoCacheValid || !ordersCacheValid) {
            fetchAndCacheUserData(phone, canonicalCustomerId, { background: cacheIdentityValid });
        } else if (!cancelled) {
            setLoading(false);
        }

        return () => {
            cancelled = true;
            if (requestIdRef.current === currentRequestId) requestIdRef.current += 1;
        };
    }, [
        phone,
        canonicalCustomerId,
        isCustomerLoading,
        fetchAndCacheUserData,
        initialCache,
        resetUserData,
        syncUserDataRefs,
    ]);

    useEffect(() => {
        const customerId = canonicalCustomerId;
        if (!customerId || isCustomerLoading) return undefined;

        const handleOrderOrAddressChange = () => {
            fetchAndCacheUserData(phone, customerId, { background: true });
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
            const infoKey = `${CACHE_KEYS.USER_INFO}-${phone}`;
            setCache(infoKey, {
                customer: newCustomerData,
                addresses: addressesRef.current,
            }, CACHE_TTL.USER_DATA);
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
            const ordersKey = `${CACHE_KEYS.USER_ORDERS}-${phone}`;
            setCache(ordersKey, updatedOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS), CACHE_TTL.USER_ORDERS);

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
        isCustomerLoading,
        phone,
        syncUserDataRefs,
    ]);

    // Escuchar broadcast de órdenes para actualización inmediata de clientes
    useEffect(() => {
        const handleBroadcastOrder = (data) => {
            if (!data?.orderCode) return;
            const currentOrders = ordersRef.current || [];
            const existing = currentOrders.find(o => o.order_code === data.orderCode);
            if (existing) {
                const updatedOrders = currentOrders.map(order =>
                    order.order_code === data.orderCode ? { ...order, ...data } : order
                );
                ordersRef.current = updatedOrders;
                setUserData(prev => ({ ...prev, orders: updatedOrders }));
                const ordersKey = `${CACHE_KEYS.USER_ORDERS}-${phone}`;
                setCache(ordersKey, updatedOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS), CACHE_TTL.USER_ORDERS);

                window.dispatchEvent(new CustomEvent('order-status-updated', {
                    detail: {
                        orderCode: data.orderCode,
                        status: data.status,
                    },
                }));
            } else if (canonicalCustomerId) {
                // Si la orden no existía en memoria pero pertenece al cliente, refrescar en segundo plano
                fetchAndCacheUserData(phone, canonicalCustomerId, { background: true });
            }
        };

        const unsubscribe = subscribeToStoreBroadcast('order_changed', handleBroadcastOrder);
        const unsubAddress = subscribeToStoreBroadcast('address_updated', (data) => {
            if (!data?.customerId || data.customerId === canonicalCustomerId) {
                fetchAndCacheUserData(phone, canonicalCustomerId, { background: true });
            }
        });
        const unsubCustomer = subscribeToStoreBroadcast('customer_updated', (data) => {
            if (!data?.customerId || data.customerId === canonicalCustomerId) {
                fetchAndCacheUserData(phone, canonicalCustomerId, { background: true });
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
            if (unsubAddress) unsubAddress();
            if (unsubCustomer) unsubCustomer();
        };
    }, [canonicalCustomerId, fetchAndCacheUserData, phone]);

    useEffect(() => {
        const reconcileOnFocus = () => {
            if (document.visibilityState !== 'visible' || !phone || !canonicalCustomerId || isCustomerLoading) return;
            fetchAndCacheUserData(phone, canonicalCustomerId, { background: true });
        };

        document.addEventListener('visibilitychange', reconcileOnFocus);
        window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
        window.addEventListener('online', reconcileOnFocus);
        return () => {
            document.removeEventListener('visibilitychange', reconcileOnFocus);
            window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
            window.removeEventListener('online', reconcileOnFocus);
        };
    }, [canonicalCustomerId, fetchAndCacheUserData, isCustomerLoading, phone]);

    const logout = useCallback(() => {
        ++requestIdRef.current;
        invalidateIdentityCaches();
        resetUserData();
    }, [invalidateIdentityCaches, resetUserData]);

    const refetch = useCallback(
        () => fetchAndCacheUserData(phone, canonicalCustomerId, { background: Boolean(customerRef.current) }),
        [canonicalCustomerId, fetchAndCacheUserData, phone]
    );

    const value = useMemo(() => ({
        ...userData,
        loading,
        error,
        refetch,
        logout,
    }), [error, loading, logout, refetch, userData]);

    return (
        <UserDataContext.Provider value={value}>
            {children}
        </UserDataContext.Provider>
    );
};
