/**
 * Utilidades para cálculo de vigencias, estados y márgenes en Precios Especiales.
 * @module specialPriceCalculations
 */

/**
 * Obtiene la fecha local en formato YYYY-MM-DD considerando la zona horaria del cliente/navegador.
 * Evita el desfase que produce .toISOString() al usar UTC a partir del atardecer.
 * @param {Date} [date=new Date()]
 * @returns {string} Fecha local 'YYYY-MM-DD'
 */
export function getLocalDateString(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

/**
 * Determina el estado de vigencia y operatividad de un precio especial.
 * @param {Object} price Registro de precio especial
 * @param {string} [today] Fecha de referencia 'YYYY-MM-DD'
 * @returns {'paused'|'expired'|'scheduled'|'active'}
 */
export function getSpecialPriceStatus(price, today = getLocalDateString()) {
  if (!price) return 'expired';

  // Si la promoción fue pausada explícitamente por el admin
  if (price.is_active === false) {
    return 'paused';
  }

  // Si ya venció
  if (price.end_date && price.end_date < today) {
    return 'expired';
  }

  // Si está programada para el futuro
  if (price.start_date && price.start_date > today) {
    return 'scheduled';
  }

  return 'active';
}

/**
 * Retorna la etiqueta legible y clase de color correspondiente al estado de la promoción.
 * @param {Object} price Registro de precio especial
 * @param {string} [today]
 * @returns {{ label: string, key: string }}
 */
export function getSpecialPriceBadgeInfo(price, today = getLocalDateString()) {
  const status = getSpecialPriceStatus(price, today);

  switch (status) {
    case 'paused':
      return { label: 'Pausada', key: 'paused' };
    case 'expired':
      return { label: 'Expirada', key: 'expired' };
    case 'scheduled':
      return { label: 'Programada', key: 'scheduled' };
    case 'active':
    default:
      return { label: 'Vigente', key: 'active' };
  }
}

/**
 * Calcula el impacto financiero de un precio especial para un producto.
 * @param {number} originalPrice Precio regular actual
 * @param {number} overridePrice Precio especial asignado
 * @param {number} [cost=0] Costo de insumos / receta
 * @returns {{
 *   originalPrice: number,
 *   overridePrice: number,
 *   savingsAmount: number,
 *   savingsPercent: number,
 *   isIncrease: boolean,
 *   isBelowCost: boolean,
 *   marginAmount: number,
 *   marginPercent: number
 * }}
 */
export function calculateProductSavings(originalPrice, overridePrice, cost = 0) {
  const basePrice = Math.max(0, parseFloat(originalPrice) || 0);
  const promoPrice = Math.max(0, parseFloat(overridePrice) || 0);
  const baseCost = Math.max(0, parseFloat(cost) || 0);

  const savingsAmount = Math.max(0, basePrice - promoPrice);
  const savingsPercent = basePrice > 0 ? (savingsAmount / basePrice) * 100 : 0;
  const isIncrease = promoPrice > basePrice;
  const isBelowCost = baseCost > 0 && promoPrice < baseCost;

  const marginAmount = promoPrice - baseCost;
  const marginPercent = promoPrice > 0 ? (marginAmount / promoPrice) * 100 : 0;

  return {
    originalPrice: basePrice,
    overridePrice: promoPrice,
    savingsAmount,
    savingsPercent,
    isIncrease,
    isBelowCost,
    marginAmount,
    marginPercent: Math.round(marginPercent * 10) / 10,
  };
}

/**
 * Filtra un listado de precios especiales según pestaña, término de búsqueda, tipo y audiencia.
 * @param {Array} prices Lista de precios especiales
 * @param {Object} filters Criterios de filtrado
 * @returns {Array} Precios especiales filtrados
 */
export function filterSpecialPrices(prices = [], {
  search = '',
  tab = 'active', // 'active' | 'paused' | 'past' | 'all'
  targetType = 'all', // 'all' | 'product' | 'category'
  audience = 'all', // 'all' | 'everyone' | 'specific'
  today = getLocalDateString(),
} = {}) {
  const lowerSearch = (search || '').trim().toLowerCase();

  return prices.filter(price => {
    const status = getSpecialPriceStatus(price, today);

    // 1. Filtro por Pestaña
    if (tab === 'active') {
      if (status !== 'active' && status !== 'scheduled') return false;
    } else if (tab === 'paused') {
      if (status !== 'paused') return false;
    } else if (tab === 'past') {
      if (status !== 'expired') return false;
    }

    // 2. Filtro por Tipo de Objetivo
    if (targetType === 'product' && !price.product_id) return false;
    if (targetType === 'category' && !price.category_id) return false;

    // 3. Filtro por Audiencia
    const isSpecific = Boolean(price.target_customer_ids && price.target_customer_ids.length > 0);
    if (audience === 'everyone' && isSpecific) return false;
    if (audience === 'specific' && !isSpecific) return false;

    // 4. Búsqueda por Texto
    if (lowerSearch) {
      const prodName = price.product_name || price.products?.name || '';
      const catName = price.category_name || price.categories?.name || '';
      const matchName = prodName.toLowerCase().includes(lowerSearch);
      const matchCat = catName.toLowerCase().includes(lowerSearch);
      const matchReason = (price.reason || '').toLowerCase().includes(lowerSearch);
      const matchPrice = String(price.override_price || '').includes(lowerSearch);

      if (!matchName && !matchCat && !matchReason && !matchPrice) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Analiza el impacto de fijar un precio promocional a todos los productos de una categoría.
 * @param {Array} products Lista de productos del catálogo
 * @param {string} categoryId ID de la categoría
 * @param {number|string} overridePrice Precio especial asignado
 * @returns {Object|null}
 */
export function calculateCategoryImpact(products = [], categoryId, overridePrice) {
  if (!categoryId) return null;

  const categoryProducts = products.filter(p => p.category_id === categoryId);
  if (!categoryProducts.length) {
    return {
      count: 0,
      minPrice: 0,
      maxPrice: 0,
      cheaperCount: 0,
      moreExpensiveCount: 0,
      products: [],
    };
  }

  const promoPrice = Math.max(0, parseFloat(overridePrice) || 0);
  const prices = categoryProducts.map(p => parseFloat(p.price) || 0);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);

  let cheaperCount = 0;
  let moreExpensiveCount = 0;
  let samePriceCount = 0;

  const breakdown = categoryProducts.map(p => {
    const curPrice = parseFloat(p.price) || 0;
    const diff = curPrice - promoPrice;
    if (diff > 0) cheaperCount++;
    else if (diff < 0) moreExpensiveCount++;
    else samePriceCount++;

    return {
      id: p.id,
      name: p.name,
      currentPrice: curPrice,
      promoPrice,
      diff,
      isCheaper: diff > 0,
      isMoreExpensive: diff < 0,
    };
  });

  return {
    count: categoryProducts.length,
    minPrice,
    maxPrice,
    cheaperCount,
    moreExpensiveCount,
    samePriceCount,
    products: breakdown,
  };
}
