import React, { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { useCustomer } from '../context/CustomerContext';
import { useSettings } from '../context/SettingsContext';
import { useAlert } from '../context/AlertContext';
import { useReferralCode } from '../hooks/useReferralCode';
import styles from './PhoneModal.module.css';

const getVerificationErrorMessage = (code) => {
  if (code === 'terms_unavailable') return 'No pudimos cargar los términos. Inténtalo de nuevo.';
  if (code === 'customer_lookup_failed' || code === 'unexpected_customer_lookup_error') return 'Error al verificar tu número. Inténtalo de nuevo.';
  return 'Verifica los datos e inténtalo de nuevo.';
};

const getAcceptanceErrorMessage = (code) => {
  if (code === 'terms_unavailable') return 'No pudimos cargar los términos. Inténtalo de nuevo.';
  return 'No se pudo guardar la aceptación de los términos.';
};

export default function PhoneModal() {
  const {
    isPhoneModalOpen,
    setPhoneModalOpen,
    verifyCustomer,
    executeLogin,
    registerNewCustomer,
    acceptTerms,
    customer, // Para detectar si hay sesión activa
  } = useCustomer();

  const { getSetting } = useSettings();
  const { showAlert } = useAlert();
  const { referralCode, clearReferralCode } = useReferralCode(isPhoneModalOpen);

  const [inputValue, setInputValue] = useState('');
  const [countryCode, setCountryCode] = useState('+52');
  const [name, setName] = useState('');
  const [isNewUser, setIsNewUser] = useState(false);
  const [error, setError] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [userExistsButNoAcceptance, setUserExistsButNoAcceptance] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [hasBlockingError, setHasBlockingError] = useState(false);
  const [referralWarning, setReferralWarning] = useState(''); // Nuevo: mensaje de advertencia referral

  useEffect(() => {
    if (!isPhoneModalOpen) return;
    setInputValue('');
    setCountryCode('+52');
    setName('');
    setIsNewUser(false);
    setError('');
    setAgreed(false);
    setUserExistsButNoAcceptance(false);
    setPendingCustomer(null);
    setIsVerifying(false);
    setHasBlockingError(false);
    setReferralWarning('');
  }, [isPhoneModalOpen]);

  const handleLookupResult = useCallback((result) => {
    if (result.status === 'found') {
      // Cliente YA EXISTE EN LA BD

      // Si ya tiene sesión activa, no volver a verificar
      if (customer?.phone === result.customer?.phone) {
        return;
      }

      // Si tiene términos aceptados, iniciar sesión
      if (result.customer.terms_accepted) {
        // Ya inició sesión - no puede usar referral code
        if (referralCode && !localStorage.getItem('REFERRAL_SHOWN_WARNING')) {
          setReferralWarning(
            'Como ya estás registrado, no puedes usar códigos de referidos. ' +
            'Pero puedes compartir el tuyo para invitar a tus amigos: ' +
            `${result.customer.referral_code}`
          );
          localStorage.setItem('REFERRAL_SHOWN_WARNING', 'true');
        }
        executeLogin(result.customer);
        return;
      }

      // Cliente existe pero NO ha iniciado sesión aún
      if (referralCode && !localStorage.getItem('REFERRAL_SHOWN_WARNING')) {
        setReferralWarning(
          '¡Invitación activada! Completa tu registro aceptando los términos para obtener tus beneficios.'
        );
        localStorage.setItem('REFERRAL_SHOWN_WARNING', 'true');
      }

      setPendingCustomer(result.customer);
      setUserExistsButNoAcceptance(true);
      return;
    }

    if (result.status === 'not_found') {
      // Cliente NUEVO - puede usar referral code
      setIsNewUser(true);
      return;
    }

    setHasBlockingError(true);
    setError(getVerificationErrorMessage(result.code));
  }, [referralCode, executeLogin, customer?.phone]);

  useEffect(() => {
    setIsNewUser(false);
    setUserExistsButNoAcceptance(false);
    setPendingCustomer(null);
    setError('');
    setHasBlockingError(false);
    setAgreed(false);
    setReferralWarning('');

    if (inputValue.length !== 10) {
      setIsVerifying(false);
      return;
    }

    // Skip verification if this phone is already the logged-in customer
    const fullPhone = `${countryCode}${inputValue}`;
    if (customer?.phone === fullPhone) {
      setIsVerifying(false);
      return;
    }

    let cancelled = false;
    setIsVerifying(true);

    const debounceCheck = setTimeout(async () => {
      const result = await verifyCustomer(fullPhone);
      if (!cancelled) {
        setIsVerifying(false);
        handleLookupResult(result);
      }
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(debounceCheck);
    };
  }, [inputValue, countryCode, verifyCustomer, handleLookupResult, customer?.phone]);

  const handleSubmit = async () => {
    setError('');

    if (shouldShowSubmitButton && !agreed) {
      setError('Debes aceptar los términos para continuar.');
      return;
    }

    if (isNewUser) {
      if (!name.trim()) {
        setError('Por favor, ingresa tu nombre.');
        return;
      }

      const fullPhone = `${countryCode}${inputValue}`;
      const cleanName = DOMPurify.sanitize(name.trim());
      const registeredCustomer = await registerNewCustomer(
        fullPhone,
        cleanName,
        referralCode // Pasar el código de referral
      );

      if (!registeredCustomer) {
        setError('Error al registrar tu cuenta. Inténtalo de nuevo.');
        return;
      }

      const acceptanceResult = await acceptTerms(registeredCustomer.id);
      if (!acceptanceResult.ok) {
        setPendingCustomer(registeredCustomer);
        setIsNewUser(false);
        setUserExistsButNoAcceptance(true);
        setError(getAcceptanceErrorMessage(acceptanceResult.code));
        return;
      }

      // ✅ REGISTRO EXITOSO - Limpiar código de referral
      executeLogin({ ...registeredCustomer, terms_accepted: true });
      clearReferralCode();

      // Mostrar mensaje de bienvenida si vino con referido
      if (referralCode) {
        const welcomeReward = getSetting('welcome_reward');
        if (welcomeReward?.enabled) {
          showAlert(welcomeReward.message.replace('{CODE}', welcomeReward.discount_code));
        }
      }
      return;
    }

    if (userExistsButNoAcceptance && pendingCustomer) {
      const acceptanceResult = await acceptTerms(pendingCustomer.id);
      if (!acceptanceResult.ok) {
        setError(getAcceptanceErrorMessage(acceptanceResult.code));
        return;
      }

      // ✅ ACEPTACIÓN COMPLETADA - Limpiar código de referral
      executeLogin({ ...pendingCustomer, terms_accepted: true });
      clearReferralCode();

      // Mostrar mensaje de bienvenida si vino con referido
      if (referralCode) {
        const welcomeReward = getSetting('welcome_reward');
        if (welcomeReward?.enabled) {
          showAlert(welcomeReward.message.replace('{CODE}', welcomeReward.discount_code));
        }
      }
    }
  };

  if (!isPhoneModalOpen) return null;

  const shouldShowSubmitButton = !hasBlockingError && (isNewUser || userExistsButNoAcceptance);
  const isComplete = inputValue.length === 10;

  return (
    <div
      className={styles.overlay}
      onMouseDown={(e) => e.target === e.currentTarget && setPhoneModalOpen(false)}
    >
      <div className={styles.modalContent}>
        <button
          className={styles.closeBtn}
          onClick={() => setPhoneModalOpen(false)}
          aria-label="Cerrar"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18M6 6l12 12"></path>
          </svg>
        </button>

        <div className={styles.header}>
          <h2>Ingresa a Entre Alas</h2>
          <p>Usa tu WhatsApp para ver tus pedidos guardados y agilizar tu compra.</p>
        </div>

        <div className={styles.phoneInputGroup}>
          <select
            className={styles.countrySelect}
            value={countryCode}
            onChange={(e) => setCountryCode(e.target.value)}
          >
            <option value="+52">🇲🇽 +52</option>
            <option value="+1">🇺🇸 +1</option>
          </select>

          <div className={styles.inputWrapper}>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="tel-national"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ''))}
              placeholder="Número a 10 dígitos"
              className={styles.phoneInput}
              maxLength="10"
              autoFocus
            />
            {isVerifying && <div className={styles.spinner}></div>}
          </div>
        </div>

        {/* MOSTRAR ADVERTENCIA DE REFERRAL SI EXISTE */}
        {referralWarning && (
          <div className={styles.referralWarning}>
            <p>{referralWarning}</p>
          </div>
        )}

        <div className={`${styles.expandableArea} ${isNewUser ? styles.expanded : ''}`}>
          <div className={styles.expandableContent}>
            <p className={styles.promptText}>
              {referralCode && isNewUser ? '¡Vienes con invitación!' : 'Parece que eres nuevo.'} ¿Cómo te llamas?
            </p>
            <input
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre completo"
              className={styles.modernInput}
            />
          </div>
        </div>

        {shouldShowSubmitButton && (
          <div className={styles.termsWrapper}>
            {userExistsButNoAcceptance && !referralWarning && (
              <p className={styles.updateNotice}>
                Actualizamos nuestros Términos. Por favor acéptalos para continuar.
              </p>
            )}
            <label className={styles.termsLabel}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className={styles.checkbox}
              />
              <span>
                Acepto los <a href="/terminos" target="_blank" rel="noopener noreferrer">Términos y Condiciones</a>
              </span>
            </label>
          </div>
        )}

        <div className={styles.feedbackArea}>
          {error && <p className={styles.errorText}>{error}</p>}
        </div>

        {shouldShowSubmitButton && (
          <button onClick={handleSubmit} className={styles.primaryButton}>
            {isNewUser ? 'Crear cuenta' : 'Continuar'}
          </button>
        )}
      </div>
    </div>
  );
}