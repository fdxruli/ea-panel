const CUSTOMER_PHONE_KEY = 'customer_phone';
const CUSTOMER_DATA_KEY = 'customer_data';
const CUSTOMER_CANONICAL_ID_KEY = 'customer_canonical_id';

export const persistCustomerIdentity = (customer) => {
  if (!customer?.id || !customer?.phone) return;
  localStorage.setItem(CUSTOMER_PHONE_KEY, customer.phone);
  localStorage.setItem(CUSTOMER_DATA_KEY, JSON.stringify(customer));
  localStorage.setItem(CUSTOMER_CANONICAL_ID_KEY, customer.id);
};

export const clearCustomerIdentityCache = () => {
  localStorage.removeItem(CUSTOMER_PHONE_KEY);
  localStorage.removeItem(CUSTOMER_DATA_KEY);
  localStorage.removeItem(CUSTOMER_CANONICAL_ID_KEY);
};

export const getPersistedCustomerIdentity = () => ({
  phone: localStorage.getItem(CUSTOMER_PHONE_KEY),
  data: localStorage.getItem(CUSTOMER_DATA_KEY),
  canonicalId: localStorage.getItem(CUSTOMER_CANONICAL_ID_KEY),
});
