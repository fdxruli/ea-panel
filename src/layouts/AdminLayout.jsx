import React, { useCallback, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AlertModal from '../components/AlertModal';
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
      setIsSidebarOpen(!isSidebarOpen);
    }
  }, [isDesktop, isSidebarOpen]);

  const closeSidebar = useCallback(() => {
    if (isDesktop && isSidebarOpen) {
      setIsSidebarOpen(false);
    }
  }, [isDesktop, isSidebarOpen]);

  useEffect(() => {
    closeSidebar();
  }, [closeSidebar, location.pathname]);

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
      <AlertModal />
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
