import React from 'react';
import { useBusinessHours } from '../context/BusinessHoursContext'; // Adjust path
import LoadingSpinner from './LoadingSpinner'; // Adjust path
// Import the SVG - Ensure your build tool (like Vite) supports this syntax
import FueraHorarioIcon from '../assets/icons/fuera-horario.svg?react';
import styles from './ClosedMessage.module.css'; // Create this CSS file

const ClosedMessage = () => {
    const { isOpen, message, loading } = useBusinessHours();

    if (loading) {
        // Optionally show a minimal loading state or nothing
        return null;
        // Or return <div className={styles.overlay}><LoadingSpinner /></div>;
    }

    // Only render the overlay if the business is CLOSED
    if (isOpen) {
        return null;
    }

    return (
        <div className={styles.overlay}>
            <div className={styles.content}>
                <FueraHorarioIcon className={styles.icon} aria-label="Negocio cerrado" />
                <h2>¡Estamos Cerrados!</h2>
                <p>{message || 'Consulta nuestros horarios para más detalles.'}</p>
                 {/* Optional: Add a link to hours or contact */}
                 {/* <a href="/horarios">Ver Horarios</a> */}
            </div>
        </div>
    );
};

export default ClosedMessage;