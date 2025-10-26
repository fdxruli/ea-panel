// src/components/Sidebar.jsx
import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from '../lib/supabaseClient';
import { useAdminAuth } from "../context/AdminAuthContext";
import ConfirmModal from './ConfirmModal';
import styles from './Sidebar.module.css'; // Asegúrate que la importación sea correcta

// Icono para expandir/colapsar
const ChevronDown = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>;

// Recibe isSidebarOpen y closeSidebar
export default function Sidebar({ isSidebarOpen, closeSidebar }) {
  const { hasPermission } = useAdminAuth();
  const navigate = useNavigate();
  const [isLogoutModalOpen, setLogoutModalOpen] = useState(false);
  // Estado para controlar qué grupo está abierto
  const [openGroup, setOpenGroup] = useState('gestionPrincipal'); // 'gestionPrincipal' abierto por defecto

  const toggleGroup = (groupKey) => {
    setOpenGroup(prevOpenGroup => (prevOpenGroup === groupKey ? null : groupKey));
  };

  // Componente interno para el grupo colapsable
  const SidebarGroup = ({ groupKey, title, children }) => {
    const isOpen = openGroup === groupKey;
    // Filtra children para no renderizar el grupo si no tiene enlaces visibles
    const visibleChildren = React.Children.toArray(children).filter(child => child !== null && child !== false);

    if (visibleChildren.length === 0) {
      return null; // No renderizar el grupo si no hay enlaces con permiso
    }

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

  const confirmLogout = async () => {
    const { error } = await supabase.auth.signOut();
    setLogoutModalOpen(false);
    if (error) {
      console.error("Error al cerrar sesión:", error);
    } else {
      navigate('/login');
    }
  };

  const handleLogoutClick = () => {
    setLogoutModalOpen(true);
  };

  return (
    <>
      <div className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        {/* Grupo: Gestión Principal */}
        <SidebarGroup groupKey="gestionPrincipal" title="Gestión Principal">
          {hasPermission('dashboard.view') && <Link to="/admin" onClick={closeSidebar}>Dashboard</Link>}
          {hasPermission('crear-pedido.view') && <Link to="/admin/crear-pedido" onClick={closeSidebar}>Crear Pedido</Link>}
          {hasPermission('pedidos.view') && <Link to="/admin/pedidos" onClick={closeSidebar}>Pedidos</Link>}
        </SidebarGroup>

        {/* Grupo: Catálogo */}
        <SidebarGroup groupKey="catalogo" title="Catálogo">
          {hasPermission('productos.view') && <Link to="/admin/productos" onClick={closeSidebar}>Productos</Link>}
          {hasPermission('special-prices.view') && <Link to="/admin/special-prices" onClick={closeSidebar}>Precios Especiales</Link>}
          {hasPermission('descuentos.view') && <Link to="/admin/descuentos" onClick={closeSidebar}>Descuentos</Link>}
        </SidebarGroup>

        {/* Grupo: Clientes */}
        <SidebarGroup groupKey="clientes" title="Clientes">
          {hasPermission('clientes.view') && <Link to="/admin/clientes" onClick={closeSidebar}>Clientes</Link>}
          {hasPermission('referidos.view') && <Link to="/admin/referidos" onClick={closeSidebar}>Referidos</Link>}
        </SidebarGroup>

        {/* Grupo: Configuración */}
        <SidebarGroup groupKey="configuracion" title="Configuración">
          {hasPermission('horarios.view') && <Link to="/admin/horarios" onClick={closeSidebar}>Horarios</Link>}
          {hasPermission('terminos.view') && <Link to="/admin/terminos" onClick={closeSidebar}>Términos y Cond.</Link>}
          {hasPermission('registrar-admin.view') && <Link to="/admin/registrar-admin" onClick={closeSidebar}>Gestionar Admins</Link>}
          {hasPermission('configuracion.view') && <Link to="/admin/configuracion" onClick={closeSidebar}>Config. General</Link>}
        </SidebarGroup>

        {/* Botón de Logout fuera de los grupos */}
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