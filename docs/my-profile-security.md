# Seguridad RLS y RPC — Módulo "Mi Perfil"

## 1. Principio Rector de Identidad

La fuente de identidad de autorización en Supabase y el frontend es estrictamente:

```text
auth.uid()
   ↓
customers.auth_user_id
   ↓
customers.id
```

Bajo ninguna circunstancia se utilizan como autoridad de seguridad:
- Teléfono enviado por el cliente o query params.
- `localStorage` (`customer_phone`, `customer_data`).
- `customer_id` enviado como parámetro en el body o query de peticiones.
- Códigos de referidos o datos no verificados en sesión.

---

## 2. Restricciones RLS Implementadas

### 2.1 Tabla `public.customers`
- **Eliminación de acceso público anónimo:** Se eliminaron las policies que permitían a `anon` consultar o insertar clientes sin restricciones.
- **Acceso para clientes autenticados:**
  - `SELECT`: `USING ((SELECT auth.uid()) = auth_user_id)`
  - `UPDATE`: `USING ((SELECT auth.uid()) = auth_user_id) WITH CHECK ((SELECT auth.uid()) = auth_user_id)`
- **Protección de campos de sistema:** La función trigger `prevent_customer_system_field_updates` bloquea cualquier intento de clientes autenticados de alterar `id`, `phone`, `created_at`, `auth_user_id`, `referrer_id`, `referral_count`, `referral_code` o `has_made_first_purchase`.
- **Actualización de perfil vía RPC:** Se proveyó la función `update_my_customer_profile(p_name text)` para limitar explícitamente las modificaciones al nombre verificado del cliente.

### 2.2 Tabla `public.customer_addresses`
- **Eliminación de acceso anónimo:** Se revocó la policy `Legacy anonymous can manage addresses`.
- **Acceso por pertenencia estricta:** Todas las operaciones (`SELECT`, `INSERT`, `UPDATE`, `DELETE`) validan:
  ```sql
  EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = customer_addresses.customer_id
      AND c.auth_user_id = (SELECT auth.uid())
  )
  ```

### 2.3 Tabla `public.customer_favorites`
- Eliminado acceso de `anon`.
- Lectura, inserción y eliminación condicionadas a pertenencia del `customer_id` respecto al `auth.uid()` del llamador.

### 2.4 Tablas `public.customer_reward_claims` y `public.customer_terms_acceptances`
- Lectura restringida exclusivamente al cliente propietario autenticado y a administradores autorizados.
- Ningún usuario anónimo puede listar cupones de recompensa ni términos aceptados.

---

## 3. Endurecimiento de Funciones y RPCs

1. **`set_my_default_customer_address(p_address_id uuid)`:**
   - Atributos: `SECURITY DEFINER`, `SET search_path TO 'public', 'pg_temp'`.
   - Deriva la identidad del cliente llamando a `public.require_my_customer_id()`.
   - Rechaza IDs de dirección que no pertenezcan al cliente actual con `address_not_found_or_forbidden`.
   - Concesión de permisos: `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated, service_role;`.

2. **`update_my_customer_profile(p_name text)`:**
   - Atributos: `SECURITY DEFINER`, `SET search_path TO 'public', 'pg_temp'`.
   - Valida el texto recibido (longitud entre 2 y 100 caracteres tras trim).
   - Solo actualiza la columna `name` del cliente vinculado a `auth.uid()`.

3. **`get_my_loyalty_category()`:**
   - Atributos: `SECURITY DEFINER`, `STABLE`, `SET search_path TO 'public', 'pg_temp'`.
   - Deriva identidad de `auth.uid()`.
   - No recibe `customer_id` desde el exterior.
   - Retorna únicamente `category`, `benefit_label`, `condition_label`.
   - No devuelve `total_spent` ni métricas monetarias al cliente.

4. **Revocación de funciones legacy a `anon`:**
   - Se revocó el grant `EXECUTE` al rol `anon` para `generate_personal_reward_code(uuid, uuid)` y `get_customer_rewards_progress(uuid)`.
