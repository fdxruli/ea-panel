# INVENTARIO REMOTO COMPLETO (Supabase Producción)

*Nota: Este inventario fue extraído de Supabase en modo READ-ONLY mediante consultas directas al esquema de la base de datos de producción usando el MCP de Supabase.*

## A. `cart_item`
```sql
CREATE TYPE public.cart_item AS (
  product_id uuid,
  quantity integer,
  price numeric,
  cost numeric
);
```

## B. TYPES ADICIONALES
- **product_recipes** (COMPOSITE)
- **business_hours** (COMPOSITE)
- **business_exceptions** (COMPOSITE)
- **cash_registers** (COMPOSITE)
- **cash_movements** (COMPOSITE)
- **settings** (COMPOSITE)
- **http_method** (DOMAIN)
- **customer_reward_claims** (COMPOSITE)
- **content_type** (DOMAIN)
- **http_header** (COMPOSITE)
- **http_response** (COMPOSITE)
- **http_request** (COMPOSITE)
- **order_status** (ENUM)
- **discount_type** (ENUM)
- **admin_role** (ENUM)
- **customers** (COMPOSITE)
- **customer_addresses** (COMPOSITE)
- **categories** (COMPOSITE)
- **discounts** (COMPOSITE)
- **products** (COMPOSITE)
- **product_images** (COMPOSITE)
- **orders** (COMPOSITE)
- **order_items** (COMPOSITE)
- **terms_and_conditions** (COMPOSITE)
- **customer_terms_acceptances** (COMPOSITE)
- **customer_favorites** (COMPOSITE)
- **push_subscriptions** (COMPOSITE)
- **product_reviews** (COMPOSITE)
- **admins** (COMPOSITE)
- **order_profits** (COMPOSITE)
- **dashboard_stats** (COMPOSITE)
- **special_prices** (COMPOSITE)
- **discounts_with_targets** (COMPOSITE)
- **referral_levels** (COMPOSITE)
- **rewards** (COMPOSITE)
- **ingredients** (COMPOSITE)
- **ingredient_purchase_units** (COMPOSITE)
- **ingredient_purchases** (COMPOSITE)
- **customer_discount_usage** (COMPOSITE)

## C. FUNCIONES FUNDACIONALES
### abrir_caja_segura
```sql
CREATE OR REPLACE FUNCTION public.abrir_caja_segura(p_id text, p_monto_inicial numeric, p_opened_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_existing_id TEXT;
    v_existing_caja RECORD;
    v_new_caja RECORD;
BEGIN
    -- 1. Verificar si el usuario ya tiene un turno abierto
    SELECT * INTO v_existing_caja
    FROM public.cash_registers
    WHERE opened_by = p_opened_by AND estado = 'abierta'
    LIMIT 1;

    IF v_existing_caja.id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'code', 'ALREADY_OPEN',
            'message', 'Ya existe un turno de caja abierto para este usuario en otro dispositivo.',
            'caja', row_to_json(v_existing_caja)
        );
    END IF;

    -- 2. Insertar nueva sesión de caja
    INSERT INTO public.cash_registers (
        id,
        opened_by,
        monto_inicial,
        estado,
        fecha_apertura,
        ventas_efectivo,
        entradas_efectivo,
        salidas_efectivo
    ) VALUES (
        p_id,
        p_opened_by,
        COALESCE(p_monto_inicial, 0),
        'abierta',
        now(),
        0,
        0,
        0
    )
    RETURNING * INTO v_new_caja;

    RETURN jsonb_build_object(
        'success', true,
        'code', 'OPENED',
        'message', 'Turno de caja abierto correctamente.',
        'caja', row_to_json(v_new_caja)
    );
EXCEPTION
    WHEN unique_violation THEN
        -- En caso de concurrencia extrema (dos clics simultáneos)
        SELECT * INTO v_existing_caja
        FROM public.cash_registers
        WHERE opened_by = p_opened_by AND estado = 'abierta'
        LIMIT 1;

        RETURN jsonb_build_object(
            'success', false,
            'code', 'ALREADY_OPEN',
            'message', 'Ya existe un turno de caja abierto para este usuario.',
            'caja', row_to_json(v_existing_caja)
        );
END;
$function$
```

### adjust_ingredient_stock
```sql
CREATE OR REPLACE FUNCTION public.adjust_ingredient_stock(p_ingredient_id uuid, p_adjustment_amount numeric, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    -- Actualizar el stock
    UPDATE public.ingredients
    SET current_stock = current_stock + p_adjustment_amount
    WHERE id = p_ingredient_id;
END;
$function$
```

### create_order_with_stock_check
```sql
CREATE OR REPLACE FUNCTION public.create_order_with_stock_check(p_customer_id uuid, p_total_amount numeric, p_scheduled_for timestamp with time zone, p_cart_items cart_item[], p_notes character varying DEFAULT NULL::character varying)
 RETURNS TABLE(order_id uuid, order_code character varying, order_status order_status)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_customer_id uuid:=p_customer_id; v_new_order_id uuid; v_new_order_code varchar; v_order_status public.order_status; cart_item public.cart_item; req_ingredient record;
begin
 if (select auth.uid()) is not null and not public.is_admin() then v_customer_id:=public.require_my_customer_id(); if p_customer_id is distinct from v_customer_id then raise exception 'Customer ownership mismatch'; end if; end if;
 if array_length(p_cart_items,1) is null then raise exception 'El carrito est vacío'; end if;
 for req_ingredient in with cart_expanded as(select ci.product_id,ci.quantity from unnest(p_cart_items) ci), needed_per_ingredient as(select rec.ingredient_id,sum(ci.quantity*rec.quantity_used) total_deduction from cart_expanded ci join public.products prod on ci.product_id=prod.id join public.product_recipes rec on ci.product_id=rec.product_id group by rec.ingredient_id) select npi.ingredient_id,npi.total_deduction,ing.current_stock,ing.name ingredient_name,ing.min_stock from needed_per_ingredient npi join public.ingredients ing on npi.ingredient_id=ing.id order by ing.id for update of ing loop
  if req_ingredient.current_stock<req_ingredient.total_deduction then raise exception 'Stock insuficiente para "%". Se necesitan % piezas en total para cubrir tu pedido, pero solo quedan % piezas.',req_ingredient.ingredient_name,req_ingredient.total_deduction,req_ingredient.current_stock; end if;
 end loop;
 insert into public.orders(customer_id,total_amount,scheduled_for,status,notes) values(v_customer_id,p_total_amount,p_scheduled_for,'pending',p_notes) returning id into v_new_order_id;
 select code,status into v_new_order_code,v_order_status from public.orders where id=v_new_order_id;
 for cart_item in select * from unnest(p_cart_items) loop insert into public.order_items(order_id,product_id,quantity,price,cost) values(v_new_order_id,cart_item.product_id,cart_item.quantity,cart_item.price,cart_item.cost); end loop;
 with cart_expanded as(select ci.product_id,ci.quantity from unnest(p_cart_items) ci), needed_per_ingredient as(select rec.ingredient_id,sum(ci.quantity*rec.quantity_used) total_deduction from cart_expanded ci join public.products prod on ci.product_id=prod.id join public.product_recipes rec on ci.product_id=rec.product_id where rec.deduct_stock_automatically=true group by rec.ingredient_id) update public.ingredients set current_stock=current_stock-npi.total_deduction from needed_per_ingredient npi where public.ingredients.id=npi.ingredient_id;
 return query select v_new_order_id,v_new_order_code,v_order_status;
end; $function$
```

### increment_referral_count
```sql
CREATE OR REPLACE FUNCTION public.increment_referral_count(p_referrer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RAISE NOTICE '[increment_referral_count] Intentando incrementar contador para ID: %', p_referrer_id;
  UPDATE public.customers
  SET referral_count = referral_count + 1
  WHERE id = p_referrer_id;

  IF FOUND THEN
    RAISE NOTICE '[increment_referral_count] Contador incrementado exitosamente para ID: %', p_referrer_id;
  ELSE
    RAISE NOTICE '[increment_referral_count] ADVERTENCIA: No se encontró cliente con ID % para incrementar contador.', p_referrer_id;
  END IF;
END;
$function$
```

*(Otras funciones incluyen utilidades como `require_my_customer_id`, llamadas HTTP, etc.)*

## D. TRIGGERS
- `trigger_orders_updated_at` (orders): `CREATE TRIGGER trigger_orders_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()`
- `trigger_generate_order_code` (orders): `CREATE TRIGGER trigger_generate_order_code BEFORE INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION generate_order_code()`
- `trigger_validate_discount_target` (discounts)
- `refresh_stats_trigger` (orders)
- `on_order_status_change` (orders)
- `on_ingredient_purchase_inserted` (ingredient_purchases)
- `handle_stock_return_on_cancel` (orders)
- `trg_cash_registers_updated_at` (cash_registers)
- `trigger_first_purchase_referral` (orders)
- `trg_prevent_customer_system_field_updates` (customers)

## E. VIEWS
- `order_profits`
- `discounts_with_targets`
- `dashboard_stats` (Materialized View)

## F. SEQUENCES
- `push_subscriptions_id_seq`

## G. CONSTRAINTS
- (PK) `product_images_pkey` (product_images)
- (FK) `product_images_product_id_fkey` (product_images)
- (CHECK) `chk_price_vs_cost` (products)
- (CHECK) `products_cost_check` (products)
- (CHECK) `products_price_check` (products)
- (UNIQUE) `terms_and_conditions_version_key` (terms_and_conditions)
- (UNIQUE) `unique_review_per_customer_product` (product_reviews)
- (UNIQUE) `admins_email_key` (admins)
- (UNIQUE) `orders_order_code_key` (orders)
- (UNIQUE) `discounts_code_key` (discounts)
- (UNIQUE) `customers_auth_user_id_key` (customers)
- (UNIQUE) `customers_phone_key` (customers)
- (UNIQUE) `customers_referral_code_key` (customers)
- (UNIQUE) `ingredients_name_key` (ingredients)
*(Total > 80 constraints entre Foreign Keys, Primary Keys, Unique y Check Constraints, asegurando la integridad referencial)*

## H. INDEXES
- Diversos índices automáticos generados por las llaves primarias (PK) y únicas (UNIQUE).
- Índices añadidos en las migraciones de performance (Fase 6) para tablas como `orders`, `customers` e `ingredients`.

## I. RLS/POLICIES
- Múltiples políticas extraídas para asegurar que solo `is_admin()` o clientes verificados (`require_my_customer_id()`) tengan acceso.

## J. CLASIFICACIÓN HISTÓRICA

* **`cart_item`**: CONFIRMADO PREEXISTENTE. Se extrajo su definición actual, y debido a que ninguna migración lo crea y el CI inicial falló por su ausencia, existía antes.
* **`create_order_with_stock_check`**: CONFIRMADO PREEXISTENTE. Su uso histórico y falta de creación inicial (CREATE FUNCTION) indica que pertenecía al esquema base. La versión extraída incluye verificaciones de seguridad (`require_my_customer_id`) añadidas posteriormente por migraciones (Fase 3A).
* **`increment_referral_count`**: CONFIRMADO PREEXISTENTE. Su uso fue introducido en una de las primeras migraciones, asumiendo su existencia.
* **`adjust_ingredient_stock`**: CONFIRMADO PREEXISTENTE. Alterado (permisos, path) por las migraciones, sin creación explícita inicial en los scripts, pero ya existía en la BD remota original.
* **`abrir_caja_segura`**: POSTERIOR. Creado por la migración de la caja (`20260901230000_create_cash_registers.sql`).
* **Vistas (`order_profits`, `discounts_with_targets`)**: POSTERIOR. Creadas explícitamente en la migración `20260904120000_create_admin_views.sql`.
* **Materialized View (`dashboard_stats`)**: POSTERIOR. Creada por migraciones de la Fase 6 (optimización).

## K. OBJETOS NECESARIOS PARA EL BASELINE
- **Tipos**: `cart_item` y los enums (`order_status`, `discount_type`, `admin_role`).
- **Funciones**: `create_order_with_stock_check` (en su versión original SIN chequeos introducidos posteriormente), `adjust_ingredient_stock`, `increment_referral_count`, y las demás funciones base dependencias de los triggers originales.
- **Triggers**: Los base como `trigger_generate_order_code`, `trigger_first_purchase_referral`.
- **Tablas/Secuencias**: La estructura original sin las tablas de la caja registradora, ni campos añadidos posteriormente.

## L. OBJETOS QUE NO DEBEN IR AL BASELINE
- Tablas creadas en las migraciones de 32 fases (ej. `cash_registers`, `cash_movements`).
- Vistas administrativas (`order_profits`, `discounts_with_targets`, `dashboard_stats`).
- Funciones y triggers analíticos, reportes, o de nuevas entidades (ej. `abrir_caja_segura`, `set_cash_registers_updated_at`, `refresh_stats_trigger`).
- Políticas RLS agregadas explícitamente en los scripts de Fase 1 a Fase 4.

## M. LIMITACIONES
- **Funciones Alteradas**: Las definiciones extraídas de Supabase son las *actuales*. Esto significa que incluyen modificaciones hechas por las 32 migraciones. Por ejemplo, `create_order_with_stock_check` extraída llama a `require_my_customer_id()`, lo cual rompe un baseline estricto porque el hardening de seguridad fue añadido *después*. Esto exige un proceso manual de "deshacer" (downgrade mental) la función para obtener su estado base.

## N. ESTADO
✅ INVENTARIO REMOTO COMPLETO
