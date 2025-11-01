import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from './Dashboard.module.css';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement } from 'chart.js';
import { StatCard } from "../components/StatCard";
import { exportToCSV } from "../utils/exportUtils";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

// ==================== COMPONENTE DE DEBUG ====================
const DebugPanel = memo(({ debugData, isVisible }) => {
    if (!isVisible) return null;

    return (
        <div className={styles.debugPanel}>
            <h4>🔍 Información de Debug</h4>
            <div className={styles.debugGrid}>
                <div>
                    <strong>Total Items:</strong> {debugData.totalItems}
                </div>
                <div>
                    <strong>Items con Costo:</strong> {debugData.itemsWithCost}
                </div>
                <div>
                    <strong>Items sin Cost:</strong> {debugData.itemsWithoutCost}
                </div>
                <div>
                    <strong>Órdenes completadas:</strong> {debugData.completedOrders}
                </div>
            </div>

            <details className={styles.debugDetails}>
                <summary>Ver detalles de productos</summary>
                <div className={styles.debugList}>
                    {debugData.productBreakdown.map((product, index) => (
                        <div key={index} className={styles.debugItem}>
                            <strong>{product.name}</strong>
                            <span>Precio: ${product.avgPrice} | Costo: ${product.avgCost} | Vendidos: {product.quantity}</span>
                            <span>Ingresos: ${product.revenue} | Costos: ${product.totalCost} | Ganancia: ${product.profit}</span>
                        </div>
                    ))}
                </div>
            </details>
        </div>
    );
});
DebugPanel.displayName = 'DebugPanel';

// ==================== GRÁFICO DE RENTABILIDAD CORREGIDO ====================

const ProfitabilityChart = memo(({ profitData }) => {
    const chartData = useMemo(() => ({
        labels: profitData.map(item => item.name.length > 15 ? item.name.substring(0, 12) + '...' : item.name),
        datasets: [
            {
                label: 'Ingresos',
                data: profitData.map(item => item.revenue),
                backgroundColor: 'rgba(46, 204, 113, 0.6)',
                borderColor: 'rgba(46, 204, 113, 1)',
                borderWidth: 1,
            },
            {
                label: 'Costos',
                data: profitData.map(item => item.totalCost),
                backgroundColor: 'rgba(231, 76, 60, 0.6)',
                borderColor: 'rgba(231, 76, 60, 1)',
                borderWidth: 1,
            },
            {
                label: 'Ganancia',
                data: profitData.map(item => item.profit),
                backgroundColor: 'rgba(52, 152, 219, 0.6)',
                borderColor: 'rgba(52, 152, 219, 1)',
                borderWidth: 1,
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
                    label: function (context) {
                        const label = context.dataset.label || '';
                        const value = context.parsed.y;
                        return `${label}: $${value.toFixed(2)}`;
                    },
                    afterBody: function (tooltipItems) {
                        const index = tooltipItems[0].dataIndex;
                        const product = profitData[index];
                        return [
                            `Margen: ${product.marginPercent}%`,
                            `Cantidad vendida: ${product.quantity}`
                        ];
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: { maxRotation: 45, minRotation: 45 }
            },
            y: {
                beginAtZero: true,
                ticks: {
                    callback: function (value) {
                        return '$' + value.toFixed(0);
                    }
                }
            }
        }
    }), [profitData]);

    return <Bar data={chartData} options={options} />;
});
ProfitabilityChart.displayName = 'ProfitabilityChart';

// ==================== GRÁFICO DE MÁRGENES CORREGIDO ====================

const ProfitMarginChart = memo(({ profitData }) => {
    const chartData = useMemo(() => ({
        labels: profitData.map(item => item.name.length > 15 ? item.name.substring(0, 12) + '...' : item.name),
        datasets: [{
            data: profitData.map(item => item.marginPercent),
            backgroundColor: profitData.map(item => {
                if (item.marginPercent >= 50) return '#2ecc71'; // Verde - excelente
                if (item.marginPercent >= 25) return '#f1c40f'; // Amarillo - bueno
                if (item.marginPercent >= 0) return '#e67e22';  // Naranja - bajo
                return '#e74c3c'; // Rojo - pérdida
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
                    label: function (context) {
                        const index = context.dataIndex;
                        const product = profitData[index];
                        return [
                            `Margen: ${context.parsed}%`,
                            `Ganancia: $${product.profit.toFixed(2)}`,
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

// ==================== BOTON DE DESCARGAS ====================
const DownloadIcon = memo(() => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
        <polyline points="7 10 12 15 17 10"></polyline>
        <line x1="12" y1="15" x2="12" y2="3"></line>
    </svg>
));
DownloadIcon.displayName = 'DownloadIcon';

// ==================== COMPONENTE PRINCIPAL CORREGIDO ====================

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalOrders: 0,
        totalRevenue: 0,
        totalProfit: 0,
        totalCosts: 0,
        pendingOrders: 0,
        totalCustomers: 0,
        avgOrderValue: 0,
        profitMargin: 0,
        completedOrders: 0,
        canceledOrders: 0
    });

    const [orders, setOrders] = useState([]);
    const [profitableProducts, setProfitableProducts] = useState([]);
    const [debugData, setDebugData] = useState(null);
    const [showDebugPanel, setShowDebugPanel] = useState(false);
    const [loading, setLoading] = useState(true);

    // --- 👇 ESTADO PARA FILTROS DE FECHA ---
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    // Estado para los filtros aplicados
    const [filterRange, setFilterRange] = useState({ start: '', end: '' });
    // --- ✅ RE-AÑADIDO showDateFilter ---
    const [showDateFilter, setShowDateFilter] = useState(false);
    // --- FIN ESTADO FECHAS ---

    const fetchAdvancedStats = useCallback(async () => {
        try {
            setLoading(true);

            // --- 👇 LEER FILTROS APLICADOS ---
            const { start, end } = filterRange;
            console.log(`🔍 Iniciando análisis... Rango: ${start || 'N/A'} a ${end || 'N/A'}`);

            // ===== CONSULTA CRÍTICA: OBTENER DATOS CON JOINS =====

            // --- Query 1: Órdenes (con filtro de fecha) ---
            let ordersQuery = supabase
                .from('orders')
                .select(`
                    id,
                    status, 
                    total_amount, 
                    created_at,
                    customers(name)
                `)
                .order('created_at', { ascending: false });

            if (start) ordersQuery = ordersQuery.gte('created_at', start);
            if (end) ordersQuery = ordersQuery.lte('created_at', end);

            // --- Query 2: Clientes (sin filtro de fecha) ---
            const customersQuery = supabase
                .from('customers')
                .select('id', { count: 'exact', head: true });

            // --- Query 3: Items (con filtro de fecha en la tabla 'orders') ---
            let orderItemsQuery = supabase
                .from('order_items')
                .select(`
                    quantity,
                    price,
                    cost,
                    products!inner(name, id, price, cost),
                    orders!inner(status, created_at, id)
                `);

            // Aplicar filtros de fecha a la tabla anidada 'orders'
            if (start) orderItemsQuery = orderItemsQuery.gte('orders.created_at', start);
            if (end) orderItemsQuery = orderItemsQuery.lte('orders.created_at', end);

            // Ejecutar consultas en paralelo
            const [ordersResult, customersResult, orderItemsResult] = await Promise.all([
                ordersQuery,
                customersQuery,
                orderItemsQuery
            ]);

            // --- FIN QUERIES ---

            if (ordersResult.error) {
                console.error('❌ Error en orders:', ordersResult.error);
                throw ordersResult.error;
            }
            if (customersResult.error) {
                console.error('❌ Error en customers:', customersResult.error);
                throw customersResult.error;
            }
            if (orderItemsResult.error) {
                console.error('❌ Error en order_items:', orderItemsResult.error);
                throw orderItemsResult.error;
            }

            const ordersData = ordersResult.data || [];
            const customersCount = customersResult.count || 0;
            const itemsData = orderItemsResult.data || [];

            console.log(`📊 Datos obtenidos:`, {
                orders: ordersData.length,
                customers: customersCount,
                items: itemsData.length
            });

            // ===== ANÁLISIS DE COSTOS =====
            const completedItems = itemsData.filter(item =>
                item.orders?.status === 'completado'
            );

            console.log(`✅ Items de órdenes completadas: ${completedItems.length}`);
            if (completedItems.length > 0) console.log('🔍 Muestra de item:', completedItems[0]);

            // ===== CÁLCULOS DE RENTABILIDAD CORREGIDOS =====
            let totalRevenue = 0;
            let totalCosts = 0;
            let itemsWithCost = 0;
            let itemsWithoutCost = 0;
            const productAnalysis = {};

            completedItems.forEach(item => {
                const itemPrice = Number(item.price) || Number(item.products?.price) || 0;
                const itemCost = Number(item.cost) || Number(item.products?.cost) || 0;
                const quantity = Number(item.quantity) || 0;

                const revenue = itemPrice * quantity;
                const cost = itemCost * quantity;

                totalRevenue += revenue;
                totalCosts += cost;

                if (itemCost > 0) itemsWithCost++;
                else itemsWithoutCost++;

                const productName = item.products?.name || 'Producto Desconocido';
                if (!productAnalysis[productName]) {
                    productAnalysis[productName] = {
                        name: productName,
                        revenue: 0,
                        totalCost: 0,
                        profit: 0,
                        quantity: 0,
                        avgPrice: 0,
                        avgCost: 0
                    };
                }
                productAnalysis[productName].revenue += revenue;
                productAnalysis[productName].totalCost += cost;
                productAnalysis[productName].profit += (revenue - cost);
                productAnalysis[productName].quantity += quantity;
                productAnalysis[productName].avgPrice = itemPrice;
                productAnalysis[productName].avgCost = itemCost;
            });

            const totalProfit = totalRevenue - totalCosts;
            const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

            console.log(`💰 Resultados financieros:`, {
                totalRevenue: totalRevenue.toFixed(2),
                totalCosts: totalCosts.toFixed(2),
                totalProfit: totalProfit.toFixed(2),
                profitMargin: profitMargin.toFixed(2) + '%',
                itemsWithCost,
                itemsWithoutCost
            });

            const sortedProfitableProducts = Object.values(productAnalysis)
                .map(product => ({
                    ...product,
                    marginPercent: product.revenue > 0 ?
                        Math.round((product.profit / product.revenue) * 100) : 0
                }))
                .sort((a, b) => b.profit - a.profit)
                .slice(0, 10);

            // Estado de pedidos (basado en los datos filtrados por fecha)
            const completedOrders = ordersData.filter(o => o.status === 'completado').length;
            const pendingOrders = ordersData.filter(o => o.status === 'pendiente').length;
            const canceledOrders = ordersData.filter(o => o.status === 'cancelado').length;

            const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

            const debugInfo = {
                totalItems: completedItems.length,
                itemsWithCost,
                itemsWithoutCost,
                completedOrders,
                productBreakdown: sortedProfitableProducts.slice(0, 5)
            };

            // ===== ACTUALIZAR ESTADOS =====
            setStats({
                totalOrders: ordersData.length,
                totalRevenue: totalRevenue,
                totalProfit: totalProfit,
                totalCosts: totalCosts,
                pendingOrders: pendingOrders,
                totalCustomers: customersCount, // Total clientes no se filtra por fecha
                avgOrderValue: avgOrderValue,
                profitMargin: profitMargin,
                completedOrders: completedOrders,
                canceledOrders: canceledOrders
            });

            setOrders(ordersData);
            setProfitableProducts(sortedProfitableProducts);
            setDebugData(debugInfo);

            console.log('✅ Dashboard actualizado correctamente');

        } catch (error) {
            console.error('❌ Error fetching advanced dashboard data:', error);
        } finally {
            setLoading(false);
        }
        // --- 👇 AÑADIR filterRange como dependencia ---
    }, [filterRange]);

    useEffect(() => {
        fetchAdvancedStats();

        // Realtime updates
        const channel = supabase
            .channel('dashboard-advanced-channel')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'orders' },
                () => {
                    console.log('🔄 Orden actualizada, recargando stats...');
                    fetchAdvancedStats();
                }
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'order_items' },
                () => {
                    console.log('🔄 Item de orden actualizado, recargando stats...');
                    fetchAdvancedStats();
                }
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'products' },
                () => {
                    console.log('🔄 Producto actualizado, recargando stats...');
                    fetchAdvancedStats();
                }
            )
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [fetchAdvancedStats]);

    const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

    const handleFilterApply = () => {
        if (startDate && endDate && endDate < startDate) {
            showAlert('La fecha de fin no puede ser anterior a la fecha de inicio.');
            return;
        }

        let utcStart = '';
        let utcEnd = '';

        if (startDate) {
            const localStart = new Date(`${startDate}T00:00:00`);
            utcStart = localStart.toISOString(); 
        }

        if (endDate) {
            const localEnd = new Date(`${endDate}T23:59:59.999`);
            utcEnd = localEnd.toISOString();
        }

        // Guarda las fechas UTC completas en el estado del filtro
        setFilterRange({ start: utcStart, end: utcEnd });
    };

    const handleFilterClear = () => {
        setStartDate('');
        setEndDate('');
        setFilterRange({ start: '', end: '' });
    };

    const handleExportProfitability = useCallback(() => {
        // Formatear los datos para que sean legibles en el CSV
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
            alert("No hay datos de rentabilidad para exportar.");
            return;
        }

        exportToCSV(dataToExport, 'analisis_rentabilidad.csv');
    }, [profitableProducts]);

    const handleExportMargins = useCallback(() => {
        // Formatear datos específicos para este gráfico
        const dataToExport = profitableProducts.map(p => ({
            'Producto': p.name,
            'Margen (%)': p.marginPercent,
            'Ganancia ($)': p.profit.toFixed(2),
            'Cantidad Vendida': p.quantity
        }));

        if (dataToExport.length === 0) {
            alert("No hay datos de márgenes para exportar.");
            return;
        }

        exportToCSV(dataToExport, 'margenes_ganancia.csv');
    }, [profitableProducts]);

    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Dashboard Avanzado</h1>
                <p className={styles.subtitle}>Análisis completo de rentabilidad y operaciones de tu negocio.</p>

                {/* --- 👇 FILTRO DE FECHAS REVERTIDO --- */}
                {/* Este div agrupa el botón y el filtro en móvil */}
                <div className={styles.dateFilterMobile}>
                    <button
                        className={styles.expandButton}
                        onClick={() => setShowDateFilter(!showDateFilter)}
                    >
                        {showDateFilter ? 'Ocultar Filtros' : 'Filtrar por fecha'}
                    </button>
                    
                    {/* Este contenedor se muestra condicionalmente en MÓVIL (por showDateFilter)
                      y se fuerza a mostrar SIEMPRE en ESCRITORIO (con CSS).
                    */}
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
                        <div className={"buttonGroup"}>
                        <button onClick={handleFilterApply} className={styles.filterButton}>Filtrar</button>
                        <button onClick={handleFilterClear} className={styles.clearButton}>Limpiar</button>
                        </div>
                    </div>
                </div>
                {/* --- FIN FILTRO --- */}

            </div>
            {/* Grid principal de métricas */}
            <div className={styles.statsGrid}>
                <StatCard
                    title="Ganancia Total"
                    value={`$${stats.totalProfit.toFixed(2)}`}
                    subtitle={`Margen: ${stats.profitMargin.toFixed(1)}%`}
                    color="#2ecc71"
                    icon="💰"
                    helpKey="totalProfit"
                    debugInfo={`Ingresos: $${stats.totalRevenue.toFixed(2)} - Costos: $${stats.totalCosts.toFixed(2)}`}
                />
                <StatCard
                    title="Ingresos Totales"
                    value={`$${stats.totalRevenue.toFixed(2)}`}
                    /* subtitle eliminado */
                    color="#3498db"
                    icon="💵"
                    helpKey="totalRevenue"
                />
                <StatCard
                    title="Costos Totales"
                    value={`$${stats.totalCosts.toFixed(2)}`}
                    subtitle="Costos de producción"
                    color="#e74c3c"
                    icon="📊"
                    helpKey="totalCosts"
                    debugInfo={debugData ? `Items con costo: ${debugData.itemsWithCost}, Sin costo: ${debugData.itemsWithoutCost}` : ''}
                />
                <StatCard
                    title="Valor Promedio/Pedido"
                    value={`$${stats.avgOrderValue.toFixed(2)}`}
                    /* subtitle eliminado */
                    color="#f1c40f"
                    icon="📦"
                    helpKey="avgOrderValue"
                />
                <StatCard
                    title="Total Clientes"
                    value={stats.totalCustomers}
                    subtitle="Clientes registrados"
                    color="#9b59b6"
                    icon="👥"
                    helpKey="totalCustomers"
                />

                {/* --- TARJETAS DE ESTADO DE PEDIDOS AGRUPADAS --- */}
                <StatCard
                    title="Pedidos Pendientes"
                    value={stats.pendingOrders}
                    subtitle={`${(stats.totalOrders > 0 ? (stats.pendingOrders / stats.totalOrders) * 100 : 0).toFixed(1)}% del total`}
                    color="#e67e22"
                    icon="⌛"
                    helpKey="pendingOrders"
                />
                <StatCard
                    title="Pedidos Completados"
                    value={stats.completedOrders}
                    subtitle={`${(stats.totalOrders > 0 ? (stats.completedOrders / stats.totalOrders) * 100 : 0).toFixed(1)}% del total`}
                    color="#2ecc71"
                    icon="✅"
                    helpKey="completedOrders"
                />
                <StatCard
                    title="Órdenes Canceladas"
                    value={stats.canceledOrders}
                    subtitle={`${(stats.totalOrders > 0 ? (stats.canceledOrders / stats.totalOrders) * 100 : 0).toFixed(1)}% del total`}
                    color="#95a5a6"
                    icon="❌"
                    helpKey="canceledOrders"
                />
                {/* --- FIN TARJETAS DE ESTADO --- */}
            </div>

            {/* Grid de gráficos principales */}
            <div className={styles.mainGrid}>
                {/* Análisis de Rentabilidad por Producto */}
                <div className={`${styles.chartCard} ${styles.profitability}`}>
                    {/* Encabezado ahora es un div con flex */}
                    <div className={styles.chartHeader}>
                        <h3>💹 Análisis de Rentabilidad por Producto</h3>
                        <button onClick={handleExportProfitability} className={styles.exportButton}>
                            <DownloadIcon />
                            Exportar
                        </button>
                    </div>
                    <div className={styles.chartContainer}>
                        <ProfitabilityChart profitData={profitableProducts.slice(0, 6)} />
                    </div>
                </div>

                {/* Márgenes de Ganancia */}
                <div className={`${styles.chartCard} ${styles.marginAnalysis}`}>
                    {/* Encabezado ahora es un div con flex */}
                    <div className={styles.chartHeader}>
                        <h3>🎯 Márgenes de Ganancia</h3>
                        <button onClick={handleExportMargins} className={styles.exportButton}>
                            <DownloadIcon />
                            Exportar
                        </button>
                    </div>
                    <div className={styles.chartContainer}>
                        <ProfitMarginChart profitData={profitableProducts.slice(0, 5)} />
                    </div>
                </div>

                {/* Top Productos Rentables */}
                <div className={`${styles.chartCard} ${styles.topProducts}`}>
                    <h3>🏆 Top Productos Más Rentables</h3>
                    <div className={styles.profitableList}>
                        {profitableProducts.slice(0, 8).map((product, index) => (
                            <div key={index} className={styles.profitableItem}>
                                <div className={styles.productInfo}>
                                    <span className={styles.productName}>{product.name}</span>
                                    <span className={styles.productStats}>
                                        Vendidos: {product.quantity} • Margen: {product.marginPercent}%
                                    </span>
                                    <span className={styles.productPricing}>
                                        Precio: ${product.avgPrice.toFixed(2)} • Costo: ${product.avgCost.toFixed(2)}
                                    </span>
                                </div>
                                <div className={styles.productProfit}>
                                    <span className={styles.profitValue}>
                                        +${product.profit.toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Pedidos Recientes */}
                <div className={`${styles.chartCard} ${styles.recentOrders}`}>
                    <h3>⚡ Pedidos Recientes</h3>
                    <ul className={styles.recentList}>
                        {recentOrders.map((order, index) => (
                            <li key={`${order.created_at}-${index}`}>
                                <span>{order.customers?.name || 'Cliente'}</span>
                                <div className={styles.orderInfo}>
                                    <span>${order.total_amount}</span>
                                    <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                                        {order.status.replace('_', ' ')}
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>

            <button
                onClick={() => setShowDebugPanel(!showDebugPanel)}
                className={styles.debugButton}
            >
                {showDebugPanel ? 'Ocultar Debug' : 'Mostrar Debug'}
            </button>
            {/* Panel de Debug */}
            {debugData && (
                <DebugPanel
                    debugData={debugData}
                    isVisible={showDebugPanel}
                />
            )}
        </div>
    );
}