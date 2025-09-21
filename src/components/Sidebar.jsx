// src/components/Sidebar.jsx (MODIFICADO CON PERMISOS)

import React from "react";
import { Link } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext"; // <-- 1. Importar el hook

export default function Sidebar({ isOpen }) {
  const { hasPermission } = useAdminAuth(); // <-- 2. Usar el hook

  return (
    <div className={`sidebar ${isOpen ? "open" : ""}`}>
      {/* --- 👇 3. Renderizado condicional para cada enlace --- */}
      {hasPermission('dashboard.view') && <Link to="/admin">Dashboard</Link>}
      {hasPermission('pedidos.view') && <Link to="/admin/pedidos">Pedidos</Link>}
      {hasPermission('clientes.view') && <Link to="/admin/clientes">Clientes</Link>}
      {hasPermission('productos.view') && <Link to="/admin/productos">Productos</Link>}
      {hasPermission('descuentos.view') && <Link to="/admin/descuentos">Descuentos</Link>}
      {hasPermission('terminos.view') && <Link to="/admin/terminos">Términos y Cond.</Link>}
      {hasPermission('registrar-admin.view') && <Link to="/admin/registrar-admin">Registrar Admin</Link>}
    </div>
  );
}