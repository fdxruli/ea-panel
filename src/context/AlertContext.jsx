import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';

const AlertContext = createContext();

export const useAlert = () => useContext(AlertContext);

export const AlertProvider = ({ children }) => {
    const [alert, setAlert] = useState(null);

    const showAlert = useCallback((message, type = 'info', onConfirm = null) => {
        setAlert({ message, type, key: Date.now(), onConfirm });
    }, []);

    const closeAlert = () => {
        setAlert(null);
    };

    // NUEVO: Escuchador global de degradación de IndexedDB
    useEffect(() => {
        const handleIDBDegradation = (event) => {
            const { message, tableName } = event.detail || {};

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

    const value = { showAlert, closeAlert, alert };

    return (
        <AlertContext.Provider value={value}>
            {children}
        </AlertContext.Provider>
    );
};