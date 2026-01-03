// Validamos que exista para evitar errores silenciosos
const GUEST_ID = import.meta.env.VITE_GUEST_CUSTOMER_ID;

if (!GUEST_ID) {
    console.warn("⚠️ ADVERTENCIA: VITE_GUEST_CUSTOMER_ID no está definido en el archivo .env");
}

export const GUEST_CUSTOMER_ID = GUEST_ID;
export const BUSINESS_PHONE = import.meta.env.VITE_BUSINESS_PHONE; // Ya que estamos, centralizamos este también