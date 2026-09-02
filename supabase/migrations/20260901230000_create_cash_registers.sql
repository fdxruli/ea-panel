-- Migration: 20260901230000_create_cash_registers.sql
-- Description: Tablas para control de caja por cajero con auditoria de usuario
-- Author: Antigravity (ea-panel)

-- ============================================================
-- TABLE: cash_registers
-- Representa una sesión de caja (apertura → cierre) por cajero.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cash_registers (
    id                    TEXT PRIMARY KEY,

    -- Auditoría de usuario
    opened_by             UUID          REFERENCES public.admins(id) ON DELETE SET NULL,
    closed_by             UUID          REFERENCES public.admins(id) ON DELETE SET NULL,

    -- Montos de caja
    monto_inicial         NUMERIC(12,2) NOT NULL DEFAULT 0,
    monto_cierre          NUMERIC(12,2),
    diferencia            NUMERIC(12,2),

    -- Totales de movimientos en efectivo
    ventas_efectivo       NUMERIC(12,2) NOT NULL DEFAULT 0,
    entradas_efectivo     NUMERIC(12,2) NOT NULL DEFAULT 0,
    salidas_efectivo      NUMERIC(12,2) NOT NULL DEFAULT 0,

    -- Estado y fechas de la sesión
    estado                TEXT          NOT NULL DEFAULT 'abierta'
                              CHECK (estado IN ('abierta', 'cerrada')),
    fecha_apertura        TIMESTAMPTZ   NOT NULL DEFAULT now(),
    fecha_cierre          TIMESTAMPTZ,

    -- Campos de auditoría adicional
    comentarios_auditoria TEXT,
    detalle_cierre        JSONB,
    es_auto_apertura      BOOLEAN       NOT NULL DEFAULT FALSE,

    -- Metadatos de fila
    created_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.cash_registers                       IS 'Sesiones de apertura y cierre de caja por cajero.';
COMMENT ON COLUMN public.cash_registers.id                    IS 'Identificador único de la sesión de caja (generado por la aplicación).';
COMMENT ON COLUMN public.cash_registers.opened_by             IS 'Admin que abrió la caja.';
COMMENT ON COLUMN public.cash_registers.closed_by             IS 'Admin que cerró la caja.';
COMMENT ON COLUMN public.cash_registers.monto_inicial         IS 'Fondo inicial de la caja al momento de apertura.';
COMMENT ON COLUMN public.cash_registers.monto_cierre          IS 'Monto físico contado al cierre.';
COMMENT ON COLUMN public.cash_registers.diferencia            IS 'Diferencia entre el monto esperado y el monto_cierre.';
COMMENT ON COLUMN public.cash_registers.ventas_efectivo       IS 'Total de ventas cobradas en efectivo durante la sesión.';
COMMENT ON COLUMN public.cash_registers.entradas_efectivo     IS 'Total de entradas de efectivo registradas (ajenos a ventas).';
COMMENT ON COLUMN public.cash_registers.salidas_efectivo      IS 'Total de salidas de efectivo registradas.';
COMMENT ON COLUMN public.cash_registers.estado                IS 'Estado de la sesión: abierta | cerrada.';
COMMENT ON COLUMN public.cash_registers.es_auto_apertura      IS 'TRUE si la caja fue abierta automáticamente por el sistema.';
COMMENT ON COLUMN public.cash_registers.detalle_cierre        IS 'JSON libre con el desglose de billetes/monedas al cierre.';

-- ============================================================
-- TABLE: cash_movements
-- Registra cada entrada o salida de efectivo dentro de una
-- sesión de caja (cash_registers).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.cash_movements (
    id              TEXT          PRIMARY KEY,

    -- Relación con la sesión de caja
    caja_id         TEXT          NOT NULL
                        REFERENCES public.cash_registers(id) ON DELETE CASCADE,

    -- Tipo y detalle del movimiento
    tipo            TEXT          NOT NULL
                        CHECK (tipo IN ('entrada', 'salida')),
    monto           NUMERIC(12,2) NOT NULL,
    concepto        TEXT          NOT NULL,

    -- Temporalidad y auditoría
    fecha           TIMESTAMPTZ   NOT NULL DEFAULT now(),
    realizado_por   UUID          REFERENCES public.admins(id) ON DELETE SET NULL,

    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.cash_movements                     IS 'Movimientos de efectivo (entradas/salidas) asociados a una sesión de caja.';
COMMENT ON COLUMN public.cash_movements.id                  IS 'Identificador único del movimiento (generado por la aplicación).';
COMMENT ON COLUMN public.cash_movements.caja_id             IS 'Sesión de caja a la que pertenece el movimiento.';
COMMENT ON COLUMN public.cash_movements.tipo                IS 'Dirección del movimiento: entrada | salida.';
COMMENT ON COLUMN public.cash_movements.monto               IS 'Importe del movimiento (siempre positivo; el tipo indica la dirección).';
COMMENT ON COLUMN public.cash_movements.concepto            IS 'Descripción o razón del movimiento.';
COMMENT ON COLUMN public.cash_movements.realizado_por       IS 'Admin que registró el movimiento.';

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_cash_registers_estado
    ON public.cash_registers(estado);

CREATE INDEX IF NOT EXISTS idx_cash_registers_opened_by
    ON public.cash_registers(opened_by);

CREATE INDEX IF NOT EXISTS idx_cash_registers_fecha_apertura
    ON public.cash_registers(fecha_apertura DESC);

CREATE INDEX IF NOT EXISTS idx_cash_movements_caja_id
    ON public.cash_movements(caja_id);

-- ============================================================
-- TRIGGER: auto-actualizar updated_at en cash_registers
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_cash_registers_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_cash_registers_updated_at() IS
    'Trigger function que actualiza updated_at automáticamente antes de cada UPDATE en cash_registers.';

DROP TRIGGER IF EXISTS trg_cash_registers_updated_at ON public.cash_registers;

CREATE TRIGGER trg_cash_registers_updated_at
    BEFORE UPDATE ON public.cash_registers
    FOR EACH ROW
    EXECUTE FUNCTION public.set_cash_registers_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.cash_registers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements   ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- RLS policies: cash_registers
-- ----------------------------------------------------------

DROP POLICY IF EXISTS "cash_registers: authenticated can select" ON public.cash_registers;
CREATE POLICY "cash_registers: authenticated can select"
    ON public.cash_registers
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "cash_registers: authenticated can insert" ON public.cash_registers;
CREATE POLICY "cash_registers: authenticated can insert"
    ON public.cash_registers
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "cash_registers: authenticated can update" ON public.cash_registers;
CREATE POLICY "cash_registers: authenticated can update"
    ON public.cash_registers
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- ----------------------------------------------------------
-- RLS policies: cash_movements
-- ----------------------------------------------------------

DROP POLICY IF EXISTS "cash_movements: authenticated can select" ON public.cash_movements;
CREATE POLICY "cash_movements: authenticated can select"
    ON public.cash_movements
    FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "cash_movements: authenticated can insert" ON public.cash_movements;
CREATE POLICY "cash_movements: authenticated can insert"
    ON public.cash_movements
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- ============================================================
-- GRANTS
-- ============================================================

GRANT SELECT, INSERT, UPDATE ON public.cash_registers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cash_registers TO service_role;

GRANT SELECT, INSERT ON public.cash_movements TO authenticated;
GRANT SELECT, INSERT ON public.cash_movements TO service_role;
