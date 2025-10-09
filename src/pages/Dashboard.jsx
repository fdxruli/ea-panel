import React, { useEffect, useState, useCallback } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from './Dashboard.module.css';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

const StatCard = ({ title, value, icon, color, evolution }) => (
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
);

const OrderStatusChart = ({ orders }) => {
    const statusCounts = orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
    }, {});

    const data = {
        labels: Object.keys(statusCounts),
        datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: ['#f1c40f', '#3498db', '#2ecc71', '#e74c3c'],
            borderColor: 'var(--bg-secondary)',
            borderWidth: 4,
        }],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'bottom',
            }
        }
    };

    return <Doughnut data={data} options={options} />;
};

const TopProductsChart = ({ items }) => {
    const productCounts = items.reduce((acc, item) => {
        const productName = item.products?.name || 'Producto Desconocido';
        acc[productName] = (acc[productName] || 0) + item.quantity;
        return acc;
    }, {});

    const sortedProducts = Object.entries(productCounts).sort(([, a], [, b]) => b - a).slice(0, 5);

    const data = {
        labels: sortedProducts.map(([name]) => name),
        datasets: [{
            label: 'Cantidad Vendida',
            data: sortedProducts.map(([, count]) => count),
            backgroundColor: 'rgba(229, 115, 115, 0.6)',
            borderColor: 'rgba(229, 115, 115, 1)',
            borderWidth: 1,
        }],
    };
    
    const options = {
        indexAxis: 'y',
        responsive: true,
        plugins: {
            legend: {
                display: false,
            }
        }
    };
    
    return <Bar data={data} options={options} />;
};


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

    const fetchStats = useCallback(async () => {
        const { data: ordersData, error: ordersError } = await supabase.from('orders').select('status, total_amount, created_at, customers (name)').order('created_at', { ascending: false });
        const { count: customersCount, error: customersError } = await supabase.from('customers').select('*', { count: 'exact' });
        const { data: itemsData, error: itemsError } = await supabase.from('order_items').select('quantity, products(name)');
        
        if (ordersError || customersError || itemsError) {
            console.error(ordersError || customersError || itemsError);
        } else {
            const totalRevenue = ordersData.reduce((sum, order) => order.status === 'completado' ? sum + order.total_amount : sum, 0);
            const pendingOrders = ordersData.filter(o => o.status === 'pendiente').length;

            setStats({
                totalOrders: ordersData.length,
                totalRevenue: totalRevenue.toFixed(2),
                pendingOrders: pendingOrders,
                totalCustomers: customersCount
            });
            setOrders(ordersData);
            setOrderItems(itemsData);
        }
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchStats();

        const channel = supabase.channel('public:orders:dashboard')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
            console.log('¡Nuevo cambio en pedidos detectado!', payload);
            fetchStats();
          })
          .subscribe();
        return () => {
            supabase.removeChannel(channel);
        };
    }, [fetchStats]);

    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1 className={styles.title}>Dashboard</h1>
                <p className={styles.subtitle}>Bienvenido, aquí tienes un resumen de tu negocio.</p>
            </div>

            <div className={styles.statsGrid}>
                <StatCard title="Ingresos Totales (Completados)" value={`$${stats.totalRevenue}`} color="#2ecc71" icon="💰" />
                <StatCard title="Pedidos Totales" value={stats.totalOrders} color="#3498db" icon="📦" />
                <StatCard title="Pedidos Pendientes" value={stats.pendingOrders} color="#f1c40f" icon="⏳" />
                <StatCard title="Clientes Registrados" value={stats.totalCustomers} color="#e74c3c" icon="👥" />
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
                        {orders.slice(0, 5).map((order, index) => (
                            <li key={`${order.created_at}-${index}`}>
                                <span>{order.customers?.name || 'Cliente'}</span>
                                <span className={`${styles.statusBadge} ${styles[order.status]}`}>{order.status.replace('_',' ')}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}