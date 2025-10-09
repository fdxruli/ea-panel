import React from "react";
import { Link } from "react-router-dom";
import { useAdminAuth } from "../context/AdminAuthContext";

export default function Sidebar({ isOpen, closeSidebar }) {
  const { hasPermission } = useAdminAuth();
  return (
    <div className={`sidebar ${isOpen ? "open" : ""}`}>
      {hasPermission('dashboard.view') && <Link to="/admin" onClick={closeSidebar}>Dashboard</Link>}
      {hasPermission('crear-pedido.view') && <Link to="/admin/crear-pedido" onClick={closeSidebar}>Crear Pedido</Link>}
      {hasPermission('pedidos.view') && <Link to="/admin/pedidos" onClick={closeSidebar}>Pedidos</Link>}
      {hasPermission('clientes.view') && <Link to="/admin/clientes" onClick={closeSidebar}>Clientes</Link>}
      {hasPermission('referidos.view') && <Link to="/admin/referidos" onClick={closeSidebar}>Referidos</Link>}
      {hasPermission('productos.view') && <Link to="/admin/productos" onClick={closeSidebar}>Productos</Link>}
      {hasPermission('horarios.view') && <Link to="/admin/horarios" onClick={closeSidebar}>Horarios</Link>}
      {hasPermission('descuentos.view') && <Link to="/admin/descuentos" onClick={closeSidebar}>Descuentos</Link>}
      {hasPermission('terminos.view') && <Link to="/admin/terminos" onClick={closeSidebar}>Términos y Cond.</Link>}
      {hasPermission('registrar-admin.view') && <Link to="/admin/registrar-admin" onClick={closeSidebar}>Registrar Admin</Link>}
      {hasPermission('special-prices.view') && <Link to="/admin/special-prices" onClick={closeSidebar}>Precios Especiales</Link>}
    </div>
  );
}