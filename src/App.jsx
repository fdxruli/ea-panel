import React, { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
// Context Providers
import { CartProvider } from "./context/CartContext.jsx";
import { CustomerProvider } from "./context/CustomerContext.jsx";
import { ProductProvider } from "./context/ProductContext.jsx";
import { UserDataProvider } from "./context/UserDataContext.jsx";
import { ProductExtrasProvider } from "./context/ProductExtrasContext.jsx";
import { AlertProvider } from "./context/AlertContext.jsx";
import { AdminAuthProvider, useAdminAuth } from "./context/AdminAuthContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { BusinessHoursProvider } from "./context/BusinessHoursContext.jsx";
import { SettingsProvider } from "./context/SettingsContext.jsx";
// Layouts
import AdminLayout from "./layouts/AdminLayout.jsx";
import ClientLayout from "./layouts/ClientLayout.jsx";
// Client Pages
import Menu from "./pages/Menu.jsx";
import MyOrders from "./pages/MyOrders.jsx";
import MyProfile from "./pages/MyProfile.jsx";
import MyStuff from "./pages/MyStuff.jsx";
import TermsPage from "./pages/TermsPage.jsx";
import OrderDetailPage from "./pages/OrderDetailPage.jsx"; // <<<--- NUEVA IMPORTACIÓN
// Admin Pages
import Dashboard from "./pages/Dashboard.jsx";
import Orders from "./pages/Orders.jsx";
import Products from "./pages/Products.jsx";
import Customers from "./pages/Customers.jsx";
import Discounts from "./pages/Discounts.jsx";
import TermsAndConditions from "./pages/TermsAndConditions.jsx";
import RegisterAdmin from "./pages/RegisterAdmin.jsx";
import SpecialPrices from "./pages/SpecialPrices.jsx";
import BusinessHours from "./pages/BusinessHours.jsx";
import CreateOrder from "./pages/CreateOrder.jsx";
import Referrals from "./pages/Referrals.jsx";
import Settings from "./pages/Settings.jsx";
// Auth & Utility Pages/Components
import Login from "./pages/Login.jsx";
import ProtectedRoute from "./components/ProtectedRoute.jsx"; // Check if still needed or replaced by AdminAuthContext logic
import LoadingSpinner from "./components/LoadingSpinner.jsx";
import NotFoundPage from "./components/NotFoundPage.jsx";
import ReloadPrompt from "./components/ReloadPrompt.jsx";
// Styles & Utils
import 'leaflet/dist/leaflet.css';
import { cleanupExpiredCache } from "./utils/cache.js";

// Wrapper for Admin Permissions
const PermissionWrapper = ({ permissionKey, element, isIndex = false }) => {
  const { hasPermission, loading } = useAdminAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  // Allow access if user has the specific permission
  if (hasPermission(permissionKey)) {
    return element;
  }

  // If it's the index route and no permission, redirect to login
  if (isIndex) {
    // Check if there's any permission at all, maybe redirect to a specific allowed page?
    // For now, redirecting to login seems safer if index is disallowed.
    return <Navigate to="/login" replace />;
  }

  // For other disallowed admin routes, redirect to the admin dashboard (or login if dashboard not allowed?)
  // Check if dashboard view is allowed, otherwise login might be better
  const canViewDashboard = hasPermission('dashboard.view');
  return <Navigate to={canViewDashboard ? "/admin" : "/login"} replace />;
};

function App() {
  useEffect(() => {
    cleanupExpiredCache();
  }, []);

  return (
    <>
      <ThemeProvider>
        <AlertProvider>
          <SettingsProvider>
            <BusinessHoursProvider>
              <ReloadPrompt />
              <Routes>
                {/* --- Client Routes --- */}
                <Route
                  path="/"
                  element={
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
                  }
                >
                  <Route index element={<Menu />} />
                  <Route path="mis-pedidos" element={<MyOrders />} />
                  {/* --- NUEVA RUTA PARA DETALLE PÚBLICO --- */}
                  <Route path="mis-pedidos/:orderCode" element={<OrderDetailPage />} />
                  {/* --- FIN NUEVA RUTA --- */}
                  <Route path="mi-perfil" element={<MyProfile />} />
                  <Route path="mi-actividad" element={<MyStuff />} />
                  <Route path="terminos" element={<TermsPage />} /> {/* Moved /terminos inside */}
                  {/* Catch-all inside ClientLayout, renders NotFound within the layout */}
                  <Route path="*" element={<NotFoundPage />} />
                </Route>

                {/* --- Admin Login --- */}
                <Route path="/login" element={<Login />} />

                {/* --- Admin Routes (Protected) --- */}
                <Route element={<ProtectedRoute />}> {/* General Auth Check */}
                  <Route
                    path="/admin"
                    element={
                       <Suspense fallback={<LoadingSpinner />}>
                         <AdminAuthProvider> {/* Specific Admin Context */}
                           <AdminLayout />
                         </AdminAuthProvider>
                       </Suspense>
                    }
                  >
                    {/* Index route requires dashboard view permission */}
                    <Route index element={<PermissionWrapper permissionKey="dashboard.view" element={<Dashboard />} isIndex={true} />} />
                    {/* Specific admin sections with permission checks */}
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
                    {/* Catch-all inside AdminLayout */}
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>

                {/* --- Global Catch-all (renders NotFoundPage without any layout) --- */}
                <Route path="*" element={<NotFoundPage />} />

              </Routes>
            </BusinessHoursProvider>
          </SettingsProvider>
        </AlertProvider>
      </ThemeProvider>
    </>
  );
}

export default App;
