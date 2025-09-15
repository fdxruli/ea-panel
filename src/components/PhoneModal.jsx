// src/components/PhoneModal.jsx

import React, { useState } from 'react';
import { useCustomer } from '../context/CustomerContext';
import styles from './PhoneModal.module.css';

export default function PhoneModal() {
  const { isPhoneModalOpen, setPhoneModalOpen, savePhone } = useCustomer();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = () => {
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
        <h2>¡Bienvenido a Alitas "El Jefe"!</h2>
        <p>
          Para mejorar tu experiencia, puedes ingresar tu número de WhatsApp. Así podremos cargar tus pedidos anteriores y facilitar tus compras.
        </p>
        <p className={styles.privacy}>
          <strong>Tu privacidad es importante:</strong> Usamos tu número únicamente para gestionar tus pedidos.
        </p>
        <input
          type="tel"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Tu número de WhatsApp"
          className={styles.phoneInput}
        />
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