import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const BusinessHoursContext = createContext();

const BUSINESS_STATUS_CACHE_KEY = 'ea-business-status-cache';

export const useBusinessHours = () => useContext(BusinessHoursContext);

export const BusinessHoursProvider = ({ children }) => {
    const [businessStatus, setBusinessStatus] = useState(() => {
        try {
            const cachedStatus = localStorage.getItem(BUSINESS_STATUS_CACHE_KEY);
            if (cachedStatus) {
                return JSON.parse(cachedStatus);
            }
        } catch (error) {
            console.error("Error al leer el caché de estado del negocio:", error);
        }
        return { isOpen: false, message: 'Verificando horario...', loading: true };
    });

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
            localStorage.setItem(BUSINESS_STATUS_CACHE_KEY, JSON.stringify(newStatus));

        } catch (error) {
            console.error("Error fetching business status:", error);
            setBusinessStatus(prevStatus => ({
                ...prevStatus,
                message: 'No se pudo verificar el horario.',
                loading: false,
            }));
        }
    }, []);

    useEffect(() => {
        checkBusinessHours();
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
    }, [checkBusinessHours]);


    return (
        <BusinessHoursContext.Provider value={businessStatus}>
            {children}
        </BusinessHoursContext.Provider>
    );
};