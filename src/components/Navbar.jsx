// src/components/Navbar.jsx (CORREGIDO)

import React from "react";
import { supabase } from '../lib/supabaseClient'; // <-- Importa supabase
import { useNavigate } from 'react-router-dom';  // <-- Importa useNavigate

export default function Navbar({ toggleSidebar }) {
  const navigate = useNavigate();

  // --- FUNCIÓN PARA CERRAR SESIÓN ---
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error al cerrar sesión:", error);
    } else {
      navigate('/login'); // Redirige al login después de cerrar sesión
    }
  };
  // ------------------------------------

  return (
    <div className="navbar">
      <button className="menu-toggle" onClick={toggleSidebar}>
        ☰
      </button>
      <h2>Panel de Administración</h2>
      
      {/* --- BOTÓN DE CERRAR SESIÓN --- */}
      <button 
        onClick={handleLogout} 
        style={{ 
          background: '#e74c3c', 
          color: 'white', 
          border: 'none', 
          padding: '10px 15px', 
          borderRadius: '5px', 
          cursor: 'pointer' 
        }}
      >
        Cerrar Sesión
      </button>
      {/* ----------------------------- */}
    </div>
  );
}