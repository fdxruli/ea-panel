import React, { useMemo, useState } from 'react';
import styles from './DiscountImpactSimulator.module.css';
import { AlertTriangle, CheckCircle, TrendingDown, TrendingUp, DollarSign, Percent, Info, ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Live Financial Impact Simulator for Discounts.
 * Previews discount effect on prices, margins, customer savings, and profit health.
 */
export default function DiscountImpactSimulator({
  discount,
  products = [],
  categories = []
}) {
  const [customTicket, setCustomTicket] = useState('150');
  const [showCategoryProducts, setShowCategoryProducts] = useState(false);

  const { type, target_id, value, discount_mode } = discount;
  const numValue = parseFloat(value) || 0;
  const isFixed = discount_mode === 'fixed';

  // Calculate Product Impact
  const productImpact = useMemo(() => {
    if (type !== 'product' || !target_id) return null;
    const prod = products.find(p => p.id === target_id);
    if (!prod) return null;

    const originalPrice = parseFloat(prod.price) || 0;
    const baseCost = parseFloat(prod.cost) || 0;

    let discountAmount = 0;
    if (isFixed) {
      discountAmount = Math.min(originalPrice, numValue);
    } else {
      const pct = Math.min(100, Math.max(0, numValue));
      discountAmount = originalPrice * (pct / 100);
    }

    const finalPrice = Math.max(0, originalPrice - discountAmount);
    const effectivePct = originalPrice > 0 ? (discountAmount / originalPrice) * 100 : 0;

    const originalMargin = originalPrice > 0 ? originalPrice - baseCost : 0;
    const originalMarginPct = originalPrice > 0 ? (originalMargin / originalPrice) * 100 : 0;

    const newMargin = finalPrice - baseCost;
    const newMarginPct = finalPrice > 0 ? (newMargin / finalPrice) * 100 : 0;

    const isLoss = finalPrice < baseCost;
    const isTightMargin = !isLoss && newMarginPct < 20;

    return {
      product: prod,
      originalPrice,
      baseCost,
      discountAmount,
      finalPrice,
      effectivePct,
      originalMargin,
      originalMarginPct,
      newMargin,
      newMarginPct,
      isLoss,
      isTightMargin
    };
  }, [type, target_id, numValue, isFixed, products]);

  // Calculate Category Impact
  const categoryImpact = useMemo(() => {
    if (type !== 'category' || !target_id) return null;
    const cat = categories.find(c => c.id === target_id);
    const categoryProducts = products.filter(p => p.category_id === target_id);

    if (categoryProducts.length === 0) {
      return {
        category: cat,
        count: 0,
        items: []
      };
    }

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let minFinal = Infinity;
    let maxFinal = -Infinity;
    let lossCount = 0;

    const items = categoryProducts.map(prod => {
      const originalPrice = parseFloat(prod.price) || 0;
      const baseCost = parseFloat(prod.cost) || 0;

      let discountAmount = 0;
      if (isFixed) {
        discountAmount = Math.min(originalPrice, numValue);
      } else {
        const pct = Math.min(100, Math.max(0, numValue));
        discountAmount = originalPrice * (pct / 100);
      }

      const finalPrice = Math.max(0, originalPrice - discountAmount);
      const newMargin = finalPrice - baseCost;
      const newMarginPct = finalPrice > 0 ? (newMargin / finalPrice) * 100 : 0;
      const isLoss = finalPrice < baseCost;

      if (isLoss) lossCount++;
      if (originalPrice < minPrice) minPrice = originalPrice;
      if (originalPrice > maxPrice) maxPrice = originalPrice;
      if (finalPrice < minFinal) minFinal = finalPrice;
      if (finalPrice > maxFinal) maxFinal = finalPrice;

      return {
        product: prod,
        originalPrice,
        baseCost,
        discountAmount,
        finalPrice,
        newMargin,
        newMarginPct,
        isLoss
      };
    });

    return {
      category: cat,
      count: categoryProducts.length,
      minPrice: minPrice === Infinity ? 0 : minPrice,
      maxPrice: maxPrice === -Infinity ? 0 : maxPrice,
      minFinal: minFinal === Infinity ? 0 : minFinal,
      maxFinal: maxFinal === -Infinity ? 0 : maxFinal,
      lossCount,
      items
    };
  }, [type, target_id, numValue, isFixed, categories, products]);

  // Calculate Global Benchmark Impact
  const globalImpact = useMemo(() => {
    if (type !== 'global') return null;

    const benchmarks = [100, 250, 500].map(ticket => {
      let discountAmount = 0;
      if (isFixed) {
        discountAmount = Math.min(ticket, numValue);
      } else {
        const pct = Math.min(100, Math.max(0, numValue));
        discountAmount = ticket * (pct / 100);
      }
      const finalTotal = ticket - discountAmount;
      const effectivePct = ticket > 0 ? (discountAmount / ticket) * 100 : 0;
      return { ticket, discountAmount, finalTotal, effectivePct };
    });

    const parsedCustom = parseFloat(customTicket) || 0;
    let customDiscount = 0;
    if (isFixed) {
      customDiscount = Math.min(parsedCustom, numValue);
    } else {
      const pct = Math.min(100, Math.max(0, numValue));
      customDiscount = parsedCustom * (pct / 100);
    }
    const customFinal = Math.max(0, parsedCustom - customDiscount);

    return {
      benchmarks,
      customTicket: parsedCustom,
      customDiscount,
      customFinal
    };
  }, [type, numValue, isFixed, customTicket]);

  if (!numValue || numValue <= 0) {
    return (
      <div className={styles.placeholderCard}>
        <Info size={20} className={styles.placeholderIcon} />
        <div>
          <h4>Simulador de Impacto en Tiempo Real</h4>
          <p>Ingresa un valor para ver cómo afectará los precios, el margen de ganancia y la rentabilidad.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.simulatorContainer}>
      <div className={styles.simulatorHeader}>
        <div className={styles.simulatorTitle}>
          <span className={styles.simulatorBadge}>Simulación en vivo</span>
          <h3>Impacto Financiero del Descuento</h3>
        </div>
        <span className={styles.modeTag}>
          {isFixed ? <DollarSign size={14} /> : <Percent size={14} />}
          {isFixed ? `Monto fijo: $${numValue.toFixed(2)}` : `${numValue}% de descuento`}
        </span>
      </div>

      {/* IMPACTO EN PRODUCTO ESPECÍFICO */}
      {type === 'product' && productImpact && (
        <div className={styles.productImpactBox}>
          {productImpact.isLoss && (
            <div className={styles.alertDanger}>
              <AlertTriangle size={20} className={styles.alertIcon} />
              <div>
                <strong>¡Alerta de Pérdida Financiera!</strong>
                <p>
                  El precio final (${productImpact.finalPrice.toFixed(2)}) queda por debajo del costo de elaboración (${productImpact.baseCost.toFixed(2)}). Estarías perdiendo ${(productImpact.baseCost - productImpact.finalPrice).toFixed(2)} por cada unidad vendida.
                </p>
              </div>
            </div>
          )}

          {!productImpact.isLoss && productImpact.isTightMargin && (
            <div className={styles.alertWarning}>
              <AlertTriangle size={20} className={styles.alertIcon} />
              <div>
                <strong>Margen Reducido ({productImpact.newMarginPct.toFixed(1)}%)</strong>
                <p>El producto sigue siendo rentable, pero el margen de ganancia restante es muy bajo.</p>
              </div>
            </div>
          )}

          {!productImpact.isLoss && !productImpact.isTightMargin && (
            <div className={styles.alertSuccess}>
              <CheckCircle size={20} className={styles.alertIcon} />
              <div>
                <strong>Descuento Rentable ({productImpact.newMarginPct.toFixed(1)}% margen)</strong>
                <p>El producto mantiene un margen de ganancia saludable sobre su costo base.</p>
              </div>
            </div>
          )}

          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Precio Original</span>
              <span className={styles.metricValue}>${productImpact.originalPrice.toFixed(2)}</span>
              <span className={styles.metricSub}>Costo: ${productImpact.baseCost.toFixed(2)}</span>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Ahorro Cliente</span>
              <span className={`${styles.metricValue} ${styles.savingColor}`}>
                -${productImpact.discountAmount.toFixed(2)}
              </span>
              <span className={styles.metricSub}>{productImpact.effectivePct.toFixed(1)}% de ahorro</span>
            </div>

            <div className={styles.metricCardHighlight}>
              <span className={styles.metricLabel}>Precio Final Cliente</span>
              <span className={styles.metricBigValue}>${productImpact.finalPrice.toFixed(2)}</span>
              <span className={styles.metricSub}>Lo que paga el cliente</span>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Ganancia Neta / Unidad</span>
              <span className={`${styles.metricValue} ${productImpact.newMargin >= 0 ? styles.positiveMargin : styles.negativeMargin}`}>
                ${productImpact.newMargin.toFixed(2)}
              </span>
              <span className={styles.metricSub}>
                Antes: ${productImpact.originalMargin.toFixed(2)} ({productImpact.originalMarginPct.toFixed(1)}%)
              </span>
            </div>
          </div>
        </div>
      )}

      {/* IMPACTO EN CATEGORÍA */}
      {type === 'category' && categoryImpact && (
        <div className={styles.categoryImpactBox}>
          {categoryImpact.lossCount > 0 && (
            <div className={styles.alertDanger}>
              <AlertTriangle size={20} className={styles.alertIcon} />
              <div>
                <strong>¡Atención! {categoryImpact.lossCount} producto(s) quedan por debajo de su costo</strong>
                <p>
                  Con un descuento de {isFixed ? `$${numValue}` : `${numValue}%`}, algunos productos de esta categoría se venderían con pérdidas.
                </p>
              </div>
            </div>
          )}

          <div className={styles.metricsGrid}>
            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Productos Afectados</span>
              <span className={styles.metricValue}>{categoryImpact.count}</span>
              <span className={styles.metricSub}>En {categoryImpact.category?.name || 'Categoría'}</span>
            </div>

            <div className={styles.metricCard}>
              <span className={styles.metricLabel}>Rango Precios Original</span>
              <span className={styles.metricValue}>
                ${categoryImpact.minPrice.toFixed(2)} - ${categoryImpact.maxPrice.toFixed(2)}
              </span>
              <span className={styles.metricSub}>Sin descuento</span>
            </div>

            <div className={styles.metricCardHighlight}>
              <span className={styles.metricLabel}>Rango Precios Final</span>
              <span className={styles.metricBigValue}>
                ${categoryImpact.minFinal.toFixed(2)} - ${categoryImpact.maxFinal.toFixed(2)}
              </span>
              <span className={styles.metricSub}>Con descuento aplicado</span>
            </div>
          </div>

          {categoryImpact.items.length > 0 && (
            <div className={styles.categoryProductsPreview}>
              <button
                type="button"
                className={styles.toggleCategoryListBtn}
                onClick={() => setShowCategoryProducts(!showCategoryProducts)}
              >
                {showCategoryProducts ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                {showCategoryProducts ? 'Ocultar desglose de productos' : `Ver impacto en los ${categoryImpact.items.length} productos`}
              </button>

              {showCategoryProducts && (
                <div className={styles.previewTableWrapper}>
                  <table className={styles.previewTable}>
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Original</th>
                        <th>Descuento</th>
                        <th>Precio Final</th>
                        <th>Costo</th>
                        <th>Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {categoryImpact.items.map(item => (
                        <tr key={item.product.id} className={item.isLoss ? styles.rowLoss : ''}>
                          <td>
                            <strong>{item.product.name}</strong>
                            {item.isLoss && <span className={styles.lossBadge}>Pérdida</span>}
                          </td>
                          <td>${item.originalPrice.toFixed(2)}</td>
                          <td className={styles.savingColor}>-${item.discountAmount.toFixed(2)}</td>
                          <td><strong>${item.finalPrice.toFixed(2)}</strong></td>
                          <td>${item.baseCost.toFixed(2)}</td>
                          <td className={item.newMargin >= 0 ? styles.positiveMargin : styles.negativeMargin}>
                            ${item.newMargin.toFixed(2)} ({item.newMarginPct.toFixed(0)}%)
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* IMPACTO GLOBAL (TODA LA TIENDA) */}
      {type === 'global' && globalImpact && (
        <div className={styles.globalImpactBox}>
          <p className={styles.globalDesc}>
            Este cupón aplica a cualquier pedido en la tienda. A continuación se proyecta el ahorro en compras modelo:
          </p>

          <div className={styles.benchmarksGrid}>
            {globalImpact.benchmarks.map(b => (
              <div key={b.ticket} className={styles.benchmarkCard}>
                <div className={styles.benchmarkHeader}>
                  <span className={styles.benchmarkTicket}>Carrito de ${b.ticket}</span>
                  <span className={styles.benchmarkPct}>-{b.effectivePct.toFixed(1)}%</span>
                </div>
                <div className={styles.benchmarkDetail}>
                  <span>Descuento: <strong>-${b.discountAmount.toFixed(2)}</strong></span>
                  <span>Total a cobrar: <strong className={styles.finalTotal}>${b.finalTotal.toFixed(2)}</strong></span>
                </div>
              </div>
            ))}
          </div>

          <div className={styles.customTicketBox}>
            <label htmlFor="customTicketInput">Probar con otro monto de carrito:</label>
            <div className={styles.customTicketInputGroup}>
              <span>$</span>
              <input
                id="customTicketInput"
                type="number"
                min="1"
                value={customTicket}
                onChange={(e) => setCustomTicket(e.target.value)}
                placeholder="150"
              />
              <div className={styles.customTicketResult}>
                <span>Descuento: <strong>-${globalImpact.customDiscount.toFixed(2)}</strong></span>
                <span>Total: <strong className={styles.finalTotal}>${globalImpact.customFinal.toFixed(2)}</strong></span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
