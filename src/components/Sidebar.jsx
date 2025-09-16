// src/components/Sidebar.jsx (LÍNEA AÑADIDA)

import React from "react";
import { Link } from "react-router-dom";

export default function Sidebar({ isOpen }) {
  return (
    <div className={`sidebar ${isOpen ? "open" : ""}`}>
      <Link to="/admin">Dashboard</Link>
      <Link to="/admin/pedidos">Pedidos</Link>
      <Link to="/admin/clientes">Clientes</Link>
      <Link to="/admin/productos">Productos</Link>
      <Link to="/admin/descuentos">Descuentos</Link>
      <Link to="/admin/terminos">Términos y Cond.</Link> {/* <-- AÑADE ESTA LÍNEA */}
    </div>
  );
}