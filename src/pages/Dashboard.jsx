import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from './Dashboard.module.css';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement } from 'chart.js';
import { StatCard } from "../components/StatCard";
import { exportToCSV } from "../utils/exportUtils";
import { useAdminCache } from "../hooks/useAdminCache";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

// ==================== GRÁFICOS ====================
const ProfitabilityChart = memo(({ profitData }) => {
    const chartData = useMemo(() => ({
        labels: profitData.map(item => item.name.length > 15 ? item.name.substring(0, 12) + '...' : item.name),
        datasets: [
            { label: 'Ingresos', data: profitData.map(item => item.revenue), backgroundColor: 'rgba(46, 204, 113, 0.6)', borderColor: 'rgba(46, 204, 113, 1)', borderWidth: 1 },
            { label: 'Costos', data: profitData.map(item => item.totalCost), backgroundColor: 'rgba(231, 76, 60, 0.6)', borderColor: 'rgba(231, 76, 60, 1)', borderWidth: 1 },
            { label: 'Ganancia', data: profitData.map(item => item.profit), backgroundColor: 'rgba(52, 152, 219, 0.6)', borderColor: 'rgba(52, 152, 219, 1)', borderWidth: 1 }
        ],
    }), [profitData]);

    const options = useMemo(() => ({
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
            legend: { position: 'top' },
            tooltip: {
                animation: false,
                callbacks: {
                    label: context => `${context.dataset.label || ''}: $${context.parsed.y.toFixed(2)}`,
                    afterBody: tooltipItems => {
                        const product = profitData[tooltipItems[0].dataIndex];
                        return [`Margen: ${product.marginPercent}%`, `Cantidad vendida: ${product.quantity}`];
                    }
                }
            }
        },
        scales: {
            x: { ticks: { maxRotation: 45, minRotation: 45 } },
            y: { beginAtZero: true, ticks: { callback: value => '$' + value.toFixed(0) } }
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
        responsive: true, maintainAspectRatio: false, animation: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                animation: false,
                callbacks: {
                    label: context => {
                        const product = profitData[context.dataIndex];
                        return [`Margen: ${context.parsed}%`, `Ganancia: $${product.profit.toFixed(2)}`, `Vendidos: ${product.quantity}`];
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

// ==================== COMPONENTE PRINCIPAL ====================
export default function Dashboard() {
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

    const initDates = getInitialDateRange();

    const [filterRange, setFilterRange] = useState({ start: initDates.startIso, end: initDates.endIso });
    const [startDate, setStartDate] = useState(initDates.startDateStr);
    const [endDate, setEndDate] = useState(initDates.endDateStr);
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
        const channel = supabase
            .channel('dashboard-advanced-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => invalidate())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, () => invalidate())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => invalidate())
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [invalidate]);

    const handleFilterApply = () => {
        if (startDate && endDate && endDate < startDate) {
            alert('La fecha de fin no puede ser anterior a la fecha de inicio.');
            return;
        }
        const utcStart = startDate ? new Date(`${startDate}T00:00:00`).toISOString() : null;
        const utcEnd = endDate ? new Date(`${endDate}T23:59:59.999`).toISOString() : null;
        setFilterRange({ start: utcStart, end: utcEnd });
    };

    const handleFilterClear = () => {
        const resetDates = getInitialDateRange();
        setStartDate(resetDates.startDateStr);
        setEndDate(resetDates.endDateStr);
        setFilterRange({ start: resetDates.startIso, end: resetDates.endIso });
    };

    const stats = statsRaw || {};
    const profitableProducts = stats.profitableProducts || [];
    const recentOrders = stats.recentOrders || [];

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
        if (dataToExport.length === 0) return alert("No hay datos de rentabilidad para exportar.");
        exportToCSV(dataToExport, 'analisis_rentabilidad.csv');
    }, [profitableProducts]);

    const handleExportMargins = useCallback(() => {
        const dataToExport = profitableProducts.map(p => ({
            'Producto': p.name, 'Margen (%)': p.marginPercent, 'Ganancia ($)': p.profit.toFixed(2), 'Cantidad Vendida': p.quantity
        }));
        if (dataToExport.length === 0) return alert("No hay datos de márgenes para exportar.");
        exportToCSV(dataToExport, 'margenes_ganancia.csv');
    }, [profitableProducts]);

    if (isLoading && !statsRaw) return <LoadingSpinner />;
    if (isError) return <div className={styles.error}>Error al cargar el dashboard.</div>;

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
                            <input type="date" id="start-date" value={startDate} onChange={e => setStartDate(e.target.value)} className={styles.dateInput} />
                        </div>
                        <div className={styles.dateInputGroup}>
                            <label htmlFor="end-date">Hasta</label>
                            <input type="date" id="end-date" value={endDate} min={startDate} onChange={e => setEndDate(e.target.value)} className={styles.dateInput} />
                        </div>
                        <div className={"buttonGroup"}>
                            <button onClick={handleFilterApply} className={styles.filterButton}>Filtrar</button>
                            <button onClick={handleFilterClear} className={styles.clearButton}>Limpiar</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.statsGrid}>
                <StatCard title="Ganancia Total" value={`$${(stats.totalProfit || 0).toFixed(2)}`} subtitle={`Margen: ${(stats.profitMargin || 0).toFixed(1)}%`} color="#2ecc71" icon="💰" />
                <StatCard title="Ingresos Totales" value={`$${(stats.totalRevenue || 0).toFixed(2)}`} color="#3498db" icon="💵" />
                <StatCard title="Costos Totales" value={`$${(stats.totalCosts || 0).toFixed(2)}`} subtitle="Costos de producción" color="#e74c3c" icon="📊" />
                <StatCard title="Valor Promedio/Pedido" value={`$${(stats.avgOrderValue || 0).toFixed(2)}`} color="#f1c40f" icon="📦" />
                <StatCard title="Total Clientes" value={stats.totalCustomers || 0} subtitle="Clientes registrados" color="#9b59b6" icon="👥" />
                <StatCard title="Pedidos Pendientes" value={stats.pendingOrders || 0} color="#e67e22" icon="⌛" />
                <StatCard title="Pedidos Completados" value={stats.completedOrders || 0} color="#2ecc71" icon="✅" />
                <StatCard title="Órdenes Canceladas" value={stats.canceledOrders || 0} color="#95a5a6" icon="❌" />
            </div>

            <div className={styles.mainGrid}>
                <div className={`${styles.chartCard} ${styles.profitability}`}>
                    <div className={styles.chartHeader}>
                        <h3>💹 Análisis de Rentabilidad</h3>
                        <button onClick={handleExportProfitability} className={styles.exportButton}><DownloadIcon /> Exportar</button>
                    </div>
                    <div className={styles.chartContainer}><ProfitabilityChart profitData={profitableProducts.slice(0, 6)} /></div>
                </div>

                <div className={`${styles.chartCard} ${styles.marginAnalysis}`}>
                    <div className={styles.chartHeader}>
                        <h3>🎯 Márgenes de Ganancia</h3>
                        <button onClick={handleExportMargins} className={styles.exportButton}><DownloadIcon /> Exportar</button>
                    </div>
                    <div className={styles.chartContainer}><ProfitMarginChart profitData={profitableProducts.slice(0, 5)} /></div>
                </div>

                <div className={`${styles.chartCard} ${styles.topProducts}`}>
                    <h3>🏆 Top Productos Más Rentables</h3>
                    <div className={styles.profitableList}>
                        {profitableProducts.slice(0, 8).map((product, index) => (
                            <div key={index} className={styles.profitableItem}>
                                <div className={styles.productInfo}>
                                    <span className={styles.productName}>{product.name}</span>
                                    <span className={styles.productStats}>Vendidos: {product.quantity} • Margen: {product.marginPercent}%</span>
                                    <span className={styles.productPricing}>Precio: ${product.avgPrice.toFixed(2)} • Costo: ${product.avgCost.toFixed(2)}</span>
                                </div>
                                <div className={styles.productProfit}><span className={styles.profitValue}>+${product.profit.toFixed(2)}</span></div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className={`${styles.chartCard} ${styles.recentOrders}`}>
                    <h3>⚡ Pedidos Recientes</h3>
                    <ul className={styles.recentList}>
                        {recentOrders.map((order, index) => (
                            <li key={`${order.id}-${index}`}>
                                <span>{order.customer_name || 'Cliente'}</span>
                                <div className={styles.orderInfo}>
                                    <span>${order.total_amount}</span>
                                    <span className={`${styles.statusBadge} ${styles[order.status]}`}>{order.status.replace('_', ' ')}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}