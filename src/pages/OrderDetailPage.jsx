import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useCustomer } from '../context/CustomerContext'; // Asegúrate que la ruta sea correcta
import { supabase } from '../lib/supabaseClient'; // Asegúrate que la ruta sea correcta
import LoadingSpinner from '../components/LoadingSpinner'; // Asegúrate que la ruta sea correcta
import ImageWithFallback from '../components/ImageWithFallback'; // Asegúrate que la ruta sea correcta
import SEO from '../components/SEO'; // Asegúrate que la ruta sea correcta
import styles from '../pages/MyOrders.module.css'; // Reutilizamos estilos de MyOrders para consistencia

export default function OrderDetailPage() {
    const { orderCode } = useParams();
    const [order, setOrder] = useState(null);
    // Este estado de carga es solo para la BÚSQUEDA del pedido
    const [loading, setLoading] = useState(true); 
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    // --- ¡MODIFICACIÓN CLAVE! ---
    // 1. Obtenemos 'isCustomerLoading' del contexto
    const { phone, setPhoneModalOpen, isCustomerLoading } = useCustomer();

    // Efecto para buscar los datos del pedido
    useEffect(() => {
        const fetchOrderDetails = async () => {
            setLoading(true);
            setError(null);
            setOrder(null);

            try {
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
                    .maybeSingle(); 

                if (fetchError) {
                    console.error("Error fetching order:", fetchError);
                    throw new Error('Hubo un problema al buscar tu pedido.');
                }

                if (!data) {
                    throw new Error(`No se encontró ningún pedido con el código ${orderCode}. Verifica el enlace.`);
                }
                
                setOrder(data);

            } catch (err) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        // --- LÓGICA DE FLUJO UNIFICADO ---
        
        // 2. Esperamos a que la comprobación de sesión termine
        if (isCustomerLoading) {
            // Aún no sabemos si el usuario está logueado o no.
            // Mantenemos 'loading' en true (ver render) y no hacemos nada.
            setLoading(true);
            return;
        }

        // 3. La comprobación de sesión TERMINÓ. Ahora decidimos qué hacer.
        if (phone) {
            // CASO A: El usuario ESTÁ logueado. Redirigir.
            navigate('/mis-pedidos', { replace: true });
        } else if (orderCode) {
            // CASO B: El usuario NO está logueado y hay un orderCode. Buscar pedido.
            fetchOrderDetails();
        } else {
            // CASO C: El usuario NO está logueado y NO hay orderCode. Mostrar error.
            setError('No se proporcionó un código de pedido en el enlace.');
            setLoading(false);
        }

    }, [orderCode, phone, isCustomerLoading, navigate]); // 4. Depende de la carga del cliente


    // --- LÓGICA DE RENDERIZADO LIMPIA ---

    // 5. Mostrar spinner si la SESIÓN o el PEDIDO están cargando.
    //    Esto cubre ambos casos y evita la pantalla en blanco.
    if (isCustomerLoading || loading) {
        return <LoadingSpinner />;
    }

    // 6. Si el usuario está logueado, estamos redirigiendo.
    //    (Este render puede ocurrir por un instante ANTES de que navigate() termine)
    //    Al mostrar un spinner, la transición es limpia.
    if (phone) {
        return <LoadingSpinner />;
    }

    // 7. Si hay un error (ya sea por 'fetch' o por falta de orderCode)
    if (error) {
        return (
            <>
                <SEO
                    title="Error al Cargar Pedido"
                    description="No se pudo cargar la información del pedido"
                />
                <div className={styles.errorContainer}>
                    <div className={styles.errorBox}>
                        <h1 className={styles.errorTitle}>Error al Cargar Pedido</h1>
                        <p className={styles.errorMessage}>{error}</p>
                        <Link to="/" className={styles.errorButton}>
                            Volver al Inicio
                        </Link>
                    </div>
                </div>
            </>
        );
    }

    // 8. Si no hay error, no cargamos, no estamos logueados, PERO no se encontró el pedido
    if (!order) {
        return (
            <>
                <SEO
                    title="Pedido No Encontrado"
                    description="El pedido solicitado no existe"
                />
                <div className={styles.errorContainer}>
                    <div className={styles.errorBox}>
                        <h1 className={styles.errorTitle}>Pedido No Encontrado</h1>
                        <p className={styles.errorMessage}>
                            No pudimos encontrar los detalles para el pedido {orderCode}.
                        </p>
                        <Link to="/" className={styles.errorButton}>
                            Volver al Inicio
                        </Link>
                    </div>
                </div>
            </>
        );
    }

    // --- Si llegamos aquí, todo es correcto y mostramos el pedido ---

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
            <SEO
                title={`Detalles Pedido #${order.order_code} - Entre Alas`}
                description={`Consulta el estado y los detalles de tu pedido #${order.order_code} en Entre Alas.`}
                name="Entre Alas"
                type="website"
            />
            <div className={styles.container}>
                <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Detalles del Pedido</h1>
                
                <div className={`${styles.orderCard} ${styles.open}`}>
                    
                    <div className={styles.cardHeader}>
                        <span>Pedido #{order.order_code}</span>
                        <div className={styles.headerInfo}>
                            <span className={`${styles.status} ${styles[order.status]}`}>
                                {order.status.replace('_', ' ')}
                            </span>
                        </div>
                    </div>
                    <div className={styles.orderDetails} style={{ maxHeight: 'none', borderTop: '1px solid var(--border-color)', padding: '1.5rem' }}>
                        <p><strong>Fecha:</strong> {new Date(order.created_at).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}</p>

                        {formattedScheduledTime && (
                            <p style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>
                                <strong>Programado para:</strong> {formattedScheduledTime}
                            </p>
                        )}

                        <h4>Productos:</h4>
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

                        {order.status === 'cancelado' && order.cancellation_reason && (
                            <p className={styles.cancellationReason}>
                                <strong>Motivo de Cancelación:</strong> {order.cancellation_reason}
                            </p>
                        )}

                        <div className={styles.orderFooter} style={{ borderTop: '1px solid var(--border-color)', marginTop: '1rem', paddingTop: '1rem' }}>
                            <strong>Total: ${order.total_amount.toFixed(2)}</strong>
                        </div>
                    </div>
                </div>
                
                {/* El prompt de login. Ya que 'phone' es null, esto se mostrará correctamente. */}
                {!phone && (
                    <div className={styles.loginPrompt}>
                        <h4>¡Crea tu cuenta con solo tu número!</h4>
                        <p>Al ingresar tu número podrás:</p>
                        <ul>
                            <li>Hacer pedidos futuros más rápido.</li>
                            <li>Ganar recompensas y descuentos.</li>
                            <li>Recibir notificaciones de tus pedidos.</li>
                            <li>Guardar tus direcciones, favoritos y reseñas a nuestros productos.</li>
                        </ul>
                        <button 
                            onClick={() => setPhoneModalOpen(true)}
                            className={styles.promptActionButton}
                        >
                            Ingresar mi número
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
