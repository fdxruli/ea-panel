import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import LoadingSpinner from './LoadingSpinner'; // Ajusta a tu componente de carga

const AdminRoute = () => {
  const { status } = useAdminAuth();

  switch (status) {
    case 'RESOLVING':
      return <LoadingSpinner />;

    case 'UNAUTHENTICATED':
      return <Navigate to="/login" replace />;

    case 'CLIENT':
      // El usuario está logueado, pero no en la tabla admins. Expulsarlo del área de administración.
      return <Navigate to="/" replace />;

    case 'ERROR':
      // No ocultes los errores de red bajo la alfombra de un redirect.
      return <div className="error-screen">Error validando permisos. Revisa tu conexión.</div>;

    case 'ADMIN':
      // Renderiza las rutas anidadas
      return <Outlet />;

    default:
      return null;
  }
};

export default AdminRoute;