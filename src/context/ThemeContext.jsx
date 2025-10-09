import React, { createContext, useState, useEffect, useContext } from 'react';

const THEME_STORAGE_KEY = 'app-theme-preference';

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
    const [theme, setTheme] = useState(() => {
        return localStorage.getItem(THEME_STORAGE_KEY) || 'system';
    });

    useEffect(() => {
        const root = document.documentElement;
        const isDarkSystem = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.removeAttribute('data-theme');

        if (theme === 'dark' || (theme === 'system' && isDarkSystem)) {
            root.setAttribute('data-theme', 'dark');
        } else {
        }
        localStorage.setItem(THEME_STORAGE_KEY, theme);
    }, [theme]);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

        const handleChange = (e) => {
            if (theme === 'system') {
                const root = document.documentElement;
                if (e.matches) {
                    root.setAttribute('data-theme', 'dark');
                } else {
                    root.removeAttribute('data-theme');
                }
            }
        };

        mediaQuery.addEventListener('change', handleChange);

        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    const value = {
        theme,
        changeTheme: setTheme 
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};