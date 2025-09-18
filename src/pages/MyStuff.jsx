// src/pages/MyStuff.jsx (CORREGIDO Y MEJORADO)

import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useCustomer } from '../context/CustomerContext';
import styles from './MyStuff.module.css';
import LoadingSpinner from '../components/LoadingSpinner';
import ConfirmModal from '../components/ConfirmModal';
import { useCart } from '../context/CartContext';
import { useNavigate } from 'react-router-dom';
import { useProducts } from '../context/ProductContext'; // 1. IMPORTAMOS EL CONTEXTO DE PRODUCTOS

const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>;

export default function MyStuff() {
    const { phone, setPhoneModalOpen } = useCustomer();
    const { addToCart, showToast } = useCart();
    const { products: liveProducts } = useProducts(); // 2. OBTENEMOS LA LISTA DE PRODUCTOS ACTIVOS
    const navigate = useNavigate();

    const [customer, setCustomer] = useState(null);
    const [favorites, setFavorites] = useState([]);
    const [reviews, setReviews] = useState([]);
    const [loading, setLoading] = useState(true);
    
    const [editingReview, setEditingReview] = useState(null);
    const [reviewToDelete, setReviewToDelete] = useState(null);
    const [favoriteToRemove, setFavoriteToRemove] = useState(null);

    const fetchData = useCallback(async () => {
        if (!phone) {
            setCustomer(null);
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const { data: custData, error: custError } = await supabase
                .from('customers').select('id, name').eq('phone', phone).single();

            if (custError || !custData) {
                setCustomer(null);
                throw new Error("Cliente no encontrado.");
            }
            
            setCustomer(custData);
            
            const { data: favData, error: favError } = await supabase
                .from('customer_favorites')
                .select('*, products(*)') 
                .eq('customer_id', custData.id);

            if (favError) throw favError;
            setFavorites(favData || []);

            const { data: revData, error: revError } = await supabase
                .from('product_reviews')
                .select('*, products(name, image_url, is_active)')
                .eq('customer_id', custData.id);

            if (revError) throw revError;
            setReviews(revData || []);

        } catch (error) {
            console.error("Error fetching data:", error);
            setFavorites([]);
            setReviews([]);
        } finally {
            setLoading(false);
        }
    }, [phone]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleRemoveFavorite = async () => {
        if (!favoriteToRemove || !customer) return;
        await supabase.from('customer_favorites').delete()
            .match({ customer_id: customer.id, product_id: favoriteToRemove.products.id });
        showToast(`${favoriteToRemove.products.name} eliminado de tus favoritos.`);
        setFavoriteToRemove(null);
        fetchData();
    };
    
    const handleUpdateReview = async () => {
        if (!editingReview) return;
        const { error } = await supabase
            .from('product_reviews')
            .update({ comment: editingReview.comment, rating: editingReview.rating })
            .eq('id', editingReview.id);

        if (error) {
            showToast("Error al actualizar la reseña.");
        } else {
            showToast("Reseña actualizada con éxito.");
            setEditingReview(null);
            fetchData();
        }
    };
    
    const handleDeleteReview = async () => {
        if (!reviewToDelete) return;
        await supabase.from('product_reviews').delete().eq('id', reviewToDelete.id);
        showToast("Reseña eliminada.");
        setReviewToDelete(null);
        fetchData();
    };

    // --- 👇 3. AQUÍ ESTÁ LA LÓGICA CORREGIDA ---
    const handleAddToCartFromFav = (event, favoriteProduct) => {
        event.stopPropagation();

        // Buscamos el producto completo en la lista de productos del menú principal.
        const fullProduct = liveProducts.find(p => p.id === favoriteProduct.id);

        // Si no se encuentra (porque fue desactivado), mostramos un error.
        if (!fullProduct) {
            console.error("El producto favorito ya no está disponible en el menú:", favoriteProduct);
            showToast("Lo sentimos, este producto ya no está disponible.");
            return;
        }

        // Si se encuentra, lo añadimos al carrito con toda su información correcta.
        addToCart(fullProduct, 1);
        showToast(`¡${fullProduct.name} añadido al carrito!`);
    };

    if (loading) return <LoadingSpinner />;

    if (!phone || !customer) {
         return (
            <div className={styles.container}>
                <div className={styles.prompt}>
                    <h2>Ingresa tu número para ver tu actividad</h2>
                    <p>Para ver tus favoritos y reseñas, necesitamos tu número de WhatsApp.</p>
                    <button onClick={() => setPhoneModalOpen(true)} className={styles.actionButton}>
                        Ingresar Número
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <h1>Hola, {customer.name}</h1>
            <p className={styles.subtitle}>Aquí puedes gestionar tus productos favoritos y las reseñas que has escrito.</p>

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
                                        <img src={fav.products.image_url || 'https://via.placeholder.com/150'} alt={fav.products.name} />
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
                 <div className={styles.cardHeader}> <StarIcon /> <h2>Mis Reseñas ({reviews.length})</h2> </div>
                {reviews.length > 0 ? (
                    <div className={styles.reviewList}>
                        {reviews.map(rev => {
                             const isAvailable = rev.products?.is_active ?? false;
                            return (
                                rev.products && (
                                    <div key={rev.id} className={styles.reviewItem}>
                                        {editingReview?.id === rev.id ? (
                                            <div className={styles.reviewEditor}>
                                                <div className={styles.reviewProductInfo}>
                                                    <img src={rev.products.image_url || 'https://via.placeholder.com/80'} alt={rev.products.name} />
                                                    <h4>Editando reseña de: <strong>{rev.products.name}</strong></h4>
                                                </div>
                                                <textarea rows="3" value={editingReview.comment} onChange={e => setEditingReview({...editingReview, comment: e.target.value})} />
                                                <div className={styles.reviewActions}>
                                                    <button onClick={() => setEditingReview(null)} className={styles.cancelButton}>Cancelar</button>
                                                    <button onClick={handleUpdateReview} className={styles.actionButton}>Guardar</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={styles.reviewProductInfo}>
                                                    <img src={rev.products.image_url || 'https://via.placeholder.com/80'} alt={rev.products.name} />
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