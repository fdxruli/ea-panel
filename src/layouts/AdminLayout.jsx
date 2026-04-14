import React, { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminMobileMenu from '../components/AdminMobileMenu';
import Navbar from '../components/Navbar';
import SEO from '../components/SEO';
import Sidebar from '../components/Sidebar';
import '../App.css';

export default function AdminLayout() {
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const location = useLocation();

  const toggleSidebar = useCallback(() => {
    if (isDesktop) {
      // Usa el valor previo para evitar que la función dependa del estado actual
      setIsSidebarOpen(prev => !prev);
    }
  }, [isDesktop]);

  const closeSidebar = useCallback(() => {
    // Igual aquí, actualiza basado en el estado previo sin meterlo en el arreglo de dependencias
    setIsSidebarOpen(prev => {
      if (isDesktop && prev) return false;
      return prev;
    });
  }, [isDesktop]);

  useEffect(() => {
    // Solo debes cerrar el menú automáticamente al navegar si estás en móvil.
    // Si realmente quieres cerrarlo también en desktop al navegar (mala idea), 
    // al menos ahora no causará un bucle infinito.
    if (!isDesktop) {
      setIsSidebarOpen(false);
    }
  }, [location.pathname, isDesktop]);

  useEffect(() => {
    const handleResize = () => {
      const desktopCheck = window.innerWidth >= 768;
      setIsDesktop(desktopCheck);

      if (!desktopCheck) {
        setIsSidebarOpen(true);
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <>
      <SEO
        title="Panel Administrativo | Entre Alas"
        description="Panel administrativo interno de Entre Alas."
        type="website"
        noindex
      />
        
      <Navbar isSidebarOpen={isSidebarOpen} toggleSidebar={toggleSidebar} />
      <div className={`container ${!isSidebarOpen && isDesktop ? 'sidebar-closed' : ''}`}>
        {isDesktop && <Sidebar isSidebarOpen={isSidebarOpen} closeSidebar={closeSidebar} />}
        <main className="main-content">
          <Outlet />
        </main>
      </div>
      <AdminMobileMenu />
    </>
  );
}
