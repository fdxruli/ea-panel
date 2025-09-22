// src/components/Sidebar.jsx (CORREGIDO)

import React from "react";
import { Link } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";

export default function Sidebar({ isOpen }) {
  const { hasPermission } = useAdminAuth();

  return (
    <div className={`sidebar ${isOpen ? "open" : ""}`}>
      {hasPermission('dashboard.view') && <Link to="/admin">Dashboard</Link>}
      {hasPermission('pedidos.view') && <Link to="/admin/pedidos">Pedidos</Link>}
      {hasPermission('clientes.view') && <Link to="/admin/clientes">Clientes</Link>}
      {hasPermission('productos.view') && <Link to="/admin/productos">Productos</Link>}
      {hasPermission('descuentos.view') && <Link to="/admin/descuentos">Descuentos</Link>}
      
      {/* --- 👇 LÍNEA AÑADIDA --- */}
      {hasPermission('special-prices.view') && <Link to="/admin/special-prices">Precios Especiales</Link>}
      
      {hasPermission('terminos.view') && <Link to="/admin/terminos">Términos y Cond.</Link>}
      {hasPermission('registrar-admin.view') && <Link to="/admin/registrar-admin">Registrar Admin</Link>}
    </div>
  );
}
