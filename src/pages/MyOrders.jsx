import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import { useCart } from '../context/CartContext';
import { useSettings } from '../context/SettingsContext';
import LoadingSpinner from '../components/LoadingSpinner';
import EditOrderModal from '../components/EditOrderModal';
import ConfirmModal from '../components/ConfirmModal';
import CancellationRequestModal from '../components/CancellationRequestModal';
import AuthPrompt from '../components/AuthPrompt';
import SEO from '../components/SEO';
import OrderStatusStepper from '../components/OrderStatusStepper';
import { getWhatsAppUrl } from '../services/whatsappService';
import styles from './MyOrders.module.css';

const ORDERS_PER_PAGE = 6;

export default function MyOrders() {
    const { phone, setCheckoutModalOpen } = useCustomer();
    const { cartItems, replaceCart, toggleCart, showToast } = useCart();
    const navigate = useNavigate();

    const { customer, orders, loading: userLoading, refetch } = useUserData();
    const { settings, loading: settingsLoading } = useSettings();
    const visibilitySettings = settings.client_visibility || {};

    const [editingOrder, setEditingOrder] = useState(null);
    const [orderToCancel, setOrderToCancel] = useState(null);
    const [isRequestingCancel, setIsRequestingCancel] = useState(false);
    const [orderToReorder, setOrderToReorder] = useState(null);
    const [openOrderIds, setOpenOrderIds] = useState([]);
    const [filterTab, setFilterTab] = useState('todos'); // 'todos' | 'activos' | 'completados' | 'cancelados'
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [copiedOrderCode, setCopiedOrderCode] = useState(null);

    const loading = userLoading || settingsLoading;

    // Clasificación de pedidos
    const { activeOrders, pastOrders, completedOrders, cancelledOrders, latestOrder } = useMemo(() => {
        if (!orders || !Array.isArray(orders)) {
            return { activeOrders: [], pastOrders: [], completedOrders: [], cancelledOrders: [], latestOrder: null };
        }
        const active = orders.filter(o => ['pendiente', 'en_proceso', 'en_envio'].includes(o.status));
        const past = orders.filter(o => !['pendiente', 'en_proceso', 'en_envio'].includes(o.status));
        const completed = orders.filter(o => o.status === 'completado');
        const cancelled = orders.filter(o => o.status === 'cancelado');
        const latest = orders.length > 0 ? orders[0] : null;

        return {
            activeOrders: active,
            pastOrders: past,
            completedOrders: completed,
            cancelledOrders: cancelled,
            latestOrder: latest,
        };
    }, [orders]);

    // Filtrado y búsqueda
    const filteredOrders = useMemo(() => {
        if (!orders || !Array.isArray(orders)) return [];
        let list = orders;

        if (filterTab === 'activos') {
            list = activeOrders;
        } else if (filterTab === 'completados') {
            list = completedOrders;
        } else if (filterTab === 'cancelados') {
            list = cancelledOrders;
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase().trim();
            list = list.filter(order => {
                const matchCode = String(order.order_code || '').toLowerCase().includes(query);
                const matchItems = order.order_items?.some(item =>
                    item.products?.name?.toLowerCase().includes(query)
                );
                return matchCode || matchItems;
            });
        }

        return list;
    }, [orders, filterTab, searchQuery, activeOrders, completedOrders, cancelledOrders]);

    // Paginación
    const totalPages = Math.ceil(filteredOrders.length / ORDERS_PER_PAGE) || 1;
    const paginatedOrders = useMemo(() => {
        const start = (currentPage - 1) * ORDERS_PER_PAGE;
        return filteredOrders.slice(start, start + ORDERS_PER_PAGE);
    }, [filteredOrders, currentPage]);

    useEffect(() => {
        setCurrentPage(1);
    }, [filterTab, searchQuery]);

    // Abrir automáticamente el primer pedido activo si existe
    useEffect(() => {
        if (activeOrders.length > 0) {
            setOpenOrderIds(prev => Array.from(new Set([...prev, activeOrders[0].id])));
        }
    }, [activeOrders]);

    // Escuchar actualizaciones de tiempo real
    useEffect(() => {
        const handleStatusUpdate = (e) => {
            const { orderCode, status } = e.detail;
            const statusText = status.replace('_', ' ').toUpperCase();
            showToast(`Tu pedido #${orderCode} ahora está: ${statusText}`);
            refetch();
        };

        window.addEventListener('order-status-updated', handleStatusUpdate);
        return () => {
            window.removeEventListener('order-status-updated', handleStatusUpdate);
        };
    }, [showToast, refetch]);

    const handleToggleOrder = (orderId) => {
        setOpenOrderIds(prev =>
            prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
        );
    };

    const handleCopyCode = (e, orderCode) => {
        e.stopPropagation();
        if (navigator.clipboard) {
            navigator.clipboard.writeText(orderCode);
            setCopiedOrderCode(orderCode);
            showToast(`Código #${orderCode} copiado al portapapeles`);
            setTimeout(() => setCopiedOrderCode(null), 2500);
        }
    };

    const handleCancelClick = (order) => {
        if (order.status === 'pendiente') {
            setOrderToCancel(order);
        } else if (order.status === 'en_proceso') {
            setIsRequestingCancel(true);
            setOrderToCancel(order);
        }
    };

    const confirmDirectCancel = async () => {
        if (!orderToCancel) return;
        const { error: cancelError } = await supabase
            .from('orders')
            .update({ status: 'cancelado', cancellation_reason: 'Cancelado por el cliente.' })
            .eq('id', orderToCancel.id);

        if (cancelError) {
            showToast('Error al cancelar el pedido.');
        } else {
            showToast('Pedido cancelado con éxito.');
            refetch();
        }
        setOrderToCancel(null);
    };

    const handleReorder = (orderToRepeat) => {
        if (!orderToRepeat || !orderToRepeat.order_items) return;
        if (cartItems.length > 0) {
            setOrderToReorder(orderToRepeat);
        } else {
            performReorder(orderToRepeat);
        }
    };

    const performReorder = (order) => {
        const newCartItems = order.order_items
            .filter(item => item.products)
            .map(item => ({ ...item.products, quantity: item.quantity }));

        replaceCart(newCartItems);
        showToast('¡Pedido añadido al carrito!');
        navigate('/');
        setTimeout(toggleCart, 500);
    };

    const confirmReorder = () => {
        if (!orderToReorder) return;
        performReorder(orderToReorder);
        setOrderToReorder(null);
    };

    const handleOrderUpdated = useCallback(() => {
        refetch();
    }, [refetch]);

    const handleCloseModal = useCallback(() => {
        setEditingOrder(null);
    }, []);

    // Formateadores
    const formatDate = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const formatTime = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };

    const formatRelativeDate = (isoString) => {
        if (!isoString) return '';
        const d = new Date(isoString);
        const now = new Date();
        const diffMs = now - d;
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return 'Hoy';
        if (diffDays === 1) return 'Ayer';
        if (diffDays < 7) return `Hace ${diffDays} días`;
        return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    };

    // Hero KPI Bar (Sin montos monetarios)
    const renderHeroBar = () => {
        const hasActive = activeOrders.length > 0;
        const activeLabel = hasActive
            ? activeOrders[0].status === 'en_envio'
                ? 'Repartidor en camino'
                : activeOrders[0].status === 'en_proceso'
                ? 'En preparación'
                : 'Pedido recibido'
            : null;

        return (
            <div className={styles.heroCard}>
                <div className={styles.heroItem}>
                    <div className={styles.heroLabel}>Pedidos en Curso</div>
                    <div className={styles.heroValueRow}>
                        <span className={styles.heroValue}>{activeOrders.length}</span>
                        {hasActive ? (
                            <span className={styles.livePulseBadge}>
                                <span className={styles.pulseDot}></span>
                                {activeLabel}
                            </span>
                        ) : (
                            <span className={styles.heroSubText}>Sin pedidos activos</span>
                        )}
                    </div>
                </div>

                <div className={styles.heroDivider}></div>

                <div className={styles.heroItem}>
                    <div className={styles.heroLabel}>Total de Pedidos</div>
                    <div className={styles.heroValueRow}>
                        <span className={styles.heroValue}>{orders?.length || 0}</span>
                        <span className={styles.heroSubText}>realizados</span>
                    </div>
                </div>

                {latestOrder && (
                    <>
                        <div className={styles.heroDivider}></div>
                        <div className={styles.heroItem}>
                            <div className={styles.heroLabel}>Último Pedido</div>
                            <div className={styles.heroValueRow}>
                                <span className={styles.heroLatestBadge}>
                                    #{latestOrder.order_code} • {formatRelativeDate(latestOrder.created_at)}
                                </span>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    };

    // Render tarjeta individual de pedido
    const renderOrderCard = (order) => {
        const isActive = ['pendiente', 'en_proceso', 'en_envio'].includes(order.status);
        const isOpen = openOrderIds.includes(order.id);
        const dateStr = formatDate(order.created_at);
        const timeStr = formatTime(order.created_at);
        const isScheduled = !!order.scheduled_time || !!order.scheduled_for;
        const scheduledVal = order.scheduled_for || order.scheduled_time;
        const isCopied = copiedOrderCode === order.order_code;

        const whatsappHelpUrl = getWhatsAppUrl(
            `¡Hola Entre Alas! 👋 Tengo una duda sobre mi pedido #${order.order_code}. ¿Podrían ayudarme?`
        );

        return (
            <div
                key={order.id}
                className={`${styles.orderCard} ${isOpen ? styles.cardOpen : ''} ${isActive ? styles.cardActive : ''}`}
            >
                {/* Header de la tarjeta */}
                <div className={styles.cardHeader} onClick={() => handleToggleOrder(order.id)}>
                    <div className={styles.headerLeft}>
                        <div className={styles.orderCodeRow}>
                            <span className={styles.orderCode}>Pedido #{order.order_code}</span>
                            <button
                                type="button"
                                className={styles.copyBtn}
                                onClick={(e) => handleCopyCode(e, order.order_code)}
                                title="Copiar número de pedido"
                            >
                                {isCopied ? (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : (
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                )}
                            </button>
                        </div>
                        <span className={styles.orderDateTime}>{dateStr} • {timeStr}</span>

                        {isScheduled && (
                            <span className={styles.scheduledBadge}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <polyline points="12 6 12 12 16 14" />
                                </svg>
                                Programado: {scheduledVal}
                            </span>
                        )}
                    </div>

                    <div className={styles.headerRight}>
                        <span className={`${styles.statusBadge} ${styles[order.status]}`}>
                            {isActive && <span className={styles.statusDot}></span>}
                            {order.status.replace('_', ' ')}
                        </span>
                        <div className={styles.chevronIcon}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m6 9 6 6 6-6" />
                            </svg>
                        </div>
                    </div>
                </div>

                {/* Seguimiento visual en vivo (siempre visible para pedidos activos) */}
                {isActive && (
                    <div className={styles.activeStepperBox}>
                        <OrderStatusStepper status={order.status} compact={false} />
                    </div>
                )}

                {/* Contenido desplegable */}
                <div className={styles.cardCollapse}>
                    <div className={styles.cardCollapseInner}>
                        {/* Stepper para completados / cancelados si se abre la tarjeta */}
                        {!isActive && (
                            <div className={styles.completedStepperBox}>
                                <OrderStatusStepper
                                    status={order.status}
                                    cancellationReason={order.cancellation_reason}
                                    compact={true}
                                />
                            </div>
                        )}

                        {/* Lista de productos tipo ticket */}
                        <div className={styles.itemsTicket}>
                            <div className={styles.ticketTitle}>Productos</div>
                            <div className={styles.itemsList}>
                                {order.order_items?.map(item => (
                                    <div key={item.id} className={styles.itemRow}>
                                        <div className={styles.itemMain}>
                                            <span className={styles.itemQty}>{item.quantity}x</span>
                                            <span className={styles.itemName}>
                                                {item.products?.name || 'Producto no disponible'}
                                            </span>
                                        </div>
                                        <span className={styles.itemPrice}>
                                            ${(item.price * item.quantity).toFixed(2)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Información de entrega */}
                        {order.address && (
                            <div className={styles.deliveryBlock}>
                                <div className={styles.infoLabel}>Dirección de entrega:</div>
                                <div className={styles.infoValue}>{order.address}</div>
                            </div>
                        )}

                        {/* Notas */}
                        {order.notes && (
                            <div className={styles.notesBlock}>
                                <div className={styles.infoLabel}>Notas:</div>
                                <div className={styles.infoValue}>{order.notes}</div>
                            </div>
                        )}

                        {/* Total del pedido */}
                        <div className={styles.totalBlock}>
                            <span className={styles.totalLabel}>Total del pedido</span>
                            <span className={styles.totalAmount}>${order.total_amount.toFixed(2)}</span>
                        </div>

                        {/* Botones de acción */}
                        <div className={styles.cardActions}>
                            {/* Botón Ver Seguimiento / Ticket Detallado */}
                            <Link
                                to={`/mis-pedidos/${order.order_code}`}
                                className={`${styles.actionBtn} ${styles.detailBtn}`}
                            >
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="16" y1="13" x2="8" y2="13" />
                                    <line x1="16" y1="17" x2="8" y2="17" />
                                    <polyline points="10 9 9 9 8 9" />
                                </svg>
                                Ver Detalle / Ticket
                            </Link>

                            {/* Ayuda por WhatsApp si está activo */}
                            {isActive && (
                                <a
                                    href={whatsappHelpUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={`${styles.actionBtn} ${styles.whatsappBtn}`}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12.031 6.172c-3.181 0-5.767 2.586-5.768 5.766-.001 1.298.38 2.27 1.019 3.287l-.711 2.598 2.667-.699c.974.531 1.848.815 2.793.815 3.182 0 5.769-2.587 5.77-5.768 0-3.181-2.587-5.769-5.77-5.769zm3.376 8.212c-.144.405-.837.774-1.17.824-.312.045-.698.077-2.146-.523-1.722-.714-2.825-2.457-2.91-2.571-.086-.114-.691-.919-.691-1.753 0-.834.437-1.244.593-1.413.155-.17.34-.212.453-.212.113 0 .227 0 .326.005.106.005.248-.04.388.297.144.35.493 1.2.535 1.286.043.085.071.185.014.298-.056.113-.085.184-.17.284-.085.099-.179.222-.256.298-.085.085-.174.177-.075.347.099.17.441.727.947 1.177.652.58 1.202.76 1.372.845.17.085.27.071.37-.042.099-.114.425-.496.538-.666.114-.17.227-.142.383-.085.156.057.99.467 1.16.552.17.085.284.127.326.198.043.071.043.411-.101.816z"/>
                                    </svg>
                                    Ayuda WhatsApp
                                </a>
                            )}

                            {/* Modificar si está pendiente */}
                            {order.status === 'pendiente' && (
                                <button
                                    type="button"
                                    className={`${styles.actionBtn} ${styles.editBtn}`}
                                    onClick={() => setEditingOrder(order)}
                                >
                                    Modificar
                                </button>
                            )}

                            {/* Cancelar pedido */}
                            {(order.status === 'pendiente' || order.status === 'en_proceso') && (
                                <button
                                    type="button"
                                    className={`${styles.actionBtn} ${styles.cancelBtn}`}
                                    onClick={() => handleCancelClick(order)}
                                >
                                    Cancelar Pedido
                                </button>
                            )}

                            {/* Volver a pedir */}
                            {order.status === 'completado' && (
                                <button
                                    type="button"
                                    className={`${styles.actionBtn} ${styles.reorderBtn}`}
                                    onClick={() => handleReorder(order)}
                                >
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="1 4 1 10 7 10" />
                                        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                                    </svg>
                                    Volver a Pedir
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        if (!phone) return <AuthPrompt />;
        if (loading) return <LoadingSpinner />;
        if (visibilitySettings.my_orders_page === false) {
            return (
                <div className={styles.prompt}>
                    <h2>Sección no disponible</h2>
                    <p>Esta sección está temporalmente desactivada.</p>
                </div>
            );
        }
        if (!customer) {
            return (
                <div className={styles.prompt}>
                    <h2>¡Bienvenido!</h2>
                    <p>Completa tu perfil para que podamos registrar tus pedidos.</p>
                    <button onClick={() => setCheckoutModalOpen(true, 'profile')} className={styles.primaryBtn}>
                        Completar mi perfil
                    </button>
                </div>
            );
        }

        if (!orders || orders.length === 0) {
            return (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>🛍️</div>
                    <h2>Aún no tienes pedidos</h2>
                    <p>Cuando realices tu primer pedido, podrás seguir su preparación y entrega en tiempo real aquí.</p>
                    <button onClick={() => navigate('/')} className={styles.primaryBtn}>
                        Ver Menú y Ordenar
                    </button>
                </div>
            );
        }

        return (
            <>
                {/* Hero resumen (Sin montos de dinero) */}
                {renderHeroBar()}

                {/* Filtros de estado & Barra de búsqueda */}
                <div className={styles.controlsBar}>
                    <div className={styles.filterTabs}>
                        <button
                            type="button"
                            className={`${styles.filterTab} ${filterTab === 'todos' ? styles.filterActive : ''}`}
                            onClick={() => setFilterTab('todos')}
                        >
                            Todos
                            <span className={styles.countBadge}>{orders.length}</span>
                        </button>
                        <button
                            type="button"
                            className={`${styles.filterTab} ${filterTab === 'activos' ? styles.filterActive : ''} ${activeOrders.length > 0 ? styles.hasActiveBadge : ''}`}
                            onClick={() => setFilterTab('activos')}
                        >
                            En curso
                            <span className={styles.countBadge}>{activeOrders.length}</span>
                        </button>
                        <button
                            type="button"
                            className={`${styles.filterTab} ${filterTab === 'completados' ? styles.filterActive : ''}`}
                            onClick={() => setFilterTab('completados')}
                        >
                            Entregados
                            <span className={styles.countBadge}>{completedOrders.length}</span>
                        </button>
                        {cancelledOrders.length > 0 && (
                            <button
                                type="button"
                                className={`${styles.filterTab} ${filterTab === 'cancelados' ? styles.filterActive : ''}`}
                                onClick={() => setFilterTab('cancelados')}
                            >
                                Cancelados
                                <span className={styles.countBadge}>{cancelledOrders.length}</span>
                            </button>
                        )}
                    </div>

                    <div className={styles.searchBox}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={styles.searchIcon}>
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            placeholder="Buscar pedido o producto..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={styles.searchInput}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                className={styles.clearSearchBtn}
                                onClick={() => setSearchQuery('')}
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                {/* Lista de Pedidos */}
                {filteredOrders.length > 0 ? (
                    <div className={styles.ordersListContainer}>
                        {paginatedOrders.map(order => renderOrderCard(order))}

                        {/* Paginador */}
                        {totalPages > 1 && (
                            <div className={styles.paginationControls}>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    className={styles.pageBtn}
                                    title="Página anterior"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="15 18 9 12 15 6" />
                                    </svg>
                                </button>
                                <span className={styles.pageInfo}>
                                    Página {currentPage} de {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    className={styles.pageBtn}
                                    title="Página siguiente"
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="9 18 15 12 9 6" />
                                    </svg>
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className={styles.noResultsBox}>
                        <p>No se encontraron pedidos con el criterio seleccionado.</p>
                        {(searchQuery || filterTab !== 'todos') && (
                            <button
                                type="button"
                                className={styles.resetFiltersBtn}
                                onClick={() => {
                                    setSearchQuery('');
                                    setFilterTab('todos');
                                }}
                            >
                                Ver todos los pedidos
                            </button>
                        )}
                    </div>
                )}
            </>
        );
    };

    return (
        <>
            <SEO
                title="Mis Pedidos - Entre Alas"
                description="Consulta el estado en vivo de tus pedidos, rastreo detallado, editalos o vuelve a pedir tus favoritos."
                type="website"
                noindex
            />
            <div className={styles.container}>
                <div className={styles.headerTitleRow}>
                    <h1 className={styles.pageTitle}>Mis Pedidos</h1>
                    <button
                        type="button"
                        className={styles.refreshBtn}
                        onClick={() => refetch()}
                        title="Actualizar estado de pedidos"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="23 4 23 10 17 10" />
                            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                        Actualizar
                    </button>
                </div>

                {renderContent()}

                {/* Modales existentes */}
                {editingOrder && (
                    <EditOrderModal
                        order={editingOrder}
                        onClose={handleCloseModal}
                        onOrderUpdated={handleOrderUpdated}
                    />
                )}
                <ConfirmModal
                    isOpen={!!orderToCancel && !isRequestingCancel}
                    onClose={() => setOrderToCancel(null)}
                    onConfirm={confirmDirectCancel}
                    title="¿Confirmar Cancelación?"
                >
                    Estás a punto de cancelar tu pedido. Esta acción no se puede deshacer.
                </ConfirmModal>
                <ConfirmModal
                    isOpen={!!orderToReorder}
                    onClose={() => setOrderToReorder(null)}
                    onConfirm={confirmReorder}
                    title="¿Reemplazar Carrito?"
                >
                    Tu carrito ya tiene productos. ¿Deseas vaciarlo y agregar los productos de este pedido?
                </ConfirmModal>
                {isRequestingCancel && orderToCancel && (
                    <CancellationRequestModal
                        order={orderToCancel}
                        onClose={() => {
                            setIsRequestingCancel(false);
                            setOrderToCancel(null);
                        }}
                    />
                )}
            </div>
        </>
    );
}
