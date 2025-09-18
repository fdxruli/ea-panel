// src/components/EditOrderModal.jsx (MODIFICADO)

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import styles from './EditOrderModal.module.css';
import LoadingSpinner from './LoadingSpinner';
import { useAlert } from '../context/AlertContext'; // <-- IMPORTAR

export default function EditOrderModal({ order, onClose, onOrderUpdated }) {
    const { showAlert } = useAlert(); // <-- INICIALIZAR
    const [orderItems, setOrderItems] = useState([]);
    const [allProducts, setAllProducts] = useState([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        const fetchProducts = async () => {
            setLoading(true);
            const { data: productsData, error: productsError } = await supabase
                .from('products')
                .select('*')
                .eq('is_active', true);
            
            if (productsError) {
                console.error("Error fetching products:", productsError);
                onClose();
                return;
            }
            
            setAllProducts(productsData);
            
            const initialItems = order.order_items.map(item => ({
                ...item.products,
                product_id: item.product_id,
                quantity: item.quantity,
                price: item.price,
            }));

            setOrderItems(initialItems);
            setLoading(false);
        };

        fetchProducts();
    }, [order, onClose]);

    useEffect(() => {
        const newTotal = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        setTotal(newTotal);
    }, [orderItems]);

    const updateQuantity = (productId, newQuantity) => {
        const numQuantity = parseInt(newQuantity, 10);
        if (isNaN(numQuantity) || numQuantity <= 0) return;

        setOrderItems(prevItems => prevItems.map(item =>
            item.id === productId ? { ...item, quantity: numQuantity } : item
        ));
    };

    // --- 👇 NUEVA FUNCIÓN PARA ELIMINAR UN ITEM ---
    const removeItem = (productId) => {
        setOrderItems(prevItems => prevItems.filter(item => item.id !== productId));
    };
    
    const addProduct = (product) => {
        setOrderItems(prevItems => {
            const existingItem = prevItems.find(item => item.id === product.id);
            if (existingItem) {
                 return prevItems.map(item =>
                    item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
                );
            }
            return [...prevItems, { ...product, quantity: 1, product_id: product.id }];
        });
    };

    const handleUpdateOrder = async () => {
        if (orderItems.length === 0) {
            showAlert("No puedes dejar el pedido vacío. Si quieres cancelarlo, usa la opción correspondiente.");
            return;
        }
        setIsSubmitting(true);
        try {
            const { error: deleteError } = await supabase
                .from('order_items')
                .delete()
                .eq('order_id', order.id);
            if (deleteError) throw deleteError;

            const newOrderItems = orderItems.map(item => ({
                order_id: order.id,
                product_id: item.product_id,
                quantity: item.quantity,
                price: item.price,
            }));
            const { error: insertError } = await supabase
                .from('order_items')
                .insert(newOrderItems);
            if (insertError) throw insertError;
            
            const { error: updateOrderError } = await supabase
                .from('orders')
                .update({ total_amount: total })
                .eq('id', order.id);
            if (updateOrderError) throw updateOrderError;

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

    return (
        <div className={styles.modalOverlay}>
            <div className={styles.modalContent}>
                <button onClick={onClose} className={styles.closeButton}>×</button>
                <h2>Editando Pedido #{order.order_code}</h2>
                
                {loading ? <LoadingSpinner /> : (
                    <>
                        <div className={styles.itemsList}>
                            {orderItems.map(item => (
                                <div key={item.id} className={styles.item}>
                                    <span>{item.name} (${item.price.toFixed(2)})</span>
                                    <div className={styles.actions}>
                                        <input
                                            type="number"
                                            value={item.quantity}
                                            onChange={(e) => updateQuantity(item.id, e.target.value)}
                                            min="1"
                                        />
                                        {/* --- 👇 BOTÓN DE ELIMINAR AÑADIDO --- */}
                                        <button onClick={() => removeItem(item.id)} className={styles.removeButton}>
                                            Quitar
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        <div className={styles.addProductSection}>
                            <h4>Añadir más productos</h4>
                             <div className={styles.productList}>
                                {allProducts.filter(p => !orderItems.some(i => i.id === p.id)).map(product => (
                                    <button key={product.id} onClick={() => addProduct(product)}>
                                        + {product.name}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className={styles.footer}>
                            <h3>Total: ${total.toFixed(2)}</h3>
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