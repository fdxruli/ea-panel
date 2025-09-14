import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Navbar from "../components/Navbar";
import Sidebar from "../components/Sidebar";

import '../App.css'; 

export default function AdminLayout() {
  const [isSidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen);
  };

  return (
    <div>
      <Navbar toggleSidebar={toggleSidebar} />
      <div className="container">
        <Sidebar isOpen={isSidebarOpen} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}