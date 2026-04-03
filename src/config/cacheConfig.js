/**
 * TTL (Time to Live) en milisegundos.
 * Define cuanto tiempo se considera que los datos en cache son "frescos".
 */
export const CACHE_TTL = {
  PRODUCTS: 10 * 60 * 1000,
  BUSINESS_STATUS: 1 * 60 * 1000,
  USER_DATA: 15 * 60 * 1000,
  USER_ORDERS: 10 * 60 * 1000,
  PRODUCT_EXTRAS: 10 * 60 * 1000,
};

/**
 * Claves unicas para almacenar cada tipo de dato en cache.
 */
export const CACHE_KEYS = {
  PRODUCTS: 'client:catalog:base:v1',
  PRODUCTS_BASIC: 'client:products:basic:v1',
  BUSINESS_STATUS: 'ea-business-status-cache',
  USER_INFO: 'ea-user-info-cache',
  USER_ORDERS: 'ea-user-orders-cache',
  FAVORITES: 'ea-favorites-cache',
  REVIEWS: 'ea-reviews-cache',
  SPECIAL_PRICE: 'ea-special-price-cache',
  SPECIAL_PRICES: 'ea-special-price-cache',
};

/**
 * Limites para la cantidad de items a guardar en cache.
 */
export const CACHE_LIMITS = {
  RECENT_ORDERS: 25,
};
