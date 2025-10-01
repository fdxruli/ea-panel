// src/pages/Dashboard.jsx (NUEVO Y MEJORADO)
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from './Dashboard.module.css'; // Nuevos estilos

// --- Componente de Tarjeta de Estadística ---
const StatCard = ({ title, value, icon, color }) => (
    <div className={styles.statCard}>
        <div className={styles.iconWrapper} style={{ backgroundColor: color }}>
            {icon}
        </div>
        <div className={styles.statInfo}>
            <span className={styles.statValue}>{value}</span>
            <span className={styles.statTitle}>{title}</span>
        </div>
    </div>
);

export default function Dashboard() {
  const [stats, setStats] = useState({
      totalOrders: 0,
      totalRevenue: 0,
      pendingOrders: 0,
      totalCustomers: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
        setLoading(true);

        const { data: orders, error: ordersError } = await supabase.from('orders').select('status, total_amount');
        const { count: customersCount, error: customersError } = await supabase.from('customers').select('*', { count: 'exact' });

        if (ordersError || customersError) {
            console.error(ordersError || customersError);
        } else {
            const totalRevenue = orders.reduce((sum, order) => order.status === 'completado' ? sum + order.total_amount : sum, 0);
            const pendingOrders = orders.filter(o => o.status === 'pendiente').length;

            setStats({
                totalOrders: orders.length,
                totalRevenue: totalRevenue.toFixed(2),
                pendingOrders: pendingOrders,
                totalCustomers: customersCount
            });
        }
        setLoading(false);
    }
    fetchStats();
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Dashboard</h1>
      <p className={styles.subtitle}>Resumen del estado de tu negocio.</p>

      <div className={styles.statsGrid}>
          <StatCard title="Pedidos Totales" value={stats.totalOrders} color="#3498db" icon="📦"/>
          <StatCard title="Ingresos (Completados)" value={`$${stats.totalRevenue}`} color="#2ecc71" icon="💰"/>
          <StatCard title="Pedidos Pendientes" value={stats.pendingOrders} color="#f1c40f" icon="⏳"/>
          <StatCard title="Clientes Registrados" value={stats.totalCustomers} color="#e74c3c" icon="👥"/>
      </div>
      
      {/* Aquí podrías añadir gráficos u otras secciones en el futuro */}
    </div>
  );
}