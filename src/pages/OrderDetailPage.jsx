import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient'; // Asegúrate que la ruta sea correcta
import LoadingSpinner from '../components/LoadingSpinner'; // Asegúrate que la ruta sea correcta
import ImageWithFallback from '../components/ImageWithFallback'; // Asegúrate que la ruta sea correcta
import SEO from '../components/SEO'; // Asegúrate que la ruta sea correcta
import styles from '../pages/MyOrders.module.css'; // Reutilizamos estilos de MyOrders para consistencia

// Componente para la página pública de detalles del pedido
export default function OrderDetailPage() {
    // Obtener el orderCode de los parámetros de la URL
    const { orderCode } = useParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Efecto para buscar los datos del pedido cuando el orderCode cambia
    useEffect(() => {
        const fetchOrderDetails = async () => {
            setLoading(true);
            setError(null);
            setOrder(null); // Limpia el pedido anterior mientras carga

            try {
                // Consulta a Supabase filtrando por order_code
                // Incluye datos relacionados de order_items y products
                const { data, error: fetchError } = await supabase
                    .from('orders')
                    .select(`
                        id,
                        order_code,
                        created_at,
                        status,
                        total_amount,
                        cancellation_reason,
                        scheduled_for,
                        order_items (
                            id,
                            quantity,
                            price,
                            products (
                                id,
                                name,
                                image_url
                            )
                        )
                    `)
                    .eq('order_code', orderCode)
                    .maybeSingle(); // .maybeSingle() devuelve null si no se encuentra, en lugar de un array vacío

                if (fetchError) {
                    // Si hay un error en la consulta
                    console.error("Error fetching order:", fetchError);
                    throw new Error('Hubo un problema al buscar tu pedido.');
                }

                if (!data) {
                    // Si no se encontró ningún pedido con ese código
                    throw new Error(`No se encontró ningún pedido con el código ${orderCode}. Verifica el enlace.`);
                }

                // Si se encontró el pedido, actualizar el estado
                setOrder(data);

            } catch (err) {
                // Capturar errores (incluido el de "Pedido no encontrado")
                setError(err.message);
            } finally {
                // Quitar el indicador de carga
                setLoading(false);
            }
        };

        // Solo ejecutar la búsqueda si hay un orderCode
        if (orderCode) {
            fetchOrderDetails();
        } else {
            // Si no hay orderCode en la URL
            setError('No se proporcionó un código de pedido en el enlace.');
            setLoading(false);
        }
    }, [orderCode]); // Este efecto se re-ejecuta si el orderCode cambia

    // --- Renderizado Condicional ---

    if (loading) {
        return <LoadingSpinner />;
    }

    if (error) {
        // Mostrar mensaje de error con un enlace para volver al inicio
        return (
            <div className={styles.container}>
                <div className={styles.prompt}>
                    <h2>Error al Cargar Pedido</h2>
                    <p>{error}</p>
                    <Link to="/" className="admin-button-primary">Volver al Inicio</Link>
                </div>
            </div>
        );
    }

    if (!order) {
        // Aunque teóricamente cubierto por el error, es buena práctica tenerlo
        return (
            <div className={styles.container}>
                 <div className={styles.prompt}>
                    <h2>Pedido No Encontrado</h2>
                    <p>No pudimos encontrar los detalles para el pedido {orderCode}.</p>
                    <Link to="/" className="admin-button-primary">Volver al Inicio</Link>
                </div>
            </div>
        );
    }

    // --- Renderizado del Pedido Encontrado ---

    // Función para formatear fecha programada (si existe)
    const formatScheduledTime = (isoString) => {
        if (!isoString) return null;
        try {
            const date = new Date(isoString);
            const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
            const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: true };
            return `${date.toLocaleDateString('es-MX', dateOptions)} a las ${date.toLocaleTimeString('es-MX', timeOptions)}`;
        } catch (e) {
            return "Fecha inválida";
        }
    };

    const formattedScheduledTime = formatScheduledTime(order.scheduled_for);

    return (
        <>
            {/* SEO para la página específica del pedido */}
            <SEO
                title={`Detalles Pedido #${order.order_code} - Entre Alas`}
                description={`Consulta el estado y los detalles de tu pedido #${order.order_code} en Entre Alas.`}
                name="Entre Alas"
                type="website"
            />
            {/* Usamos el contenedor principal de MyOrders para consistencia */}
            <div className={styles.container}>
                {/* Título específico para esta página */}
                <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Detalles del Pedido</h1>

                {/* Tarjeta para mostrar la información, similar a MyOrders */}
                <div className={`${styles.orderCard} ${styles.open}`}> {/* Forzamos a que esté "abierta" */}
                    <div className={styles.cardHeader}>
                        <span>Pedido #{order.order_code}</span>
                        <div className={styles.headerInfo}>
                            {/* Mostramos el status */}
                            <span className={`${styles.status} ${styles[order.status]}`}>
                                {order.status.replace('_', ' ')}
                            </span>
                        </div>
                    </div>
                    {/* Contenido de los detalles */}
                    <div className={styles.orderDetails} style={{ maxHeight: 'none', borderTop: '1px solid var(--border-color)', padding: '1.5rem' }}>
                        <p><strong>Fecha:</strong> {new Date(order.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>

                        {/* Mostrar si está programado */}
                        {formattedScheduledTime && (
                             <p style={{ fontWeight: 'bold', color: 'var(--color-primary)'}}>
                                <strong>Programado para:</strong> {formattedScheduledTime}
                            </p>
                        )}

                        {/* Lista de productos */}
                        <h4>Productos:</h4>
                        {/* Validamos que order_items exista y tenga elementos */}
                        {order.order_items && order.order_items.length > 0 ? (
                            <ul>
                                {order.order_items.map(item => (
                                    <li key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                                             <ImageWithFallback
                                                src={item.products?.image_url || ''}
                                                alt={item.products?.name || 'Producto'}
                                                style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }}
                                            />
                                            <span>{item.quantity}x {item.products?.name || 'Producto no disponible'}</span>
                                        </div>
                                        <span>${(item.price * item.quantity).toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p>No se encontraron los productos de este pedido.</p>
                        )}

                        {/* Motivo de cancelación si existe */}
                        {order.status === 'cancelado' && order.cancellation_reason && (
                            <p className={styles.cancellationReason}>
                                <strong>Motivo de Cancelación:</strong> {order.cancellation_reason}
                            </p>
                        )}

                        {/* Total */}
                        <div className={styles.orderFooter} style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem' }}>
                            <strong>Total: ${order.total_amount.toFixed(2)}</strong>
                            {/* No incluimos botones de acción aquí */}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}