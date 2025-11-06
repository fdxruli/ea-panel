import React, { useEffect, lazy, Suspense } from "react"; // lazy y Suspense ya estaban, ¡perfecto!
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

// --- PÁGINAS DE CLIENTE (AHORA CARGADAS CON LAZY) ---
const Menu = lazy(() => import("./pages/Menu.jsx"));
const MyOrders = lazy(() => import("./pages/MyOrders.jsx"));
const MyProfile = lazy(() => import("./pages/MyProfile.jsx"));
const MyStuff = lazy(() => import("./pages/MyStuff.jsx"));
const TermsPage = lazy(() => import("./pages/TermsPage.jsx"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage.jsx"));

// Admin Pages (Ya estaban lazy, se quedan igual)
import { CacheAdminProvider } from "./context/CacheAdminContext.jsx";
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
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import LoadingSpinner from "./components/LoadingSpinner.jsx"; // Usaremos este como fallback
import NotFoundPage from "./components/NotFoundPage.jsx";
import ReloadPrompt from "./components/ReloadPrompt.jsx";
// Styles & Utils
import { cleanupExpiredCache } from "./utils/cache.js";

// Wrapper for Admin Permissions (Sin cambios)
const PermissionWrapper = ({ permissionKey, element, isIndex = false }) => {
  const { hasPermission, loading } = useAdminAuth();

  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (hasPermission(permissionKey)) {
    return element;
  }
  
  if (isIndex) {
    return <Navigate to="/login" replace />;
  }
  
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
                {/* --- Client Routes (CORREGIDO) --- */}
                <Route
                  path="/"
                  element={
                    <CustomerProvider>
                      <UserDataProvider>
                        <ProductProvider>
                          <ProductExtrasProvider>
                            <CartProvider>
                              {/* --- ESTA ES LA CORRECCIÓN ---
                                  <Suspense> envuelve a ClientLayout
                                  DENTRO de la prop 'element'.
                              */}
                              <Suspense fallback={<LoadingSpinner />}>
                                <ClientLayout />
                              </Suspense>
                            </CartProvider>
                          </ProductExtrasProvider>
                        </ProductProvider>
                      </UserDataProvider>
                    </CustomerProvider>
                  }
                >
                  {/* Ahora estos <Route> SÍ son hijos directos válidos
                    del <Route path="/"> de arriba.
                  */}
                  <Route index element={<Menu />} />
                  <Route path="mis-pedidos" element={<MyOrders />} />
                  <Route path="mis-pedidos/:orderCode" element={<OrderDetailPage />} />
                  <Route path="mi-perfil" element={<MyProfile />} />
                  <Route path="mi-actividad" element={<MyStuff />} />
                  <Route path="terminos" element={<TermsPage />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Route>

                {/* --- Admin Login (Sin cambios) --- */}
                <Route path="/login" element={<Login />} />

                {/* --- Admin Routes (Sin cambios, ya estaban correctas) --- */}
                <Route element={<ProtectedRoute />}>
                  <Route
                    path="/admin"
                    element={
                      <Suspense fallback={<LoadingSpinner />}>
                        <AdminAuthProvider>
                          <CacheAdminProvider>
                            <AdminLayout />
                          </CacheAdminProvider>
                        </AdminAuthProvider>
                      </Suspense>
                    }
                  >
                    {/* (Rutas de admin sin cambios) */}
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
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                </Route>

                {/* --- Global Catch-all (Sin cambios) --- */}
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