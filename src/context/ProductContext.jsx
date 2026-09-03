import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
} from 'react';
import { useUserData } from './UserDataContext';
import { useAlert } from './AlertContext';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../lib/networkState';
import { applySpecialPrices, getVisibleCategories } from './productData/productUtils';
import { useProductCatalog } from './productData/useProductCatalog';
import { useSpecialPrices } from './productData/useSpecialPrices';

const ProductContext = createContext();

export const useProducts = () => useContext(ProductContext);

export const ProductProvider = ({ children }) => {
    const { showAlert } = useAlert();
    const { customer } = useUserData();
    const customerId = customer?.id;

    const {
        products: baseProducts,
        categories: baseCategories,
        loading: catalogLoading,
        error: catalogError,
        refetch: refetchCatalog,
    } = useProductCatalog({ showAlert });

    const {
        specialPrices,
        loading: pricesLoading,
        error: pricesError,
        refetch: refetchPrices,
    } = useSpecialPrices({ customerId, showAlert });

    const products = useMemo(
        () => applySpecialPrices({
            baseProducts,
            categories: baseCategories,
            specialPrices,
            customerId,
        }),
        [baseCategories, baseProducts, customerId, specialPrices]
    );

    const categories = useMemo(
        () => getVisibleCategories(products, baseCategories),
        [baseCategories, products]
    );

    useEffect(() => {
        const reconcileOnFocus = () => {
            if (document.visibilityState !== 'visible') return;

            refetchCatalog({ background: true }).catch(() => { });
            refetchPrices({ background: true }).catch(() => { });
        };

        document.addEventListener('visibilitychange', reconcileOnFocus);
        window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
        window.addEventListener('online', reconcileOnFocus);

        return () => {
            document.removeEventListener('visibilitychange', reconcileOnFocus);
            window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
            window.removeEventListener('online', reconcileOnFocus);
        };
    }, [refetchCatalog, refetchPrices]);

    const refetch = useCallback(() => {
        return Promise.all([
            refetchCatalog(),
            refetchPrices(),
        ]);
    }, [refetchCatalog, refetchPrices]);

    const value = useMemo(() => ({
        products,
        categories,
        loading: catalogLoading || pricesLoading,
        error: catalogError || pricesError,
        refetch,
    }), [catalogError, catalogLoading, categories, pricesError, pricesLoading, products, refetch]);

    return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
};
