import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const AdminAuthContext = createContext();

export const useAdminAuth = () => useContext(AdminAuthContext);

export const AdminAuthProvider = ({ children }) => {
    const [admin, setAdmin] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchAdminData = useCallback(async (user) => {
        if (!user) {
            setAdmin(null);
            setLoading(false);
            return;
        }
        const { data, error } = await supabase.from('admins').select('name, role, permissions').eq('id', user.id).single();
        if (error) {
            console.error("Error fetching admin profile:", error);
            setAdmin(null);
        } else {
            setAdmin(data);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        const getSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) { fetchAdminData(session.user); } else { setLoading(false); }
        };
        getSession();
        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
             fetchAdminData(session?.user);
        });
        return () => { authListener.subscription.unsubscribe(); };
    }, [fetchAdminData]);

    const hasPermission = (permissionKey) => {
        if (admin?.role === 'admin') {
            return true;
        }
        
        if (!admin?.permissions) {
            return false;
        }

        const keys = permissionKey.split('.');
        let currentPermission = admin.permissions;

        for (const key of keys) {
            currentPermission = currentPermission?.[key];
            if (currentPermission === undefined) {
                return false;
            }
        }

        return !!currentPermission;
    };
    
    const value = { admin, loading, hasPermission };

    return (
        <AdminAuthContext.Provider value={value}>
            {children}
        </AdminAuthContext.Provider>
    );
};