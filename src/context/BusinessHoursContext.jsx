import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';

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
        // Carga desde caché si existe y no está expirado
        const { data: cachedStatus, isStale } = getCache(CACHE_KEYS.BUSINESS_STATUS, CACHE_TTL.BUSINESS_STATUS);

        if (cachedStatus) {
            setBusinessStatus({ ...cachedStatus, loading: false });
        }

        // Si el caché está expirado o no existe, busca datos frescos
        if (isStale) {
            checkBusinessHours();
        }

        // Verifica periódicamente (cada minuto)
        const interval = setInterval(checkBusinessHours, 60000);
        return () => clearInterval(interval);
    }, [checkBusinessHours]);

    useEffect(() => {
        // Escucha cambios en tiempo real en las tablas de horarios y excepciones
        const handleChanges = () => {
            console.log('Cambio detectado en los horarios, actualizando instantáneamente...');
            checkBusinessHours(); // Vuelve a verificar inmediatamente si hay cambios
        };

        const channel = supabase.channel('public:business_hours_changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'business_hours' }, handleChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'business_exceptions' }, handleChanges)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [checkBusinessHours]); // <-- Dependencia estable


    return (
        <BusinessHoursContext.Provider value={businessStatus}>
            {children}
        </BusinessHoursContext.Provider>
    );
}