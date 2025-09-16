// src/context/CartContext.jsx (CORREGIDO Y OPTIMIZADO)

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useProducts } from './ProductContext'; // Se mantiene la importación

const CartContext = createContext();

const CART_STORAGE_KEY = 'ea-panel-cart';

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
    // --- ✅ 1. CORRECCIÓN: SE SACA LA LÓGICA FUERA DEL useState ---
    const [cartItems, setCartItems] = useState(() => {
        try {
            const storedCartItems = window.localStorage.getItem(CART_STORAGE_KEY);
            return storedCartItems ? JSON.parse(storedCartItems) : [];
        } catch (error) {
            console.error("Error al cargar el carrito desde localStorage:", error);
            return [];
        }
    });

    // --- ✅ 2. CORRECCIÓN: TODOS LOS HOOKS SE LLAMAN EN EL NIVEL SUPERIOR ---
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [subtotal, setSubtotal] = useState(0);
    const [discount, setDiscount] = useState(null);
    const [total, setTotal] = useState(0);
    const [cartNotification, setCartNotification] = useState('');
    const { products: liveProducts, loading: productsLoading } = useProducts(); // <-- Se corrige "liveLoading" a "productsLoading"

    // Guardar en localStorage cuando el carrito cambie
    useEffect(() => {
        try {
            window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
        } catch (error) {
            console.error("Error al guardar el carrito en localStorage:", error);
        }
    }, [cartItems]);

    // Efecto de validación automática (este ya estaba bien)
    useEffect(() => {
        if (productsLoading || cartItems.length === 0) return;

        const liveProductIds = new Set(liveProducts.map(p => p.id));
        const validCartItems = cartItems.filter(item => liveProductIds.has(item.id));

        if (validCartItems.length < cartItems.length) {
            // --- 👇 1. IDENTIFICAMOS LOS PRODUCTOS ELIMINADOS ---
            const removedItems = cartItems.filter(item => !liveProductIds.has(item.id));
            
            // --- 👇 2. OBTENEMOS SUS NOMBRES ---
            const removedProductNames = removedItems.map(item => item.name).join(', ');
            
            // --- 👇 3. CONSTRUIMOS EL MENSAJE ESPECÍFICO ---
            const singularOrPlural = removedItems.length > 1;
            const notificationMessage = `Se ${singularOrPlural ? 'han eliminado' : 'ha eliminado'} "${removedProductNames}" de tu carrito por no estar disponible.`;

            // --- 👇 4. ACTUALIZAMOS ESTADO CON EL NUEVO MENSAJE ---
            setCartNotification(notificationMessage);
            setCartItems(validCartItems);
        }
    }, [liveProducts, productsLoading, cartItems]); // <-- Se corrige la dependencia a cartItems.length

    // ... (el resto de las funciones como calculateDiscount, applyDiscount, addToCart, etc., no necesitan cambios)
    const calculateDiscount = useCallback((currentSubtotal, items, discountDetails) => {
        if (!discountDetails) return 0;
        let applicableValue = 0;
        switch (discountDetails.type) {
            case 'global':
                applicableValue = currentSubtotal;
                break;
            case 'category':
                applicableValue = items
                    .filter(item => item.category_id === discountDetails.target_id)
                    .reduce((sum, item) => sum + (item.price * item.quantity), 0);
                break;
            case 'product':
                applicableValue = items
                    .filter(item => item.id === discountDetails.target_id)
                    .reduce((sum, item) => sum + (item.price * item.quantity), 0);
                break;
            default:
                return 0;
        }
        return (applicableValue * (discountDetails.value / 100));
    }, []);

    useEffect(() => {
        const newSubtotal = cartItems.reduce((sum, item) => {
            const quantity = Number(item.quantity) || 0;
            const price = Number(item.price) || 0;
            return sum + price * quantity;
        }, 0);
        setSubtotal(newSubtotal);

        const discountAmount = calculateDiscount(newSubtotal, cartItems, discount?.details);
        setTotal(newSubtotal - discountAmount);

    }, [cartItems, discount, calculateDiscount]);

    const applyDiscount = async (code) => {
        const upperCaseCode = code.toUpperCase();
        const { data, error } = await supabase
            .from('discounts')
            .select('*')
            .eq('code', upperCaseCode)
            .single();

        if (error || !data) {
            console.error("Error o no se encontró el cupón:", error);
            removeDiscount();
            return { success: false, message: 'El código de descuento no es válido.' };
        }

        const today = new Date().toISOString().split('T')[0];
        if (!data.is_active || (data.end_date && data.end_date < today)) {
            removeDiscount();
            return { success: false, message: 'Este código ha expirado o no está activo.' };
        }
        if (data.start_date && data.start_date > today) {
            removeDiscount();
            return { success: false, message: 'Este código aún no es válido.' };
        }

        const currentSubtotal = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const discountAmount = calculateDiscount(currentSubtotal, cartItems, data);

        if (discountAmount > 0) {
            setDiscount({
                code: data.code,
                value: data.value,
                details: data
            });
            return { success: true, message: '¡Descuento aplicado!' };
        } else {
            removeDiscount();
            return { success: false, message: 'Este código no aplica para los productos en tu carrito.' };
        }
    };

    const removeDiscount = () => {
        setDiscount(null);
    };

    const toggleCart = useCallback(() => setIsCartOpen(prev => !prev), []);

    const addToCart = useCallback((product, quantityToAdd = 1) => {
        setCartItems(prevItems => {
            const existingItem = prevItems.find(item => item.id === product.id);
            if (existingItem) {
                return prevItems.map(item =>
                    item.id === product.id ? { ...item, quantity: Number(item.quantity || 0) + quantityToAdd } : item
                );
            }
            return [...prevItems, { ...product, quantity: quantityToAdd }];
        });
    }, []);

    const removeFromCart = useCallback((productId) => {
        setCartItems(prevItems => prevItems.filter(item => item.id !== productId));
    }, []);

    const updateQuantity = useCallback((productId, quantity) => {
        if (quantity === '') {
            setCartItems(prevItems =>
                prevItems.map(item =>
                    item.id === productId ? { ...item, quantity: '' } : item
                )
            );
            return;
        }

        const numQuantity = parseInt(quantity, 10);
        if (isNaN(numQuantity) || numQuantity < 0) return;

        if (numQuantity === 0) {
            removeFromCart(productId);
            return;
        }

        setCartItems(prevItems =>
            prevItems.map(item =>
                item.id === productId ? { ...item, quantity: numQuantity } : item
            )
        );
    }, [removeFromCart]);

    const clearCart = useCallback(() => {
        setCartItems([]);
        setDiscount(null);
        window.localStorage.removeItem(CART_STORAGE_KEY);
    }, []);

    const discountAmount = calculateDiscount(subtotal, cartItems, discount?.details);

    const value = {
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        subtotal,
        total,
        discount: discount ? { ...discount, amount: discountAmount } : null,
        applyDiscount,
        removeDiscount,
        isCartOpen,
        toggleCart,
        cartNotification,
        clearCartNotification: () => setCartNotification(''),
    };

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
