import React, { useState, useEffect } from 'react'; // <-- Import useState and useEffect
import { useBusinessHours } from '../context/BusinessHoursContext';
import LoadingSpinner from './LoadingSpinner';
import FueraHorarioIcon from '../assets/icons/fuera-horario.svg?react';
import styles from './ClosedMessage.module.css';

const ClosedMessage = () => {
    const { isOpen, message, loading } = useBusinessHours(); // Obtiene el estado y el mensaje del contexto
    // --- NUEVO ESTADO ---
    // Controla si el usuario ha descartado el mensaje en la sesión actual
    const [isVisible, setIsVisible] = useState(true);

    // --- NUEVO EFECTO ---
    // Resetea la visibilidad si el estado del negocio cambia (ej. abre mientras el usuario navega)
    useEffect(() => {
        if (isOpen) {
            setIsVisible(false); // Oculta si el negocio abre
        } else {
            setIsVisible(true); // Muestra de nuevo si cierra (o en carga inicial si está cerrado)
        }
    }, [isOpen]); // Depende de isOpen

    const handleCloseOverlay = () => {
        setIsVisible(false); // El usuario descarta el mensaje
    };

    // Aún retorna null si está cargando
    if (loading) {
        return null;
    }

    // --- CONDICIÓN MODIFICADA ---
    // Solo renderiza el overlay si el negocio está CERRADO *y* el usuario no lo ha descartado
    if (isOpen || !isVisible) {
        return null;
    }

    // Se muestra el overlay
    return (
        // Se puede quitar el onClick del overlay si solo quieres que el botón cierre
        <div className={styles.overlay}>
            <div className={styles.content}>
                {/* --- BOTÓN AÑADIDO --- */}
                <button onClick={handleCloseOverlay} className={styles.closeButton} aria-label="Cerrar mensaje">
                    &times; {/* Icono simple 'x' */}
                </button>
                <FueraHorarioIcon className={styles.icon} aria-label="Negocio cerrado" />
                <h2>¡Estamos Cerrados!</h2>
                {/* Muestra el mensaje detallado obtenido del contexto (que viene del backend) */}
                <p>{message || 'Consulta nuestros horarios para más detalles.'}</p>
                {/* Recordatorio opcional */}
                <p className={styles.reminder}>Puedes explorar el menú, pero no podrás realizar pedidos hasta que abramos.</p>
            </div>
        </div>
    );
};

export default ClosedMessage;