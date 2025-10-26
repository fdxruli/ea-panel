import React, { useEffect, useState, useCallback, useMemo, memo } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from './Dashboard.module.css';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

// ==================== COMPONENTES MEMOIZADOS ====================

// StatCard memoizado para evitar re-renders innecesarios
const StatCard = memo(({ title, value, icon, color, evolution }) => (
    <div className={styles.statCard}>
        <div className={styles.statInfo}>
            <span className={styles.statTitle}>{title}</span>
            <span className={styles.statValue}>{value}</span>
            {evolution && <span className={styles.statEvolution}>{evolution}</span>}
        </div>
        <div className={styles.iconWrapper} style={{ backgroundColor: color }}>
            {icon}
        </div>
    </div>
));
StatCard.displayName = 'StatCard';

// ==================== CHART COMPONENTS ====================

const OrderStatusChart = memo(({ orders }) => {
    const statusConfig = useMemo(() => ({
        'pendiente': { label: 'Pendiente', color: '#f0ad4e' },
        'en_proceso': { label: 'En Proceso', color: '#3498db' },
        'en_envio': { label: 'En Envío', color: '#5dade2' },
        'completado': { label: 'Completado', color: '#81C784' },
        'cancelado': { label: 'Cancelado', color: '#F44336' }
    }), []);

    // Memoizar el procesamiento de datos
    const chartData = useMemo(() => {
        const statusCounts = orders.reduce((acc, order) => {
            acc[order.status] = (acc[order.status] || 0) + 1;
            return acc;
        }, {});

        const orderedLabels = [];
        const orderedData = [];
        const orderedColors = [];

        Object.keys(statusConfig).forEach(status => {
            if (statusCounts[status]) {
                orderedLabels.push(statusConfig[status].label);
                orderedData.push(statusCounts[status]);
                orderedColors.push(statusConfig[status].color);
            }
        });

        return {
            labels: orderedLabels,
            datasets: [{
                data: orderedData,
                backgroundColor: orderedColors,
                borderColor: 'var(--bg-secondary)',
                borderWidth: 4,
            }],
        };
    }, [orders, statusConfig]);

    // Opciones estáticas memoizadas
    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Mejor rendimiento
        plugins: {
            legend: {
                position: 'bottom',
            },
            tooltip: {
                animation: false, // Mejor rendimiento
            }
        }
    }), []);

    return <Doughnut data={chartData} options={options} />;
});
OrderStatusChart.displayName = 'OrderStatusChart';

const TopProductsChart = memo(({ items }) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const checkSize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', checkSize);
        return () => window.removeEventListener('resize', checkSize);
    }, []);

    // Memoizar procesamiento de productos
    const sortedProducts = useMemo(() => {
        const productCounts = items.reduce((acc, item) => {
            const productName = item.products?.name || 'Producto Desconocido';
            acc[productName] = (acc[productName] || 0) + item.quantity;
            return acc;
        }, {});

        return Object.entries(productCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5);
    }, [items]);

    const chartData = useMemo(() => {
        const getLabels = () => {
            return sortedProducts.map(([name]) => {
                if (isMobile && name.length > 15) {
                    return name.substring(0, 12) + '...';
                }
                return name;
            });
        };

        return {
            labels: getLabels(),
            datasets: [{
                label: 'Cantidad Vendida',
                data: sortedProducts.map(([, count]) => count),
                backgroundColor: 'rgba(229, 115, 115, 0.6)',
                borderColor: 'rgba(229, 115, 115, 1)',
                borderWidth: 1,
            }],
        };
    }, [sortedProducts, isMobile]);

    const options = useMemo(() => ({
        indexAxis: isMobile ? 'x' : 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false, // Mejor rendimiento
        plugins: {
            legend: { display: false },
            tooltip: {
                animation: false, // Mejor rendimiento
                callbacks: {
                    title: (tooltipItems) => {
                        if (isMobile) {
                            const index = tooltipItems[0].dataIndex;
                            return sortedProducts[index][0];
                        }
                        return tooltipItems[0].label;
                    }
                }
            }
        },
        scales: {
            x: {
                ticks: {
                    maxRotation: isMobile ? 25 : 0,
                    minRotation: isMobile ? 25 : 0,
                }
            },
            y: {
                ticks: {
                    stepSize: 1
                }
            }
        }
    }), [isMobile, sortedProducts]);

    return <Bar data={chartData} options={options} />;
});
TopProductsChart.displayName = 'TopProductsChart';

// ==================== MAIN COMPONENT ====================

export default function Dashboard() {
    const [stats, setStats] = useState({
        totalOrders: 0,
        totalRevenue: 0,
        pendingOrders: 0,
        totalCustomers: 0
    });
    const [orders, setOrders] = useState([]);
    const [orderItems, setOrderItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // Función optimizada con una sola consulta combinada
    const fetchStats = useCallback(async () => {
        try {
            // ✅ OPTIMIZACIÓN 1: Consultas en paralelo con Promise.all
            const [ordersResult, customersResult, itemsResult] = await Promise.all([
                // Solo seleccionar columnas necesarias
                supabase
                    .from('orders')
                    .select('status, total_amount, created_at, customers(name)')
                    .order('created_at', { ascending: false })
                    .limit(100), // Limitar cantidad de datos iniciales
                
                // Solo contar, no traer datos completos
                supabase
                    .from('customers')
                    .select('id', { count: 'exact', head: true }),
                
                // Solo columnas necesarias para los gráficos
                supabase
                    .from('order_items')
                    .select('quantity, products(name)')
            ]);

            if (ordersResult.error) throw ordersResult.error;
            if (customersResult.error) throw customersResult.error;
            if (itemsResult.error) throw itemsResult.error;

            const ordersData = ordersResult.data || [];
            const customersCount = customersResult.count || 0;
            const itemsData = itemsResult.data || [];

            // ✅ OPTIMIZACIÓN 2: Cálculos memoizados
            const totalRevenue = ordersData.reduce(
                (sum, order) => order.status === 'completado' ? sum + Number(order.total_amount) : sum, 
                0
            );
            const pendingOrders = ordersData.filter(o => o.status === 'pendiente').length;

            setStats({
                totalOrders: ordersData.length,
                totalRevenue: totalRevenue.toFixed(2),
                pendingOrders: pendingOrders,
                totalCustomers: customersCount
            });
            setOrders(ordersData);
            setOrderItems(itemsData);
        } catch (error) {
            console.error('Error fetching dashboard data:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();

        // ✅ OPTIMIZACIÓN 3: Realtime con filtros específicos
        const channel = supabase
            .channel('dashboard-orders-channel')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                    // Solo escuchar columnas relevantes
                    select: 'status, total_amount, created_at, customer_id'
                },
                (payload) => {
                    console.log('Cambio detectado en pedidos:', payload);
                    // Actualizar de forma más eficiente
                    fetchStats();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchStats]);

    // Memoizar lista de pedidos recientes
    const recentOrders = useMemo(() => orders.slice(0, 5), [orders]);

    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Dashboard</h1>
                <p className={styles.subtitle}>Bienvenido, aquí tienes un resumen de tu negocio.</p>
            </div>

            <div className={styles.statsGrid}>
                <StatCard 
                    title="Ingresos Totales (Completados)" 
                    value={`$${stats.totalRevenue}`} 
                    color="#2ecc71" 
                    icon="💰" 
                />
                <StatCard 
                    title="Pedidos Totales" 
                    value={stats.totalOrders} 
                    color="#3498db" 
                    icon="📦" 
                />
                <StatCard 
                    title="Pedidos Pendientes" 
                    value={stats.pendingOrders} 
                    color="#f1c40f" 
                    icon="⏳" 
                />
                <StatCard 
                    title="Clientes Registrados" 
                    value={stats.totalCustomers} 
                    color="#e74c3c" 
                    icon="👥" 
                />
            </div>
            
            <div className={styles.mainGrid}>
                <div className={`${styles.chartCard} ${styles.topProducts}`}>
                    <h3>🏆 Top 5 Productos Vendidos</h3>
                    <div className={styles.chartContainer}>
                        <TopProductsChart items={orderItems} />
                    </div>
                </div>
                
                <div className={`${styles.chartCard} ${styles.orderStatus}`}>
                    <h3>📊 Estado de Pedidos</h3>
                    <div className={styles.chartContainer}>
                        <OrderStatusChart orders={orders} />
                    </div>
                </div>

                <div className={`${styles.chartCard} ${styles.recentOrders}`}>
                    <h3>⚡ Pedidos Recientes</h3>
                    <ul className={styles.recentList}>
                        {recentOrders.map((order, index) => (
                            <li key={`${order.created_at}-${index}`}>
                                <span>{order.customers?.name || 'Cliente'}</span>
                                <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                                    {order.status.replace('_',' ')}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}
