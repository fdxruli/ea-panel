import { useEffect, useState } from 'react';

export const useReferralCode = (isPhoneModalOpen) => {
  const [referralCode, setReferralCode] = useState('');
  const [referralSource, setReferralSource] = useState(null); // 'url' o 'storage'

  useEffect(() => {
    if (!isPhoneModalOpen) return;

    // Prioridad: URL > localStorage
    const urlParams = new URLSearchParams(window.location.search);
    const refFromUrl = urlParams.get('ref');

    if (refFromUrl) {
      setReferralCode(refFromUrl);
      setReferralSource('url');
      // Guardar en localStorage para navegación futura
      localStorage.setItem('REFERRAL_CODE', refFromUrl);
    } else {
      const refFromStorage = localStorage.getItem('REFERRAL_CODE');
      if (refFromStorage) {
        setReferralCode(refFromStorage);
        setReferralSource('storage');
      }
    }
  }, [isPhoneModalOpen]);

  const clearReferralCode = () => {
    setReferralCode('');
    setReferralSource(null);
    localStorage.removeItem('REFERRAL_CODE');
    localStorage.removeItem('REFERRAL_SHOWN_WARNING');
  };

  return { referralCode, referralSource, clearReferralCode };
};