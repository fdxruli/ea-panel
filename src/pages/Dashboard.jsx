import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from './Dashboard.module.css';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement);

// ==================== COMPONENTES MEMOIZADOS ====================

const StatCard = memo(({ title, value, icon, color, evolution, subtitle, debugInfo }) => (
    <div className={styles.statCard} title={debugInfo}>
        <div className={styles.statInfo}>
            <span className={styles.statTitle}>{title}</span>
            <span className={styles.statValue}>{value}</span>
            {subtitle && <span className={styles.statSubtitle}>{subtitle}</span>}
            {evolution && <span className={styles.statEvolution}>{evolution}</span>}
        </div>
        <div className={styles.iconWrapper} style={{ backgroundColor: color }}>
            {icon}
        </div>
    </div>
));
StatCard.displayName = 'StatCard';

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

    const fetchAdvancedStats = useCallback(async () => {
        try {
            setLoading(true);

            console.log('🔍 Iniciando análisis de rentabilidad...');

            // ===== CONSULTA CRÍTICA: OBTENER DATOS CON JOINS =====
            const [ordersResult, customersResult, orderItemsResult] = await Promise.all([
                supabase
                    .from('orders')
                    .select(`
                        id,
                        status, 
                        total_amount, 
                        created_at,
                        customers(name)
                    `)
                    .order('created_at', { ascending: false }),

                supabase
                    .from('customers')
                    .select('id', { count: 'exact', head: true }),

                // ⚠️ CONSULTA CRÍTICA: Asegurar que obtenemos price Y cost
                supabase
                    .from('order_items')
                    .select(`
                        quantity,
                        price,
                        cost,
                        products!inner(name, id, price, cost),
                        orders!inner(status, created_at, id)
                    `)
            ]);

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

            // Filtrar solo items de órdenes completadas
            const completedItems = itemsData.filter(item =>
                item.orders?.status === 'completado'
            );

            console.log(`✅ Items de órdenes completadas: ${completedItems.length}`);

            // DEBUG: Verificar estructura de datos
            if (completedItems.length > 0) {
                console.log('🔍 Muestra de item:', completedItems[0]);
            }

            // ===== CÁLCULOS DE RENTABILIDAD CORREGIDOS =====

            let totalRevenue = 0;
            let totalCosts = 0;
            let itemsWithCost = 0;
            let itemsWithoutCost = 0;

            const productAnalysis = {};

            completedItems.forEach(item => {
                // ⚠️ CRITICAL: Determinar de dónde viene el precio y costo

                // Prioridad: order_item.price/cost > products.price/cost
                const itemPrice = Number(item.price) || Number(item.products?.price) || 0;
                const itemCost = Number(item.cost) || Number(item.products?.cost) || 0;
                const quantity = Number(item.quantity) || 0;

                const revenue = itemPrice * quantity;
                const cost = itemCost * quantity;

                totalRevenue += revenue;
                totalCosts += cost;

                if (itemCost > 0) {
                    itemsWithCost++;
                } else {
                    itemsWithoutCost++;
                    console.warn(`⚠️ Producto sin costo: ${item.products?.name}`, {
                        orderItemCost: item.cost,
                        productCost: item.products?.cost,
                        price: itemPrice
                    });
                }

                // Análisis por producto
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

            // Top productos más rentables
            const sortedProfitableProducts = Object.values(productAnalysis)
                .map(product => ({
                    ...product,
                    marginPercent: product.revenue > 0 ?
                        Math.round((product.profit / product.revenue) * 100) : 0
                }))
                .sort((a, b) => b.profit - a.profit)
                .slice(0, 10);

            // Estado de pedidos
            const completedOrders = ordersData.filter(o => o.status === 'completado').length;
            const pendingOrders = ordersData.filter(o => o.status === 'pendiente').length;
            const canceledOrders = ordersData.filter(o => o.status === 'cancelado').length;

            const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

            // ===== DATOS DE DEBUG =====
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
                totalCustomers: customersCount,
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
    }, []);

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

    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Dashboard Avanzado</h1>
                <p className={styles.subtitle}>Análisis completo de rentabilidad y operaciones de tu negocio.</p>
            </div>
            {/* Grid principal de métricas */}
            <div className={styles.statsGrid}>
                <StatCard
                    title="Ganancia Total"
                    value={`$${stats.totalProfit.toFixed(2)}`}
                    subtitle={`Margen: ${stats.profitMargin.toFixed(1)}%`}
                    color="#2ecc71"
                    icon="💰"
                    debugInfo={`Ingresos: $${stats.totalRevenue.toFixed(2)} - Costos: $${stats.totalCosts.toFixed(2)}`}
                />
                <StatCard
                    title="Ingresos Totales"
                    value={`$${stats.totalRevenue.toFixed(2)}`}
                    subtitle={`${stats.completedOrders} órdenes completadas`}
                    color="#3498db"
                    icon="💵"
                />
                <StatCard
                    title="Costos Totales"
                    value={`$${stats.totalCosts.toFixed(2)}`}
                    subtitle="Costos de producción"
                    color="#e74c3c"
                    icon="📊"
                    debugInfo={debugData ? `Items con costo: ${debugData.itemsWithCost}, Sin costo: ${debugData.itemsWithoutCost}` : ''}
                />
                <StatCard
                    title="Valor Promedio/Pedido"
                    value={`$${stats.avgOrderValue.toFixed(2)}`}
                    subtitle={`${stats.pendingOrders} pendientes`}
                    color="#f1c40f"
                    icon="📦"
                />
                <StatCard
                    title="Total Clientes"
                    value={stats.totalCustomers}
                    subtitle="Clientes registrados"
                    color="#9b59b6"
                    icon="👥"
                />
                <StatCard
                    title="Órdenes Canceladas"
                    value={stats.canceledOrders}
                    subtitle={`${((stats.canceledOrders / stats.totalOrders) * 100).toFixed(1)}% del total`}
                    color="#95a5a6"
                    icon="❌"
                />
            </div>

            {/* Grid de gráficos principales */}
            <div className={styles.mainGrid}>
                {/* Análisis de Rentabilidad por Producto */}
                <div className={`${styles.chartCard} ${styles.profitability}`}>
                    <h3>💹 Análisis de Rentabilidad por Producto</h3>
                    <div className={styles.chartContainer}>
                        <ProfitabilityChart profitData={profitableProducts.slice(0, 6)} />
                    </div>
                </div>

                {/* Márgenes de Ganancia */}
                <div className={`${styles.chartCard} ${styles.marginAnalysis}`}>
                    <h3>🎯 Márgenes de Ganancia</h3>
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
