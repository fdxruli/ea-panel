import React, { useEffect, lazy, Suspense } from "react";
import { Routes, Route } from "react-router-dom";

// Providers principales del cliente: necesarios para el shell y el catálogo.
import { CartProvider } from "./context/CartContext.jsx";
import { CustomerProvider } from "./context/CustomerContext.jsx";
import { ProductProvider } from "./context/ProductContext.jsx";
import { UserDataProvider, useUserData } from "./context/UserDataContext.jsx";
import { AlertProvider } from "./context/AlertContext.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { BusinessHoursProvider } from "./context/BusinessHoursContext.jsx";
import { SettingsProvider } from "./context/SettingsContext.jsx";

import ClientLayout from "./layouts/ClientLayout.jsx";
import MenuRouteSkeleton from "./components/MenuRouteSkeleton.jsx";

// --- Páginas de Cliente ---
const Menu = lazy(() => import("./pages/Menu.jsx"));
const MyOrders = lazy(() => import("./pages/MyOrders.jsx"));
const MyProfile = lazy(() => import("./pages/MyProfile.jsx"));
const MyStuff = lazy(() => import("./pages/MyStuff.jsx"));
const TermsPage = lazy(() => import("./pages/TermsPage.jsx"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage.jsx"));

// El árbol de administración y los extras se descargan solo en sus rutas.
const AdminRoutes = lazy(() => import("./routes/AdminRoutes.jsx"));
const ClientExtrasProvider = lazy(() => import("./context/ProductExtrasContext.jsx").then(({ ProductExtrasProvider }) => ({ default: ProductExtrasProvider })));

// --- Auth & Utility Pages ---
const Login = lazy(() => import("./pages/Login.jsx"));
const NotFoundPage = lazy(() => import("./components/NotFoundPage.jsx"));

// --- Componentes del shell ---
import LoadingSpinner from "./components/LoadingSpinner.jsx";
import AlertModal from "./components/AlertModal.jsx";
import ReloadPrompt from "./components/ReloadPrompt.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";

import { cleanupExpiredCache } from "./utils/cache.js";

const FullscreenLoader = () => (
  <div className="fullscreen-loader">
    <LoadingSpinner />
  </div>
);

const ClientMenuFallback = () => {
  const { customer } = useUserData();
  return <MenuRouteSkeleton showLeadCapture={!customer} />;
};

function App() {
  useEffect(() => {
    cleanupExpiredCache();
  }, []);

  return (
    <>
      <ThemeProvider>
        <AlertProvider>
          <AlertModal />
          <SettingsProvider>
            <BusinessHoursProvider>
              <ReloadPrompt />
              <ErrorBoundary scope="application">
                <Suspense fallback={<FullscreenLoader />}>
                  <Routes>
                    {/* --- Client Routes --- */}
                    <Route
                      path="/"
                      element={
                        <CustomerProvider>
                          <UserDataProvider>
                            <ProductProvider>
                              <CartProvider>
                                <ClientLayout />
                              </CartProvider>
                            </ProductProvider>
                          </UserDataProvider>
                        </CustomerProvider>
                      }
                    >
                      <Route
                        index
                        element={(
                          <Suspense fallback={<ClientMenuFallback />}>
                            <Menu />
                          </Suspense>
                        )}
                      />
                      <Route
                        path="producto/:productSlug"
                        element={(
                          <Suspense fallback={<ClientMenuFallback />}>
                            <ClientExtrasProvider>
                              <Menu />
                            </ClientExtrasProvider>
                          </Suspense>
                        )}
                      />
                      <Route path="mis-pedidos" element={<MyOrders />} />
                      <Route path="mis-pedidos/:orderCode" element={<OrderDetailPage />} />
                      <Route path="mi-perfil" element={<MyProfile />} />
                      <Route
                        path="mi-actividad"
                        element={(
                          <Suspense fallback={<FullscreenLoader />}>
                            <ClientExtrasProvider>
                              <MyStuff />
                            </ClientExtrasProvider>
                          </Suspense>
                        )}
                      />
                      <Route path="terminos" element={<TermsPage />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>

                    <Route path="/login" element={<Login />} />

                    {/* --- Admin Routes --- */}
                    <Route path="/admin/*" element={<AdminRoutes />} />

                    <Route path="*" element={<NotFoundPage />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </BusinessHoursProvider>
          </SettingsProvider>
        </AlertProvider>
      </ThemeProvider>
    </>
  );
}

export default App;
