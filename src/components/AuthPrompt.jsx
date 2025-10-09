import React from 'react';
import { useCustomer } from '../context/CustomerContext';
import styles from './AuthPrompt.module.css';

const AuthPrompt = () => {
    const { setPhoneModalOpen } = useCustomer();

    return (
        <div className={styles.prompt}>
            <h2>Para acceder a esta sección, introduce tu número</h2>
            <button onClick={() => setPhoneModalOpen(true)} className={styles.actionButton}>
                Ingresar Número
            </button>
        </div>
    );
};

export default AuthPrompt;