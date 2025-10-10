// src/context/CartContext.jsx (CORREGIDO Y FINAL)

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useProducts } from './ProductContext';

const CartContext = createContext();

const CART_STORAGE_KEY = 'ea-panel-cart';

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
    const [cartItems, setCartItems] = useState(() => {
        try {
            const storedCartItems = window.localStorage.getItem(CART_STORAGE_KEY);
            return storedCartItems ? JSON.parse(storedCartItems) : [];
        } catch (error) {
            console.error("Error al cargar el carrito desde localStorage:", error);
            return [];
        }
    });

    const [isCartOpen, setIsCartOpen] = useState(false);
    const [subtotal, setSubtotal] = useState(0);
    const [discount, setDiscount] = useState(null);
    const [total, setTotal] = useState(0);
    const [cartNotification, setCartNotification] = useState('');
    const { products: liveProducts, loading: productsLoading } = useProducts();
    const [toast, setToast] = useState({ message: '', key: 0 });

    const showToast = useCallback((message) => {
        setToast({ message, key: Date.now() });
    }, []);

    useEffect(() => {
        try {
            window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
        } catch (error) {
            console.error("Error al guardar el carrito en localStorage:", error);
        }
    }, [cartItems]);

    useEffect(() => {
        if (productsLoading || cartItems.length === 0) return;
        const liveProductIds = new Set(liveProducts.map(p => p.id));
        const validCartItems = cartItems.filter(item => liveProductIds.has(item.id));

        if (validCartItems.length < cartItems.length) {
            const removedItems = cartItems.filter(item => !liveProductIds.has(item.id));
            const removedProductNames = removedItems.map(item => item.name).join(', ');
            const singularOrPlural = removedItems.length > 1;
            const notificationMessage = `Se ${singularOrPlural ? 'han eliminado' : 'ha eliminado'} "${removedProductNames}" de tu carrito por no estar disponible.`;
            setCartNotification(notificationMessage);
            setCartItems(validCartItems);
        }
    }, [liveProducts, productsLoading, cartItems]);

    const calculateDiscount = useCallback((currentSubtotal, items, discountDetails) => {
        if (!discountDetails) return 0;
        let applicableValue = 0;
        switch (discountDetails.type) {
            case 'global': applicableValue = currentSubtotal; break;
            case 'category':
                applicableValue = items.filter(item => item.category_id === discountDetails.target_id).reduce((sum, item) => sum + (item.price * item.quantity), 0);
                break;
            case 'product':
                applicableValue = items.filter(item => item.id === discountDetails.target_id).reduce((sum, item) => sum + (item.price * item.quantity), 0);
                break;
            default: return 0;
        }
        return (applicableValue * (discountDetails.value / 100));
    }, []);

    useEffect(() => {
        const newSubtotal = cartItems.reduce((sum, item) => (sum + (Number(item.price) || 0) * (Number(item.quantity) || 0)), 0);
        setSubtotal(newSubtotal);
        const discountAmount = calculateDiscount(newSubtotal, cartItems, discount?.details);
        setTotal(newSubtotal - discountAmount);
    }, [cartItems, discount, calculateDiscount]);

    const applyDiscount = async (code, customerId) => {
        if (!customerId) {
            return { success: false, message: 'Debes iniciar sesión para usar un código.' };
        }
        const upperCaseCode = code.toUpperCase();
        try {
            const { data: discountData, error } = await supabase.from('discounts').select('*').eq('code', upperCaseCode).single();
            if (error || !discountData) return { success: false, message: 'El código no es válido.' };

            const today = new Date().toISOString().split('T')[0];
            if (!discountData.is_active || (discountData.end_date && discountData.end_date < today) || (discountData.start_date && discountData.start_date > today)) {
                return { success: false, message: 'Este código ha expirado o no está activo.' };
            }
            if (discountData.specific_customer_id && discountData.specific_customer_id !== customerId) {
                return { success: false, message: 'Este código de recompensa es personal y no te pertenece.' };
            }
            if (discountData.requires_referred_status) {
                const { data: customerData } = await supabase.from('customers').select('referrer_id').eq('id', customerId).single();
                if (!customerData.referrer_id) {
                    return { success: false, message: 'Este código es exclusivo para clientes invitados.' };
                }
            }
            if (discountData.is_single_use) {
                const { data: usageData } = await supabase.from('customer_discount_usage').select('customer_id').eq('customer_id', customerId).eq('discount_id', discountData.id).maybeSingle();
                if (usageData) {
                    return { success: false, message: 'Este código de un solo uso ya ha sido canjeado.' };
                }
            }

            const currentSubtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            const discountAmount = calculateDiscount(currentSubtotal, cartItems, discountData);

            if (discountAmount > 0) {
                setDiscount({ code: discountData.code, value: discountData.value, details: discountData });
                return { success: true, message: '¡Descuento aplicado!' };
            } else {
                return { success: false, message: 'Este código no aplica para los productos en tu carrito.' };
            }
        } catch (error) {
            console.error("Error applying discount:", error);
            return { success: false, message: 'Ocurrió un error inesperado al validar el código.' };
        }
    };

    const removeDiscount = () => setDiscount(null);
    const toggleCart = useCallback(() => setIsCartOpen(prev => !prev), []);
    const addToCart = useCallback((product, quantityToAdd = 1) => {
        setCartItems(prevItems => {
            const existingItem = prevItems.find(item => item.id === product.id);
            if (existingItem) {
                return prevItems.map(item => item.id === product.id ? { ...item, quantity: Number(item.quantity || 0) + quantityToAdd } : item);
            }
            return [...prevItems, { ...product, quantity: quantityToAdd }];
        });
    }, []);

    const removeFromCart = useCallback((productId) => {
        setCartItems(prevItems => prevItems.filter(item => item.id !== productId));
    }, []);

    const updateQuantity = useCallback((productId, quantity) => {
        const numQuantity = parseInt(quantity, 10);
        if (isNaN(numQuantity) || numQuantity < 1) {
            removeFromCart(productId);
            return;
        }
        setCartItems(prevItems => prevItems.map(item => item.id === productId ? { ...item, quantity: numQuantity } : item));
    }, [removeFromCart]);

    const clearCart = useCallback(() => {
        setCartItems([]);
        setDiscount(null);
        window.localStorage.removeItem(CART_STORAGE_KEY);
    }, []);
    
    const replaceCart = useCallback((newItems) => {
        clearCart();
        setCartItems(newItems);
    }, [clearCart]);

    const discountAmount = calculateDiscount(subtotal, cartItems, discount?.details);

    const value = {
        cartItems, addToCart, removeFromCart, updateQuantity, clearCart, subtotal, total,
        discount: discount ? { ...discount, amount: discountAmount } : null,
        applyDiscount, removeDiscount, isCartOpen, toggleCart, cartNotification,
        clearCartNotification: () => setCartNotification(''),
        toast, showToast,
        replaceCart,
    };

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
