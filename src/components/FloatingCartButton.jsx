// src/components/FloatingCartButton.jsx (NUEVO ARCHIVO)

import React from 'react';
import { useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';

const ShoppingCartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>;

export default function FloatingCartButton() {
  const { cartItems, toggleCart } = useCart();
  const location = useLocation();

  const totalItems = cartItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  // Condiciones para mostrar el botón:
  // 1. Debe haber al menos un artículo en el carrito.
  // 2. El usuario debe estar en la página de inicio/menú ('/').
  const isVisible = totalItems > 0 && location.pathname === '/';

  if (!isVisible) {
    return null;
  }

  return (
    <div className="floating-cart-container">
      <button className="floating-cart-button" onClick={toggleCart}>
        <ShoppingCartIcon />
        <span>Ver Carrito</span>
        <span className="floating-cart-badge">{totalItems}</span>
      </button>
    </div>
  );
}