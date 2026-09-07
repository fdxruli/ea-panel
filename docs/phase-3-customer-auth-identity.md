# FASE 3 — Identidad del Cliente con Supabase Auth + OTP

## Estado

Implementación aditiva de identidad autenticada.

```
auth.users.id
    ↓
customers.auth_user_id
    ↓
customers.id
    ↓
orders.customer_id
```

`customers.id` continúa siendo la identidad de dominio. No se sustituyen las FK de pedidos ni referidos.

## Auditoría previa de producción

Proyecto: `xvstqhvooabljhhfmuas`

- PostgreSQL 17.6.1.
- 56 customers.
- 0 teléfonos NULL.
- 0 grupos de teléfonos duplicados.
- `customers.phone` tiene UNIQUE.
- Antes de la migración no existía `auth_user_id`.
- Existen 2 usuarios en `auth.users`; ambos tienen email y ninguno tiene teléfono.
- El frontend legacy usa `CustomerContext`, `customer_phone`, `customer_data` y `customer_canonical_id`.
- Los RPC customer-facing auditados continúan aceptando IDs de cliente; no se migran definitivamente en esta fase.

## Schema

Se agregó:

```sql
customers.auth_user_id uuid null
```

con:

- FK a `auth.users(id)`;
- `ON DELETE SET NULL`;
- UNIQUE real mediante `customers_auth_user_id_key`.

No se creó un índice separado para `auth_user_id`; la UNIQUE constraint genera el índice requerido.

## Resolución de identidad

`public.get_my_customer_id()`:

- deriva identidad exclusivamente de `auth.uid()`;
- no recibe `customer_id`;
- usa `SECURITY DEFINER` con `search_path` fijo;
- no se ejecuta para `anon`;
- concede ejecución sólo a `authenticated` y `service_role`.

## Linking

`public.link_my_customer()`:

1. exige `auth.uid()`;
2. obtiene el teléfono y `phone_confirmed_at` del usuario Auth;
3. exige teléfono verificado;
4. busca el customer existente por teléfono exacto;
5. bloquea teléfono inexistente;
6. bloquea teléfono ambiguo;
7. devuelve el mismo customer si ya está vinculado al mismo Auth user;
8. bloquea si el customer pertenece a otro Auth user;
9. bloquea si el Auth user pertenece a otro customer;
10. asigna `auth_user_id` de forma atómica;
11. nunca recibe `customer_id`.

La UNIQUE constraint de `auth_user_id` agrega una barrera de integridad frente a carreras/conflictos.

## OTP

Se agregó `src/lib/customerAuth.js` como capa reutilizable:

- `requestOtp(phone)`;
- `verifyOtpAndLink(phone, token)`;
- `getMyCustomerId()`;
- `getSession()`;
- `signOut()`.

El flujo es:

```
phone
  ↓
auth.signInWithOtp()
  ↓
OTP
  ↓
auth.verifyOtp()
  ↓
auth.uid()
  ↓
link_my_customer()
  ↓
customers.id
```

No se modifica todavía `CustomerContext`. `localStorage` sigue siendo legacy cache/UI state durante la transición y no es prueba de identidad.

Supabase Phone OTP crea un usuario Auth si no existe por defecto. Esto no crea un nuevo `customers.id`: el linking sólo termina contra un customer existente con teléfono verificado.

## Proveedor OTP

La configuración real del proveedor Phone Auth no está expuesta por las herramientas de gestión disponibles en esta sesión. Por tanto no se declara SMS ni WhatsApp como configurados.

Prerequisito de despliegue: verificar en Dashboard > Auth Providers:

- Phone Login habilitado;
- proveedor SMS;
- canal SMS o WhatsApp;
- rate limits;
- CAPTCHA si aplica;
- plantillas/configuración del proveedor.

## Casos de linking

| Caso | Resultado |
|---|---|
| Customer existe y no tiene Auth | Vincular al customer existente |
| Customer ya vinculado al mismo Auth | Idempotente |
| Phone inexistente | BLOCK |
| Phone duplicado | BLOCK |
| Auth user ocupado por otro customer | BLOCK |
| Customer ocupado por otro Auth | BLOCK |
| No autenticado | BLOCK |
| Phone Auth no verificado | BLOCK |
| Auth sin phone | BLOCK |

## Compatibilidad legacy

No se migran todavía:

- `CustomerContext`;
- `localStorage.customer_phone`;
- `localStorage.customer_data`;
- `localStorage.customer_canonical_id`;
- RLS ownership;
- RPC customer-facing;
- creación/onboarding definitivo de customers nuevos.

## RPC auditados

| RPC | Estado actual | Próximo paso |
|---|---|---|
| `create_order_with_stock_check` | recibe `p_customer_id` | FASE 3A |
| `generate_personal_reward_code` | recibe `p_customer_id` | FASE 3A |
| `get_customer_basic_stats` | recibe `p_customer_id` | FASE 3A |
| `get_customer_favorite_products` | recibe `p_customer_id` | FASE 3A |
| `get_customer_rewards_progress` | recibe `p_customer_id` | FASE 3A |
| `get_customer_stats_batch` | recibe array de IDs | FASE 3A / retirar de customer-facing |
| `get_active_menu_products` | recibe `p_customer_id` opcional | FASE 3A |
| `record_discount_usage_and_deactivate` | recibe `p_customer_id` | FASE 3A |

## Cambio de teléfono

No se implementa UX de cambio de teléfono. La arquitectura futura debe verificar el nuevo teléfono en Auth y actualizar el teléfono del mismo customer, sin crear otro `customers.id`.

## Tests

Se cubren unitariamente:

- validación E.164;
- delegación a Phone OTP;
- ausencia de `customer_id` en la operación de linking.

En producción se verificaron:

- 56 customers;
- 0 teléfonos NULL;
- 0 duplicados;
- constraints/FK/UNIQUE;
- grants de las funciones nuevas;
- usuarios Auth existentes sin phone.

No se declara E2E OTP real porque el proveedor Phone Auth no pudo verificarse desde la herramienta de gestión disponible.

## Riesgos

1. El proveedor Phone OTP debe verificarse/configurarse antes del uso real.
2. Puede existir un Auth user huérfano si el OTP crea la cuenta pero el teléfono no corresponde a un customer; esto no duplica customers.
3. Los RPC customer-facing aún aceptan IDs confiados desde frontend.
4. RLS ownership completo queda pendiente.
5. `CustomerContext` todavía conserva el modelo legacy.

## FASE 3A — bloqueadores

- ownership/RLS basado en `auth.uid()`;
- migración de RPC customer-facing;
- eliminación gradual de `p_customer_id` confiado;
- transición de `CustomerContext`;
- política definitiva de onboarding de customers nuevos;
- política de limpieza de Auth users huérfanos.

## Rollback lógico

No hay migración destructiva ni modificación de `customers.id`. Los vínculos reales, una vez creados, no deben eliminarse automáticamente como parte de un rollback de código.

## Git

- Branch: `phase-3-customer-auth-identity`
- Base: `main` en `8c09aa1f824317b163632daf6f9d81f26196f1bd`
- Objetivo de PR: Draft contra `main`
