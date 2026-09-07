import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { useCustomer } from '../context/CustomerContext';
import { useSettings } from '../context/SettingsContext';
import { useAlert } from '../context/AlertContext';
import { useReferralCode } from '../hooks/useReferralCode';
import { normalizeE164Phone } from '../lib/customerAuth';
import styles from './PhoneModal.module.css';

const authMessage = (code) => ({
  OTP_ERROR: 'No pudimos verificar el código. Revisa el código e inténtalo de nuevo.',
  CUSTOMER_NOT_LINKED: 'No pudimos vincular tu cuenta con tu cliente existente.',
  CUSTOMER_NOT_FOUND: 'No encontramos un cliente para esta cuenta.',
}[code] || 'No pudimos completar el acceso. Inténtalo de nuevo.');

export default function PhoneModal() {
  const {
    isPhoneModalOpen,
    setPhoneModalOpen,
    requestOtp,
    verifyOtp,
    linkCustomer,
    completeRegistration,
    customer,
    isAuthenticated,
  } = useCustomer();
  const { getSetting } = useSettings();
  const { showAlert } = useAlert();
  const { referralCode, clearReferralCode } = useReferralCode(isPhoneModalOpen);

  const [inputValue, setInputValue] = useState('');
  const [countryCode, setCountryCode] = useState('+52');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [step, setStep] = useState('phone');
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [needsRegistration, setNeedsRegistration] = useState(false);

  useEffect(() => {
    if (!isPhoneModalOpen) return;
    setInputValue(''); setCountryCode('+52'); setOtp(''); setName('');
    setStep('phone'); setError(''); setIsBusy(false); setNeedsRegistration(false);
  }, [isPhoneModalOpen]);

  if (!isPhoneModalOpen) return null;

  const phone = normalizeE164Phone(countryCode, inputValue);

  const handleRequestOtp = async () => {
    setError('');
    if (!phone) { setError('Ingresa un número válido de 10 dígitos.'); return; }
    setIsBusy(true);
    const result = await requestOtp(phone);
    setIsBusy(false);
    if (!result.ok) { setError(authMessage(result.code)); return; }
    setStep('otp');
  };

  const handleVerifyOtp = async () => {
    setError('');
    if (!phone || !/^\d{6}$/.test(otp)) { setError('Ingresa el código de 6 dígitos.'); return; }
    setIsBusy(true);
    const result = await verifyOtp(phone, otp);
    if (!result.ok) { setIsBusy(false); setError(authMessage(result.code)); return; }

    const linkResult = await linkCustomer();
    if (linkResult.ok) {
      setIsBusy(false);
      clearReferralCode();
      setPhoneModalOpen(false);
      return;
    }

    const canRegister = linkResult.error?.message?.includes('customer_not_found_for_verified_phone');
    if (!canRegister) {
      setIsBusy(false);
      setError('Tu teléfono está autenticado, pero no pudimos vincularlo a un cliente existente.');
      return;
    }

    setNeedsRegistration(true);
    setStep('registration');
    setIsBusy(false);
  };

  const handleCompleteRegistration = async () => {
    setError('');
    if (!name.trim()) { setError('Ingresa tu nombre completo.'); return; }
    setIsBusy(true);
    const result = await completeRegistration(DOMPurify.sanitize(name.trim()), referralCode || null);
    setIsBusy(false);
    if (!result.ok) { setError(authMessage(result.code)); return; }

    const activeWelcome = referralCode ? getSetting('welcome_reward') : null;
    if (referralCode && activeWelcome?.enabled !== false) {
      const code = activeWelcome?.discount_code || 'AMIGONUEVO';
      localStorage.setItem('ACTIVE_WELCOME_DISCOUNT', code);
      showAlert((activeWelcome?.message || '¡Bienvenido(a)! Usa tu cupón {CODE}.').replace('{CODE}', code), { copyCode: code, title: '¡Bienvenido(a) a Entre Alas! 🍗' });
    }
    clearReferralCode();
    setPhoneModalOpen(false);
  };

  const handleClose = () => setPhoneModalOpen(false);

  return <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && handleClose()}>
    <div className={styles.modalContent}>
      <button className={styles.closeBtn} onClick={handleClose} aria-label="Cerrar">×</button>
      <div className={styles.header}>
        <h2>{step === 'phone' ? 'Inicia sesión' : step === 'otp' ? 'Verifica tu teléfono' : 'Completa tu perfil'}</h2>
        <p>{step === 'phone' ? 'Usa tu teléfono para recibir un código de acceso.' : step === 'otp' ? `Enviamos un código a ${phone}.` : 'Tu número ya está verificado. Solo necesitamos tu nombre para crear tu cliente.'}</p>
      </div>

      {step === 'phone' && <>
        <div className={styles.phoneInputGroup}>
          <select className={styles.countrySelect} value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
            <option value="+52">🇲🇽 +52</option><option value="+1">🇺🇸 +1</option>
          </select>
          <input type="tel" inputMode="numeric" autoComplete="tel-national" value={inputValue} onChange={(e) => setInputValue(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Número a 10 dígitos" className={styles.phoneInput} autoFocus />
        </div>
        <button onClick={handleRequestOtp} className={styles.primaryButton} disabled={isBusy || !phone}>{isBusy ? 'Enviando…' : 'Enviar código'}</button>
      </>}

      {step === 'otp' && <>
        <input type="text" inputMode="numeric" autoComplete="one-time-code" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Código de 6 dígitos" className={styles.modernInput} autoFocus />
        <button onClick={handleVerifyOtp} className={styles.primaryButton} disabled={isBusy || otp.length !== 6}>{isBusy ? 'Verificando…' : 'Verificar código'}</button>
        <button onClick={() => setStep('phone')} className={styles.secondaryButton}>Cambiar teléfono</button>
      </>}

      {step === 'registration' && needsRegistration && <>
        <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre completo" className={styles.modernInput} autoFocus />
        <label className={styles.termsLabel}><input type="checkbox" id="terms-check" /> <span>Acepto los <a href="/terminos" target="_blank" rel="noopener noreferrer">Términos y Condiciones</a></span></label>
        <button onClick={handleCompleteRegistration} className={styles.primaryButton} disabled={isBusy || !name.trim()}>{isBusy ? 'Creando…' : 'Crear mi cuenta'}</button>
      </>}

      {isAuthenticated && customer && <p className={styles.updateNotice}>Ya tienes una sesión activa.</p>}
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  </div>;
}
