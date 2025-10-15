import React, { useState, useMemo, useEffect, useCallback } from 'react';
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
import QRCodeModal from '../components/QRCodeModal';
import ImageWithFallback from '../components/ImageWithFallback';
import SEO from '../components/SEO';

const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>;
const TrophyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9 9h6l-3-7zM9 9H2l3 7h2M15 9h7l-3 7h-2M12 22l-3-3m3 3l3-3" /></svg>;

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
                Comparte tu enlace de referido con tus amigos. Cuando se registren usando tu enlace,
                ¡acumularás puntos para subir de nivel y obtener recompensas!
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
            {isQrModalOpen && (
                <QRCodeModal
                    url={referralLink}
                    onClose={() => setQrModalOpen(false)}
                />
            )}
        </div>
    );
};
const RewardsSection = ({ customerId }) => {
    const [progress, setProgress] = useState(null);
    const [loading, setLoading] = useState(true);
    const { showAlert } = useAlert();
    const [isAccordionOpen, setIsAccordionOpen] = useState(true); // Estado para el acordeón

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

    const handleClaimCode = async (reward) => {
        const { data: newCode, error } = await supabase.rpc('generate_personal_reward_code', {
            p_customer_id: customerId,
            p_reward_id: reward.id
        });
        if (error) {
            showAlert('Hubo un error al generar tu código. Es posible que ya lo hayas reclamado.');
        } else {
            showAlert(`¡Código personal generado! Cópialo y úsalo en tu carrito.`);
            fetchProgress();
        }
    };

    const handleCopyCode = (code) => {
        navigator.clipboard.writeText(code);
        showAlert(`¡Código "${code}" copiado!`);
    };

    if (loading) return <LoadingSpinner />;
    if (!progress) return <p>No se pudo cargar tu progreso de recompensas.</p>;

    const { current_level, next_level, referral_count } = progress;

    const progressPercentage = next_level?.min_referrals
        ? (referral_count / next_level.min_referrals) * 100
        : (current_level?.name ? 100 : 0);

    // La condición ahora comprueba si los niveles tienen un nombre, lo cual es más fiable.
    const noLevelsConfigured = !current_level?.name && !next_level?.name;
    const hasReachedMaxLevel = current_level?.name && !next_level?.name;

    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}><TrophyIcon /><h2>Mis Recompensas</h2></div>
            <div className={styles.rewardsProgress}>
                <div className={styles.levelInfo}>
                    {/* Mostramos el nivel solo si realmente existe, si no, no mostramos la línea */}
                    {current_level?.name && <span>Nivel actual: <strong>{current_level.name}</strong></span>}
                    {next_level?.name && <span>Siguiente nivel: <strong>{next_level.name}</strong></span>}
                </div>

                {/* Ocultamos la barra de progreso si no hay niveles configurados */}
                {!noLevelsConfigured && (
                    <div className={styles.progressBarContainer}>
                        <div className={styles.progressBar} style={{ width: `${progressPercentage}%` }}></div>
                    </div>
                )}

                <p className={styles.progressText}>
                    {noLevelsConfigured
                        ? "El sistema de recompensas se está preparando. ¡Vuelve pronto! Pero puedes compartir tu link y generar puntos para cuando las recompensas esten disponibles"
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
                            <ul>
                                {progress.unlocked_rewards?.length > 0
                                    ? progress.unlocked_rewards.map(reward => {
                                        const claim = progress.claimed_rewards?.find(c => c.reward_id === reward.id);
                                        return (
                                            <li key={reward.id}>
                                                <div className={styles.unlockedReward}>
                                                    <span>🎁 {reward.description}</span>
                                                    {claim ? (
                                                        <button onClick={() => handleCopyCode(claim.generated_code)} className={styles.copyCodeButton}>
                                                            Copiar: <strong>{claim.generated_code}</strong>
                                                        </button>
                                                    ) : (
                                                        reward.reward_code && (
                                                            <button onClick={() => handleClaimCode(reward)} className={styles.claimCodeButton}>
                                                                Reclama tu código único
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </li>
                                        );
                                    })
                                    : <li>Cuando hayas alcanzado la meta aqui apareceran tus remcompensa</li>
                                }
                            </ul>
                        </div>
                    </div>

                    {next_level?.name && (
                        <div>
                            <h4>Próximas Recompensas</h4>
                            <ul className={styles.upcomingRewards}>
                                {progress.upcoming_rewards?.length > 0
                                    ? progress.upcoming_rewards.map(r => (
                                        <li key={r.id}>✨ {r.description}</li>
                                    ))
                                    : <li>Próximamente...</li>
                                }
                            </ul>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default function MyStuff() {
    const { phone, setCheckoutModalOpen } = useCustomer();
    const { addToCart, showToast } = useCart();
    const { products: liveProducts } = useProducts();
    const { customer, loading: userLoading, error } = useUserData();
    const { favorites, reviews: allReviews, loading: extrasLoading, refetch: refetchExtras } = useProductExtras();
    const [editingReview, setEditingReview] = useState(null);
    const [reviewToDelete, setReviewToDelete] = useState(null);
    const [favoriteToRemove, setFavoriteToRemove] = useState(null);
    const loading = userLoading || extrasLoading;
    const myReviews = useMemo(() => {
        if (!customer) return [];
        return allReviews.filter(review => review.customer_id === customer.id);
    }, [allReviews, customer]);

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

        return (
            <>
                <p className={styles.subtitle}>Gestiona tus recompensas, productos favoritos y reseñas.</p>
                {customer.referral_code && <ReferralSystem customer={customer} />}
                <RewardsSection customerId={customer.id} />
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
            </>
        );
    }

    return (
        <>
            <SEO
                title="Mi Actividad y Recompensas - Entre Alas"
                description="Revisa tus productos favoritos, gestiona tus reseñas y sigue tu progreso en el sistema de recompensas."
                name="Entre Alas"
                type="website"
            />
            <div className={styles.container}>
                {renderContent()}
                <ConfirmModal isOpen={!!favoriteToRemove} onClose={() => setFavoriteToRemove(null)} onConfirm={handleRemoveFavorite} title="¿Quitar de Favoritos?">¿Eliminar "{favoriteToRemove?.products?.name}" de tus favoritos?</ConfirmModal>
                <ConfirmModal isOpen={!!reviewToDelete} onClose={() => setReviewToDelete(null)} onConfirm={handleDeleteReview} title="¿Eliminar Reseña?">Esta acción es permanente.</ConfirmModal>
            </div>
        </>
    );
}
