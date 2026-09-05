# Reporte de Migración: Directorio Administrativo de Productos, KPIs y Analítica 360°

**Fecha:** 5 de Septiembre de 2026  
**Proyecto:** EA-Panel (Entre Alas)  
**Entorno de Base de Datos:** Supabase PostgreSQL (`xvstqhvooabljhhfmuas`) - Motor PostgreSQL 17  
**Archivo de Migración:** [`supabase/migrations/20260905011500_admin_products_directory_and_analytics.sql`](file:///c:/dev/ea-panel/supabase/migrations/20260905011500_admin_products_directory_and_analytics.sql)  
**Estado:** Aplicada con éxito y validada en producción (`success: true`)

---

## 1. Resumen Ejecutivo

Siguiendo el exitoso precedente del módulo de clientes (CRM), se diseñó y desplegó una infraestructura analítica y transaccional para el módulo de **Productos y Catálogo**. Esta migración traslada el procesamiento pesado de costos, márgenes, disponibilidad de inventario por receta, agregación de ventas y clasificación en la matriz de menú al motor de base de datos PostgreSQL, garantizando respuestas ultrarrápidas y consistencia matemática.

---

## 2. Componentes Implementados en la Base de Datos

### 2.1 Índices Estratégicos de Alto Desempeño
Se crearon índices clave para acelerar las consultas agregadas recurrentes entre productos, pedidos, recetas e insumos:
- `idx_product_recipes_product_id`: Optimiza el cruce entre productos y sus recetas.
- `idx_product_recipes_ingredient_id`: Acelera la verificación de disponibilidad e impacto de stock de insumos.
- `idx_ingredients_stock_alert` (compuesto): Acelera la detección de alertas tempranas sobre `(track_inventory, current_stock, low_stock_threshold)`.

---

### 2.2 RPC: `get_admin_products_directory`
Función `SECURITY DEFINER` que procesa el catálogo administrativo completo con filtros, ordenamiento dinámico y paginación en servidor.

#### Parámetros de Entrada:
| Parámetro | Tipo | Valor por Defecto | Descripción |
| :--- | :--- | :--- | :--- |
| `p_search` | `text` | `NULL` | Búsqueda parcial insensible a mayúsculas en nombre, descripción y categoría. |
| `p_category_id` | `uuid` | `NULL` | Filtro por categoría específica. |
| `p_status` | `text` | `'all'` | `'all'`, `'active'` (solo activos), `'inactive'` (solo inactivos). |
| `p_stock_status` | `text` | `'all'` | `'all'`, `'in_stock'`, `'low_stock'`, `'out_of_stock'`, `'untracked'`. |
| `p_menu_matrix` | `text` | `'all'` | `'all'`, `'star'`, `'workhorse'`, `'puzzle'`, `'dog'`. |
| `p_sort_by` | `text` | `'sales_desc'` | Criterio de ordenamiento (`sales_desc`, `sales_asc`, `revenue_desc`, `margin_desc`, `margin_asc`, `price_desc`, `price_asc`, `stock_asc`, `name_asc`, `created_desc`). |
| `p_limit` | `int` | `50` | Límite de filas por página. |
| `p_offset` | `int` | `0` | Desplazamiento para paginación. |

#### Columnas Retornadas:
- **Identificación:** `id`, `name`, `description`, `image_url`, `category_id`, `category_name`, `created_at`, `is_active`, `track_stock`, `image_count`.
- **Económicas & Márgenes:** `price`, `cost` (manual), `effective_cost` (costo dinámico calculado desde insumos si rastrea stock), `margin_amount` ($), `margin_percent` (%).
- **Comerciales & Fidelización:** `total_sold` (unidades vendidas en pedidos completados), `total_revenue` ($ recaudado), `avg_rating`, `reviews_count`, `favorites_count`.
- **Operativas de Inventario:** `stock_status` (`'in_stock'`, `'low_stock'`, `'out_of_stock'`, `'untracked'`), `max_preparable` (número máximo de porciones que pueden prepararse con el stock de insumos actual).
- **Inteligencia de Menú:** `menu_matrix_class` (`'star'`, `'workhorse'`, `'puzzle'`, `'dog'`).
- **Paginación:** `total_count` (conteo exacto de resultados antes del corte de paginación).

---

### 2.3 RPC: `get_admin_products_kpis`
Calcula en una sola llamada el tablero ejecutivo del catálogo completo:

```json
{
  "total_products": 25,
  "active_products": 8,
  "inactive_products": 17,
  "total_categories": 6,
  "total_catalog_revenue": 57735.00,
  "total_units_sold": 789,
  "avg_profit_margin": 44.8,
  "out_of_stock_count": 1,
  "low_stock_count": 0,
  "untracked_stock_count": 24,
  "star_count": 1,
  "workhorse_count": 4,
  "puzzle_count": 11,
  "dog_count": 9,
  "top_seller": {
    "id": "9c72098f-978f-401a-b2be-21e1bcd58313",
    "name": "Alitas Mango Habanero",
    "total_sold": 308,
    "total_revenue": 24825.00
  }
}
```

---

### 2.4 RPC: `get_admin_product_detail_analytics`
Genera el expediente o perfil 360° para un producto individual vía `p_product_id`:
1. **Ficha Base:** Precios, categoría y configuración de inventario.
2. **Desglose de Receta en Vivo:** Lista de ingredientes, unidad base, costo unitario, costo en platillo, stock disponible en almacén, unidades preparables y alertas de stock agotado/bajo.
3. **Top 5 Clientes:** Clientes que más consumen el producto (nombre, teléfono, unidades compradas, gasto acumulado y última compra).
4. **Últimos 10 Pedidos:** Trazabilidad de órdenes completadas con código de pedido, nombre del cliente y fecha.
5. **Ventas Recientes (30 Días):** Unidades vendidas, facturación neta y órdenes en el último mes.
6. **Reseñas:** Histórico de calificaciones y comentarios de clientes.

---

## 3. Matriz de Ingeniería de Menú (Clasificación Automática)

A diferencia de un listado plano, el sistema ahora evalúa dinámicamente cada producto contra los promedios globales del negocio:

$$\text{Promedio Ventas Catálogo} = \frac{\sum \text{total\_sold}}{N}, \quad \text{Promedio Margen Catálogo} = \frac{\sum \text{margin\_percent}}{N}$$

| Clasificación | Condición | Estrategia de Negocio |
| :--- | :--- | :--- |
| ⭐ **Estrella (`star`)** | Ventas $\ge$ Media y Margen $\ge$ Media | Mantener calidad estricta y visibilidad privilegiada en el menú. |
| 🐎 **Caballo de Batalla (`workhorse`)** | Ventas $\ge$ Media y Margen $<$ Media | Alto volumen de salida; evaluar ligeros incrementos de precio o reducir costos de receta. |
| 🧩 **Puzle / Oportunidad (`puzzle`)** | Ventas $<$ Media y Margen $\ge$ Media | Alta rentabilidad; requiere impulso comercial, fotos llamativas o combos. |
| ⚠️ **Por Revisar / Perro (`dog`)** | Ventas $<$ Media y Margen $<$ Media | Candidatos a ser reformulados, promocionados o retirados del menú. |

---

## 4. Pruebas y Validación en Supabase

Se ejecutaron pruebas directas en el motor de base de datos con los siguientes resultados:
1. `SELECT * FROM public.get_admin_products_directory(p_limit => 3);`:
   - Retornó productos con cálculo exacto de margen (ej: *Alitas Mango Habanero* con margen 35.29% clasificada como `workhorse`; *Papas Fritas* con margen 57.14% clasificada como `star`).
2. `SELECT public.get_admin_products_kpis();`:
   - Agregación instantánea sobre 25 productos y pedidos históricos sin bloqueos ni retrasos.
3. `SELECT public.get_admin_product_detail_analytics('9c72098f-978f-401a-b2be-21e1bcd58313');`:
   - Extracción exitosa del Top 5 de compradores leales y las últimas 10 órdenes completadas.
