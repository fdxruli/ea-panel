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

    const applyDiscount = async (code) => {
        const upperCaseCode = code.toUpperCase();
        const { data, error } = await supabase.from('discounts').select('*').eq('code', upperCaseCode).single();
        if (error || !data) return { success: false, message: 'El código de descuento no es válido.' };
        const today = new Date().toISOString().split('T')[0];
        if (!data.is_active || (data.end_date && data.end_date < today) || (data.start_date && data.start_date > today)) {
            return { success: false, message: 'Este código ha expirado o no está activo.' };
        }
        const currentSubtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const discountAmount = calculateDiscount(currentSubtotal, cartItems, data);
        if (discountAmount > 0) {
            setDiscount({ code: data.code, value: data.value, details: data });
            return { success: true, message: '¡Descuento aplicado!' };
        } else {
            return { success: false, message: 'Este código no aplica para los productos en tu carrito.' };
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
        if (quantity === '') {
            setCartItems(prevItems => prevItems.map(item => item.id === productId ? { ...item, quantity: '' } : item));
            return;
        }
        const numQuantity = parseInt(quantity, 10);
        if (isNaN(numQuantity) || numQuantity < 0) return;
        if (numQuantity === 0) {
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