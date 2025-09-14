// src/layouts/ClientLayout.jsx

import React from "react";
import { Outlet, Link } from "react-router-dom";
import { useCart } from "../context/CartContext";
import Cart from "../pages/Cart"; // Importa el componente del carrito

// Estilos
const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1rem 2rem',
  backgroundColor: '#2c3e50',
  color: 'white',
  position: 'sticky',
  top: 0,
  zIndex: 1000,
};

const logoStyle = {
  margin: 0,
  fontSize: '1.5rem'
};

const cartLinkStyle = {
  backgroundColor: '#e03131',
  color: 'white',
  padding: '0.75rem 1.5rem',
  borderRadius: '5px',
  textDecoration: 'none',
  fontWeight: 'bold',
  textAlign: 'center',
  cursor: 'pointer' // <-- Cambiado a cursor pointer
};

export default function ClientLayout() {
  const { toggleCart, cartItems } = useCart(); // Obtén la función y los items del contexto

  return (
    <div>
      <header style={headerStyle}>
        <div>
          <h1 style={logoStyle}>Alitas "El Jefe" 翼</h1>
          <p style={{ margin: 0, opacity: 0.9 }}>
            ¡Las mejores alitas de la ciudad!
          </p>
        </div>
        {/* El botón ahora abre el panel lateral */}
        <button onClick={toggleCart} style={cartLinkStyle}>
          Ver Carrito 🛒 ({cartItems.length})
        </button>
      </header>
      
      <Cart /> {/* El componente del carrito ahora es una sidebar */}

      <main>
        <Outlet /> {/* Aquí se renderizará Menu.jsx */}
      </main>
    </div>
  );
}