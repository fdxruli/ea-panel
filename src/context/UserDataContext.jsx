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

export const UserDataProvider = ({ children }) => {
    const { phone } = useCustomer();
    const [userData, setUserData] = useState({
        customer: null,
        addresses: [],
        orders: [],
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const customerRef = useRef(null);
    const addressesRef = useRef([]);
    const ordersRef = useRef([]);

    const INFO_CACHE_KEY = `${CACHE_KEYS.USER_INFO}-${phone}`;
    const ORDERS_CACHE_KEY = `${CACHE_KEYS.USER_ORDERS}-${phone}`;

    const syncUserDataRefs = useCallback((nextUserData) => {
        customerRef.current = nextUserData.customer;
        addressesRef.current = nextUserData.addresses;
        ordersRef.current = nextUserData.orders;
    }, []);

    const resetUserData = useCallback(() => {
        const emptyUserData = {
            customer: null,
            addresses: [],
            orders: [],
        };

        syncUserDataRefs(emptyUserData);
        setUserData(emptyUserData);
    }, [syncUserDataRefs]);

    const fetchCustomerAndAddresses = useCallback(async (phoneNumber) => {
        const { data: customerData, error: customerError } = await supabase
            .from('customers')
            .select('id, name, phone, created_at, referral_code, referrer_id, referral_count')
            .eq('phone', phoneNumber)
            .maybeSingle();

        if (customerError) throw customerError;
        if (!customerData) return { customer: null, addresses: [] };

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

    useEffect(() => {
        syncUserDataRefs(userData);
    }, [userData, syncUserDataRefs]);

    const fetchAndCacheUserData = useCallback(async (phoneNumber) => {
        if (!phoneNumber) {
            resetUserData();
            localStorage.removeItem(INFO_CACHE_KEY);
            localStorage.removeItem(ORDERS_CACHE_KEY);
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const { customer, addresses } = await fetchCustomerAndAddresses(phoneNumber);

            if (!customer) {
                resetUserData();
                localStorage.removeItem(INFO_CACHE_KEY);
                localStorage.removeItem(ORDERS_CACHE_KEY);
                setLoading(false);
                return;
            }

            const userInfo = { customer, addresses };
            customerRef.current = customer;
            addressesRef.current = addresses;
            setUserData(prev => ({ ...prev, ...userInfo }));
            setCache(INFO_CACHE_KEY, userInfo, CACHE_TTL.USER_DATA);

            const fetchedOrders = await fetchOrders(customer.id);
            const limitedOrdersForCache = fetchedOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS);
            ordersRef.current = fetchedOrders;
            setUserData(prev => ({ ...prev, orders: fetchedOrders }));
            setCache(ORDERS_CACHE_KEY, limitedOrdersForCache, CACHE_TTL.USER_ORDERS);
        } catch (err) {
            console.error('Error fetching user data:', err);

            // Check if this is a network-related error
            const isNetworkError = err instanceof TypeError ||
                /failed to fetch|networkerror|network request failed|load failed|fetch|timeout/i.test(err.message || '');

            if (!isNetworkError) {
                // Non-network error (e.g., auth error, server logic error): clear everything
                console.warn('Non-network error detected. Clearing user data.');
                setError(err.message);
                resetUserData();
                localStorage.removeItem(INFO_CACHE_KEY);
                localStorage.removeItem(ORDERS_CACHE_KEY);
            } else {
                // Network error: KEEP cached data, don't reset user data
                // Just log a warning and show stale data gracefully
                console.warn('Network error. Keeping cached data for offline fallback.');
                // Do NOT call resetUserData() or clear cache — keep stale data visible
                // Clear the error flag so UI doesn't show "Error Inesperado"
                setError(null);
            }
        } finally {
            setLoading(false);
        }
    }, [fetchCustomerAndAddresses, fetchOrders, INFO_CACHE_KEY, ORDERS_CACHE_KEY, resetUserData]);

    useEffect(() => {
        if (!phone) {
            resetUserData();
            setLoading(false);
            return;
        }

        let cancelled = false;

        const { data: cachedInfo, isStale: isInfoStale } = getCache(INFO_CACHE_KEY, CACHE_TTL.USER_DATA);
        const { data: cachedOrders, isStale: isOrdersStale } = getCache(ORDERS_CACHE_KEY, CACHE_TTL.USER_ORDERS);

        let needsFreshFetch = true;

        if (cachedInfo) {
            customerRef.current = cachedInfo.customer;
            addressesRef.current = cachedInfo.addresses;
            setUserData(prev => ({ ...prev, customer: cachedInfo.customer, addresses: cachedInfo.addresses }));
            if (!isInfoStale) {
                needsFreshFetch = false;
            }
        }

        if (cachedOrders) {
            ordersRef.current = cachedOrders;
            setUserData(prev => ({ ...prev, orders: cachedOrders }));
            if (!isOrdersStale && !isInfoStale) {
                needsFreshFetch = false;
            }
        }

        if (needsFreshFetch) {
            fetchAndCacheUserData(phone);
        } else {
            // Cache is fresh, stop loading spinner immediately
            if (!cancelled) {
                setLoading(false);
            }
        }

        return () => {
            cancelled = true;
        };
    }, [phone, fetchAndCacheUserData, INFO_CACHE_KEY, ORDERS_CACHE_KEY, resetUserData]);

    useEffect(() => {
        const customerId = userData.customer?.id;
        if (!customerId) return;

        console.log(`[UserDataContext] Configurando listeners para cliente: ${customerId}`);

        const handleOrderOrAddressChange = (payload) => {
            console.log('[UserDataContext] Cambio detectado en orders/addresses, revalidando...', payload);

            // Don't invalidate cache immediately — try fresh fetch first
            // Only clear cache if the fetch succeeds with different data
            fetchAndCacheUserData(phone).catch(err => {
                // Network error: keep cached data, don't clear
                console.warn('[UserDataContext] No se pudo revalidar por red. Manteniendo cache.', err);
            });
        };

        const handleCustomerUpdate = (payload) => {
            console.log('[UserDataContext] Cambio detectado en customers (UPDATE):', payload);

            if (payload.new && payload.new.id === customerId) {
                const currentCustomer = customerRef.current;
                if (!currentCustomer) return;

                const newCustomerData = { ...currentCustomer, ...payload.new };
                customerRef.current = newCustomerData;

                console.log('[UserDataContext] Actualizando estado local del cliente:', newCustomerData);

                setUserData(prev => ({ ...prev, customer: newCustomerData }));

                const infoData = {
                    customer: newCustomerData,
                    addresses: addressesRef.current,
                };
                setCache(INFO_CACHE_KEY, infoData, CACHE_TTL.USER_DATA);

                localStorage.removeItem(ORDERS_CACHE_KEY);
                console.log('[UserDataContext] Cache de ordenes invalidado debido a actualizacion del cliente.');
            }
        };

        const handleOrderUpdate = (payload) => {
            console.log('[UserDataContext] Cambio de estado en pedido (UPDATE):', payload);

            if (payload.new && payload.new.customer_id === customerId) {
                const currentOrders = ordersRef.current;
                const orderExists = currentOrders.some(order => order.id === payload.new.id);
                if (!orderExists) return;

                const updatedOrders = currentOrders.map(order =>
                    order.id === payload.new.id ? { ...order, ...payload.new } : order
                );

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
            }
        };

        const channel = supabase.channel(`public:user-data:${customerId}`);

        channel.on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}` },
            handleOrderOrAddressChange
        );

        channel.on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}` },
            handleOrderUpdate
        );

        channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'customer_addresses', filter: `customer_id=eq.${customerId}` },
            handleOrderOrAddressChange
        );

        channel.on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'customers', filter: `id=eq.${customerId}` },
            handleCustomerUpdate
        );

        channel.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`[UserDataContext] Suscrito a cambios para cliente: ${customerId}`);
            }
            if (status === 'CHANNEL_ERROR') {
                console.error(`[UserDataContext] Error en canal para cliente ${customerId}`);
            }
            if (status === 'TIMED_OUT') {
                console.warn(`[UserDataContext] Timeout en canal para cliente ${customerId}`);
            }
        });

        return () => {
            console.log(`[UserDataContext] Desuscribiendo listeners para cliente: ${customerId}`);
            supabase.removeChannel(channel);
        };
    }, [userData.customer?.id, phone, fetchAndCacheUserData, INFO_CACHE_KEY, ORDERS_CACHE_KEY]);

    useEffect(() => {
        const handleReconnection = () => {
            const currentCustomerId = customerRef.current?.id;

            if (document.visibilityState === 'visible' && phone && currentCustomerId) {
                console.log('[UserDataContext] Recuperando conexion o foco. Conciliando estado...');

                fetchOrders(currentCustomerId).then(freshOrders => {
                    const isDifferent = JSON.stringify(ordersRef.current) !== JSON.stringify(freshOrders);

                    if (isDifferent) {
                        console.log('[UserDataContext] Estado desincronizado detectado. Actualizando...');
                        const limitedOrdersForCache = freshOrders.slice(0, CACHE_LIMITS.RECENT_ORDERS);
                        ordersRef.current = freshOrders;
                        setCache(ORDERS_CACHE_KEY, limitedOrdersForCache, CACHE_TTL.USER_ORDERS);
                        setUserData(prev => ({ ...prev, orders: freshOrders }));
                    }
                }).catch(err => console.error('Error en conciliacion:', err));
            }
        };

        document.addEventListener('visibilitychange', handleReconnection);
        window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, handleReconnection);

        return () => {
            document.removeEventListener('visibilitychange', handleReconnection);
            window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, handleReconnection);
        };
    }, [phone, fetchOrders, ORDERS_CACHE_KEY]);

    const logout = useCallback(() => {
        if (phone) {
            console.log(`[UserDataContext] Cerrando sesion y limpiando cache para: ${phone}`);
            localStorage.removeItem(INFO_CACHE_KEY);
            localStorage.removeItem(ORDERS_CACHE_KEY);
        }

        resetUserData();
    }, [phone, INFO_CACHE_KEY, ORDERS_CACHE_KEY, resetUserData]);

    const value = {
        ...userData,
        loading,
        error,
        refetch: () => fetchAndCacheUserData(phone),
        logout,
    };

    return (
        <UserDataContext.Provider value={value}>
            {children}
        </UserDataContext.Provider>
    );
};
