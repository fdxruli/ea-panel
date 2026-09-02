-- Migration: 20260902160000_strict_cash_registers.sql
-- Description: Unicidad de caja abierta por usuario, RPC de apertura segura y enlace con orders
-- Author: Antigravity (ea-panel)

-- ============================================================
-- 1. ÍNDICE ÚNICO: Evitar que un usuario tenga > 1 caja abierta
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_cash_register_per_user
    ON public.cash_registers (opened_by)
    WHERE estado = 'abierta';

-- ============================================================
-- 2. ENLACE DE PEDIDOS A CAJA: Agregar columna caja_id a orders
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'orders' 
          AND column_name = 'caja_id'
    ) THEN
        ALTER TABLE public.orders 
        ADD COLUMN caja_id TEXT REFERENCES public.cash_registers(id) ON DELETE SET NULL;
        
        CREATE INDEX IF NOT EXISTS idx_orders_caja_id ON public.orders(caja_id);
    END IF;
END $$;

-- ============================================================
-- 3. RPC: Apertura atómica y segura de caja
-- ============================================================
CREATE OR REPLACE FUNCTION public.abrir_caja_segura(
    p_id TEXT,
    p_monto_inicial NUMERIC,
    p_opened_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

COMMENT ON FUNCTION public.abrir_caja_segura(TEXT, NUMERIC, UUID) IS
    'Abre de forma atómica una caja para el usuario especificado o devuelve la caja abierta existente.';

GRANT EXECUTE ON FUNCTION public.abrir_caja_segura(TEXT, NUMERIC, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.abrir_caja_segura(TEXT, NUMERIC, UUID) TO service_role;

-- ============================================================
-- 4. HABILITAR SUPABASE REALTIME PARA CAJA Y MOVIMIENTOS
-- ============================================================
DO $$
BEGIN
    -- Agregar a la publicación supabase_realtime si no están presentes
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_registers;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;

        BEGIN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_movements;
        EXCEPTION WHEN duplicate_object THEN
            NULL;
        END;
    END IF;
END $$;
