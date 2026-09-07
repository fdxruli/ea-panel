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
import { useAlert } from '../context/AlertContext';
import ImageWithFallback from '../components/ImageWithFallback';
import SEO from '../components/SEO';
import { useSettings } from '../context/SettingsContext';

const QRCodeModal = lazy(() => import('../components/QRCodeModal.jsx'));
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 12 17.77 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
const TrophyIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L9 9h6l-3-7zM9 9H2l3 7h2M15 9h7l-3 7h-2M12 22l-3-3m3 3l3-3"/></svg>;

const ReferralSystem = ({ customer }) => {
    const { showAlert } = useAlert();
    const [isQrModalOpen, setQrModalOpen] = useState(false);
    const referralLink = `${window.location.origin}/?ref=${customer.referral_code}`;
    const handleCopy = () => navigator.clipboard.writeText(referralLink).then(() => showAlert('¡Enlace de referido copiado!'));
    return <div className={styles.card}>
        <div className={styles.cardHeader}><TrophyIcon/><h2>Invita y Gana</h2></div>
        <p>Comparte tu enlace de referido con tus amigos. Cuando se registren usando tu enlace y realicen su primera compra ¡acumularás puntos para subir de nivel y obtener recompensas!</p>
        <div className={styles.referralBox}><input type="text" readOnly value={referralLink}/><div className={styles.referralActions}><button onClick={handleCopy} className="admin-button-primary">Copiar Enlace</button><button onClick={() => setQrModalOpen(true)} className="admin-button-secondary">Mostrar QR</button></div></div>
        <div className={styles.referralStats}><p><strong>Amigos Invitados:</strong> {customer.referral_count || 0}</p></div>
        {isQrModalOpen && <Suspense fallback={<LoadingSpinner />}><QRCodeModal url={referralLink} onClose={() => setQrModalOpen(false)}/></Suspense>}
    </div>;
};

const RewardsSection = () => {
    const { customerId, isAuthenticated, isLinked } = useCustomer();
    const [progress, setProgress] = useState(null);
    const [loading, setLoading] = useState(true);
    const { showAlert } = useAlert();
    const [isAccordionOpen, setIsAccordionOpen] = useState(true);

    const fetchProgress = useCallback(async () => {
        if (!isAuthenticated || !isLinked || !customerId) { setProgress(null); setLoading(false); return; }
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('get_my_customer_rewards_progress');
            if (error) throw error;
            setProgress(data);
        } catch (err) {
            console.error('Error fetching rewards progress:', err);
            setProgress(null);
        } finally { setLoading(false); }
    }, [customerId, isAuthenticated, isLinked]);

    useEffect(() => { fetchProgress(); }, [fetchProgress]);
    useEffect(() => {
        if (!customerId || !isAuthenticated || !isLinked) return undefined;
        const handleRevalidate = () => { if (document.visibilityState === 'visible') fetchProgress(); };
        const handleOrderStatus = (e) => { if (e?.detail?.status === 'completado') fetchProgress(); };
        window.addEventListener('visibilitychange', handleRevalidate);
        window.addEventListener('focus', handleRevalidate);
        window.addEventListener('order-status-updated', handleOrderStatus);
        return () => { window.removeEventListener('visibilitychange', handleRevalidate); window.removeEventListener('focus', handleRevalidate); window.removeEventListener('order-status-updated', handleOrderStatus); };
    }, [customerId, fetchProgress, isAuthenticated, isLinked]);
    useEffect(() => {
        if (!customerId || !isAuthenticated || !isLinked) return undefined;
        const channel = supabase.channel(`customer-rewards-${customerId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'customers', filter: `id=eq.${customerId}` }, fetchProgress)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'referral_levels' }, fetchProgress)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'rewards' }, fetchProgress)
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, [customerId, fetchProgress, isAuthenticated, isLinked]);

    const handleClaimCode = async (reward) => {
        try {
            const { data: newCode, error } = await supabase.rpc('generate_my_personal_reward_code', { p_reward_id: reward.id });
            if (error) throw error;
            showAlert(`¡Código personal "${newCode}" generado! Cópialo y úsalo en tu carrito.`, 'success');
            fetchProgress();
        } catch (err) { showAlert(err?.message || 'Error inesperado al reclamar recompensa.'); }
    };
    const handleCopyCode = (code) => { navigator.clipboard.writeText(code); showAlert(`¡Código "${code}" copiado!`); };

    if (loading) return <LoadingSpinner />;
    if (!progress) return <p>No se pudo cargar tu progreso de recompensas.</p>;
    const { current_level, next_level, referral_count } = progress;
    const progressPercentage = next_level?.min_referrals ? Math.min(100, (referral_count / next_level.min_referrals) * 100) : (current_level?.name ? 100 : 0);
    const noLevelsConfigured = !current_level?.name && !next_level?.name;
    const hasReachedMaxLevel = current_level?.name && !next_level?.name;

    return <div className={styles.card}>
        <div className={styles.cardHeader}><TrophyIcon/><h2>Mis Recompensas</h2></div>
        <div className={styles.rewardsProgress}><div className={styles.levelInfo}>{current_level?.name && <span>Nivel actual: <strong>{current_level.name}</strong></span>}{next_level?.name && <span>Siguiente nivel: <strong>{next_level.name}</strong></span>}</div>{!noLevelsConfigured && <div className={styles.progressBarContainer}><div className={styles.progressBar} style={{width:`${progressPercentage}%`}}/></div>}<p className={styles.progressText}>{noLevelsConfigured ? 'El sistema de recompensas se está preparando. ¡Vuelve pronto! Pero, puedes compartir tu link e ir acumulando puntos' : hasReachedMaxLevel ? '¡Has alcanzado el nivel más alto! Eres un(a) crack. 😎' : `Necesitas ${next_level.min_referrals - referral_count} referidos más para el siguiente nivel.`}</p></div>
        {!noLevelsConfigured && <div className={`${styles.rewardsLists} ${hasReachedMaxLevel ? styles.centeredLayout : ''}`}><div><div className={styles.accordionHeader} onClick={() => setIsAccordionOpen(!isAccordionOpen)}><h4>Recompensas Desbloqueadas</h4><span className={`${styles.accordionIcon} ${isAccordionOpen ? styles.open : ''}`}>▼</span></div><div className={`${styles.accordionContent} ${isAccordionOpen ? styles.open : ''}`}><ul>{progress.unlocked_rewards?.length > 0 ? progress.unlocked_rewards.map(reward => { const claim = progress.claimed_rewards?.find(c => c.reward_id === reward.id); return <li key={reward.id}><div className={styles.unlockedReward}><span>🎁 {reward.description}</span>{claim ? <button onClick={() => handleCopyCode(claim.generated_code)} className={styles.copyCodeButton}>Copiar: <strong>{claim.generated_code}</strong></button> : reward.reward_code && <button onClick={() => handleClaimCode(reward)} className={styles.claimCodeButton}>Reclama tu código único</button>}</div></li>; }) : <li>Cuando hayas alcanzado la meta aqui apareceran tus recompensa</li>}</ul></div></div>{next_level?.name && <div><h4>Próximas Recompensas</h4><ul className={styles.upcomingRewards}>{progress.upcoming_rewards?.length > 0 ? progress.upcoming_rewards.map(r => <li key={r.id}>✨ {r.description}</li>) : <li>Próximamente...</li>}</ul></div>}</div>}
    </div>;
};

export default function MyStuff() {
    const { isAuthenticated, isLinked, setCheckoutModalOpen } = useCustomer();
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

    const handleRemoveFavorite = async () => {
        if (!favoriteToRemove?.products?.id || !isAuthenticated || !isLinked) return;
        const { error: deleteError } = await supabase.from('customer_favorites').delete().eq('product_id', favoriteToRemove.products.id).eq('customer_id', customer.id);
        if (deleteError) { showToast('No se pudo quitar de favoritos.'); return; }
        showToast(`${favoriteToRemove.products.name} eliminado de tus favoritos.`); setFavoriteToRemove(null); refetchExtras();
    };
    const handleUpdateReview = async () => {
        if (!editingReview) return;
        const { error: updateError } = await supabase.from('product_reviews').update({ comment: editingReview.comment, rating: editingReview.rating }).eq('id', editingReview.id);
        if (updateError) showToast('Error al actualizar la reseña.'); else { showToast('Reseña actualizada con éxito.'); setEditingReview(null); refetchExtras(); }
    };
    const handleDeleteReview = async () => {
        if (!reviewToDelete) return;
        const { error: deleteError } = await supabase.from('product_reviews').delete().eq('id', reviewToDelete.id);
        if (deleteError) showToast('Error al eliminar la reseña.'); else { showToast('Reseña eliminada.'); setReviewToDelete(null); refetchExtras(); }
    };
    const handleAddToCartFromFav = (event, favoriteProduct) => {
        event.stopPropagation();
        const fullProduct = liveProducts.find(p => p.id === favoriteProduct.id);
        if (!fullProduct) { showToast('Lo sentimos, este producto ya no está disponible.'); return; }
        addToCart(fullProduct, 1); showToast(`¡${fullProduct.name} añadido al carrito!`);
    };

    const renderContent = () => {
        if (!isAuthenticated) return <AuthPrompt />;
        if (!isLinked || !customer) return <div className={styles.prompt}><h2>Cuenta pendiente</h2><p>Tu teléfono está autenticado pero aún no está vinculado a un cliente.</p><button onClick={() => setCheckoutModalOpen(true, 'profile')} className={styles.actionButton}>Completar mi perfil</button></div>;
        if (loading) return <LoadingSpinner />;
        if (error) return <div className={styles.prompt}><h2>Error Inesperado</h2><p>No pudimos cargar tus datos.</p></div>;
        if (visibilitySettings.my_stuff_page === false) return <div className={styles.prompt}><h2>Sección no disponible</h2><p>Esta sección está temporalmente desactivada.</p></div>;
        return <>
            {visibilitySettings.stuff_referrals !== false && customer.referral_code && <ReferralSystem customer={customer}/>} 
            {visibilitySettings.stuff_rewards !== false && <RewardsSection/>}
            {visibilitySettings.stuff_favorites !== false && <div className={styles.card}><div className={styles.cardHeader}><HeartIcon/><h2>Mis Favoritos ({favorites.length})</h2></div>{favorites.length > 0 ? <div className={styles.grid}>{favorites.map(fav => fav.products && <div key={fav.products.id} className={`${styles.gridItem} ${!fav.products.is_active ? styles.unavailable : ''}`}>{!fav.products.is_active && <div className={styles.unavailableBadge}>No disponible</div>}<ImageWithFallback src={fav.products.image_url} alt={fav.products.name}/><h3>{fav.products.name}</h3><div className={styles.gridItemActions}><button onClick={(e) => handleAddToCartFromFav(e, fav.products)} className={styles.addButton} disabled={!fav.products.is_active}>Añadir</button><button onClick={() => setFavoriteToRemove(fav)} className={styles.removeButton}>Quitar</button></div></div>)}</div> : <p>Aún no has guardado productos favoritos.</p>}</div>}
            {visibilitySettings.stuff_reviews !== false && <div className={styles.card}><div className={styles.cardHeader}><StarIcon/><h2>Mis Reseñas ({myReviews.length})</h2></div>{myReviews.length > 0 ? <div className={styles.reviewList}>{myReviews.map(rev => rev.products && <div key={rev.id} className={styles.reviewItem}>{editingReview?.id === rev.id ? <div className={styles.reviewEditor}><div className={styles.reviewProductInfo}><ImageWithFallback src={rev.products.image_url} alt={rev.products.name}/><h4>Editando: <strong>{rev.products.name}</strong></h4></div><textarea rows="3" value={editingReview.comment} onChange={e => setEditingReview({...editingReview, comment:e.target.value})}/><div className={styles.reviewActions}><button onClick={() => setEditingReview(null)} className={styles.cancelButton}>Cancelar</button><button onClick={handleUpdateReview} className={styles.actionButton}>Guardar</button></div></div> : <><div className={styles.reviewProductInfo}><ImageWithFallback src={rev.products.image_url} alt={rev.products.name}/><h4>{rev.products.name} {!rev.products.is_active && <span className={styles.unavailableText}>(No disponible)</span>}</h4></div><p className={styles.reviewComment}>"{rev.comment}"</p><div className={styles.reviewActions}><button onClick={() => setEditingReview(rev)}>Editar</button><button onClick={() => setReviewToDelete(rev)} className={styles.removeButton}>Eliminar</button></div></>}</div>)}</div> : <p>Todavía no has escrito ninguna reseña.</p>}</div>}
        </>;
    };

    return <><SEO title="Mi Actividad y Recompensas - Entre Alas" description="Revisa tus productos favoritos, gestiona tus reseñas y sigue tu progreso en el sistema de recompensas." type="website" noindex/><div className={styles.container}>{renderContent()}<ConfirmModal isOpen={!!favoriteToRemove} onClose={() => setFavoriteToRemove(null)} onConfirm={handleRemoveFavorite} title="¿Quitar de Favoritos?">¿Eliminar "{favoriteToRemove?.products?.name}" de tus favoritos?</ConfirmModal><ConfirmModal isOpen={!!reviewToDelete} onClose={() => setReviewToDelete(null)} onConfirm={handleDeleteReview} title="¿Eliminar Reseña?">Esta acción es permanente.</ConfirmModal></div></>;
}
