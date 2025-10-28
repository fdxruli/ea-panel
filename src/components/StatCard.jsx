import React, { useState, memo } from "react";
import styles from '../pages/Dashboard.module.css';

const statHelpTexts = {
  totalProfit: `
Son las ganancias que realmente obtuviste después de cubrir los costos de tus productos vendidos. 
En pocas palabras: lo que te queda limpio después de vender.
`,

  profitMargin: `
Muestra qué tan rentable estás siendo. 
Es el porcentaje de ganancia que te queda por cada peso que vendes.
`,

  totalRevenue: `
Representa todo el dinero que has generado con tus ventas completadas.
`,

  totalCosts: `
Indica cuánto te costó producir o preparar todos los productos que vendiste.
`,

  avgOrderValue: `
Es el promedio de dinero que gasta un cliente cada vez que te hace un pedido.
`,

  pendingOrders: `
Son los pedidos que están en proceso o aún no se han completado.
`,

  completedOrders: `
Muestra cuántos pedidos se han completado exitosamente.
`,

  canceledOrders: `
Son los pedidos que fueron cancelados. 
También te muestra qué porcentaje representan del total de tus pedidos.
`,

  totalCustomers: `
Son los clientes únicos que tienes registrados en el sistema.
`
};

const StatCard = memo(({ title, value, helpKey, icon, color, evolution, subtitle, debugInfo }) => {
    const [showHelp, setShowHelp] = useState(false);

    return (
        <>
            <div className={styles.statCard}>
                <div className={styles.statInfo}>
                    <span className={styles.statTitle}>{title}</span>
                    <span className={styles.statValue}>{value}</span>
                    {subtitle && <span className={styles.statSubtitle}>{subtitle}</span>}
                    {evolution && <span className={styles.statEvolution}>{evolution}</span>}
                </div>
                <div className={styles.iconWrapper} style={{ backgroundColor: color }}>
                    {icon}
                </div>
                {helpKey && (
                    <button
                        className={styles.helpIcon}
                        title="Ayuda sobre la métrica"
                        onClick={() => setShowHelp(true)}
                    >
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <circle
                                cx="10"
                                cy="10"
                                r="9"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            />
                            <text
                                x="10"
                                y="14"
                                textAnchor="middle"
                                fill="currentColor"
                                fontSize="13"
                                fontFamily="Arial"
                                fontWeight="bold"
                            >?</text>
                        </svg>
                    </button>
                )}
            </div>
            
            {showHelp && helpKey && (
                <div className={styles.modalOverlay} onClick={() => setShowHelp(false)}>
                    <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>{title}</h3>
                            <button 
                                className={styles.modalClose}
                                onClick={() => setShowHelp(false)}
                            >
                                ✕
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <pre>{statHelpTexts[helpKey]}</pre>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
});

export { StatCard };
