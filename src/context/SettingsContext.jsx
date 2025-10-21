import React, { createContext, useState, useContext, useEffect, useCallback } from 'react'; // <-- Añadir useCallback
import { supabase } from '../lib/supabaseClient';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);

    const fetchSettings = useCallback(async () => { // <-- Envolver en useCallback
        setLoading(true); // <-- Indicar carga al refetch
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
    }, []); // <-- Dependencias vacías para estabilidad

    useEffect(() => {
        fetchSettings();
        // Suscripción a cambios (opcional pero recomendable)
        const channel = supabase.channel('public:settings')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
                console.log('Settings changed!', payload);
                fetchSettings(); // Recargar al detectar cambios
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchSettings]); // <-- fetchSettings como dependencia

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