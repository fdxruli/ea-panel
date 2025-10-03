// src/pages/MyStuff.jsx (MODIFICADO)

import React, { useState, useMemo } from 'react';
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
        await supabase.from('customer_favorites').delete()
            .match({ customer_id: customer.id, product_id: favoriteToRemove.products.id });
        showToast(`${favoriteToRemove.products.name} eliminado de tus favoritos.`);
        setFavoriteToRemove(null);
        refetchExtras();
    };

    const handleUpdateReview = async () => {
        if (!editingReview) return;
        const cleanComment = DOMPurify.sanitize(editingReview.comment);
        const { error } = await supabase
            .from('product_reviews')
            .update({ comment: editingReview.comment, rating: editingReview.rating })
            .eq('id', editingReview.id);

        if (error) {
            showToast("Error al actualizar la reseña.");
        } else {
            showToast("Reseña actualizada con éxito.");
            setEditingReview(null);
            refetchExtras();
        }
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
        if (!fullProduct) {
            showToast("Lo sentimos, este producto ya no está disponible.");
            return;
        }
        addToCart(fullProduct, 1);
        showToast(`¡${fullProduct.name} añadido al carrito!`);
    };

    const renderContent = () => {
        if (!phone) {
            return (
                <AuthPrompt/>
            );
        }

        if (loading) return <LoadingSpinner />;

        if (error) {
            return (
                <div className={styles.prompt}>
                    <h2>Error Inesperado</h2>
                    <p>No pudimos cargar tus datos. Por favor, intenta de nuevo más tarde.</p>
                </div>
            );
        }

        if (!customer) {
            return (
                <div className={styles.prompt}>
                    <h2>¡Bienvenido!</h2>
                    <p>Parece que eres nuevo por aquí. Completa tu perfil para guardar tus favoritos y reseñas.</p>
                    <button onClick={() => setCheckoutModalOpen(true, 'profile')} className={styles.actionButton}>
                        Completar mi perfil
                    </button>
                </div>
            );
        }

        if (customer) {
            return (
                <>
                    <p className={styles.subtitle}>Gestiona tus productos favoritos y tus reseñas.</p>
                    {/* --- 👆 FIN DEL CAMBIO --- */}

                    <div className={styles.card}>
                        <div className={styles.cardHeader}> <HeartIcon /> <h2>Mis Favoritos ({favorites.length})</h2> </div>
                        {favorites.length > 0 ? (
                            <div className={styles.grid}>
                                {favorites.map(fav => {
                                    const isAvailable = fav.products?.is_active ?? false;
                                    return (
                                        fav.products && (
                                            <div key={fav.products.id} className={`${styles.gridItem} ${!isAvailable ? styles.unavailable : ''}`}>
                                                {!isAvailable && <div className={styles.unavailableBadge}>No disponible</div>}
                                                <img src={fav.products.image_url || 'https://placehold.co/150'} alt={fav.products.name} />
                                                <h3>{fav.products.name}</h3>
                                                <div className={styles.gridItemActions}>
                                                    <button onClick={(e) => handleAddToCartFromFav(e, fav.products)} className={styles.addButton} disabled={!isAvailable}>
                                                        Añadir
                                                    </button>
                                                    <button onClick={() => setFavoriteToRemove(fav)} className={styles.removeButton}>
                                                        Quitar
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    );
                                })}
                            </div>
                        ) : <p>Aún no has guardado productos favoritos. ¡Explora el menú y añade los que más te gusten!</p>}
                    </div>

                    <div className={styles.card}>
                        <div className={styles.cardHeader}> <StarIcon /> <h2>Mis Reseñas ({myReviews.length})</h2> </div>
                        {myReviews.length > 0 ? (
                            <div className={styles.reviewList}>
                                {myReviews.map(rev => {
                                    const isAvailable = rev.products?.is_active ?? false;
                                    return (
                                        rev.products && (
                                            <div key={rev.id} className={styles.reviewItem}>
                                                {editingReview?.id === rev.id ? (
                                                    <div className={styles.reviewEditor}>
                                                        <div className={styles.reviewProductInfo}>
                                                            <img src={rev.products.image_url || 'https://placehold.co/80'} alt={rev.products.name} />
                                                            <h4>Editando reseña de: <strong>{rev.products.name}</strong></h4>
                                                        </div>
                                                        <textarea rows="3" value={editingReview.comment} onChange={e => setEditingReview({ ...editingReview, comment: e.target.value })} />
                                                        <div className={styles.reviewActions}>
                                                            <button onClick={() => setEditingReview(null)} className={styles.cancelButton}>Cancelar</button>
                                                            <button onClick={handleUpdateReview} className={styles.actionButton}>Guardar</button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        <div className={styles.reviewProductInfo}>
                                                            <img src={rev.products.image_url || 'https://placehold.co/80'} alt={rev.products.name} />
                                                            <h4>
                                                                {rev.products.name} {!isAvailable && <span className={styles.unavailableText}>(No disponible)</span>}
                                                            </h4>
                                                        </div>
                                                        <p className={styles.reviewComment}>"{rev.comment}"</p>
                                                        <div className={styles.reviewActions}>
                                                            <button onClick={() => setEditingReview(rev)}>Editar</button>
                                                            <button onClick={() => setReviewToDelete(rev)} className={styles.removeButton}>Eliminar</button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        )
                                    );
                                })}
                            </div>
                        ) : <p>Todavía no has escrito ninguna reseña.</p>}
                    </div>
                </>
            );
        }
        return null;
    }

    return (
        <div className={styles.container}>
            {renderContent()}

            <ConfirmModal
                isOpen={!!favoriteToRemove}
                onClose={() => setFavoriteToRemove(null)}
                onConfirm={handleRemoveFavorite}
                title="¿Quitar de Favoritos?"
            >
                ¿Estás seguro de que quieres eliminar "{favoriteToRemove?.products?.name}" de tu lista de favoritos?
            </ConfirmModal>

            <ConfirmModal
                isOpen={!!reviewToDelete}
                onClose={() => setReviewToDelete(null)}
                onConfirm={handleDeleteReview}
                title="¿Eliminar Reseña?"
            >
                Esta acción es permanente y la reseña se borrará definitivamente.
            </ConfirmModal>
        </div>
    );
}