import { supabase } from '../lib/supabaseClient';

const ADMIN_USER_FUNCTION = 'admin-user-management';

const getFunctionErrorMessage = async (error) => {
  const response = error?.context;
  if (response && typeof response.clone === 'function') {
    try {
      const body = await response.clone().json();
      if (body?.error) return body.error;
    } catch {
      // La respuesta de error puede no ser JSON.
    }
  }

  return error?.message || 'No se pudo completar la operación de administradores.';
};

export const manageAdminUser = async (payload) => {
  try {
    const { data, error } = await supabase.functions.invoke(ADMIN_USER_FUNCTION, {
      body: payload,
    });

    if (error) throw error;
    if (!data?.success) {
      throw new Error(data?.error || 'No se pudo completar la operación de administradores.');
    }

    return data;
  } catch (error) {
    throw new Error(await getFunctionErrorMessage(error));
  }
};
