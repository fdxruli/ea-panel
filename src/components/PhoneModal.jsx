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
  const [pendingCustomer, setPendingCustomer] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false); // Estado para mostrar "Verificando..."

  useEffect(() => {
    if (isPhoneModalOpen) {
        setInputValue('');
        setName('');
        setIsNewUser(false);
        setError('');
        setAgreed(false);
        setUserExistsButNoAcceptance(false);
        setPendingCustomer(null);
        setIsVerifying(false); // Resetear al abrir

        const urlParams = new URLSearchParams(window.location.search);
        const refCode = urlParams.get('ref');
        if (refCode) {
            setReferralCode(refCode);
        }
    }
  }, [isPhoneModalOpen]);

  useEffect(() => {
    // Resetear estados dependientes si el input cambia
    setIsNewUser(false);
    setUserExistsButNoAcceptance(false);
    setPendingCustomer(null);
    setError(''); // Limpiar errores si el usuario sigue escribiendo

    if (inputValue.length === 10) {
        setIsVerifying(true); // Mostrar "Verificando..."
        const attemptAutoLoginOrDetectNewUser = async () => {
            const result = await checkAndLogin(inputValue);
            setIsVerifying(false); // Ocultar "Verificando..." después de la comprobación

            if (result.exists) {
                if (result.accepted) {
                    savePhoneAndContinue(inputValue, result.customer);
                } else {
                    setPendingCustomer(result.customer);
                    setUserExistsButNoAcceptance(true);
                }
            } else {
                setIsNewUser(true);
            }
        };

        // El debounce ya no es estrictamente necesario aquí si mostramos "Verificando..."
        // Pero lo mantenemos por si la escritura es muy rápida
        const debounceCheck = setTimeout(() => {
            attemptAutoLoginOrDetectNewUser();
        }, 300); // Reducimos un poco el tiempo

        return () => clearTimeout(debounceCheck);
    } else {
       setIsVerifying(false); // Ocultar si el número no tiene 10 dígitos
    }

  }, [inputValue, checkAndLogin, savePhoneAndContinue]);

  const handleSubmit = async () => {
    setError('');

    if (shouldShowSubmitButton && !agreed) {
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
            if (referralCode) {
                const welcomeReward = getSetting('welcome_reward');
                if (welcomeReward && welcomeReward.enabled) {
                    const message = welcomeReward.message.replace('{CODE}', welcomeReward.discount_code);
                    showAlert(message);
                }
            }
            // No cerramos modal aquí, `registerNewCustomer` llama a `savePhoneAndContinue` que lo cierra.
        } else {
            setError('Hubo un error al registrar tu cuenta. Inténtalo de nuevo.');
        }

    } else if (userExistsButNoAcceptance) {
        if (pendingCustomer) {
            const accepted = await acceptTerms(pendingCustomer.id);
            if (accepted) {
                savePhoneAndContinue(inputValue, pendingCustomer); // Cierra el modal al tener éxito
            } else {
                setError('No se pudo guardar la aceptación de los términos.');
            }
        } else {
            setError('Error: No se encontró la información del cliente para aceptar los términos.');
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

        {/* --- Mensaje de Verificando --- */}
        <p className={styles.verifying}>{isVerifying ? 'Verificando número...' : ''}&nbsp;</p>

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
          <>
            {/* --- 👇 MENSAJE DE ACTUALIZACIÓN DE TÉRMINOS --- */}
            {userExistsButNoAcceptance && (
              <p className={styles.updateTermsMessage}>
                Hemos actualizado nuestros Términos y Condiciones. Por favor, revísalos y acéptalos de nuevo para continuar.
              </p>
            )}
            {/* --- 👆 FIN MENSAJE --- */}

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
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.buttons}>
          {shouldShowSubmitButton && ( // Mostrar botón solo si es necesario (nuevo o re-aceptar)
             <button onClick={handleSubmit} className={styles.saveButton}>
                {isNewUser ? 'Crear mi cuenta y continuar' : 'Aceptar y Continuar'}
             </button>
          )}

          {/* Ocultar "Quizás más tarde" si se está verificando para evitar clics accidentales */}
          {!isVerifying && (
            <button onClick={handleClose} className={styles.laterButton}>
              Quizás más tarde
            </button>
          )}
        </div>
      </div>
    </div>
  );
}