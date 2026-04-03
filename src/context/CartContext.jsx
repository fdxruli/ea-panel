import React, { createContext, useState, useContext, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useProducts } from './ProductContext';

const CartContext = createContext();

const CART_STORAGE_KEY = 'ea-panel-cart';

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
    // 1. Carga inicial del carrito desde LocalStorage
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

    // Notificaciones
    const [cartNotification, setCartNotification] = useState(''); // Para modales de alerta (items eliminados)
    const [toast, setToast] = useState({ message: '', key: 0 });  // Para mensajes discretos (precios actualizados)

    const { products: liveProducts, loading: productsLoading } = useProducts();

    const showToast = useCallback((message) => {
        setToast({ message, key: Date.now() });
    }, []);

    // 2. Persistencia en LocalStorage cada vez que cambia el carrito
    useEffect(() => {
        try {
            window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
        } catch (error) {
            console.error("Error al guardar el carrito en localStorage:", error);
        }
    }, [cartItems]);

    const cartItemsRef = useRef(cartItems);
    useEffect(() => {
        cartItemsRef.current = cartItems;
    }, [cartItems]);

    useEffect(() => {
        const currentCart = cartItemsRef.current;

        // Usamos la referencia silenciosa en lugar del estado reactivo
        if (productsLoading || currentCart.length === 0) return;

        const liveProductsMap = new Map(liveProducts.map(p => [p.id, p]));

        let hasChanges = false;
        let pricesChanged = false;
        let itemsRemoved = false;
        const removedNames = [];
        const validatedItems = [];

        // Evaluamos en O(N) la referencia actual, no el estado renderizado
        for (let i = 0; i < currentCart.length; i++) {
            const item = currentCart[i];
            const liveProduct = liveProductsMap.get(item.id);

            if (!liveProduct) {
                itemsRemoved = true;
                hasChanges = true;
                removedNames.push(item.name);
                continue;
            }

            const livePrice = Number(liveProduct.price);
            const itemPrice = Number(item.price);

            if (Math.abs(livePrice - itemPrice) > 0.01) {
                pricesChanged = true;
                hasChanges = true;
                validatedItems.push({ ...item, price: livePrice });
            } else {
                validatedItems.push(item);
            }
        }

        if (hasChanges) {
            setCartItems(validatedItems);

            if (itemsRemoved) {
                const names = removedNames.join(', ');
                const plural = removedNames.length > 1;
                setCartNotification(
                    `Se ${plural ? 'han eliminado' : 'ha eliminado'} "${names}" de tu carrito por no estar disponible(s).`
                );
            }

            if (pricesChanged) {
                showToast("Algunos precios en tu carrito se han actualizado a su valor actual.");
            }
        }
    }, [liveProducts, productsLoading]);

    // 3. Cálculos de Totales y Descuentos (Sin cambios mayores)
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

    // 4. Funciones del carrito (Sin cambios)
    const applyDiscount = async (code, customerId) => {
        if (!customerId) return { success: false, message: 'Debes iniciar sesión para usar un código.' };
        const upperCaseCode = code.toUpperCase();
        try {
            const { data: discountData, error } = await supabase.from('discounts').select('*').eq('code', upperCaseCode).single();
            if (error || !discountData) return { success: false, message: 'El código no es válido.' };

            const today = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
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
    const closeCart = useCallback(() => {
        setIsCartOpen(false);
    }, []);
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
        applyDiscount, removeDiscount, isCartOpen, toggleCart, closeCart, cartNotification,
        clearCartNotification: () => setCartNotification(''),
        toast, showToast,
        replaceCart,
    };

    return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};