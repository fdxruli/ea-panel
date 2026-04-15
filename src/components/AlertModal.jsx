import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAlert } from '../context/AlertContext';
import styles from './AlertModal.module.css';

// Nuevo icono SVG moderno
const AlertIcon = () => {
    return (
        <div className={styles.iconWrapper}>
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
            >
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
        </div>
    );
};

export default function AlertModal() {
    const { alert, closeAlert } = useAlert();

    useEffect(() => {
        if (alert) {
            // 1. Guardar el elemento que tenía focus
            const previousFocus = document.activeElement;

            // 2. Enviar focus al botón del modal
            const closeButton = document.querySelector('[data-alert-focus]');
            if (closeButton) {
                closeButton.focus();
            }

            // 3. Trap: interceptar Tab para no dejar escapar el foco
            const handleKeyDown = (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    closeButton?.focus();
                }
            };

            document.addEventListener('keydown', handleKeyDown);

            return () => {
                document.removeEventListener('keydown', handleKeyDown);
                previousFocus?.focus(); // Restaurar focus al cerrar
            };
        }
    }, [alert]);

    if (!alert) return null;

    const handleConfirm = () => {
        if (alert.onConfirm) {
            alert.onConfirm();
        }
        closeAlert();
    };

    return createPortal(
        <>
            <div id="app-root" inert={alert ? "" : undefined} />

            <div
                className={styles.overlay}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby="alert-title"
                aria-describedby="alert-message"
                aria-live="assertive"
                aria-atomic="true"
            >
                <div className={styles.modalContent}>
                    <AlertIcon />

                    <h2 id="alert-title" className={styles.title}>
                        Notificación
                    </h2>

                    <p id="alert-message" className={styles.message}>
                        {alert.message}
                    </p>

                    <button
                        onClick={handleConfirm}
                        className={styles.closeButton}
                        data-alert-focus
                        autoFocus
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </>,
        document.body
    );
}