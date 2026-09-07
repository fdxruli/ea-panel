import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { completeMyCustomerRegistration, getAuthState, linkMyCustomer, requestPhoneOtp, resolveMyCustomer, signOutCustomer, verifyPhoneOtp } from '../lib/customerAuth';

const CustomerContext = createContext();

const CUSTOMER_PHONE_KEY = 'customer_phone';
const CUSTOMER_DATA_KEY = 'customer_data';
const CANONICAL_CUSTOMER_ID_KEY = 'customer_canonical_id';

export const useCustomer = () => useContext(CustomerContext);

const persistLegacyCache = (customerData) => {
  if (typeof window === 'undefined' || !customerData?.id) return;
  // Legacy cache only. Never use these values to prove authentication or ownership.
  if (customerData.phone) localStorage.setItem(CUSTOMER_PHONE_KEY, customerData.phone);
  localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(customerData));
  localStorage.setItem(CANONICAL_CUSTOMER_ID_KEY, customerData.id);
};

const clearLegacyIdentityCache = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CUSTOMER_PHONE_KEY);
  localStorage.removeItem(CUSTOMER_DATA_KEY);
  localStorage.removeItem(CANONICAL_CUSTOMER_ID_KEY);
};

const generateUniqueReferralCode = async (name, phone) => {
  const safeName = String(name || 'CL').trim() || 'CL';
  const namePart = safeName.substring(0, 2).toUpperCase();
  const phonePart = String(phone || '').slice(-2);
  const baseCode = `EA-${namePart}-${phonePart}`;
  let finalCode = baseCode;
  for (let counter = 1; counter < 1000; counter += 1) {
    const { data, error } = await supabase.from('customers').select('id').eq('referral_code', finalCode).maybeSingle();
    if (error) return `EA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    if (!data) return finalCode;
    finalCode = `${baseCode}-${counter + 1}`;
  }
  return `EA-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
};

export const CustomerProvider = ({ children }) => {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [phone, setPhone] = useState('');
  const [activeTermsId, setActiveTermsId] = useState(null);
  const [isPhoneModalOpen, setPhoneModalOpen] = useState(false);
  const [isCheckoutModalOpen, setCheckoutModalOpen] = useState(false);
  const [checkoutMode, setCheckoutMode] = useState('checkout');
  const [onSuccessCallback, setOnSuccessCallback] = useState(null);
  const [isCustomerLoading, setIsCustomerLoading] = useState(true);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [isLinked, setIsLinked] = useState(false);
  const isMountedRef = useRef(false);
  const sessionRestoreIdRef = useRef(0);

  const isAuthenticated = Boolean(session?.user?.id || user?.id);

  const fetchActiveTermsId = useCallback(async () => {
    const { data, error } = await supabase
      .from('terms_and_conditions')
      .select('id')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data?.id) return null;
    if (isMountedRef.current) setActiveTermsId(data.id);
    return data.id;
  }, []);

  const fetchCustomerById = useCallback(async (id) => {
    if (!id) return null;
    const { data, error } = await supabase.from('customers').select('*').eq('id', id).maybeSingle();
    if (error) throw error;
    return data || null;
  }, []);

  const resolveAuthIdentity = useCallback(async (currentSession) => {
    const restoreId = ++sessionRestoreIdRef.current;
    setAuthError(null);

    if (!currentSession?.user?.id) {
      if (isMountedRef.current && restoreId === sessionRestoreIdRef.current) {
        setSession(null);
        setUser(null);
        setCustomer(null);
        setCustomerId(null);
        setPhone('');
        setIsLinked(false);
        setIsCustomerLoading(false);
        setAuthInitialized(true);
      }
      return;
    }

    setSession(currentSession);
    setUser(currentSession.user);
    setIsCustomerLoading(true);

    try {
      const result = await resolveMyCustomer();
      if (!isMountedRef.current || restoreId !== sessionRestoreIdRef.current) return;

      if (result.error) {
        setAuthError(result.error);
        setCustomer(null);
        setCustomerId(null);
        setPhone(currentSession.user.phone || '');
        setIsLinked(false);
      } else if (result.customer) {
        setCustomer(result.customer);
        setCustomerId(result.customer.id);
        setPhone(result.customer.phone || currentSession.user.phone || '');
        setIsLinked(true);
        persistLegacyCache(result.customer);
      } else {
        setCustomer(null);
        setCustomerId(null);
        setPhone(currentSession.user.phone || '');
        setIsLinked(false);
      }
    } catch (error) {
      if (!isMountedRef.current || restoreId !== sessionRestoreIdRef.current) return;
      setAuthError(error);
      setCustomer(null);
      setCustomerId(null);
      setIsLinked(false);
    } finally {
      if (isMountedRef.current && restoreId === sessionRestoreIdRef.current) {
        setIsCustomerLoading(false);
        setAuthInitialized(true);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    let cancelled = false;

    const initialize = async () => {
      const { session: currentSession, error } = await getAuthState();
      if (cancelled || !isMountedRef.current) return;
      if (error) setAuthError(error);
      await fetchActiveTermsId();
      if (!cancelled) await resolveAuthIdentity(currentSession);
    };

    initialize();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled || !isMountedRef.current) return;
      switch (event) {
        case 'INITIAL_SESSION':
        case 'SIGNED_IN':
        case 'TOKEN_REFRESHED':
        case 'USER_UPDATED':
          void resolveAuthIdentity(nextSession);
          break;
        case 'SIGNED_OUT':
          sessionRestoreIdRef.current += 1;
          setSession(null);
          setUser(null);
          setCustomer(null);
          setCustomerId(null);
          setPhone('');
          setIsLinked(false);
          setIsCustomerLoading(false);
          setAuthInitialized(true);
          break;
        default:
          break;
      }
    });

    return () => {
      cancelled = true;
      isMountedRef.current = false;
      sessionRestoreIdRef.current += 1;
      listener?.subscription?.unsubscribe?.();
    };
  }, [fetchActiveTermsId, resolveAuthIdentity]);

  const refreshIdentity = useCallback(async () => {
    const { session: currentSession } = await getAuthState();
    await resolveAuthIdentity(currentSession);
  }, [resolveAuthIdentity]);

  const executeLogin = useCallback(async (customerData) => {
    const canonical = customerData || null;
    if (!canonical?.id) return { ok: false, code: 'CUSTOMER_NOT_FOUND' };
    setCustomer(canonical);
    setCustomerId(canonical.id);
    setPhone(canonical.phone || session?.user?.phone || '');
    setIsLinked(true);
    persistLegacyCache(canonical);
    if (isPhoneModalOpen) setPhoneModalOpen(false);
    if (onSuccessCallback) {
      onSuccessCallback();
      setOnSuccessCallback(null);
    }
    return { ok: true, customer: canonical };
  }, [isPhoneModalOpen, onSuccessCallback, session?.user?.phone]);

  const requestOtp = useCallback(async (phoneToVerify) => requestPhoneOtp(phoneToVerify), []);

  const verifyOtp = useCallback(async (phoneToVerify, token) => {
    const result = await verifyPhoneOtp(phoneToVerify, token);
    if (!result.ok) return result;
    await resolveAuthIdentity(result.session);
    return result;
  }, [resolveAuthIdentity]);

  const linkCustomer = useCallback(async () => {
    const result = await linkMyCustomer();
    if (!result.ok) return result;
    await refreshIdentity();
    return result;
  }, [refreshIdentity]);

  const completeRegistration = useCallback(async (name, referrerCode = null) => {
    const result = await completeMyCustomerRegistration(name, referrerCode);
    if (!result.ok) return result;
    await refreshIdentity();
    return result;
  }, [refreshIdentity]);

  const verifyCustomer = useCallback(async (phoneToVerify, currentTermsId = null) => {
    // Legacy lookup only. It is intentionally NOT an authentication primitive.
    if (!phoneToVerify || String(phoneToVerify).length < 10) return { status: 'error', code: 'invalid_phone' };
    const termsId = currentTermsId || activeTermsId || await fetchActiveTermsId();
    const { data, error } = await supabase.from('customers').select('*, customer_terms_acceptances(terms_version_id)').eq('phone', phoneToVerify).maybeSingle();
    if (error) return { status: 'error', code: 'customer_lookup_failed' };
    if (!data) return { status: 'not_found' };
    const termsAccepted = data.customer_terms_acceptances?.some((acceptance) => acceptance.terms_version_id === termsId);
    const next = { ...data, terms_accepted: Boolean(termsAccepted) };
    delete next.customer_terms_acceptances;
    return { status: 'found', customer: next, legacyOnly: true };
  }, [activeTermsId, fetchActiveTermsId]);

  const registerNewCustomer = useCallback(async (customerPhone, name, inviterCode = null) => {
    // Compatibility API. New authenticated registration is completed through complete_my_customer_registration.
    const result = await completeMyCustomerRegistration(name, inviterCode);
    if (!result.ok) return null;
    return fetchCustomerById(result.customerId);
  }, [completeMyCustomerRegistration, fetchCustomerById]);

  const acceptTerms = useCallback(async (customerIdToAccept = customerId) => {
    if (!customerIdToAccept) return { ok: false, code: 'invalid_customer_id' };
    const termsId = activeTermsId || await fetchActiveTermsId();
    if (!termsId) return { ok: false, code: 'terms_unavailable' };
    const { error } = await supabase.from('customer_terms_acceptances').insert({ customer_id: customerIdToAccept, terms_version_id: termsId });
    if (error && error.code !== '23505') return { ok: false, code: 'acceptance_failed' };
    return { ok: true, code: error?.code === '23505' ? 'already_accepted' : 'accepted', termsId };
  }, [activeTermsId, customerId, fetchActiveTermsId]);

  const signOut = useCallback(async () => {
    sessionRestoreIdRef.current += 1;
    setCustomer(null);
    setCustomerId(null);
    setPhone('');
    setIsLinked(false);
    setIsCustomerLoading(false);
    setOnSuccessCallback(null);
    clearLegacyIdentityCache();

    const currentCustomerId = customerId;
    if (currentCustomerId) {
      supabase.from('push_subscriptions').delete().eq('customer_id', currentCustomerId).then(({ error }) => {
        if (error) console.warn('[Notifications] No se pudo limpiar la suscripcion push:', error);
      });
    }
    try {
      const { deleteFCMRegistration } = await import('../lib/firebaseConfig');
      await deleteFCMRegistration();
    } catch (error) {
      console.warn('[Notifications] No se pudo limpiar FCM:', error);
    }

    await signOutCustomer();
  }, [customerId]);

  const clearPhone = useCallback(() => signOut(), [signOut]);

  const savePhoneAndContinue = useCallback(async () => {
    // OTP is intentionally required; legacy phone persistence is no longer a login mechanism.
    return isAuthenticated && isLinked;
  }, [isAuthenticated, isLinked]);

  const togglePhoneModal = useCallback((value) => {
    if (typeof value === 'function') {
      setOnSuccessCallback(() => value);
      setPhoneModalOpen(true);
    } else {
      setOnSuccessCallback(null);
      setPhoneModalOpen(Boolean(value));
    }
  }, []);

  const toggleCheckoutModal = useCallback((isOpen, mode = 'checkout') => {
    setCheckoutMode(mode);
    setCheckoutModalOpen(isOpen);
  }, []);

  const value = useMemo(() => ({
    session,
    user,
    customer,
    customerId,
    phone,
    loading: isCustomerLoading,
    isCustomerLoading,
    authInitialized,
    isAuthenticated,
    isLinked,
    authError,
    activeTermsId,
    refreshIdentity,
    requestOtp,
    verifyOtp,
    linkCustomer,
    completeRegistration,
    checkAndLogin: async () => ({ status: isLinked ? 'found' : 'not_linked', customer }),
    verifyCustomer,
    executeLogin,
    registerNewCustomer,
    acceptTerms,
    savePhoneAndContinue,
    clearPhone,
    signOut,
    isPhoneModalOpen,
    setPhoneModalOpen: togglePhoneModal,
    isCheckoutModalOpen,
    setCheckoutModalOpen: toggleCheckoutModal,
    checkoutMode,
  }), [
    acceptTerms,
    activeTermsId,
    authError,
    authInitialized,
    checkoutMode,
    clearPhone,
    completeRegistration,
    customer,
    customerId,
    executeLogin,
    isAuthenticated,
    isCheckoutModalOpen,
    isCustomerLoading,
    isLinked,
    isPhoneModalOpen,
    linkCustomer,
    phone,
    refreshIdentity,
    registerNewCustomer,
    requestOtp,
    savePhoneAndContinue,
    session,
    signOut,
    toggleCheckoutModal,
    togglePhoneModal,
    user,
    verifyCustomer,
    verifyOtp,
  ]);

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
};
