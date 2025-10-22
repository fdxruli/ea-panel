import React, { useEffect, lazy, Suspense } from "react"; // <-- CAMBIO AQUÍ
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
import ProtectedRoute from "./components/ProtectedRoute.jsx"; // Asegúrate que la ruta sea correcta
import BusinessHours from "./pages/BusinessHours.jsx";
import CreateOrder from "./pages/CreateOrder.jsx";
import 'leaflet/dist/leaflet.css';
import Referrals from "./pages/Referrals.jsx";
import { SettingsProvider } from "./context/SettingsContext.jsx";
import { cleanupExpiredCache } from "./utils/cache.js";
import ReloadPrompt from "./components/ReloadPrompt.jsx";
import Settings from "./pages/Settings.jsx";
import NotFoundPage from "./components/NotFoundPage.jsx"; // <-- IMPORTA NotFoundPage

const PermissionWrapper = ({ permissionKey, element, isIndex = false }) => {
  const { hasPermission, loading } = useAdminAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (hasPermission(permissionKey)) {
    return element;
  }

  if (isIndex) {
    // Si es la página índice del admin y no tiene permiso, redirige a login
    return <Navigate to="/login" replace />;
  }

  // Si no tiene permiso para otras páginas admin, redirige al dashboard del admin (o a login si no tiene acceso a nada)
  // Ajusta esto según tu lógica preferida
  return <Navigate to="/admin" replace />;
};


function App() {
  useEffect(() => {
    cleanupExpiredCache();
  }, []);

  return (
    <>
      <ReloadPrompt />
      <Routes>
        {/* --- Rutas Cliente --- */}
        <Route
          path="/"
          element={
            <ThemeProvider>
              <AlertProvider>
                <SettingsProvider>
                  <BusinessHoursProvider>
                    <CustomerProvider>
                      <UserDataProvider>
                        <ProductProvider>
                          <ProductExtrasProvider>
                            <CartProvider>
                              <ClientLayout />
                            </CartProvider>
                          </ProductExtrasProvider>
                        </ProductProvider>
                      </UserDataProvider>
                    </CustomerProvider>
                  </BusinessHoursProvider>
                </SettingsProvider>
              </AlertProvider>
            </ThemeProvider>
          }
        >
          <Route index element={<Menu />} />
          <Route path="mis-pedidos" element={<MyOrders />} />
          <Route path="mi-perfil" element={<MyProfile />} />
          <Route path="mi-actividad" element={<MyStuff />} />
          <Route path="/terminos" element={<TermsPage />} />
          {/* Añade la ruta 404 dentro del ClientLayout si quieres */}
          {/* <Route path="*" element={<NotFoundPage />} /> */}
        </Route>

        {/* --- Ruta Login Admin --- */}
        <Route path="/login" element={<Login />} />

        {/* --- Rutas Admin Protegidas --- */}
        <Route element={<ProtectedRoute />}> {/* Elemento padre para rutas protegidas */}
          <Route
            path="/admin"
            element={ // Layout para todas las rutas admin
              <AlertProvider>
                <SettingsProvider>
                  <Suspense fallback={<LoadingSpinner />}> {/* Añade Suspense aquí */}
                    <AdminAuthProvider>
                      <AdminLayout />
                    </AdminAuthProvider>
                  </Suspense>
                </SettingsProvider>
              </AlertProvider>
            }
          >
            {/* Rutas específicas del admin */}
            <Route index element={<PermissionWrapper permissionKey="dashboard.view" element={<Dashboard />} isIndex={true} />} />
            <Route path="pedidos" element={<PermissionWrapper permissionKey="pedidos.view" element={<Orders />} />} />
            <Route path="crear-pedido" element={<PermissionWrapper permissionKey="crear-pedido.view" element={<CreateOrder />} />} />
            <Route path="productos" element={<PermissionWrapper permissionKey="productos.view" element={<Products />} />} />
            <Route path="clientes" element={<PermissionWrapper permissionKey="clientes.view" element={<Customers />} />} />
            <Route path="referidos" element={<PermissionWrapper permissionKey="referidos.view" element={<Referrals />} />} />
            <Route path="descuentos" element={<PermissionWrapper permissionKey="descuentos.view" element={<Discounts />} />} />
            <Route path="terminos" element={<PermissionWrapper permissionKey="terminos.view" element={<TermsAndConditions />} />} />
            <Route path="registrar-admin" element={<PermissionWrapper permissionKey="registrar-admin.view" element={<RegisterAdmin />} />} />
            <Route path="special-prices" element={<PermissionWrapper permissionKey="special-prices.view" element={<SpecialPrices />} />} />
            <Route path="horarios" element={<PermissionWrapper permissionKey="horarios.view" element={<BusinessHours />} />} />
            <Route path="configuracion" element={<PermissionWrapper permissionKey="configuracion.view" element={<Settings />} />} />

            {/* Ruta 404 específica para rutas bajo /admin */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route> {/* Cierre del elemento ProtectedRoute */}

        {/* Ruta 404 global (fuera de cualquier layout específico) */}
        <Route path="*" element={<NotFoundPage />} />

      </Routes>
    </>
  );
}

export default App;