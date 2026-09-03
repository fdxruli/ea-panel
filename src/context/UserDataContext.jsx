import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useCustomer } from './CustomerContext';
import { useUserOrders } from './userData/useUserOrders';
import { useUserProfileData } from './userData/useUserProfileData';
import { isOrdersRoute } from './userData/userDataUtils';

const UserDataContext = createContext();

export const useUserData = () => useContext(UserDataContext);

export const UserDataProvider = ({ children }) => {
    const { phone, customer: canonicalCustomer, isCustomerLoading } = useCustomer();
    const { pathname } = useLocation();
    const customerId = canonicalCustomer?.id || null;
    const ordersEnabled = isOrdersRoute(pathname);

    const profile = useUserProfileData({
        phone,
        customerId,
        isCustomerLoading,
    });

    const orderData = useUserOrders({
        enabled: ordersEnabled,
        phone,
        customerId,
        isCustomerLoading,
    });

    const {
        customer,
        addresses,
        loading: profileLoading,
        error: profileError,
        refetch: refetchProfile,
        logout: logoutProfile,
    } = profile;
    const {
        orders,
        loading: ordersLoading,
        error: ordersError,
        refetch: refetchOrders,
        clear: clearOrders,
    } = orderData;

    const refetch = useCallback(() => {
        const profileRefresh = refetchProfile();
        if (!ordersEnabled) return profileRefresh;

        return Promise.all([
            profileRefresh,
            refetchOrders(),
        ]);
    }, [ordersEnabled, refetchOrders, refetchProfile]);

    const logout = useCallback(() => {
        logoutProfile();
        clearOrders();
    }, [clearOrders, logoutProfile]);

    const value = useMemo(() => ({
        customer,
        addresses,
        orders,
        loading: profileLoading || ordersLoading,
        error: profileError || ordersError,
        refetch,
        logout,
    }), [
        addresses,
        customer,
        logout,
        orders,
        ordersError,
        ordersLoading,
        profileError,
        profileLoading,
        refetch,
    ]);

    return (
        <UserDataContext.Provider value={value}>
            {children}
        </UserDataContext.Provider>
    );
};
