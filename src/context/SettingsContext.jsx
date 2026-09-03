import React, { createContext, useState, useContext, useEffect, useCallback, useMemo } from 'react';
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
        const unsubscribeCDC = subscribeToTableChanges('settings', () => {
            fetchSettings();
        });

        // Suscripción Broadcast directo
        const unsubscribeBroadcast = subscribeToStoreBroadcast('settings_updated', () => {
            fetchSettings();
        });

        return () => {
            if (unsubscribeCDC) unsubscribeCDC();
            if (unsubscribeBroadcast) unsubscribeBroadcast();
        };
    }, [fetchSettings]);

    const getSetting = useCallback((key) => {
        return settings[key] || null; // Devolver null es más seguro que {}
    }, [settings]);

    // Añadir refetch a las funciones expuestas
    const value = useMemo(
        () => ({ settings, loading, getSetting, refetch: fetchSettings }),
        [fetchSettings, getSetting, loading, settings]
    );

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};
