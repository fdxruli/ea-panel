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
  const [countryCode, setCountryCode] = useState('+52'); // <--- Nuevo estado para la Lada
  const [name, setName] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [userExistsButNoAcceptance, setUserExistsButNoAcceptance] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [pendingCustomer, setPendingCustomer] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (isPhoneModalOpen) {
      setInputValue('');
      setCountryCode('+52'); // Resetear a México por defecto
      setName('');
      setIsNewUser(false);
      setError('');
      setAgreed(false);
      setUserExistsButNoAcceptance(false);
      setPendingCustomer(null);
      setIsVerifying(false);

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
    setError('');

    // Verificamos solo si son 10 dígitos
    if (inputValue.length === 10) {
      setIsVerifying(true);

      const attemptAutoLoginOrDetectNewUser = async () => {
        // --- CAMBIO: Combinamos Lada + Número ---
        const fullPhone = `${countryCode}${inputValue}`;

        const result = await checkAndLogin(fullPhone);
        setIsVerifying(false);

        if (result.exists) {
          if (result.accepted) {
            // Si ya existe y aceptó términos, entramos directo
            savePhoneAndContinue(fullPhone, result.customer);
          } else {
            // Existe pero faltan términos
            setPendingCustomer(result.customer);
            setUserExistsButNoAcceptance(true);
          }
        } else {
          // No existe en absoluto
          setIsNewUser(true);
        }
      };

      const debounceCheck = setTimeout(() => {
        attemptAutoLoginOrDetectNewUser();
      }, 300);

      return () => clearTimeout(debounceCheck);
    } else {
      setIsVerifying(false);
    }

    // Agregamos countryCode a las dependencias para que si cambia la lada, vuelva a verificar
  }, [inputValue, countryCode, checkAndLogin, savePhoneAndContinue]);

  const handleSubmit = async () => {
    setError('');
    const fullPhone = `${countryCode}${inputValue}`; // --- CAMBIO: Usamos el número completo

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

      // --- CAMBIO: Registramos con lada incluida ---
      const registered = await registerNewCustomer(fullPhone, cleanName, referralCode);

      if (registered) {
        if (referralCode) {
          const welcomeReward = getSetting('welcome_reward');
          if (welcomeReward && welcomeReward.enabled) {
            const message = welcomeReward.message.replace('{CODE}', welcomeReward.discount_code);
            showAlert(message);
          }
        }
        // savePhoneAndContinue se llama dentro de registerNewCustomer (según tu contexto modificado anteriormente)
        // pero para seguridad, ya el flujo está cubierto.

        // NOTA IMPORTANTE: Si registerNewCustomer NO llama a savePhoneAndContinue internamente en tu versión final,
        // deberías descomentar la siguiente línea:
        await savePhoneAndContinue(fullPhone);

      } else {
        setError('Hubo un error al registrar tu cuenta. Inténtalo de nuevo.');
      }

    } else if (userExistsButNoAcceptance) {
      if (pendingCustomer) {
        const accepted = await acceptTerms(pendingCustomer.id);
        if (accepted) {
          // --- CAMBIO: Guardamos sesión con lada incluida ---
          savePhoneAndContinue(fullPhone, pendingCustomer);
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

        {/* --- CAMBIO: Grupo de inputs con Select de Lada --- */}
        <div className={styles.phoneInputGroup}>
          <select
            className={styles.countrySelect}
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
          >
            <option value="+52">🇲🇽 +52</option>
            <option value="+1">🇺🇸 +1</option>
          </select>

          <input
            type="tel"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ''))}
            placeholder="10 dígitos"
            className={styles.phoneInput}
            maxLength="10"
          />
        </div>

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
            {userExistsButNoAcceptance && (
              <p className={styles.updateTermsMessage}>
                Hemos actualizado nuestros Términos y Condiciones. Por favor, revísalos y acéptalos de nuevo para continuar.
              </p>
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
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}
        <div className={styles.buttons}>
          {shouldShowSubmitButton && (
            <button onClick={handleSubmit} className={styles.saveButton}>
              {isNewUser ? 'Crear mi cuenta y continuar' : 'Aceptar y Continuar'}
            </button>
          )}

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