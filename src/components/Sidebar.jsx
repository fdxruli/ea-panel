/* src/components/Sidebar.jsx (Corregido) */

import React, { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { supabase } from '../lib/supabaseClient';
import { useAdminAuth } from "../context/AdminAuthContext";
// --- 1. AÑADIR IMPORT ---
import { useCacheAdmin } from "../context/CacheAdminContext"; 
// --- FIN IMPORT ---
import ConfirmModal from './ConfirmModal';
import styles from './Sidebar.module.css';

const ChevronDown = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>;

// ... (mapa de rutas sin cambios) ...
const routeToGroupMap = {
  '/admin': 'gestionPrincipal',
  '/admin/crear-pedido': 'gestionPrincipal',
  '/admin/pedidos': 'gestionPrincipal',
  '/admin/productos': 'catalogo',
  '/admin/special-prices': 'catalogo',
  '/admin/descuentos': 'catalogo',
  '/admin/clientes': 'clientes',
  '/admin/referidos': 'clientes',
  '/admin/horarios': 'configuracion',
  '/admin/terminos': 'configuracion',
  '/admin/registrar-admin': 'configuracion',
  '/admin/configuracion': 'configuracion',
};

export default function Sidebar({ isSidebarOpen, closeSidebar }) {
  const { hasPermission } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation(); 
  
  // --- 2. OBTENER LA FUNCIÓN DE LIMPIEZA ---
  const { clear: clearCache } = useCacheAdmin(); 
  // --- FIN OBTENER ---
  
  const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState(null);

  // ... (useEffect y SidebarGroup sin cambios) ...
    useEffect(() => {
    const currentPath = location.pathname;
    const activeGroup = routeToGroupMap[currentPath];
    if (activeGroup) {
      setOpenGroup(activeGroup);
    } else {
      setOpenGroup('gestionPrincipal'); 
    }
  }, [location.pathname]); 

  const toggleGroup = (groupKey) => {
    setOpenGroup(prevOpenGroup => (prevOpenGroup === groupKey ? null : groupKey));
  };

  const SidebarGroup = ({ groupKey, title, children }) => {
    const isOpen = openGroup === groupKey;
    const visibleChildren = React.Children.toArray(children).filter(child => child !== null && child !== false);
    if (visibleChildren.length === 0) return null;
    return (
      <div className={styles.sidebarGroup}>
        <button className={styles.groupTitleButton} onClick={() => toggleGroup(groupKey)}>
          <span className={styles.groupTitleText}>{title}</span>
          <ChevronDown className={`${styles.chevronIcon} ${isOpen ? styles.open : ''}`} />
        </button>
        <div className={`${styles.groupContent} ${isOpen ? styles.open : ''}`}>
          {visibleChildren}
        </div>
      </div>
    );
  };
  // --- FIN DE CÓDIGO SIN CAMBIOS ---

  // --- 3. MODIFICAR confirmLogout ---
  const confirmLogout = async () => {
    const { error } = await supabase.auth.signOut();
    setLogoutModalOpen(false);
    if (error) {
      console.error("Error al cerrar sesión:", error);
    } else {
      // --- LLAMAR A LA LIMPIEZA MANUALMENTE AQUÍ ---
      clearCache(); 
      console.log('[Sidebar] Caché limpiado manualmente al cerrar sesión.');
      // --- FIN LLAMADA MANUAL ---
      navigate('/login');
    }
  };
  // --- FIN MODIFICACIÓN ---

  const handleLogoutClick = () => {
    setLogoutModalOpen(true);
  };

  const getNavLinkClass = ({ isActive }) => {
    return isActive ? styles.activeLink : undefined;
  };

  return (
    <>
      <div className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        {/* ... (Todo el JSX de SidebarGroup sin cambios) ... */}
        <SidebarGroup groupKey="gestionPrincipal" title="Gestión Principal">
          {hasPermission('dashboard.view') && <NavLink to="/admin" end className={getNavLinkClass} onClick={closeSidebar}>Dashboard</NavLink>}
          {hasPermission('crear-pedido.view') && <NavLink to="/admin/crear-pedido" className={getNavLinkClass} onClick={closeSidebar}>Crear Pedido</NavLink>}
          {hasPermission('pedidos.view') && <NavLink to="/admin/pedidos" className={getNavLinkClass} onClick={closeSidebar}>Pedidos</NavLink>}
        </SidebarGroup>

        <SidebarGroup groupKey="catalogo" title="Catálogo">
          {hasPermission('productos.view') && <NavLink to="/admin/productos" className={getNavLinkClass} onClick={closeSidebar}>Productos</NavLink>}
          {hasPermission('special-prices.view') && <NavLink to="/admin/special-prices" className={getNavLinkClass} onClick={closeSidebar}>Precios Especiales</NavLink>}
          {hasPermission('descuentos.view') && <NavLink to="/admin/descuentos" className={getNavLinkClass} onClick={closeSidebar}>Descuentos</NavLink>}
        </SidebarGroup>

        <SidebarGroup groupKey="clientes" title="Clientes">
          {hasPermission('clientes.view') && <NavLink to="/admin/clientes" className={getNavLinkClass} onClick={closeSidebar}>Clientes</NavLink>}
          {hasPermission('referidos.view') && <NavLink to="/admin/referidos" className={getNavLinkClass} onClick={closeSidebar}>Referidos</NavLink>}
        </SidebarGroup>

        <SidebarGroup groupKey="configuracion" title="Configuración">
          {hasPermission('horarios.view') && <NavLink to="/admin/horarios" className={getNavLinkClass} onClick={closeSidebar}>Horarios</NavLink>}
          {hasPermission('terminos.view') && <NavLink to="/admin/terminos" className={getNavLinkClass} onClick={closeSidebar}>Términos y Cond.</NavLink>}
          {hasPermission('registrar-admin.view') && <NavLink to="/admin/registrar-admin" className={getNavLinkClass} onClick={closeSidebar}>Gestionar Admins</NavLink>}
          {hasPermission('configuracion.view') && <NavLink to="/admin/configuracion" className={getNavLinkClass} onClick={closeSidebar}>Config. General</NavLink>}
        </SidebarGroup>

        <button className="sidebar-logout-button" onClick={handleLogoutClick}>
          Cerrar Sesión
        </button>
      </div>

      <ConfirmModal
        isOpen={isLogoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={confirmLogout}
        title="¿Cerrar Sesión?"
      >
        ¿Estás seguro de que quieres cerrar tu sesión de administrador?
      </ConfirmModal>
    </>
  );
}