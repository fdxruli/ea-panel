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

    // --- 👇 MEJORA: Envolvemos en useCallback para consistencia y estabilidad ---
    const checkBusinessHours = useCallback(async () => {
        try {
            // Llama a la función de Supabase (aquí es donde se genera el mensaje mejorado)
            const { data, error } = await supabase.rpc('get_business_status');
            if (error) throw error;

            const newStatus = {
                isOpen: data.is_open,
                message: data.message, // Este mensaje viene del backend con la lógica mejorada
                loading: false,
            };

            setBusinessStatus(newStatus);
            setCache(CACHE_KEYS.BUSINESS_STATUS, newStatus);

        } catch (error) {
            console.error("Error fetching business status:", error);
            setBusinessStatus(prevStatus => ({
                ...prevStatus,
                message: 'No se pudo verificar el horario.',
                loading: false,
            }));
        }
    }, []); // <-- Array vacío para una función estable

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