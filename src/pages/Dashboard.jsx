// src/pages/Dashboard.jsx (MODIFICADO)
import React, { useEffect, useState, useCallback, useRef } from "react"; // <-- Añade useRef
import { supabase } from "../lib/supabaseClient";
import LoadingSpinner from "../components/LoadingSpinner";
import styles from './Dashboard.module.css';
import { useAlert } from '../context/AlertContext'; // <-- Importa useAlert
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
// ... (resto de imports y componentes StatCard, OrderStatusChart, TopProductsChart sin cambios) ...

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement);

// --- Componente StatCard (sin cambios) ---
const StatCard = ({ title, value, icon, color, evolution }) => (
    // ... (código JSX existente) ...
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

// --- Componente OrderStatusChart (sin cambios) ---
const OrderStatusChart = ({ orders }) => {
     // ... (código JSX y lógica existente) ...
    const statusCounts = orders.reduce((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
    }, {});

    const data = {
        labels: Object.keys(statusCounts),
        datasets: [{
            data: Object.values(statusCounts),
            backgroundColor: ['#f1c40f', '#3498db', '#2ecc71', '#e74c3c'], // Ajusta colores si tienes más estados
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

// --- Componente TopProductsChart (sin cambios) ---
const TopProductsChart = ({ items }) => {
    // ... (código JSX y lógica existente) ...
      const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const checkSize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', checkSize);
        return () => window.removeEventListener('resize', checkSize);
    }, []);

    const productCounts = items.reduce((acc, item) => {
        const productName = item.products?.name || 'Producto Desconocido';
        acc[productName] = (acc[productName] || 0) + item.quantity;
        return acc;
    }, {});

    const sortedProducts = Object.entries(productCounts).sort(([, a], [, b]) => b - a).slice(0, 5);

    const getLabels = () => {
        return sortedProducts.map(([name]) => {
            if (isMobile && name.length > 15) {
                return name.substring(0, 12) + '...'; // Acortar nombres largos en móvil
            }
            return name;
        });
    };

    const data = {
        labels: getLabels(),
        datasets: [{
            label: 'Cantidad Vendida',
            data: sortedProducts.map(([, count]) => count),
            backgroundColor: 'rgba(229, 115, 115, 0.6)',
            borderColor: 'rgba(229, 115, 115, 1)',
            borderWidth: 1,
        }],
    };

    const options = {
        indexAxis: isMobile ? 'x' : 'y', // <-- Eje condicional
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
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
            x: { ticks: { maxRotation: isMobile ? 25 : 0, minRotation: isMobile ? 25 : 0, } },
            y: { ticks: { stepSize: 1 } }
        }
    };
    return <Bar data={data} options={options} />;
};


export default function Dashboard() {
    const { showAlert } = useAlert(); // <-- Usa el hook de alerta
    const [stats, setStats] = useState({ /* ... estado inicial ... */ });
    const [orders, setOrders] = useState([]);
    const [orderItems, setOrderItems] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- Estados para el modo mantenimiento ---
    const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
    const [loadingMaintenance, setLoadingMaintenance] = useState(true);
    const [maintenanceMessage, setMaintenanceMessage] = useState('');
    
    // Usamos useRef para evitar que la suscripción se cree múltiples veces
    const channelRef = useRef(null);

    // --- 1. useCallback para la función de carga de datos ---
    const fetchData = useCallback(async () => {
        console.log("Fetching dashboard data...");
        // setLoading(true); // No necesitas setLoading(true) aquí si se llama desde useEffect inicial
        try {
            // Mantenemos las 3 peticiones en paralelo
            const ordersPromise = supabase.from('orders').select('status, total_amount, created_at, customers (name)').order('created_at', { ascending: false });
            const customersPromise = supabase.from('customers').select('*', { count: 'exact' });
            const itemsPromise = supabase.from('order_items').select('quantity, products(name)');
            const maintenancePromise = supabase.from('settings').select('value').eq('key', 'maintenance_mode').single(); // <-- Añadimos la petición de settings aquí

            const [ordersRes, customersRes, itemsRes, maintenanceRes] = await Promise.all([
                ordersPromise, customersPromise, itemsPromise, maintenancePromise
            ]);

            // Procesar resultados de estadísticas
            if (ordersRes.error || customersRes.error || itemsRes.error) {
                console.error(ordersRes.error || customersRes.error || itemsRes.error);
                showAlert('Error al cargar estadísticas.'); // <-- Usa showAlert
            } else {
                const ordersData = ordersRes.data || [];
                const customersCount = customersRes.count || 0;
                const itemsData = itemsRes.data || [];

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

            // Procesar resultado de modo mantenimiento
            if (maintenanceRes.error && maintenanceRes.error.code !== 'PGRST116') { // Ignora error "not found" si la key no existe aún
                 console.error(maintenanceRes.error);
                 showAlert('Error al cargar estado de mantenimiento.');
            } else if (maintenanceRes.data) {
                setMaintenanceEnabled(maintenanceRes.data.value.enabled);
                setMaintenanceMessage(maintenanceRes.data.value.message);
            }

        } catch (error) {
            console.error("Error general en fetchData:", error);
            showAlert('Ocurrió un error inesperado al cargar los datos.');
        } finally {
            setLoading(false); // <-- Solo un setLoading(false) al final
            setLoadingMaintenance(false); // <-- También para el estado de mantenimiento
        }
    }, [showAlert]); // <-- showAlert como dependencia de useCallback

    // --- 2. useEffect para la carga inicial ---
    useEffect(() => {
        fetchData(); // Llama a la función de carga al montar
        
        // --- 3. useEffect para la suscripción en tiempo real ---
        // Solo creamos la suscripción si no existe ya
        if (!channelRef.current) {
            console.log("Setting up real-time subscription...");
            channelRef.current = supabase.channel('public:dashboard_changes')
              .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, (payload) => {
                console.log('¡Cambio en pedidos detectado!', payload);
                // En lugar de llamar a fetchStats (que ya no existe), podemos ser más específicos
                // o simplemente volver a cargar todo con fetchData si es más simple
                fetchData(); // Volvemos a cargar todo para simplificar
              })
              .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'settings', filter: 'key=eq.maintenance_mode' }, (payload) => {
                 console.log('¡Cambio en modo mantenimiento detectado!', payload);
                 const newValue = payload.new.value;
                 // Actualizar directamente el estado local
                 setMaintenanceEnabled(newValue.enabled);
                 setMaintenanceMessage(newValue.message);
                 setLoadingMaintenance(false); // <-- Asegurar que el loader se oculte
              })
              .subscribe((status) => {
                  if (status === 'SUBSCRIBED') {
                      console.log('Real-time channel subscribed.');
                  } else {
                      console.log('Real-time channel status:', status);
                  }
              });
        }
        
        // Función de limpieza para desuscribirse al desmontar el componente
        return () => {
            if (channelRef.current) {
                console.log("Unsubscribing from real-time channel...");
                supabase.removeChannel(channelRef.current)
                    .then(() => { channelRef.current = null; }) // Limpia la referencia
                    .catch(error => console.error("Error removing channel:", error));
            }
        };
    }, [fetchData]); // <-- fetchData es ahora una dependencia estable gracias a useCallback

    // --- Función para activar/desactivar modo mantenimiento (igual que antes) ---
    const toggleMaintenanceMode = async () => {
        const newState = !maintenanceEnabled;
        setLoadingMaintenance(true); // Mostrar "Actualizando..."

        const { error } = await supabase
            .from('settings')
            .update({ value: { enabled: newState, message: maintenanceMessage } })
            .eq('key', 'maintenance_mode');

        // Independientemente de si la suscripción funciona o no,
        // quitamos el estado de carga DESPUÉS de que la operación termine.
        setLoadingMaintenance(false); // <-- MOVIDO AQUÍ

        if (error) {
            showAlert(`Error al cambiar modo mantenimiento: ${error.message}`);
            // Revertir el estado visual local si la actualización falló
            setMaintenanceEnabled(!newState);
        } else {
            showAlert(`Modo mantenimiento ${newState ? 'activado' : 'desactivado'}.`);
            // Actualizar el estado local inmediatamente si tuvo éxito
            setMaintenanceEnabled(newState);
        }
    };
    
    // --- Función para guardar el mensaje (igual que antes) ---
    const handleMessageChange = async () => {
        setLoadingMaintenance(true); // Mostrar "Actualizando..."
        const { error } = await supabase
            .from('settings')
            .update({ value: { enabled: maintenanceEnabled, message: maintenanceMessage } })
            .eq('key', 'maintenance_mode');

        // Quitar el estado de carga DESPUÉS de que termine
        setLoadingMaintenance(false); // <-- MOVIDO AQUÍ

        if (error) {
            showAlert(`Error al guardar mensaje: ${error.message}`);
            // Podrías recargar el mensaje original si falló, aunque es menos crítico
            // fetchData(); // Opcional: recargar todo si falla
        } else {
            showAlert('Mensaje de mantenimiento guardado.');
            // El estado local `maintenanceMessage` ya está actualizado por el `onChange` del textarea
        }
    };

    // --- Renderizado (sin cambios en la estructura principal) ---
    if (loading) return <LoadingSpinner />;

    return (
        <div className={styles.container}>
            {/* ... (Header y StatsGrid sin cambios) ... */}
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

            {/* --- Sección de Modo Mantenimiento (igual que antes) --- */}
            <div className={styles.maintenanceCard}> {/* Añade estilos para esta tarjeta si no los tienes */}
                <h2>Modo Mantenimiento</h2>
                 {loadingMaintenance && !loading ? <p>Actualizando estado...</p> : ( // Muestra "Actualizando" si solo está cargando el estado de mantenimiento
                    <>
                        <div className={styles.toggleControl}>
                            <label htmlFor="maintenance-toggle">
                                {maintenanceEnabled ? 'Sitio CERRADO para clientes' : 'Sitio ABIERTO para clientes'}
                            </label>
                            {/* Un checkbox simple o un switch visual CSS */}
                            <input
                                type="checkbox"
                                id="maintenance-toggle"
                                checked={maintenanceEnabled}
                                onChange={toggleMaintenanceMode}
                                // disabled={!hasPermission('configuracion.edit')}
                            />
                        </div>
                        <div className={styles.messageControl}>
                           <label htmlFor="maintenance-message">Mensaje a mostrar:</label>
                           <textarea
                               id="maintenance-message"
                               rows="3"
                               value={maintenanceMessage}
                               onChange={(e) => setMaintenanceMessage(e.target.value)}
                               // disabled={!hasPermission('configuracion.edit')}
                           />
                           <button onClick={handleMessageChange} disabled={loadingMaintenance}>
                               Guardar Mensaje
                           </button>
                        </div>
                    </>
                )}
            </div>
            
            {/* --- Gráficos (sin cambios) --- */}
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
                            <li key={`${order.created_at}-${index}`}> {/* Usa una key más robusta si es posible */}
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
