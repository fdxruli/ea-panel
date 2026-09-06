-- Migration: Prevent global deactivation of shared single-use discounts (like AMIGONUEVO)
-- Individual usage is tracked in customer_discount_usage.
-- Only personal discounts (with specific_customer_id) are deactivated globally.

CREATE OR REPLACE FUNCTION public.record_discount_usage_and_deactivate(p_customer_id uuid, p_discount_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    discount_info record;
BEGIN
    -- Primero, obtener la información del descuento
    SELECT is_single_use, specific_customer_id, requires_referred_status
    INTO discount_info
    FROM public.discounts
    WHERE id = p_discount_id;

    -- Si no existe, salir
    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Inserta el registro de uso por cliente (garantiza uso único por usuario)
    INSERT INTO public.customer_discount_usage (customer_id, discount_id)
    VALUES (p_customer_id, p_discount_id)
    ON CONFLICT DO NOTHING;

    -- Solo desactivar a nivel global si es un cupón personal generado para un cliente específico.
    -- Los cupones de plantilla/globales como bienvenida (AMIGONUEVO) deben permanecer activos
    -- para que otros clientes invitados los puedan usar en su primera compra.
    IF discount_info.is_single_use AND discount_info.specific_customer_id IS NOT NULL THEN
        UPDATE public.discounts
        SET is_active = FALSE
        WHERE id = p_discount_id;
    END IF;

END;
$function$;

UPDATE public.discounts 
SET is_active = TRUE 
WHERE code = 'AMIGONUEVO';
