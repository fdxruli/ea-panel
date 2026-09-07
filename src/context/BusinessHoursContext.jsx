import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';
import { subscribeToTables } from '../lib/sharedAdminRealtime';
import { subscribeToStoreBroadcast } from '../lib/broadcastRealtime';

const BusinessHoursContext = createContext();

export const useBusinessHours = () => useContext(BusinessHoursContext);

export const BusinessHoursProvider = ({ children }) => {
    const [businessStatus, setBusinessStatus] = useState({
        isOpen: false,
        message: 'Verificando horario...',
        loading: true
    });

    // --- 👇 MEJORA: Envolvemos en useCallback para consistencia y estabilidad con retry y fallback ---
    const checkBusinessHours = useCallback(async (retryCount = 0) => {
        try {
            // Llama a la función de Supabase (aquí es donde se genera el mensaje mejorado)
            const { data, error } = await supabase.rpc('get_business_status');
            if (error) throw error;

            let parsedData = data;
            if (typeof parsedData === 'string') {
                try {
                    parsedData = JSON.parse(parsedData);
                } catch (e) {
                    console.warn("No se pudo parsear data de get_business_status:", e);
                }
            }

            if (!parsedData || typeof parsedData.is_open === 'undefined') {
                throw new Error('Respuesta inválida de get_business_status: ' + JSON.stringify(data));
            }

            const newStatus = {
                isOpen: Boolean(parsedData.is_open),
                message: parsedData.message || (parsedData.is_open ? 'Abierto ahora' : 'Cerrado por el momento'),
                loading: false,
            };

            setBusinessStatus(newStatus);
            setCache(CACHE_KEYS.BUSINESS_STATUS, newStatus);

        } catch (error) {
            console.error("Error fetching business status:", error);

            // Reintento automático rápido (1 vez tras 1.2s) en caso de hipo de red
            if (retryCount < 1) {
                setTimeout(() => checkBusinessHours(retryCount + 1), 1200);
                return;
            }

            // Fallback: si tenemos un estado previo en caché válido, conservarlo
            const { data: fallbackCache } = getCache(CACHE_KEYS.BUSINESS_STATUS, CACHE_TTL.BUSINESS_STATUS * 2);
            if (fallbackCache && fallbackCache.message && fallbackCache.message !== 'No se pudo verificar el horario.') {
                setBusinessStatus({ ...fallbackCache, loading: false });
                return;
            }

            setBusinessStatus(prevStatus => ({
                ...prevStatus,
                message: prevStatus.message && prevStatus.message !== 'Verificando horario...'
                    ? prevStatus.message
                    : 'No se pudo verificar el horario.',
                loading: false,
            }));
        }
    }, []);

    useEffect(() => {
        // 1. Carga inicial desde caché para velocidad
        const { data: cachedStatus } = getCache(CACHE_KEYS.BUSINESS_STATUS, CACHE_TTL.BUSINESS_STATUS);

        if (cachedStatus) {
            setBusinessStatus({ ...cachedStatus, loading: false });
        }

        // 2. SIEMPRE verifica con el servidor en segundo plano al montar el componente
        // Esto asegura que si acabas de cerrar, el usuario se entere en milisegundos
        // aunque su caché diga que está abierto.
        checkBusinessHours();

        // 3. Verifica periódicamente
        const interval = setInterval(checkBusinessHours, 60000); // Cada 1 minuto
        return () => clearInterval(interval);
    }, [checkBusinessHours]);

    useEffect(() => {
        // Escucha cambios en tiempo real en las tablas de horarios y excepciones vía canal compartido
        const handleChanges = () => {
            console.log('Cambio detectado en los horarios (Shared Realtime / Broadcast), actualizando...');
            localStorage.removeItem(CACHE_KEYS.BUSINESS_STATUS);
            checkBusinessHours();
        };

        const unsubscribeTables = subscribeToTables(['business_hours', 'business_exceptions'], handleChanges);
        const unsubscribeBroadcast = subscribeToStoreBroadcast('hours_updated', handleChanges);

        return () => {
            if (unsubscribeTables) unsubscribeTables();
            if (unsubscribeBroadcast) unsubscribeBroadcast();
        };
    }, [checkBusinessHours]);


    return (
        <BusinessHoursContext.Provider value={businessStatus}>
            {children}
        </BusinessHoursContext.Provider>
    );
}