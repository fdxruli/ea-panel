<<<<<<< HEAD
// src/context/BusinessHoursContext.jsx

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
            const { data, error } = await supabase.rpc('get_business_status');
            if (error) throw error;
            
            const newStatus = {
                isOpen: data.is_open,
                message: data.message,
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
        const { data: cachedStatus, isStale } = getCache(CACHE_KEYS.BUSINESS_STATUS, CACHE_TTL.BUSINESS_STATUS);

        if (cachedStatus) {
            setBusinessStatus({ ...cachedStatus, loading: false });
        }

        if (isStale) {
            checkBusinessHours();
        }

        const interval = setInterval(checkBusinessHours, 60000); 
        return () => clearInterval(interval);
    }, [checkBusinessHours]);

    useEffect(() => {
        const handleChanges = () => {
            console.log('Cambio detectado en los horarios, actualizando instantáneamente...');
            checkBusinessHours();
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
=======
// src/context/BusinessHoursContext.jsx

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
            const { data, error } = await supabase.rpc('get_business_status');
            if (error) throw error;
            
            const newStatus = {
                isOpen: data.is_open,
                message: data.message,
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
        const { data: cachedStatus, isStale } = getCache(CACHE_KEYS.BUSINESS_STATUS, CACHE_TTL.BUSINESS_STATUS);

        if (cachedStatus) {
            setBusinessStatus({ ...cachedStatus, loading: false });
        }

        if (isStale) {
            checkBusinessHours();
        }

        const interval = setInterval(checkBusinessHours, 60000); 
        return () => clearInterval(interval);
    }, [checkBusinessHours]);

    useEffect(() => {
        const handleChanges = () => {
            console.log('Cambio detectado en los horarios, actualizando instantáneamente...');
            checkBusinessHours();
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
>>>>>>> 901f8aa95ca640c871ec1f2bf6437b2b2a625efc
};