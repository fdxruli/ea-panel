// src/layouts/AdminLayout.jsx (ACTUALIZADO)

import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import AlertModal from "../components/AlertModal";
import '../App.css';

export default function AdminLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen);
  };

  // --- 👇 NUEVA FUNCIÓN PARA CERRAR EL SIDEBAR ---
  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <>
      <AlertModal />
      <Navbar toggleSidebar={toggleSidebar} />
      <div className="container">
        {/* --- 👇 PASAMOS LA NUEVA FUNCIÓN AL COMPONENTE HIJO --- */}
        <Sidebar isOpen={isSidebarOpen} closeSidebar={closeSidebar} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </>
  );
}