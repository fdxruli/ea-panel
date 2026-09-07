import { useEffect, useState, useCallback } from 'react';

const REFERRAL_KEY = 'REFERRAL_CODE';
const REFERRAL_WARNING_KEY = 'REFERRAL_SHOWN_WARNING';

/**
 * Captura y guarda en localStorage inmediatamente el parámetro ref de la URL.
 * Puede ser llamado en cualquier punto de inicio de la aplicación.
 */
export const captureReferralCodeFromUrl = () => {
  if (typeof window === 'undefined') return null;
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const refFromUrl = urlParams.get('ref');
    if (refFromUrl && refFromUrl.trim()) {
      const cleanRef = refFromUrl.trim().toUpperCase();
      localStorage.setItem(REFERRAL_KEY, cleanRef);
      return cleanRef;
    }
  } catch (err) {
    console.error('Error capturing referral code from URL:', err);
  }
  return null;
};

// Auto-captura inmediata en cuanto este script se evalúa
if (typeof window !== 'undefined') {
  captureReferralCodeFromUrl();
}

export const getStoredReferralCode = () => {
  if (typeof window === 'undefined') return '';
  return captureReferralCodeFromUrl() || localStorage.getItem(REFERRAL_KEY) || '';
};

export const useReferralCode = (isPhoneModalOpen = false) => {
  const [referralCode, setReferralCode] = useState(() => getStoredReferralCode());
  
  const [referralSource, setReferralSource] = useState(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get('ref')) return 'url';
    }
    return localStorage.getItem(REFERRAL_KEY) ? 'storage' : null;
  });

  const syncReferralCode = useCallback(() => {
    const fromUrl = captureReferralCodeFromUrl();
    if (fromUrl) {
      setReferralCode(fromUrl);
      setReferralSource('url');
      return;
    }

    const fromStorage = localStorage.getItem(REFERRAL_KEY);
    if (fromStorage) {
      setReferralCode(fromStorage);
      setReferralSource('storage');
    } else {
      setReferralCode('');
      setReferralSource(null);
    }
  }, []);

  // Al montar o cuando se abre el modal de teléfono, sincronizar
  useEffect(() => {
    syncReferralCode();
  }, [isPhoneModalOpen, syncReferralCode]);

  const clearReferralCode = useCallback(() => {
    setReferralCode('');
    setReferralSource(null);
    localStorage.removeItem(REFERRAL_KEY);
    localStorage.removeItem(REFERRAL_WARNING_KEY);
  }, []);

  return { referralCode, referralSource, clearReferralCode };
};