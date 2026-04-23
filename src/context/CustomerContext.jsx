import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { deleteFCMRegistration } from '../lib/firebaseConfig';

const CustomerContext = createContext();

const CUSTOMER_PHONE_KEY = 'customer_phone';
const CUSTOMER_DATA_KEY = 'customer_data';


export const useCustomer = () => useContext(CustomerContext);

const generateUniqueReferralCode = async (name, phone) => {
  const namePart = name.substring(0, 2).toUpperCase();
  const phonePart = phone.slice(-2);
  const baseCode = `EA-${namePart}-${phonePart}`;

  let finalCode = baseCode;
  let counter = 1;
  let isUnique = false;

  while (!isUnique) {
    const { data, error } = await supabase
      .from('customers')
      .select('id')
      .eq('referral_code', finalCode)
      .maybeSingle();

    if (error) {
      console.error('Error checking for unique code:', error);
      return `EA-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    }

    if (!data) {
      isUnique = true;
    } else {
      counter++;
      finalCode = `${baseCode}-${counter}`;
    }
  }

  return finalCode;
};

export const CustomerProvider = ({ children }) => {
  const [phone, setPhone] = useState('');
  const [customer, setCustomer] = useState(null);
  const [activeTermsId, setActiveTermsId] = useState(null);
  const [isPhoneModalOpen, setPhoneModalOpen] = useState(false);
  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState('checkout');
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);
  const [isCustomerLoading, setIsCustomerLoading] = useState(true);
  const isMountedRef = useRef(false);
  const sessionRestoreIdRef = useRef(0);

  const fetchActiveTermsId = async () => {
    try {
      const { data, error } = await supabase
        .from('terms_and_conditions')
        .select('id')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error buscando terminos vigentes:', error);
        return null;
      }

      if (!data?.id) {
        console.error('No hay una version vigente de terminos publicada.');
        return null;
      }

      setActiveTermsId(data.id);
      return data.id;
    } catch (error) {
      console.error('Error buscando terminos vigentes:', error);
      return null;
    }
  };

  const resolveActiveTermsId = async (currentTermsId = null) => {
    if (currentTermsId) {
      return { ok: true, termsId: currentTermsId };
    }

    if (activeTermsId) {
      return { ok: true, termsId: activeTermsId };
    }

    const fetchedTermsId = await fetchActiveTermsId();
    if (!fetchedTermsId) {
      return { ok: false, code: 'terms_unavailable' };
    }

    return { ok: true, termsId: fetchedTermsId };
  };

  const verifyCustomer = useCallback(async (phoneToVerify, currentTermsId = null) => {
    if (!phoneToVerify || phoneToVerify.length < 10) {
      return { status: 'error', code: 'invalid_phone' };
    }

    const termsResolution = await resolveActiveTermsId(currentTermsId);
    if (!termsResolution.ok) {
      return { status: 'error', code: termsResolution.code };
    }

    try {
      const { data, error } = await supabase
        .from('customers')
        .select(`
          *,
          customer_terms_acceptances ( terms_version_id )
        `)
        .eq('phone', phoneToVerify)
        .maybeSingle();

      if (error) {
        console.error('Error de red o DB en verifyCustomer:', error);
        return { status: 'error', code: 'customer_lookup_failed' };
      }

      if (!data) {
        return { status: 'not_found' };
      }

      const hasAcceptedCurrent = data.customer_terms_acceptances?.some(
        acceptance => acceptance.terms_version_id === termsResolution.termsId
      );

      const customerData = {
        ...data,
        terms_accepted: !!hasAcceptedCurrent
      };

      delete customerData.customer_terms_acceptances;

      return { status: 'found', customer: customerData };
    } catch (error) {
      console.error('Error inesperado verificando cliente:', error);
      return { status: 'error', code: 'unexpected_customer_lookup_error' };
    }
  }, [activeTermsId]);

  const executeLogin = useCallback(async (customerData) => {
    // Si el usuario no tiene referral_code, generarlo
    if (!customerData.referral_code) {
      const newReferralCode = await generateUniqueReferralCode(customerData.name, customerData.phone);
      const { data: updated, error } = await supabase
        .from('customers')
        .update({ referral_code: newReferralCode })
        .eq('id', customerData.id)
        .select()
        .single();

      if (!error && updated) {
        customerData.referral_code = newReferralCode;
      }
    }

    setCustomer(customerData);
    setPhone(customerData.phone);
    localStorage.setItem(CUSTOMER_PHONE_KEY, customerData.phone);
    localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(customerData));

    if (isPhoneModalOpen) {
      setPhoneModalOpen(false);
    }

    if (onSuccessCallback) {
      onSuccessCallback();
      setOnSuccessCallback(null);
    }
  }, [isPhoneModalOpen, onSuccessCallback]);

  const clearCachedCustomerData = () => {
    localStorage.removeItem(CUSTOMER_DATA_KEY);
    setCustomer(null);
    setPhone('');
  };

  const checkAndLogin = async (phoneToLogin, options = {}) => {
    const { requirePersistedSession = false, restoreId = null } = options;
    const result = await verifyCustomer(phoneToLogin);

    if (!isMountedRef.current) {
      return { status: 'cancelled' };
    }

    if (requirePersistedSession) {
      const hasSamePersistedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY) === phoneToLogin;
      const isSameRestoreAttempt = restoreId === null || sessionRestoreIdRef.current === restoreId;

      if (!hasSamePersistedPhone || !isSameRestoreAttempt) {
        return { status: 'cancelled' };
      }
    }

    if (result.status === 'found' && result.customer.terms_accepted) {
      executeLogin(result.customer);
      return result;
    }

    if (result.status === 'found') {
      clearCachedCustomerData();
      return result;
    }

    if (result.status === 'not_found') {
      clearPhone();
    }

    return result;
  };

  const initializeSession = useCallback(async () => {
    const restoreId = sessionRestoreIdRef.current + 1;
    sessionRestoreIdRef.current = restoreId;
    const savedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY);

    await fetchActiveTermsId();

    const canContinueRestore =
      isMountedRef.current &&
      sessionRestoreIdRef.current === restoreId &&
      localStorage.getItem(CUSTOMER_PHONE_KEY) === savedPhone;

    if (savedPhone && canContinueRestore) {
      await checkAndLogin(savedPhone, {
        requirePersistedSession: true,
        restoreId,
      });
    }

    if (isMountedRef.current && sessionRestoreIdRef.current === restoreId) {
      setIsCustomerLoading(false);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    isMountedRef.current = true;
    initializeSession();

    return () => {
      isMountedRef.current = false;
      sessionRestoreIdRef.current += 1;
    };
  }, [initializeSession]);

  const registerNewCustomer = async (customerPhone, name, inviterCode = null) => {
    const newClientReferralCode = await generateUniqueReferralCode(name, customerPhone);

    let referrerId = null;

    if (inviterCode) {
      const { data: referrerData } = await supabase
        .from('customers')
        .select('id')
        .eq('referral_code', inviterCode)
        .maybeSingle();

      if (referrerData) {
        referrerId = referrerData.id;
      }
    }

    const { data: newCustomer, error } = await supabase
      .from('customers')
      .insert({
        name,
        phone: customerPhone,
        referral_code: newClientReferralCode,
        referrer_id: referrerId,
        referral_count: 0,
        has_made_first_purchase: false
      })
      .select()
      .single();

    if (error) {
      console.error('Error registrando nuevo cliente:', error);
      return null;
    }

    return newCustomer;
  };

  const acceptTerms = async (customerId) => {
    if (!customerId) {
      return { ok: false, code: 'invalid_customer_id' };
    }

    const termsResolution = await resolveActiveTermsId();
    if (!termsResolution.ok) {
      console.error('Intento de aceptar terminos sin una version vigente cargada.');
      return { ok: false, code: termsResolution.code };
    }

    try {
      const { error } = await supabase
        .from('customer_terms_acceptances')
        .insert({
          customer_id: customerId,
          terms_version_id: termsResolution.termsId
        });

      if (error) {
        if (error.code === '23505') {
          console.warn('El usuario ya habia aceptado esta version.');
          return { ok: true, code: 'already_accepted', termsId: termsResolution.termsId };
        }

        console.error('Error aceptando terminos relacionales:', error);
        return { ok: false, code: 'acceptance_failed' };
      }

      return { ok: true, code: 'accepted', termsId: termsResolution.termsId };
    } catch (error) {
      console.error('Error inesperado aceptando terminos:', error);
      return { ok: false, code: 'unexpected_acceptance_error' };
    }
  };

  const savePhoneAndContinue = async (phoneToSave, name = null) => {
    const loginResult = await checkAndLogin(phoneToSave);

    if (loginResult.status === 'found') {
      return loginResult.customer.terms_accepted;
    }

    if (loginResult.status === 'error') {
      return false;
    }

    if (!name) {
      localStorage.setItem(CUSTOMER_PHONE_KEY, phoneToSave);
      return false;
    }

    const customerData = await registerNewCustomer(phoneToSave, name);
    if (!customerData) {
      return false;
    }

    const acceptanceResult = await acceptTerms(customerData.id);
    if (!acceptanceResult.ok) {
      return false;
    }

    executeLogin({ ...customerData, terms_accepted: true });
    return true;
  };

  function clearPhone() {
    const currentCustomerId = customer?.id;

    sessionRestoreIdRef.current += 1;
    localStorage.removeItem(CUSTOMER_PHONE_KEY);
    localStorage.removeItem(CUSTOMER_DATA_KEY);
    setPhone('');
    setCustomer(null);

    const cleanupNotificationSession = async () => {
      if (currentCustomerId) {
        const { error } = await supabase
          .from('push_subscriptions')
          .delete()
          .eq('customer_id', currentCustomerId);

        if (error) {
          console.error('[Notifications] No se pudo limpiar la suscripcion push del cliente:', error);
        }
      }

      await deleteFCMRegistration();
    };

    cleanupNotificationSession().catch((error) => {
      console.error('[Notifications] Error limpiando sesion push:', error);
    });
  }

  const togglePhoneModal = (value) => {
    if (typeof value === 'function') {
      setOnSuccessCallback(() => value);
      setPhoneModalOpen(true);
    } else {
      setOnSuccessCallback(null);
      setPhoneModalOpen(!!value);
    }
  };

  const toggleCheckoutModal = (isOpen, mode = 'checkout') => {
    setCheckoutMode(mode);
    setCheckoutModalOpen(isOpen);
  };

  const value = {
    phone,
    customer,
    isCustomerLoading,
    checkAndLogin,
    verifyCustomer,
    executeLogin,
    registerNewCustomer,
    acceptTerms,
    savePhoneAndContinue,
    clearPhone,
    isPhoneModalOpen,
    setPhoneModalOpen: togglePhoneModal,
    isCheckoutModalOpen,
    setCheckoutModalOpen: toggleCheckoutModal,
    checkoutMode,
  };

  return (
    <CustomerContext.Provider value={value}>
      {children}
    </CustomerContext.Provider>
  );
};
