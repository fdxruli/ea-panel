import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { subscribeToTableChanges } from '../lib/sharedAdminRealtime';
import { subscribeToStoreBroadcast } from '../lib/broadcastRealtime';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);

    const fetchSettings = useCallback(async () => {
        setLoading(true);
        const { data, error } = await supabase.from('settings').select('*');
        if (error) {
            console.error("Error fetching settings:", error);
        } else {
            const settingsMap = data.reduce((acc, setting) => {
                acc[setting.key] = setting.value;
                return acc;
            }, {});
            setSettings(settingsMap);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchSettings();

        // Suscripción compartida a cambios (Postgres CDC)
        const unsubscribeCDC = subscribeToTableChanges('settings', (payload) => {
            console.log('Settings changed (Shared Realtime)!', payload);
            fetchSettings();
        });

        // Suscripción Broadcast directo
        const unsubscribeBroadcast = subscribeToStoreBroadcast('settings_updated', (payload) => {
            console.log('Settings changed (Broadcast)!', payload);
            fetchSettings();
        });

        return () => {
            if (unsubscribeCDC) unsubscribeCDC();
            if (unsubscribeBroadcast) unsubscribeBroadcast();
        };
    }, [fetchSettings]);

    const getSetting = (key) => {
        return settings[key] || null; // Devolver null es más seguro que {}
    };

    // Añadir refetch a las funciones expuestas
    const value = { settings, loading, getSetting, refetch: fetchSettings };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};