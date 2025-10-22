// src/components/ClosedMessage.jsx (MODIFICADO)

import React, { useState, useEffect } from 'react'; // <-- Import useState and useEffect
import { useBusinessHours } from '../context/BusinessHoursContext';
import LoadingSpinner from './LoadingSpinner';
import FueraHorarioIcon from '../assets/icons/fuera-horario.svg?react';
import styles from './ClosedMessage.module.css';

const ClosedMessage = () => {
    const { isOpen, message, loading } = useBusinessHours();
    // --- NUEVO ESTADO ---
    // Controls if the user has dismissed the message for the current session
    const [isVisible, setIsVisible] = useState(true);

    // --- NUEVO EFECTO ---
    // Reset visibility if the business status changes (e.g., opens while user is browsing)
    useEffect(() => {
        if (isOpen) {
            setIsVisible(false); // Hide if business opens
        } else {
            setIsVisible(true); // Show again if business closes (or on initial load closed)
        }
    }, [isOpen]); // Depend on isOpen

    const handleCloseOverlay = () => {
        setIsVisible(false); // User dismisses the message
    };

    // Still return null if loading
    if (loading) {
        return null;
    }

    // --- CONDICIÓN MODIFICADA ---
    // Only render the overlay if the business is CLOSED *and* the user hasn't dismissed it
    if (isOpen || !isVisible) {
        return null;
    }

    // Overlay is shown
    return (
        // Remove the onClick from the overlay itself if you only want the button to close it
        <div className={styles.overlay}>
            <div className={styles.content}>
                {/* --- BOTÓN AÑADIDO --- */}
                <button onClick={handleCloseOverlay} className={styles.closeButton} aria-label="Cerrar mensaje">
                    &times; {/* Simple 'x' icon */}
                </button>
                <FueraHorarioIcon className={styles.icon} aria-label="Negocio cerrado" />
                <h2>¡Estamos Cerrados!</h2>
                <p>{message || 'Consulta nuestros horarios para más detalles.'}</p>
                {/* Optional reminder */}
                <p className={styles.reminder}>Puedes explorar el menú, pero no podrás realizar pedidos hasta que abramos.</p>
            </div>
        </div>
    );
};

export default ClosedMessage;