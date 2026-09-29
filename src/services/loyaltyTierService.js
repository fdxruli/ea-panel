/* src/services/loyaltyTierService.js */
import { supabase } from '../lib/supabaseClient';

/**
 * Obtiene todos los niveles de lealtad configurados en el sistema.
 * @param {boolean} [includeInactive=true]
 * @returns {Promise<Array>}
 */
export async function fetchAllLoyaltyTiers(includeInactive = true) {
  let query = supabase
    .from('customer_loyalty_tiers')
    .select('*')
    .order('rank_priority', { ascending: false })
    .order('min_spent', { ascending: false });

  if (!includeInactive) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[loyaltyTierService] Error al obtener niveles:', error);
    throw error;
  }
  return data || [];
}

/**
 * Crea un nuevo nivel de lealtad.
 * @param {Object} tierData
 * @returns {Promise<Object>}
 */
export async function createLoyaltyTier(tierData) {
  const cleanSlug = (tierData.slug || tierData.name || '')
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_');

  const payload = {
    name: tierData.name.trim(),
    slug: cleanSlug,
    min_orders: Math.max(0, parseInt(tierData.min_orders) || 0),
    min_spent: Math.max(0, parseFloat(tierData.min_spent) || 0),
    period_days: Math.max(1, parseInt(tierData.period_days) || 90),
    rank_priority: parseInt(tierData.rank_priority) || 0,
    color: tierData.color || '#eab308',
    badge_text: (tierData.badge_text || tierData.name || '').trim(),
    benefit_description: (tierData.benefit_description || '').trim(),
    is_active: tierData.is_active !== undefined ? Boolean(tierData.is_active) : true,
    is_default: Boolean(tierData.is_default),
    updated_at: new Date().toISOString()
  };

  // Nota: La unicidad atómica de is_default está garantizada por el trigger PostgreSQL trg_enforce_single_default_tier
  const { data, error } = await supabase
    .from('customer_loyalty_tiers')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[loyaltyTierService] Error creando nivel:', error);
    throw error;
  }
  return data;
}

/**
 * Actualiza un nivel de lealtad existente.
 * Nota: El slug se preserva inmutable para proteger integridad en products.target_customer_tiers.
 * @param {string} id
 * @param {Object} tierData
 * @returns {Promise<Object>}
 */
export async function updateLoyaltyTier(id, tierData) {
  const payload = {
    updated_at: new Date().toISOString()
  };

  if (tierData.name !== undefined) payload.name = tierData.name.trim();
  // El slug no se modifica en updates para evitar huérfanos en productos asignados
  if (tierData.min_orders !== undefined) payload.min_orders = Math.max(0, parseInt(tierData.min_orders) || 0);
  if (tierData.min_spent !== undefined) payload.min_spent = Math.max(0, parseFloat(tierData.min_spent) || 0);
  if (tierData.period_days !== undefined) payload.period_days = Math.max(1, parseInt(tierData.period_days) || 90);
  if (tierData.rank_priority !== undefined) payload.rank_priority = parseInt(tierData.rank_priority) || 0;
  if (tierData.color !== undefined) payload.color = tierData.color;
  if (tierData.badge_text !== undefined) payload.badge_text = tierData.badge_text.trim();
  if (tierData.benefit_description !== undefined) payload.benefit_description = tierData.benefit_description.trim();
  if (tierData.is_active !== undefined) payload.is_active = Boolean(tierData.is_active);
  if (tierData.is_default !== undefined) {
    payload.is_default = Boolean(tierData.is_default);
    // La desmarcación de otros defaults la realiza de forma atómica el trigger trg_enforce_single_default_tier
  }

  const { data, error } = await supabase
    .from('customer_loyalty_tiers')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[loyaltyTierService] Error actualizando nivel:', error);
    throw error;
  }
  return data;
}

/**
 * Elimina un nivel de lealtad.
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteLoyaltyTier(id) {
  // Verificar si es el nivel por defecto
  const { data: tier, error: checkError } = await supabase
    .from('customer_loyalty_tiers')
    .select('is_default, slug, name')
    .eq('id', id)
    .single();

  if (checkError) throw checkError;
  if (tier?.is_default) {
    throw new Error(`El nivel "${tier.name}" está marcado como base/predeterminado y no se puede eliminar.`);
  }

  const { error } = await supabase
    .from('customer_loyalty_tiers')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('[loyaltyTierService] Error eliminando nivel:', error);
    throw error;
  }
  return true;
}

/**
 * Alterna el estado activo/inactivo de un nivel.
 * @param {string} id
 * @param {boolean} nextState
 * @returns {Promise<Object>}
 */
export function toggleLoyaltyTierStatus(id, nextState) {
  return updateLoyaltyTier(id, { is_active: nextState });
}
