// src/App.jsx (CORREGIDO)

import React from "react";
import { Routes, Route } from "react-router-dom";
import { CartProvider } from "./context/CartContext";
import { CustomerProvider } from "./context/CustomerContext";
import { ProductProvider } from "./context/ProductContext";
import { UserDataProvider } from "./context/UserDataContext";
import { ProductExtrasProvider } from "./context/ProductExtrasContext";
import { AlertProvider } from "./context/AlertContext"; // <-- SOLO UNA IMPORTACIÓN
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import 'leaflet/dist/leaflet.css';

// Componentes y páginas
import AdminLayout from "./layouts/AdminLayout";
import ClientLayout from "./layouts/ClientLayout";
import Menu from "./pages/Menu";
import MyOrders from "./pages/MyOrders";
import MyProfile from "./pages/MyProfile";
import MyStuff from "./pages/MyStuff";
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
      <Route path="/login" element={<Login />} />

      {/* --- RUTAS PARA EL CLIENTE --- */}
      <Route
        path="/"
        element={
          <CustomerProvider>
            <ProductProvider>
              <CartProvider>
                <UserDataProvider>
                  <ProductExtrasProvider>
                    <AlertProvider>
                      <ClientLayout />
                    </AlertProvider>
                  </ProductExtrasProvider>
                </UserDataProvider>
              </CartProvider>
            </ProductProvider>
          </CustomerProvider>
        }
      >
        <Route path="/terminos" element={<TermsPage />} />
        <Route index element={<Menu />} />
        <Route path="mis-pedidos" element={<MyOrders />} />
        <Route path="mi-perfil" element={<MyProfile />} />
        <Route path="mi-actividad" element={<MyStuff />} />
      </Route>

      {/* --- RUTAS PARA EL ADMINISTRADOR (AHORA CON ALERTAS) --- */}
      <Route element={<ProtectedRoute />}>
        <Route
          path="/admin"
          element={
            <AlertProvider> {/* <-- 1. ENVOLVEMOS EL ADMINLAYOUT */}
              <AdminLayout />
            </AlertProvider>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="pedidos" element={<Orders />} />
          <Route path="productos" element={<Products />} />
          <Route path="clientes" element={<Customers />} />
          <Route path="descuentos" element={<Discounts />} />
          <Route path="terminos" element={<TermsAndConditions />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;