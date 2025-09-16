// src/App.jsx (MODIFICADO)

import React from "react";
import { Routes, Route } from "react-router-dom";
import { CartProvider } from "./context/CartContext";
import { CustomerProvider } from "./context/CustomerContext";
import { ProductProvider } from "./context/ProductContext"; // <-- 1. IMPORTA EL NUEVO PROVIDER
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import 'leaflet/dist/leaflet.css';

// Importa tus componentes y páginas
import AdminLayout from "./layouts/AdminLayout";
import ClientLayout from "./layouts/ClientLayout";
import Menu from "./pages/Menu";
import Cart from "./pages/Cart";
import MyOrders from "./pages/MyOrders";
import MyProfile from "./pages/MyProfile";
import Dashboard from "./pages/Dashboard";
import Orders from "./pages/Orders";
import Products from "./pages/Products";
import Customers from "./pages/Customers";
import Discounts from "./pages/Discounts";
import TermsAndConditions from "./pages/TermsAndConditions";
import TermsPage from "./pages/TermsPage";

function App() {
  return (
    <Routes>
      {/* --- RUTA DE LOGIN (PÚBLICA) --- */}
      <Route path="/login" element={<Login />} />

      {/* --- RUTAS PARA EL CLIENTE (PÚBLICAS Y CON CACHÉ) --- */}
      <Route
        path="/"
        element={
          <CustomerProvider>
            <CartProvider>
              {/* --- 👇 2. AQUÍ LA CLAVE: ENVOLVEMOS SOLO EL LAYOUT DEL CLIENTE --- */}
              <ProductProvider>
                <ClientLayout />
              </ProductProvider>
            </CartProvider>
          </CustomerProvider>
        }
      >
        <Route path="/terminos" element={<TermsPage />} />
        <Route index element={<Menu />} />
        <Route path="carrito" element={<Cart />} />
        <Route path="mis-pedidos" element={<MyOrders />} />
        <Route path="mi-perfil" element={<MyProfile />} />
      </Route>

      {/* --- RUTAS PARA EL ADMINISTRADOR (PROTEGIDAS Y SIN CACHÉ) --- */}
      <Route element={<ProtectedRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="pedidos" element={<Orders />} />
          <Route path="productos" element={<Products />} />
          <Route path="clientes" element={<Customers />} />
          <Route path="descuentos" element={<Discounts />} />
          <Route path="terminos" element={<TermsAndConditions />}/>
        </Route>
      </Route>
    </Routes>
  );
}

export default App;