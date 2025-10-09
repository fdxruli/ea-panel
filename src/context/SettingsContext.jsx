import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
    const [settings, setSettings] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchSettings = async () => {
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
        };
        fetchSettings();
    }, []);

    const getSetting = (key) => {
        return settings[key] || null;
    };

    const value = { settings, loading, getSetting };

    return (
        <SettingsContext.Provider value={value}>
            {children}
        </SettingsContext.Provider>
    );
};