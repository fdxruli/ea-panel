# FASE 4 — Customer Frontend → Supabase Auth

## Estado

**COMPLETE WITH RISKS**

La identidad customer-facing queda migrada a un modelo Auth-first en la rama `phase-4-customer-auth-frontend`. La integración final debe ocurrir sobre el `main` que ya contiene FASE 2A, 3 y 3A.

El límite pendiente es de validación externa: el E2E real de SMS/OTP requiere un proveedor SMS configurado y un número de prueba utilizable. La base actualmente tiene 56 customers legacy y 0 `auth_user_id`, por lo que no se simula un PASS de multiusuario real contra datos Auth existentes.

## 1. Arquitectura anterior

```text
localStorage.customer_phone
        ↓
customers.phone
        ↓
customers.id
        ↓
CustomerContext
```

## 2. Arquitectura nueva

```text
Supabase Auth session
        ↓
auth.uid()
        ↓
get_my_customer_id()
        ↓
customers.auth_user_id
        ↓
customers.id
        ↓
CustomerContext
        ↓
UserDataContext / dominio
```

`localStorage.customer_phone`, `customer_data` y `customer_canonical_id` ya no se leen como fuente de autenticación. En logout se eliminan para evitar reutilización accidental.

## 3. CustomerContext

Responsabilidades:

- `session`, `user`, `customer`, `customerId`
- `isAuthenticated`, `isLinked`, `loading`, `authInitialized`
- restauración Auth-first con `getSession()`
- resolución canónica mediante `get_my_customer_id()`
- `onAuthStateChange()` para `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED` y `USER_UPDATED`
- linking existente mediante `link_my_customer()`
- registro de clientes nuevos mediante `complete_my_customer_registration()`
- logout mediante `supabase.auth.signOut()`
- invalidación de identidad al cerrar sesión

Las respuestas de restauración llevan `sessionRestoreIdRef` e `isMountedRef` para impedir que una respuesta vieja sobrescriba una identidad nueva.

## 4. UserDataContext

UserDataContext ya no determina quién es el usuario.

Recibe `customerId`, `isAuthenticated` e `isLinked` desde `CustomerContext` y usa `customerId` sólo como identidad de dominio para cargar datos protegidos por RLS.

Las caches se separan por `customerId`, no por teléfono:

```text
USER_INFO-{customerId}
USER_ORDERS-{customerId}
```

Las respuestas de orders se validan para confirmar que todas pertenecen al `customerId` canónico esperado.

## 5. Matriz de auditoría

| Archivo | Identidad actual | Auth | Cache | RPC / acceso legacy | Acción |
|---|---|---|---|---|---|
| `src/context/CustomerContext.jsx` | Auth + customer canónico | Auth-first | Legacy limpiado, no usado como identidad | RPC Auth-safe | Migrado |
| `src/context/UserDataContext.jsx` | `customerId` derivado de Auth | Indirecta vía contexto | `customerId` | Tabla con RLS | Migrado |
| `src/layouts/ClientLayout.jsx` | `phone`/customer desde contexto | Auth-derived | UI | RLS/RPC existentes | Auditado |
| `src/components/UserMenu.jsx` | `customer` + Auth flags | Auth | No autentica por cache | `signOut()` | Migrado |
| `src/components/PhoneModal.jsx` | Auth phone OTP | Supabase Auth | No OTP storage | `signInWithOtp`, `verifyOtp`, link/register | Migrado |
| `src/pages/MyProfile.jsx` | `customer.id` como dominio | Route guard + Auth | No phone storage | tablas bajo RLS | Migrado |
| `src/pages/MyOrders.jsx` | contexto customer | Route guard + Auth | UserData | orders bajo RLS | Validado por guard/contexto |
| `src/pages/MyStuff.jsx` | `customerId` desde Auth | Auth | Contexto | Auth-safe rewards RPCs | Migrado |
| `src/pages/Cart.jsx` | `customerId` sólo como dominio | Auth | carrito local | order service | Migrado |
| `src/pages/CreateOrder.jsx` | admin | Admin Auth | admin draft/cache | Admin legacy RPCs | Fuera del customer auth boundary |
| `src/pages/OrderDetailPage.jsx` | contexto customer | Route guard + Auth | UserData | orders bajo RLS | Validado |
| `src/services/orderService.js` | `customerId` sólo para distinguir guest | Auth-safe customer path | N/A | `create_my_order_with_stock_check`, `record_my_discount_usage_and_deactivate` | Migrado |
| `src/lib/customerAuth.js` | Auth | Supabase Auth | N/A | centraliza OTP/link/resolve/logout + API Phase 3 compatible | Reconciliado |

## 6. RPC

| RPC legacy | RPC Auth-safe | Frontend migrado | Estado |
|---|---|---|---|
| `create_order_with_stock_check(customer_id, ...)` | `create_my_order_with_stock_check(...)` | `orderService.js` | OK para customer authenticated |
| `generate_personal_reward_code(customer_id, reward_id)` | `generate_my_personal_reward_code(reward_id)` | `MyStuff.jsx` | Migrado |
| `get_customer_basic_stats(customer_id)` | `get_my_customer_basic_stats()` | customer-facing path | Disponible Auth-safe |
| `get_customer_favorite_products(customer_id, ...)` | `get_my_customer_favorite_products(...)` | customer-facing path | Disponible Auth-safe |
| `get_customer_rewards_progress(customer_id)` | `get_my_customer_rewards_progress()` | `MyStuff.jsx` | Migrado |
| `record_discount_usage_and_deactivate(customer_id, discount_id)` | `record_my_discount_usage_and_deactivate(discount_id)` | `orderService.js` | Migrado |
| `get_active_menu_products(customer_id)` | Auth-aware `get_active_menu_products()` | `ProductContext.jsx` | Migrado a no pasar customerId |
| `special_prices` table | `get_my_special_prices()` / `get_public_special_prices()` | `ProductContext.jsx` | Sin query directa customer-side |

## 7. Linking

El flujo es:

```text
phone
 ↓
signInWithOtp()
 ↓
verifyOtp()
 ↓
Auth session
 ↓
link_my_customer()
 ↓
existing customers.id
```

Para un teléfono ya existente, `link_my_customer()` conserva exactamente el `customers.id`. Para un teléfono nuevo, `complete_my_customer_registration()` crea el customer con `auth_user_id` en el mismo paso y conserva la lógica de referral code.

No se crea un customer nuevo para resolver una identidad ya existente.

## 8. Cache reconciliation

La regla es:

```text
Auth identity
   ↓
canonical customer.id
   ↓
all customer-specific cache
```

`UserDataContext` no usa phone para rehidratar customer. Las caches se invalidan cuando no existe una identidad Auth+linked válida. Las respuestas antiguas llevan request-id guards y no pueden reemplazar una identidad nueva.

## 9. Logout

```text
Customer A
  ↓
supabase.auth.signOut()
  ↓
clear customer state
  ↓
clear customer-specific caches
  ↓
clear legacy identity storage
```

La UI vuelve a estado anónimo y no conserva el customer anterior en memoria de dominio.

## 10. Session expiry

La ruta Auth se considera inválida cuando Supabase deja de proporcionar una sesión válida. `SIGNED_OUT` limpia `customer`, `customerId`, `phone`, `isLinked` y el cache legacy. No existe fallback a `localStorage.customer_phone`.

## 11. Special Prices

`special_prices` ya no se consulta directamente desde `ProductContext`.

Hay dos superficies:

- `get_my_special_prices()` para authenticated; el backend deriva el customer desde `auth.uid()` y no expone `target_customer_ids`.
- `get_public_special_prices()` para navegación pública; es `SECURITY INVOKER` y RLS limita la lectura a filas globales sin targeting.

Además, se revocaron privilegios de escritura `anon/authenticated` sobre `special_prices`.

## 12. Route guards

Se agregó `CustomerAuthGuard` para:

- `/mi-perfil`
- `/mis-pedidos`
- `/mis-pedidos/:orderCode`
- `/mi-actividad`

El guard espera `authInitialized` y `isCustomerLoading`, después exige `isAuthenticated && isLinked`.

## 13. OTP

Implementación:

```text
Phone
 ↓
signInWithOtp({ phone })
 ↓
verifyOtp({ phone, token, type: 'sms' })
 ↓
Session
 ↓
link / registration
```

No se guarda OTP ni token manualmente.

**E2E real: BLOCKED BY PROVIDER CONFIG / TEST CREDENTIALS**. No se envió un OTP real ni se afirmó PASS sin un número de prueba apropiado.

## 14. Security / A vs B

### Pruebas estáticas implementadas

- `CustomerContext` no lee `localStorage.customer_phone` ni `customer_canonical_id`.
- `UserDataContext` no resuelve por teléfono.
- `ProductContext` no consulta `special_prices` directamente.
- `MyStuff` no usa legacy reward RPCs.
- `orderService` usa Auth-safe RPCs para customer authenticated.
- `special_prices` ya no devuelve `target_customer_ids` en la RPC personal.

### Resultado esperado A vs B

Cambiar `localStorage.customer_phone` no cambia `auth.uid()` y no concede ownership.

Cambiar un `customerId` local tampoco concede ownership porque las operaciones customer-facing usan Auth-safe RPCs y/o RLS.

Una prueba A/B completa con dos customers Auth vinculados no puede declararse PASS actualmente porque la base de producción auditada tiene **56 customers y 0 `auth_user_id`**.

## 15. Legacy

Los nombres legacy quedan sólo para compatibilidad fuera del customer auth boundary o para admin/guest workflows explícitos.

Las claves de identidad legacy permanecen definidas únicamente para limpieza histórica, pero ya no son una fuente de autenticación.

## 16. Supabase advisors / riesgos

El advisor de seguridad sigue mostrando warnings preexistentes y algunos relacionados con funciones SECURITY DEFINER expuestas por el modelo actual. Esto no implica automáticamente una vulnerabilidad; requiere mantener grants mínimos y validar cada función por diseño.

## 17. Tests / CI

Se añadieron:

- `tests/phase4CustomerAuth.test.js`
- `.github/workflows/phase-4-customer-auth.yml`

El workflow ejecuta `npm ci`, `npm test`, `npm run lint` y `npm run build`.

## 18. Migraciones

Las migraciones originalmente fechadas antes de FASE 3/3A fueron renombradas para representar el orden lógico reproducible:

- `20260907023000_phase_4_customer_auth_frontend.sql`
- `20260907023100_phase_4_public_special_prices.sql`

No se re-aplicó SQL a producción sólo para llenar el ledger: el runtime ya contenía las funciones equivalentes y la prioridad fue no introducir una segunda aplicación ciega.

## 19. Riesgos pendientes

1. Proveedor SMS / número de prueba no verificado para E2E real.
2. Ningún customer está todavía vinculado en la base auditada; el comportamiento A/B final debe probarse con dos cuentas Auth reales.
3. Existen warnings SECURITY DEFINER preexistentes en la base fuera del alcance estricto de FASE 4.
4. Guest/admin workflows siguen usando superficies legacy explícitas; no deben reutilizarse como customer authorization boundary.
5. El ledger histórico de Supabase no contiene las migraciones originales de FASE 4 aunque el runtime ya contiene el comportamiento equivalente; la nueva nomenclatura de GitHub hace reproducible el orden futuro, pero la reconciliación histórica del ledger sigue siendo una diferencia documentada.
