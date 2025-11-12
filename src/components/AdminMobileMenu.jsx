// src/components/AdminMobileNav.jsx
import React, { useEffect, useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useAdminAuth } from '../context/AdminAuthContext';
import ConfirmModal from './ConfirmModal';
import styles from './AdminMobileMenu.module.css';

// === ICONOS ===
const DashboardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const CreateIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
  </svg>
);

const OrdersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ProductsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

const MenuIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
  </svg>
);

// === LISTA COMPLETA DE ENLACES ===
const adminLinks = [
  { to: "/admin", label: "Dashboard", permissionKey: "dashboard.view" },
  { to: "/admin/crear-pedido", label: "Crear Pedido", permissionKey: "crear-pedido.view" },
  { to: "/admin/pedidos", label: "Pedidos", permissionKey: "pedidos.view" },
  { to: "/admin/clientes", label: "Clientes", permissionKey: "clientes.view" },
  { to: "/admin/referidos", label: "Referidos", permissionKey: "referidos.view" },
  { to: "/admin/productos", label: "Productos", permissionKey: "productos.view" },
  { to: "/admin/ingredientes", label: "Ingredientes", permissionKey: "productos.view" },
  { to: "/admin/horarios", label: "Horarios", permissionKey: "horarios.view" },
  { to: "/admin/descuentos", label: "Descuentos", permissionKey: "descuentos.view" },
  { to: "/admin/terminos", label: "Términos y Cond.", permissionKey: "terminos.view" },
  { to: "/admin/registrar-admin", label: "Registrar Admin", permissionKey: "registrar-admin.view" },
  { to: "/admin/special-prices", label: "Precios Especiales", permissionKey: "special-prices.view" },
  { to: "/admin/configuracion", label: "Configuración", permissionKey: "configuracion.view" },
];

// === ENLACES PRINCIPALES DE LA BARRA INFERIOR ===
const bottomNavLinks = [
  { to: "/admin", icon: <DashboardIcon />, label: "Dashboard", permissionKey: "dashboard.view" },
  { to: "/admin/crear-pedido", icon: <CreateIcon />, label: "Crear", permissionKey: "crear-pedido.view" },
  { to: "/admin/pedidos", icon: <OrdersIcon />, label: "Pedidos", permissionKey: "pedidos.view" },
  { to: "/admin/productos", icon: <ProductsIcon />, label: "Productos", permissionKey: "productos.view" },
];

// Labels de los enlaces principales (para filtrar en el menú modal)
const bottomNavLabels = ["Dashboard", "Crear Pedido", "Pedidos", "Productos"];

// Rutas que pertenecen al menú (para marcar el botón "Menú" como activo)
const menuOnlyRoutes = [
  '/admin/configuracion',
  '/admin/clientes',
  '/admin/referidos',
  '/admin/horarios',
  '/admin/descuentos',
  '/admin/terminos',
  '/admin/registrar-admin',
  '/admin/special-prices',
];

// === COMPONENTE PRINCIPAL ===
export default function AdminMobileNav() {
  const { hasPermission } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);

  // Filtrar enlaces del menú modal (excluir los que están en la barra inferior)
  const filteredMenuLinks = adminLinks.filter(link => 
    !bottomNavLabels.includes(link.label)
  );

  // Verificar si la ruta actual pertenece al menú modal
  const isMenuActive = menuOnlyRoutes.some(route => 
    location.pathname.startsWith(route)
  );

  // Bloquear scroll cuando el menú está abierto
  useEffect(() => {
    if (isMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMenuOpen]);

  // Handlers
  const openMenu = () => setIsMenuOpen(true);
  const closeMenu = () => setIsMenuOpen(false);

  const handleLogoutClick = () => {
    setLogoutModalOpen(true);
  };

  const confirmLogout = async () => {
    const { error } = await supabase.auth.signOut();
    setLogoutModalOpen(false);
    closeMenu();
    if (error) {
      console.error("Error al cerrar sesión:", error);
    } else {
      navigate('/login');
    }
  };

  // Función helper para clases de NavLink
  const getNavLinkClass = ({ isActive }) => {
    return `${styles.navLink} ${isActive ? styles.active : ''}`;
  };

  const getMenuLinkClass = ({ isActive }) => {
    return `${styles.menuLink} ${isActive ? styles.activeLink : ''}`;
  };

  return (
    <>
      {/* === BARRA INFERIOR === */}
      <nav className={styles.bottomNav}>
        {bottomNavLinks.map(link => (
          hasPermission(link.permissionKey) && (
            <NavLink
              key={link.to}
              to={link.to}
              className={getNavLinkClass}
              end={link.to === '/admin'}
            >
              {link.icon}
              <span>{link.label}</span>
            </NavLink>
          )
        ))}
        
        <button
          onClick={openMenu}
          className={`${styles.navLink} ${isMenuActive ? styles.active : ''}`}
        >
          <MenuIcon />
          <span>Menú</span>
        </button>
      </nav>

      {/* === MENÚ MODAL DESLIZANTE === */}
      <div 
        className={`${styles.overlay} ${isMenuOpen ? styles.open : ''}`}
        onClick={closeMenu}
      >
        <div 
          className={`${styles.menuContent} ${isMenuOpen ? styles.open : ''}`}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header del menú */}
          <div className={styles.menuHeader}>
            <h4>Menú</h4>
            <button onClick={closeMenu} className={styles.closeButton}>
              ×
            </button>
          </div>

          {/* Enlaces del menú */}
          <div className={styles.links}>
            {filteredMenuLinks.map(link => (
              hasPermission(link.permissionKey) && (
                <NavLink
                  key={link.to}
                  to={link.to}
                  className={getMenuLinkClass}
                  onClick={closeMenu}
                  end={link.to === '/admin'}
                >
                  {link.label}
                </NavLink>
              )
            ))}

            {/* Botón de Logout */}
            <button onClick={handleLogoutClick} className={styles.LogoutButton}>
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>

      {/* === MODAL DE CONFIRMACIÓN === */}
      <ConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={confirmLogout}
        message="¿Estás seguro de que deseas cerrar sesión?"
      />
    </>
  );
}
