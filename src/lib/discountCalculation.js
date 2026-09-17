/**
 * Pure calculation and formatting utilities for discounts.
 */

/**
 * Calculates the exact monetary amount of a discount based on its scope and mode.
 *
 * @param {number} currentSubtotal - Cart subtotal
 * @param {Array} items - Cart items [{ id, category_id, price, quantity }]
 * @param {object|null} discountDetails - Discount object { type, value, discount_mode, target_id }
 * @returns {number} The discount amount to subtract (always >= 0 and <= currentSubtotal)
 */
export const calculateDiscountAmount = (currentSubtotal, items = [], discountDetails = null) => {
  if (!discountDetails || !Array.isArray(items) || items.length === 0 || currentSubtotal <= 0) {
    return 0;
  }

  const rawValue = Number(discountDetails.value);
  if (isNaN(rawValue) || rawValue <= 0) {
    return 0;
  }

  let applicableValue = 0;
  const safeItems = items.filter(
    item => item && typeof item === 'object' && Number(item.price) > 0 && Number(item.quantity) > 0
  );

  switch (discountDetails.type) {
    case 'global':
      applicableValue = Number(currentSubtotal) || 0;
      break;

    case 'category':
      applicableValue = safeItems
        .filter(item => item.category_id === discountDetails.target_id)
        .reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
      break;

    case 'product':
      applicableValue = safeItems
        .filter(item => item.id === discountDetails.target_id)
        .reduce((sum, item) => sum + (Number(item.price) * Number(item.quantity)), 0);
      break;

    default:
      return 0;
  }

  if (applicableValue <= 0) {
    return 0;
  }

  const isFixed = discountDetails.discount_mode === 'fixed';

  let discountAmount = 0;
  if (isFixed) {
    // Fixed amount discount: capped to applicable subtotal and general subtotal
    discountAmount = Math.min(applicableValue, rawValue);
  } else {
    // Percentage discount: capped to 100%
    const percentage = Math.min(100, Math.max(0, rawValue));
    discountAmount = applicableValue * (percentage / 100);
  }

  // Safety guard: ensure discount amount never exceeds the entire subtotal
  return Math.max(0, Math.min(discountAmount, Number(currentSubtotal) || 0));
};

/**
 * Returns a human-friendly label for a discount value (e.g. "20%" or "$30").
 *
 * @param {object|null} discount - Discount object with { value, discount_mode }
 * @returns {string}
 */
export const formatDiscountLabel = (discount) => {
  if (!discount) return '';
  const val = Number(discount.value) || 0;
  if (discount.discount_mode === 'fixed') {
    return `$${val % 1 === 0 ? val.toFixed(0) : val.toFixed(2)}`;
  }
  return `${val}%`;
};
