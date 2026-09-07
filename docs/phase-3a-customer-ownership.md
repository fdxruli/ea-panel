# FASE 3A — Customer Ownership / RLS

## Dependencia

Esta fase depende de FASE 3 / PR #42, que introduce `customers.auth_user_id`, `get_my_customer_id()` y `link_my_customer()`.

La rama se creó desde `main` por diseño. Por tanto, **PR #42 debe integrarse antes de integrar esta fase** o ambas fases deben integrarse coordinadamente.

## 1. Estado inicial

Las tablas customer-facing tenían RLS habilitado, pero las policies legacy permitían a `anon` y `authenticated` operar con `using(true)` / `with check(true)`.

Esto no constituía ownership.

## 2. Ownership nuevo

Para usuarios autenticados:

`auth.uid() -> customers.auth_user_id -> customers.id`

Se creó `private.customer_id_for_auth()` como helper interno con `SECURITY DEFINER`, `search_path = ''`, sin ejecución para `public/anon`.

`public.require_my_customer_id()` exige sesión y customer vinculado.

## 3. RLS

### customers
- authenticated: SELECT/UPDATE únicamente de la fila cuyo `auth_user_id = auth.uid()`.
- anon: policies legacy permanecen durante transición.
- `auth_user_id`, `referrer_id`, `referral_count`, `referral_code` y `has_made_first_purchase` no pueden ser modificados por un customer autenticado no-admin.

### orders
- authenticated: SELECT sólo de pedidos cuyo customer pertenece al `auth.uid()`.
- creación customer autenticada debe pasar por RPC ownership-safe.
- anon legacy permanece temporalmente.

### order_items
- authenticated: SELECT sólo de items pertenecientes a pedidos del customer autenticado.
- no se habilita INSERT directo para authenticated.

### customer_addresses
- authenticated: CRUD únicamente cuando `customer_id` pertenece al usuario autenticado.
- INSERT/UPDATE usan `WITH CHECK` para evitar reasignación.

### customer_favorites
- authenticated: CRUD únicamente sobre el customer autenticado.

### special_prices
No se habilitó lectura directa para authenticated. La policy pública anterior fue reemplazada por una policy explícitamente legacy para `anon`. La futura ruta customer-facing debe devolver únicamente el resultado de pricing que corresponda al usuario.

## 4. RPC

| RPC | Antes | FASE 3A |
|---|---|---|
| create_order_with_stock_check | `p_customer_id` | authenticated no-admin debe coincidir con Auth |
| generate_personal_reward_code | `p_customer_id` | ownership validado |
| get_customer_basic_stats | `p_customer_id` | ownership validado |
| get_customer_favorite_products | `p_customer_id` | ownership validado |
| get_customer_rewards_progress | `p_customer_id` | ownership validado |
| get_customer_stats_batch | array de IDs | admin-only para evitar enumeración |
| get_active_menu_products | `p_customer_id` | ownership validado |
| record_discount_usage_and_deactivate | `p_customer_id` | ownership + descuento específico validado |

Además se prepararon variantes Auth-only sin `customer_id`:
- `create_my_order_with_stock_check`
- `generate_my_personal_reward_code`
- `get_my_customer_basic_stats`
- `get_my_customer_favorite_products`
- `get_my_customer_rewards_progress`
- `get_my_active_menu_products`
- `record_my_discount_usage_and_deactivate`

## 5. Security Definer

Los nuevos helpers y RPCs usan `search_path` explícito.

No se utiliza `user_metadata` para autorización.

La función privada de resolución de customer está fuera del esquema API.

Los warnings restantes del Security Advisor incluyen funciones legacy/admin y endpoints SECURITY DEFINER deliberadamente mantenidos durante la transición.

## 6. Legacy

Los clientes sin `auth_user_id` siguen dependiendo de las rutas legacy anónimas. Esto es deliberado y constituye riesgo residual.

No se utiliza `localStorage` como prueba de ownership nuevo.

No se realizó migración de `CustomerContext`.

## 7. Special prices

`special_prices` queda fuera del acceso directo authenticated. Esto evita que un cliente lea la tabla completa.

El frontend legacy que consulte directamente esa tabla deberá migrarse antes de que el usuario autenticado dependa de esa ruta. La resolución customer-specific de pricing queda como trabajo coordinado con FASE 4 / pricing ownership.

## 8. Tests

Se realizaron probes transaccionales contra producción usando usuarios Auth temporales dentro de una transacción rollback-only.

Resultados:
- Customer A lee A: PASS
- Customer A no lee B: PASS
- Customer A lee sus orders: PASS
- Customer A no lee orders de B: PASS
- Customer A no lee order_items de B: PASS
- Customer A no lee addresses de B: PASS
- Customer A no lee favorites de B: PASS
- `get_my_customer_id()`: PASS
- protected customer fields: BLOCKED
- RPC stats cross-customer: BLOCKED
- RPC favorites cross-customer: BLOCKED
- RPC rewards cross-customer: BLOCKED
- batch para non-admin: BLOCKED
- Customer B no lee datos de A: PASS
- Admin mantiene acceso: PASS
- Legacy anon mantiene acceso: PASS

Los fixtures temporales fueron rollbackados y no modificaron clientes reales.

## 9. Riesgos pendientes

1. Las rutas legacy `anon` siguen siendo permisivas.
2. El frontend todavía usa `customerId` / `localStorage` en múltiples rutas.
3. `special_prices` necesita una ruta customer-facing segura antes de eliminar dependencia legacy.
4. El Security Advisor mantiene warnings de funciones SECURITY DEFINER legacy/admin.
5. El flujo completo Auth -> frontend -> RPC aún no es E2E porque pertenece a FASE 4.

## 10. FASE 4

La siguiente fase debe migrar:
- CustomerContext
- sesión Auth
- logout/reauthentication
- cache reconciliation
- llamadas a RPC Auth-only
- eliminación progresiva de `localStorage.customer_phone`
- pricing customer-specific
- eliminación final de las rutas legacy anon.

## Principio

Esta fase no cambia `customers.id`, `orders.customer_id` ni `referrer_id`.

El ownership nuevo es:

`auth.uid() -> customers.auth_user_id -> customers.id`.
