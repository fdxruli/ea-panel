// src/App.jsx (CORREGIDO)

import React from "react";
import { Routes, Route } from "react-router-dom";
import { CartProvider } from "./context/CartContext";
import Login from "./pages/Login"; // <-- Importa la página de Login
import ProtectedRoute from "./components/ProtectedRoute";

// Importa tus componentes y páginas
import AdminLayout from "./layouts/AdminLayout";
import ClientLayout from "./layouts/ClientLayout";
import Menu from "./pages/Menu";
import Cart from "./pages/Cart";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Discounts from "./pages/Discounts";

function App() {
  return (
    <Routes>
      {/* --- RUTA DE LOGIN (PÚBLICA) --- */}
      <Route path="/login" element={<Login />} />

      {/* --- RUTAS PARA EL CLIENTE (PÚBLICAS) --- */}
      <Route path="/" element={<CartProvider><ClientLayout /></CartProvider>}>
        <Route index element={<Menu />} />
        <Route path="carrito" element={<Cart />} />
      </Route>

      {/* --- RUTAS PARA EL ADMINISTRADOR (PROTEGIDAS) --- */}
      <Route element={<ProtectedRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="pedidos" element={<Orders />} />
          <Route path="productos" element={<Products />} />
          <Route path="clientes" element={<Customers />} />
          <Route path="descuentos" element={<Discounts />} />
        </Route>
      </Route>
    </Routes>
  );
}


export default App;