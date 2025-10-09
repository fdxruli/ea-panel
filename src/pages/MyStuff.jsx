import React, { useState, useMemo, useEffect } from 'react';
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

const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>;
const TrophyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9 9h6l-3-7zM9 9H2l3 7h2M15 9h7l-3 7h-2M12 22l-3-3m3 3l3-3"/></svg>;

const RewardsSection = ({ customerId }) => {
    const [progress, setProgress] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchProgress = async () => {
            if (!customerId) return;
            setLoading(true);
            const { data, error } = await supabase.rpc('get_customer_rewards_progress', { p_customer_id: customerId });
            if (error) {
                console.error("Error fetching rewards progress:", error);
            } else {
                setProgress(data);
            }
            setLoading(false);
        };
        fetchProgress();
    }, [customerId]);

    if (loading) return <LoadingSpinner />;
    if (!progress) return <p>No se pudo cargar tu progreso de recompensas.</p>;

    const { current_level, next_level, referral_count } = progress;
    const progressPercentage = next_level ? (referral_count / next_level.min_referrals) * 100 : 100;

    return (
        <div className={styles.card}>
            <div className={styles.cardHeader}><TrophyIcon /><h2>Mis Recompensas</h2></div>
            <div className={styles.rewardsProgress}>
                <div className={styles.levelInfo}>
                    <span>Nivel actual: <strong>{current_level?.name || 'Novato'}</strong></span>
                    {next_level && <span>Siguiente nivel: <strong>{next_level.name}</strong></span>}
                </div>
                <div className={styles.progressBarContainer}>
                    <div className={styles.progressBar} style={{ width: `${progressPercentage}%` }}></div>
                </div>
                <p className={styles.progressText}>
                    {next_level
                        ? `${referral_count} de ${next_level.min_referrals} referidos para el siguiente nivel.`
                        : `¡Has alcanzado el nivel más alto!`}
                </p>
            </div>

            <div className={styles.rewardsLists}>
                <div>
                    <h4>Recompensas Desbloqueadas</h4>
                    <ul>
                        {progress.unlocked_rewards?.length > 0
                            ? progress.unlocked_rewards.map(r => <li key={r.id}>🎁 {r.description}</li>)
                            : <li>Invita a tu primer amigo para desbloquear recompensas.</li>
                        }
                    </ul>
                </div>
                {next_level && (
                    <div>
                        <h4>Próximas Recompensas</h4>
                        <ul className={styles.upcomingRewards}>
                             {progress.upcoming_rewards?.length > 0
                                ? progress.upcoming_rewards.map(r => <li key={r.id}>✨ {r.description}</li>)
                                : <li>Próximamente...</li>
                            }
                        </ul>
                    </div>
                )}
            </div>
        </div>
    );
};


export default function MyStuff() {
    const { phone, setPhoneModalOpen, setCheckoutModalOpen } = useCustomer();
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
        const cleanComment = DOMPurify.sanitize(editingReview.comment);
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
        if (!phone) return <AuthPrompt/>;
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
                
                {/* --- SECCIÓN DE RECOMPENSAS --- */}
                <RewardsSection customerId={customer.id} />

                <div className={styles.card}>
                    <div className={styles.cardHeader}><HeartIcon /><h2>Mis Favoritos ({favorites.length})</h2></div>
                    {favorites.length > 0 ? (
                        <div className={styles.grid}>
                            {favorites.map(fav => fav.products && (
                                <div key={fav.products.id} className={`${styles.gridItem} ${!fav.products.is_active ? styles.unavailable : ''}`}>
                                    {!fav.products.is_active && <div className={styles.unavailableBadge}>No disponible</div>}
                                    <img src={fav.products.image_url || 'https://placehold.co/150'} alt={fav.products.name} />
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
                                            <div className={styles.reviewProductInfo}><img src={rev.products.image_url || 'https://placehold.co/80'} alt={rev.products.name} /><h4>Editando: <strong>{rev.products.name}</strong></h4></div>
                                            <textarea rows="3" value={editingReview.comment} onChange={e => setEditingReview({ ...editingReview, comment: e.target.value })} />
                                            <div className={styles.reviewActions}>
                                                <button onClick={() => setEditingReview(null)} className={styles.cancelButton}>Cancelar</button>
                                                <button onClick={handleUpdateReview} className={styles.actionButton}>Guardar</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <div className={styles.reviewProductInfo}><img src={rev.products.image_url || 'https://placehold.co/80'} alt={rev.products.name} /><h4>{rev.products.name} {!rev.products.is_active && <span className={styles.unavailableText}>(No disponible)</span>}</h4></div>
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
        <div className={styles.container}>
            {renderContent()}
            <ConfirmModal isOpen={!!favoriteToRemove} onClose={() => setFavoriteToRemove(null)} onConfirm={handleRemoveFavorite} title="¿Quitar de Favoritos?">¿Eliminar "{favoriteToRemove?.products?.name}" de tus favoritos?</ConfirmModal>
            <ConfirmModal isOpen={!!reviewToDelete} onClose={() => setReviewToDelete(null)} onConfirm={handleDeleteReview} title="¿Eliminar Reseña?">Esta acción es permanente.</ConfirmModal>
        </div>
    );
}