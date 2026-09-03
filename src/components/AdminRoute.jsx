import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAdminAuth } from '../context/AdminAuthContext';
import LoadingSpinner from './LoadingSpinner'; // Ajusta a tu componente de carga

const AdminRoute = () => {
  const { status } = useAdminAuth();

  switch (status) {
    case 'RESOLVING':
      // Solo se activa en el arranque en frío o cuando cambia la identidad del usuario.
      // Los refrescos de token (TOKEN_REFRESHED) usan revalidación silenciosa
      // y nunca llegan a este case; la UI del admin permanece montada sin parpadeo.
      return <LoadingSpinner />;

    case 'UNAUTHENTICATED':
      return <Navigate to="/login" replace />;

    case 'CLIENT':
      // El usuario está logueado, pero no en la tabla admins. Expulsarlo del área de administración.
      return <Navigate to="/" replace />;

    case 'ERROR':
      return (
        <div className="error-screen" style={{ padding: '3rem 1.5rem', textAlign: 'center', maxWidth: '480px', margin: 'auto' }}>
          <h2>⚠️ Problema de acceso</h2>
          <p style={{ color: '#666', marginTop: '0.5rem' }}>Error validando permisos o la sesión ha expirado.</p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem' }}>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: '0.6rem 1.2rem', cursor: 'pointer', borderRadius: '6px', border: '1px solid #ccc', background: '#fff' }}
            >
              Reintentar
            </button>
            <button
              onClick={async () => {
                try {
                  const { supabase } = await import('../lib/supabaseClient');
                  await supabase.auth.signOut();
                } catch (error) {
                  console.warn('[AdminRoute] No se pudo cerrar la sesión remota.', error);
                }
                localStorage.clear();
                window.location.href = '/login';
              }}
              style={{ padding: '0.6rem 1.2rem', cursor: 'pointer', borderRadius: '6px', border: 'none', background: '#e11d48', color: '#fff' }}
            >
              Cerrar sesión e Iniciar de nuevo
            </button>
          </div>
        </div>
      );

    case 'ADMIN':
      // Renderiza las rutas anidadas
      return <Outlet />;

    default:
      return null;
  }
};

export default AdminRoute;
