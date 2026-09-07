# FASE 2A — Drift Reconciliation + Critical Hardening

**Repositorio:** `fdxruli/ea-panel`  
**Proyecto Supabase:** `xvstqhvooabljhhfmuas`  
**Branch:** `phase-2a-drift-hardening`  
**Scope:** auditoría + hardening controlado, forward-only

## 1. Executive Summary

La auditoría confirmó drift real entre el ledger de migraciones de producción y los archivos versionados en GitHub `main`. Producción contiene cambios funcionales que no están representados por el mismo timestamp/nombre en GitHub, y GitHub contiene tres migraciones de seguridad/referidos que no están aplicadas literalmente en producción.

Los hallazgos críticos fueron:

- `increment_referral_count(uuid)` era invocable por `anon` y `authenticated` y podía incrementar arbitrariamente el contador de cualquier cliente.
- `record_discount_usage_and_deactivate(uuid, uuid)` era invocable por `anon` y aceptaba `customer_id` controlado por el cliente.
- Los RPC de dashboard/admin `get_advanced_dashboard_stats`, `get_dashboard_stats_in_range`, `update_order_with_stock_sync`, `get_product_stats` y `get_special_prices_with_details` no tenían una comprobación `is_admin()` en la implementación expuesta.
- `order_profits` y `discounts_with_targets` eran vistas SECURITY DEFINER y estaban expuestas a API roles.
- `dashboard_stats` (materialized view) estaba expuesta a `anon`/`authenticated`.
- `get_dashboard_stats_in_range` y `get_advanced_dashboard_stats` tenían search_path mutable.
- `customers.phone` no tenía UNIQUE real, aunque no existían duplicados y todos los valores eran NOT NULL.
- Las tablas de identidad/datos de cliente mantienen RLS habilitado, pero las policies actuales legacy no prueban ownership; varias usan `USING/WITH CHECK true`. No se endurecieron a `auth.uid()` en esta fase para no romper el frontend que todavía no usa Customer Auth.

## 2. Production Truth

PostgreSQL de producción: 17.x. El ledger de producción tenía 15 migraciones antes de FASE 2A y quedó con 17 después de las dos migraciones aplicadas en esta fase.

Estado relevante de `customers`:

- 56 clientes.
- `phone` NOT NULL en las 56 filas.
- 0 grupos duplicados.
- 0 filas duplicadas por teléfono.
- No existe `customers.auth_user_id`.
- `customers.referrer_id` permanece FK.
- `orders.customer_id` permanece FK a `customers.id`.

## 3. GitHub Desired State

`main` contiene 20 archivos SQL de migraciones. Entre ellos existen cambios de hardening y referidos con timestamps propios (`20260905140000`, `20260905161000`, `20260905221500`) que no están presentes literalmente en el ledger de producción.

También existen migraciones versionadas en GitHub cuyo comportamiento ya está presente en producción bajo otros timestamps del ledger o mediante objetos runtime equivalentes.

## 4. Drift Matrix

| Objeto / migración GitHub | Producción | Estado | Riesgo | Acción |
|---|---|---|---|---|
| `20260824010000_secure_public_menu_catalog_read.sql` | Ledger `20260824071138 secure_public_menu_catalog_read` | DIFFERENT naming/timestamp, runtime equivalent | Bajo | No re-aplicar literalmente |
| `20260824160000_customer_merge.sql` | Ledger `20260824212448 customer_merge_transactional_audit` | DIFFERENT naming/timestamp, runtime present | Bajo | Preservar producción |
| `20260824160100_customer_merge_special_prices_array_fix.sql` | Ledger `20260824212529 customer_merge_special_prices_array_fix` | MATCH semántico | Bajo | No re-aplicar |
| `20260825090000_allow_admins_read_inactive_products.sql` | Ledger `20260826001302 allow_admins_read_inactive_products` | DIFFERENT naming/timestamp, runtime present | Bajo | No re-aplicar |
| `20260831222823_optimize_indexes_and_batch_rpcs.sql` | RPC batch e índices presentes | PROD-equivalent / ledger drift | Medio | Reconciliado documentalmente; no ejecutar histórico |
| `20260901164500_fix_create_order_with_stock_check_aggregation.sql` | RPC runtime presente con agregación/bloqueo | PROD-equivalent / ledger drift | Medio | No ejecutar histórico |
| `20260901165000_add_atomic_save_product_with_recipe_rpc.sql` | RPC runtime presente | PROD-equivalent / ledger drift | Medio | No ejecutar histórico |
| `20260901170000_add_update_order_with_stock_sync_rpc.sql` | RPC runtime presente | PROD-equivalent / ledger drift | Medio | No ejecutar histórico |
| `20260901170500_add_get_active_menu_products_rpc.sql` | RPC runtime presente | PROD-equivalent / ledger drift | Medio | No ejecutar histórico |
| `20260901230000_create_cash_registers.sql` | Ledger `20260902063431 20260901230000_create_cash_registers` | DIFFERENT naming/timestamp | Bajo | No re-aplicar |
| `20260901230100_add_daily_sales_to_dashboard_rpc.sql` | Ledger `20260902063506 20260901230100_add_daily_sales_to_dashboard_rpc` | DIFFERENT naming/timestamp | Bajo | No re-aplicar |
| `20260902160000_strict_cash_registers.sql` | Ledger `20260902214635 strict_cash_registers` | DIFFERENT naming/timestamp | Bajo | No re-aplicar |
| `20260903080747_optimize_performance_and_security.sql` | Ledger `20260903143800 20260903080747_optimize_performance_and_security` | DIFFERENT naming/timestamp | Bajo | No re-aplicar |
| `20260903081748_optimize_rls_performance.sql` | Ledger `20260903144403 20260903081748_optimize_rls_performance` | DIFFERENT naming/timestamp | Bajo | No re-aplicar |
| `20260904193000_customer_directory_and_crm_analytics.sql` | Ledger `20260905014813 customer_directory_and_crm_analytics` | DIFFERENT naming/timestamp | Bajo | No re-aplicar |
| `20260905011500_admin_products_directory_and_analytics.sql` | Ledger `20260905073944 admin_products_directory_and_analytics` | DIFFERENT naming/timestamp | Bajo | No re-aplicar |
| `20260905021000_product_audience_and_special_visibility.sql` | Ledger `20260905083849 20260905021000_product_audience_and_special_visibility` | DIFFERENT naming/timestamp | Bajo | No re-aplicar |
| `20260905140000_harden_security_definer_execute_grants.sql` | No exact ledger row; some grant hardening already existed via earlier migration, but not all | CONFLICTING if replayed literally | Alto | Sustituido por FASE 2A forward-only |
| `20260905161000_fix_referral_security_and_rewards.sql` | No exact ledger row; referral trigger/security runtime exists, but `generate_personal_reward_code` differs | DIFFERENT / CONFLICTING | Alto | No replay; preserve production semantics |
| `20260905221500_fix_record_discount_usage_preservation.sql` | Function body is runtime-equivalent, but no matching ledger row before FASE 2A | GITHUB_ONLY / PROD-equivalent runtime | Medio | No replay; behavior preserved |
| Production-only `20260901180242 optimize_realtime_tables_and_replica_identity` | No GitHub migration file | PROD_ONLY | Medio | Documentar y posteriormente importar a source-of-truth |
| Production-only `20260906074000 support_one_reward_per_level_selection` | No GitHub migration file | PROD_ONLY | Medio | Documentar/importar antes de FASE 3 |
| Production-only `20260906083925 add_title_to_rewards_and_update_progress_rpc` | No GitHub migration file | PROD_ONLY | Medio | Documentar/importar antes de FASE 3 |

## 5. Security Findings

### Critical

1. `increment_referral_count(uuid)` aceptaba un `referrer_id` arbitrario y ejecutaba `UPDATE public.customers SET referral_count = referral_count + 1`. Se eliminó EXECUTE para `PUBLIC`, `anon` y `authenticated`. La función queda como operación interna de trigger.
2. Los RPC de dashboard/administración no tenían guard de administrador dentro de la función. Se introdujeron wrappers SECURITY DEFINER con `is_admin()` y se mantuvieron las implementaciones originales como `_impl` no ejecutables directamente.
3. `order_profits` y `discounts_with_targets` se expusieron como SECURITY DEFINER views. Pasaron a `security_invoker=true`, se añadió `WHERE public.is_admin()` y se eliminó acceso API de `anon`/`PUBLIC`.
4. `dashboard_stats` se retiró de la superficie Data API para `anon` y `authenticated`; el frontend actual usa la RPC avanzada en lugar de consultar esta materialized view.

### High / accepted legacy debt

- `create_order_with_stock_check(p_customer_id, ...)` sigue disponible para legacy customer checkout y acepta `customer_id` controlado por el cliente. Sin Customer Auth no existe una prueba fiable de ownership. Se mantiene para no romper checkout y queda como bloqueador directo para FASE 3.
- `generate_personal_reward_code(p_customer_id, p_reward_id)` sigue aceptando un `customer_id` controlado por cliente. Debe migrar a ownership por Auth antes de Customer Auth general.
- `get_customer_basic_stats`, `get_customer_favorite_products`, `get_customer_rewards_progress` y `get_customer_stats_batch` todavía reflejan el modelo legacy de identidad por UUID suministrado por cliente; no se declaró ownership seguro en esta fase.
- `get_active_menu_products(p_customer_id)` mantiene compatibilidad pública del menú; la selección de productos exclusivos por UUID todavía depende del modelo legacy.

## 6. Functions Hardened

| Función | Riesgo | Acción | Estado |
|---|---|---|---|
| `get_advanced_dashboard_stats` | Exposición de revenue/cost/profit a authenticated | Wrapper + `is_admin()` + search_path fijo | CORREGIDO |
| `get_dashboard_stats_in_range` | Exposición admin + mutable search_path | Wrapper + `is_admin()` + search_path fijo | CORREGIDO |
| `update_order_with_stock_sync` | Mutación arbitraria de order/stock | Wrapper + `is_admin()` + acceso directo al impl revocado | CORREGIDO |
| `get_product_stats` | Exposición de coste/ventas/favoritos | Wrapper + `is_admin()` | CORREGIDO |
| `get_special_prices_with_details` | Exposición de precios dirigidos y target IDs | Wrapper + `is_admin()` | CORREGIDO |
| `increment_referral_count` | Escalada de privilegios / manipulación de referral_count | EXECUTE externo revocado; sólo uso interno | CORREGIDO |
| `record_discount_usage_and_deactivate` | Manipulación de uso/desactivación por customer_id | `anon`/PUBLIC revocado; ownership fuerte queda pendiente de Auth | PARCIAL |
| `get_business_status` | Privilegios elevados innecesarios | SECURITY INVOKER + search_path fijo | CORREGIDO |

`is_admin()` se mantiene SECURITY DEFINER porque es un helper de autorización que consulta `admins` y devuelve sólo booleano; la administración sigue basada en `auth.users.id = admins.id`.

## 7. RLS Changes

No se eliminaron policies ni se deshabilitó RLS.

| Tabla | Riesgo | Cambio | Estado |
|---|---|---|---|
| `customers` | Policies legacy con `true`; no ownership real | Sin cambio disruptivo; documentado como deuda Auth | PENDIENTE FASE 3 |
| `orders` | SELECT/INSERT legacy amplio | Sin cambio disruptivo; FK intacta | PENDIENTE FASE 3 |
| `order_items` | SELECT/INSERT legacy amplio | Sin cambio disruptivo | PENDIENTE FASE 3 |
| `customer_addresses` | ALL con `true` | Sin cambio disruptivo | PENDIENTE FASE 3 |
| `customer_favorites` | ALL con `true` | Sin cambio disruptivo | PENDIENTE FASE 3 |
| `special_prices` | SELECT público | UI administrativa protegida mediante RPC/view; tabla permanece legacy | PENDIENTE |

Las seis tablas mantienen RLS habilitado. La fase no pretende fingir ownership mientras no exista `auth.uid() -> customer`.

## 8. Grants Changes

| Objeto | Antes | Después | Motivo |
|---|---|---|---|
| `increment_referral_count(uuid)` | anon + authenticated | ninguno externo | Evitar incremento arbitrario |
| `get_dashboard_stats_in_range(...)` | authenticated | authenticated + service_role, con guard `is_admin()` | Compatibilidad admin + mínimo privilegio lógico |
| `get_advanced_dashboard_stats(...)` | anon + authenticated + public | authenticated + service_role, con guard `is_admin()` | Eliminar exposición de dashboard |
| `update_order_with_stock_sync(...)` | anon + authenticated + public | authenticated + service_role, con guard `is_admin()` | Sólo administración |
| `get_product_stats()` | anon + authenticated + public | authenticated + service_role, con guard `is_admin()` | Proteger costes/analytics |
| `get_special_prices_with_details()` | anon + authenticated + public | authenticated + service_role, con guard `is_admin()` | Proteger targeting |
| `record_discount_usage_and_deactivate(...)` | anon + authenticated + public | authenticated + service_role | Eliminar invocación anónima directa |
| `order_profits` SELECT | anon + authenticated + public | authenticated + service_role, security_invoker + `is_admin()` | Proteger margen/beneficio |
| `discounts_with_targets` SELECT | anon + authenticated + public | authenticated + service_role, security_invoker + `is_admin()` | Proteger descuentos |
| `dashboard_stats` SELECT | anon + authenticated | service_role | Retirar MV administrativa del API |

## 9. Phone Uniqueness

Precondiciones comprobadas antes del cambio:

- 56/56 teléfonos no nulos.
- 0 grupos duplicados.
- 0 filas duplicadas.
- Todos los valores cumplen el patrón de caracteres de teléfono auditado.
- Longitudes observadas: 12 y 13 caracteres.

Se creó `customers_phone_key UNIQUE (phone)` en una migración forward-only. No se normalizaron formatos en esta fase porque eso requiere una política de canonicalización explícita y pruebas de compatibilidad del frontend.

## 10. Migration Reconciliation

Migraciones nuevas aplicadas en producción:

- Production ledger `20260907015310` — `phase_2a_drift_security_hardening`
- Production ledger `20260907015319` — `phase_2a_phone_uniqueness`

Estas dos migraciones están reflejadas en esta branch con los archivos:

- `supabase/migrations/20260907015310_phase_2a_drift_security_hardening.sql`
- `supabase/migrations/20260907015319_phase_2a_phone_uniqueness.sql`

No se aplicó ninguna migración histórica faltante de GitHub por timestamp.

## 11. Verification

Ejecutado después del hardening:

- RLS sigue habilitado en `customers`, `orders`, `order_items`, `customer_addresses`, `customer_favorites`, `special_prices`.
- FK `orders.customer_id -> customers.id` sigue presente.
- FK `customers.referrer_id -> customers.id` sigue presente.
- `customers.auth_user_id` no existe.
- `customers_phone_key` existe.
- `increment_referral_count` ya no es ejecutable por `anon`/`authenticated`.
- `get_dashboard_stats_in_range` ya no es ejecutable por `anon`.
- Dashboard/admin wrappers requieren `is_admin()`.
- Las dos vistas presentan `security_invoker=true`.
- Security Advisor volvió a ejecutarse después del cambio.

Security Advisor posterior: desaparecieron los findings de SECURITY DEFINER views y los findings de `search_path` mutable para las dos funciones de dashboard. Permanecen findings de funciones SECURITY DEFINER que todavía son legacy/customer-facing o que siguen expuestas a `authenticated` por compatibilidad. También permanece la extensión `http` en `public` y leaked password protection disabled; no se cambiaron en esta fase porque requieren validación específica y/o pertenecen a otra capa.

## 12. Remaining Risks

1. No hay ownership real de clientes mientras Customer Auth no exista.
2. `create_order_with_stock_check` permite suministrar `customer_id` desde legacy client.
3. `generate_personal_reward_code` acepta `customer_id` desde legacy client.
4. `get_customer_*` RPCs todavía reflejan identidad por UUID de cliente.
5. Las policies RLS de clientes todavía son de compatibilidad legacy.
6. `http` sigue instalado en `public`.
7. Existen tres migraciones runtime-only en producción que deben importarse al source-of-truth de GitHub antes de continuar con la migración de identidad.
8. Security Advisor todavía reporta warnings de `SECURITY DEFINER` para funciones legacy que no pueden endurecerse sin cambiar el contrato del frontend actual.

## 13. Blockers for Phase 3

Antes de añadir `customers.auth_user_id` y desplegar customer Auth/OTP hay que resolver explícitamente:

- Definir y ejecutar la matriz de ownership por cliente.
- Reemplazar `customer_id` suministrado por cliente en RPCs self-service por resolución vía `auth.uid()`.
- Diseñar la migración `auth.users -> customers.auth_user_id` sin modificar `customers.id` ni FKs históricas.
- Actualizar `CustomerContext` y cache reconciliation para usar identidad fuerte.
- Endurecer RLS de `customers`, `orders`, `order_items`, `customer_addresses`, `customer_favorites` y `special_prices` con ownership real.
- Re-evaluar `generate_personal_reward_code`, `get_customer_rewards_progress`, `get_customer_favorite_products`, `get_customer_basic_stats` y `get_customer_stats_batch`.
- Reimportar a GitHub las migraciones production-only (`optimize_realtime_tables_and_replica_identity`, `support_one_reward_per_level_selection`, `add_title_to_rewards_and_update_progress_rpc`) o documentar su equivalencia exacta.

## 14. Explicit Out-of-Scope

Esta fase NO implementó:

- Customer Supabase Auth.
- OTP.
- `customers.auth_user_id`.
- Migración de identidad frontend.
- Cambios a `CustomerContext`.
- Loyalty UI/categorías en frontend.
- Cambio de `customers.id`.
- Cambio de `orders.customer_id`.
- Cambio de `customers.referrer_id`.
- Cambio de semántica de negocio de referidos.
- Eliminación de datos históricos.

## 15. Reversibility / Rollback Logic

No se usaron down migrations destructivas. La reversión lógica debe realizarse mediante una nueva migración forward-only que restaure grants/view definitions o deshaga el cambio específico requerido, previa evaluación de impacto. Los datos y las FKs no fueron eliminados ni reescritos.
