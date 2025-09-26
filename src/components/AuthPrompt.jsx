// src/components/AuthPrompt.jsx

import React from 'react';
import { useCustomer } from '../context/CustomerContext';
import styles from './AuthPrompt.module.css';

const AuthPrompt = ({ title, message }) => {
    const { setPhoneModalOpen } = useCustomer();

    return (
        <div className={styles.prompt}>
            <h2>{title}</h2>
            <p>{message}</p>
            <button onClick={() => setPhoneModalOpen(true)} className={styles.actionButton}>
                Ingresar Número
            </button>
        </div>
    );
};

export default AuthPrompt;