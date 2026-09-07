# FASE 5 — Customer Loyalty

## Estado

**BLOCKED** para declarar la fase completa sobre `main`.

Se implementó y verificó la capa derivada de Loyalty en Supabase y se preparó el consumo frontend, pero el PR de Fase 4 (`phase-4-customer-auth-frontend`, PR #44) continúa abierto y `main` todavía contiene el `CustomerContext` legacy basado en teléfono. Activar el badge sobre esa identidad sería inconsistente con el contrato de Fase 5.

La rama de trabajo es `phase-5-customer-loyalty`, creada directamente desde `main`, como fue solicitado.

## 1. Objetivo

Clasificar dinámicamente a cada customer en una de tres categorías exclusivamente:

- `inicial`
- `frecuente`
- `vip`

La categoría es un dato derivado de pedidos completados y no se persiste en `customers`.

## 2. Categorías

La prioridad es `VIP` → `Frecuente` → `Inicial`.

### VIP

```text
(total_spent >= 3000 OR completed_orders >= 15)
AND last_order_date >= now() - interval '90 days'
```

### Frecuente

```text
(total_spent >= 750 OR completed_orders >= 3)
AND last_order_date >= now() - interval '90 days'
```

Debe evaluarse después de VIP.

### Inicial

Todo customer restante, incluyendo cero pedidos y actividad con más de 90 días.

## 3. Fórmulas y fuente de datos

Los pedidos válidos son únicamente aquellos con:

```text
orders.status = 'completado'
```

La métrica económica utiliza `orders.total_amount`. La tabla `orders` no contiene columnas separadas de impuestos/envío en el esquema auditado; `total_amount` es el importe final persistido del pedido y no se modifica como parte de Loyalty.

La fecha de recencia utiliza `orders.created_at` del último pedido completado y `now()` de PostgreSQL.

PostgreSQL de producción: 17.6.

Timezone de PostgreSQL: UTC.

## 4. Fuente única de verdad

```text
customers.auth_user_id
        ↓
customers.id
        ↓
orders (status = completado)
        ↓
get_my_loyalty_category()
        ↓
frontend
```

El frontend no calcula ni autoriza la categoría.

## 5. RPC

Función customer-facing:

```text
public.get_my_loyalty_category()
```

Devuelve:

```text
category
 total_spent
 completed_orders
 last_order_date
```

La función usa `auth.uid()` para resolver `customers.auth_user_id` y no recibe `customer_id`.

Security mode: `SECURITY INVOKER`.

Los objetos SQL están schema-qualified.

Grants verificados:

- `authenticated`: EXECUTE
- `anon`: revocado
- `public`: revocado
- `service_role`: mantiene el privilegio administrativo existente

La función devuelve cero filas cuando la sesión no está vinculada a un customer, en lugar de inventar `inicial`.

## 6. Persistencia

No se creó:

```text
customers.loyalty_category
```

La categoría se deriva siempre desde los pedidos. Así se evita estado stale y no se duplican los datos de negocio existentes.

## 7. Performance

Producción ya dispone de índices sobre `orders.customer_id` y combinaciones `customer_id/status`. El patrón de consulta auditado usa índice por customer y filtra por estado; no se creó un índice adicional prematuro.

## 8. Frontend preparado

Se añadieron:

- `src/lib/loyalty.js` — valores estables, labels y cálculo puro para pruebas.
- `src/services/loyaltyService.js` — llamada estrictamente a `get_my_loyalty_category()`.
- `src/hooks/useLoyalty.js` — caché en memoria por `auth user id`, invalidación en logout/cambio de sesión y refresh relevante.
- `src/components/LoyaltyBadge.jsx` — presentación accesible de las tres categorías.
- `src/components/LoyaltyBadge.module.css` — estilos sin depender sólo del color.
- integración preparada en `src/pages/MyProfile.jsx`.

Importante: esta integración no debe considerarse activa sobre producción hasta que Fase 4 sea la base efectiva del customer frontend.

## 9. Cache e invalidación

La caché se identifica por `auth user id`, nunca por teléfono.

Se invalida en:

- `SIGNED_OUT`.
- cambio de usuario Auth.
- refresh explícito.
- volver a visibilidad de la aplicación.
- evento `ea:order-completed` cuando el flujo de órdenes lo emita.

## 10. Seguridad

No se acepta ningún valor del frontend para:

```text
customerId
totalSpent
completedOrders
lastOrderDate
category
```

La RPC deriva todo desde PostgreSQL y `auth.uid()`.

La fase no modifica ownership, `customers.id`, `orders.customer_id` ni `customers.referrer_id`.

## 11. Validación actual de producción

Customers: 56.

Customers con al menos un pedido: 51.

Customers con al menos un pedido completado: 50.

Pedidos totales: 256.

Pedidos completados: 253.

Pedidos cancelados: 2.

Pedidos en envío: 1.

Gasto completado acumulado: $58,110 MXN.

Ticket completado promedio: $229.68 MXN.

Ticket completado mediano: $210 MXN.

Distribución actual calculada con las reglas de Fase 5:

```text
Inicial: 39
Frecuente: 12
VIP: 5
```

## 12. Casos de umbral auditados

- `Cristian`: $3,215 / 15 completados / actividad reciente → VIP.
- `Cristina`: $2,650 / 15 completados / actividad reciente → VIP por frecuencia.
- `Gladys P.Jsabines`: $2,970 / 14 completados / actividad reciente → Frecuente.
- `Kelly 2`: $745 / 3 completados / actividad reciente → Frecuente por frecuencia.
- `Magdiel Reyes`: $795 / 2 completados / última actividad fuera de 90 días → Inicial.
- clientes sin pedidos → Inicial.

## 13. Tests

Se añadieron tests unitarios de las reglas puras para:

- VIP por `$3000`.
- VIP por `15` pedidos.
- exclusión por `91+` días.
- Frecuente por `$750`.
- Frecuente por `3` pedidos.
- prioridad VIP sobre Frecuente.
- `749.99`, `750`, `750.01`.
- `2999.99`, `3000`, `3000.01`.
- `2`, `3`, `14`, `15` pedidos.
- `90`, `91` días.
- sin pedidos.
- labels exclusivamente `Inicial`, `Frecuente`, `VIP`.

Los tests completos de A/B customer, logout/login Auth y expiración de sesión requieren que la Fase 4 esté realmente activa sobre la rama base.

## 14. Domains

**Loyalty y Product Categories son dominios separados.**

Esta fase no modifica `products.category_id`, catálogo, `special_prices`, rewards ni referrals.

## 15. Fuera de alcance

No se implementa:

- puntos,
- monedas,
- progreso,
- gamificación,
- nuevos rewards,
- beneficios nuevos,
- productos exclusivos por Loyalty,
- campañas,
- notificaciones automáticas,
- módulo admin completo.

## 16. Riesgos / bloqueo

El bloqueo actual es de integración de fases, no de la regla de Loyalty:

1. Fase 4 sigue abierta en PR #44.
2. `main` todavía tiene el frontend de identidad anterior a Fase 4.
3. El producto de producción reportado en Supabase ya contiene `auth_user_id` y funciones Auth de fases anteriores, pero los 56 customers actuales siguen sin `auth_user_id` vinculado en el momento de la auditoría.
4. Por ello no se puede declarar un E2E Auth customer A/B real como PASS todavía.

## 17. Próxima evolución

Futuro explícito:

- VIP-only products.
- audience-targeted products.
- más niveles (por ejemplo 5 niveles) sólo cuando exista una nueva especificación.
- beneficios.
- gamificación.
