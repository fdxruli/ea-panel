// src/layouts/AdminLayout.jsx (ACTUALIZADO)

import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";
import AlertModal from "../components/AlertModal"; // <-- 1. IMPORTAR EL MODAL
import '../App.css'; 

export default function AdminLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen);
  };

  return (
    <>
      <AlertModal /> {/* <-- 2. AÑADIR EL MODAL AQUÍ */}
      <Navbar toggleSidebar={toggleSidebar} />
      <div className="container">
        <Sidebar isOpen={isSidebarOpen} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </>
  );
}