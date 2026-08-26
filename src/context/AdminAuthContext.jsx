import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const AdminAuthContext = createContext(null);

export const AdminAuthProvider = ({ children }) => {
    const [authState, setAuthState] = useState({
        status: 'RESOLVING', // 'RESOLVING' | 'ADMIN' | 'CLIENT' | 'UNAUTHENTICATED' | 'ERROR'
        userId: null,
        adminData: null,
        error: null
    });

    const resolveAdminStatus = useCallback(async (session, mounted) => {
        if (!session) {
            if (mounted) setAuthState({ status: 'UNAUTHENTICATED', userId: null, adminData: null, error: null });
            return;
        }

        const userId = session.user.id;

        try {
            const { data, error } = await supabase
                .from('admins')
                .select('name, role, permissions')
                .eq('id', userId)
                .maybeSingle();

            if (error) {
                throw error;
            }

            if (!data) {
                if (mounted) setAuthState({ status: 'CLIENT', userId, adminData: null, error: null });
                return;
            }

            let parsedPermissions = data.permissions;
            if (typeof parsedPermissions === 'string') {
                try {
                    parsedPermissions = JSON.parse(parsedPermissions);
                } catch (e) {
                    console.error("Error al interpretar los permisos del admin:", e);
                    parsedPermissions = null;
                }
            }

            if (mounted) {
                setAuthState({
                    status: 'ADMIN',
                    userId,
                    adminData: { ...data, permissions: parsedPermissions },
                    error: null
                });
            }

        } catch (err) {
            console.error("Error crítico en autorización de admin:", err);
            if (mounted) setAuthState({ status: 'ERROR', userId, adminData: null, error: err.message });
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        supabase.auth.getSession().then(({ data: { session } }) => {
            if (mounted) resolveAdminStatus(session, mounted);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (mounted && event !== 'INITIAL_SESSION' && event !== 'SIGNED_UP') {
                setAuthState(prev => ({ ...prev, status: 'RESOLVING', userId: session?.user?.id ?? null }));
                resolveAdminStatus(session, mounted);
            }
        });

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
    }, [resolveAdminStatus]);

    const loading = authState.status === 'RESOLVING';

    const hasPermission = useCallback((permissionKey) => {
        if (authState.status !== 'ADMIN' || !authState.adminData) return false;

        const { role, permissions } = authState.adminData;

        if (role === 'admin') return true;

        if (!permissions) return false;

        const keys = permissionKey.split('.');
        let currentPermission = permissions;

        for (const key of keys) {
            currentPermission = currentPermission?.[key];
            if (currentPermission === undefined) {
                return false;
            }
        }

        return currentPermission === true;
    }, [authState]);

    return (
        <AdminAuthContext.Provider value={{ ...authState, loading, hasPermission }}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export const useAdminAuth = () => {
    const context = useContext(AdminAuthContext);
    if (!context) {
        throw new Error("useAdminAuth debe ser usado estrictamente dentro de AdminAuthProvider");
    }
    return context;
};
