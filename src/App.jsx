// src/App.jsx (CORREGIDO CON RUTAS PROTEGIDAS)

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom"; // <-- 1. IMPORTAR Navigate
import { CartProvider } from "./context/CartContext";
import { CustomerProvider } from "./context/CustomerContext";
import { ProductProvider } from "./context/ProductContext";
import { UserDataProvider } from "./context/UserDataContext";
import { ProductExtrasProvider } from "./context/ProductExtrasContext";
import { AlertProvider } from "./context/AlertContext";
import { AdminAuthProvider, useAdminAuth } from "./context/AdminAuthContext"; // <-- 2. IMPORTAR useAdminAuth
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
import RegisterAdmin from "./pages/RegisterAdmin";
import LoadingSpinner from "./components/LoadingSpinner"; // <-- 3. IMPORTAR LoadingSpinner
import SpecialPrices from './pages/SpecialPrices';

// --- 👇 4. COMPONENTE GUARDIÁN PARA LAS RUTAS ---
const PermissionWrapper = ({ permissionKey, element }) => {
  const { hasPermission, loading } = useAdminAuth();

  // Mientras se verifica la sesión y los permisos, muestra un spinner
  if (loading) {
    return <LoadingSpinner />;
  }

  // Si tiene permiso, muestra la página solicitada
  if (hasPermission(permissionKey)) {
    return element;
  }

  // Si no tiene permiso, lo redirige al dashboard del admin
  return <Navigate to="/admin" replace />;
};


function App() {
  return (
    <Routes>
      {/* --- RUTAS PARA EL CLIENTE (SIN CAMBIOS) --- */}
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

      <Route path="/login" element={<Login />} />

      {/* --- RUTAS PARA EL ADMINISTRADOR (AHORA CON RUTAS PROTEGIDAS) --- */}
      <Route element={<ProtectedRoute />}>
        <Route
          path="/admin"
          element={
            <AlertProvider>
              <AdminAuthProvider>
                <AdminLayout />
              </AdminAuthProvider>
            </AlertProvider>
          }
        >
          {/* --- 👇 5. CADA RUTA ESTÁ ENVUELTA EN EL GUARDIÁN --- */}
          <Route index element={<PermissionWrapper permissionKey="dashboard.view" element={<Dashboard />} />} />
          <Route path="pedidos" element={<PermissionWrapper permissionKey="pedidos.view" element={<Orders />} />} />
          <Route path="productos" element={<PermissionWrapper permissionKey="productos.view" element={<Products />} />} />
          <Route path="clientes" element={<PermissionWrapper permissionKey="clientes.view" element={<Customers />} />} />
          <Route path="descuentos" element={<PermissionWrapper permissionKey="descuentos.view" element={<Discounts />} />} />
          <Route path="terminos" element={<PermissionWrapper permissionKey="terminos.view" element={<TermsAndConditions />} />} />
          <Route path="registrar-admin" element={<PermissionWrapper permissionKey="registrar-admin.view" element={<RegisterAdmin />} />} />
          <Route path="special-prices" element={<PermissionWrapper permissionKey="special-prices.view" element={<SpecialPrices />} />} />
        </Route>
      </Route
    </Routes>
  );
}

export default App;
