import { supabase } from './supabaseClient';

const E164_PHONE = /^\+[1-9]\d{7,14}$/;

export const normalizeCustomerAuthPhone = (phone) => {
  const value = String(phone ?? '').trim();
  if (!E164_PHONE.test(value)) {
    throw new Error('El teléfono debe estar en formato E.164 (ej. +529631234567).');
  }
  return value;
};

export const createCustomerAuth = (client = supabase) => ({
  async requestOtp(phone, { channel = 'sms', captchaToken } = {}) {
    const normalizedPhone = normalizeCustomerAuthPhone(phone);

    const { error } = await client.auth.signInWithOtp({
      phone: normalizedPhone,
      ...(captchaToken ? { options: { captchaToken } } : {}),
      ...(channel ? { channel } : {}),
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
    if (!customerId) {
      throw new Error('La sesión de Auth no quedó vinculada a un customer existente.');
    }

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
