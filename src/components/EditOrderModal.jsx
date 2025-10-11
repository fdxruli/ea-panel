import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './EditOrderModal.module.css';
import LoadingSpinner from './LoadingSpinner';
import { useAlert } from '../context/AlertContext';
import ImageWithFallback from './ImageWithFallback';

const TrashIcon = () => (
    <svg xmlns="http://www.ww3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
);

export default function EditOrderModal({ order, onClose, onOrderUpdated }) {
    const { showAlert } = useAlert();
    const [orderItems, setOrderItems] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const [activeTab, setActiveTab] = useState('current');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(null);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const { data: productsData, error: productsError } = await supabase
                    .from('products').select('*').eq('is_active', true);
                if (productsError) throw productsError;

                const { data: categoriesData, error: categoriesError } = await supabase
                    .from('categories').select('*').order('name');
                if (categoriesError) throw categoriesError;

                setAllProducts(productsData);
                setCategories(categoriesData);

                const initialItems = order.order_items.map(item => ({
                    ...item.products,
                    product_id: item.product_id,
                    quantity: item.quantity,
                    price: item.price,
                }));
                setOrderItems(initialItems);

            } catch (error) {
                console.error("Error fetching data:", error);
                showAlert('Hubo un error al cargar los datos para la edición.');
                onClose();
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [order, onClose, showAlert]);

    useEffect(() => {
        const newTotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setTotal(newTotal);
    }, [orderItems]);

    const updateQuantity = (productId, newQuantity) => {
        const numQuantity = parseInt(newQuantity, 10);
        if (isNaN(numQuantity) || numQuantity <= 0) {
            removeItem(productId);
            return;
        };
        setOrderItems(prevItems => prevItems.map(item =>
            item.id === productId ? { ...item, quantity: numQuantity } : item
        ));
    };

    const removeItem = (productId) => {
        setOrderItems(prevItems => prevItems.filter(item => item.id !== productId));
    };
    
    const addProduct = (product) => {
        const existingItem = orderItems.find(item => item.id === product.id);
        if (existingItem) {
            setOrderItems(prevItems =>
                prevItems.map(item =>
                    item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                )
            );
        } else {
            setOrderItems(prevItems => [...prevItems, { ...product, quantity: 1, product_id: product.id }]);
            showAlert(`${product.name} añadido al pedido.`);
        }
        setActiveTab('current');
    };

    const handleUpdateOrder = async () => {
        if (orderItems.length === 0) {
            showAlert("No puedes dejar el pedido vacío. Si quieres cancelarlo, usa la opción correspondiente.");
            return;
        }
        setIsSubmitting(true);
        try {
            await supabase.from('order_items').delete().eq('order_id', order.id);
            const newOrderItems = orderItems.map(item => ({
                order_id: order.id, product_id: item.product_id,
                quantity: item.quantity, price: item.price,
            }));
            await supabase.from('order_items').insert(newOrderItems);
            await supabase.from('orders').update({ total_amount: total }).eq('id', order.id);
            showAlert("¡Pedido actualizado con éxito!");
            onOrderUpdated();
            onClose();
        } catch (error) {
            console.error("Error al actualizar el pedido:", error);
            showAlert(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const availableProducts = useMemo(() => {
        return allProducts
            .filter(p => !orderItems.some(i => i.id === p.id))
            .filter(p => selectedCategory ? p.category_id === selectedCategory : true)
            .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [allProducts, orderItems, selectedCategory, searchTerm]);

    const visibleCategories = useMemo(() => {
        const productsAvailableToAdd = allProducts.filter(p => !orderItems.some(item => item.id === p.id));
        const availableCategoryIds = new Set(productsAvailableToAdd.map(p => p.category_id));
        return categories.filter(cat => availableCategoryIds.has(cat.id));
    }, [allProducts, orderItems, categories]);

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <div className={styles.header}>
                    <h2>Editando Pedido #{order.order_code}</h2>
                    <button onClick={onClose} className={styles.closeButton}>×</button>
                </div>
                
                {loading ? <LoadingSpinner /> : (
                    <>
                        <div className={styles.tabs}>
                            <button onClick={() => setActiveTab('current')} className={activeTab === 'current' ? styles.active : ''}>
                                Pedido Actual ({orderItems.length})
                            </button>
                            <button onClick={() => setActiveTab('add')} className={activeTab === 'add' ? styles.active : ''}>
                                Añadir Productos
                            </button>
                        </div>
                        <div className={`${styles.contentBody} ${activeTab === 'add' ? styles.addMode : ''}`}>
                            <div className={styles.itemsList}>
                                {orderItems.length > 0 ? orderItems.map(item => (
                                    <div key={item.id} className={styles.cartItem}>
                                        <ImageWithFallback src={item.image_url || 'https://placehold.co/80'} alt={item.name} />
                                        <div className={styles.itemInfo}>
                                            <span className={styles.itemName}>{item.name}</span>
                                            <span className={styles.itemPrice}>${item.price.toFixed(2)}</span>
                                        </div>
                                        <div className={styles.itemActions}>
                                            {item.quantity === 1 ? (
                                                <button onClick={() => removeItem(item.id)} className={`${styles.quantityButton} ${styles.deleteButton}`}>
                                                    <TrashIcon />
                                                </button>
                                            ) : (
                                                <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className={styles.quantityButton}>-</button>
                                            )}
                                            <span className={styles.quantityDisplay}>{item.quantity}</span>
                                            <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className={styles.quantityButton}>+</button>
                                        </div>
                                    </div>
                                )) : <p className={styles.emptyMessage}>Añade productos a tu pedido.</p>}
                            </div>

                            <div className={styles.addProductSection}>
                                <input type="text" placeholder="Buscar producto..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className={styles.searchInput} />
                                <div className={styles.categoryFilters}>
                                    <button onClick={() => setSelectedCategory(null)} className={!selectedCategory ? styles.active : ''}>Todos</button>
                                    {visibleCategories.map(cat => (
                                        <button key={cat.id} onClick={() => setSelectedCategory(cat.id)} className={selectedCategory === cat.id ? styles.active : ''}>
                                            {cat.name}
                                        </button>
                                    ))}
                                </div>
                                <div className={styles.productList}>
                                    {availableProducts.map(product => (
                                        <div key={product.id} className={styles.productCard} onClick={() => addProduct(product)}>
                                            <ImageWithFallback src={product.image_url || 'https://placehold.co/150'} alt={product.name}/>
                                            <div className={styles.productInfo}>
                                                <span>{product.name}</span>
                                                <strong>${product.price.toFixed(2)}</strong>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className={styles.footer}>
                            <div className={styles.totalContainer}>
                                <span>Total</span>
                                <strong>${total.toFixed(2)}</strong>
                            </div>
                            <button onClick={handleUpdateOrder} disabled={isSubmitting} className={styles.updateButton}>
                                {isSubmitting ? 'Actualizando...' : 'Guardar Cambios'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}