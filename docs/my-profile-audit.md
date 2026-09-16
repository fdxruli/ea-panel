# Auditoría Inicial y Baseline — Módulo "Mi Perfil"

**Repositorio:** `fdxruli/ea-panel`  
**Proyecto Supabase:** `xvstqhvooabljhhfmuas`  
**Fecha de auditoría:** 2026-09-15  
**Entorno de ejecución:** Auditoría read-only preliminar previa a implementación controlada.

---

## 1. Alcance de la Auditoría

Se auditó de forma exhaustiva:
- Componentes y páginas cliente: `MyProfile.jsx`, `MyOrders.jsx`, `MyStuff.jsx`, `LoyaltyBadge.jsx`, `AddressModal.jsx`.
- Contextos y estado: `CustomerContext.jsx`, `UserDataContext.jsx`.
- Servicios y llamadas RPC: `loyaltyService.js`, `orderService.js`, `customerAuth.js`.
- Base de datos Supabase: Tablas (`customers`, `customer_addresses`, `customer_favorites`, `customer_reward_claims`, `customer_terms_acceptances`), políticas de RLS, grants de roles (`anon`, `authenticated`, `service_role`), funciones `SECURITY DEFINER` e índices.

---

## 2. Hallazgos en Base de Datos (Supabase)

### 2.1 Políticas RLS y Exposición Pública a `anon`

| Recurso | Severidad | Evidencia | Impacto | Solución |
|---|---|---|---|---|
| `public.customers` | **CRÍTICA** | Policy `Legacy anonymous can view customers` con `roles: {anon}`, `qual: true`. Policy `Legacy anonymous can insert customers` con `with_check: true`. | Cualquier usuario no autenticado podía volcar la tabla completa de clientes (nombres, teléfonos, códigos de referidos) e insertar clientes falsos. | Eliminar policies permisivas anónimas. Restringir acceso solo al usuario autenticado propietario (`auth.uid() = auth_user_id`) o a administradores. |
| `public.customer_addresses` | **CRÍTICA** | Policy `Legacy anonymous can manage addresses` con `roles: {anon}`, `cmd: ALL`, `qual: true`, `with_check: true`. | Cualquier persona anónima podía leer, modificar o eliminar todas las direcciones de entrega de cualquier cliente. | Revocar acceso anónimo global. Restringir a `authenticated` validando pertenencia mediante `c.auth_user_id = auth.uid()`. |
| `public.customer_favorites` | **ALTA** | Policy `Legacy anonymous can manage favorites` con `roles: {anon}`, `cmd: ALL`, `qual: true`. | Manipulación arbitraria de favoritos ajenos. | Limitar exclusivamente al cliente autenticado propietario. |
| `public.customer_reward_claims` | **ALTA** | Policy `Customers can view their reward claims` con `roles: {anon, authenticated}`, `qual: true`. | Exposición de cupones de descuento y recompensas personales generadas para otros clientes. | Restringir lectura solo al propietario del cupón. |
| `public.customer_terms_acceptances` | **ALTA** | Policy `Customers can view terms acceptances` e `insert` con `USING (true)` para `anon`. | Exposición y alteración no controlada de aceptaciones de términos. | Limitar a clientes autenticados propietarios y administradores. |

### 2.2 Integridad de Datos en Producción (Direcciones Predeterminadas)

- **Evidencia encontrada:**
  ```sql
  SELECT customer_id, count(*) as default_count 
  FROM customer_addresses 
  WHERE is_default = true 
  GROUP BY customer_id 
  HAVING count(*) > 1;
  ```
  **Resultado:** 3 clientes tenían exactamente 2 direcciones marcadas como `is_default = true`:
  - `ea6ccbc3-6c5e-4cf1-811b-e9d276172a4f`
  - `2870e056-ac58-4e2e-8110-fde13ca81da3`
  - `eeadbed1-a644-4062-8a37-ab5f38ec690a`
- **Riesgo:** Un `CREATE UNIQUE INDEX ... WHERE is_default = true` habría roto la base de datos de inmediato.
- **Acción requerida:** Normalización previa no destructiva: mantener como default solo la dirección más reciente de cada cliente y desmarcar las anteriores a `is_default = false` sin borrar filas.

### 2.3 Funciones y RPCs

- **Fuga de datos de gasto en lealtad:** La RPC `get_my_loyalty_category()` retornaba `total_spent`, exponiendo montos acumulados de gasto al cliente.
- **Falta de atomicidad en direcciones:** No existía una RPC para fijar dirección predeterminada.
- **RPCs con grants a `anon`:** `generate_personal_reward_code(uuid, uuid)` y `get_customer_rewards_progress(uuid)` permitían ejecución pública anónima recibiendo `customer_id` desde el cliente.

---

## 3. Hallazgos en Frontend (GitHub)

1. **Mezcla de identidades:** `MyProfile.jsx` utilizaba `canonicalCustomer` de `CustomerContext` y a la vez `customer` de `UserDataContext`, inicializando el formulario con este último.
2. **Acoplamiento con "Mis Pedidos":** `MyProfile.jsx` consumía `useUserData()`, forzando la descarga innecesaria de todo el historial de pedidos y productos asociados.
3. **Operaciones no atómicas:** La fijación de dirección predeterminada en `MyProfile.jsx` ejecutaba dos peticiones `UPDATE` secuenciales en el cliente: primero `is_default = false` y luego `is_default = true`.
4. **Cálculo de lealtad en cliente con datos de dinero:** `loyaltyService.js` ejecutaba una consulta manual a `orders` filtrando por `customerId` y calculaba `total_spent` en memoria.
5. **Badge de lealtad incompleto:** `LoyaltyBadge.jsx` ocultaba las categorías `inicial` y `frecuente`, renderizando únicamente si la categoría era `vip`.

---

## 4. Matriz de Riesgos y Plan de Reversión

| Riesgo | Probabilidad | Impacto | Mitigación |
|---|---|---|---|
| Fallo en inserción de direcciones por índice único | Baja | Media | Normalización no destructiva ejecutada antes de crear el índice. |
| Incompatibilidad de clientes legacy sin `auth_user_id` | Media | Alta | No se hace bulk-link de clientes legacy; se preserva compatibilidad y vinculación controlada en login. |
| Pérdida de estado al navegar con cambios sin guardar | Media | Baja | Detección de `isDirty` y modal de confirmación antes de descartar cambios. |

**Plan de reversión:**
Si fuera necesario revertir la base de datos, se restauran las policies anteriores mediante script inverso y se desactiva el índice parcial `DROP INDEX IF EXISTS customer_addresses_single_default_idx;`.
