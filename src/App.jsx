import React, { useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// Context Providers (Se cargan de inmediato, lo cual es correcto)
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
import { CacheAdminProvider } from "./context/CacheAdminContext.jsx";

// Layouts (Se cargan de inmediato, correcto)
import AdminLayout from "./layouts/AdminLayout.jsx";
import ClientLayout from "./layouts/ClientLayout.jsx";

// --- PÁGINAS (TODAS CON LAZY LOADING) ---

// --- Páginas de Cliente ---
const Menu = lazy(() => import("./pages/Menu.jsx"));
const MyOrders = lazy(() => import("./pages/MyOrders.jsx"));
const MyProfile = lazy(() => import("./pages/MyProfile.jsx"));
const MyStuff = lazy(() => import("./pages/MyStuff.jsx"));
const TermsPage = lazy(() => import("./pages/TermsPage.jsx"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage.jsx"));

// --- Páginas de Admin ---
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const Orders = lazy(() => import("./pages/Orders.jsx"));
const Products = lazy(() => import("./pages/Products.jsx"));
const Customers = lazy(() => import("./pages/Customers.jsx"));
const Discounts = lazy(() => import("./pages/Discounts.jsx"));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions.jsx"));
const RegisterAdmin = lazy(() => import("./pages/RegisterAdmin.jsx"));
const SpecialPrices = lazy(() => import("./pages/SpecialPrices.jsx"));
const BusinessHours = lazy(() => import("./pages/BusinessHours.jsx"));
const CreateOrder = lazy(() => import("./pages/CreateOrder.jsx"));
const Referrals = lazy(() => import("./pages/Referrals.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));

// --- Auth & Utility Pages ---
const Login = lazy(() => import("./pages/Login.jsx"));
const NotFoundPage = lazy(() => import("./components/NotFoundPage.jsx"));

// --- Componentes (NO son páginas, se cargan de inmediato) ---
import ProtectedRoute from "./components/ProtectedRoute.jsx";
import LoadingSpinner from "./components/LoadingSpinner.jsx";
import ReloadPrompt from "./components/ReloadPrompt.jsx";

// Utils
import { cleanupExpiredCache } from "./utils/cache.js";

// Wrapper for Admin Permissions (Sin cambios)
const PermissionWrapper = ({ permissionKey, element, isIndex = false }) => {
  const { hasPermission, loading } = useAdminAuth();

  if (loading) {
    // Usamos el spinner global centrado
    return (
      <div className="fullscreen-loader">
        <LoadingSpinner />
      </div>
    );
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

// Componente de Fallback de Suspense (para centrar el spinner)
const FullscreenLoader = () => (
  <div className="fullscreen-loader">
    <LoadingSpinner />
  </div>
);

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
              {/* Envolvemos TODAS las rutas en un Suspense de nivel superior.
                Esto manejará la carga de CUALQUIER página lazy.
              */}
              <Suspense fallback={<FullscreenLoader />}>
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
                                {/* El Suspense aquí ya no es necesario
                                    si tenemos uno global, pero lo dejamos
                                    por si ClientLayout hace algo especial */}
                                <Suspense fallback={<FullscreenLoader />}>
                                  <ClientLayout />
                                </Suspense>
                              </CartProvider>
                            </ProductExtrasProvider>
                          </ProductProvider>
                        </UserDataProvider>
                      </CustomerProvider>
                    }
                  >
                    <Route index element={<Menu />} />
                    <Route path="mis-pedidos" element={<MyOrders />} />
                    <Route path="mis-pedidos/:orderCode" element={<OrderDetailPage />} />
                    <Route path="mi-perfil" element={<MyProfile />} />
                    <Route path="mi-actividad" element={<MyStuff />} />
                    <Route path="terminos" element={<TermsPage />} />
                    {/* Este NotFoundPage es solo para rutas DENTRO del ClientLayout */}
                    <Route path="*" element={<NotFoundPage />} /> 
                  </Route>

                  {/* --- Admin Login --- */}
                  <Route path="/login" element={<Login />} />

                  {/* --- Admin Routes --- */}
                  <Route element={<ProtectedRoute />}>
                    <Route
                      path="/admin"
                      element={
                        /* El Suspense aquí también es correcto */
                        <Suspense fallback={<FullscreenLoader />}>
                          <AdminAuthProvider>
                            <CacheAdminProvider>
                              <AdminLayout />
                            </CacheAdminProvider>
                          </AdminAuthProvider>
                        </Suspense>
                      }
                    >
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

                  {/* --- Global Catch-all --- */}
                  <Route path="*" element={<NotFoundPage />} />

                </Routes>
              </Suspense>
            </BusinessHoursProvider>
          </SettingsProvider>
        </AlertProvider>
      </ThemeProvider>
    </>
  );
}

export default App;