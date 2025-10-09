import React, { useState, useEffect } from 'react';
import { useCustomer } from '../context/CustomerContext';
import { useSettings } from '../context/SettingsContext';
import { useAlert } from '../context/AlertContext';
import styles from './PhoneModal.module.css';
import DOMPurify from 'dompurify';

export default function PhoneModal() {
  const {
    isPhoneModalOpen,
    setPhoneModalOpen,
    checkAndLogin,
    registerNewCustomer,
    acceptTerms,
    customer,
    savePhoneAndContinue
  } = useCustomer();
  
  const { getSetting } = useSettings();
  const { showAlert } = useAlert();

  const [inputValue, setInputValue] = useState('');
  const [name, setName] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [userExistsButNoAcceptance, setUserExistsButNoAcceptance] = useState(false);
  const [referralCode, setReferralCode] = useState('');

  useEffect(() => {
    if (isPhoneModalOpen) {
        setInputValue('');
        setName('');
        setIsNewUser(false);
        setError('');
        setAgreed(false);
        setUserExistsButNoAcceptance(false);

        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        if (refCode) {
            setReferralCode(refCode);
        }
    }
  }, [isPhoneModalOpen]);

  useEffect(() => {
    const attemptAutoLoginOrDetectNewUser = async () => {
        if (inputValue.length === 10) {
            setIsNewUser(false);
            setUserExistsButNoAcceptance(false);
            
            const result = await checkAndLogin(inputValue);

            if (result.exists) {
                if (result.accepted) {
                    savePhoneAndContinue(inputValue);
                } else {
                    setUserExistsButNoAcceptance(true);
                }
            } else {
                setIsNewUser(true);
            }
        } else {
            setIsNewUser(false);
            setUserExistsButNoAcceptance(false);
        }
    };

    const debounceCheck = setTimeout(() => {
        attemptAutoLoginOrDetectNewUser();
    }, 500);

    return () => clearTimeout(debounceCheck);

  }, [inputValue, checkAndLogin, savePhoneAndContinue]);

  const handleSubmit = async () => {
    setError('');
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
        const registered = await registerNewCustomer(inputValue, cleanName, referralCode);

        if (registered) {
            // Lógica dinámica para la recompensa de bienvenida
            if (referralCode) {
                const welcomeReward = getSetting('welcome_reward');
                if (welcomeReward && welcomeReward.enabled) {
                    const message = welcomeReward.message.replace('{CODE}', welcomeReward.discount_code);
                    showAlert(message);
                }
            }
        } else {
            setError('Hubo un error al registrar tu cuenta. Inténtalo de nuevo.');
        }
        
    } else if (userExistsButNoAcceptance) {
        if (customer) {
            const accepted = await acceptTerms(customer.id);
            if (accepted) {
                savePhoneAndContinue(inputValue);
            } else {
                setError('No se pudo guardar la aceptación de los términos.');
            }
        } else {
            setError('Error: No se encontró la información del cliente.');
        }
    }
  };

  const handleClose = () => {
    setPhoneModalOpen(false);
  };

  if (!isPhoneModalOpen) return null;

  const shouldShowSubmitButton = isNewUser || userExistsButNoAcceptance;

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

        {isNewUser && (
            <div className={styles.newUserSection}>
                <p className={styles.newUserMessage}>
                    {referralCode ? '¡Genial! Estás aquí por una invitación. ' : '¡Qué bueno tenerte por aquí! '}
                    Parece que eres nuevo. ¿Cómo te llamas?
                </p>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Tu nombre completo"
                    className={styles.nameInput}
                />
            </div>
        )}
        
        {shouldShowSubmitButton && (
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
        )}

        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.buttons}>
          {shouldShowSubmitButton ? (
             <button onClick={handleSubmit} className={styles.saveButton} disabled={!agreed}>
                {isNewUser ? 'Crear mi cuenta y continuar' : 'Aceptar y Continuar'}
             </button>
          ) : (
            inputValue.length === 10 && <p>Verificando...</p>
          )}

          <button onClick={handleClose} className={styles.laterButton}>
            Quizás más tarde
          </button>
        </div>
      </div>
    </div>
  );
}