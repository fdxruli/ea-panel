-- Migration: Add get_active_menu_products RPC
-- Description: Returns all active products for the client menu along with a computed is_out_of_stock boolean
--              based on recipe ingredient stock, in a SECURITY DEFINER function to protect confidential costs/quantities.

CREATE OR REPLACE FUNCTION public.get_active_menu_products()
RETURNS TABLE (
    id uuid,
    name character varying,
    description text,
    price numeric,
    image_url text,
    category_id uuid,
    is_active boolean,
    track_stock boolean,
    created_at timestamp with time zone,
    is_out_of_stock boolean,
    product_images json
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.description,
        p.price,
        p.image_url,
        p.category_id,
        p.is_active,
        p.track_stock,
        p.created_at,
        CASE 
            WHEN p.track_stock = true AND EXISTS (
                SELECT 1
                FROM public.product_recipes rec
                JOIN public.ingredients ing ON rec.ingredient_id = ing.id
                WHERE rec.product_id = p.id
                  AND rec.deduct_stock_automatically = true
                  AND ing.track_inventory = true
                  AND (ing.current_stock < rec.quantity_used OR ing.current_stock <= 0)
            ) THEN true
            ELSE false
        END AS is_out_of_stock,
        COALESCE(
            (
                SELECT json_agg(json_build_object('id', pi.id, 'image_url', pi.image_url))
                FROM public.product_images pi
                WHERE pi.product_id = p.id
            ),
            '[]'::json
        ) AS product_images
    FROM public.products p
    WHERE p.is_active = true
    ORDER BY p.name ASC;
END;
$function$;
