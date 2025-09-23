// src/context/ThemeContext.jsx

import React, { createContext, useState, useEffect, useContext } from 'react';

// 1. Clave para guardar la preferencia en el almacenamiento local
const THEME_STORAGE_KEY = 'app-theme-preference';

// 2. Creamos el contexto
const ThemeContext = createContext();

// 3. Hook personalizado para usar el contexto fácilmente
export const useTheme = () => useContext(ThemeContext);

// 4. El componente Proveedor que contendrá toda la lógica
export const ThemeProvider = ({ children }) => {
    // Intentamos leer la preferencia guardada, si no existe, usamos 'system'
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem(THEME_STORAGE_KEY) || 'system';
    });

    useEffect(() => {
        const root = document.documentElement; // El elemento <html>
        const isDarkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches;

        // Limpiamos clases previas
        root.removeAttribute('data-theme');

        if (theme === 'dark' || (theme === 'system' && isDarkSystem)) {
            root.setAttribute('data-theme', 'dark');
        } else {
            // Se aplica el tema claro (por defecto en el CSS)
        }

        // Guardamos la preferencia del usuario
        localStorage.setItem(THEME_STORAGE_KEY, theme);

    }, [theme]); // Este efecto se ejecuta cada vez que 'theme' cambia

    // Este efecto escucha los cambios del sistema OPERATIVO
    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = (e) => {
            // Solo aplicamos el cambio si el usuario tiene seleccionada la opción 'system'
            if (theme === 'system') {
                const root = document.documentElement;
                if (e.matches) {
                    root.setAttribute('data-theme', 'dark');
                } else {
                    root.removeAttribute('data-theme');
                }
            }
        };

        // Añadimos el listener
        mediaQuery.addEventListener('change', handleChange);

        // Limpiamos el listener cuando el componente se desmonte
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]); // Se re-evalúa si el usuario cambia de 'system' a otra opción

    // El valor que proveeremos a toda la aplicación
    const value = {
        theme,
        // Usamos una función para que el componente que cambie el tema no necesite 'setTheme'
        changeTheme: setTheme 
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};