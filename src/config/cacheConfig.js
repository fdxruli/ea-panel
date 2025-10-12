// src/config/cacheConfig.js

/**
 * TTL (Time to Live) en milisegundos.
 * Define cuánto tiempo se considera que los datos en caché son "frescos".
 */
export const CACHE_TTL = {
  PRODUCTS: 10 * 60 * 1000, // 10 minutos
  BUSINESS_STATUS: 5 * 60 * 1000, // 5 minutos
  USER_DATA: 15 * 60 * 1000, // 15 minutos (ahora para perfil y direcciones)
  USER_ORDERS: 10 * 60 * 1000, // 10 minutos para órdenes
  PRODUCT_EXTRAS: 10 * 60 * 1000, // 10 minutos para favoritos y reseñas
};

/**
 * Claves únicas para almacenar cada tipo de dato en el caché.
 */
export const CACHE_KEYS = {
  PRODUCTS: 'ea-products-cache',
  BUSINESS_STATUS: 'ea-business-status-cache',
  USER_INFO: 'ea-user-info-cache', // Antes USER_DATA
  USER_ORDERS: 'ea-user-orders-cache', // Nuevo para órdenes
  FAVORITES: 'ea-favorites-cache',
  REVIEWS: 'ea-reviews-cache',
};

/**
 * Límites para la cantidad de items a guardar en caché.
 */
export const CACHE_LIMITS = {
    RECENT_ORDERS: 25, // Solo guardar las últimas 25 órdenes en caché
};