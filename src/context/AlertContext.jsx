import React, { createContext, useState, useContext, useCallback, useEffect, useMemo } from 'react';

const AlertContext = createContext();

export const useAlert = () => useContext(AlertContext);

export const AlertProvider = ({ children }) => {
    const [alert, setAlert] = useState(null);

    const showAlert = useCallback((message, type = 'info', onConfirm = null, options = {}) => {
        setAlert((prev) => {
            if (prev && prev.type === 'error' && type === 'info') {
                return prev;
            }

            let finalType = type;
            let finalOnConfirm = onConfirm;
            let finalOptions = options;

            if (typeof type === 'object' && type !== null) {
                finalOptions = type;
                finalType = type.type || 'info';
                finalOnConfirm = type.onConfirm || null;
            }

            return {
                message,
                type: finalType,
                key: Date.now(),
                onConfirm: finalOnConfirm,
                copyCode: finalOptions.copyCode || null,
                title: finalOptions.title || null
            };
        });
    }, []);

    const closeAlert = useCallback(() => {
        setAlert(null);
    }, []);
    // NUEVO: Escuchador global de degradación de IndexedDB
    useEffect(() => {
        const handleIDBDegradation = (event) => {
            const { message } = event.detail || {};

            // Usamos showAlert para notificar al usuario.
            // Configuramos el tipo como 'error' para que destaque visualmente.
            showAlert(
                `Problema de almacenamiento detectado en tu dispositivo. La aplicación podría funcionar más lento o perder datos offline. Detalle: ${message}`,
                'error'
            );
        };

        window.addEventListener('idb-degraded', handleIDBDegradation);

        // Limpieza fundamental para evitar fugas de memoria si el Provider se desmonta
        return () => {
            window.removeEventListener('idb-degraded', handleIDBDegradation);
        };
    }, [showAlert]); // showAlert se incluye en las dependencias porque usamos useCallback

    const value = useMemo(() => ({ showAlert, closeAlert, alert }), [alert, closeAlert, showAlert]);

    return (
        <AlertContext.Provider value={value}>
            {children}
        </AlertContext.Provider>
    );
};
