import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { subscribeToTableChanges } from '../lib/sharedAdminRealtime';
import { subscribeToStoreBroadcast } from '../lib/broadcastRealtime';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

export const SettingsProvider = ({ children }) => {
    const cachedSettings = useMemo(() => {
        try {
            const cached = getCache(CACHE_KEYS.SETTINGS, CACHE_TTL.SETTINGS);
            return cached?.data && typeof cached.data === 'object' && Object.keys(cached.data).length > 0
                ? cached.data
                : null;
        } catch {
            return null;
        }
    }, []);

    const [settings, setSettings] = useState(() => cachedSettings || {});
    const [loading, setLoading] = useState(() => !cachedSettings);
    const settingsRef = useRef(settings);

    useEffect(() => {
        settingsRef.current = settings;
    }, [settings]);

    const fetchSettings = useCallback(async ({ background = false } = {}) => {
        const hasExisting = Boolean(settingsRef.current && Object.keys(settingsRef.current).length > 0);
        if (!background && !hasExisting) {
            setLoading(true);
        }
        try {
            const { data, error } = await supabase.from('settings').select('*');
            if (error) {
                console.error("Error fetching settings:", error);
            } else {
                const settingsMap = (data || []).reduce((acc, setting) => {
                    acc[setting.key] = setting.value;
                    return acc;
                }, {});
                setSettings(settingsMap);
                settingsRef.current = settingsMap;
                setCache(CACHE_KEYS.SETTINGS, settingsMap);
            }
        } catch (err) {
            console.error("Unexpected error fetching settings:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const hasCache = Boolean(cachedSettings);
        fetchSettings({ background: hasCache });

        // Suscripción compartida a cambios (Postgres CDC)
        const unsubscribeCDC = subscribeToTableChanges('settings', () => {
            fetchSettings({ background: true });
        });

        // Suscripción Broadcast directo (actualiza silenciosamente en segundo plano)
        const unsubscribeBroadcast = subscribeToStoreBroadcast('settings_updated', (data) => {
            if (data?.key) {
                setSettings(prev => {
                    const next = { ...prev, [data.key]: data.value };
                    settingsRef.current = next;
                    setCache(CACHE_KEYS.SETTINGS, next);
                    return next;
                });
            }
            fetchSettings({ background: true });
        });

        return () => {
            if (unsubscribeCDC) unsubscribeCDC();
            if (unsubscribeBroadcast) unsubscribeBroadcast();
        };
    }, [cachedSettings, fetchSettings]);

    const getSetting = useCallback((key) => {
        return settings[key] || null;
    }, [settings]);

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
