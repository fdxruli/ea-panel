# Pruebas y Verificación — Módulo "Mi Perfil"

## 1. Pruebas Unitarias Automatizadas

Las pruebas se ejecutan mediante el runner nativo de Node.js (`node --test`):

```bash
node --test tests/customerProfile.test.js
node --test tests/customerAuth.test.js
node --test tests/loyalty.test.js
```

### 1.1 Cobertura de `tests/customerProfile.test.js`
1. **Restricción de categorías de lealtad:** Valida que únicamente se acepten `inicial`, `frecuente` y `vip`.
2. **Cero fugas de datos monetarios:** Inspecciona el esquema devuelto por el servicio de lealtad para garantizar que claves como `total_spent`, `spent`, `gastado`, `saldo`, `deuda` no existan.
3. **Invariante de dirección predeterminada única:** Simula cambios de default verificando que nunca coexistan dos direcciones marcadas como predeterminadas.
4. **Validación de nombre:** Asegura que solo se admitan nombres limpios de longitud válida (2 a 100 caracteres).
5. **Detección de formulario sucio (unsaved changes):** Valida la bandera `isDirty` para advertir antes de descartar cambios.

---

## 2. Pruebas de Seguridad en Base de Datos

### 2.1 Verificación de políticas RLS para `anon`
- Consulta a `pg_policies`:
  - `anon_customers_policies_count`: 0.
  - `anon_address_policies_count`: 0.
- Cualquier llamada de cliente no autenticado a `supabase.from('customers').select('*')` o `supabase.from('customer_addresses').select('*')` retorna 0 filas o error de autorización.

### 2.2 Verificación de unicidad en direcciones predeterminadas
- Consulta de duplicados:
  ```sql
  SELECT count(*) FROM (
    SELECT customer_id FROM customer_addresses WHERE is_default = true GROUP BY customer_id HAVING count(*) > 1
  ) t;
  ```
  Resultado verificado en producción: **0 duplicados**.
- Índice parcial `customer_addresses_single_default_idx` activo y garantizando unicidad transaccional.

### 2.3 Verificación de funciones RPC
- `set_my_default_customer_address`: Rechaza llamadas si el usuario no está autenticado o si intenta marcar una dirección que pertenece a otro cliente.
- `update_my_customer_profile`: Solo actualiza `name`; los campos de sistema (`auth_user_id`, `referrer_id`, etc.) quedan intactos.
- `get_my_loyalty_category`: Devuelve las etiquetas requeridas sin divulgar `total_spent`.

---

## 3. Pruebas de Regresión en Frontend

- **Build de producción:** `npm run build` genera los bundles sin errores.
- **Rutas y catálogo:** `node scripts/validate-product-routes.js` ejecutado con éxito.
- **Flujos de usuario validados:**
  - Login y logout con limpieza de caché.
  - Gestión de perfil y direcciones sin interrupciones.
  - Módulo "Mis pedidos" operando de manera independiente.
