# Reporte Técnico: Auditoría y Blindaje de Seguridad Cliente-Base de Datos

**Fecha:** 17 de Septiembre de 2026 (Consolidado: 26 de Septiembre de 2026)  
**Proyecto Supabase:** `xvstqhvooabljhhfmuas` (EABD3)  
**Migración Aplicada:** [`supabase/migrations/20260917020000_security_boundary_hardening.sql`](file:///c:/dev/ea-panel/supabase/migrations/20260917020000_security_boundary_hardening.sql)  
**Rama:** `security/client-db-hardening`  
**Estado de Validación:** 98 tests pasando (0 fallos), build de producción exitoso (Exit code 0).

---

## 1. Resumen Ejecutivo

Se completó una auditoría exhaustiva y un endurecimiento estructural del perímetro de seguridad entre el frontend (React 19 / Vite) y la base de datos (PostgreSQL en Supabase).

El principio rector aplicado es **Confianza Cero (Zero-Trust)**:
> *"El frontend debe tratarse como un entorno completamente hostil y no confiable. Ninguna lógica de negocio crítica (precios unitarios, costos, balance de arqueos de caja, permisos de cancelación o cupones) puede depender de la integridad del cliente o de llamadas directas vía API de Supabase."*

A través de esta intervención, cualquier usuario malintencionado que intente manipular el tráfico HTTP, alterar objetos en la consola de DevTools o interactuar directamente con los endpoints PostgREST de Supabase se encontrará con restricciones a nivel de motor de base de datos (Row Level Security y RPCs `SECURITY DEFINER` con search_path aislado).

---

## 2. Vulnerabilidades Identificadas y Soluciones Implementadas

### A. Exposición de Claves Críticas en Frontend (`.env`)
- **Vulnerabilidad:**  
  Las variables de entorno en [.env](file:///c:/dev/ea-panel/.env) contenían claves sensibles con prefijo `VITE_`:
  - `VITE_SUPABASE_SERVICE_ROLE_KEY`
  - `VITE_VAPID_PRIVATE_KEY`  
  En Vite, cualquier variable que comience con el prefijo `VITE_` es incrustada automáticamente en el código estático compilado (`dist/assets/*.js`) y accesible públicamente por cualquier visitante. La clave `service_role` tiene privilegios de superusuario y elude todas las políticas RLS de Supabase.
- **Solución Implementada:**  
  - Se eliminó el prefijo `VITE_` de ambas variables, renombrándolas a `SUPABASE_SERVICE_ROLE_KEY` y `VAPID_PRIVATE_KEY`.
  - El frontend solo recibe y consume `VITE_SUPABASE_URL` y la clave pública con RLS `VITE_SUPABASE_ANON_KEY`.
  - Se actualizaron los scripts administrativos en servidor ([update_rpc.mjs](file:///c:/dev/ea-panel/update_rpc.mjs)) para leer de manera segura ambas variantes en entornos de mantenimiento.

---

### B. Manipulación de Precios y Costos en Pedidos (`orders` / `order_items`)
- **Vulnerabilidad:**  
  1. La función RPC `create_order_with_stock_check` recibía los campos `cart_item.price` y `cart_item.cost` directamente desde el JSON enviado por el cliente. Un usuario podía modificar el payload de la solicitud de compra y definir `price: 0.01` para cualquier producto del catálogo.
  2. Existían políticas RLS legadas (`Legacy anonymous can insert orders`, `Legacy anonymous can view orders`) que permitían accesos anónimos abiertos sobre las tablas `orders` y `order_items`.
- **Solución Implementada:**  
  - Se revocaron las políticas anónimas abiertas en ambas tablas.
  - Se modificó la función PL/pgSQL [`create_order_with_stock_check`](file:///c:/dev/ea-panel/supabase/migrations/20260917020000_security_boundary_hardening.sql#L176-L341):
    - **La base de datos ignora los precios y costos enviados por el frontend.**
    - Para clientes y compras anónimas, el motor consulta en tiempo de ejecución el precio oficial en `public.products` y los descuentos vigentes en `public.special_prices` (considerando fecha de vigencia, estado activo y segmentación de clientes).
    - Los compradores anónimos quedan obligados a utilizar el identificador reservado de cliente invitado (`68491ec0-3198-4aca-89e4-8034ebe1e35f`), impidiendo usurpar el historial de otros clientes registrados.
    - Se agregaron validaciones de montos totales no negativos y cantidades mayores a 0.

---

### C. Exposición y Modificación Indebida de Cajas Registradoras (`cash_registers`, `cash_movements`)
- **Vulnerabilidad:**  
  Las políticas RLS de ambas tablas estaban configuradas con `TO authenticated WITH CHECK (true)`. En el flujo de autenticación de clientes por SMS/OTP, los clientes adquieren el rol `authenticated` de Supabase. Esto significaba que cualquier cliente registrado podía leer los arqueos y turnos de caja del negocio e incluso insertar movimientos de efectivo adulterados.
- **Solución Implementada:**  
  - Se reemplazaron las políticas abiertas por:
    ```sql
    CREATE POLICY "cash_registers_admin_manage"
      ON public.cash_registers
      FOR ALL
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());

    CREATE POLICY "cash_movements_admin_manage"
      ON public.cash_movements
      FOR ALL
      TO authenticated
      USING (public.is_admin())
      WITH CHECK (public.is_admin());
    ```
  - Clientes regulares y anónimos carecen totalmente de permisos de lectura y escritura sobre los fondos y turnos de caja.

---

### D. Fuga de Suscripciones WebPush y Abuso de Cupones
- **Vulnerabilidad:**  
  - `push_subscriptions` permitía operaciones anónimas abiertas, lo que permitía a un atacante listar los tokens de notificación de todos los clientes o inyectar suscripciones falsas.
  - `customer_discount_usage` permitía a cualquier usuario autenticado registrar usos de cupones a nombre de otros clientes.
  - `special_prices` conservaba una política anónima legada que eludía las reglas de segmentación CRM.
- **Solución Implementada:**  
  - En `push_subscriptions`, se aisló el acceso: los administradores tienen control total y los usuarios autenticados únicamente pueden insertar y consultar sus propios registros (`customer_id` vinculado a `auth.uid()`).
  - En `customer_discount_usage`, se limitó la inserción y consulta al titular del cupón (`auth.uid()`) o al administrador.
  - Se eliminó la política anónima permisiva en `special_prices`.

---

### E. Flujo Seguro de Cancelación de Pedidos (`cancel_my_order`)
- **Vulnerabilidad / Bloqueo:**  
  El frontend realizaba un `.update({ status: 'cancelado' })` directo sobre la tabla `orders` desde las pantallas de cliente ([MyOrders.jsx](file:///c:/dev/ea-panel/src/pages/MyOrders.jsx) y [OrderDetailPage.jsx](file:///c:/dev/ea-panel/src/pages/OrderDetailPage.jsx)). Al restringir las actualizaciones directas de `orders` a administradores para evitar fraude de estados, los clientes no podían cancelar sus propios pedidos pendientes.
- **Solución Implementada:**  
  - Se creó la función RPC con permisos controlados [`public.cancel_my_order(p_order_id uuid)`](file:///c:/dev/ea-panel/supabase/migrations/20260917020000_security_boundary_hardening.sql#L125-L169):
    ```sql
    CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    ...
    ```
    - Verifica que el usuario autenticado sea el dueño real de la orden mediante `public.require_my_customer_id()`.
    - Solo permite la cancelación si el pedido está en estados cancelables: `creado`, `pendiente` o `en_espera`.
    - Actualiza el estado a `cancelado`, lo cual dispara automáticamente el trigger `handle_stock_return_on_cancel` para restaurar el inventario de ingredientes.
  - Se integró el método seguro `cancelMyOrder` en [orderService.js](file:///c:/dev/ea-panel/src/services/orderService.js) y en las vistas del cliente.

---

### F. Auditoría de Supabase Storage (Almacenamiento de Archivos)
- **Verificación:**  
  Se auditó la configuración de buckets (`storage.buckets`) y las políticas RLS sobre `storage.objects`:
  - **Bucket `images` (Público):**
    - Subida (`INSERT`) restringida estrictamente a administradores (`admin` o `staff` en `public.admins`).
    - Eliminación (`DELETE`) restringida estrictamente a administradores.
    - Lectura (`SELECT`) pública limitada exclusivamente a la subcarpeta `products/`.
  - **Conclusión:** El almacenamiento está protegido contra sobreescrituras no autorizadas o subida de ejecutables/archivos por terceros.

---

## 3. Matriz de Cambios en Código

| Archivo | Tipo de Cambio | Propósito |
| :--- | :--- | :--- |
| `supabase/migrations/20260917020000_security_boundary_hardening.sql` | **Nuevo** | Migración SQL oficial de hardening (RLS, recálculo de precios, RPCs seguras). |
| `.env` | **Modificado** | Retiro de prefijo `VITE_` en claves maestras privadas. |
| `src/services/orderService.js` | **Modificado** | Integración del cliente con la función `cancelMyOrder`. |
| `src/pages/MyOrders.jsx` | **Modificado** | Reemplazo de `.update()` directo por llamada a `cancelMyOrder`. |
| `src/pages/OrderDetailPage.jsx` | **Modificado** | Reemplazo de `.update()` directo por llamada a `cancelMyOrder`. |
| `src/context/CustomerContext.jsx` | **Modificado** | Aislamiento y protección con try/catch en lectura de perfil. |
| `update_rpc.mjs` | **Modificado** | Sincronización del script de mantenimiento con la función SQL segura. |

---

## 4. Verificación y Resultados de Pruebas

1. **Auditoría de Políticas en PostgreSQL:**
   - Consulta sobre `pg_policies` en Supabase: Se constató que ninguna de las 7 tablas intervenidas (`orders`, `order_items`, `cash_registers`, `cash_movements`, `push_subscriptions`, `customer_discount_usage`, `special_prices`) tiene políticas abiertas o inseguras.
2. **Suite de Pruebas Unitarias:**
   - Comando: `npm test`
   - Resultado: **98 tests aprobados** (0 fallos, 0 errores, tiempo: 16.6s).
3. **Escaneo de Código Compilado (`dist/`):**
   - Se ejecutó un análisis estático sobre todos los bundles generados en `dist/assets/*.js`.
   - Resultado: **Cero ocurrencias** de cadenas `service_role` o claves maestras.
4. **Validación de Compilación en Producción:**
   - Comando: `npm run build`
   - Resultado: Validación de rutas, generación de sitemap, transpilación Vite y Service Worker PWA completados con código de salida 0.

---

## 5. Nota Operativa sobre el Entorno de Producción (Vercel)

- Durante esta intervención **no se modificó ninguna configuración ni variable en el panel de Vercel**, garantizando la estabilidad operativa del entorno productivo en vivo.
- El sistema continúa operando con normalidad y fluidez tanto en los módulos de Clientes como en el Panel Administrativo.
- Para futuros despliegues o revisiones, se recomienda mantener la buena práctica de no definir `VITE_SUPABASE_SERVICE_ROLE_KEY` en los proyectos de frontend de Vercel.
