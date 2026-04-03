import React from 'react';
import { useLocation } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useUserData } from '../context/UserDataContext';
import ShoppingCartIcon from '../assets/icons/shopping-cart.svg?react';

export default function FloatingCartButton() {
  const { cartItems, toggleCart } = useCart();
  const { customer } = useUserData();
  const location = useLocation();

  const totalItems = cartItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const isMenuRoute = location.pathname === '/' || location.pathname.startsWith('/producto/');

  if (!isMenuRoute) {
    return null;
  }

  const hasItems = totalItems > 0;
  const containerClass = customer
    ? 'floating-cart-container'
    : 'floating-cart-container no-navbar';

  return (
    <div className={containerClass}>
      <button
        type="button"
        data-cart-anchor="true"
        className="floating-cart-button"
        onClick={toggleCart}
        disabled={!hasItems}
        aria-hidden={!hasItems}
        tabIndex={hasItems ? 0 : -1}
        aria-label={hasItems ? `Ver carrito con ${totalItems} producto(s)` : 'Ancla del carrito'}
        style={{
          visibility: hasItems ? 'visible' : 'hidden',
          pointerEvents: hasItems ? 'auto' : 'none',
        }}
      >
        <ShoppingCartIcon />
        <span>Carrito</span>
        {hasItems && <span className="floating-cart-badge">{totalItems}</span>}
      </button>
    </div>
  );
}
