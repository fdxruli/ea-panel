import { supabase } from './supabaseClient';

export const AUTH_ERROR_CODES = Object.freeze({
  AUTH: 'AUTH_ERROR',
  OTP: 'OTP_ERROR',
  CUSTOMER_NOT_LINKED: 'CUSTOMER_NOT_LINKED',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
});

export const normalizeE164Phone = (countryCode, nationalNumber) => {
  const digits = String(nationalNumber || '').replace(/\D/g, '');
  if (digits.length !== 10) return null;
  const code = String(countryCode || '+52').replace(/\D/g, '');
  if (!code) return null;
  return `+${code}${digits}`;
};

export const requestPhoneOtp = async (phone) => {
  const { error } = await supabase.auth.signInWithOtp({ phone });
  if (error) return { ok: false, code: AUTH_ERROR_CODES.OTP, error };
  return { ok: true };
};

export const verifyPhoneOtp = async (phone, token) => {
  const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
  if (error) return { ok: false, code: AUTH_ERROR_CODES.OTP, error };
  if (!data?.session || !data?.user) {
    return { ok: false, code: AUTH_ERROR_CODES.AUTH, error: new Error('No se pudo establecer la sesión.') };
  }
  return { ok: true, session: data.session, user: data.user };
};

export const getAuthState = async () => {
  const { data, error } = await supabase.auth.getSession();
  if (error) return { session: null, error };
  return { session: data?.session || null, error: null };
};

export const resolveMyCustomer = async () => {
  const { data: customerId, error: idError } = await supabase.rpc('get_my_customer_id');
  if (idError) return { customer: null, customerId: null, linked: false, error: idError };
  if (!customerId) return { customer: null, customerId: null, linked: false, error: null };

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();

  if (error) return { customer: null, customerId, linked: false, error };
  if (!customer) return { customer: null, customerId, linked: false, error: new Error('Customer no encontrado.') };
  return { customer, customerId: customer.id, linked: true, error: null };
};

export const linkMyCustomer = async () => {
  const { data: customerId, error } = await supabase.rpc('link_my_customer');
  if (error) return { ok: false, code: AUTH_ERROR_CODES.CUSTOMER_NOT_LINKED, error };
  return { ok: true, customerId };
};

export const completeMyCustomerRegistration = async (name, referrerCode = null) => {
  const { data: customerId, error } = await supabase.rpc('complete_my_customer_registration', {
    p_name: name,
    p_referrer_code: referrerCode || null,
  });
  if (error) return { ok: false, code: AUTH_ERROR_CODES.CUSTOMER_NOT_FOUND, error };
  return { ok: true, customerId };
};

export const signOutCustomer = async () => {
  const { error } = await supabase.auth.signOut();
  return { ok: !error, error };
};
