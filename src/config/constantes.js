// Validamos que exista para evitar errores silenciosos
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {});
const GUEST_ID = env.VITE_GUEST_CUSTOMER_ID;

if (!GUEST_ID && typeof window !== 'undefined') {
    console.warn("⚠️ ADVERTENCIA: VITE_GUEST_CUSTOMER_ID no está definido en el archivo .env");
}

export const GUEST_CUSTOMER_ID = GUEST_ID;
export const BUSINESS_PHONE = env.VITE_BUSINESS_PHONE;