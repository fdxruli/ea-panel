// src/layouts/ClientLayout.jsx (CON NUEVO ENLACE)

import React from "react";
import { Outlet, Link, NavLink } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useProducts } from "../context/ProductContext";
import Cart from "../pages/Cart";
import PhoneModal from "../components/PhoneModal";
import './ClientLayout.css';
import AlertModal from "../components/AlertModal";
import { useAlert } from "../context/AlertContext";

// --- Iconos (se añade el de corazón) ---
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>;
const ShoppingCartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>;
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;


export default function ClientLayout() {
  const { toggleCart, cartItems, toast } = useCart();
  const { notification } = useProducts();
  const totalItems = cartItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  return (
    <div className="client-layout">
      <PhoneModal />
      <AlertModal />
      {notification && <div className="update-toast">{notification}</div>}
      {toast.message && <div key={toast.key} className="toast-notification">{toast.message}</div>}

      <header className="client-header">
        <Link to="/" className="logo"><h1>Alitas "El Jefe" 翼</h1></Link>
        <nav className="desktop-nav">
            <NavLink to="/mi-perfil" className="desktop-nav-link"><UserIcon /><span>Mi Perfil</span></NavLink>
            <NavLink to="/mi-actividad" className="desktop-nav-link"><HeartIcon /><span>Mi Actividad</span></NavLink> {/* <-- ENLACE ESCRITORIO */}
            <NavLink to="/mis-pedidos" className="desktop-nav-link"><ClipboardIcon /><span>Mis Pedidos</span></NavLink>
            <button onClick={toggleCart} className="desktop-nav-link cart-button-desktop">
                <ShoppingCartIcon /><span>Carrito</span>
                {totalItems > 0 && <span className="cart-badge">{totalItems}</span>}
            </button>
        </nav>
      </header>
      
      <Cart />

      <main className="client-main">
        <Outlet />
      </main>

      <footer className="bottom-nav">
        <NavLink to="/mi-perfil" className="bottom-nav-link"><UserIcon /><span>Mi Perfil</span></NavLink>
        <NavLink to="/mi-actividad" className="bottom-nav-link"><HeartIcon /><span>Mi Actividad</span></NavLink> {/* <-- ENLACE MÓVIL */}
        <button onClick={toggleCart} className="bottom-nav-link cart-button">
          <ShoppingCartIcon /><span>Carrito</span>
          {totalItems > 0 && <span className="cart-badge">{totalItems}</span>}
        </button>
        <NavLink to="/mis-pedidos" className="bottom-nav-link"><ClipboardIcon /><span>Mis Pedidos</span></NavLink>
      </footer>
    </div>
  );
}