-- Migration: Atomic save_product_with_recipe RPC
-- Description: Creates an atomic PostgreSQL RPC function to upsert a product and replace its recipe
--              in a single transaction, eliminating race conditions and partial failures from frontend clients.

CREATE OR REPLACE FUNCTION public.save_product_with_recipe(
    p_product jsonb,
    p_recipe_items jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_product_id uuid;
    v_id_input uuid;
    v_track_stock boolean;
    v_item jsonb;
BEGIN
    -- 1. Extraer ID si fue proporcionado (creación vs edición)
    IF p_product ? 'id' AND p_product->>'id' IS NOT NULL AND p_product->>'id' <> '' THEN
        v_id_input := (p_product->>'id')::uuid;
    ELSE
        v_id_input := gen_random_uuid();
    END IF;

    v_track_stock := COALESCE((p_product->>'track_stock')::boolean, false);

    -- 2. Upsert del producto
    INSERT INTO public.products (
        id,
        name,
        description,
        price,
        cost,
        image_url,
        category_id,
        is_active,
        track_stock
    )
    VALUES (
        v_id_input,
        (p_product->>'name')::varchar,
        p_product->>'description',
        COALESCE((p_product->>'price')::numeric, 0),
        COALESCE((p_product->>'cost')::numeric, 0),
        p_product->>'image_url',
        (p_product->>'category_id')::uuid,
        COALESCE((p_product->>'is_active')::boolean, true),
        v_track_stock
    )
    ON CONFLICT (id) DO UPDATE
    SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price = EXCLUDED.price,
        cost = EXCLUDED.cost,
        image_url = EXCLUDED.image_url,
        category_id = EXCLUDED.category_id,
        is_active = EXCLUDED.is_active,
        track_stock = EXCLUDED.track_stock
    RETURNING id INTO v_product_id;

    -- 3. Borrado atómico de la receta previa
    DELETE FROM public.product_recipes
    WHERE product_id = v_product_id;

    -- 4. Si el producto rastrea stock y se enviaron ingredientes, insertarlos
    IF v_track_stock AND p_recipe_items IS NOT NULL AND jsonb_array_length(p_recipe_items) > 0 THEN
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_recipe_items)
        LOOP
            INSERT INTO public.product_recipes (
                product_id,
                ingredient_id,
                quantity_used,
                deduct_stock_automatically
            )
            VALUES (
                v_product_id,
                (v_item->>'ingredient_id')::uuid,
                COALESCE((v_item->>'quantity_used')::numeric, 1),
                COALESCE((v_item->>'deduct_stock_automatically')::boolean, true)
            );
        END LOOP;
    END IF;

    -- 5. Retornar el ID del producto guardado
    RETURN v_product_id;
END;
$function$;
