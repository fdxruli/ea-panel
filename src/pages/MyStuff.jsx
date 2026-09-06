// --- 1. AÑADIMOS 'lazy' y 'Suspense' ---
import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import { useUserData } from '../context/UserDataContext';
import { useProductExtras } from '../context/ProductExtrasContext';
import styles from './MyStuff.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import { useCart } from '../context/CartContext';
import { useProducts } from '../context/ProductContext';
import AuthPrompt from '../components/AuthPrompt';
import DOMPurify from 'dompurify';
import { useAlert } from '../context/AlertContext';
// --- 2. COMENTAMOS LA IMPORTACIÓN ESTÁTICA ---
// import QRCodeModal from '../components/QRCodeModal';
import ImageWithFallback from '../components/ImageWithFallback';
import SEO from '../components/SEO';
import { useSettings } from '../context/SettingsContext';

// --- 3. IMPORTAMOS EL MODAL CON 'lazy' ---
const QRCodeModal = lazy(() => import('../components/QRCodeModal.jsx'));

// --- (Iconos sin cambios) ---
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>;
const TrophyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9 9h6l-3-7zM9 9H2l3 7h2M15 9h7l-3 7h-2M12 22l-3-3m3 3l3-3" /></svg>;

// --- (Componente ReferralSystem MODIFICADO) ---
const ReferralSystem = ({ customer }) => {
    const { showAlert } = useAlert();
    const [isQrModalOpen, setQrModalOpen] = useState(false);
    const referralLink = `${window.location.origin}/?ref=${customer.referral_code}`;

    const handleCopy = () => {
        navigator.clipboard.writeText(referralLink).then(() => {
            showAlert('¡Enlace de referido copiado!');
        });
    };

    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}><TrophyIcon /><h2>Invita y Gana</h2></div>
            <p>
                Comparte tu enlace de referido con tus amigos. Cuando se registren usando tu enlace
                y realicen su primera compra ¡acumularás puntos para subir de nivel y obtener recompensas!
            </p>
            <div className={styles.referralBox}>
                <input type="text" readOnly value={referralLink} />
                <div className={styles.referralActions}>
                    <button onClick={handleCopy} className="admin-button-primary">Copiar Enlace</button>
                    <button onClick={() => setQrModalOpen(true)} className="admin-button-secondary">Mostrar QR</button>
                </div>
            </div>
            <div className={styles.referralStats}>
                <p><strong>Amigos Invitados:</strong> {customer.referral_count || 0}</p>
            </div>

            {/* --- 4. ENVOLVEMOS EL MODAL EN SUSPENSE --- */}
            {isQrModalOpen && (
                <Suspense fallback={<LoadingSpinner />}>
                    <QRCodeModal
                        url={referralLink}
                        onClose={() => setQrModalOpen(false)}
                    />
                </Suspense>
            )}
            {/* --- FIN DEL CAMBIO --- */}
        </div>
    );
};

// --- (Componente RewardsSection SIN CAMBIOS) ---
const RewardsSection = ({ customerId }) => {
    const [progress, setProgress] = useState(null);
    const [loading, setLoading] = useState(true);
    const { showAlert } = useAlert();
    const [isAccordionOpen, setIsAccordionOpen] = useState(true);

    const fetchProgress = useCallback(async () => {
        if (!customerId) return;
        const { data, error } = await supabase.rpc('get_customer_rewards_progress', { p_customer_id: customerId });
        if (error) {
            console.error("Error fetching rewards progress:", error);
        } else {
            setProgress(data);
        }
        setLoading(false);
    }, [customerId]);

    useEffect(() => {
        fetchProgress();
    }, [fetchProgress]);

    useEffect(() => {
        if (!customerId) return;

        const handleChanges = (payload) => {
            console.log('Cambio detectado, actualizando recompensas...', payload);
            fetchProgress();
        };

        const channel = supabase
            .channel(`customer-rewards-${customerId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `id=eq.${customerId}` }, handleChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'referral_levels' }, handleChanges)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rewards' }, handleChanges)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };

    }, [customerId, fetchProgress]);

    const [rewardToConfirm, setRewardToConfirm] = useState(null);

    const handleRequestClaim = (reward) => {
        setRewardToConfirm(reward);
    };

    const handleConfirmClaim = async () => {
        if (!rewardToConfirm) return;
        const reward = rewardToConfirm;
        setRewardToConfirm(null);

        try {
            const { data: newCode, error } = await supabase.rpc('generate_personal_reward_code', {
                p_customer_id: customerId,
                p_reward_id: reward.id
            });
            if (error) {
                showAlert(error.message || 'Hubo un error al generar tu código. Es posible que ya hayas elegido una recompensa en este nivel.');
            } else {
                showAlert(`¡Recompensa elegida con éxito! Código personal generado: ${newCode}. Cópialo y úsalo en tu carrito.`, 'success');
                fetchProgress();
            }
        } catch (err) {
            showAlert(err.message || 'Error inesperado al reclamar recompensa.');
        }
    };

    const handleCopyCode = (code) => {
        navigator.clipboard.writeText(code);
        showAlert(`¡Código "${code}" copiado!`);
    };

    // Agrupación de recompensas desbloqueadas por nivel
    const unlockedByLevel = useMemo(() => {
        if (!progress?.unlocked_rewards || !Array.isArray(progress.unlocked_rewards)) return [];
        const map = new Map();
        for (const r of progress.unlocked_rewards) {
            const lvlId = r.level_id || 'general';
            if (!map.has(lvlId)) {
                map.set(lvlId, {
                    level_id: lvlId,
                    level_name: r.level_name || 'Nivel Desbloqueado',
                    min_referrals: r.min_referrals ?? 0,
                    rewards: []
                });
            }
            map.get(lvlId).rewards.push(r);
        }
        return Array.from(map.values()).sort((a, b) => a.min_referrals - b.min_referrals);
    }, [progress?.unlocked_rewards]);

    if (loading) return <LoadingSpinner />;
    if (!progress) return <p>No se pudo cargar tu progreso de recompensas.</p>;

    const { current_level, next_level, referral_count } = progress;

    const progressPercentage = next_level?.min_referrals
        ? (referral_count / next_level.min_referrals) * 100
        : (current_level?.name ? 100 : 0);

    const noLevelsConfigured = !current_level?.name && !next_level?.name;
    const hasReachedMaxLevel = current_level?.name && !next_level?.name;

    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}><TrophyIcon /><h2>Mis Recompensas</h2></div>
            <div className={styles.rewardsProgress}>
                <div className={styles.levelInfo}>
                    {current_level?.name && <span>Nivel actual: <strong>{current_level.name}</strong></span>}
                    {next_level?.name && <span>Siguiente nivel: <strong>{next_level.name}</strong></span>}
                </div>

                {!noLevelsConfigured && (
                    <div className={styles.progressBarContainer}>
                        <div className={styles.progressBar} style={{ width: `${progressPercentage}%` }}></div>
                    </div>
                )}

                <p className={styles.progressText}>
                    {noLevelsConfigured
                        ? "El sistema de recompensas se está preparando. ¡Vuelve pronto! Pero, puedes compartir tu link e ir acumulando puntos"
                        : hasReachedMaxLevel
                            ? "¡Has alcanzado el nivel más alto! Eres un(a) crack. 😎"
                            : `Necesitas ${next_level.min_referrals - referral_count} referidos más para el siguiente nivel.`
                    }
                </p>
            </div>
            {!noLevelsConfigured && (
                <div className={`${styles.rewardsLists} ${hasReachedMaxLevel ? styles.centeredLayout : ''}`}>
                    <div>
                        <div className={styles.accordionHeader} onClick={() => setIsAccordionOpen(!isAccordionOpen)}>
                            <h4>Recompensas Desbloqueadas</h4>
                            <span className={`${styles.accordionIcon} ${isAccordionOpen ? styles.open : ''}`}>▼</span>
                        </div>
                        <div className={`${styles.accordionContent} ${isAccordionOpen ? styles.open : ''}`}>
                            {unlockedByLevel.length > 0 ? (
                                <div className={styles.levelGroupsContainer}>
                                    {unlockedByLevel.map((lvlGroup) => {
                                        // Buscar si el cliente ya eligió una recompensa en este nivel
                                        const claimedInLevel = progress.claimed_rewards?.find(
                                            (c) => c.level_id === lvlGroup.level_id || lvlGroup.rewards.some(r => r.id === c.reward_id)
                                        );

                                        return (
                                            <div key={lvlGroup.level_id} className={styles.levelRewardGroup}>
                                                <div className={styles.levelRewardHeader}>
                                                    <div className={styles.levelRewardTitle}>
                                                        <span className={styles.levelRewardIcon}>🏆</span>
                                                        <h5>{lvlGroup.level_name}</h5>
                                                        <span className={styles.levelReferralsCount}>
                                                            ({lvlGroup.min_referrals} {lvlGroup.min_referrals === 1 ? 'referido' : 'referidos'})
                                                        </span>
                                                    </div>
                                                    <span className={`${styles.levelStatusBadge} ${claimedInLevel ? styles.badgeClaimed : styles.badgePending}`}>
                                                        {claimedInLevel ? 'Recompensa Elegida' : 'Elige 1 Opción'}
                                                    </span>
                                                </div>

                                                <p className={styles.levelRewardInstruction}>
                                                    {claimedInLevel
                                                        ? 'Ya seleccionaste tu recompensa para este nivel:'
                                                        : '¡Felicidades! Tienes las siguientes opciones disponibles. Elige la que más te guste:'}
                                                </p>

                                                <div className={styles.rewardsGrid}>
                                                    {lvlGroup.rewards.map((reward) => {
                                                        const isClaimedReward = claimedInLevel && claimedInLevel.reward_id === reward.id;
                                                        const isOtherOptionLocked = claimedInLevel && !isClaimedReward;
                                                        const displayTitle = reward.title || reward.description;
                                                        const displayDesc = reward.description && reward.title && reward.description !== reward.title ? reward.description : null;

                                                        return (
                                                            <div
                                                                key={reward.id}
                                                                className={`${styles.rewardOptionCard} ${
                                                                    isClaimedReward
                                                                        ? styles.rewardOptionSelected
                                                                        : isOtherOptionLocked
                                                                        ? styles.rewardOptionLocked
                                                                        : styles.rewardOptionAvailable
                                                                }`}
                                                            >
                                                                <div className={styles.rewardOptionHeader}>
                                                                    <div className={styles.rewardOptionTitleGroup}>
                                                                        <strong className={styles.rewardOptionTitle}>🎁 {displayTitle}</strong>
                                                                        {displayDesc && (
                                                                            <p className={styles.rewardOptionDescription}>{displayDesc}</p>
                                                                        )}
                                                                    </div>
                                                                    {isClaimedReward && (
                                                                        <span className={styles.choiceBadgeSelected}>Elegida</span>
                                                                    )}
                                                                    {isOtherOptionLocked && (
                                                                        <span className={styles.choiceBadgeLocked}>No elegida</span>
                                                                    )}
                                                                </div>

                                                                <div className={styles.rewardOptionAction}>
                                                                    {isClaimedReward ? (
                                                                        <button
                                                                            onClick={() => handleCopyCode(claimedInLevel.generated_code)}
                                                                            className={styles.copyCodeButton}
                                                                            title="Copiar cupón personal al portapapeles"
                                                                        >
                                                                            Copiar Cupón: <strong>{claimedInLevel.generated_code}</strong>
                                                                        </button>
                                                                    ) : isOtherOptionLocked ? (
                                                                        <span className={styles.lockedNote}>
                                                                            🔒 Opción no elegida (1 por nivel)
                                                                        </span>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleRequestClaim(reward)}
                                                                            className={styles.claimChoiceButton}
                                                                        >
                                                                            Elegir esta recompensa
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className={styles.emptyRewardsNotice}>Cuando hayas alcanzado la meta aquí aparecerán tus recompensas para elegir.</p>
                            )}
                        </div>
                    </div>

                    {next_level?.name && (
                        <div className={styles.upcomingSection}>
                            <div className={styles.upcomingHeader}>
                                <h4>Próximas Recompensas (Nivel Bloqueado)</h4>
                                <span className={styles.upcomingLockBadge}>🔒 Requiere {next_level.min_referrals} {next_level.min_referrals === 1 ? 'referido' : 'referidos'}</span>
                            </div>
                            <p className={styles.upcomingInstruction}>
                                Al alcanzar <strong>{next_level.name}</strong> ({next_level.min_referrals} {next_level.min_referrals === 1 ? 'referido' : 'referidos'}), podrás elegir 1 de las siguientes opciones:
                            </p>
                            <div className={styles.upcomingRewardsGrid}>
                                {progress.upcoming_rewards?.length > 0 ? (
                                    progress.upcoming_rewards.map(r => {
                                        const upTitle = r.title || r.description;
                                        const upDesc = r.description && r.title && r.description !== r.title ? r.description : null;
                                        return (
                                            <div key={r.id} className={styles.upcomingRewardCard}>
                                                <div className={styles.upcomingRewardTop}>
                                                    <strong className={styles.upcomingRewardTitle}>🔒 {upTitle}</strong>
                                                    <span className={styles.upcomingLockedChip}>Bloqueado</span>
                                                </div>
                                                {upDesc && (
                                                    <p className={styles.upcomingRewardDesc}>{upDesc}</p>
                                                )}
                                                <div className={styles.upcomingRewardFooter}>
                                                    <small className={styles.upcomingLockedText}>
                                                        Se desbloqueará al llegar a {next_level.min_referrals} {next_level.min_referrals === 1 ? 'referido' : 'referidos'}
                                                    </small>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <p className={styles.upcomingEmpty}>Próximamente...</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <ConfirmModal
                isOpen={!!rewardToConfirm}
                onClose={() => setRewardToConfirm(null)}
                onConfirm={handleConfirmClaim}
                title="¿Elegir esta recompensa?"
            >
                ¿Deseas elegir <strong>"{rewardToConfirm?.title || rewardToConfirm?.description}"</strong> como tu recompensa de este nivel?
                <br /><br />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #888)' }}>
                    Recuerda que solo podrás elegir 1 recompensa por nivel. Al confirmarla se generará tu cupón exclusivo y las demás opciones quedarán bloqueadas.
                </span>
            </ConfirmModal>
        </div>
    );
};


export default function MyStuff() {
    const { phone, setCheckoutModalOpen } = useCustomer();
    const { addToCart, showToast } = useCart();
    const { products: liveProducts } = useProducts();
    const { customer, loading: userLoading, error } = useUserData();
    const { favorites, myReviews, loading: extrasLoading, refetch: refetchExtras } = useProductExtras();
    const [editingReview, setEditingReview] = useState(null);
    const [reviewToDelete, setReviewToDelete] = useState(null);
    const [favoriteToRemove, setFavoriteToRemove] = useState(null);
    const { settings, loading: settingsLoading } = useSettings();
    const visibilitySettings = settings.client_visibility || {};
    const loading = userLoading || extrasLoading || settingsLoading;

    // --- (HANDLERS SIN CAMBIOS) ---
    const handleRemoveFavorite = async () => {
        if (!favoriteToRemove || !customer) return;
        await supabase.from('customer_favorites').delete().match({ customer_id: customer.id, product_id: favoriteToRemove.products.id });
        showToast(`${favoriteToRemove.products.name} eliminado de tus favoritos.`);
        setFavoriteToRemove(null);
        refetchExtras();
    };
    const handleUpdateReview = async () => {
        if (!editingReview) return;
        const { error } = await supabase.from('product_reviews').update({ comment: editingReview.comment, rating: editingReview.rating }).eq('id', editingReview.id);
        if (error) { showToast("Error al actualizar la reseña."); }
        else { showToast("Reseña actualizada con éxito."); setEditingReview(null); refetchExtras(); }
    };
    const handleDeleteReview = async () => {
        if (!reviewToDelete) return;
        await supabase.from('product_reviews').delete().eq('id', reviewToDelete.id);
        showToast("Reseña eliminada.");
        setReviewToDelete(null);
        refetchExtras();
    };
    const handleAddToCartFromFav = (event, favoriteProduct) => {
        event.stopPropagation();
        const fullProduct = liveProducts.find(p => p.id === favoriteProduct.id);
        if (!fullProduct) { showToast("Lo sentimos, este producto ya no está disponible."); return; }
        addToCart(fullProduct, 1);
        showToast(`¡${fullProduct.name} añadido al carrito!`);
    };

    // --- (FUNCIÓN RENDERCONTENT SIN CAMBIOS) ---
    const renderContent = () => {
        if (!phone) return <AuthPrompt />;
        if (loading) return <LoadingSpinner />;
        if (error) return <div className={styles.prompt}><h2>Error Inesperado</h2><p>No pudimos cargar tus datos.</p></div>;

        if (!customer) {
            return (
                <div className={styles.prompt}>
                    <h2>¡Bienvenido!</h2>
                    <p>Completa tu perfil para guardar tus favoritos y reseñas.</p>
                    <button onClick={() => setCheckoutModalOpen(true, 'profile')} className={styles.actionButton}>Completar mi perfil</button>
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
                {visibilitySettings.stuff_referrals !== false && customer.referral_code && <ReferralSystem customer={customer} />}
                {visibilitySettings.stuff_rewards !== false && <RewardsSection customerId={customer.id} />}

                {visibilitySettings.stuff_favorites !== false && (
                    <div className={styles.card}>
                        <div className={styles.cardHeader}><HeartIcon /><h2>Mis Favoritos ({favorites.length})</h2></div>
                        {favorites.length > 0 ? (
                            <div className={styles.grid}>
                                {favorites.map(fav => fav.products && (
                                    <div key={fav.products.id} className={`${styles.gridItem} ${!fav.products.is_active ? styles.unavailable : ''}`}>
                                        {!fav.products.is_active && <div className={styles.unavailableBadge}>No disponible</div>}
                                        <ImageWithFallback src={fav.products.image_url} alt={fav.products.name} />
                                        <h3>{fav.products.name}</h3>
                                        <div className={styles.gridItemActions}>
                                            <button onClick={(e) => handleAddToCartFromFav(e, fav.products)} className={styles.addButton} disabled={!fav.products.is_active}>Añadir</button>
                                            <button onClick={() => setFavoriteToRemove(fav)} className={styles.removeButton}>Quitar</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : <p>Aún no has guardado productos favoritos.</p>}
                    </div>
                )}
                {visibilitySettings.stuff_reviews !== false && (
                    <div className={styles.card}>
                        <div className={styles.cardHeader}><StarIcon /><h2>Mis Reseñas ({myReviews.length})</h2></div>
                        {myReviews.length > 0 ? (
                            <div className={styles.reviewList}>
                                {myReviews.map(rev => rev.products && (
                                    <div key={rev.id} className={styles.reviewItem}>
                                        {editingReview?.id === rev.id ? (
                                            <div className={styles.reviewEditor}>
                                                <div className={styles.reviewProductInfo}><ImageWithFallback src={rev.products.image_url} alt={rev.products.name} /><h4>Editando: <strong>{rev.products.name}</strong></h4></div>
                                                <textarea rows="3" value={editingReview.comment} onChange={e => setEditingReview({ ...editingReview, comment: e.target.value })} />
                                                <div className={styles.reviewActions}>
                                                    <button onClick={() => setEditingReview(null)} className={styles.cancelButton}>Cancelar</button>
                                                    <button onClick={handleUpdateReview} className={styles.actionButton}>Guardar</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={styles.reviewProductInfo}><ImageWithFallback src={rev.products.image_url} alt={rev.products.name} /><h4>{rev.products.name} {!rev.products.is_active && <span className={styles.unavailableText}>(No disponible)</span>}</h4></div>
                                                <p className={styles.reviewComment}>"{rev.comment}"</p>
                                                <div className={styles.reviewActions}>
                                                    <button onClick={() => setEditingReview(rev)}>Editar</button>
                                                    <button onClick={() => setReviewToDelete(rev)} className={styles.removeButton}>Eliminar</button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : <p>Todavía no has escrito ninguna reseña.</p>}
                    </div>
                 )}
            </>
        );
    }

    // --- (RETURN FINAL SIN CAMBIOS) ---
    return (
        <>
            <SEO
                title="Mi Actividad y Recompensas - Entre Alas"
                description="Revisa tus productos favoritos, gestiona tus reseñas y sigue tu progreso en el sistema de recompensas."
                type="website"
                noindex
            />
            <div className={styles.container}>
                {renderContent()}
                <ConfirmModal isOpen={!!favoriteToRemove} onClose={() => setFavoriteToRemove(null)} onConfirm={handleRemoveFavorite} title="¿Quitar de Favoritos?">¿Eliminar "{favoriteToRemove?.products?.name}" de tus favoritos?</ConfirmModal>
                <ConfirmModal isOpen={!!reviewToDelete} onClose={() => setReviewToDelete(null)} onConfirm={handleDeleteReview} title="¿Eliminar Reseña?">Esta acción es permanente.</ConfirmModal>
            </div>
        </>
    );
}
