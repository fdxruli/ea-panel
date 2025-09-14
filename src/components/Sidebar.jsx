import React from "react";
import { Link } from "react-router-dom";

// Recibe el estado 'isOpen' para aplicar la clase CSS
export default function Sidebar({ isOpen }) {
  return (
    <div className={`sidebar ${isOpen ? "open" : ""}`}>
      <Link to="/admin">Dashboard</Link>
      <Link to="/admin/pedidos">Pedidos</Link>
      <Link to="/admin/clientes">Clientes</Link>
      <Link to="/admin/productos">Productos</Link>
      <Link to="/admin/descuentos">Descuentos</Link>
    </div>
  );
}