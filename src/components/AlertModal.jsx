import React, { useEffect } from 'react';
import { useAlert } from '../context/AlertContext';
import styles from './AlertModal.module.css';

const AlertIcon = ({ type }) => {
    return <div className={styles.iconCircle}>¡!</div>;
};

export default function AlertModal() {
    const { alert, closeAlert } = useAlert();

    useEffect(() => {
        if (alert) {
            const timer = setTimeout(() => {
                closeAlert();
            }, 5000); // Cierra automáticamente después de 5 segundos
            return () => clearTimeout(timer);
        }
    }, [alert, closeAlert]);

    if (!alert) return null;

    return (
        <div className={styles.overlay} onClick={closeAlert}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <AlertIcon type={alert.type} />
                <h2 className={styles.title}>Notificación</h2>
                <p className={styles.message}>{alert.message}</p>
                <button onClick={closeAlert} className={styles.closeButton}>
                    Entendido
                </button>
            </div>
        </div>
    );
}