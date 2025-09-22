// src/components/PhoneModal.jsx (CÓDIGO MODIFICADO)

import React, { useState, useEffect } from 'react';
import { useCustomer } from '../context/CustomerContext';
import styles from './PhoneModal.module.css';

export default function PhoneModal() {
  const { isPhoneModalOpen, setPhoneModalOpen, savePhone } = useCustomer();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false); // <-- 1. NUEVO ESTADO

  useEffect(() => {
    if (isPhoneModalOpen) {
      setInputValue('');
      setError('');
      setAgreed(false); // Limpia el checkbox
    }
  }, [isPhoneModalOpen]);

  const handleSubmit = () => {
    if (!agreed) {
        setError('Debes aceptar los términos y condiciones para continuar.');
        return;
    }

    if (savePhone(inputValue)) {
      setError('');
    } else {
      setError('Por favor, ingresa un número de WhatsApp válido (10-12 dígitos).');
    }
  };

  const handleClose = () => {
    setPhoneModalOpen(false);
  };

  if (!isPhoneModalOpen) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modalContent}>
        <h2>¡Bienvenido a ENTRE&nbsp;ALAS!</h2>
        <p>
          Ingresa tu número de WhatsApp para ver tus pedidos y facilitar tus compras.
        </p>
        <input
          type="tel"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Tu número de WhatsApp"
          className={styles.phoneInput}
        />
        
        {/* --- 3. SECCIÓN DE TÉRMINOS Y CONDICIONES --- */}
        <div className={styles.terms}>
            <input 
                type="checkbox" 
                id="terms" 
                checked={agreed} 
                onChange={(e) => setAgreed(e.target.checked)} 
            />
            <label htmlFor="terms">
                He leído y acepto los <a href="/terminos" target="_blank" rel="noopener noreferrer">Términos y Condiciones</a>.
            </label>
        </div>

        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.buttons}>
          <button onClick={handleSubmit} className={styles.saveButton}>
            Guardar Número
          </button>
          <button onClick={handleClose} className={styles.laterButton}>
            Quizás más tarde
          </button>
        </div>
      </div>
    </div>
  );
}