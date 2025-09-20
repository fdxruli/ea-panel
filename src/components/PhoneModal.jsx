// src/components/PhoneModal.jsx

import React, { useState, useEffect } from 'react';
import { useCustomer } from '../context/CustomerContext';
import styles from './PhoneModal.module.css';
import { supabase } from '../lib/supabaseClient'; // Importamos supabase

export default function PhoneModal() {
  const { isPhoneModalOpen, setPhoneModalOpen, savePhone } = useCustomer();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  
  // --- 👇 NUEVOS ESTADOS PARA EL FLUJO DE NUEVO CLIENTE ---
  const [isNewUser, setIsNewUser] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // --------------------------------------------------------

  useEffect(() => {
    if (isPhoneModalOpen) {
      setInputValue('');
      setError('');
      setAgreed(false);
      setIsNewUser(false);
      setCustomerName('');
    }
  }, [isPhoneModalOpen]);
  
  // --- 👇 VERIFICACIÓN DEL NÚMERO EN TIEMPO REAL (con debounce) ---
  useEffect(() => {
    const handler = setTimeout(async () => {
        if (/^\d{10,12}$/.test(inputValue)) {
            setIsLoading(true);
            const { data, error } = await supabase.from('customers').select('id').eq('phone', inputValue).maybeSingle();
            if (!error && !data) {
                setIsNewUser(true);
            } else {
                setIsNewUser(false);
            }
            setIsLoading(false);
        } else {
            setIsNewUser(false);
        }
    }, 500); // Espera 500ms después de que el usuario deja de teclear

    return () => clearTimeout(handler);
  }, [inputValue]);
  // ----------------------------------------------------------------

  const handleSubmit = async () => {
    if (!agreed) {
        setError('Debes aceptar los términos y condiciones para continuar.');
        return;
    }
    if (isNewUser && !customerName.trim()) {
        setError('Por favor, ingresa tu nombre para continuar.');
        return;
    }
    
    setError('');
    const result = await savePhone(inputValue, isNewUser ? customerName : null);
    if (!result.success) {
      setError(result.message);
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
          Ingresa tu número de WhatsApp para ver tus pedidos y facilitar tus compras.
        </p>
        <input
          type="tel"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Tu número de WhatsApp"
          className={styles.phoneInput}
        />
        
        {/* --- 👇 CAMPO DE NOMBRE CONDICIONAL --- */}
        {isNewUser && (
            <div className={styles.newUserSection}>
                <p className={styles.newUserMessage}>¡Qué bueno tenerte por aquí! Por favor, dinos tu nombre:</p>
                <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Tu nombre completo"
                    className={styles.nameInput}
                    required
                />
            </div>
        )}
        {/* --- 👆 FIN DEL CAMPO CONDICIONAL --- */}

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
          <button onClick={handleSubmit} className={styles.saveButton} disabled={isLoading}>
            {isLoading ? 'Verificando...' : 'Guardar y Continuar'}
          </button>
          <button onClick={handleClose} className={styles.laterButton}>
            Quizás más tarde
          </button>
        </div>
      </div>
    </div>
  );
}