import React, { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminAuthProvider, useAdminAuth } from '../context/AdminAuthContext.jsx';
import { AdminDraftProvider } from '../context/AdminDraftContext.jsx';
import { CacheAdminProvider } from '../context/CacheAdminContext.jsx';
import AdminLayout from '../layouts/AdminLayout.jsx';
import AdminRoute from '../components/AdminRoute.jsx';
import ErrorBoundary from '../components/ErrorBoundary.jsx';
import LoadingSpinner from '../components/LoadingSpinner.jsx';

const Dashboard = lazy(() => import('../pages/Dashboard.jsx'));
const Orders = lazy(() => import('../pages/Orders.jsx'));
const Products = lazy(() => import('../pages/Products.jsx'));
const Customers = lazy(() => import('../pages/Customers.jsx'));
const Discounts = lazy(() => import('../pages/Discounts.jsx'));
const TermsAndConditions = lazy(() => import('../pages/TermsAndConditions.jsx'));
const RegisterAdmin = lazy(() => import('../pages/RegisterAdmin.jsx'));
const SpecialPrices = lazy(() => import('../pages/SpecialPrices.jsx'));
const BusinessHours = lazy(() => import('../pages/BusinessHours.jsx'));
const CajaPage = lazy(() => import('../pages/CajaPage.jsx'));
const CreateOrder = lazy(() => import('../pages/CreateOrder.jsx'));
const Referrals = lazy(() => import('../pages/Referrals.jsx'));
const Settings = lazy(() => import('../pages/Settings.jsx'));
const Ingredients = lazy(() => import('../pages/Ingredients.jsx'));

const FullscreenLoader = () => (
  <div className="fullscreen-loader">
    <LoadingSpinner />
  </div>
);

const PermissionWrapper = ({ permissionKey, element, isIndex = false }) => {
  const { hasPermission, loading } = useAdminAuth();

  if (loading) return <FullscreenLoader />;
  if (hasPermission(permissionKey)) return element;
  if (isIndex) return <Navigate to="/login" replace />;

  return (
    <Navigate
      to={hasPermission('dashboard.view') ? '/admin' : '/login'}
      replace
    />
  );
};

export default function AdminRoutes() {
  return (
    <ErrorBoundary scope="admin">
      <Suspense fallback={<FullscreenLoader />}>
        <AdminAuthProvider>
          <AdminDraftProvider>
            <Routes>
              <Route element={<AdminRoute />}>
                <Route
                  element={(
                    <CacheAdminProvider>
                      <AdminLayout />
                    </CacheAdminProvider>
                  )}
                >
                  <Route index element={<PermissionWrapper permissionKey="dashboard.view" element={<Dashboard />} isIndex />} />
                  <Route path="caja" element={<PermissionWrapper permissionKey="caja.access" element={<CajaPage />} />} />
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
                  <Route path="ingredientes" element={<PermissionWrapper permissionKey="productos.view" element={<Ingredients />} />} />
                </Route>
              </Route>
            </Routes>
          </AdminDraftProvider>
        </AdminAuthProvider>
      </Suspense>
    </ErrorBoundary>
  );
}
