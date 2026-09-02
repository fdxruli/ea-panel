# Reporte Técnico: Endurecimiento de Caja y Control Multi-Dispositivo en Supabase

**Fecha de Ejecución:** 02 de Septiembre de 2026  
**Proyecto Supabase:** `xvstqhvooabljhhfmuas`  
**Migración Aplicada:** [`supabase/migrations/20260902160000_strict_cash_registers.sql`](file:///c:/dev/ea-panel/supabase/migrations/20260902160000_strict_cash_registers.sql)

---

## 1. Contexto y Objetivos
Para responder a los requerimientos de control riguroso de dinero y soporte multi-dispositivo (ej. cajero o administrador que abre su turno en una tablet/PC de mostrador e inicia sesión después en un teléfono u otra computadora), se aplicó una serie de restricciones e integraciones a nivel de PostgreSQL para:
1. **Garantizar que una caja abierta sea única por usuario**: Si un usuario tiene un turno abierto en un dispositivo y se mueve a otro, el segundo dispositivo reconoce y adopta automáticamente el turno abierto sin permitir cajas duplicadas ni descuadres.
2. **Vincular cobros de pedidos (`orders`) con la caja**: Trazabilidad completa para saber qué pedidos fueron cobrados en qué turno de caja.
3. **Sincronización en Tiempo Real (Realtime)**: Difusión instantánea de aperturas, movimientos y cierres entre todos los dispositivos activos.
4. **Soporte para Arqueo Ciego y Desglose de Moneda**: Almacenamiento estructurado del desglose de billetes y monedas contados.

---

## 2. Modificaciones al Esquema de Base de Datos

### A. Restricción de Unicidad de Caja Abierta
Se implementó un índice único condicional (parcial) en la tabla `public.cash_registers`:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_cash_register_per_user 
ON public.cash_registers (opened_by) 
WHERE estado = 'abierta';
```
* **Efecto:** Ningún cajero o administrador puede tener más de una caja con `estado = 'abierta'` simultáneamente. Cualquier intento de doble apertura es rechazado a nivel de motor de base de datos.

### B. Enlace entre Pedidos (`orders`) y Turno de Caja (`cash_registers`)
Se agregó la columna `caja_id` y su índice de búsqueda en la tabla `public.orders`:
```sql
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS caja_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_caja_id ON public.orders(caja_id);
```
* **Efecto:** Cuando un pedido completado es cobrado en mostrador o entrega, su identificador de caja queda registrado, permitiendo conciliar ventas físicas con pedidos en línea.

### C. Soporte para Auditoría de Cierre
Se aseguró la existencia de la columna `detalle_cierre` de tipo `jsonb`:
```sql
ALTER TABLE public.cash_registers 
ADD COLUMN IF NOT EXISTS detalle_cierre jsonb DEFAULT NULL;
```
* **Efecto:** Almacena el desglose exacto de billetes (\$1,000, \$500, \$200, \$100, \$50, \$20) y monedas (\$20, \$10, \$5, \$2, \$1, \$0.50) contados durante el arqueo a ciegas.

---

## 3. Función RPC Atómica: `public.abrir_caja_segura`

Para evitar condiciones de carrera cuando el usuario abre la aplicación en múltiples pestañas o dispositivos simultáneamente, se creó la función almacenada con permisos `SECURITY DEFINER`:

```sql
CREATE OR REPLACE FUNCTION public.abrir_caja_segura(
    p_id uuid,
    p_monto_inicial numeric,
    p_opened_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caja RECORD;
    v_existing_id uuid;
BEGIN
    -- 1. Verificar si ya existe una caja abierta para este usuario
    SELECT id INTO v_existing_id
    FROM public.cash_registers
    WHERE opened_by = p_opened_by AND estado = 'abierta'
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
        SELECT cr.*, a.name as opened_by_name
        INTO v_caja
        FROM public.cash_registers cr
        LEFT JOIN public.admins a ON a.id = cr.opened_by
        WHERE cr.id = v_existing_id;

        RETURN jsonb_build_object(
            'success', true,
            'caja', to_jsonb(v_caja),
            'code', 'ALREADY_OPEN'
        );
    END IF;

    -- 2. Si no existe, insertar de forma atómica
    BEGIN
        INSERT INTO public.cash_registers (
            id,
            opened_by,
            monto_inicial,
            fecha_apertura,
            estado
        ) VALUES (
            p_id,
            p_opened_by,
            p_monto_inicial,
            now(),
            'abierta'
        )
        RETURNING * INTO v_caja;

        RETURN jsonb_build_object(
            'success', true,
            'caja', to_jsonb(v_caja),
            'code', 'OPENED'
        );
    EXCEPTION
        WHEN unique_violation THEN
            -- Manejo de concurrencia: si otro proceso abrió la caja milisegundos antes
            SELECT cr.*, a.name as opened_by_name
            INTO v_caja
            FROM public.cash_registers cr
            LEFT JOIN public.admins a ON a.id = cr.opened_by
            WHERE cr.opened_by = p_opened_by AND cr.estado = 'abierta'
            LIMIT 1;

            RETURN jsonb_build_object(
                'success', true,
                'caja', to_jsonb(v_caja),
                'code', 'ALREADY_OPEN'
            );
    END;
END;
$$;
```

---

## 4. Publicación en Supabase Realtime

Se agregaron las tablas de caja a la publicación `supabase_realtime` para que los cambios de estado se reciban vía WebSocket en los clientes frontend:

```sql
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'cash_registers'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_registers;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
          AND schemaname = 'public' 
          AND tablename = 'cash_movements'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.cash_movements;
    END IF;
END $$;
```

---

## 5. Verificación en Producción
- Migración aplicada y verificada contra Supabase.
- Pruebas de inserción y captura de unicidad validadas exitosamente.
- Frontend empaquetado y listo para consumir la nueva infraestructura.
