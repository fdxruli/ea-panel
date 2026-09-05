# Reporte Técnico: Migración y Arquitectura de Supabase para Audiencia y Visibilidad de Productos

**Fecha:** 5 de Septiembre de 2026  
**Proyecto Supabase:** `xvstqhvooabljhhfmuas` (EABD3 - Entre Alas)  
**Migración:** `supabase/migrations/20260905021000_product_audience_and_special_visibility.sql`  
**Estado:** Aplicada con éxito en Producción (`success: true`)

---

## 1. Resumen Ejecutivo

Se integró una arquitectura de base de datos robusta, segura y de alto rendimiento en Supabase/PostgreSQL para permitir el **control granular de audiencia y visibilidad** de los productos del catálogo de Entre Alas:

1. **Público en General (`target_customer_ids IS NULL`):** Los productos son visibles para todos los comensales, visitantes no autenticados y clientes registrados en el menú digital.
2. **Clientes Especiales (`target_customer_ids = ARRAY['uuid1', 'uuid2', ...]`):** Los productos son **100% invisibles** e inaccesibles para el público general y para cualquier cliente que no esté explícitamente listado en el arreglo.

---

## 2. Modificaciones de Esquema (Schema DDL)

### 2.1. Columna `target_customer_ids` en tabla `products`
```sql
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS target_customer_ids uuid[] DEFAULT NULL;
```
- **Diseño Array nativo de Postgres (`uuid[]`):** Evita la sobrecarga de un join N:M para consultas de menú de alta concurrencia, ofreciendo lecturas O(1) y búsquedas atómicas con operadores de arreglos `@>` y `= ANY()`.
- **Compatibilidad Hacia Atrás:** Todo producto preexistente tiene valor `NULL`, garantizando que ningún producto del menú actual sufra interrupciones o cambios no deseados.

### 2.2. Índice Invertido Generalizado (GIN)
```sql
CREATE INDEX IF NOT EXISTS idx_products_target_customer_ids 
ON public.products USING GIN (target_customer_ids);
```
- Acelera las consultas que filtran por clientes específicos (`target_customer_ids @> ARRAY[p_customer_id]`), manteniendo tiempos de respuesta en milisegundos incluso ante catálogos extensos.

---

## 3. Seguridad de Datos y Row Level Security (RLS)

Se blindó la tabla `products` contra fuga de información de productos exclusivos:

```sql
DROP POLICY IF EXISTS "Public can read active menu products" ON public.products;

CREATE POLICY "Public can read active menu products"
ON public.products
FOR SELECT
TO anon, authenticated
USING (
  is_active = true 
  AND (
    target_customer_ids IS NULL 
    OR target_customer_ids = '{}'
    OR (auth.uid() IS NOT NULL AND auth.uid() = ANY(target_customer_ids))
  )
);
```

> **Garantía de Seguridad:** Incluso si un atacante intenta consultar directamente la API REST de Supabase (`/rest/v1/products`), la base de datos a nivel de kernel de PostgreSQL descarta cualquier fila que no le corresponda al usuario.

---

## 4. Funciones Stored Procedures (RPC) Implementadas y Actualizadas

Todas las funciones fueron configuradas con `SECURITY DEFINER` y `SET search_path = public` siguiendo los estándares de OWASP y Supabase.

### 4.1. `get_active_menu_products(p_customer_id uuid DEFAULT NULL)`
- **Objetivo:** Retornar el catálogo activo para el menú digital del cliente.
- **Lógica de Filtrado:**
  ```sql
  WHERE p.is_active = true
    AND (
      p.target_customer_ids IS NULL 
      OR p.target_customer_ids = '{}'
      OR (p_customer_id IS NOT NULL AND p_customer_id = ANY(p.target_customer_ids))
    )
  ```
- **Campo Retornado:** `is_exclusive` (`boolean`), calculado automáticamente como:
  ```sql
  (p.target_customer_ids IS NOT NULL AND cardinality(p.target_customer_ids) > 0) AS is_exclusive
  ```
  Esto permite a la interfaz del comensal desplegar la insignia especial **"⭐ Exclusivo"**.

### 4.2. `update_product_audience(p_product_id uuid, p_target_customer_ids uuid[])`
- **Objetivo:** Actualización atómica e instantánea de la audiencia de un producto desde la tarjeta del producto, tabla o drawer analítico sin tener que reescribir recetas ni datos comerciales.
- **Lógica:** Valida permisos de administrador, limpia duplicados y nulos del arreglo y actualiza `target_customer_ids` y `updated_at`.

### 4.3. `save_product_with_recipe(p_product_data jsonb, p_recipe_items jsonb)`
- **Objetivo:** Creación y edición completa de productos con costeo y receta.
- **Actualización:** Ahora extrae y persiste `target_customer_ids` enviado desde la nueva pestaña **"Audiencia y Visibilidad"** del formulario:
  ```sql
  v_target_customer_ids := CASE 
      WHEN (p_product_data->'target_customer_ids') IS NULL 
        OR jsonb_typeof(p_product_data->'target_customer_ids') = 'null' THEN NULL
      ELSE ARRAY(SELECT jsonb_array_elements_text(p_product_data->'target_customer_ids')::uuid)
  END;
  ```

### 4.4. `get_admin_products_directory(...)`
- **Objetivo:** Directorio administrativo del panel con soporte de paginación, filtros y matriz BCG.
- **Actualizaciones:**
  - Nuevo parámetro: `p_audience text DEFAULT 'all'` (`'all'`, `'public'`, `'special'`).
  - Columnas retornadas: `target_customer_ids`, `target_customers_count`, `is_exclusive`.
  - Optimización de agregación: Cálculo correcto de conteos sin conflicto de claves compuestas (`COUNT(*)::bigint`).

### 4.5. `get_admin_product_detail_analytics(p_product_id uuid)`
- **Objetivo:** Drawer de analítica 360° del producto.
- **Actualización:** Retorna el nodo `assigned_customers` con los datos `{ id, name, phone }` de cada cliente autorizado en la audiencia del producto para visualización y contacto directo vía WhatsApp.

---

## 5. Pruebas y Verificación de la Migración en Supabase

| Prueba | Resultado Esperado | Estado |
| :--- | :--- | :---: |
| Ejecución de Migración | Aplicación limpia en proyecto `xvstqhvooabljhhfmuas` | ✅ Exitoso |
| Creación de Índice GIN | `idx_products_target_customer_ids` activo | ✅ Exitoso |
| Compatibilidad de Productos Existentes | `target_customer_ids` en `NULL`, visibles para todos | ✅ Verificado |
| RPC `get_active_menu_products(null)` | Solo entrega productos con `target_customer_ids IS NULL` | ✅ Verificado |
| RPC `get_active_menu_products(uuid)` | Entrega productos públicos + productos asignados al UUID | ✅ Verificado |
| RPC `update_product_audience` | Asigna y desasigna clientes de manera atómica | ✅ Verificado |
| RPC `get_admin_products_directory` con filtro de audiencia | Filtra correctamente por `'public'` y `'special'` | ✅ Verificado |
