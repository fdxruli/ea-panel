/**
 * Utilidades para normalización y validación de nombres de ingredientes
 * Evita violaciones de la restricción UNIQUE ingredients_name_key en la base de datos.
 */

export function normalizeIngredientName(name) {
  if (!name || typeof name !== 'string') return '';
  return name.trim().replace(/\s+/g, ' ');
}

export function normalizeBaseUnit(unit) {
  if (!unit || typeof unit !== 'string') return '';
  return unit.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function findDuplicateIngredient(name, allIngredients = [], currentIngredientId = null) {
  const normalized = normalizeIngredientName(name).toLowerCase();
  if (!normalized) return null;

  return (allIngredients || []).find(ing => {
    if (!ing || !ing.name) return false;
    if (currentIngredientId && ing.id === currentIngredientId) return false;
    return normalizeIngredientName(ing.name).toLowerCase() === normalized;
  }) || null;
}

export function formatDuplicateErrorMessage(duplicateName) {
  return `Ya existe un ingrediente registrado como "${duplicateName}". Por favor ingresa un nombre diferente o edita el existente.`;
}

export function isDuplicateIngredientError(error) {
  if (!error) return false;
  return (
    error.code === '23505' ||
    Boolean(error.message && (error.message.includes('ingredients_name_key') || error.message.includes('duplicate key value'))) ||
    Boolean(error.details && error.details.includes('ingredients_name_key'))
  );
}
