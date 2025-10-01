// src/context/BusinessHoursContext.jsx (OPTIMIZADO)

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';

const BusinessHoursContext = createContext();

// Clave para guardar el estado en el almacenamiento local del navegador
const BUSINESS_STATUS_CACHE_KEY = 'ea-business-status-cache';

export const useBusinessHours = () => useContext(BusinessHoursContext);

export const BusinessHoursProvider = ({ children }) => {
    // 1. MEJORA: Cargar el estado inicial desde el caché para una carga instantánea.
    // La UI se renderiza inmediatamente con el último estado conocido.
    const [businessStatus, setBusinessStatus] = useState(() => {
        try {
            const cachedStatus = localStorage.getItem(BUSINESS_STATUS_CACHE_KEY);
            if (cachedStatus) {
                return JSON.parse(cachedStatus);
            }
        } catch (error) {
            console.error("Error al leer el caché de estado del negocio:", error);
        }
        // Estado por defecto si no hay nada en caché
        return { isOpen: false, message: 'Verificando horario...', loading: true };
    });

    // La función que llama a tu RPC en Supabase. Es el "cerebro" del contexto.
    const checkBusinessHours = useCallback(async () => {
        try {
            // Llamada a la función en la base de datos que hace todo el trabajo pesado.
            const { data, error } = await supabase.rpc('get_business_status');

            if (error) throw error;
            
            const newStatus = {
                isOpen: data.is_open,
                message: data.message,
                loading: false,
            };

            setBusinessStatus(newStatus);
            // Guardar el nuevo estado en el caché para futuras visitas.
            localStorage.setItem(BUSINESS_STATUS_CACHE_KEY, JSON.stringify(newStatus));

        } catch (error) {
            console.error("Error fetching business status:", error);
            // En caso de error, mantenemos el último estado conocido si existe, pero indicamos el fallo.
            setBusinessStatus(prevStatus => ({
                ...prevStatus,
                message: 'No se pudo verificar el horario.',
                loading: false,
            }));
        }
    }, []);

    useEffect(() => {
        // 2. MEJORA: Se ejecuta la revalidación en segundo plano al cargar la app.
        checkBusinessHours();

        // 3. MEJORA: El intervalo de respaldo ahora es de 60 segundos,
        // asegurando que el estado no permanezca desactualizado por mucho tiempo.
        const interval = setInterval(checkBusinessHours, 60000); 
        
        return () => clearInterval(interval);
    }, [checkBusinessHours]);
    
    // El listener de tiempo real (WebSockets) se mantiene como el método principal
    // para actualizaciones instantáneas.
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