import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

const respond = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  },
);

const requiredText = (value: unknown, field: string, maxLength: number) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
    throw new HttpError(400, `El campo ${field} no es válido.`);
  }
  return value.trim();
};

const parsePermissions = (value: unknown): Record<string, any> => {
  let permissions = value;
  if (typeof permissions === 'string') {
    try {
      permissions = JSON.parse(permissions);
    } catch {
      throw new HttpError(400, 'Los permisos no tienen un formato válido.');
    }
  }

  if (!permissions || typeof permissions !== 'object' || Array.isArray(permissions)) {
    throw new HttpError(400, 'Los permisos no tienen un formato válido.');
  }

  return permissions as Record<string, any>;
};

const validateRole = (value: unknown) => {
  if (value !== 'admin' && value !== 'staff') {
    throw new HttpError(400, 'El rol no es válido.');
  }
  return value;
};

const canManage = (caller: Record<string, any>, action: 'create' | 'update' | 'delete') => {
  if (caller.role === 'admin') return true;
  const permission = action === 'delete' ? 'delete' : 'edit';
  return caller.permissions?.['registrar-admin']?.[permission] === true;
};

const getCaller = async (request: Request) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new HttpError(500, 'La función de administración no está configurada.');
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) {
    throw new HttpError(401, 'Sesión requerida.');
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authorization } },
  });
  const { data: userData, error: userError } = await authClient.auth.getUser();
  if (userError || !userData.user) throw new HttpError(401, 'Sesión inválida o expirada.');

  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: caller, error: callerError } = await serviceClient
    .from('admins')
    .select('role, permissions')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (callerError) {
    console.error('[admin-user-management] Error consultando permisos del caller:', callerError);
    throw new HttpError(500, 'No se pudieron validar los permisos.');
  }
  if (!caller) throw new HttpError(403, 'No tienes permisos de administrador.');

  return { user: userData.user, caller: { ...caller, permissions: parsePermissions(caller.permissions) }, serviceClient };
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'Método no permitido.' }, 405);

  try {
    const { user, caller, serviceClient } = await getCaller(request);
    const payload = await request.json();
    const action = payload?.action;

    if (action !== 'create' && action !== 'update' && action !== 'delete') {
      throw new HttpError(400, 'La operación no es válida.');
    }
    if (!canManage(caller, action)) throw new HttpError(403, 'No tienes permisos para esta operación.');

    if (action === 'delete') {
      const targetId = requiredText(payload.targetId, 'targetId', 100);
      if (targetId === user.id) throw new HttpError(400, 'No puedes eliminar tu propia cuenta.');

      const { data: targetAdmin, error: targetError } = await serviceClient
        .from('admins')
        .select('id, name, email, role, permissions')
        .eq('id', targetId)
        .maybeSingle();
      if (targetError) throw new HttpError(500, 'No se pudo validar el administrador a eliminar.');
      if (!targetAdmin) throw new HttpError(404, 'Administrador no encontrado.');

      // Se elimina primero la fila para funcionar incluso si el FK no tiene cascade.
      const { error: rowError } = await serviceClient.from('admins').delete().eq('id', targetId);
      if (rowError) throw new HttpError(400, rowError.message);

      const { error: authError } = await serviceClient.auth.admin.deleteUser(targetId);
      if (authError) {
        const { error: restoreError } = await serviceClient.from('admins').upsert(targetAdmin, { onConflict: 'id' });
        if (restoreError) console.error('[admin-user-management] Falló la restauración de admins:', restoreError);
        throw new HttpError(authError.status === 404 ? 404 : 400, authError.message);
      }

      return respond({ success: true });
    }

    const name = requiredText(payload.name, 'name', 120);
    const role = validateRole(payload.role);
    const permissions = parsePermissions(payload.permissions);

    // Un staff con permiso de edición no puede crear/promover cuentas admin.
    if (role === 'admin' && caller.role !== 'admin') {
      throw new HttpError(403, 'Solo un administrador puede asignar el rol admin.');
    }

    if (action === 'update') {
      const targetId = requiredText(payload.targetId, 'targetId', 100);
      if (targetId === user.id && caller.role !== 'admin') {
        throw new HttpError(403, 'No puedes modificar tus propios permisos.');
      }

      const { data, error } = await serviceClient
        .from('admins')
        .update({ name, role, permissions })
        .eq('id', targetId)
        .select('id, name, email, role, permissions')
        .maybeSingle();

      if (error) throw new HttpError(400, error.message);
      if (!data) throw new HttpError(404, 'Administrador no encontrado.');
      return respond({ success: true, admin: data });
    }

    const email = requiredText(payload.email, 'email', 254).toLowerCase();
    const password = requiredText(payload.password, 'password', 128);
    if (password.length < 6) throw new HttpError(400, 'La contraseña debe tener al menos 6 caracteres.');

    const { data: authData, error: authError } = await serviceClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    if (authError || !authData.user) {
      throw new HttpError(authError?.status === 422 ? 409 : 400, authError?.message || 'No se pudo crear el usuario.');
    }

    try {
      const { data, error } = await serviceClient
        .from('admins')
        .upsert({ id: authData.user.id, name, email, role, permissions }, { onConflict: 'id' })
        .select('id, name, email, role, permissions')
        .single();

      if (error || !data) throw new Error(error?.message || 'No se pudo crear el registro administrativo.');
      return respond({ success: true, admin: data });
    } catch (error) {
      try {
        await serviceClient.auth.admin.deleteUser(authData.user.id);
      } catch (rollbackError) {
        console.error('[admin-user-management] Falló rollback de usuario:', rollbackError);
      }
      throw new HttpError(400, error instanceof Error ? error.message : 'No se pudo crear el administrador.');
    }
  } catch (error) {
    if (error instanceof HttpError) return respond({ error: error.message }, error.status);
    console.error('[admin-user-management] Error inesperado:', error);
    return respond({ error: 'Error inesperado al gestionar administradores.' }, 500);
  }
});
