import React from "react";
import { supabase } from '../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';

export default function Navbar({ toggleSidebar }) {
  const navigate = useNavigate();
  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Error al cerrar sesión:", error);
    } else {
      navigate('/login');
    }
  };
  return (
    <div className="navbar">
      <button className="menu-toggle" onClick={toggleSidebar}>
        ☰
      </button>
      <h2>Panel de Administración</h2>
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
    </div>
  );
}