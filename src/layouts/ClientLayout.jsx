// src/layouts/ClientLayout.jsx (ACTUALIZADO y CON MODO MANTENIMIENTO)

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
import './ClientLayout.css'; // Asegúrate que este archivo existe y tiene los estilos necesarios
import AlertModal from "../components/AlertModal";
import FloatingCartButton from "../components/FloatingCartButton";
import UserMenu from "../components/UserMenu";
import AddressModal from "../components/AddressModal";
import NotificationManager from "../components/NotificationManager";

// --- Importaciones para Modo Mantenimiento ---
import { useSettings } from "../context/SettingsContext"; // Para leer la configuración
import MaintenancePage from "../components/MaintenancePage"; // El componente de mantenimiento
import LoadingSpinner from "../components/LoadingSpinner"; // Para mostrar mientras carga

// --- Iconos (asegúrate que las importaciones o definiciones sean correctas) ---
// Si los importas como componentes SVG:
// import HomeIcon from '../assets/icons/home.svg?react'; // Ejemplo, ajusta la ruta
// import UserIcon from '../assets/icons/user.svg?react';
// import ClipboardIcon from '../assets/icons/clipboard.svg?react';
// import HeartIcon from '../assets/icons/heart.svg?react';
// import ShoppingCartIcon from '../assets/icons/shopping-cart.svg?react';

// O si los defines directamente como antes:
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

  // --- Lógica para Modo Mantenimiento ---
  const { getSetting, loading: settingsLoading } = useSettings();
  const maintenanceSetting = getSetting('maintenance_mode');
  const isMaintenanceMode = maintenanceSetting?.enabled === true;
  const maintenanceMessage = maintenanceSetting?.message;
  // --- Fin Lógica Mantenimiento ---


  const totalItems = cartItems.reduce((sum, item) => sum + (item.quantity || 0), 0);

  useEffect(() => {
    if (isFirstAddressRequired && customer) {
      setAddressModalOpen(true);
      setIsFirstAddressRequired(false);
    }
  }, [isFirstAddressRequired, customer, setIsFirstAddressRequired]);

  const handleSaveFirstAddress = async (addressData) => {
    const { error } = await supabase.from('customer_addresses').insert({
      ...addressData,
      customer_id: customer.id,
      is_default: true 
    });
    if (error) {
      console.error(error);
      // Podrías usar showAlert aquí si tienes acceso
    } else {
      refetchUserData();
      setAddressModalOpen(false);
      // Podrías usar showAlert aquí
    }
  };

  // --- Verificación Modo Mantenimiento ---
  if (settingsLoading) {
    return <LoadingSpinner />; // Muestra carga mientras se obtienen los ajustes
  }

  if (isMaintenanceMode) {
    return <MaintenancePage message={maintenanceMessage} />; // Muestra página de mantenimiento
  }
  // --- Fin Verificación ---


  // --- Renderizado Normal ---
  return (
    <div className="client-layout">
      {/* Componentes globales como modales y notificaciones */}
      <PhoneModal />
      <AlertModal />
      <NotificationManager />
      {notification && <div className="update-toast">{notification}</div>}
      {toast.message && <div key={toast.key} className="toast-notification">{toast.message}</div>}
      
      {/* Modal para la primera dirección */}
      {isAddressModalOpen && customer && (
        <AddressModal
          isOpen={isAddressModalOpen}
          onClose={() => setAddressModalOpen(false)}
          onSave={handleSaveFirstAddress}
          address={null} // Es para la *primera* dirección
          customerId={customer.id}
        />
      )}

      {/* Encabezado */}
      <header className="client-header">
         <div className="header-content-container">
          <Link to="/" className="logo"><h1>ENTRE&nbsp;ALAS</h1></Link>
          {/* Navegación para Escritorio */}
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
      
      {/* Carrito Lateral */}
      <Cart />

      {/* Modal de Checkout */}
      {isCheckoutModalOpen && (
        <CheckoutModal
          phone={phone} // Asumiendo que CheckoutModal lo necesita
          onClose={() => setCheckoutModalOpen(false)}
          mode={checkoutMode} // Para diferenciar entre checkout y perfil
        />
      )}

      {/* Botón Flotante del Carrito (móvil) */}
      <FloatingCartButton />

      {/* Contenido Principal de la Página */}
      <main className="client-main">
        <div className="client-content-container">
          <Outlet /> {/* Aquí se renderiza Menu, MyProfile, etc. */}
        </div>
      </main>

      {/* Navegación Inferior (móvil) */}
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
        {/* Podrías añadir un botón de carrito aquí también si lo necesitas */}
      </footer>
    </div>
  );
}