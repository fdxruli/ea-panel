import React from 'react';
import { useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useUserData } from '../context/UserDataContext'; // ✅ AÑADIR
import ShoppingCartIcon from '../assets/icons/shopping-cart.svg?react';

export default function FloatingCartButton() {
  const { cartItems, toggleCart } = useCart();
  const { customer } = useUserData(); // ✅ OBTENER CUSTOMER
  const location = useLocation();

  const totalItems = cartItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  const isVisible = totalItems > 0 && location.pathname === '/';

  if (!isVisible) {
    return null;
  }

  // ✅ APLICAR CLASE CONDICIONAL
  const containerClass = customer 
    ? 'floating-cart-container' 
    : 'floating-cart-container no-navbar';

  return (
    <div className={containerClass}>
      <button className="floating-cart-button" onClick={toggleCart}>
        <ShoppingCartIcon />
        <span>Ver Carrito</span>
        <span className="floating-cart-badge">{totalItems}</span>
      </button>
    </div>
  );
}