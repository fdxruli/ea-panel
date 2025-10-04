// src/App.jsx (CORREGIDO PARA EVITAR BUCLES DE REDIRECCIÓN Y ARREGLAR RUTAS DE IMPORTACIÓN)

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { CartProvider } from "./context/CartContext.jsx";
import { CustomerProvider } from "./context/CustomerContext.jsx";
import { ProductProvider } from "./context/ProductContext.jsx";
import { UserDataProvider } from "./context/UserDataContext.jsx";
import { ProductExtrasProvider } from "./context/ProductExtrasContext.jsx";
import { AlertProvider } from "./context/AlertContext.jsx";
import { AdminAuthProvider, useAdminAuth } from "./context/AdminAuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { BusinessHoursProvider } from "./context/BusinessHoursContext.jsx";

// Componentes y páginas
import AdminLayout from "./layouts/AdminLayout.jsx";
import ClientLayout from "./layouts/ClientLayout.jsx";
import Menu from "./pages/Menu.jsx";
import MyOrders from "./pages/MyOrders.jsx";
import MyProfile from "./pages/MyProfile.jsx";
import MyStuff from "./pages/MyStuff.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Orders from "./pages/Orders.jsx";
import Products from "./pages/Products.jsx";
import Customers from "./pages/Customers.jsx";
import Discounts from "./pages/Discounts.jsx";
import TermsAndConditions from "./pages/TermsAndConditions.jsx";
import TermsPage from "./pages/TermsPage.jsx";
import RegisterAdmin from "./pages/RegisterAdmin.jsx";
import LoadingSpinner from "./components/LoadingSpinner.jsx";
import SpecialPrices from "./pages/SpecialPrices.jsx";
import Login from "./pages/Login.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import BusinessHours from "./pages/BusinessHours.jsx";
import CreateOrder from "./pages/CreateOrder.jsx";
import 'leaflet/dist/leaflet.css';

// --- COMPONENTE GUARDIÁN PARA LAS RUTAS (CORREGIDO) ---
const PermissionWrapper = ({ permissionKey, element, isIndex = false }) => {
  const { hasPermission, loading } = useAdminAuth();

  // Mientras se verifica la sesión y los permisos, muestra un spinner
  if (loading) {
    return <LoadingSpinner />;
  }

  // Si tiene permiso, muestra la página solicitada
  if (hasPermission(permissionKey)) {
    return element;
  }

  // --- CORRECCIÓN CLAVE ---
  // Si la validación de permisos falla en la página principal (índice) del dashboard,
  // significa que el usuario no tiene acceso a nada. Para evitar un bucle de
  // redirección infinito, lo enviamos a la página de login.
  if (isIndex) {
    return <Navigate to="/login" replace />;
  }

  // Si no tiene permiso para una página específica (que no es el índice),
  // lo redirigimos al dashboard principal del admin, que es un lugar seguro.
  return <Navigate to="/admin" replace />;
};


function App() {
  return (
    <Routes>
      {/* --- RUTAS PARA EL CLIENTE --- */}
      <Route
        path="/"
        element={
          <ThemeProvider>
            <BusinessHoursProvider>
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
            </BusinessHoursProvider>
          </ThemeProvider>
        }
      >
        <Route path="/terminos" element={<TermsPage />} />
        <Route index element={<Menu />} />
        <Route path="mis-pedidos" element={<MyOrders />} />
        <Route path="mi-perfil" element={<MyProfile />} />
        <Route path="mi-actividad" element={<MyStuff />} />
      </Route>

      <Route path="/login" element={<Login />} />

      {/* --- RUTAS PARA EL ADMINISTRADOR --- */}
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
          {/* 👇 SE AÑADE LA PROP 'isIndex' PARA MANEJAR EL BUCLE */}
          <Route index element={<PermissionWrapper permissionKey="dashboard.view" element={<Dashboard />} isIndex={true} />} />
          <Route path="pedidos" element={<PermissionWrapper permissionKey="pedidos.view" element={<Orders />} />} />
          <Route path="crear-pedido" element={<PermissionWrapper permissionKey="crear-pedido.view" element={<CreateOrder />} />} />
          <Route path="productos" element={<PermissionWrapper permissionKey="productos.view" element={<Products />} />} />
          <Route path="clientes" element={<PermissionWrapper permissionKey="clientes.view" element={<Customers />} />} />
          <Route path="descuentos" element={<PermissionWrapper permissionKey="descuentos.view" element={<Discounts />} />} />
          <Route path="terminos" element={<PermissionWrapper permissionKey="terminos.view" element={<TermsAndConditions />} />} />
          <Route path="registrar-admin" element={<PermissionWrapper permissionKey="registrar-admin.view" element={<RegisterAdmin />} />} />
          <Route path="special-prices" element={<PermissionWrapper permissionKey="special-prices.view" element={<SpecialPrices />} />} />
          <Route path="horarios" element={<PermissionWrapper permissionKey="horarios.view" element={<BusinessHours />} />} />
        </Route>
      </Route>
    </Routes>
  );
}

export default App;

