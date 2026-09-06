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

    const [copied, setCopied] = React.useState(false);

    React.useEffect(() => {
        setCopied(false);
    }, [alert?.key]);

    if (!alert) return null;

    const handleConfirm = () => {
        if (alert.onConfirm) {
            alert.onConfirm();
        }
        closeAlert();
    };

    const handleCopyCode = async () => {
        if (!alert?.copyCode) return;
        let success = false;
        if (navigator?.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(alert.copyCode);
                success = true;
            } catch (err) {
                console.warn('navigator.clipboard falló, usando método alternativo:', err);
            }
        }
        if (!success) {
            try {
                const textArea = document.createElement('textarea');
                textArea.value = alert.copyCode;
                textArea.style.position = 'fixed';
                textArea.style.left = '-999999px';
                textArea.style.top = '-999999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                success = document.execCommand('copy');
                textArea.remove();
            } catch (err) {
                console.error('Error copiando código al portapapeles:', err);
            }
        }
        if (success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
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
                        {alert.title || (alert.type === 'error' ? 'Aviso' : 'Notificación')}
                    </h2>

                    <p id="alert-message" className={styles.message}>
                        {alert.message}
                    </p>

                    <div className={styles.buttonGroup}>
                        {alert.copyCode && (
                            <button
                                type="button"
                                onClick={handleCopyCode}
                                className={`${styles.copyCodeButton} ${copied ? styles.copied : ''}`}
                                data-alert-focus
                                autoFocus
                            >
                                {copied ? '¡Código copiado! ✓' : `Copiar código: ${alert.copyCode}`}
                            </button>
                        )}

                        <button
                            type="button"
                            onClick={handleConfirm}
                            className={styles.closeButton}
                            data-alert-focus={!alert.copyCode ? true : undefined}
                            autoFocus={!alert.copyCode}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            </div>
        </>,
        document.body
    );
}