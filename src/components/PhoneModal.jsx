// src/components/PhoneModal.jsx (ACTUALIZADO)

import React, { useState, useEffect } from 'react';
import { useCustomer } from '../context/CustomerContext';
import styles from './PhoneModal.module.css';
import DOMPurify from 'dompurify';

export default function PhoneModal() {
  const { 
    isPhoneModalOpen, 
    setPhoneModalOpen, 
    savePhone, // Se mantiene para usuarios existentes que no se loguean auto
    checkAndLogin, 
    registerNewCustomer 
  } = useCustomer();
  
  const [inputValue, setInputValue] = useState('');
  const [name, setName] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    if (isPhoneModalOpen) {
        setInputValue('');
        setName('');
        setIsNewUser(false);
        setError('');
        setAgreed(false);
    }
  }, [isPhoneModalOpen]);

  useEffect(() => {
    const attemptAutoLoginOrDetectNewUser = async () => {
        if (inputValue.length === 10) {
            setIsNewUser(false);
            const userExists = await checkAndLogin(inputValue);
            if (!userExists) {
                setIsNewUser(true);
            }
        } else {
            setIsNewUser(false);
        }
    };
    attemptAutoLoginOrDetectNewUser();
  }, [inputValue, checkAndLogin]);

  const handleSubmit = async () => {
    if (!agreed) {
        setError('Debes aceptar los términos y condiciones para continuar.');
        return;
    }

    if (isNewUser) {
        if (!name.trim()) {
            setError('Parece que eres nuevo, por favor ingresa tu nombre.');
            return;
        }
        const cleanName = DOMPurify.sanitize(name.trim());
        const registered = await registerNewCustomer(inputValue, cleanName);
        if (!registered) {
            setError('Hubo un error al registrar tu cuenta. Inténtalo de nuevo.');
        }
    } else {
        if (savePhone(inputValue)) {
          setError('');
        } else {
          setError('Por favor, ingresa un número de WhatsApp válido de 10 dígitos.');
        }
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
          onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ''))}
          placeholder="Tu número de WhatsApp (10 dígitos)"
          className={styles.phoneInput}
          maxLength="10"
        />
        
        {/* --- SECCIÓN DINÁMICA PARA NUEVOS USUARIOS --- */}
        {isNewUser && (
            <div className={styles.newUserSection}>
                <p className={styles.newUserMessage}>¡Qué bueno tenerte por aquí! Parece que eres nuevo. ¿Cómo te llamas?</p>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre completo"
                    className={styles.nameInput}
                />
            </div>
        )}

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
            {isNewUser ? 'Crear mi cuenta y continuar' : 'Guardar Número'}
          </button>
          <button onClick={handleClose} className={styles.laterButton}>
            Quizás más tarde
          </button>
        </div>
      </div>
    </div>
  );
}