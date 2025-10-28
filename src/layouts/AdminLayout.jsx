// src/layouts/AdminLayout.jsx
import React, { useState, useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import AlertModal from "../components/AlertModal";
import AdminMobileMenu from "../components/AdminMobileMenu";
import '../App.css';

export default function AdminLayout() {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  // Estado para controlar el sidebar en desktop
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();

  // Función para abrir/cerrar el sidebar en desktop
  const toggleSidebar = () => {
    // Solo permitir alternar en desktop
    if (isDesktop) {
      setIsSidebarOpen(!isSidebarOpen);
    }
  };

  // Función para cerrar explícitamente el sidebar (usada en navegación)
  const closeSidebar = () => {
    // Solo cierra si está abierto y estamos en desktop
    if (isDesktop && isSidebarOpen) {
      setIsSidebarOpen(false);
    }
  };

  // Efecto para cerrar sidebar al cambiar de ruta
  useEffect(() => {
    closeSidebar();
  }, [location.pathname, isDesktop]);

  // Efecto para detectar cambio de tamaño de pantalla
  useEffect(() => {
    const handleResize = () => {
      const desktopCheck = window.innerWidth >= 768;
      setIsDesktop(desktopCheck);
      // Si pasamos a móvil, aseguramos que el sidebar "lógico" esté abierto
      if (!desktopCheck) {
        setIsSidebarOpen(true); // Oculto por CSS, pero estado es 'abierto'
      }
    };
    window.addEventListener('resize', handleResize);
    // Limpieza al desmontar
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      <AlertModal />
      {/* Pasa el estado y la función toggle al Navbar */}
      <Navbar isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      {/* Añade clase 'sidebar-closed' al contenedor si el sidebar debe estar cerrado */}
      <div className={`container ${!isSidebarOpen && isDesktop ? 'sidebar-closed' : ''}`}>
        {/* Renderiza Sidebar solo en escritorio y pasa estado y función close */}
        {isDesktop && <Sidebar isSidebarOpen={isSidebarOpen} closeSidebar={closeSidebar} />}
        <main className="main-content">
          <Outlet />
        </main>
      </div>
      {/* Componente unificado que maneja barra inferior y menú modal */}
      <AdminMobileMenu />
    </>
  );
}
