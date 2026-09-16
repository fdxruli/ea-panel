# Gestión Segura y Atómica de Direcciones — "Mi Perfil"

## 1. Problema Anterior

En la versión previa de `MyProfile.jsx`, fijar una dirección como predeterminada se realizaba con dos peticiones HTTP sucesivas desde el navegador:

```javascript
await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', customerId);
await supabase.from('customer_addresses').update({ is_default: true }).eq('id', addressId);
```

**Riesgos identificados:**
1. Si la segunda petición fallaba (desconexión, error de red, cierre de pestaña), el cliente quedaba sin ninguna dirección predeterminada.
2. Si el usuario pulsaba rápidamente dos veces o con dos dispositivos, podían crearse múltiples direcciones predeterminadas simultáneas.
3. La auditoría en producción demostró que ya existían 3 clientes con 2 direcciones predeterminadas cada uno debido a este diseño.

---

## 2. Solución Transaccional Atómica

Se implementó la RPC `public.set_my_default_customer_address(p_address_id uuid)`:

```sql
CREATE OR REPLACE FUNCTION public.set_my_default_customer_address(p_address_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_customer_id uuid;
  v_address_exists boolean;
BEGIN
  v_customer_id := public.require_my_customer_id();

  SELECT EXISTS (
    SELECT 1 FROM public.customer_addresses
    WHERE id = p_address_id AND customer_id = v_customer_id
  ) INTO v_address_exists;

  IF NOT v_address_exists THEN
    RAISE EXCEPTION 'address_not_found_or_forbidden' USING errcode = 'P0001';
  END IF;

  UPDATE public.customer_addresses
  SET is_default = false
  WHERE customer_id = v_customer_id AND is_default = true;

  UPDATE public.customer_addresses
  SET is_default = true
  WHERE id = p_address_id AND customer_id = v_customer_id;
END;
$$;
```

**Ventajas:**
1. Todo se ejecuta en una sola transacción en el motor Postgres.
2. Verifica autorización del cliente mediante `require_my_customer_id()`.
3. Es imposible que queden múltiples direcciones predeterminadas o que se modifique una dirección ajena.

---

## 3. Índice Único Parcial

Para blindar la integridad a nivel de base de datos de cara al futuro:
```sql
CREATE UNIQUE INDEX customer_addresses_single_default_idx
ON public.customer_addresses (customer_id)
WHERE is_default = true;
```

**Normalización no destructiva ejecutada:**
Antes de crear el índice, se ejecutó una sentencia que conservó como default la dirección más reciente (`created_at DESC`) y desmarcó las anteriores sin borrar ninguna fila de dirección.
