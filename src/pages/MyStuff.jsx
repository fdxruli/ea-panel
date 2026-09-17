import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import { useProductExtras } from '../context/ProductExtrasContext';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductContext';
import { useAlert } from '../context/AlertContext';
import { useSettings } from '../context/SettingsContext';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import AuthPrompt from '../components/AuthPrompt';
import ImageWithFallback from '../components/ImageWithFallback';
import SEO from '../components/SEO';
import { getCache, setCache } from '../utils/cache';
import { CACHE_KEYS, CACHE_TTL } from '../config/cacheConfig';
import { broadcastStoreChange, subscribeToStoreBroadcast } from '../lib/broadcastRealtime';
import styles from './MyStuff.module.css';

const QRCodeModal = lazy(() => import('../components/QRCodeModal.jsx'));

// ============================================================================
// SVG ICONS
// ============================================================================
const HeartIcon = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
);

const StarIcon = ({ filled = true, size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? "#ffb300" : "none"} stroke={filled ? "#ffb300" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
);

const TrophyIcon = ({ size = 20 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
        <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
        <path d="M4 22h16" />
        <path d="M10 14.66V17c0 .55-.45 1-1 1H7" />
        <path d="M14 14.66V17c0 .55.45 1 1 1h2" />
        <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
    </svg>
);

const WhatsAppIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
);

const CopyIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
);

const QrCodeIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" />
        <rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" />
        <rect x="3" y="14" width="7" height="7" />
    </svg>
);

const GiftIcon = ({ size = 18 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 12 20 22 4 22 4 12" />
        <rect x="2" y="7" width="20" height="5" />
        <line x1="12" y1="22" x2="12" y2="7" />
        <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z" />
        <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
    </svg>
);

const SparkleIcon = ({ size = 16 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
);

// Componente StarRating para visualización y edición interactiva
const StarRating = ({ rating = 5, onChange = null, size = 18 }) => {
    const isInteractive = typeof onChange === 'function';

    return (
        <div className={styles.starRatingRow}>
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    className={isInteractive ? styles.ratingStarBtn : styles.starIcon}
                    onClick={() => isInteractive && onChange(star)}
                    disabled={!isInteractive}
                    title={isInteractive ? `${star} estrella${star > 1 ? 's' : ''}` : undefined}
                >
                    <StarIcon filled={star <= rating} size={size} />
                </button>
            ))}
            {!isInteractive && (
                <span className={styles.starScoreText}>{rating}/5</span>
            )}
        </div>
    );
};

// ============================================================================
// COMPONENTE PESTAÑA: RECOMPENSAS & INVITA
// ============================================================================
const RewardsAndReferralTab = ({ customer, customerId }) => {
    const { showAlert } = useAlert();
    const rewardsCacheKey = customerId ? `${CACHE_KEYS.REWARDS_PROGRESS}-${customerId}` : null;

    const [progress, setProgress] = useState(() => {
        if (!rewardsCacheKey) return null;
        const cached = getCache(rewardsCacheKey, CACHE_TTL.REWARDS_PROGRESS);
        return cached?.data || null;
    });
    const [loadingProgress, setLoadingProgress] = useState(() => {
        if (!rewardsCacheKey) return false;
        const cached = getCache(rewardsCacheKey, CACHE_TTL.REWARDS_PROGRESS);
        return !cached?.data;
    });
    const [isQrModalOpen, setQrModalOpen] = useState(false);
    const [isAccordionOpen, setIsAccordionOpen] = useState(true);

    const referralLink = `${window.location.origin}/?ref=${customer.referral_code}`;

    const handleShare = async () => {
        const shareData = {
            title: 'Entre Alas - ¡Pide tus alitas favoritas!',
            text: `¡Hola! Te invito a probar Entre Alas 🍗 Usa mi código ${customer.referral_code} al hacer tu pedido:`,
            url: referralLink,
        };

        if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
            try {
                await navigator.share(shareData);
                showAlert('¡Compartido con éxito!');
                return;
            } catch (err) {
                if (err.name === 'AbortError') return;
            }
        }

        // Fallback WhatsApp
        const whatsappMsg = encodeURIComponent(
            `¡Hola! Te invito a probar Entre Alas 🍗 Usa mi código de invitación ${customer.referral_code} al pedir:\n${referralLink}`
        );
        window.open(`https://api.whatsapp.com/send?text=${whatsappMsg}`, '_blank');
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(referralLink).then(() => {
            showAlert('¡Enlace de referido copiado al portapapeles!');
        });
    };

    const handleCopyCode = (code) => {
        navigator.clipboard.writeText(code);
        showAlert(`¡Código "${code}" copiado! Úsalo en el checkout.`);
    };

    const fetchProgress = useCallback(async (options = {}) => {
        if (!customerId) return;
        const { background = false } = options;
        if (!background && !progress) {
            setLoadingProgress(true);
        }
        try {
            const { data, error } = await supabase.rpc('get_customer_rewards_progress', { p_customer_id: customerId });
            if (!error && data) {
                setProgress(data);
                if (rewardsCacheKey) {
                    setCache(rewardsCacheKey, data, CACHE_TTL.REWARDS_PROGRESS);
                }
            }
        } catch (err) {
            console.error('Error fetching rewards progress:', err);
        } finally {
            setLoadingProgress(false);
        }
    }, [customerId, progress, rewardsCacheKey]);

    useEffect(() => {
        const cached = rewardsCacheKey ? getCache(rewardsCacheKey, CACHE_TTL.REWARDS_PROGRESS) : null;
        const isStale = !cached || cached.isStale;
        if (isStale || !cached?.data) {
            fetchProgress({ background: !!cached?.data });
        }
    }, [fetchProgress, rewardsCacheKey]);

    useEffect(() => {
        if (!customerId) return;
        const handleRevalidate = () => {
            if (document.visibilityState === 'visible') fetchProgress({ background: true });
        };
        const handleOrderStatus = (e) => {
            if (e?.detail?.status === 'completado') fetchProgress({ background: true });
        };

        window.addEventListener('visibilitychange', handleRevalidate);
        window.addEventListener('focus', handleRevalidate);
        window.addEventListener('order-status-updated', handleOrderStatus);

        return () => {
            window.removeEventListener('visibilitychange', handleRevalidate);
            window.removeEventListener('focus', handleRevalidate);
            window.removeEventListener('order-status-updated', handleOrderStatus);
        };
    }, [customerId, fetchProgress]);

    useEffect(() => {
        if (!customerId) return;
        const channel = supabase
            .channel(`customer-rewards-${customerId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `id=eq.${customerId}` }, () => fetchProgress({ background: true }))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'referral_levels' }, () => fetchProgress({ background: true }))
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rewards' }, () => fetchProgress({ background: true }))
            .subscribe();

        const unsubRewardsBroadcast = subscribeToStoreBroadcast('rewards_updated', (data) => {
            if (!data?.customerId || data.customerId === customerId) {
                fetchProgress({ background: true });
            }
        });
        const unsubOrderBroadcast = subscribeToStoreBroadcast('order_changed', () => {
            fetchProgress({ background: true });
        });

        return () => {
            supabase.removeChannel(channel);
            if (unsubRewardsBroadcast) unsubRewardsBroadcast();
            if (unsubOrderBroadcast) unsubOrderBroadcast();
        };
    }, [customerId, fetchProgress]);

    const handleClaimCode = async (reward) => {
        try {
            const { data: newCode, error } = await supabase.rpc('generate_personal_reward_code', {
                p_customer_id: customerId,
                p_reward_id: reward.id,
            });
            if (error) {
                showAlert(error.message || 'Hubo un error al generar tu código.');
            } else {
                showAlert(`¡Código personal "${newCode}" generado! Cópialo y úsalo en tu carrito.`);
                broadcastStoreChange('rewards_updated', { customerId });
                fetchProgress({ background: false });
            }
        } catch (err) {
            showAlert(err.message || 'Error inesperado al reclamar recompensa.');
        }
    };

    const currentLevel = progress?.current_level;
    const nextLevel = progress?.next_level;
    const referralCount = progress?.referral_count ?? customer.referral_count ?? 0;

    const progressPercentage = nextLevel?.min_referrals
        ? Math.min(100, Math.round((referralCount / nextLevel.min_referrals) * 100))
        : currentLevel?.name ? 100 : 0;

    const noLevelsConfigured = !currentLevel?.name && !nextLevel?.name;
    const hasReachedMaxLevel = currentLevel?.name && !nextLevel?.name;

    return (
        <div className={styles.tabContent}>
            {/* 1. Tarjeta Invita y Gana */}
            <section className={styles.card} aria-labelledby="referral-system-title">
                <div className={styles.cardHeader}>
                    <div className={styles.cardTitle}>
                        <TrophyIcon />
                        <h2 id="referral-system-title">Invita y Gana</h2>
                    </div>
                </div>
                <p className={styles.cardDescription}>
                    Comparte tu código con tus conocidos. Cuando se registren y hagan su primer pedido,
                    acumularás puntos para subir de nivel y desbloquear cortesías y descuentos exclusivos.
                </p>

                <div className={styles.referralHeroBox}>
                    <div className={styles.referralCodeDisplay}>
                        <span className={styles.referralCodeLabel}>Tu Código Único</span>
                        <span className={styles.referralCodeBadge}>{customer.referral_code}</span>
                    </div>

                    <div className={styles.referralActionsGrid}>
                        <button type="button" onClick={handleShare} className={styles.whatsappButton}>
                            <WhatsAppIcon /> Compartir por WhatsApp
                        </button>
                        <button type="button" onClick={handleCopy} className={styles.copyButton}>
                            <CopyIcon /> Copiar Enlace
                        </button>
                        <button type="button" onClick={() => setQrModalOpen(true)} className={styles.qrButton}>
                            <QrCodeIcon /> Código QR
                        </button>
                    </div>
                </div>

                <div className={styles.referralStatsLine}>
                    <span>Amigos que se han registrado con tu código:</span>
                    <strong>{customer.referral_count || 0} amigos</strong>
                </div>

                {isQrModalOpen && (
                    <Suspense fallback={<LoadingSpinner />}>
                        <QRCodeModal
                            url={referralLink}
                            onClose={() => setQrModalOpen(false)}
                        />
                    </Suspense>
                )}
            </section>

            {/* 2. Tarjeta Mis Recompensas */}
            <section className={styles.card} aria-labelledby="rewards-progress-title">
                <div className={styles.cardHeader}>
                    <div className={styles.cardTitle}>
                        <TrophyIcon />
                        <h2 id="rewards-progress-title">Progreso de Recompensas</h2>
                    </div>
                </div>

                {loadingProgress ? (
                    <LoadingSpinner />
                ) : !progress ? (
                    <p className={styles.cardDescription}>No se pudo cargar el progreso de recompensas.</p>
                ) : (
                    <>
                        <div className={styles.rewardsProgress}>
                            <div className={styles.levelInfo}>
                                <span>
                                    Nivel actual: <strong>{currentLevel?.name || 'Inicial'}</strong>
                                </span>
                                {nextLevel?.name && (
                                    <span>
                                        Siguiente meta: <strong>{nextLevel.name}</strong>
                                    </span>
                                )}
                            </div>

                            {!noLevelsConfigured && (
                                <div className={styles.progressBarContainer}>
                                    <div
                                        className={styles.progressBar}
                                        style={{ width: `${progressPercentage}%` }}
                                        role="progressbar"
                                        aria-valuenow={progressPercentage}
                                        aria-valuemin="0"
                                        aria-valuemax="100"
                                    />
                                </div>
                            )}

                            <p className={styles.progressText}>
                                {noLevelsConfigured
                                    ? 'El programa de recompensas se está configurando. ¡Comparte tu código y acumula puntos!'
                                    : hasReachedMaxLevel
                                    ? '¡Felicidades! Has alcanzado el nivel más alto del programa.'
                                    : `Te faltan ${nextLevel.min_referrals - referralCount} referidos para alcanzar el nivel ${nextLevel.name}.`}
                            </p>
                        </div>

                        {!noLevelsConfigured && (
                            <div className={styles.rewardsLists}>
                                <div>
                                    <div
                                        className={styles.accordionHeader}
                                        onClick={() => setIsAccordionOpen(!isAccordionOpen)}
                                    >
                                        <h4>Recompensas Desbloqueadas ({progress.unlocked_rewards?.length || 0})</h4>
                                        <span className={`${styles.accordionIcon} ${isAccordionOpen ? styles.open : ''}`}>
                                            ▼
                                        </span>
                                    </div>

                                    <div className={`${styles.accordionContent} ${isAccordionOpen ? styles.open : ''}`}>
                                        <ul className={styles.rewardsListUl}>
                                            {progress.unlocked_rewards?.length > 0 ? (
                                                progress.unlocked_rewards.map((reward) => {
                                                    const claim = progress.claimed_rewards?.find((c) => c.reward_id === reward.id);
                                                    return (
                                                        <li key={reward.id} className={styles.unlockedReward}>
                                                            <span className={styles.rewardTitle}>
                                                                <GiftIcon size={16} /> {reward.title || reward.description}
                                                            </span>
                                                            {claim ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleCopyCode(claim.generated_code)}
                                                                    className={styles.copyCodeButton}
                                                                >
                                                                    Copiar: <strong>{claim.generated_code}</strong>
                                                                </button>
                                                            ) : (
                                                                reward.reward_code && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleClaimCode(reward)}
                                                                        className={styles.claimCodeButton}
                                                                    >
                                                                        Reclamar Cupón
                                                                    </button>
                                                                )
                                                            )}
                                                        </li>
                                                    );
                                                })
                                            ) : (
                                                <li>Al invitar amigos desbloquearás premios y cupones aquí.</li>
                                            )}
                                        </ul>
                                    </div>
                                </div>

                                {nextLevel?.name && (
                                    <div>
                                        <h4>Próximos Premios ({nextLevel.name})</h4>
                                        <ul className={styles.upcomingRewards}>
                                            {progress.upcoming_rewards?.length > 0 ? (
                                                progress.upcoming_rewards.map((r) => (
                                                    <li key={r.id} className={styles.upcomingItem}>
                                                        <SparkleIcon size={14} /> {r.title || r.description}
                                                    </li>
                                                ))
                                            ) : (
                                                <li>Próximamente más recompensas...</li>
                                            )}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                )}
            </section>
        </div>
    );
};

// ============================================================================
// COMPONENTE PESTAÑA: MIS FAVORITOS
// ============================================================================
const FavoritesTab = ({ favorites, liveProducts, onAddToCart, onRemoveFavorite }) => {
    if (favorites.length === 0) {
        return (
            <div className={styles.emptyState}>
                <span className={styles.emptyStateIcon}>
                    <HeartIcon size={38} />
                </span>
                <h3 className={styles.emptyStateTitle}>Aún no tienes platillos favoritos</h3>
                <p className={styles.emptyStateText}>
                    Explora nuestro menú de alitas, boneless y salsas especiales. Presiona el corazón en cualquier
                    platillo para guardarlo aquí y ordenarlo más rápido.
                </p>
                <Link to="/" className={styles.emptyStateBtn}>
                    Explorar el Menú
                </Link>
            </div>
        );
    }

    return (
        <div className={styles.favoritesGrid}>
            {favorites.map((fav) => {
                const product = fav.products;
                if (!product) return null;

                const liveProduct = liveProducts.find((p) => p.id === product.id) || product;
                const formattedPrice = liveProduct.price ? `$${Number(liveProduct.price).toFixed(2)}` : null;
                const targetUrl = product.slug ? `/producto/${product.slug}` : '/';

                return (
                    <div
                        key={product.id}
                        className={`${styles.favoriteCard} ${!product.is_active ? styles.unavailable : ''}`}
                    >
                        <Link to={targetUrl} className={styles.favoriteMedia} title={`Ver detalles de ${product.name}`}>
                            <ImageWithFallback src={product.image_url} alt={product.name} />
                            {!product.is_active && <div className={styles.unavailableBadge}>No disponible</div>}
                        </Link>

                        <div className={styles.favoriteInfo}>
                            <Link to={targetUrl} className={styles.favoriteTitle} title={product.name}>
                                {product.name}
                            </Link>
                            {formattedPrice && <span className={styles.favoritePrice}>{formattedPrice}</span>}
                        </div>

                        <div className={styles.favoriteActions}>
                            <button
                                type="button"
                                onClick={(e) => onAddToCart(e, product)}
                                className={styles.favoriteAddBtn}
                                disabled={!product.is_active}
                            >
                                Añadir
                            </button>
                            <button
                                type="button"
                                onClick={() => onRemoveFavorite(fav)}
                                className={styles.favoriteRemoveBtn}
                                title="Quitar de favoritos"
                            >
                                Quitar
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ============================================================================
// COMPONENTE PESTAÑA: MIS RESEÑAS
// ============================================================================
const ReviewsTab = ({ myReviews, editingReview, setEditingReview, onUpdateReview, onDeleteReview }) => {
    if (myReviews.length === 0) {
        return (
            <div className={styles.emptyState}>
                <span className={styles.emptyStateIcon}>
                    <StarIcon size={38} filled={false} />
                </span>
                <h3 className={styles.emptyStateTitle}>Todavía no has dejado reseñas</h3>
                <p className={styles.emptyStateText}>
                    Tus opiniones ayudan a otros comensales a elegir sus platillos favoritos. Puedes calificar y
                    compartir tu opinión entrando a la ficha de cualquier producto en el menú.
                </p>
                <Link to="/" className={styles.emptyStateBtn}>
                    Ver Menú para Calificar
                </Link>
            </div>
        );
    }

    return (
        <div className={styles.reviewList}>
            {myReviews.map((rev) => {
                const product = rev.products;
                if (!product) return null;

                const isEditing = editingReview?.id === rev.id;
                const formattedDate = rev.created_at
                    ? new Date(rev.created_at).toLocaleDateString('es-MX', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                      })
                    : '';

                if (isEditing) {
                    return (
                        <div key={rev.id} className={styles.reviewItem}>
                            <div className={styles.reviewProductInfo}>
                                <ImageWithFallback
                                    src={product.image_url}
                                    alt={product.name}
                                    className={styles.reviewProductThumb}
                                />
                                <div className={styles.reviewProductMeta}>
                                    <h4 className={styles.reviewProductTitle}>Editando: {product.name}</h4>
                                </div>
                            </div>

                            <div className={styles.reviewEditor}>
                                <div className={styles.ratingPicker}>
                                    <span className={styles.ratingPickerLabel}>Tu Calificación:</span>
                                    <StarRating
                                        rating={editingReview.rating || 5}
                                        onChange={(newRating) =>
                                            setEditingReview((prev) => ({ ...prev, rating: newRating }))
                                        }
                                        size={22}
                                    />
                                </div>

                                <textarea
                                    rows="3"
                                    value={editingReview.comment || ''}
                                    onChange={(e) =>
                                        setEditingReview((prev) => ({ ...prev, comment: e.target.value }))
                                    }
                                    className={styles.reviewTextarea}
                                    placeholder="Escribe tu opinión sobre este platillo..."
                                />

                                <div className={styles.editorActions}>
                                    <button
                                        type="button"
                                        onClick={() => setEditingReview(null)}
                                        className={styles.editorCancelBtn}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={onUpdateReview}
                                        className={styles.editorSaveBtn}
                                    >
                                        Guardar
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                }

                return (
                    <div key={rev.id} className={styles.reviewItem}>
                        <div className={styles.reviewProductInfo}>
                            <ImageWithFallback
                                src={product.image_url}
                                alt={product.name}
                                className={styles.reviewProductThumb}
                            />
                            <div className={styles.reviewProductMeta}>
                                <h4 className={styles.reviewProductTitle}>
                                    {product.name}{' '}
                                    {!product.is_active && (
                                        <span className={styles.unavailableBadge}>(No disponible)</span>
                                    )}
                                </h4>
                                {formattedDate && <span className={styles.reviewDate}>{formattedDate}</span>}
                            </div>
                        </div>

                        <StarRating rating={rev.rating || 5} size={16} />

                        {rev.comment && <p className={styles.reviewComment}>"{rev.comment}"</p>}

                        <div className={styles.reviewActions}>
                            <button
                                type="button"
                                onClick={() =>
                                    setEditingReview({
                                        id: rev.id,
                                        comment: rev.comment || '',
                                        rating: rev.rating || 5,
                                    })
                                }
                                className={styles.reviewEditBtn}
                            >
                                Editar
                            </button>
                            <button
                                type="button"
                                onClick={() => onDeleteReview(rev)}
                                className={styles.reviewDeleteBtn}
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
export default function MyStuff() {
    const { phone, setCheckoutModalOpen } = useCustomer();
    const { addToCart, showToast } = useCart();
    const { products: liveProducts } = useProducts();
    const { customer, loading: userLoading, error } = useUserData();
    const { favorites, myReviews, loading: extrasLoading, refetch: refetchExtras } = useProductExtras();
    const { settings, loading: settingsLoading } = useSettings();

    const [activeTab, setActiveTab] = useState('rewards'); // 'rewards' | 'favorites' | 'reviews'
    const [editingReview, setEditingReview] = useState(null);
    const [reviewToDelete, setReviewToDelete] = useState(null);
    const [favoriteToRemove, setFavoriteToRemove] = useState(null);

    const visibilitySettings = settings.client_visibility || {};
    const loading = userLoading || extrasLoading || settingsLoading;

    const handleRemoveFavorite = async () => {
        if (!favoriteToRemove || !customer) return;
        await supabase
            .from('customer_favorites')
            .delete()
            .match({ customer_id: customer.id, product_id: favoriteToRemove.products.id });
        showToast(`${favoriteToRemove.products.name} eliminado de tus favoritos.`);
        broadcastStoreChange('favorites_updated', { customerId: customer.id });
        setFavoriteToRemove(null);
        refetchExtras();
    };

    const handleUpdateReview = async () => {
        if (!editingReview) return;
        const { error } = await supabase
            .from('product_reviews')
            .update({
                comment: editingReview.comment,
                rating: editingReview.rating || 5,
            })
            .eq('id', editingReview.id);

        if (error) {
            showToast('Error al actualizar la reseña.');
        } else {
            showToast('Reseña actualizada con éxito.');
            broadcastStoreChange('reviews_updated');
            setEditingReview(null);
            refetchExtras();
        }
    };

    const handleDeleteReview = async () => {
        if (!reviewToDelete) return;
        await supabase.from('product_reviews').delete().eq('id', reviewToDelete.id);
        showToast('Reseña eliminada.');
        broadcastStoreChange('reviews_updated');
        setReviewToDelete(null);
        refetchExtras();
    };

    const handleAddToCartFromFav = (event, favoriteProduct) => {
        event.stopPropagation();
        const fullProduct = liveProducts.find((p) => p.id === favoriteProduct.id);
        if (!fullProduct) {
            showToast('Lo sentimos, este producto ya no está disponible.');
            return;
        }
        addToCart(fullProduct, 1);
        showToast(`¡${fullProduct.name} añadido al carrito!`);
    };

    const renderContent = () => {
        if (!phone) return <AuthPrompt />;
        if (loading) return <LoadingSpinner />;
        if (error) {
            return (
                <div className={styles.prompt}>
                    <h2>Error Inesperado</h2>
                    <p>No pudimos cargar tus datos de actividad.</p>
                </div>
            );
        }

        if (!customer) {
            return (
                <div className={styles.prompt}>
                    <h2>¡Bienvenido!</h2>
                    <p>Completa tu perfil para acceder a tus recompensas, favoritos y reseñas.</p>
                    <button
                        type="button"
                        onClick={() => setCheckoutModalOpen(true, 'profile')}
                        className={styles.emptyStateBtn}
                    >
                        Completar mi perfil
                    </button>
                </div>
            );
        }

        if (visibilitySettings.my_stuff_page === false) {
            return (
                <div className={styles.prompt}>
                    <h2>Sección no disponible</h2>
                    <p>Esta sección está temporalmente desactivada.</p>
                </div>
            );
        }

        return (
            <>
                {/* HERO CON KPIS DE ACTIVIDAD */}
                <header className={styles.heroHeader}>
                    <div className={styles.heroTitleGroup}>
                        <h1 className={styles.heroTitle}>Mi Actividad & Recompensas</h1>
                        <p className={styles.heroSubtitle}>
                            Revisa tus beneficios acumulados, administra tus platillos preferidos y consulta tus reseñas.
                        </p>
                    </div>

                    <div className={styles.kpiBar}>
                        <button
                            type="button"
                            className={`${styles.kpiPill} ${activeTab === 'rewards' ? styles.activeKpi : ''}`}
                            onClick={() => setActiveTab('rewards')}
                            title="Ver recompensas e invitaciones"
                        >
                            <span className={styles.kpiIcon}><TrophyIcon size={18} /></span>
                            <span className={styles.kpiValue}>{customer.referral_count || 0}</span>
                            <span className={styles.kpiLabel}>Amigos</span>
                        </button>

                        <button
                            type="button"
                            className={`${styles.kpiPill} ${activeTab === 'favorites' ? styles.activeKpi : ''}`}
                            onClick={() => setActiveTab('favorites')}
                            title="Ver platillos favoritos"
                        >
                            <span className={styles.kpiIcon}><HeartIcon size={18} filled={true} /></span>
                            <span className={styles.kpiValue}>{favorites.length}</span>
                            <span className={styles.kpiLabel}>Favoritos</span>
                        </button>

                        <button
                            type="button"
                            className={`${styles.kpiPill} ${activeTab === 'reviews' ? styles.activeKpi : ''}`}
                            onClick={() => setActiveTab('reviews')}
                            title="Ver mis reseñas"
                        >
                            <span className={styles.kpiIcon}><StarIcon size={18} filled={true} /></span>
                            <span className={styles.kpiValue}>{myReviews.length}</span>
                            <span className={styles.kpiLabel}>Reseñas</span>
                        </button>
                    </div>
                </header>

                {/* BARRA DE PESTAÑAS */}
                <nav className={styles.tabBar} aria-label="Navegación de actividad">
                    <button
                        type="button"
                        className={`${styles.tabButton} ${activeTab === 'rewards' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('rewards')}
                    >
                        <GiftIcon size={16} />
                        <span>Recompensas</span>
                    </button>

                    <button
                        type="button"
                        className={`${styles.tabButton} ${activeTab === 'favorites' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('favorites')}
                    >
                        <HeartIcon size={16} filled={true} />
                        <span>Favoritos</span>
                        <span className={styles.tabBadge}>{favorites.length}</span>
                    </button>

                    <button
                        type="button"
                        className={`${styles.tabButton} ${activeTab === 'reviews' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('reviews')}
                    >
                        <StarIcon size={16} filled={true} />
                        <span>Reseñas</span>
                        <span className={styles.tabBadge}>{myReviews.length}</span>
                    </button>
                </nav>

                {/* CONTENIDO DE LA PESTAÑA SELECCIONADA */}
                <main>
                    {activeTab === 'rewards' && (
                        <RewardsAndReferralTab customer={customer} customerId={customer.id} />
                    )}

                    {activeTab === 'favorites' && (
                        <FavoritesTab
                            favorites={favorites}
                            liveProducts={liveProducts}
                            onAddToCart={handleAddToCartFromFav}
                            onRemoveFavorite={setFavoriteToRemove}
                        />
                    )}

                    {activeTab === 'reviews' && (
                        <ReviewsTab
                            myReviews={myReviews}
                            editingReview={editingReview}
                            setEditingReview={setEditingReview}
                            onUpdateReview={handleUpdateReview}
                            onDeleteReview={setReviewToDelete}
                        />
                    )}
                </main>
            </>
        );
    };

    return (
        <>
            <SEO
                title="Mi Actividad y Recompensas - Entre Alas"
                description="Revisa tus productos favoritos, gestiona tus reseñas y sigue tu progreso en el sistema de recompensas."
                type="website"
                noindex
            />
            <div className={styles.container}>{renderContent()}</div>

            <ConfirmModal
                isOpen={!!favoriteToRemove}
                onClose={() => setFavoriteToRemove(null)}
                onConfirm={handleRemoveFavorite}
                title="¿Quitar de Favoritos?"
            >
                ¿Deseas eliminar "{favoriteToRemove?.products?.name}" de tus favoritos?
            </ConfirmModal>

            <ConfirmModal
                isOpen={!!reviewToDelete}
                onClose={() => setReviewToDelete(null)}
                onConfirm={handleDeleteReview}
                title="¿Eliminar Reseña?"
            >
                Esta acción eliminará permanentemente tu opinión sobre este platillo.
            </ConfirmModal>
        </>
    );
}
