// src/layouts/ClientLayout.jsx
import React, { useState, useEffect, useRef } from "react";
import { Outlet, Link, NavLink } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useProducts } from "../context/ProductContext";
import { useCustomer } from "../context/CustomerContext";
import { useUserData } from "../context/UserDataContext";
import { useSettings } from "../context/SettingsContext";
import { useBusinessHours } from "../context/BusinessHoursContext";
import { supabase } from "../lib/supabaseClient";

// Componentes
import Cart from "../pages/Cart";
import PhoneModal from "../components/PhoneModal";
import CheckoutModal from "../components/CheckoutModal";
import AlertModal from "../components/AlertModal";
import FloatingCartButton from "../components/FloatingCartButton";
import UserMenu from "../components/UserMenu";
import AddressModal from "../components/AddressModal";
import NotificationManager from "../components/NotificationManager";
import MaintenancePage from "../components/MaintenancePage";
import LoadingSpinner from "../components/LoadingSpinner";
import ClosedMessage from "../components/ClosedMessage";
import './ClientLayout.css';

// Iconos existentes...
const HomeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>;
const UserIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>;
const ClipboardIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>;
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>;
const ShoppingCartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>;
const FlameIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"></path>
  </svg>
);

// --- NUEVO ICONO DE "INGRESAR" ---
const LoginIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></svg>;

export default function ClientLayout() {
  const { toast, cartItems, toggleCart } = useCart();
  const { notification } = useProducts();

  const {
    isCheckoutModalOpen,
    setCheckoutModalOpen,
    setPhoneModalOpen, // <--- Necesario para abrir el modal manualmente
    phone,
    checkoutMode,
    isFirstAddressRequired,
    setIsFirstAddressRequired
  } = useCustomer();

  const { customer, refetch: refetchUserData } = useUserData();
  const [isAddressModalOpen, setAddressModalOpen] = useState(false);

  const { settings, loading: settingsLoading } = useSettings();
  const { isOpen: isBusinessOpen, loading: hoursLoading } = useBusinessHours();

  const maintenanceSetting = settings['maintenance_mode'] || { enabled: false };
  const visibilitySettings = settings['client_visibility'] || {};
  const isMaintenanceMode = maintenanceSetting?.enabled === true;
  const maintenanceMessage = maintenanceSetting?.message;

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
    if (!error) {
      refetchUserData();
      setAddressModalOpen(false);
    }
  };

  const handleCheckoutClose = (shouldOpenAuth) => {
    setCheckoutModalOpen(false);
    if (shouldOpenAuth === true) {
      setPhoneModalOpen(() => setCheckoutModalOpen(true));
    }
  };

  if (settingsLoading || hoursLoading) return <LoadingSpinner />;
  if (isMaintenanceMode) return <MaintenancePage message={maintenanceMessage} />;

  const mobileNavItems = [
    { to: "/", label: "Inicio", icon: <HomeIcon />, end: true },
    (visibilitySettings.my_profile_page !== false) && {
      to: "/mi-perfil",
      label: "Perfil",
      icon: <UserIcon />,
      replace: true,
    },
    (visibilitySettings.my_stuff_page !== false) && {
      to: "/mi-actividad",
      label: "Actividad",
      icon: <HeartIcon />,
      replace: true,
    },
    (visibilitySettings.my_orders_page !== false) && {
      to: "/mis-pedidos",
      label: "Pedidos",
      icon: <ClipboardIcon />,
      replace: true,
    },
  ].filter(Boolean);

  const splitIndex = Math.ceil(mobileNavItems.length / 2);
  const leadingMobileNavItems = mobileNavItems.slice(0, splitIndex);
  const trailingMobileNavItems = mobileNavItems.slice(splitIndex);

  const renderMobileNavItems = (items) => items.map(({ to, label, icon, replace = false, end = false }) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      replace={replace}
      className={({ isActive }) => (isActive ? "bottom-nav-link active" : "bottom-nav-link")}
    >
      {icon}
      <span className="bottom-nav-label">{label}</span>
    </NavLink>
  ));

  return (
    <div className={customer ? "client-layout has-bottom-nav" : "client-layout"}>
      {!isBusinessOpen && <ClosedMessage />}

      <PhoneModal />
      <AlertModal />
      <NotificationManager />
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
          <Link to="/" className="logo">
            <div className="logo-icon-wrapper">
              <FlameIcon />
            </div>
            <h1>
              <span className="logo-text-entre">ENTRE</span>
              <span className="logo-text-alas">ALAS</span>
            </h1>
          </Link>

          {/* --- BOTÓN DE INGRESO MANUAL (Solo visible si NO hay cliente logueado) --- */}
          {!customer && (
            <button
              className="mobile-login-btn"
              onClick={() => setPhoneModalOpen(true)}
              aria-label="Ingresar número"
            >
              <LoginIcon />

            </button>
          )}

          <nav className="desktop-nav">
            <button onClick={toggleCart} className="desktop-cart-button">
              <ShoppingCartIcon />
              <span>Carrito</span>
              {totalItems > 0 && <span className="desktop-cart-badge">{totalItems}</span>}
            </button>

            {/* Lógica corregida: Botón directo si no está logueado */}
            {customer ? (
              <UserMenu />
            ) : (
              <button
                className="desktop-login-btn"
                onClick={() => setPhoneModalOpen(true)}
              >
                <LoginIcon /> {/* Usamos el icono que ya tienes importado */}
                <span>Iniciar Sesión</span>
              </button>
            )}
          </nav>
        </div>
      </header>

      {/* Carrito Lateral */}
      <Cart />

      {/* Modal de Checkout */}
      {isCheckoutModalOpen && (
        <CheckoutModal
          phone={phone}
          onClose={handleCheckoutClose}
          mode={checkoutMode}
        />
      )}

      {!customer && <FloatingCartButton />}

      <main className="client-main">
        <div className="client-content-container">
          <Outlet />
        </div>
      </main>

      {/* Footer condicional */}
      {customer && (
        <footer className="bottom-nav" aria-label="Navegación principal móvil">
          <div className="bottom-nav-group">
            {renderMobileNavItems(leadingMobileNavItems)}
          </div>

          <button
            type="button"
            className="bottom-nav-link cart-button"
            onClick={toggleCart}
            data-cart-anchor="true"
            aria-label={totalItems > 0 ? `Abrir carrito con ${totalItems} producto(s)` : "Abrir carrito"}
          >
            <span className="bottom-nav-cart-icon" aria-hidden="true">
              <ShoppingCartIcon />
            </span>
            <span className="bottom-nav-label">Carrito</span>
            {totalItems > 0 && <span className="cart-badge">{totalItems}</span>}
          </button>

          <div className="bottom-nav-group">
            {renderMobileNavItems(trailingMobileNavItems)}
          </div>
        </footer>
      )}
    </div>
  );
}
