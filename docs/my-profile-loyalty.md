# Limpieza Visual de Lealtad — "Mi Perfil"

## 1. Principio de Cero Métricas Monetarias

En cumplimiento de las reglas del módulo cliente "Mi Perfil":
- **No se muestran importes de dinero:** Ни "Total gastado", ni "Has gastado", ni signos de pesos/dólares, ni balances acumulados.
- **No se muestran estadísticas ambiguas:** Nada que sugiera saldos a favor, deudas o créditos pendientes.
- **No se introducen puntos ni gamificación:** Se preserva el sistema simple basado estrictamente en recurrencia y categorías.

---

## 2. Categorías Oficiales y Etiquetas

Se mantienen únicamente tres categorías:
1. **`inicial`**:
   - Etiqueta: `Cliente Inicial`
   - Badge visual: `🌱 Cliente Inicial`
   - Mensaje de beneficio: `Comienza a disfrutar beneficios.`
2. **`frecuente`**:
   - Etiqueta: `Cliente Frecuente`
   - Badge visual: `⭐ Cliente Frecuente`
   - Mensaje de beneficio: `Obtienes beneficios por tu recurrencia.`
3. **`vip`**:
   - Etiqueta: `Cliente VIP`
   - Badge visual: `👑 Cliente VIP`
   - Mensaje de beneficio: `Accedes a beneficios exclusivos.`

*Nota:* Los emojis se aplican exclusivamente en la capa de presentación de la interfaz (CSS / JSX) y no se guardan en la base de datos.

---

## 3. Arquitectura del Servicio

- Anteriormente, el frontend consultaba la tabla `orders` filtrando por `customerId` y calculaba `total_spent` en JavaScript.
- En la versión actual, el frontend invoca `supabase.rpc('get_my_loyalty_category')` sin parámetros.
- La base de datos calcula internamente la categoría según los umbrales de negocio (gasto y pedidos completados en los últimos 90 días), pero **solo retorna:**
  - `category`: 'inicial' | 'frecuente' | 'vip'
  - `benefit_label`: Texto descriptivo no monetario del beneficio.
  - `condition_label`: Texto descriptivo de vigencia.
- `total_spent` no se envía al navegador en ninguna circunstancia.
