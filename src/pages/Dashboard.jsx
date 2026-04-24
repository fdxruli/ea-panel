import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import { supabase } from "../lib/supabaseClient";
import { useAlert } from "../context/AlertContext";
import styles from './Dashboard.module.css';
import { subscribeToTables } from "../lib/sharedAdminRealtime";
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement } from 'chart.js';
import { StatCard } from "../components/StatCard";
import { exportToCSV } from "../utils/exportUtils";
import { useAdminCache } from "../hooks/useAdminCache";
import DashboardSkeleton from "../components/DashboardSkeleton";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

// ==================== CONSTANTS ====================
const CST_OFFSET_HOURS = -6;
const EMPTY_STATE_DATA = {
    profitableProducts: [],
    recentOrders: [],
    totalProfit: 0,
    totalRevenue: 0,
    totalCosts: 0,
    profitMargin: 0,
    avgOrderValue: 0,
    totalCustomers: 0,
    pendingOrders: 0,
    completedOrders: 0,
    canceledOrders: 0
};

// ==================== FORMATTERS ====================
const currencyFormatter = new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
});

const formatCurrency = (value) => currencyFormatter.format(value || 0);

// ==================== HELPER FUNCTIONS ====================
const getInitialDateRange = () => {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 30);
    return {
        startDateStr: start.toISOString().split('T')[0],
        endDateStr: end.toISOString().split('T')[0],
        startIso: start.toISOString(),
        endIso: end.toISOString()
    };
};

/**
 * Calculates CST (Chiapas, Mexico) timezone boundaries for a given date string.
 * Returns ISO strings representing 00:00:00 and 23:59:59.999 in CST.
 * This ensures midnight orders (1-4 AM) are not lost during UTC conversion.
 */
const getCSTDateBoundaries = (dateStr, isEnd = false) => {
    if (!dateStr) return null;

    const [year, month, day] = dateStr.split('-').map(Number);

    const cstDate = new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
    cstDate.setUTCHours(0 - CST_OFFSET_HOURS, 0, 0, 0);

    if (isEnd) {
        cstDate.setUTCHours(23, 59, 59, 999);
    }

    return cstDate.toISOString();
};

// ==================== GRÁFICOS ====================
const ProfitabilityChart = memo(({ profitData }) => {
    const chartData = useMemo(() => ({
        labels: profitData.map(item => item.name.length > 15 ? item.name.substring(0, 12) + '...' : item.name),
        datasets: [
            {
                label: 'Ingresos',
                data: profitData.map(item => item.revenue),
                backgroundColor: 'rgba(46, 204, 113, 0.6)',
                borderColor: 'rgba(46, 204, 113, 1)',
                borderWidth: 1
            },
            {
                label: 'Costos',
                data: profitData.map(item => item.totalCost),
                backgroundColor: 'rgba(231, 76, 60, 0.6)',
                borderColor: 'rgba(231, 76, 60, 1)',
                borderWidth: 1
            },
            {
                label: 'Ganancia',
                data: profitData.map(item => item.profit),
                backgroundColor: 'rgba(52, 152, 219, 0.6)',
                borderColor: 'rgba(52, 152, 219, 1)',
                borderWidth: 1
            }
        ],
    }), [profitData]);

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { position: 'top' },
            tooltip: {
                animation: false,
                callbacks: {
                    label: context => `${context.dataset.label || ''}: ${formatCurrency(context.parsed.y)}`,
                    afterBody: tooltipItems => {
                        const product = profitData[tooltipItems[0].dataIndex];
                        return [
                            `Margen: ${product.marginPercent}%`,
                            `Cantidad vendida: ${product.quantity}`
                        ];
                    }
                }
            }
        },
        scales: {
            x: { ticks: { maxRotation: 45, minRotation: 45 } },
            y: {
                beginAtZero: true,
                ticks: {
                    callback: value => formatCurrency(value).replace('$', '')
                }
            }
        }
    }), [profitData]);

    return <Bar data={chartData} options={options} />;
});
ProfitabilityChart.displayName = 'ProfitabilityChart';

const ProfitMarginChart = memo(({ profitData }) => {
    const chartData = useMemo(() => ({
        labels: profitData.map(item => item.name.length > 15 ? item.name.substring(0, 12) + '...' : item.name),
        datasets: [{
            data: profitData.map(item => item.marginPercent),
            backgroundColor: profitData.map(item => {
                if (item.marginPercent >= 50) return '#2ecc71';
                if (item.marginPercent >= 25) return '#f1c40f';
                if (item.marginPercent >= 0) return '#e67e22';
                return '#e74c3c';
            }),
            borderColor: 'var(--bg-secondary)',
            borderWidth: 2,
        }],
    }), [profitData]);

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                animation: false,
                callbacks: {
                    label: context => {
                        const product = profitData[context.dataIndex];
                        return [
                            `Margen: ${context.parsed}%`,
                            `Ganancia: ${formatCurrency(product.profit)}`,
                            `Vendidos: ${product.quantity}`
                        ];
                    }
                }
            }
        }
    }), [profitData]);

    return <Doughnut data={chartData} options={options} />;
});
ProfitMarginChart.displayName = 'ProfitMarginChart';

const DownloadIcon = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
));
DownloadIcon.displayName = 'DownloadIcon';

const EmptyStateIcon = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
));
EmptyStateIcon.displayName = 'EmptyStateIcon';

// ==================== COMPONENTE PRINCIPAL ====================
export default function Dashboard() {
    const { showAlert } = useAlert();
    const [filterRange, setFilterRange] = useState(() => {
        const initDates = getInitialDateRange();
        return { start: initDates.startIso, end: initDates.endIso };
    });
    const [startDate, setStartDate] = useState(() => getInitialDateRange().startDateStr);
    const [endDate, setEndDate] = useState(() => getInitialDateRange().endDateStr);
    const [showDateFilter, setShowDateFilter] = useState(false);

    const cacheKey = useMemo(() => `dashboard_stats_${filterRange.start}_${filterRange.end}`, [filterRange]);

    const fetchDashboardStats = useCallback(async () => {
        const { data, error } = await supabase.rpc('get_advanced_dashboard_stats', {
            p_start_date: filterRange.start,
            p_end_date: filterRange.end
        });
        if (error) throw error;
        return { data };
    }, [filterRange]);

    const {
        data: statsRaw,
        isLoading,
        isError,
        invalidate
    } = useAdminCache(cacheKey, fetchDashboardStats, {
        ttl: 60 * 1000,
        staleWhileRevalidate: true
    });

    useEffect(() => {
        let timeoutId = null;

        const handleRealtimeChange = () => {
            // Limitador (Throttle): Si ya hay una actualización programada, ignoramos los nuevos eventos.
            // Esto agrupa los múltiples inserts (ej. 1 order + 5 order_items) en una sola llamada RPC.
            if (!timeoutId) {
                timeoutId = setTimeout(() => {
                    invalidate();
                    timeoutId = null;
                }, 15000); // El dashboard se actualizará máximo 1 vez cada 15 segundos
            }
        };

        const unsubscribe = subscribeToTables(['orders', 'order_items', 'products'], handleRealtimeChange);

        return () => {
            unsubscribe();
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [invalidate]);

    const handleFilterApply = useCallback(() => {
        if (startDate && endDate && endDate < startDate) {
            showAlert('La fecha de fin no puede ser anterior a la fecha de inicio.', 'error');
            return;
        }

        const utcStart = getCSTDateBoundaries(startDate, false);
        const utcEnd = getCSTDateBoundaries(endDate, true);

        setFilterRange({ start: utcStart, end: utcEnd });
        setShowDateFilter(false);
    }, [startDate, endDate, showAlert]);

    const handleFilterClear = useCallback(() => {
        const resetDates = getInitialDateRange();
        setStartDate(resetDates.startDateStr);
        setEndDate(resetDates.endDateStr);
        setFilterRange({ start: resetDates.startIso, end: resetDates.endIso });
    }, []);

    const stats = statsRaw || EMPTY_STATE_DATA;
    const profitableProducts = useMemo(() => stats.profitableProducts || [], [stats]);
    const recentOrders = useMemo(() => stats.recentOrders || [], [stats]);

    const hasData = useMemo(() => {
        return profitableProducts.length > 0 || recentOrders.length > 0 || (stats.totalRevenue || 0) > 0;
    }, [profitableProducts, recentOrders, stats.totalRevenue]);

    const handleExportProfitability = useCallback(() => {
        const dataToExport = profitableProducts.map(p => ({
            'Producto': p.name,
            'Ingresos ($)': p.revenue.toFixed(2),
            'Costos ($)': p.totalCost.toFixed(2),
            'Ganancia ($)': p.profit.toFixed(2),
            'Margen (%)': p.marginPercent,
            'Cantidad Vendida': p.quantity,
            'Precio Promedio ($)': p.avgPrice.toFixed(2),
            'Costo Promedio ($)': p.avgCost.toFixed(2)
        }));
        if (dataToExport.length === 0) {
            showAlert('No hay datos de rentabilidad para exportar.', 'info');
            return;
        }
        exportToCSV(dataToExport, 'analisis_rentabilidad.csv');
    }, [profitableProducts, showAlert]);

    const handleExportMargins = useCallback(() => {
        const dataToExport = profitableProducts.map(p => ({
            'Producto': p.name,
            'Margen (%)': p.marginPercent,
            'Ganancia ($)': p.profit.toFixed(2),
            'Cantidad Vendida': p.quantity
        }));
        if (dataToExport.length === 0) {
            showAlert('No hay datos de márgenes para exportar.', 'info');
            return;
        }
        exportToCSV(dataToExport, 'margenes_ganancia.csv');
    }, [profitableProducts, showAlert]);

    const top6Products = useMemo(() => profitableProducts.slice(0, 6), [profitableProducts]);
    const top5Products = useMemo(() => profitableProducts.slice(0, 5), [profitableProducts]);
    const top8Products = useMemo(() => profitableProducts.slice(0, 8), [profitableProducts]);

    if (isLoading && !statsRaw) {
        return <DashboardSkeleton />;
    }

    if (isError) {
        return (
            <div className={styles.errorContainer}>
                <EmptyStateIcon />
                <h2>Error al cargar el dashboard</h2>
                <p>Hubo un problema al obtener los datos. Por favor, intenta nuevamente.</p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Dashboard Avanzado</h1>
                <p className={styles.subtitle}>Análisis completo de rentabilidad y operaciones de tu negocio.</p>

                <div className={styles.dateFilterMobile}>
                    <button className={styles.expandButton} onClick={() => setShowDateFilter(!showDateFilter)}>
                        {showDateFilter ? 'Ocultar Filtros' : 'Filtrar por fecha'}
                    </button>
                    <div className={`${styles.dateFilterContainer} ${showDateFilter ? styles.filtersVisible : ''}`}>
                        <div className={styles.dateInputGroup}>
                            <label htmlFor="start-date">Desde</label>
                            <input
                                type="date"
                                id="start-date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                                className={styles.dateInput}
                            />
                        </div>
                        <div className={styles.dateInputGroup}>
                            <label htmlFor="end-date">Hasta</label>
                            <input
                                type="date"
                                id="end-date"
                                value={endDate}
                                min={startDate}
                                onChange={e => setEndDate(e.target.value)}
                                className={styles.dateInput}
                            />
                        </div>
                        <div className={styles.buttonGroup}>
                            <button onClick={handleFilterApply} className={styles.filterButton}>Filtrar</button>
                            <button onClick={handleFilterClear} className={styles.clearButton}>Limpiar</button>
                        </div>
                    </div>
                </div>
            </div>

            {!hasData && (
                <div className={styles.emptyState}>
                    <EmptyStateIcon />
                    <h2>No hay datos en este periodo</h2>
                    <p>Selecciona un rango de fechas diferente o verifica que haya pedidos registrados.</p>
                </div>
            )}

            <div className={styles.statsGrid}>
                <StatCard
                    title="Ganancia Total"
                    value={formatCurrency(stats.totalProfit)}
                    subtitle={`Margen: ${(stats.profitMargin || 0).toFixed(1)}%`}
                    color="#2ecc71"
                    icon="💰"
                    helpKey="totalProfit"
                />
                <StatCard
                    title="Ingresos Totales"
                    value={formatCurrency(stats.totalRevenue)}
                    color="#3498db"
                    icon="💵"
                    helpKey="totalRevenue"
                />
                <StatCard
                    title="Costos Totales"
                    value={formatCurrency(stats.totalCosts)}
                    subtitle="Costos de producción"
                    color="#e74c3c"
                    icon="📊"
                    helpKey="totalCosts"
                />
                <StatCard
                    title="Valor Promedio/Pedido"
                    value={formatCurrency(stats.avgOrderValue)}
                    color="#f1c40f"
                    icon="📦"
                    helpKey="avgOrderValue"
                />
                <StatCard
                    title="Total Clientes"
                    value={stats.totalCustomers || 0}
                    subtitle="Clientes registrados"
                    color="#9b59b6"
                    icon="👥"
                    helpKey="totalCustomers"
                />
                <StatCard
                    title="Pedidos Pendientes"
                    value={stats.pendingOrders || 0}
                    color="#e67e22"
                    icon="⌛"
                    helpKey="pendingOrders"
                />
                <StatCard
                    title="Pedidos Completados"
                    value={stats.completedOrders || 0}
                    color="#2ecc71"
                    icon="✅"
                    helpKey="completedOrders"
                />
                <StatCard
                    title="Órdenes Canceladas"
                    value={stats.canceledOrders || 0}
                    color="#95a5a6"
                    icon="❌"
                    helpKey="canceledOrders"
                />
            </div>

            {hasData && (
                <div className={styles.mainGrid}>
                    <div className={`${styles.chartCard} ${styles.profitability}`}>
                        <div className={styles.chartHeader}>
                            <h3>💹 Análisis de Rentabilidad</h3>
                            <button onClick={handleExportProfitability} className={styles.exportButton}>
                                <DownloadIcon /> Exportar
                            </button>
                        </div>
                        <div className={styles.chartContainer}>
                            <ProfitabilityChart profitData={top6Products} />
                        </div>
                    </div>

                    <div className={`${styles.chartCard} ${styles.marginAnalysis}`}>
                        <div className={styles.chartHeader}>
                            <h3>🎯 Márgenes de Ganancia</h3>
                            <button onClick={handleExportMargins} className={styles.exportButton}>
                                <DownloadIcon /> Exportar
                            </button>
                        </div>
                        <div className={styles.chartContainer}>
                            <ProfitMarginChart profitData={top5Products} />
                        </div>
                    </div>

                    <div className={`${styles.chartCard} ${styles.topProducts}`}>
                        <h3>🏆 Top Productos Más Rentables</h3>
                        <div className={styles.profitableList}>
                            {top8Products.map((product, index) => (
                                <div key={`${product.name}-${index}`} className={styles.profitableItem}>
                                    <div className={styles.productInfo}>
                                        <span className={styles.productName}>{product.name}</span>
                                        <span className={styles.productStats}>
                                            Vendidos: {product.quantity} • Margen: {product.marginPercent}%
                                        </span>
                                        <span className={styles.productPricing}>
                                            Precio: {formatCurrency(product.avgPrice)} • Costo: {formatCurrency(product.avgCost)}
                                        </span>
                                    </div>
                                    <div className={styles.productProfit}>
                                        <span className={styles.profitValue}>{formatCurrency(product.profit)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={`${styles.chartCard} ${styles.recentOrders}`}>
                        <h3>⚡ Pedidos Recientes</h3>
                        <ul className={styles.recentList}>
                            {recentOrders.map((order, index) => (
                                <li key={`${order.id}-${index}`} className={styles.recentOrderItem}>
                                    <span>{order.customer_name || 'Cliente'}</span>
                                    <div className={styles.orderInfo}>
                                        <span>{formatCurrency(order.total_amount)}</span>
                                        <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                                            {order.status.replace('_', ' ')}
                                        </span>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
        </div>
    );
}
