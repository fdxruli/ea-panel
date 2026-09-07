import React, { useEffect, lazy, Suspense } from "react";
import { useLocation, Routes, Route } from "react-router-dom";
import { captureReferralCodeFromUrl } from "./hooks/useReferralCode.js";
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
import CustomerAuthGuard from "./components/CustomerAuthGuard.jsx";

const Menu = lazy(() => import("./pages/Menu.jsx"));
const MyOrders = lazy(() => import("./pages/MyOrders.jsx"));
const MyProfile = lazy(() => import("./pages/MyProfile.jsx"));
const MyStuff = lazy(() => import("./pages/MyStuff.jsx"));
const TermsPage = lazy(() => import("./pages/TermsPage.jsx"));
const OrderDetailPage = lazy(() => import("./pages/OrderDetailPage.jsx"));
const AdminRoutes = lazy(() => import("./routes/AdminRoutes.jsx"));
const ClientExtrasProvider = lazy(() => import("./context/ProductExtrasContext.jsx").then(({ ProductExtrasProvider }) => ({ default: ProductExtrasProvider })));
const Login = lazy(() => import("./pages/Login.jsx"));
const NotFoundPage = lazy(() => import("./components/NotFoundPage.jsx"));
import LoadingSpinner from "./components/LoadingSpinner.jsx";
import AlertModal from "./components/AlertModal.jsx";
import ReloadPrompt from "./components/ReloadPrompt.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import { cleanupExpiredCache } from "./utils/cache.js";

const FullscreenLoader = () => <div className="fullscreen-loader"><LoadingSpinner /></div>;
const ClientMenuFallback = () => { const { customer } = useUserData(); return <MenuRouteSkeleton showLeadCapture={!customer} />; };

function App() {
  const location = useLocation();
  useEffect(() => { cleanupExpiredCache(); }, []);
  useEffect(() => { captureReferralCodeFromUrl(); }, [location.search]);

  return <>
    <ThemeProvider>
      <AlertProvider>
        <AlertModal />
        <SettingsProvider>
          <BusinessHoursProvider>
            <ReloadPrompt />
            <ErrorBoundary scope="application">
              <Suspense fallback={<FullscreenLoader />}>
                <Routes>
                  <Route path="/" element={<CustomerProvider><UserDataProvider><ProductProvider><CartProvider><ClientLayout /></CartProvider></ProductProvider></UserDataProvider></CustomerProvider>}>
                    <Route index element={<Suspense fallback={<ClientMenuFallback />}><Menu /></Suspense>} />
                    <Route path="producto/:productSlug" element={<Suspense fallback={<ClientMenuFallback />}><ClientExtrasProvider><Menu /></ClientExtrasProvider></Suspense>} />
                    <Route path="mis-pedidos" element={<CustomerAuthGuard><MyOrders /></CustomerAuthGuard>} />
                    <Route path="mis-pedidos/:orderCode" element={<CustomerAuthGuard><OrderDetailPage /></CustomerAuthGuard>} />
                    <Route path="mi-perfil" element={<CustomerAuthGuard><MyProfile /></CustomerAuthGuard>} />
                    <Route path="mi-actividad" element={<CustomerAuthGuard><Suspense fallback={<FullscreenLoader />}><ClientExtrasProvider><MyStuff /></ClientExtrasProvider></Suspense></CustomerAuthGuard>} />
                    <Route path="terminos" element={<TermsPage />} />
                    <Route path="*" element={<NotFoundPage />} />
                  </Route>
                  <Route path="/login" element={<Login />} />
                  <Route path="/admin/*" element={<AdminRoutes />} />
                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </BusinessHoursProvider>
        </SettingsProvider>
      </AlertProvider>
    </ThemeProvider>
  </>;
}
export default App;
