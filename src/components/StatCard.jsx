import React, { memo } from "react";
import styles from '../pages/Dashboard.module.css';

const statHelpTexts = {
    totalProfit: `Son las ganancias que realmente obtuviste después de cubrir los costos de tus productos vendidos.
En pocas palabras: lo que te queda limpio después de vender.`,

    profitMargin: `Muestra qué tan rentable estás siendo.
Es el porcentaje de ganancia que te queda por cada peso que vendes.`,

    totalRevenue: `Representa todo el dinero que has generado con tus ventas completadas.`,

    totalCosts: `Indica cuánto te costó producir o preparar todos los productos que vendiste.`,

    avgOrderValue: `Es el promedio de dinero que gasta un cliente cada vez que te hace un pedido.`,

    pendingOrders: `Son los pedidos que están en proceso o aún no se han completado.`,

    completedOrders: `Muestra los pedidos completados exitosamente.`,

    canceledOrders: `Son los pedidos que fueron cancelados.
También te muestra qué porcentaje representan del total de tus pedidos.`,

    totalCustomers: `Son los clientes únicos que tienes registrados en el sistema.`
};

const StatCard = memo(({ title, value, helpKey, icon, color, subtitle, delta }) => {
    const helpText = helpKey ? statHelpTexts[helpKey] : null;
    const deltaValue = delta !== undefined ? delta : null;
    const isPositiveDelta = deltaValue !== null && deltaValue >= 0;

    return (
        <div className={styles.statCard}>
            <div className={styles.statInfo}>
                <span className={styles.statTitle}>
                    {title}
                    {helpKey && (
                        <span className={styles.helpIconWrapper} tabIndex={0} role="button" aria-label={`Ayuda sobre ${title}`}>
                            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                                <circle
                                    cx="10"
                                    cy="10"
                                    r="8"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                />
                                <text
                                    x="10"
                                    y="14"
                                    textAnchor="middle"
                                    fill="currentColor"
                                    fontSize="12"
                                    fontFamily="Arial"
                                    fontWeight="bold"
                                >?</text>
                            </svg>
                            {helpText && (
                                <span className={styles.tooltip}>{helpText}</span>
                            )}
                        </span>
                    )}
                </span>
                <span className={styles.statValue}>{value}</span>
                {subtitle && <span className={styles.statSubtitle}>{subtitle}</span>}
                {deltaValue !== null && deltaValue !== undefined && (
                    <span className={`${styles.statEvolution} ${isPositiveDelta ? styles.positive : styles.negative}`}>
                        {isPositiveDelta ? '↑' : '↓'} {Math.abs(deltaValue).toFixed(1)}% vs periodo anterior
                    </span>
                )}
            </div>
            <div className={styles.iconWrapper} style={{ backgroundColor: color }}>
                {icon}
            </div>
        </div>
    );
});

StatCard.displayName = 'StatCard';

export { StatCard };
