import React from 'react';
import { Link } from 'react-router-dom';
import styles from '../Menu.module.css';

const MenuUnavailableProduct = () => (
    <div className={styles.errorContainer}>
        <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={styles.errorIcon}>
            <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z"></path>
            <path d="M9 9l6 6"></path>
            <path d="M15 9l-6 6"></path>
        </svg>
        <h2 className={styles.errorTitle}>Producto no disponible</h2>
        <p className={styles.errorMessage}>El producto que buscas ya no esta disponible o fue retirado del menu publico.</p>
        <Link to="/" className={styles.errorRetryButton}>Volver al menu</Link>
    </div>
);

export default MenuUnavailableProduct;
