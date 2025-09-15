// src/context/CartContext.jsx

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

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
  const [total, setTotal] = useState(0);

  useEffect(() => {
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    } catch (error) {
      console.error("Error al guardar el carrito en localStorage:", error);
    }
  }, [cartItems]);

  useEffect(() => {
    const newTotal = cartItems.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      return sum + price * quantity;
    }, 0);
    setTotal(newTotal);
  }, [cartItems]);

  const toggleCart = useCallback(() => setIsCartOpen(prev => !prev), []);
  const openCart = useCallback(() => setIsCartOpen(true), []);

  const addToCart = useCallback((product) => {
    setCartItems(prevItems => {
      const existingItem = prevItems.find(item => item.id === product.id);
      if (existingItem) {
        return prevItems.map(item =>
          item.id === product.id ? { ...item, quantity: Number(item.quantity || 0) + 1 } : item
        );
      }
      return [...prevItems, { ...product, quantity: 1 }];
    });
    // openCart(); // <-- LÍNEA ELIMINADA/COMENTADA: Ya no se abre el carrito automáticamente.
  }, []); // Se elimina 'openCart' de las dependencias ya que no se usa.

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
    window.localStorage.removeItem(CART_STORAGE_KEY);
  }, []);
  
  const value = {
    cartItems,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    total,
    isCartOpen,
    toggleCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};