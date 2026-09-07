export const normalizeE164Phone = (countryCode = '+52', nationalNumber = '') => {
  const digits = String(nationalNumber || '').replace(/\D/g, '');
  if (digits.length !== 10) return null;
  const code = String(countryCode || '+52').replace(/\D/g, '');
  return code ? `+${code}${digits}` : null;
};
