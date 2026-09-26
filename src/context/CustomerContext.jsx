import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { NETWORK_CONFIRMED_ONLINE_EVENT } from '../lib/networkState';

const CustomerContext = createContext();

const CUSTOMER_PHONE_KEY = 'customer_phone';
const CUSTOMER_DATA_KEY = 'customer_data';
const CANONICAL_CUSTOMER_ID_KEY = 'customer_canonical_id';

export const useCustomer = () => useContext(CustomerContext);

const normalizeCustomer = (customer) => {
  if (!customer?.id || !customer?.phone) return customer;
  return customer;
};


export const CustomerProvider = ({ children }) => {
  const [phone, setPhone] = useState(() => {
    try {
      return localStorage.getItem(CUSTOMER_PHONE_KEY) || '';
    } catch {
      return '';
    }
  });
  const [customer, setCustomer] = useState(() => {
    try {
      const saved = localStorage.getItem(CUSTOMER_DATA_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [activeTermsId, setActiveTermsId] = useState(() => {
    try {
      return localStorage.getItem('active_terms_id') || null;
    } catch {
      return null;
    }
  });
  const [isPhoneModalOpen, setPhoneModalOpen] = useState(false);
  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState('checkout');
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);
  const [isCustomerLoading, setIsCustomerLoading] = useState(() => {
    try {
      const hasPhone = !!localStorage.getItem(CUSTOMER_PHONE_KEY);
      const hasData = !!localStorage.getItem(CUSTOMER_DATA_KEY);
      return !(hasPhone && hasData);
    } catch {
      return true;
    }
  });
  const isMountedRef = useRef(false);
  const sessionRestoreIdRef = useRef(0);
  const activeTermsIdRef = useRef(activeTermsId);
  const fetchActiveTermsIdRef = useRef(null);
  const checkAndLoginRef = useRef(null);

  useEffect(() => {
    activeTermsIdRef.current = activeTermsId;
  }, [activeTermsId]);

  const fetchActiveTermsId = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('terms_and_conditions').select('id').order('version', { ascending: false }).limit(1).maybeSingle();
      if (error || !data?.id) {
        console.error('Error buscando terminos vigentes:', error || 'No hay una version vigente de terminos publicada.');
        return activeTermsIdRef.current || null;
      }
      activeTermsIdRef.current = data.id;
      setActiveTermsId(data.id);
      try { localStorage.setItem('active_terms_id', data.id); } catch {}
      return data.id;
    } catch (error) {
      console.error('Error buscando terminos vigentes:', error);
      return activeTermsIdRef.current || null;
    }
  }, []);

  const resolveActiveTermsId = useCallback(async (currentTermsId = null) => {
    if (currentTermsId) return { ok: true, termsId: currentTermsId };
    if (activeTermsIdRef.current) return { ok: true, termsId: activeTermsIdRef.current };
    const fetchedTermsId = await fetchActiveTermsId();
    return fetchedTermsId ? { ok: true, termsId: fetchedTermsId } : { ok: false, code: 'terms_unavailable' };
  }, [fetchActiveTermsId]);

  const verifyCustomer = useCallback(async (phoneToVerify) => {
    if (!phoneToVerify || phoneToVerify.length < 10) return { status: 'error', code: 'invalid_phone' };

    try {
      const { data, error } = await supabase.rpc('verify_customer_by_phone', { p_phone: phoneToVerify });
      if (error) {
        console.error('Error de red o DB en verifyCustomer:', error);
        return { status: 'error', code: 'customer_lookup_failed' };
      }
      if (!data || !data.found || !data.customer) return { status: 'not_found' };

      const customerData = normalizeCustomer(data.customer);
      return { status: 'found', customer: customerData };
    } catch (error) {
      console.error('Error inesperado verificando cliente:', error);
      return { status: 'error', code: 'unexpected_customer_lookup_error' };
    }
  }, []);

  const persistCanonicalCustomer = useCallback((customerData) => {
    const canonical = normalizeCustomer(customerData);
    if (!canonical?.id) return;
    localStorage.setItem(CUSTOMER_PHONE_KEY, canonical.phone);
    localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(canonical));
    localStorage.setItem(CANONICAL_CUSTOMER_ID_KEY, canonical.id);
  }, []);

  const executeLogin = useCallback(async (customerData) => {
    const canonical = normalizeCustomer(customerData);
    setCustomer(canonical);
    setPhone(canonical.phone);
    persistCanonicalCustomer(canonical);
    if (isPhoneModalOpen) setPhoneModalOpen(false);
    if (onSuccessCallback) {
      onSuccessCallback();
      setOnSuccessCallback(null);
    }
  }, [isPhoneModalOpen, onSuccessCallback, persistCanonicalCustomer]);

  const clearCachedCustomerData = useCallback(() => {
    localStorage.removeItem(CUSTOMER_DATA_KEY);
    localStorage.removeItem(CANONICAL_CUSTOMER_ID_KEY);
    setCustomer(null);
    setPhone('');
  }, []);

  const clearPhone = useCallback(() => {
    const currentCustomerId = customer?.id;
    sessionRestoreIdRef.current += 1;
    localStorage.removeItem(CUSTOMER_PHONE_KEY);
    localStorage.removeItem(CUSTOMER_DATA_KEY);
    localStorage.removeItem(CANONICAL_CUSTOMER_ID_KEY);
    setPhone('');
    setCustomer(null);

    const cleanupNotificationSession = async () => {
      if (currentCustomerId) {
        const { error } = await supabase.from('push_subscriptions').delete().eq('customer_id', currentCustomerId);
        if (error) console.error('[Notifications] No se pudo limpiar la suscripcion push del cliente:', error);
      }
      const { deleteFCMRegistration } = await import('../lib/firebaseConfig');
      await deleteFCMRegistration();
    };

    cleanupNotificationSession().catch(error => console.error('[Notifications] Error limpiando sesion push:', error));
  }, [customer?.id]);

  const checkAndLogin = useCallback(async (phoneToLogin, options = {}) => {
    const { requirePersistedSession = false, restoreId = null } = options;
    const result = await verifyCustomer(phoneToLogin);
    if (!isMountedRef.current) return { status: 'cancelled' };

    if (requirePersistedSession) {
      const hasSamePersistedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY) === phoneToLogin;
      const isSameRestoreAttempt = restoreId === null || sessionRestoreIdRef.current === restoreId;
      if (!hasSamePersistedPhone || !isSameRestoreAttempt) return { status: 'cancelled' };
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
      return result;
    }
    console.warn('[CustomerContext] Error al validar sesión en servidor (posible timeout/red lenta):', result.code);
    return result;
  }, [clearCachedCustomerData, clearPhone, executeLogin, verifyCustomer]);

  const initializeSession = useCallback(async () => {
    const restoreId = sessionRestoreIdRef.current + 1;
    sessionRestoreIdRef.current = restoreId;
    const savedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY);
    const savedData = localStorage.getItem(CUSTOMER_DATA_KEY);

    if (savedPhone && savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed?.id) {
          setCustomer(parsed);
          setPhone(savedPhone);
        }
      } catch {}
    }

    await fetchActiveTermsIdRef.current?.();
    const canContinueRestore = isMountedRef.current && sessionRestoreIdRef.current === restoreId && localStorage.getItem(CUSTOMER_PHONE_KEY) === savedPhone;
    if (savedPhone && canContinueRestore) {
      await checkAndLoginRef.current?.(savedPhone, { requirePersistedSession: true, restoreId });
    }
    if (isMountedRef.current && sessionRestoreIdRef.current === restoreId) setIsCustomerLoading(false);
  }, []);

  useEffect(() => {
    fetchActiveTermsIdRef.current = fetchActiveTermsId;
    checkAndLoginRef.current = checkAndLogin;
  }, [checkAndLogin, fetchActiveTermsId]);

  const reconcileCanonicalCustomer = useCallback(async () => {
    if (!isMountedRef.current) return;
    const currentPhone = phone || localStorage.getItem(CUSTOMER_PHONE_KEY);
    const currentCustomer = customer;

    if (!currentPhone) return;

    if (!currentCustomer?.id) {
      const savedPhone = localStorage.getItem(CUSTOMER_PHONE_KEY);
      if (savedPhone) {
        console.info('[CustomerContext] Intentando auto-recuperar sesión al volver la conexión/foco...');
        await checkAndLoginRef.current?.(savedPhone, { requirePersistedSession: true });
      }
      return;
    }

    try {
      const { data, error } = await supabase.rpc('verify_customer_by_phone', { p_phone: currentPhone });

      if (error || !data || !data.found || !data.customer || !isMountedRef.current) return;
      if (data.customer.id === currentCustomer.id && data.customer.name === currentCustomer.name) return;

      const canonical = normalizeCustomer({
        ...data.customer,
        terms_accepted: currentCustomer.terms_accepted,
      });

      setCustomer(canonical);
      setPhone(canonical.phone);
      persistCanonicalCustomer(canonical);
      console.warn('[CustomerContext] Identidad canonica reconciliada:', canonical.id);
    } catch (error) {
      console.warn('[CustomerContext] No se pudo reconciliar la identidad al volver a foco:', error);
    }
  }, [customer, persistCanonicalCustomer, phone]);

  useEffect(() => {
    isMountedRef.current = true;
    initializeSession();
    return () => {
      isMountedRef.current = false;
      sessionRestoreIdRef.current += 1;
    };
  }, [initializeSession]);

  useEffect(() => {
    const reconcileOnFocus = () => {
      if (document.visibilityState === 'visible') reconcileCanonicalCustomer();
    };

    document.addEventListener('visibilitychange', reconcileOnFocus);
    window.addEventListener('online', reconcileOnFocus);
    window.addEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
    return () => {
      document.removeEventListener('visibilitychange', reconcileOnFocus);
      window.removeEventListener('online', reconcileOnFocus);
      window.removeEventListener(NETWORK_CONFIRMED_ONLINE_EVENT, reconcileOnFocus);
    };
  }, [reconcileCanonicalCustomer]);

  const registerNewCustomer = useCallback(async (customerPhone, name, inviterCode = null) => {
    const codeToUse = inviterCode || (typeof window !== 'undefined' ? localStorage.getItem('REFERRAL_CODE') : null);
    try {
      const { data, error } = await supabase.rpc('register_customer_by_phone', {
        p_phone: customerPhone,
        p_name: name,
        p_referrer_code: codeToUse || null,
      });
      if (error || !data || !data.ok) {
        console.error('Error registrando nuevo cliente:', error || data?.error);
        return null;
      }
      return data.customer;
    } catch (err) {
      console.error('Error inesperado registrando cliente:', err);
      return null;
    }
  }, []);

  const acceptTerms = useCallback(async (customerId) => {
    if (!customerId) return { ok: false, code: 'invalid_customer_id' };
    try {
      const { data, error } = await supabase.rpc('accept_customer_terms', {
        p_customer_id: customerId,
      });
      if (error || !data || !data.ok) {
        console.error('Error aceptando terminos relacionales:', error || data);
        return { ok: false, code: data?.code || 'acceptance_failed' };
      }
      return { ok: true, code: data.code || 'accepted', termsId: data.terms_id };
    } catch (error) {
      console.error('Error inesperado aceptando terminos:', error);
      return { ok: false, code: 'unexpected_acceptance_error' };
    }
  }, []);

  const savePhoneAndContinue = useCallback(async (phoneToSave, name = null) => {
    const loginResult = await checkAndLogin(phoneToSave);
    if (loginResult.status === 'found') return loginResult.customer.terms_accepted;
    if (loginResult.status === 'error') return false;
    if (!name) {
      localStorage.setItem(CUSTOMER_PHONE_KEY, phoneToSave);
      return false;
    }
    const customerData = await registerNewCustomer(phoneToSave, name);
    if (!customerData) return false;
    const acceptanceResult = await acceptTerms(customerData.id);
    if (!acceptanceResult.ok) return false;
    executeLogin({ ...customerData, terms_accepted: true });
    return true;
  }, [acceptTerms, checkAndLogin, executeLogin, registerNewCustomer]);

  const togglePhoneModal = useCallback((value) => {
    if (typeof value === 'function') {
      setOnSuccessCallback(() => value);
      setPhoneModalOpen(true);
    } else {
      setOnSuccessCallback(null);
      setPhoneModalOpen(!!value);
    }
  }, []);

  const toggleCheckoutModal = useCallback((isOpen, mode = 'checkout') => {
    setCheckoutMode(mode);
    setCheckoutModalOpen(isOpen);
  }, []);

  const value = useMemo(() => ({
    phone,
    customer,
    customerId: customer?.id || null,
    isAuthenticated: Boolean(phone && customer),
    isLinked: Boolean(customer?.id),
    isCustomerLoading,
    checkAndLogin,
    verifyCustomer,
    executeLogin,
    registerNewCustomer,
    acceptTerms,
    savePhoneAndContinue,
    clearPhone,
    signOut: clearPhone,
    isPhoneModalOpen,
    setPhoneModalOpen: togglePhoneModal,
    isCheckoutModalOpen,
    setCheckoutModalOpen: toggleCheckoutModal,
    checkoutMode,
  }), [
    acceptTerms,
    checkAndLogin,
    checkoutMode,
    clearPhone,
    customer,
    executeLogin,
    isCheckoutModalOpen,
    isCustomerLoading,
    isPhoneModalOpen,
    phone,
    registerNewCustomer,
    savePhoneAndContinue,
    toggleCheckoutModal,
    togglePhoneModal,
    verifyCustomer,
  ]);

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
};
