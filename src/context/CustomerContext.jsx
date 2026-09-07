import React, { createContext, useState, useContext, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { completeMyCustomerRegistration, getAuthState, linkMyCustomer, requestPhoneOtp, resolveMyCustomer, signOutCustomer, verifyPhoneOtp } from '../lib/customerAuth';

const CustomerContext = createContext();
const CUSTOMER_PHONE_KEY = 'customer_phone';
const CUSTOMER_DATA_KEY = 'customer_data';
const CANONICAL_CUSTOMER_ID_KEY = 'customer_canonical_id';

export const useCustomer = () => useContext(CustomerContext);

const clearLegacyIdentityCache = () => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CUSTOMER_PHONE_KEY);
  localStorage.removeItem(CUSTOMER_DATA_KEY);
  localStorage.removeItem(CANONICAL_CUSTOMER_ID_KEY);
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
  const authResolvedRef = useRef(false);

  const isAuthenticated = Boolean(session?.user?.id);

  const fetchActiveTermsId = useCallback(async () => {
    const { data, error } = await supabase.from('terms_and_conditions').select('id').order('version', { ascending: false }).limit(1).maybeSingle();
    if (error || !data?.id) return null;
    if (isMountedRef.current) setActiveTermsId(data.id);
    return data.id;
  }, []);

  const resolveAuthIdentity = useCallback(async (currentSession) => {
    const restoreId = ++sessionRestoreIdRef.current;
    setAuthError(null);

    if (!currentSession?.user?.id) {
      if (isMountedRef.current && restoreId === sessionRestoreIdRef.current) {
        setSession(null); setUser(null); setCustomer(null); setCustomerId(null); setPhone(''); setIsLinked(false);
        setIsCustomerLoading(false); setAuthInitialized(true);
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
        setAuthError(result.error); setCustomer(null); setCustomerId(null); setPhone(currentSession.user.phone || ''); setIsLinked(false);
      } else if (result.customer) {
        // Auth identity is authoritative. Legacy localStorage is deliberately not read or rewritten.
        setCustomer(result.customer); setCustomerId(result.customer.id); setPhone(result.customer.phone || currentSession.user.phone || ''); setIsLinked(true);
      } else {
        setCustomer(null); setCustomerId(null); setPhone(currentSession.user.phone || ''); setIsLinked(false);
      }
    } catch (error) {
      if (!isMountedRef.current || restoreId !== sessionRestoreIdRef.current) return;
      setAuthError(error); setCustomer(null); setCustomerId(null); setIsLinked(false);
    } finally {
      if (isMountedRef.current && restoreId === sessionRestoreIdRef.current) {
        setIsCustomerLoading(false); setAuthInitialized(true); authResolvedRef.current = true;
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
      if (!cancelled && !authResolvedRef.current) await resolveAuthIdentity(currentSession);
    };
    initialize();

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled || !isMountedRef.current) return;
      if (event === 'INITIAL_SESSION' && authResolvedRef.current) return;
      if (['INITIAL_SESSION', 'SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event)) {
        void resolveAuthIdentity(nextSession);
        return;
      }
      if (event === 'SIGNED_OUT') {
        sessionRestoreIdRef.current += 1;
        setSession(null); setUser(null); setCustomer(null); setCustomerId(null); setPhone(''); setIsLinked(false);
        setIsCustomerLoading(false); setAuthInitialized(true); setAuthError(null);
        clearLegacyIdentityCache();
      }
    });

    return () => {
      cancelled = true; isMountedRef.current = false; sessionRestoreIdRef.current += 1;
      listener?.subscription?.unsubscribe?.();
    };
  }, [fetchActiveTermsId, resolveAuthIdentity]);

  const refreshIdentity = useCallback(async () => {
    const { session: currentSession } = await getAuthState();
    await resolveAuthIdentity(currentSession);
  }, [resolveAuthIdentity]);

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
    setCustomer(null); setCustomerId(null); setPhone(''); setIsLinked(false); setIsCustomerLoading(false); setOnSuccessCallback(null);
    clearLegacyIdentityCache();
    const currentCustomerId = customerId;
    if (currentCustomerId) supabase.from('push_subscriptions').delete().eq('customer_id', currentCustomerId).then(({ error }) => { if (error) console.warn('[Notifications] No se pudo limpiar la suscripcion push:', error); });
    try {
      const { deleteFCMRegistration } = await import('../lib/firebaseConfig');
      await deleteFCMRegistration();
    } catch (error) { console.warn('[Notifications] No se pudo limpiar FCM:', error); }
    await signOutCustomer();
  }, [customerId]);

  const togglePhoneModal = useCallback((value) => {
    if (typeof value === 'function') { setOnSuccessCallback(() => value); setPhoneModalOpen(true); }
    else { setOnSuccessCallback(null); setPhoneModalOpen(Boolean(value)); }
  }, []);
  const toggleCheckoutModal = useCallback((isOpen, mode = 'checkout') => { setCheckoutMode(mode); setCheckoutModalOpen(isOpen); }, []);

  const value = useMemo(() => ({
    session, user, customer, customerId, phone, loading: isCustomerLoading, isCustomerLoading, authInitialized, isAuthenticated, isLinked, authError, activeTermsId,
    refreshIdentity, requestOtp, verifyOtp, linkCustomer, completeRegistration,
    checkAndLogin: async () => ({ status: isLinked ? 'found' : 'not_linked', customer }),
    executeLogin: async (customerData) => ({ ok: Boolean(customerData?.id), customer: customerData || null }),
    acceptTerms, savePhoneAndContinue: async () => isAuthenticated && isLinked, clearPhone: signOut, signOut,
    verifyCustomer: async () => ({ status: 'disabled_legacy', code: 'AUTH_REQUIRED' }),
    registerNewCustomer: async (customerPhone, name, inviterCode) => { const result = await completeRegistration(name, inviterCode); return result.ok ? resolveMyCustomer().then((r) => r.customer) : null; },
    isPhoneModalOpen, setPhoneModalOpen: togglePhoneModal, isCheckoutModalOpen, setCheckoutModalOpen: toggleCheckoutModal, checkoutMode,
  }), [acceptTerms, activeTermsId, authError, authInitialized, checkoutMode, completeRegistration, customer, customerId, isAuthenticated, isCheckoutModalOpen, isCustomerLoading, isLinked, isPhoneModalOpen, linkCustomer, phone, refreshIdentity, requestOtp, resolveMyCustomer, session, signOut, toggleCheckoutModal, togglePhoneModal, user, verifyOtp]);

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
};
