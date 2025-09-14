// src/context/CartContext.jsx

import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';

const CartContext = createContext();

export const useCart = () => useContext(CartContext);

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [total, setTotal] = useState(0); // <-- Total ahora es un estado

  // --- useEffect para recalcular el total dinámicamente ---
  useEffect(() => {
    // Cada vez que cartItems cambie, calculamos el nuevo total.
    const newTotal = cartItems.reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        return sum + price * quantity;
    }, 0);
    setTotal(newTotal);
  }, [cartItems]); // <-- Dependencia: se ejecuta si cartItems cambia

  const toggleCart = useCallback(() => setIsCartOpen(prev => !prev), []);
  const openCart = useCallback(() => setIsCartOpen(true), []);

  const addToCart = useCallback((product) => {
    setCartItems(prevItems => {
      const existingItem = prevItems.find(item => item.id === product.id);
      if (existingItem) {
        return prevItems.map(item =>
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prevItems, { ...product, quantity: 1 }];
    });
    openCart();
  }, [openCart]);

  const removeFromCart = useCallback((productId) => {
    setCartItems(prevItems => prevItems.filter(item => item.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId, quantity) => {
    const numQuantity = parseInt(quantity, 10);

    // Si la cantidad es 0 o un número inválido, eliminamos el item.
    if (isNaN(numQuantity) || numQuantity <= 0) {
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
  }, []);
  
  const value = {
    cartItems,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    total, // <-- Usamos el total del estado
    isCartOpen,
    toggleCart,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};
