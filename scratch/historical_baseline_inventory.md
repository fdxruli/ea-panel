# INVENTARIO HISTÓRICO DEL BASELINE (Previo a 20260824010000)

## TYPES

**Nombre:** `cart_item` (COMPOSITE)
**Definición:**
```sql
CREATE TYPE public.cart_item AS (
  product_id uuid,
  quantity integer,
  price numeric,
  cost numeric
);
```
**Estado histórico:** PREEXISTENTE.
**Primera evidencia:** Se utiliza como parámetro `cart_item[]` en `20260901164500_fix_create_order_with_stock_check_aggregation.sql`. No hay `CREATE TYPE cart_item` en ninguna migración. El CI falló por no encontrarlo.
**Migraciones que lo modificaron:** Ninguna modifica su estructura interna.
**Confianza:** ALTO

*(Los tipos enumerados `order_status`, `discount_type`, `admin_role` también son PREEXISTENTES con confianza ALTA. Constan en `terminos.txt`).*

## FUNCTIONS

**Nombre:** `create_order_with_stock_check`
**Definición (Candidato Baseline):** Versión reconstruida usando el cuerpo de `20260901164500_fix_create_order_with_stock_check_aggregation.sql` SIN el bloque inyectado posteriormente por la fase de seguridad.
**Estado histórico:** PREEXISTENTE.
**Primera evidencia:** Reemplazada por `20260901164500_fix_create_order_with_stock_check_aggregation.sql` y alterada por `20260903080747`. 
**Migraciones que lo modificaron:**
- `20260901164500`: Corrige lógica de stock aggregation.
- `20260903080747`, `20260905140000`: Modifican permisos (GRANT/REVOKE EXECUTE) y search_path.
- `20260907022243`: Agrega `require_my_customer_id()` (Hardening Fase 3A).
**Confianza:** ALTO

**Nombre:** `increment_referral_count`
**Definición (Candidato Baseline):** Extraído directamente del entorno remoto (se eliminó el search_path explícito introducido en `20260903080747`).
**Estado histórico:** PREEXISTENTE.
**Primera evidencia:** Modificado en `20260903080747` (`ALTER FUNCTION public.increment_referral_count(uuid) SET search_path = public;`).
**Migraciones que lo modificaron:** `20260903080747`, `20260907015310` (REVOKE EXECUTE).
**Confianza:** ALTO

**Nombre:** `adjust_ingredient_stock`
**Definición (Candidato Baseline):** Extraído directamente del entorno remoto (se eliminó el search_path explícito).
**Estado histórico:** PREEXISTENTE.
**Primera evidencia:** Alterado en `20260903080747` y `20260905140000`.
**Migraciones que lo modificaron:** `20260903080747` y `20260905140000` modificaron sus permisos de ejecución (GRANT/REVOKE EXECUTE) y configuraron `search_path=public,pg_temp`.
**Confianza:** ALTO

**Otras funciones (Triggers)**
Funciones como `update_updated_at_column`, `generate_order_code`, `validate_discount_target`, `refresh_dashboard_stats`, `send_order_notification_on_status_change`, `update_ingredient_stock_on_purchase`, `return_stock_on_cancellation`, `handle_first_purchase_referral` son TODAS **PREEXISTENTES**. 
- Nunca fueron creadas mediante una migración `CREATE FUNCTION`.
- Se extrajeron con éxito desde el Supabase remoto.
- **Confianza:** ALTO

## TRIGGERS

**Nombres:**
- `trigger_orders_updated_at`
- `trigger_generate_order_code`
- `refresh_stats_trigger`
- `on_order_status_change`
- `handle_stock_return_on_cancel`
- `trigger_first_purchase_referral` (eliminado y recreado en migraciones, pero preexistente)
- `trigger_validate_discount_target`
- `on_ingredient_purchase_inserted`
**Definiciones:** Reconstruidas en `triggers.sql` asociando los triggers a sus respectivas tablas y funciones base extraídas de producción.
**Estado histórico:** PREEXISTENTES. 
**Primera evidencia:** Ninguna de las 32 migraciones contiene sentencias `CREATE TRIGGER` para estos, con la excepción de una migración que hace un DROP/CREATE posterior de `trigger_first_purchase_referral`.
**Migraciones que lo modificaron:** `20260905161000_fix_referral_security_and_rewards.sql` altera/recrea `trigger_first_purchase_referral`.
**Confianza:** ALTO

## VIEWS

**Nombres:** `order_profits`, `discounts_with_targets`
**Estado histórico:** POSTERIOR.
**Primera evidencia:** Creadas/Alteradas en `20260907015310_phase_2a_drift_security_hardening.sql` y `20260904120000_create_admin_views.sql` (confirmado en sesión anterior).
**Migraciones que lo modificaron:** Fueron introducidas por migraciones.
**Confianza:** ALTO (de que no pertenecen al baseline).


# ESTADO FINAL
✅ DEFINICIONES HISTÓRICAS RECONSTRUIDAS
