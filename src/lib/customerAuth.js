import { supabase } from './supabaseClient.js';

const E164_PHONE = /^\+[1-9]\d{7,14}$/;

export const AUTH_ERROR_CODES = Object.freeze({
  AUTH: 'AUTH_ERROR',
  OTP: 'OTP_ERROR',
  CUSTOMER_NOT_LINKED: 'CUSTOMER_NOT_LINKED',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
});

export const normalizeCustomerAuthPhone = (phone) => {
  const value = String(phone ?? '').trim();
  if (!E164_PHONE.test(value)) {
    throw new Error('El teléfono debe estar en formato E.164 (ej. +529631234567).');
  }
  return value;
};

export const normalizeE164Phone = (countryCode = '+52', nationalNumber = '') => {
  const digits = String(nationalNumber || '').replace(/\D/g, '');
  if (digits.length !== 10) return null;
  const code = String(countryCode || '+52').replace(/\D/g, '');
  return code ? `+${code}${digits}` : null;
};

export const createCustomerAuth = (client = supabase) => ({
  async requestOtp(phone, { channel = 'sms', captchaToken } = {}) {
    const normalizedPhone = normalizeCustomerAuthPhone(phone);
    const options = {};
    if (captchaToken) options.captchaToken = captchaToken;
    if (channel && channel !== 'sms') options.channel = channel;
    const { error } = await client.auth.signInWithOtp({
      phone: normalizedPhone,
      ...(Object.keys(options).length ? { options } : {}),
    });
    if (error) throw error;
    return { phone: normalizedPhone, channel };
  },

  async verifyOtpAndLink(phone, token) {
    const normalizedPhone = normalizeCustomerAuthPhone(phone);
    const {
      data: { session },
      error: verifyError,
    } = await client.auth.verifyOtp({
      phone: normalizedPhone,
      token: String(token ?? '').trim(),
      type: 'sms',
    });
    if (verifyError) throw verifyError;
    if (!session) throw new Error('OTP verificado sin sesión autenticada.');
    const { data: customerId, error: linkError } = await client.rpc('link_my_customer');
    if (linkError) throw linkError;
    if (!customerId) throw new Error('La sesión de Auth no quedó vinculada a un customer existente.');
    return { session, customerId };
  },

  async getMyCustomerId() {
    const { data, error } = await client.rpc('get_my_customer_id');
    if (error) throw error;
    return data ?? null;
  },

  async getSession() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session ?? null;
  },

  async signOut() {
    const { error } = await client.auth.signOut();
    if (error) throw error;
  },
});

export const customerAuth = createCustomerAuth();

export const requestPhoneOtp = async (phone) => {
  try {
    await createCustomerAuth().requestOtp(phone);
    return { ok: true };
  } catch (error) {
    return { ok: false, code: AUTH_ERROR_CODES.OTP, error };
  }
};

export const verifyPhoneOtp = async (phone, token) => {
  try {
    const normalizedPhone = normalizeCustomerAuthPhone(phone);
    const { data, error } = await supabase.auth.verifyOtp({ phone: normalizedPhone, token: String(token ?? '').trim(), type: 'sms' });
    if (error) return { ok: false, code: AUTH_ERROR_CODES.OTP, error };
    if (!data?.session || !data?.user) return { ok: false, code: AUTH_ERROR_CODES.AUTH, error: new Error('No se pudo establecer la sesión.') };
    return { ok: true, session: data.session, user: data.user };
  } catch (error) {
    return { ok: false, code: AUTH_ERROR_CODES.OTP, error };
  }
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
  const { data: customer, error } = await supabase.from('customers').select('*').eq('id', customerId).maybeSingle();
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
