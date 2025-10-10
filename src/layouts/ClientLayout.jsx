// src/layouts/ClientLayout.jsx (CORREGIDO)

import React, { useState, useEffect } from "react";
import { Outlet, Link, NavLink } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useCart } from "../context/CartContext";
import { useProducts } from "../context/ProductContext";
import { useCustomer } from "../context/CustomerContext";
import { useUserData } from "../context/UserDataContext";
import Cart from "../pages/Cart";
import PhoneModal from "../components/PhoneModal";
import CheckoutModal from "../components/CheckoutModal";
import './ClientLayout.css';
import AlertModal from "../components/AlertModal";
import FloatingCartButton from "../components/FloatingCartButton";
import UserMenu from "../components/UserMenu";
import AddressModal from "../components/AddressModal";

const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>;
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;
const ShoppingCartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>;

export default function ClientLayout() {
  const { toast, cartItems, toggleCart } = useCart();
  const { notification } = useProducts();
  const { isCheckoutModalOpen, setCheckoutModalOpen, phone, checkoutMode, isFirstAddressRequired, setIsFirstAddressRequired } = useCustomer();
  const { customer, refetch: refetchUserData } = useUserData();
  const [isAddressModalOpen, setAddressModalOpen] = useState(false);

  const totalItems = cartItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  useEffect(() => {
    if (isFirstAddressRequired && customer) {
      setAddressModalOpen(true);
      setIsFirstAddressRequired(false);
    }
  }, [isFirstAddressRequired, customer, setIsFirstAddressRequired]);

  const handleSaveFirstAddress = async (addressData) => {
    const { error } = await supabase.from('customer_addresses').insert({ ...addressData, customer_id: customer.id });
    if (error) {
      console.error(error);
    } else {
      refetchUserData();
      setAddressModalOpen(false);
    }
  };

  return (
    <div className="client-layout">
      <PhoneModal />
      <AlertModal />
      {notification && <div className="update-toast">{notification}</div>}
      {toast.message && <div key={toast.key} className="toast-notification">{toast.message}</div>}
      
      {isAddressModalOpen && customer && (
        <AddressModal
          isOpen={isAddressModalOpen}
          onClose={() => setAddressModalOpen(false)}
          onSave={handleSaveFirstAddress}
          address={null}
          customerId={customer.id}
        />
      )}

      <header className="client-header">
         <div className="header-content-container">
          <Link to="/" className="logo"><h1>ENTRE&nbsp;ALAS</h1></Link>
          <nav className="desktop-nav">
              <button onClick={toggleCart} className="desktop-cart-button">
                <ShoppingCartIcon />
                <span>Carrito</span>
                {totalItems > 0 && <span className="desktop-cart-badge">{totalItems}</span>}
              </button>
              <UserMenu />
          </nav>
        </div>
      </header>
      
      <Cart />

      {isCheckoutModalOpen && (
        <CheckoutModal
          phone={phone}
          onClose={() => setCheckoutModalOpen(false)}
          mode={checkoutMode} 
        />
      )}

      <FloatingCartButton />

      <main className="client-main">
        <div className="client-content-container">
          <Outlet />
        </div>
      </main>

       <footer className="bottom-nav">
        <NavLink to="/" end className={({ isActive }) => isActive ? "bottom-nav-link active" : "bottom-nav-link"}>
            <HomeIcon /> <span>Inicio</span>
        </NavLink>
        <NavLink to="/mi-perfil" replace className={({ isActive }) => isActive ? "bottom-nav-link active" : "bottom-nav-link"}>
            <UserIcon /> <span>Mi Perfil</span>
        </NavLink>
        <NavLink to="/mi-actividad" replace className={({ isActive }) => isActive ? "bottom-nav-link active" : "bottom-nav-link"}>
            <HeartIcon /> <span>Mi Actividad</span>
        </NavLink>
        <NavLink to="/mis-pedidos" replace className={({ isActive }) => isActive ? "bottom-nav-link active" : "bottom-nav-link"}>
            <ClipboardIcon /> <span>Mis Pedidos</span>
        </NavLink>
      </footer>
    </div>
  );
}