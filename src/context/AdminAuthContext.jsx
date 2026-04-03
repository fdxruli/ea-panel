import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const AdminAuthContext = createContext(null);

export const AdminAuthProvider = ({ children }) => {
    const [authState, setAuthState] = useState({
        status: 'RESOLVING', // 'RESOLVING' | 'ADMIN' | 'CLIENT' | 'UNAUTHENTICATED' | 'ERROR'
        adminData: null,
        error: null
    });

    const resolveAdminStatus = useCallback(async (session, mounted) => {
        if (!session) {
            if (mounted) setAuthState({ status: 'UNAUTHENTICATED', adminData: null, error: null });
            return;
        }

        try {
            const { data, error } = await supabase
                .from('admins')
                .select('name, role, permissions') // CORREGIDO: No uses select('*')
                .eq('id', session.user.id)         // CORREGIDO: Revertido a 'id' en lugar de 'user_id'
                .single();

            if (error) {
                if (error.code === 'PGRST116') {
                    // Asumimos que si no está en la tabla admins, es un cliente. 
                    // Advertencia: Esto sigue siendo una suposición permisiva.
                    if (mounted) setAuthState({ status: 'CLIENT', adminData: null, error: null });
                    return;
                }
                throw error;
            }

            // Manejo de permisos: Soporta tanto JSONB nativo como strings parseables
            let parsedPermissions = data.permissions;
            if (typeof parsedPermissions === 'string') {
                try {
                    parsedPermissions = JSON.parse(parsedPermissions);
                } catch (e) {
                    console.error("Error al interpretar los permisos del admin:", e);
                    // Dalla de seguridad: denegamos permisos si el string está corrupto
                    parsedPermissions = null; 
                }
            }

            if (mounted) {
                setAuthState({ 
                    status: 'ADMIN', 
                    adminData: { ...data, permissions: parsedPermissions }, 
                    error: null 
                });
            }

        } catch (err) {
            console.error("Error crítico en autorización de admin:", err);
            if (mounted) setAuthState({ status: 'ERROR', adminData: null, error: err.message });
        }
    }, []);

    useEffect(() => {
        let mounted = true;

        // 1. Carga inicial
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (mounted) resolveAdminStatus(session, mounted);
        });

        // 2. Suscripción a cambios (CORREGIDO: Evita condición de carrera ignorando la carga inicial duplicada)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (mounted && event !== 'INITIAL_SESSION' && event !== 'SIGNED_UP') {
                setAuthState(prev => ({ ...prev, status: 'RESOLVING' }));
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

        // God mode (Te lo dejo porque es tu diseño actual, pero sigue siendo poco escalable)
        if (role === 'admin') return true;

        if (!permissions) return false;

        // CORREGIDO: Restaurada la lógica para leer objetos anidados (ej. 'dashboard.view')
        const keys = permissionKey.split('.');
        let currentPermission = permissions;

        for (const key of keys) {
            currentPermission = currentPermission?.[key];
            if (currentPermission === undefined) {
                return false;
            }
        }

        // CORREGIDO: Validación estricta. Si el objeto contiene algo que no sea 'true' booleano, deniega.
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