# Consistencia de Identidad y Gestión de Caché — "Mi Perfil"

## 1. Identidad Canónica

Para garantizar consistencia y prevenir fugas de identidad o sobrescritura con sesiones obsoletas, se adoptó una única fuente de verdad:

- **Fuente canónica:** `CustomerContext` expone `canonicalCustomer` (`customer`).
- **Desacoplamiento:** `MyProfile.jsx` ya no depende de `UserDataContext`.
- **Prevalencia:** `UserDataContext` no tiene potestad para sobrescribir los datos de identidad de `CustomerContext`.
- **Claves de almacenamiento local:** `localStorage.customer_phone` y derivados solo se utilizan como soporte legacy para precarga de formulario, nunca como autoridad de sesión.

---

## 2. Prevención de Condiciones de Carrera y Respuestas Tardías

En los hooks especializados:
- **`useCustomerProfile`**: Utiliza `requestIdRef` para registrar cada petición de actualización. Si una respuesta asíncrona llega después de que el usuario haya iniciado otra operación o cambiado de estado, la respuesta desfasada es descartada silenciosamente.
- **`useCustomerAddresses`**: Utiliza `fetchIdRef` para serializar la recarga de direcciones tras operaciones de guardado o eliminación.
- **`useLoyalty`**: Utiliza un mapa en memoria indexado por `activeCustomerId`. Ante logout o cambio de usuario, se ejecuta `clearLoyaltyCache()` invalidando los datos de inmediato.

---

## 3. Separación de Contextos y Cargas

Anteriormente, visitar la pantalla de perfil implicaba la ejecución de:
```sql
SELECT *, order_items(*, products(*)) FROM orders WHERE customer_id = ...
```
Esto causaba:
- Descarga masiva de datos no relacionados con el perfil.
- Mayor latencia inicial y desperdicio de transferencia.
- Acoplamiento con el ciclo de vida de "Mis pedidos".

Con la nueva arquitectura:
- `MyProfile` únicamente carga perfil (`useCustomerProfile`), direcciones (`useCustomerAddresses`) y lealtad (`useLoyalty`).
- El historial de órdenes queda aislado en `MyOrders.jsx`.
