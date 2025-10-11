import React, { createContext, useState, useContext, useCallback } from 'react';

const AlertContext = createContext();

export const useAlert = () => useContext(AlertContext);

export const AlertProvider = ({ children }) => {
    const [alert, setAlert] = useState(null);

    const showAlert = useCallback((message, type = 'info') => {
        setAlert({ message, type, key: Date.now() });
    }, []);

    const closeAlert = () => {
        setAlert(null);
    };

    const value = { showAlert, closeAlert, alert };

    return (
        <AlertContext.Provider value={value}>
            {children}
        </AlertContext.Provider>
    );
};