# Gestión segura de administradores

La pantalla `RegisterAdmin` usa la Edge Function `admin-user-management` para
crear y eliminar usuarios de Supabase Auth, y para actualizar sus permisos.
Las operaciones privilegiadas ya no se ejecutan desde el navegador.

Antes de desplegar el frontend de esta rama:

1. Despliega `supabase/functions/admin-user-management` en el proyecto de
   Supabase.
2. Conserva la verificación JWT habilitada (`verify_jwt = true`).
3. No configures una clave `service_role` con prefijo `VITE_`: las claves de
   servicio solo deben existir en el entorno server-side de la función.

La función valida la sesión del caller, consulta sus permisos actuales y
rechaza la autoeliminación, la modificación de permisos propios y la
promoción a `admin` por parte de un usuario `staff`.
