# Reporte de Migraciones Supabase: Rediseño de Caja y Dashboard

Como parte del despliegue del rediseño del módulo de Caja y las nuevas funciones de métricas del Dashboard, se han generado **dos nuevas migraciones SQL**. Este documento sirve como constancia técnica de los cambios introducidos en la base de datos para futuras referencias.

---

## 1. Migración: `20260901230000_create_cash_registers.sql`

Esta migración introduce el esquema formal en la nube para respaldar el control estricto de auditoría y sesiones de caja.

### Tablas Creadas
* **`public.cash_registers`**
  * Representa un turno o sesión de caja. 
  * Se enlaza mediante claves foráneas (`opened_by`, `closed_by`) a la tabla `public.admins`, garantizando trazabilidad absoluta de quién opera el dinero.
  * Almacena valores como `monto_inicial`, `monto_cierre`, `ventas_efectivo`, `entradas_efectivo`, `salidas_efectivo` y `estado` (`abierta` / `cerrada`).
  * Incluye un trigger automático (`set_cash_registers_updated_at`) para actualizar el campo `updated_at` antes de cada modificación.
* **`public.cash_movements`**
  * Registra las entradas y salidas manuales de efectivo de una sesión específica.
  * Está vinculada a una sesión mediante `caja_id` (con `ON DELETE CASCADE`) y al usuario que autorizó el movimiento mediante `realizado_por` (conectado a `admins`).

### Seguridad y Permisos
* Se implementaron **Row Level Security (RLS)** en ambas tablas.
* Se crearon políticas que permiten a los usuarios autenticados realizar consultas (`SELECT`), inserciones (`INSERT`), y actualizaciones (`UPDATE` únicamente para los cierres de caja).

---

## 2. Migración: `20260901230100_add_daily_sales_to_dashboard_rpc.sql`

Esta migración crea/actualiza la función Remote Procedure Call (RPC) en la base de datos encargada de empaquetar toda la inteligencia de negocios que el Dashboard consume.

### Función: `get_advanced_dashboard_stats(p_start_date, p_end_date)`
Se optimizó la recolección de estadísticas evitando explosiones combinatorias de JOINs y procesando todos los datos directamente en el motor PostgreSQL:

1. **Métricas Generales**: Retorna `totalRevenue`, `totalCosts`, `totalProfit`, `profitMargin`, y promedios por orden basándose en las órdenes completadas.
2. **Productos Rentables (`profitableProducts`)**: Calcula el costo total de los insumos y la ganancia por artículo, devolviendo el margen de utilidad y ordenando los productos por su aportación a la ganancia total.
3. **Crecimiento Comparativo (`growth_percent`)**: La función toma el tamaño del intervalo de fechas solicitado y lo proyecta hacia atrás en el tiempo (por ejemplo, los últimos 30 días contra los 30 días anteriores) para calcular de forma dinámica el porcentaje de crecimiento (o caída) en ventas.
4. **Series de Tiempo Diarias (`daily_sales`)**: Retorna un arreglo `[{day, revenue, orders_count}]` que permite al nuevo Dashboard trazar la evolución de ventas día por día, asegurando un uso correcto de las zonas horarias (`America/Mexico_City`) para que los cortes de medianoche no se traslapen por culpa de UTC.

---

*Desplegado en la rama de rediseño el 02 de Septiembre de 2026.*
